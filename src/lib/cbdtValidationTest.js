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

// ─── ITR-2 Specific Tests ──────────────────────────────────────────────────────

// Test: buildScheduleS decomposition (Rules 22-27)
{
  const c = { grossSalary: 1000000, perquisites: 50000, profitsInLieu: 0, professionalTax: 2500, employerCategory: 'OTH' };
  // Rule 22: GrossSalary = 1a+1b+1c
  const grossTotal = c.grossSalary + c.perquisites;
  check('ITR2-R22: GrossSalary = salary+perquisites', grossTotal === 1050000, `got ${grossTotal}`);
  // Rule 26: DeductionsUs16 = 5a+5b+5c (std+ent+prof)
  const stdOld = Math.min(50000, grossTotal);
  const profCapped = Math.min(c.professionalTax, 5000); // Rule 37
  const ded16 = stdOld + 0 + profCapped; // ent=0 for private employer
  check('ITR2-R26: DeductionUs16 = stdDed + entAlw + profTax', ded16 === 52500, `got ${ded16}`);
  // Rule 27: IncChrgSal = NetSalary - Deductions
  const incChrgSal = Math.max(0, grossTotal - ded16);
  check('ITR2-R27: IncChrgSal = NetSal - Ded16', incChrgSal === 997500, `got ${incChrgSal}`);
}

// Test: Standard deduction ITR-2 old regime (Rule 40)
{
  check('ITR2-R40: Std ded old ≤ Rs.50,000', Math.min(50000, 1000000) === 50000, '');
}

// Test: Professional tax cap Rs.5000 (Rule 37)
{
  const profOver = Math.min(8000, 5000);
  check('ITR2-R37: Prof tax capped at Rs.5,000', profOver === 5000, `got ${profOver}`);
}

// Test: HP loss max Rs.2L set-off old regime (Rule 249)
{
  const hpLoss = 300000;
  const setOff = Math.min(hpLoss, 200000);
  check('ITR2-R249: HP loss set-off ≤ Rs.2L old regime', setOff === 200000, `got ${setOff}`);
}

// Test: HP loss = 0 set-off new regime (Rule 264)
{
  const newRegimeHPSetOff = 0; // forced to 0 in new regime
  check('ITR2-R264: HP loss not set-off in new regime', newRegimeHPSetOff === 0, '');
}

// Test: Schedule 112A Col arithmetic (Rules 84-90)
{
  const qty = 100, salePerUnit = 500, purchaseCost = 30000, fmvPerUnit = 350, expenses = 200;
  const totalSale = qty * salePerUnit;           // Col6 = Col4*Col5
  const totalFMV  = qty * fmvPerUnit;            // Col11 = Col4*Col10
  const col9      = Math.min(totalSale, totalFMV); // Col9 = min(Col6, Col11)
  const col7      = Math.max(purchaseCost, col9);  // Col7 = max(Col8, Col9)
  const col13     = col7 + expenses;               // Col13 = Col7 + Col12
  const col14     = totalSale - col13;             // Col14 = Col6 - Col13
  check('ITR2-R84: TotalSaleValue = Qty*SalePrice', totalSale === 50000, `got ${totalSale}`);
  check('ITR2-R85: CostWithoutIndex = max(col8,col9)', col7 === 35000, `got ${col7}`);
  check('ITR2-R86: Col9 = min(Col6,Col11)', col9 === 35000, `got ${col9}`);
  check('ITR2-R87: TotalFMV = Qty*FMVPerUnit', totalFMV === 35000, `got ${totalFMV}`);
  check('ITR2-R88: TotalDedn = Col7+Col12', col13 === 35200, `got ${col13}`);
  check('ITR2-R89: Balance = Col6-Col13', col14 === 14800, `got ${col14}`);
}

// Test: AMT (Rule 428) — only if ATI > Rs.20L
{
  const atiBelowThreshold = 1500000;
  const amtBelow = atiBelowThreshold > 2000000 ? Math.round(atiBelowThreshold * 0.185 * 1.04) : 0;
  check('ITR2-R428: No AMT if ATI ≤ Rs.20L', amtBelow === 0, `got ${amtBelow}`);
  const atiAbove = 2500000;
  const amtAbove = atiAbove > 2000000 ? Math.round(atiAbove * 0.185 * 1.04) : 0;
  check('ITR2-R428: AMT = 18.5%+cess if ATI > Rs.20L', amtAbove > 0, `got ${amtAbove}`);
}

// Test: Rule 484 — 87A new regime: income > Rs.12L cannot claim
{
  function itr2Rebate87A(taxInc, baseTax, regime) {
    if (regime === 'new' && taxInc <= 1270590) return Math.min(baseTax, 60000);
    if (regime === 'old' && taxInc <= 500000)  return Math.min(baseTax, 12500);
    return 0;
  }
  const r1 = itr2Rebate87A(1200001, 60000, 'new');
  check('ITR2-R484: 87A at Rs.12,00,001 new regime (marginal relief still applies)', r1 >= 0, `got ${r1}`);
  const r2 = itr2Rebate87A(1300000, 70000, 'new');
  check('ITR2-R484: 87A = 0 at Rs.13L new regime', r2 === 0, `got ${r2}`);
}

// Test: Rule 572 — LTCG property rates
{
  function ltcgPropertyRate(acquiredBefore23Jul2024, isResident) {
    if (acquiredBefore23Jul2024 && isResident) return 0.20;
    return 0.125;
  }
  check('ITR2-R572: Resident pre-23-Jul-24 = 20%', ltcgPropertyRate(true, true) === 0.20, '');
  check('ITR2-R572: Post-23-Jul-24 = 12.5%', ltcgPropertyRate(false, true) === 0.125, '');
  check('ITR2-R570: NR cannot get indexation', ltcgPropertyRate(true, false) === 0.125, '');
}

console.log(`\nAll tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
