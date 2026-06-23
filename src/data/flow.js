// ─── TaxTalk Tax Engine — FY 2025-26 (AY 2026-27) ───────────────────────────
// Verified against taxController.js and CBDT ITR schemas

export const PROFILES = {
  salaried:   { label: 'I have a job / salary',          icon: '💼', itr: 'ITR-1' },
  business:   { label: 'I run a business or shop',       icon: '🏪', itr: 'ITR-4' },
  freelancer: { label: 'I am a freelancer / consultant', icon: '💡', itr: 'ITR-4' },
  partner:    { label: 'I am a partner in a firm',       icon: '🤝', itr: 'ITR-3' },
};

export const AGE_GROUPS = [
  { id: '<60',   label: 'Below 60 years' },
  { id: '60-80', label: '60–80 years (Senior citizen)' },
  { id: '>80',   label: 'Above 80 years (Super senior)' },
];

export const DEDUCTION_OPTIONS = [
  { id: 'ppf',               label: 'PPF / EPF contributions',      section: '80C' },
  { id: 'lic',               label: 'LIC premium',                  section: '80C' },
  { id: 'elss',              label: 'ELSS mutual fund',             section: '80C' },
  { id: 'tuition',           label: "Children's tuition fees",      section: '80C' },
  { id: 'homeloan_principal',label: 'Home loan principal repayment',section: '80C' },
  { id: 'nps',               label: 'NPS (80CCD(1))',               section: '80CCD' },
  { id: 'none',              label: 'None of these',                section: null },
];

export const OTHER_DEDUCTION_OPTIONS = [
  { id: 'mediclaim_self',    label: 'Mediclaim — self & family',     section: '80D',   limit: 25000 },
  { id: 'mediclaim_parents', label: 'Mediclaim — parents (senior)',  section: '80D',   limit: 50000 },
  { id: 'home_interest',     label: 'Home loan interest',           section: '24(b)', limit: 200000 },
  { id: 'education_loan',    label: 'Education loan interest',      section: '80E',   limit: null },
  { id: 'savings_interest',  label: 'Savings bank interest (80TTA)',section: '80TTA', limit: 10000 },
  { id: 'donation',          label: 'Donation to charity / PM fund',section: '80G',   limit: null },
  { id: 'none',              label: 'None of these',                section: null },
];

// ─── CG helper: extract net gain from either a number or detail object ────────
export function cgGain(val) {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null) return Math.max(0, Number(val.gain) || 0);
  return Math.max(0, Number(val) || 0);
}
export function cgSaleValue(val) {
  if (typeof val === 'object' && val !== null) return Number(val.saleValue) || 0;
  return 0;
}
export function cgCost(val) {
  if (typeof val === 'object' && val !== null)
    return Number(val.purchaseCost || val.indexedCost || val.fmv31Jan18) || 0;
  return 0;
}
export function cgExpenses(val) {
  if (typeof val === 'object' && val !== null) return Number(val.expenses) || 0;
  return 0;
}

// ─── Slab tax ─────────────────────────────────────────────────────────────────
function calcSlabTax(income, regime, ageGroup = '<60') {
  const inc = Math.max(0, Math.round(income));
  if (inc === 0) return 0;
  if (regime === 'new') {
    if (inc <= 400000)  return 0;
    if (inc <= 800000)  return Math.round((inc - 400000) * 0.05);
    if (inc <= 1200000) return 20000  + Math.round((inc - 800000)  * 0.10);
    if (inc <= 1600000) return 60000  + Math.round((inc - 1200000) * 0.15);
    if (inc <= 2000000) return 120000 + Math.round((inc - 1600000) * 0.20);
    if (inc <= 2400000) return 200000 + Math.round((inc - 2000000) * 0.25);
    return                     300000 + Math.round((inc - 2400000) * 0.30);
  } else {
    const limit = ageGroup === '>80' ? 500000 : ageGroup === '60-80' ? 300000 : 250000;
    if (inc <= limit)   return 0;
    if (inc <= 500000)  return Math.round((inc - limit) * 0.05);
    if (inc <= 1000000) return Math.round((500000 - limit) * 0.05) + Math.round((inc - 500000) * 0.20);
    return                     Math.round((500000 - limit) * 0.05) + 100000 + Math.round((inc - 1000000) * 0.30);
  }
}

// ─── Rebate 87A ───────────────────────────────────────────────────────────────
function calcRebate87A(taxableIncome, baseTax, regime) {
  if (regime === 'new'  && taxableIncome <= 1200000) return Math.min(baseTax, 60000);
  if (regime === 'old'  && taxableIncome <= 500000)  return Math.min(baseTax, 12500);
  return 0;
}

