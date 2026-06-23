// ─── TaxTalk Tax Engine — FY 2025-26 (AY 2026-27) ───────────────────────────
// Calculation logic ported from verified taxController.js
// All rates verified against Income Tax Act provisions

export const PROFILES = {
  salaried:   { label: 'I have a job / salary',            icon: '💼', itr: 'ITR-1' },
  business:   { label: 'I run a business or shop',         icon: '🏪', itr: 'ITR-4' },
  freelancer: { label: 'I am a freelancer / consultant',   icon: '💡', itr: 'ITR-4' },
  partner:    { label: 'I am a partner in a firm',         icon: '🤝', itr: 'ITR-3' },
};

export const AGE_GROUPS = [
  { id: '<60',   label: 'Below 60 years' },
  { id: '60-80', label: '60–80 years (Senior citizen)' },
  { id: '>80',   label: 'Above 80 years (Super senior)' },
];

export const DEDUCTION_OPTIONS = [
  { id: 'ppf',              label: 'PPF / EPF contributions',        section: '80C' },
  { id: 'lic',              label: 'LIC premium',                    section: '80C' },
  { id: 'elss',             label: 'ELSS mutual fund',               section: '80C' },
  { id: 'tuition',          label: "Children's tuition fees",        section: '80C' },
  { id: 'homeloan_principal',label: 'Home loan principal repayment', section: '80C' },
  { id: 'nps',              label: 'NPS (80CCD(1))',                 section: '80CCD' },
  { id: 'none',             label: 'None of these',                  section: null },
];

export const OTHER_DEDUCTION_OPTIONS = [
  { id: 'mediclaim_self',    label: 'Mediclaim — self & family',       section: '80D',   limit: 25000 },
  { id: 'mediclaim_parents', label: 'Mediclaim — parents (senior)',    section: '80D',   limit: 50000 },
  { id: 'home_interest',     label: 'Home loan interest',             section: '24(b)', limit: 200000 },
  { id: 'education_loan',    label: 'Education loan interest',        section: '80E',   limit: null },
  { id: 'savings_interest',  label: 'Savings bank interest (80TTA)',  section: '80TTA', limit: 10000 },
  { id: 'donation',          label: 'Donation to charity / PM fund',  section: '80G',   limit: null },
  { id: 'none',              label: 'None of these',                  section: null },
];

// ─── Slab tax (base, before surcharge/cess) ──────────────────────────────────

function calcSlabTax(income, regime, ageGroup = '<60') {
  const inc = Math.max(0, Math.round(income));
  if (inc === 0) return 0;

  if (regime === 'new') {
    // FY 2025-26 New Regime slabs (Budget 2025)
    if (inc <= 400000)  return 0;
    if (inc <= 800000)  return Math.round((inc - 400000) * 0.05);
    if (inc <= 1200000) return 20000  + Math.round((inc - 800000)  * 0.10);
    if (inc <= 1600000) return 60000  + Math.round((inc - 1200000) * 0.15);
    if (inc <= 2000000) return 120000 + Math.round((inc - 1600000) * 0.20);
    if (inc <= 2400000) return 200000 + Math.round((inc - 2000000) * 0.25);
    return                      300000 + Math.round((inc - 2400000) * 0.30);
  } else {
    // Old Regime — age-based basic exemption limits
    const limit = ageGroup === '>80' ? 500000 : ageGroup === '60-80' ? 300000 : 250000;
    if (inc <= limit)    return 0;
    if (inc <= 500000)   return Math.round((inc - limit)   * 0.05);
    if (inc <= 1000000)  return Math.round((500000 - limit) * 0.05) + Math.round((inc - 500000)  * 0.20);
    return                      Math.round((500000 - limit) * 0.05) + 100000 + Math.round((inc - 1000000) * 0.30);
  }
}

// ─── Rebate u/s 87A ──────────────────────────────────────────────────────────

function calcRebate87A(taxableIncome, baseTax, regime) {
  if (regime === 'new') {
    // New regime: rebate up to ₹60,000 if income ≤ ₹12,00,000 (FY 2025-26)
    if (taxableIncome <= 1200000) return Math.min(baseTax, 60000);
  } else {
    // Old regime: rebate up to ₹12,500 if income ≤ ₹5,00,000
    if (taxableIncome <= 500000) return Math.min(baseTax, 12500);
  }
  return 0;
}

// ─── Surcharge ───────────────────────────────────────────────────────────────

