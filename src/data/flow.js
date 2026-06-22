export const PROFILES = {
  salaried: { label: 'I have a job / salary', icon: '💼', itr: 'ITR-1' },
  business: { label: 'I run a business or shop', icon: '🏪', itr: 'ITR-4' },
  freelancer: { label: 'I am a freelancer / consultant', icon: '💡', itr: 'ITR-4' },
  partner: { label: 'I am a partner in a firm', icon: '🤝', itr: 'ITR-3' },
};

export const DEDUCTION_OPTIONS = [
  { id: 'ppf', label: 'PPF / EPF contributions', section: '80C' },
  { id: 'lic', label: 'LIC premium', section: '80C' },
  { id: 'elss', label: 'ELSS mutual fund', section: '80C' },
  { id: 'tuition', label: "Children's tuition fees", section: '80C' },
  { id: 'homeloan_principal', label: 'Home loan principal repayment', section: '80C' },
  { id: 'nps', label: 'NPS contribution', section: '80CCD' },
  { id: 'none', label: 'None of these', section: null },
];

export const OTHER_DEDUCTION_OPTIONS = [
  { id: 'mediclaim_self', label: 'Mediclaim — self & family', section: '80D', limit: 25000 },
  { id: 'mediclaim_parents', label: 'Mediclaim — parents (senior citizen)', section: '80D', limit: 50000 },
  { id: 'home_interest', label: 'Home loan interest', section: '24(b)', limit: 200000 },
  { id: 'education_loan', label: 'Education loan interest', section: '80E', limit: null },
  { id: 'donation', label: 'Donation to charity / PM fund', section: '80G', limit: null },
  { id: 'none', label: 'None of these', section: null },
];

export function computeTax(data) {
  const {
    grossSalary = 0,
    deductions80C = 0,
    deductions80D = 0,
    deductions24b = 0,
    tdsDeducted = 0,
    otherIncome = 0,
  } = data;

  const stdDeduction = 75000;
  const cap80C = Math.min(deductions80C, 150000);
  const cap80D = Math.min(deductions80D, 75000);
  const cap24b = Math.min(deductions24b, 200000);

  const grossTotal = grossSalary + otherIncome;

  // Old regime
  const oldTaxable = Math.max(0, grossTotal - stdDeduction - cap80C - cap80D - cap24b);
  const oldTax = calcSlabTax(oldTaxable, 'old');
  const oldCess = Math.round(oldTax * 0.04);
  const oldTotal = oldTax + oldCess;

  // New regime
  const newTaxable = Math.max(0, grossTotal - stdDeduction);
  const newTax = calcSlabTax(newTaxable, 'new');
  const newCess = Math.round(newTax * 0.04);
  const newTotal = newTax + newCess;

  const betterRegime = oldTotal <= newTotal ? 'old' : 'new';
  const chosenTax = betterRegime === 'old' ? oldTotal : newTotal;
  const savings = Math.abs(oldTotal - newTotal);

  const balanceDue = Math.max(0, chosenTax - tdsDeducted);
  const refund = Math.max(0, tdsDeducted - chosenTax);

  return {
    grossSalary,
    otherIncome,
    grossTotal,
    stdDeduction,
    cap80C,
    cap80D,
    cap24b,
    oldTaxable,
    oldTax: oldTotal,
    newTaxable,
    newTax: newTotal,
    betterRegime,
    chosenTax,
    savings,
    tdsDeducted,
    balanceDue,
    refund,
  };
}

function calcSlabTax(income, regime) {
  if (regime === 'new') {
    if (income <= 300000) return 0;
    if (income <= 700000) return Math.round((income - 300000) * 0.05);
    if (income <= 1000000) return 20000 + Math.round((income - 700000) * 0.10);
    if (income <= 1200000) return 50000 + Math.round((income - 1000000) * 0.15);
    if (income <= 1500000) return 80000 + Math.round((income - 1200000) * 0.20);
    return 140000 + Math.round((income - 1500000) * 0.30);
  } else {
    if (income <= 250000) return 0;
    if (income <= 500000) return Math.round((income - 250000) * 0.05);
    if (income <= 1000000) return 12500 + Math.round((income - 500000) * 0.20);
    return 112500 + Math.round((income - 1000000) * 0.30);
  }
}

export function formatINR(n) {
  if (n === undefined || n === null) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
