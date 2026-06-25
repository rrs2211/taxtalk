// ─── TaxTalk Tax Engine — FY 2025-26 (AY 2026-27) ───────────────────────────
// CBDT ITR-1 Validation Rules v1.0 (15 May 2026) — fully compliant

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

// ─── CG helpers ───────────────────────────────────────────────────────────────
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
    // AY 2026-27 new regime slabs
    if (inc <= 400000)  return 0;
    if (inc <= 800000)  return Math.round((inc - 400000) * 0.05);
    if (inc <= 1200000) return 20000  + Math.round((inc - 800000)  * 0.10);
    if (inc <= 1600000) return 60000  + Math.round((inc - 1200000) * 0.15);
    if (inc <= 2000000) return 120000 + Math.round((inc - 1600000) * 0.20);
    if (inc <= 2400000) return 200000 + Math.round((inc - 2000000) * 0.25);
    return               300000 + Math.round((inc - 2400000) * 0.30);
  } else {
    // Old regime — age-based basic exemption
    const limit = ageGroup === '>80' ? 500000 : ageGroup === '60-80' ? 300000 : 250000;
    if (inc <= limit)   return 0;
    if (inc <= 500000)  return Math.round((inc - limit) * 0.05);
    if (inc <= 1000000) return Math.round((500000 - limit) * 0.05) + Math.round((inc - 500000) * 0.20);
    return               Math.round((500000 - limit) * 0.05) + 100000 + Math.round((inc - 1000000) * 0.30);
  }
}

// ─── Rebate 87A ───────────────────────────────────────────────────────────────
// Rule A-23: Old regime — income ≤ ₹5L, rebate max ₹12,500
// Rule A-191: New regime — income ≤ ₹12,70,590 (marginal relief threshold), rebate max ₹60,000
function calcRebate87A(taxableIncome, baseTax, regime) {
  if (regime === 'new'  && taxableIncome <= 1270590) return Math.min(baseTax, 60000);
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
  // Section 111A STCG split-rate: 15% pre 23-Jul-2024, 20% post 23-Jul-2024 (Finance Act 2024)
  const stcgPre  = cgGain(cg.shares?.stcg111a_pre  || 0);
  const stcgPost = cgGain(cg.shares?.stcg111a_post || cg.shares?.stcg || cg.shares?.stcg111a || 0);
  if (stcgPre  > 0) tax += Math.round(stcgPre  * 0.15);
  if (stcgPost > 0) tax += Math.round(stcgPost * 0.20);
  // Section 112A LTCG: exempt first ₹1,25,000, then 12.5%
  const ltcg = cgGain(cg.shares?.ltcg || cg.shares?.ltcg112a);
  if (ltcg > 125000) tax += Math.round((ltcg - 125000) * 0.125);
  // Property LTCG at 12.5% (no indexation after Finance Act 2024)
  const ltcgProp = cgGain(cg.property?.ltcgDetail || cg.property?.ltcg);
  if (ltcgProp > 0) tax += Math.round(ltcgProp * 0.125);
  return tax;
}

// ─── House property income ────────────────────────────────────────────────────
export function calcHousePropertyIncome(hp) {
  if (!hp?.enabled) return 0;
  const interest = Number(hp.interestPaid) || 0;
  if (hp.type === 'Rented') {
    const rent = Number(hp.rentReceived)   || 0;
    // Rule A-49: municipal tax NOT allowed for self-occupied; allowed for rented
    const muni = Number(hp.municipalTaxes) || 0;
    const annualValue = Math.max(0, rent - muni);
    const stdDedn     = Math.round(annualValue * 0.30); // Rule A-43: 30%
    return annualValue - stdDedn - interest;
  } else {
    // Rule A-48: self-occupied — interest capped at ₹2,00,000 (old regime)
    // Rule A-162: new regime — interest = 0 for self-occupied (handled in computeTax)
    return Math.max(-200000, -interest);
  }
}

// ─── 234F late filing fee ─────────────────────────────────────────────────────
// Rule A-324/328: ₹1,000 if income ≤ ₹5L filed after 31 Dec 2026; ₹5,000 if income > ₹5L
export function calc234F(taxableIncome, filingDate = null) {
  const now = filingDate ? new Date(filingDate) : new Date();
  const deadline = new Date('2026-07-31');
  const lateCutoff = new Date('2026-12-31');
  if (now <= deadline) return 0;
  if (taxableIncome <= 500000) return 1000;
  return 5000;
}

