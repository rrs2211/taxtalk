import { getPresignedUrl } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin, checkRateLimit } from './lib/helpers.js';


const SYSTEM = `You are a specialized Indian income tax document extraction engine for AY 2026-27.
Extract data from uploaded documents and return ONLY valid JSON — no preamble, no markdown fences.
Be precise with all monetary values (integers, no commas, no decimals).
If a field is not present or unclear, use null. Never invent or interpolate values.`;

const PROMPTS = {

  // ── AIS (Annual Information Statement from e-filing portal) ──────────────────
  ais: `Extract ALL data from this AIS (Annual Information Statement) or Form 26AS for AY 2026-27.
This document may be either:
- An AIS from the e-filing portal (incometax.gov.in → AIS tab)
- A Form 26AS / Annual Tax Statement from TRACES (centralized TDS system)
Both are valid. Extract everything visible.
Return this exact JSON structure (all arrays may be empty, never null):
{
  "pan": string|null,
  "name": string|null,
  "dob": string|null,
  "address": string|null,
  "mobile": string|null,
  "email": string|null,
  "assessment_year": string|null,

  "salary_income": [
    {"deductor_name": string, "deductor_tan": string|null, "amount": number, "tds": number}
  ],

  "interest_income": [
    {"source_name": string, "source_type": "savings_bank"|"fd"|"other", "amount": number, "tds": number}
  ],

  "dividend_income": [
    {"company_name": string, "amount": number, "tds": number}
  ],

  "capital_gains": [
    {"description": string, "asset_type": "equity_shares"|"equity_mf"|"property"|"other",
     "sale_value": number, "purchase_value": number, "gain": number,
     "holding_period": "short"|"long", "section": "111A"|"112A"|"112"|"other"}
  ],

  "rent_income": [
    {"tenant_name": string, "amount": number, "tds": number}
  ],

  "business_receipts": [
    {"deductor_name": string, "section": string, "amount": number, "tds": number}
  ],

  "advance_tax": [
    {"challan_no": string|null, "bsr_code": string|null, "date": string|null, "amount": number}
  ],

  "self_assessment_tax": [
    {"challan_no": string|null, "bsr_code": string|null, "date": string|null, "amount": number}
  ],

  "tds_summary": [
    {"deductor_name": string, "tan": string|null, "section": string|null,
     "gross_amount": number, "tds_deducted": number, "head": "salary"|"business"|"interest"|"rent"|"other"}
  ],

  "high_value_transactions": [
    {"type": string, "amount": number, "party": string|null, "date": string|null}
  ],

  "total_tds": number|null,
  "total_advance_tax": number|null,
  "confidence": number
}

IMPORTANT MAPPING for Form 26AS (TRACES format):
- PART-I "Details of Tax Deducted at Source" → map Section 192 entries to salary_income, Section 194A to interest_income, Section 194H to business_receipts etc.
- For each PART-I entry: "Total Amount Paid/Credited" → amount field, "Total Tax Deducted" → tds field
- "Name of Deductor" → deductor_name, "TAN of Deductor" → deductor_tan
- PART-VI "Details of Tax Collected at Source" → high_value_transactions
- PART-VII "Details of Paid Refund" → ignore (not needed)
- Section 192 = Salary, Section 194A = Interest (FD/savings), Section 194H = Commission/brokerage
- If TDS is 0.00, still include the income entry with tds: 0
- Extract name, PAN, address from the header of the document`,

  // ── Form 16 — detailed salary certificate ────────────────────────────────────
  form16: `Extract all data from this Form 16 (Part A and Part B) issued by employer.
Return this exact JSON:
{
  "employer_name": string|null,
  "employer_pan": string|null,
  "employer_tan": string|null,
  "employee_pan": string|null,
  "employee_name": string|null,
  "assessment_year": string|null,
  "period_from": string|null,
  "period_to": string|null,
  "gross_salary": number|null,
  "allowances_exempt_10": number|null,
  "hra_exempt": number|null,
  "standard_deduction": number|null,
  "professional_tax": number|null,
  "net_salary_taxable": number|null,
  "deduction_80c": number|null,
  "deduction_80ccc": number|null,
  "deduction_80ccd1": number|null,
  "deduction_80ccd1b": number|null,
  "deduction_80ccd2": number|null,
  "deduction_80d": number|null,
  "deduction_80e": number|null,
  "deduction_80g": number|null,
  "deduction_80tta": number|null,
  "total_chapter_via": number|null,
  "taxable_income": number|null,
  "tax_on_income": number|null,
  "rebate_87a": number|null,
  "surcharge": number|null,
  "health_education_cess": number|null,
  "total_tax_payable": number|null,
  "total_tds_deducted": number|null,
  "confidence": number
}`,

  // ── Balance Sheet ─────────────────────────────────────────────────────────────
  balance_sheet: `Extract all figures from this Balance Sheet as at 31 March 2026.
Return this exact JSON:
{
  "entity_name": string|null,
  "pan": string|null,
  "as_at_date": string|null,
  "capital_account": number|null,
  "reserves_surplus": number|null,
  "partners_capital": [{"name": string, "amount": number}],
  "secured_loans": number|null,
  "unsecured_loans": number|null,
  "trade_payables": number|null,
  "other_current_liabilities": number|null,
  "total_liabilities": number|null,
  "fixed_assets_gross": number|null,
  "accumulated_depreciation": number|null,
  "fixed_assets_net": number|null,
  "capital_wip": number|null,
  "investments": number|null,
  "closing_stock": number|null,
  "trade_receivables": number|null,
  "cash_and_bank": number|null,
  "loans_and_advances": number|null,
  "other_current_assets": number|null,
  "total_assets": number|null,
  "confidence": number
}`,

  // ── P&L Statement ─────────────────────────────────────────────────────────────
  pl_statement: `Extract all figures from this Profit & Loss Account / Income & Expenditure statement for FY 2025-26.
Pay special attention to expenses that may be disallowed under the Income Tax Act.
Return this exact JSON:
{
  "entity_name": string|null,
  "pan": string|null,
  "period": string|null,
  "gross_turnover": number|null,
  "gross_receipts": number|null,
  "other_income": number|null,
  "opening_stock": number|null,
  "purchases": number|null,
  "direct_expenses": number|null,
  "closing_stock": number|null,
  "gross_profit": number|null,
  "salaries_wages": number|null,
  "rent": number|null,
  "electricity_power": number|null,
  "repairs_maintenance": number|null,
  "depreciation_books": number|null,
  "interest_on_loans": number|null,
  "bad_debts_written_off": number|null,
  "donations_charity": number|null,
  "cash_expenses_above_10k": number|null,
  "personal_expenses_in_books": number|null,
  "other_expenses": number|null,
  "total_expenses": number|null,
  "net_profit_before_tax": number|null,
  "possible_disallowances": [
    {"section": string, "description": string, "estimated_amount": number}
  ],
  "confidence": number
}`
};

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in' });

  if (!(await checkRateLimit(user.id, 'extract', 30))) return res.status(429).json({ message: 'Too many extraction requests this hour. Please try again later.' });

  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ message: 'Missing documentId' });

  const supabase = getSupabaseAdmin();
  const { data: doc, error: docErr } = await supabase
    .from('documents').select('*, returns(user_id)').eq('id', documentId).single();
  if (docErr || !doc) return res.status(404).json({ message: 'Document not found' });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isOwner = doc.returns?.user_id === user.id;
  const isCA    = ['ca_staff','ca_admin'].includes(profile?.role);
  if (!isOwner && !isCA) return res.status(403).json({ message: 'Access denied' });

  const prompt = PROMPTS[doc.doc_type];
  if (!prompt) return res.status(400).json({ message: `No extraction prompt for doc type: ${doc.doc_type}` });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured' });

  try {
    await supabase.from('documents').update({ extraction_status: 'processing' }).eq('id', documentId);

    const signedUrl = await getPresignedUrl(doc.storage_path, 120);
    const fileRes   = await fetch(signedUrl);
    if (!fileRes.ok) throw new Error(`Storage fetch failed: ${fileRes.status}`);

    const buffer  = await fileRes.arrayBuffer();
    const base64  = Buffer.from(buffer).toString('base64');
    const ext     = (doc.original_name || '').toLowerCase();
    const mime    = ext.endsWith('.pdf') ? 'application/pdf'
                  : ext.endsWith('.png') ? 'image/png'
                  : 'image/jpeg';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':  'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system: [{ type:'text', text:SYSTEM, cache_control:{ type:'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            { type: mime === 'application/pdf' ? 'document' : 'image',
              source: { type:'base64', media_type:mime, data:base64 } },
            { type:'text', text: prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}));
      console.error('Claude API error:', aiRes.status, err);
      await supabase.from('documents').update({ extraction_status:'failed' }).eq('id', documentId);
      return res.status(502).json({ message: 'AI extraction failed. Try again or enter details manually.' });
    }

    const aiData    = await aiRes.json();
    const textBlock = aiData.content?.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty response from AI');

    const clean     = textBlock.text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    await supabase.from('documents').update({
      extracted_json:    extracted,
      extraction_status: 'success',
      confidence:        extracted.confidence ?? null,
    }).eq('id', documentId);

    await supabase.from('audit_log').insert({
      return_id: doc.return_id, user_id: user.id,
      action: `${doc.doc_type}_extracted`,
      detail: { documentId, confidence: extracted.confidence, tokens: aiData.usage },
    }).then(() => {}).catch(() => {});

    return res.status(200).json({ extracted, documentId, docType: doc.doc_type });

  } catch (err) {
    console.error('extract error:', err.message);
    try { await supabase.from('documents').update({ extraction_status:'failed' }).eq('id', documentId); } catch {}
    return res.status(500).json({ message: err.message || 'Extraction failed. Please try again.' });
  }
}