function calcSurcharge(taxableIncome, taxAfterRebate, regime) {
  let rate = 0;
  if (regime === 'new') {
    // New regime: surcharge capped at 25% (no 37% in new regime)
    if (taxableIncome > 50000000)      rate = 0.25;
    else if (taxableIncome > 20000000) rate = 0.25;
    else if (taxableIncome > 10000000) rate = 0.15;
    else if (taxableIncome > 5000000)  rate = 0.10;
  } else {
    // Old regime
    if (taxableIncome > 50000000)      rate = 0.37;
    else if (taxableIncome > 20000000) rate = 0.25;
    else if (taxableIncome > 10000000) rate = 0.15;
    else if (taxableIncome > 5000000)  rate = 0.10;
  }
  return Math.round(taxAfterRebate * rate);
}

// ─── Capital gains tax (special rates, outside slab) ─────────────────────────

function calcCGTax(cg) {
  if (!cg?.enabled) return 0;
  let tax = 0;
  // STCG on equity/equity funds u/s 111A — 20% (Budget 2024 raised from 15%)
  const stcgShares = Math.max(0, Number(cg.shares?.stcg111a) || 0);
  if (stcgShares > 0) tax += Math.round(stcgShares * 0.20);
  // LTCG on equity u/s 112A — 12.5% above ₹1.25 lakh exemption
  const ltcgShares = Math.max(0, Number(cg.shares?.ltcg112a) || 0);
  if (ltcgShares > 125000) tax += Math.round((ltcgShares - 125000) * 0.125);
  // LTCG on property — 12.5% without indexation (Budget 2024)
  const ltcgProp = Math.max(0, Number(cg.property?.ltcg) || 0);
  if (ltcgProp > 0) tax += Math.round(ltcgProp * 0.125);
  return tax;
}

// ─── House property income ────────────────────────────────────────────────────

export function calcHousePropertyIncome(hp) {
  if (!hp?.enabled) return 0;
  if (hp.type === 'Rented') {
    const rent     = Number(hp.rentReceived)  || 0;
    const municipal = Number(hp.municipalTaxes) || 0;
    const interest = Number(hp.interestPaid)  || 0;
    // NAV × 70% (30% standard deduction) − interest
    const nav = rent - municipal;
    return Math.round((nav * 0.70) - interest);
  } else {
    // Self-occupied: only interest deductible, capped at −₹2L
    const interest = Number(hp.interestPaid) || 0;
    return Math.max(-200000, -interest);
  }
}

// ─── Main tax computation ─────────────────────────────────────────────────────