// ─── Surcharge ────────────────────────────────────────────────────────────────
function calcSurcharge(taxableIncome, taxAfterRebate, regime) {
  let rate = 0;
  if (regime === 'new') {
    if      (taxableIncome > 50000000) rate = 0.25;
    else if (taxableIncome > 20000000) rate = 0.25;
    else if (taxableIncome > 10000000) rate = 0.15;
    else if (taxableIncome > 5000000)  rate = 0.10;
  } else {
    if      (taxableIncome > 50000000) rate = 0.37;
    else if (taxableIncome > 20000000) rate = 0.25;
    else if (taxableIncome > 10000000) rate = 0.15;
    else if (taxableIncome > 5000000)  rate = 0.10;
  }
  return Math.round(taxAfterRebate * rate);
}

// ─── CG tax at special rates ──────────────────────────────────────────────────
function calcCGTax(cg) {
  if (!cg?.enabled) return 0;
  let tax = 0;
  const stcg = cgGain(cg.shares?.stcg || cg.shares?.stcg111a);
  if (stcg > 0) tax += Math.round(stcg * 0.20);           // 111A @ 20%
  const ltcg = cgGain(cg.shares?.ltcg || cg.shares?.ltcg112a);
  if (ltcg > 125000) tax += Math.round((ltcg - 125000) * 0.125); // 112A @ 12.5% above ₹1.25L
  const ltcgProp = cgGain(cg.property?.ltcgDetail || cg.property?.ltcg);
  if (ltcgProp > 0) tax += Math.round(ltcgProp * 0.125);  // Property LTCG @ 12.5%
  return tax;
}

// ─── House property income ────────────────────────────────────────────────────
export function calcHousePropertyIncome(hp) {
  if (!hp?.enabled) return 0;
  const interest = Number(hp.interestPaid) || 0;
  if (hp.type === 'Rented') {
    const rent     = Number(hp.rentReceived)  || 0;
    const muni     = Number(hp.municipalTaxes)|| 0;
    // Annual value = Rent − Municipal tax
    // Net = Annual value − 30% std deduction − Loan interest
    const annualValue = Math.max(0, rent - muni);
    const stdDedn     = Math.round(annualValue * 0.30);
    return annualValue - stdDedn - interest;
  } else {
    // Self-occupied: interest deductible up to ₹2L, always negative
    return Math.max(-200000, -interest);
  }
}