// ─── Main computation ─────────────────────────────────────────────────────────
export function computeTax(data) {
  const {
    grossSalary       = 0,
    businessIncome    = 0,
    interestIncome    = 0,
    dividendIncome    = 0,
    otherIncome       = 0,
    deductions80C     = 0,
    deductions80CCD1  = 0,   // NPS employee contribution u/s 80CCD(1)
    deductions80CCD1B = 0,   // Additional NPS u/s 80CCD(1B) — max ₹50,000
    deductions80CCD2  = 0,   // Employer NPS contribution u/s 80CCD(2) — allowed in both regimes
    deductions80D     = 0,
    deductions24b     = 0,
    deductions80E     = 0,
    deductions80TTA   = 0,
    deductions80G     = 0,
    tdsDeducted       = 0,
    tdsNonSalary      = 0,   // TDS on interest / professional / rent (Schedule TDS2)
    advanceTax        = 0,
    selfAssessment    = 0,
    ageGroup          = '<60',
    houseProperty     = null,
    capitalGains      = null,
    professionalTax   = 0,
    perquisites       = 0,   // Rule A-59: perquisites u/s 17(2)
    profitsInLieu     = 0,   // Rule A-59: profits in lieu of salary u/s 17(3)
    familyPension     = 0,   // Family pension income (Schedule OS)
    employerCategory  = 'OTH', // For 80CCD(2) cap: 'CG'/'SG' → 14%, others → 10%
    filingSection     = '11',  // 11=139(1), 5=139(5), etc.
    filingDate        = null,
    challans          = [],    // [{type:'advance'|'self', amount, bsr, challanNo, date}]
  } = data;

  // ── Rule A-112/215: Standard deduction — regime-specific ──────────────────
  // Old regime u/s 16(ia): max ₹50,000
  // New regime u/s 16(ia): max ₹75,000
  const stdDedOld = grossSalary > 0 ? Math.min(50000, grossSalary) : 0;
  const stdDedNew = grossSalary > 0 ? Math.min(75000, grossSalary) : 0;

  // ── Rule A-59/60: Gross salary components ─────────────────────────────────
  const grossSalaryTotal = I(grossSalary) + I(perquisites) + I(profitsInLieu);

  // ── House property income ─────────────────────────────────────────────────
  const hpIncome = calcHousePropertyIncome(houseProperty);
  // Rule A-160/162: New regime — HP loss (self-occupied) NOT set-offable
  const hpForNew = Math.max(0, hpIncome);
  const hpForOld = hpIncome; // Can be negative (set-off allowed)

  // ── Capital gains ─────────────────────────────────────────────────────────
  const cgSlabIncome = Math.max(0,
    cgGain(capitalGains?.property?.stcg) +
    (Number(capitalGains?.other) || 0)
  );

  // ── Family pension deduction u/s 57(iia) ─────────────────────────────────
  // Rule A-54 (old): lower of 1/3rd of family pension or ₹15,000
  // Rule A-214 (new): lower of 1/3rd of family pension or ₹25,000
  const famPension = Math.max(0, Number(familyPension) || 0);
  const ded57iiaOld = famPension > 0 ? Math.min(Math.round(famPension / 3), 15000) : 0;
  const ded57iiaNEW = famPension > 0 ? Math.min(Math.round(famPension / 3), 25000) : 0;

  // ── Other source income ───────────────────────────────────────────────────
  const osIncome = Math.max(0,
    (Number(interestIncome) || 0) +
    (Number(dividendIncome) || 0) +
    (Number(otherIncome)    || 0) +
    famPension
  );

  // ── Salary after deductions u/s 16 ───────────────────────────────────────
  const salAfterStdDedOld = Math.max(0, grossSalaryTotal - stdDedOld - I(professionalTax));
  const salAfterStdDedNew = Math.max(0, grossSalaryTotal - stdDedNew);
  // Note: professional tax u/s 16(iii) NOT allowed in new regime (Rule A-168)

  // ── Gross total income ────────────────────────────────────────────────────
  // Rule A-22 (old): GTI = Salary + HP + OS + LTCG 112A
  // Rule A-160 (new w HP loss): GTI = Salary + OS (HP loss excluded)
  const grossTotalOld = salAfterStdDedOld
    + Math.max(0, Number(businessIncome) || 0)
    + osIncome - ded57iiaOld  // 57(iia) deduction reduces OS
    + hpForOld
    + cgSlabIncome;

  const grossTotalNew = salAfterStdDedNew
    + Math.max(0, Number(businessIncome) || 0)
    + osIncome - ded57iiaNEW
    + hpForNew
    + cgSlabIncome;

  // Use old gross for display (the canonical grossTotal for the return)
  const grossTotal = grossTotalOld;

  // ── Rule A-1: 80C+80CCC+80CCD(1) combined cap ₹1,50,000 ─────────────────
  const raw80C      = Math.max(0, Number(deductions80C)    || 0);
  const raw80CCD1   = Math.max(0, Number(deductions80CCD1) || 0);
  const combined80  = Math.min(raw80C + raw80CCD1, 150000); // Rule A-1 cap
  const cap80C      = Math.min(raw80C, combined80);          // Apportion to 80C
  const cap80CCD1   = combined80 - cap80C;                   // Remainder to 80CCD(1)

  // Rule A-115: 80CCD(1B) additional NPS — max ₹50,000
  const cap80CCD1B  = Math.min(Math.max(0, Number(deductions80CCD1B) || 0), 50000);

  // Rule A-4/120/216: 80CCD(2) employer contribution
  // Old: ≤10% of salary for private; ≤14% for CG/SG
  // New: ≤14% for all categories (Rule A-216)
  const isGovtEmp  = ['CG','SG'].includes(employerCategory);
  const ccd2LimitOld = isGovtEmp ? 0.14 : 0.10;
  const ccd2LimitNew = 0.14;
  const cap80CCD2Old = Math.min(Math.max(0, Number(deductions80CCD2) || 0), Math.round(I(grossSalary) * ccd2LimitOld));
  const cap80CCD2New = Math.min(Math.max(0, Number(deductions80CCD2) || 0), Math.round(I(grossSalary) * ccd2LimitNew));

  // Rule A-186: 80CCH (Agniveer corpus) — max 46.2% of salary, CG employee 17-27 yrs only
  // Not collected currently, so 0

  // ── Other deductions (old regime only) ───────────────────────────────────
  // Rule A-186-187: 80D max ₹1,00,000 total (self ₹25K/₹50K sr + parents ₹25K/₹50K sr)
  const cap80D   = Math.min(Math.max(0, Number(deductions80D) || 0), 100000);
  // Rule A-48: 24(b) only when HP not enabled (otherwise HP schedule carries interest)
  const cap24b   = houseProperty?.enabled ? 0 : Math.min(Math.max(0, Number(deductions24b) || 0), 200000);
  const cap80E   = Math.max(0, Number(deductions80E) || 0);
  const cap80G   = Math.max(0, Number(deductions80G) || 0);

  // Rules A-11/13/14/15: 80TTA (non-senior, max ₹10K) / 80TTB (senior, max ₹50K)
  // Senior citizen = DOB on or before 01/04/1966 → ageGroup '60-80' or '>80'
  const isSenior = ageGroup === '60-80' || ageGroup === '>80';
  const cap80TTA = isSenior ? 0 : Math.min(Math.max(0, Number(deductions80TTA) || 0), 10000);
  const cap80TTB = isSenior ? Math.min(Math.max(0, Number(deductions80TTA) || 0), 50000) : 0;

  // ── Total Chapter VI-A (old regime) ──────────────────────────────────────
  // Rule A-18: Cannot exceed GTI
  const rawDeductionsOld = cap80C + cap80CCD1 + cap80CCD1B + cap80CCD2Old
    + cap80D + cap24b + cap80E + cap80TTA + cap80TTB + cap80G;
  // Rule A-17: Total must equal sum of individual — we derive from sum
  const totalDeductionsOld = Math.min(rawDeductionsOld, Math.max(0, grossTotalOld));

  // New regime: only 80CCD(2) allowed
  const totalDeductionsNew = cap80CCD2New;

  // ── Taxable income ────────────────────────────────────────────────────────
  const oldTaxable = Math.max(0, grossTotalOld - totalDeductionsOld);
  const newTaxable = Math.max(0, grossTotalNew - totalDeductionsNew);

  // ── Rule A-117: ITR-1 max income ₹50L (excluding LTCG 112A) ─────────────
  // Stored in result for determineITRForm to use
  const incomeExcludingLTCG = grossTotalOld; // LTCG 112A is separate from grossTotal

  // ── Slab tax ─────────────────────────────────────────────────────────────
  const oldSlabTax = calcSlabTax(oldTaxable, 'old', ageGroup);
  const newSlabTax = calcSlabTax(newTaxable, 'new', ageGroup);

  // ── CG tax ───────────────────────────────────────────────────────────────
  const cgTax = calcCGTax(capitalGains);

  // ── Rebate 87A ────────────────────────────────────────────────────────────
  const oldRebate = calcRebate87A(oldTaxable, oldSlabTax, 'old');
  const newRebate = calcRebate87A(newTaxable, newSlabTax, 'new');

  const oldAfterRebate = Math.max(0, oldSlabTax - oldRebate) + cgTax;
  const newAfterRebate = Math.max(0, newSlabTax - newRebate) + cgTax;

  // ── Surcharge ─────────────────────────────────────────────────────────────
  const oldSurcharge = calcSurcharge(oldTaxable, oldAfterRebate, 'old');
  const newSurcharge = calcSurcharge(newTaxable, newAfterRebate, 'new');

  // ── Cess: exactly 4% of (tax after rebate + surcharge) ───────────────────
  // Rules A-25/26: explicitly compute cess, not as residual
  const oldCess = Math.round((oldAfterRebate + oldSurcharge) * 0.04);
  const newCess = Math.round((newAfterRebate + newSurcharge) * 0.04);

  const oldTax = oldAfterRebate + oldSurcharge + oldCess;
  const newTax = newAfterRebate + newSurcharge + newCess;

  // ── Regime recommendation ─────────────────────────────────────────────────
  const betterRegime = oldTax <= newTax ? 'old' : 'new';
  const chosenTax    = betterRegime === 'old' ? oldTax : newTax;
  const savings      = Math.abs(oldTax - newTax);

  // ── Standard deduction for chosen regime ─────────────────────────────────
  const standardDeductionChosen = betterRegime === 'old' ? stdDedOld : stdDedNew;
  const salaryAfterStdDed       = betterRegime === 'old' ? salAfterStdDedOld : salAfterStdDedNew;

  // ── Taxes paid — including challans ──────────────────────────────────────
  // Rules A-104/110/111: Advance = paid before 31 Mar 2026; Self-assessment = after
  const challanAdvance = challans.filter(x => x.type === 'advance').reduce((s, x) => s + (x.amount || 0), 0);
  const challanSelf    = challans.filter(x => x.type === 'self').reduce((s, x)    => s + (x.amount || 0), 0);
  const totalTDS       = (Number(tdsDeducted) || 0) + (Number(tdsNonSalary) || 0);
  const totalPaid      = totalTDS + (Number(advanceTax) || 0) + challanAdvance
                        + (Number(selfAssessment) || 0) + challanSelf;

  // Rules A-105/106: Refund = totalPaid - tax; Balance = tax - totalPaid
  const balanceDue = Math.max(0, chosenTax - totalPaid);
  const refund     = Math.max(0, totalPaid - chosenTax);

  // ── Interest u/s 234B (simplified) ───────────────────────────────────────
  const advanceTaxRequired = chosenTax > 10000;
  const paidAsTDS   = totalTDS;
  const paidAsAdv   = (Number(advanceTax) || 0) + challanAdvance;
  const est234B     = advanceTaxRequired && (paidAsAdv + paidAsTDS) < chosenTax * 0.9
    ? Math.round((chosenTax - paidAsTDS) * 0.01 * 4)
    : 0;

  // ── 234F late filing fee ──────────────────────────────────────────────────
  const fee234F = calc234F(betterRegime === 'old' ? oldTaxable : newTaxable, filingDate);

  // ── Total interest and fees ───────────────────────────────────────────────
  // Rule A-27: Total Tax Fees & Interest = Tax+Cess + 234A + 234B + 234C + 234F - s89
  const totalInterestFees = est234B + fee234F; // 234A and 234C = 0 (CA must fill if needed)

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
    grossSalary, grossSalaryTotal, perquisites, profitsInLieu,
    businessIncome, interestIncome, dividendIncome, otherIncome,
    famPension, osIncome, hpIncome, hpForOld, hpForNew, cgSlabIncome, cgTax,
    // Regime-specific std deduction
    stdDedOld, stdDedNew, standardDeductionChosen,
    salAfterStdDedOld, salAfterStdDedNew, salaryAfterStdDed,
    professionalTax, ageGroup, isSenior,
    // Family pension deductions
    ded57iiaOld, ded57iiaNEW,
    // Gross totals
    grossTotal, grossTotalOld, grossTotalNew,
    // Deductions (old)
    cap80C, cap80CCD1, cap80CCD1B, cap80CCD2Old, cap80CCD2New,
    cap80D, cap24b, cap80E, cap80TTA, cap80TTB, cap80G,
    totalDeductionsOld, totalDeductionsNew,
    // Income ceiling for ITR form selection
    incomeExcludingLTCG,
    // Taxable income
    oldTaxable, newTaxable,
    // Tax computation
    oldSlabTax, oldRebate, oldSurcharge, oldCess, oldTax,
    newSlabTax, newRebate, newSurcharge, newCess, newTax,
    // Outcome
    betterRegime, chosenTax, savings,
    // Taxes paid
    tdsDeducted: Number(tdsDeducted) || 0,
    tdsNonSalary: Number(tdsNonSalary) || 0,
    totalTDS, advanceTax: Number(advanceTax) || 0, selfAssessment: Number(selfAssessment) || 0,
    challanAdvance, challanSelf, totalPaid,
    balanceDue, refund,
    // Interest and fees
    est234B, fee234F, totalInterestFees,
    advanceTaxSchedule,
    // Filing metadata
    employerCategory, filingSection,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const I = v => Math.round(Number(v) || 0);

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