export function computeTax(data) {
  const {
    grossSalary      = 0,
    businessIncome   = 0,          // Presumptive / actual business / partner profit (after disallowances)
    disallowances    = 0,          // Sec 40A(3) cash pmts, personal exp — added back to business income
    interestIncome   = 0,          // Schedule OS — savings + FD interest combined
    dividendIncome   = 0,          // Schedule OS — dividends
    otherIncome      = 0,          // Schedule OS — gifts, misc (always taxable, no 80TTA benefit)
    deductions80C    = 0,
    deductions80D    = 0,
    deductions24b    = 0,          // Home loan interest (Sec 24b) — only if HP not enabled
    deductions80E    = 0,          // Education loan interest
    deductions80TTA  = 0,          // Savings interest (max ₹10K)
    deductions80G    = 0,          // Donations
    tdsDeducted      = 0,
    advanceTax       = 0,
    selfAssessment   = 0,
    ageGroup         = '<60',
    houseProperty    = null,
    capitalGains     = null,
    professionalTax  = 0,
    standardDeduction = 75000,
  } = data;

  // ── Income heads ───────────────────────────────────────────────────────────
  const hpIncome     = calcHousePropertyIncome(houseProperty);
  const cgSlabIncome = Math.max(0,
    (Number(capitalGains?.property?.stcg) || 0) +
    (Number(capitalGains?.other)          || 0)
  );
  const osIncome = Math.max(0,
    (Number(interestIncome) || 0) +
    (Number(dividendIncome) || 0) +
    (Number(otherIncome)    || 0)   // legacy support
  );

  // ── Gross total income (all five heads) ────────────────────────────────────
  const salaryAfterStdDed = Math.max(0, grossSalary - standardDeduction - professionalTax);
  const grossTotal = salaryAfterStdDed
    + Math.max(0, Number(businessIncome) || 0)   // ← was missing
    + osIncome
    + hpIncome
    + cgSlabIncome;

  // ── Deductions (Chapter VI-A) — old regime only ───────────────────────────
  const cap80C   = Math.min(Number(deductions80C)   || 0, 150000);
  const cap80D   = Math.min(Number(deductions80D)   || 0, 75000);
  const cap24b   = Math.min(Number(deductions24b)   || 0, 200000);  // already in HP calc if HP enabled
  const cap80E   = Math.max(0, Number(deductions80E)   || 0);
  const cap80TTA = Math.min(Number(deductions80TTA) || 0, 10000);
  const cap80G   = Math.max(0, Number(deductions80G)   || 0);
  const totalDeductionsOld = cap80C + cap80D + cap24b + cap80E + cap80TTA + cap80G;

  // ── Taxable income ─────────────────────────────────────────────────────────
  const oldTaxable = Math.max(0, grossTotal - totalDeductionsOld);
  const newTaxable = Math.max(0, grossTotal); // new regime: no Chapter VI-A deductions

  // ── Slab tax ───────────────────────────────────────────────────────────────
  const oldSlabTax = calcSlabTax(oldTaxable, 'old', ageGroup);
  const newSlabTax = calcSlabTax(newTaxable, 'new', ageGroup);

  // ── CG tax at special rates ────────────────────────────────────────────────
  const cgTax = calcCGTax(capitalGains);

  // ── Rebate 87A ─────────────────────────────────────────────────────────────
  const oldRebate = calcRebate87A(oldTaxable, oldSlabTax, 'old');
  const newRebate = calcRebate87A(newTaxable, newSlabTax, 'new');

  const oldAfterRebate = Math.max(0, oldSlabTax - oldRebate) + cgTax;
  const newAfterRebate = Math.max(0, newSlabTax - newRebate) + cgTax;

  // ── Surcharge ──────────────────────────────────────────────────────────────
  const oldSurcharge = calcSurcharge(oldTaxable, oldAfterRebate, 'old');
  const newSurcharge = calcSurcharge(newTaxable, newAfterRebate, 'new');

  // ── Health & Education Cess 4% ─────────────────────────────────────────────
  const oldTax = Math.round((oldAfterRebate + oldSurcharge) * 1.04);
  const newTax = Math.round((newAfterRebate + newSurcharge) * 1.04);

  // ── Regime recommendation ──────────────────────────────────────────────────
  const betterRegime = oldTax <= newTax ? 'old' : 'new';
  const chosenTax    = betterRegime === 'old' ? oldTax : newTax;
  const savings      = Math.abs(oldTax - newTax);

  // ── Tax paid ───────────────────────────────────────────────────────────────
  const totalPaid  = (Number(tdsDeducted) || 0) + (Number(advanceTax) || 0) + (Number(selfAssessment) || 0);
  const balanceDue = Math.max(0, chosenTax - totalPaid);
  const refund     = Math.max(0, totalPaid - chosenTax);

  // ── Advance tax schedule (if balance > ₹10,000) ───────────────────────────
  let advanceTaxSchedule = [];
  if (balanceDue > 10000) {
    advanceTaxSchedule = [
      { due: '15 Jun', pct: 15,  amount: Math.round(balanceDue * 0.15) },
      { due: '15 Sep', pct: 45,  amount: Math.round(balanceDue * 0.45) },
      { due: '15 Dec', pct: 75,  amount: Math.round(balanceDue * 0.75) },
      { due: '15 Mar', pct: 100, amount: Math.round(balanceDue) },
    ];
  }

  return {
    // Inputs (echoed back for recompute)
    grossSalary, businessIncome, interestIncome, dividendIncome,
    otherIncome: osIncome, hpIncome, cgSlabIncome, cgTax,
    standardDeduction, professionalTax,
    ageGroup,

    // Computation
    salaryAfterStdDed,
    grossTotal,

    // Old regime breakdown
    cap80C, cap80D, cap24b, cap80E, cap80TTA, cap80G,
    totalDeductionsOld,
    oldTaxable,
    oldSlabTax,
    oldRebate,
    oldSurcharge,
    oldTax,

    // New regime breakdown
    newTaxable,
    newSlabTax,
    newRebate,
    newSurcharge,
    newTax,

    // Capital gains
    cgTax,

    // Outcome
    betterRegime,
    chosenTax,
    savings,
    tdsDeducted: Number(tdsDeducted) || 0,
    advanceTax:  Number(advanceTax)  || 0,
    selfAssessment: Number(selfAssessment) || 0,
    totalPaid,
    balanceDue,
    refund,
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
