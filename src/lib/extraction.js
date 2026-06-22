// ─── AI Extraction Service ────────────────────────────────────────────────────
// Uses Claude claude-sonnet-4-6 with PDF vision for document extraction.
// Prompt caching on the system prompt cuts repeated input cost by ~90%.
// All calls go through /api/extract (Vercel serverless function) so the
// Anthropic API key is never exposed to the browser.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a specialized Indian income tax document extraction engine for AY 2026-27.
Extract data from uploaded documents and return ONLY valid JSON — no preamble, no markdown fences.
Be precise. If a field is not found or unclear, set it to null. Never invent values.
Use Indian number format internally (integers in rupees, no commas).`;

// ─── Form 16 Extraction ──────────────────────────────────────────────────────

const FORM16_PROMPT = `Extract all fields from this Form 16 (Part A and Part B) and return JSON matching exactly this schema:

{
  "employer_name": string | null,
  "employer_pan": string | null,
  "employer_tan": string | null,
  "employee_pan": string | null,
  "employee_name": string | null,
  "assessment_year": string | null,
  "period_from": string | null,
  "period_to": string | null,
  "gross_salary": number | null,
  "allowances_exempt_10": number | null,
  "deductions_16": number | null,
  "standard_deduction": number | null,
  "entertainment_allowance": number | null,
  "tax_on_employment": number | null,
  "net_salary": number | null,
  "income_from_house_property": number | null,
  "other_income": number | null,
  "gross_total_income": number | null,
  "deduction_80c": number | null,
  "deduction_80ccc": number | null,
  "deduction_80ccd1": number | null,
  "deduction_80ccd1b": number | null,
  "deduction_80ccd2": number | null,
  "deduction_80d": number | null,
  "deduction_80dd": number | null,
  "deduction_80ddb": number | null,
  "deduction_80e": number | null,
  "deduction_80ee": number | null,
  "deduction_80g": number | null,
  "deduction_80gg": number | null,
  "deduction_80u": number | null,
  "total_chapter_via": number | null,
  "taxable_income": number | null,
  "tax_on_total_income": number | null,
  "rebate_87a": number | null,
  "surcharge": number | null,
  "health_education_cess": number | null,
  "tax_payable": number | null,
  "tds_deducted_q1": number | null,
  "tds_deducted_q2": number | null,
  "tds_deducted_q3": number | null,
  "tds_deducted_q4": number | null,
  "total_tds_deducted": number | null,
  "confidence": number
}

"confidence" is your overall extraction confidence from 0.0 to 1.0.
If Part B is missing, extract what you can from Part A and set Part B fields to null.`;

// ─── AIS / 26AS Extraction ───────────────────────────────────────────────────

const AIS_PROMPT = `Extract all entries from this Annual Information Statement (AIS) or Form 26AS.
Return JSON matching this schema:

{
  "pan": string | null,
  "assessment_year": string | null,
  "salary_income": [{ "deductor": string, "tds": number, "amount": number }],
  "interest_income": [{ "source": string, "amount": number, "tds": number }],
  "dividend_income": [{ "company": string, "amount": number, "tds": number }],
  "capital_gains": [{ "asset_type": string, "sale_value": number, "purchase_value": number, "gain": number, "type": "STCG" | "LTCG" }],
  "rental_income": [{ "property": string, "amount": number, "tds": number }],
  "high_value_transactions": [{ "type": string, "amount": number, "counter_party": string | null, "date": string | null }],
  "tds_summary": [{ "deductor": string, "tan": string | null, "amount_paid": number, "tds": number, "quarter": string | null }],
  "advance_tax_paid": [{ "challan": string | null, "amount": number, "date": string | null }],
  "self_assessment_tax": [{ "challan": string | null, "amount": number, "date": string | null }],
  "confidence": number
}`;

// ─── Balance Sheet Extraction ─────────────────────────────────────────────────

const BALANCE_SHEET_PROMPT = `Extract all figures from this Balance Sheet (as at 31st March 2026) for Indian income tax purposes.
Return JSON:

{
  "entity_name": string | null,
  "pan": string | null,
  "period_ending": string | null,
  "capital_account": number | null,
  "partners_capital": [{ "name": string, "amount": number }],
  "secured_loans": number | null,
  "unsecured_loans": number | null,
  "current_liabilities": number | null,
  "total_liabilities": number | null,
  "fixed_assets_gross": number | null,
  "accumulated_depreciation": number | null,
  "fixed_assets_net": number | null,
  "investments": number | null,
  "closing_stock": number | null,
  "sundry_debtors": number | null,
  "cash_and_bank": number | null,
  "loans_and_advances": number | null,
  "total_assets": number | null,
  "confidence": number
}`;

// ─── P&L Extraction ──────────────────────────────────────────────────────────

const PL_PROMPT = `Extract all figures from this Profit & Loss Account / Income Statement for Indian income tax purposes (FY 2025-26).
Return JSON:

{
  "entity_name": string | null,
  "period": string | null,
  "gross_turnover": number | null,
  "gross_receipts": number | null,
  "opening_stock": number | null,
  "purchases": number | null,
  "direct_expenses": number | null,
  "closing_stock": number | null,
  "gross_profit": number | null,
  "salaries_wages": number | null,
  "rent": number | null,
  "electricity": number | null,
  "repairs_maintenance": number | null,
  "depreciation_books": number | null,
  "interest_on_loans": number | null,
  "bad_debts": number | null,
  "other_expenses": number | null,
  "total_expenses": number | null,
  "net_profit_before_tax": number | null,
  "net_profit_after_tax": number | null,
  "notes": string | null,
  "confidence": number
}`;

// ─── Core extraction function ─────────────────────────────────────────────────

async function extractDocument(fileBase64, mimeType, docTypePrompt) {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      prompt: docTypePrompt,
      fileBase64,
      mimeType,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Extraction failed: ${response.status}`);
  }

  const { content } = await response.json();

  // Parse JSON — strip any accidental markdown fences
  const clean = content.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─── File to base64 ──────────────────────────────────────────────────────────

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function extractForm16(file) {
  const base64 = await fileToBase64(file);
  return extractDocument(base64, 'application/pdf', FORM16_PROMPT);
}

export async function extractAIS(file) {
  const base64 = await fileToBase64(file);
  return extractDocument(base64, 'application/pdf', AIS_PROMPT);
}

export async function extractBalanceSheet(file) {
  const base64 = await fileToBase64(file);
  return extractDocument(base64, 'application/pdf', BALANCE_SHEET_PROMPT);
}

export async function extractPL(file) {
  const base64 = await fileToBase64(file);
  return extractDocument(base64, 'application/pdf', PL_PROMPT);
}

// ─── Map Form 16 extraction → tax engine inputs ───────────────────────────────

export function mapForm16ToTaxInput(extracted) {
  return {
    grossSalary: extracted.gross_salary ?? 0,
    standardDeduction: extracted.standard_deduction ?? 75000,
    deductions80C: (
      (extracted.deduction_80c ?? 0) +
      (extracted.deduction_80ccc ?? 0) +
      (extracted.deduction_80ccd1 ?? 0)
    ),
    deductions80CCD1B: extracted.deduction_80ccd1b ?? 0,
    deductions80CCD2: extracted.deduction_80ccd2 ?? 0,
    deductions80D: extracted.deduction_80d ?? 0,
    deductions80E: extracted.deduction_80e ?? 0,
    deductions80G: extracted.deduction_80g ?? 0,
    tdsDeducted: extracted.total_tds_deducted ?? 0,
    employerName: extracted.employer_name,
    employerPAN: extracted.employer_pan,
    employeePAN: extracted.employee_pan,
    confidence: extracted.confidence ?? 0,
    // Fields needing CA review if confidence < 0.85
    needsReview: (extracted.confidence ?? 0) < 0.85,
  };
}

export function mapAISToFlags(aisData, form16Data) {
  const flags = [];

  // Check interest income not mentioned by client
  const totalInterest = (aisData.interest_income || []).reduce((s, i) => s + (i.amount || 0), 0);
  if (totalInterest > 0 && !form16Data?.other_income) {
    flags.push({
      severity: 'warn',
      title: 'Interest income in AIS not in Form 16',
      body: `AIS shows ₹${totalInterest.toLocaleString('en-IN')} interest income not reflected in Form 16. May need Schedule OS entry.`,
      field: 'schedule_os.interest',
    });
  }

  // Check high-value transactions
  const highValue = (aisData.high_value_transactions || []).filter(t => t.amount > 500000);
  highValue.forEach(t => {
    flags.push({
      severity: 'critical',
      title: `High-value transaction: ${t.type}`,
      body: `AIS shows ${t.type} of ₹${t.amount.toLocaleString('en-IN')}${t.date ? ` on ${t.date}` : ''}. Verify if capital gains or other disclosure is required.`,
      field: 'schedule_cg',
    });
  });

  // Check TDS mismatch
  const aisTDS = (aisData.tds_summary || []).reduce((s, t) => s + (t.tds || 0), 0);
  const form16TDS = form16Data?.total_tds_deducted ?? 0;
  if (aisTDS > 0 && form16TDS > 0 && Math.abs(aisTDS - form16TDS) > 100) {
    flags.push({
      severity: 'warn',
      title: 'TDS mismatch between AIS and Form 16',
      body: `Form 16 TDS: ₹${form16TDS.toLocaleString('en-IN')}. AIS TDS total: ₹${aisTDS.toLocaleString('en-IN')}. Difference of ₹${Math.abs(aisTDS - form16TDS).toLocaleString('en-IN')} needs reconciliation.`,
      field: 'tds_reconciliation',
    });
  }

  return flags;
}