// ─── Main computation ─────────────────────────────────────────────────────────
export function computeTax(data) {
  const {
    grossSalary       = 0,
    businessIncome    = 0,
    interestIncome    = 0,   // savings + FD combined
    dividendIncome    = 0,
    otherIncome       = 0,   // gifts, misc OS income
    deductions80C     = 0,
    deductions80D     = 0,
    deductions24b     = 0,   // only when HP not enabled
    deductions80E     = 0,
    deductions80TTA   = 0,   // savings interest deduction (max ₹10K, old regime)
    deductions80G     = 0,
    tdsDeducted       = 0,
    advanceTax        = 0,
    selfAssessment    = 0,
    ageGroup          = '<60',
    houseProperty     = null,
    capitalGains      = null,
    professionalTax   = 0,
    standardDeduction = 75000,
  } = data;

  // ── Income heads ──────────────────────────────────────────────────────────
  const hpIncome     = calcHousePropertyIncome(houseProperty);
  // CG that goes into slab (non-equity CG at normal rates)
  const cgSlabIncome = Math.max(0,
    cgGain(capitalGains?.property?.stcg) +
    (Number(capitalGains?.other) || 0)
  );
  const osIncome = Math.max(0,
    (Number(interestIncome) || 0) +
    (Number(dividendIncome) || 0) +
    (Number(otherIncome)    || 0)
  );

  // ── Gross total ───────────────────────────────────────────────────────────
  // Standard deduction only when salary > 0
  const actualStdDed      = grossSalary > 0 ? Math.min(standardDeduction, grossSalary) : 0;
  const salaryAfterStdDed = Math.max(0, grossSalary - actualStdDed - (Number(professionalTax) || 0));
  const grossTotal = salaryAfterStdDed
    + Math.max(0, Number(businessIncome) || 0)
    + osIncome
    + hpIncome
    + cgSlabIncome;

  // ── Chapter VI-A deductions (old regime only) ─────────────────────────────
  const cap80C   = Math.min(Number(deductions80C)   || 0, 150000);
  const cap80D   = Math.min(Number(deductions80D)   || 0, 75000);
  const cap24b   = houseProperty?.enabled ? 0 : Math.min(Number(deductions24b) || 0, 200000);
  const cap80E   = Math.max(0, Number(deductions80E)   || 0);
  // 80TTA: savings interest deduction — max ₹10K, only old regime, not for senior citizens (use 80TTB)
  const cap80TTA = ageGroup === '>80' ? 0 : Math.min(Number(deductions80TTA) || 0, 10000);
  const cap80TTB = ageGroup === '>80' ? Math.min(Number(deductions80TTA) || 0, 50000) : 0; // senior citizens
  const cap80G   = Math.max(0, Number(deductions80G) || 0);
  const totalDeductionsOld = cap80C + cap80D + cap24b + cap80E + cap80TTA + cap80TTB + cap80G;

  // ── Taxable income ─────────────────────────────────────────────────────────
  const oldTaxable = Math.max(0, grossTotal - totalDeductionsOld);
  const newTaxable = Math.max(0, grossTotal);

  // ── Slab tax ──────────────────────────────────────────────────────────────
  const oldSlabTax = calcSlabTax(oldTaxable, 'old', ageGroup);
  const newSlabTax = calcSlabTax(newTaxable, 'new', ageGroup);

  // ── CG tax at special rates ───────────────────────────────────────────────
  const cgTax = calcCGTax(capitalGains);

  // ── Rebate 87A ────────────────────────────────────────────────────────────
  const oldRebate = calcRebate87A(oldTaxable, oldSlabTax, 'old');
  const newRebate = calcRebate87A(newTaxable, newSlabTax, 'new');

  const oldAfterRebate = Math.max(0, oldSlabTax - oldRebate) + cgTax;
  const newAfterRebate = Math.max(0, newSlabTax - newRebate) + cgTax;

  // ── Surcharge ─────────────────────────────────────────────────────────────
  const oldSurcharge = calcSurcharge(oldTaxable, oldAfterRebate, 'old');
  const newSurcharge = calcSurcharge(newTaxable, newAfterRebate, 'new');

  // ── Total tax with 4% cess ────────────────────────────────────────────────
  const oldTax = Math.round((oldAfterRebate + oldSurcharge) * 1.04);
  const newTax = Math.round((newAfterRebate + newSurcharge) * 1.04);

  // ── Regime recommendation ─────────────────────────────────────────────────
  const betterRegime = oldTax <= newTax ? 'old' : 'new';
  const chosenTax    = betterRegime === 'old' ? oldTax : newTax;
  const savings      = Math.abs(oldTax - newTax);

  // ── Taxes paid ────────────────────────────────────────────────────────────
  const totalPaid  = (Number(tdsDeducted) || 0) + (Number(advanceTax) || 0) + (Number(selfAssessment) || 0);
  const balanceDue = Math.max(0, chosenTax - totalPaid);
  const refund     = Math.max(0, totalPaid - chosenTax);

  // ── Interest u/s 234B (simplified estimate) ───────────────────────────────
  // 1% per month if balance due and less than 90% of tax paid as advance
  const advanceTaxRequired = chosenTax > 10000;
  const paidAsTDS   = Number(tdsDeducted)  || 0;
  const paidAsAdv   = Number(advanceTax)   || 0;
  const est234B     = advanceTaxRequired && (paidAsAdv + paidAsTDS) < chosenTax * 0.9
    ? Math.round((chosenTax - paidAsTDS) * 0.01 * 4) // ~4 months estimate
    : 0;

  // ── Advance tax schedule ──────────────────────────────────────────────────
  let advanceTaxSchedule = [];
  if (balanceDue > 10000) {
    advanceTaxSchedule = [
      { due: '15 Jun', pct: 15,  amount: Math.round(chosenTax * 0.15) },
      { due: '15 Sep', pct: 45,  amount: Math.round(chosenTax * 0.45) },
      { due: '15 Dec', pct: 75,  amount: Math.round(chosenTax * 0.75) },
      { due: '15 Mar', pct: 100, amount: chosenTax },
    ];
  }

  return {
    // Inputs echoed back
    grossSalary, businessIncome, interestIncome, dividendIncome,
    otherIncome: osIncome, hpIncome, cgSlabIncome, cgTax,
    standardDeduction: actualStdDed, professionalTax, ageGroup,
    // Gross total
    salaryAfterStdDed, grossTotal,
    // Old regime
    cap80C, cap80D, cap24b, cap80E, cap80TTA, cap80TTB, cap80G, totalDeductionsOld,
    oldTaxable, oldSlabTax, oldRebate, oldSurcharge, oldTax,
    // New regime
    newTaxable, newSlabTax, newRebate, newSurcharge, newTax,
    // Outcome
    betterRegime, chosenTax, savings,
    tdsDeducted: Number(tdsDeducted) || 0,
    advanceTax:  Number(advanceTax)  || 0,
    selfAssessment: Number(selfAssessment) || 0,
    totalPaid, balanceDue, refund,
    est234B,         // estimated 234B interest
    advanceTaxSchedule,
  };
}

export function formatINR(n) {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(Math.round(n));
  const str = '₹' + abs.toLocaleString('en-IN');
  return n < 0 ? `−${str}` : str;
}

export function formatINRShort(n) {
  if (!n) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(abs/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `₹${(abs/100000).toFixed(2)}L`;
  if (abs >= 1000)     return `₹${(abs/1000).toFixed(1)}K`;
  return `₹${Math.round(abs).toLocaleString('en-IN')}`;
}
