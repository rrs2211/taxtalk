import { getPresignedUrl } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

const RATE_LIMIT = new Map();
function checkRate(ip) {
  const now = Date.now(); const window = 3600000; const max = 10;
  const e = RATE_LIMIT.get(ip);
  if (!e || now - e.t > window) { RATE_LIMIT.set(ip, { n:1, t:now }); return true; }
  if (e.n >= max) return false;
  e.n++; return true;
}

const SYSTEM = `You are a specialized Indian income tax document extraction engine for AY 2026-27.
Extract data from uploaded documents and return ONLY valid JSON — no preamble, no markdown fences.
Be precise. If a field is not found or unclear, set it to null. Never invent values.
Use rupees as integers (no commas).`;

const PROMPTS = {
  form16: `Extract all fields from this Form 16 (Part A and Part B) and return JSON:
{"employer_name":string|null,"employer_pan":string|null,"employee_pan":string|null,"employee_name":string|null,"assessment_year":string|null,"gross_salary":number|null,"standard_deduction":number|null,"net_salary":number|null,"deduction_80c":number|null,"deduction_80ccc":number|null,"deduction_80ccd1":number|null,"deduction_80ccd1b":number|null,"deduction_80ccd2":number|null,"deduction_80d":number|null,"deduction_80e":number|null,"deduction_80g":number|null,"total_chapter_via":number|null,"taxable_income":number|null,"tax_payable":number|null,"rebate_87a":number|null,"health_education_cess":number|null,"total_tds_deducted":number|null,"confidence":number}`,
  ais: `Extract all entries from this AIS or Form 26AS and return JSON:
{"pan":string|null,"assessment_year":string|null,"salary_income":[{"deductor":string,"tds":number,"amount":number}],"interest_income":[{"source":string,"amount":number,"tds":number}],"dividend_income":[{"company":string,"amount":number,"tds":number}],"capital_gains":[{"asset_type":string,"sale_value":number,"purchase_value":number,"gain":number,"type":"STCG"|"LTCG"}],"high_value_transactions":[{"type":string,"amount":number,"date":string|null}],"tds_summary":[{"deductor":string,"tan":string|null,"amount_paid":number,"tds":number}],"advance_tax_paid":[{"challan":string|null,"amount":number,"date":string|null}],"confidence":number}`,
  balance_sheet: `Extract all figures from this Balance Sheet (31 March 2026) and return JSON:
{"entity_name":string|null,"pan":string|null,"capital_account":number|null,"partners_capital":[{"name":string,"amount":number}],"secured_loans":number|null,"unsecured_loans":number|null,"current_liabilities":number|null,"total_liabilities":number|null,"fixed_assets_gross":number|null,"accumulated_depreciation":number|null,"fixed_assets_net":number|null,"investments":number|null,"closing_stock":number|null,"sundry_debtors":number|null,"cash_and_bank":number|null,"loans_and_advances":number|null,"total_assets":number|null,"confidence":number}`,
  pl_statement: `Extract all figures from this Profit & Loss Account (FY 2025-26) and return JSON:
{"entity_name":string|null,"gross_turnover":number|null,"gross_receipts":number|null,"opening_stock":number|null,"purchases":number|null,"direct_expenses":number|null,"closing_stock":number|null,"gross_profit":number|null,"salaries_wages":number|null,"rent":number|null,"electricity":number|null,"depreciation_books":number|null,"interest_on_loans":number|null,"bad_debts":number|null,"other_expenses":number|null,"total_expenses":number|null,"net_profit_before_tax":number|null,"confidence":number}`,
};

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRate(ip)) return res.status(429).json({ message: 'Too many requests. Try again later.' });

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
  if (!prompt) return res.status(400).json({ message: `No extraction support for: ${doc.doc_type}` });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' });

  try {
    await supabase.from('documents').update({ extraction_status: 'processing' }).eq('id', documentId);

    // Fetch file from R2 server-side
    const signedUrl = await getPresignedUrl(doc.storage_path, 120);
    const fileRes   = await fetch(signedUrl);
    if (!fileRes.ok) throw new Error(`Could not fetch document from storage: ${fileRes.status}`);

    const buffer  = await fileRes.arrayBuffer();
    const base64  = Buffer.from(buffer).toString('base64');
    const mime    = doc.original_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: [{ type:'text', text:SYSTEM, cache_control:{ type:'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            { type:'document', source:{ type:'base64', media_type:mime, data:base64 } },
            { type:'text', text:prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}));
      console.error('Anthropic error:', aiRes.status, err);
      await supabase.from('documents').update({ extraction_status:'failed' }).eq('id', documentId);
      return res.status(502).json({ message: 'AI extraction failed. Please try again or enter details manually.' });
    }

    const aiData    = await aiRes.json();
    const textBlock = aiData.content?.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty response from AI');

    const clean     = textBlock.text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    await supabase.from('documents').update({
      extracted_json: extracted,
      extraction_status: 'success',
      confidence: extracted.confidence ?? null,
    }).eq('id', documentId);

    await supabase.from('audit_log').insert({
      return_id: doc.return_id, user_id: user.id,
      action: `${doc.doc_type}_extracted`,
      detail: { documentId, confidence: extracted.confidence, tokens: aiData.usage },
    }).then(() => {}).catch(() => {});

    console.log('Extracted:', doc.doc_type, 'confidence:', extracted.confidence);
    return res.status(200).json({ extracted, documentId });

  } catch (err) {
    console.error('extract error:', err.message);
    try { await supabase.from('documents').update({ extraction_status:'failed' }).eq('id', documentId); } catch {}
    return res.status(500).json({ message: err.message || 'Extraction failed. Please try again.' });
  }
}
