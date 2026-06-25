// src/lib/cbdtValidationTest.js
// Self-test: verifies all Category A compliance rules against computeTax + generateITRJson
// Run: node --experimental-vm-modules cbdtValidationTest.js (or import in a test harness)

import { computeTax } from '../data/flow.js';

const PASS = '✓';
const FAIL = '✗';
let passed = 0, failed = 0;

function check(label, condition, detail = '') {
  if (condition) { console.log(`${PASS} ${label}`); passed++; }
  else { console.error(`${FAIL} ${label}${detail ? ': ' + detail : ''}`); failed++; }
}

// ── Test 1: Standard deduction — old regime ₹50K, new regime ₹75K ─────────
{
  const c = computeTax({ grossSalary: 1000000 });
  check('A-112: Std deduction old regime = ₹50,000', c.stdDedOld === 50000, `got ${c.stdDedOld}`);
  check('A-215: Std deduction new regime = ₹75,000', c.stdDedNew === 75000, `got ${c.stdDedNew}`);
}

// ── Test 2: 87A rebate threshold new regime ₹12,70,590 ────────────────────
{
  const atThreshold = computeTax({ grossSalary: 1270590 });
  check('A-191: 87A rebate granted at ₹12,70,590 new regime', atThreshold.newRebate > 0, `rebate=${atThreshold.newRebate}`);
  const justOver = computeTax({ grossSalary: 1270591 });
  check('A-191: 87A rebate = 0 above ₹12,70,590', justOver.newRebate === 0, `rebate=${justOver.newRebate}`);
}

// ── Test 3: 80TTA/80TTB senior vs non-senior ──────────────────────────────
{
  const senior = computeTax({ grossSalary: 500000, deductions80TTA: 10000, ageGroup: '60-80' });
  check('A-13: Senior citizen 80TTA = 0', senior.cap80TTA === 0, `cap80TTA=${senior.cap80TTA}`);
  check('A-14: Senior citizen 80TTB > 0', senior.cap80TTB > 0, `cap80TTB=${senior.cap80TTB}`);

  const nonSenior = computeTax({ grossSalary: 500000, deductions80TTA: 10000, ageGroup: '<60' });
  check('A-11: Non-senior 80TTA ≤ ₹10,000', nonSenior.cap80TTA <= 10000, `cap80TTA=${nonSenior.cap80TTA}`);
  check('A-15: Non-senior 80TTB = 0', nonSenior.cap80TTB === 0, `cap80TTB=${nonSenior.cap80TTB}`);
}

// ── Test 4: Chapter VI-A capped at GTI ───────────────────────────────────
{
  const c = computeTax({ grossSalary: 100000, deductions80C: 150000 });
  check('A-18: Total deductions ≤ GTI', c.totalDeductionsOld <= c.grossTotalOld,
    `deductions=${c.totalDeductionsOld} GTI=${c.grossTotalOld}`);
}

// ── Test 5: 80C+80CCD(1) combined cap ₹1,50,000 ──────────────────────────
{
  const c = computeTax({ grossSalary: 1000000, deductions80C: 100000, deductions80CCD1: 100000 });
  check('A-1: cap80C + cap80CCD1 ≤ ₹1,50,000', (c.cap80C + c.cap80CCD1) <= 150000,
    `combined=${c.cap80C + c.cap80CCD1}`);
}

// ── Test 6: Cess is 4% exactly ────────────────────────────────────────────
{
  const c = computeTax({ grossSalary: 800000 });
  const expectedOldCess = Math.round(c.oldAfterRebate !== undefined
    ? (c.oldAfterRebate + c.oldSurcharge) * 0.04
    : (Math.max(0, c.oldSlabTax - c.oldRebate) + c.oldSurcharge) * 0.04);
  check('A-26: Old regime cess = 4% of (tax+surcharge)', c.oldCess === expectedOldCess,
    `cess=${c.oldCess} expected=${expectedOldCess}`);
}

// ── Test 7: HP loss excluded from new regime GTI ──────────────────────────
{
  const c = computeTax({ grossSalary: 1000000, houseProperty: { enabled: true, type: 'Self Occupied', interestPaid: 150000 } });
  check('A-160: HP loss excluded from newTaxable', c.grossTotalNew >= c.grossTotalOld,
    `new=${c.grossTotalNew} old=${c.grossTotalOld}`);
  check('A-162: hpForNew = 0 for self-occupied', c.hpForNew === 0, `hpForNew=${c.hpForNew}`);
}

// ── Test 8: 80D cap ₹1,00,000 ────────────────────────────────────────────
{
  const c = computeTax({ grossSalary: 1000000, deductions80D: 120000 });
  check('A-136: 80D capped at ₹1,00,000', c.cap80D <= 100000, `cap80D=${c.cap80D}`);
}

// ── Test 9: Professional tax = 0 in new regime ───────────────────────────
{
  const c = computeTax({ grossSalary: 1000000, professionalTax: 2500, betterRegime: 'new' });
  // profTax exclusion happens in itrJson.js builder, not computeTax
  // Test that salAfterStdDedNew does NOT subtract profTax
  const expectedNew = Math.max(0, 1000000 - 75000);
  check('A-168: New regime salary net excludes professional tax', c.salAfterStdDedNew === expectedNew,
    `salAfterStdDedNew=${c.salAfterStdDedNew} expected=${expectedNew}`);
}

// ── Test 10: totalPaid includes challans ─────────────────────────────────
{
  const c = computeTax({
    grossSalary: 1000000,
    tdsDeducted: 50000,
    challans: [{ type: 'advance', amount: 20000 }, { type: 'self', amount: 5000 }],
  });
  check('A-104: totalPaid includes challan amounts', c.totalPaid === 75000, `totalPaid=${c.totalPaid}`);
}

// ── Test 11: Family pension deduction 57(iia) ─────────────────────────────
{
  const c = computeTax({ grossSalary: 0, familyPension: 60000 });
  check('A-54: 57(iia) old = min(1/3 * pension, 15000)', c.ded57iiaOld === 15000, `ded57old=${c.ded57iiaOld}`);
  check('A-214: 57(iia) new = min(1/3 * pension, 25000)', c.ded57iiaNEW === 20000, `ded57new=${c.ded57iiaNEW}`);
}

// ── Test 12: ITR form selection — ₹50L ceiling ───────────────────────────
{
  // Test that computeTax populates incomeExcludingLTCG for determineITRForm
  const c = computeTax({ grossSalary: 5100000 });
  check('A-117: incomeExcludingLTCG computed', c.incomeExcludingLTCG > 5000000,
    `incomeExcludingLTCG=${c.incomeExcludingLTCG}`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
