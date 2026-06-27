// src/lib/itr3Validation.js
// CBDT ITR-3 Validation Rules — AY 2026-27 (V 1.0, 18th June 2026)
// -----------------------------------------------------------------------
// Covers Category A (hard-block), Category B (soft-warning), Category D
// (deduction/form advisory) rules from the official CBDT document.
//
// Usage:
//   import { validateITR3, buildITR3Json } from './itr3Validation.js';
//
//   const { errors, warnings, advisories } = validateITR3(itr3Data);
//   // errors   → Category A: portal will REJECT the upload
//   // warnings → Category B: upload allowed but notice/defect likely
//   // advisories → Category D: deduction may not be allowed
//
// itr3Data shape (keys match ITR-3 schedule names used in the CBDT schema):
//   { partAGeneral, scheduleS, scheduleHP, scheduleBP, scheduleCG,
//     scheduleOS, scheduleVIA, partBTI, partBTTI, ... }
//
// All monetary values are assumed to be in WHOLE RUPEES (integers).
// The helper I() clamps to integer.

const I = v => Math.round(Number(v) || 0);
const isBlank = v => v === undefined || v === null || v === '' || (typeof v === 'string' && v.trim() === '');
const isPos = v => I(v) > 0;

// ─── Result builder ─────────────────────────────────────────────────────────
function err(ruleNo, schedule, field, message, fix = '') {
  return { category: 'A', ruleNo, schedule, field, message, fix, severity: 'block' };
}
function warn(ruleNo, schedule, field, message, fix = '') {
  return { category: 'B', ruleNo, schedule, field, message, fix, severity: 'warning' };
}
function advisory(ruleNo, schedule, field, message, fix = '') {
  return { category: 'D', ruleNo, schedule, field, message, fix, severity: 'advisory' };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: validateITR3
// ═══════════════════════════════════════════════════════════════════════════
export function validateITR3(d = {}) {
  const errors    = [];  // Category A
  const warnings  = [];  // Category B
  const advisories = []; // Category D

  const A = d.partAGeneral   || {};
  const S = d.scheduleS      || {};   // Salary
  const HP = d.scheduleHP    || {};   // House Property
  const BP = d.scheduleBP    || {};   // Business/Profession
  const CG = d.scheduleCG    || {};   // Capital Gains
  const OS = d.scheduleOS    || {};   // Other Sources
  const VIA = d.scheduleVIA  || {};   // Deductions
  const OI  = d.scheduleOI   || {};   // Other Information
  const DEP = d.scheduleDEP  || {};   // Depreciation
  const DPM = d.scheduleDPM  || {};   // Depreciation Plant & Machinery
  const DOA = d.scheduleDOA  || {};   // Depreciation Other Assets
  const DCG = d.scheduleDCG  || {};   // Deemed Capital Gains
  const ESR = d.scheduleESR  || {};   // Eligible Scientific Research
  const CFL = d.scheduleCFL  || {};   // Carry Forward Losses
  const CYLA = d.scheduleCYLA|| {};   // Current Year Loss Adjustment
  const BFLA = d.scheduleBFLA|| {};   // Brought Forward Loss Adjustment
  const AMT  = d.scheduleAMT || {};   // AMT
  const AMTC = d.scheduleAMTC|| {};   // AMT Credit
  const SI   = d.scheduleSI  || {};   // Special Income
  const IF   = d.scheduleIF  || {};   // Income from Firm
  const AL   = d.scheduleAL  || {};   // Assets & Liabilities
  const FA   = d.scheduleFA  || {};   // Foreign Assets
  const BTI  = d.partBTI     || {};   // Part B Total Income
  const TTI  = d.partBTTI    || {};   // Part B Tax on Total Income
  const kyc  = d.kyc         || {};
  const isNewRegime = A.taxRegime === 'new' || A.optedNewRegime === 'Y';
  const isOld = !isNewRegime;
  const isHUF = A.status === 'HUF';
  const isNR  = ['NRI', 'NR', 'Non-Resident'].includes(A.residentialStatus);

  // ───────────────────────────────────────────────────────────────────────
  // PART A — GENERAL INFORMATION (Rules 1–50)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 1: Valid mobile number
  if (!kyc.mobileNo || !/^\d{10}$/.test(String(kyc.mobileNo).replace(/\D/g, ''))) {
    errors.push(err(1, 'Part A General', 'mobileNo',
      'Mobile number is missing or invalid. A valid 10-digit mobile number is mandatory.',
      'Enter a valid 10-digit Indian mobile number in the KYC/personal details section.'));
  }

  // Rule 2: HUF cannot claim 89 relief
  if (isHUF && I(TTI.reliefUs89) > 0) {
    errors.push(err(2, 'Part B-TTI', 'reliefUs89',
      'HUF cannot claim relief under Section 89.',
      'Remove Section 89 relief — it is available only to individuals.'));
  }

  // Rule 3: Name must match PAN database
  if (isBlank(kyc.fullName)) {
    errors.push(err(3, 'Part A General', 'fullName',
      'Taxpayer name is missing. The name must match the PAN database exactly.',
      'Enter name exactly as it appears on the PAN card.'));
  }

  // Rule 5: Return filed u/s 142(1) cannot be revised
  if (A.originalReturnFiledUnder === '142(1)' && A.returnType === 'revised') {
    errors.push(err(5, 'Part A General', 'returnType',
      'A return filed under Section 142(1) cannot be revised.',
      'Check the filing type — only returns filed under Section 139 can be revised.'));
  }

  // Rule 6: Unlisted equity shares — if Yes, details must be filled
  if (A.unlistedSharesHeld === 'Y' && (!A.unlistedSharesDtls || A.unlistedSharesDtls.length === 0)) {
    errors.push(err(6, 'Part A General', 'unlistedSharesDtls',
      'You selected "Yes" for holding unlisted equity shares but have not provided details.',
      'Fill the unlisted equity shares table in Part A General.'));
  }

  // Rule 7: Portuguese Civil Code — Schedule 5A must be filled
  if (A.portugueseCivilCode === 'Y' && !d.schedule5A?.totalIncome) {
    errors.push(err(7, 'Part A General', 'schedule5A',
      'Portuguese Civil Code selected but Schedule 5A is not filled.',
      'Complete Schedule 5A — all income and assets must be split between spouses.'));
  }

  // Rule 10: 7th Proviso 139(1) — if Yes, details must be provided
  if (A.filingUnder7thProviso === 'Y' && isBlank(A.seventhProvisoDetails)) {
    errors.push(err(10, 'Part A General', 'seventhProvisoDetails',
      'Filing under 7th Proviso to Section 139(1) selected but details not provided.',
      'Fill in the required deposit/expenditure amounts in Part A General.'));
  }

  // Rule 11: Director in company — if Yes, details must be filled
  if (A.directorInCompany === 'Y' && (!A.directorDtls || A.directorDtls.length === 0)) {
    errors.push(err(11, 'Part A General', 'directorDtls',
      'You indicated being a company director but the director details table is blank.',
      'Provide company name, CIN and DIN in the director details table.'));
  }

  // Rule 13: Audit u/s 44AB — auditor and audit report details mandatory
  if (A.liableForAudit44AB === 'Y' && A.accountsAudited === 'Y') {
    if (isBlank(A.nameOfAuditor)) {
      errors.push(err(13, 'Part A General', 'nameOfAuditor',
        'Audit u/s 44AB selected but auditor name is missing.',
        'Enter auditor/CA firm name, membership number and date of audit report.'));
    }
    if (isBlank(A.auditReportDate)) {
      errors.push(err(13, 'Part A General', 'auditReportDate',
        'Audit report date is missing (required when audit u/s 44AB is selected).',
        'Enter the date of the tax audit report (Form 3CA/3CB date).'));
    }
  }

  // Rule 14: Mandatory question on presumptive income sections
  if (isBlank(A.declaringUnderPresumptiveSections)) {
    errors.push(err(14, 'Part A General', 'declaringUnderPresumptiveSections',
      'Answer is mandatory: whether income is declared only under sections 44AE/44B/44BB/44AD/44ADA/44BBA/44BBB/44BBC/44BBD.',
      'Select Yes or No for the presumptive income declaration question in Part A General.'));
  }

  // Rule 17: Audit report date cannot be after today
  if (A.auditReportDate) {
    const reportDate = new Date(A.auditReportDate);
    const today = new Date();
    if (reportDate > today) {
      errors.push(err(17, 'Part A General', 'auditReportDate',
        `Audit report date (${A.auditReportDate}) is in the future. Date cannot be after today.`,
        'Enter the actual date of the audit report (Form 3CA/3CB).'));
    }
  }

  // Rule 18: TAN must be valid (format: 4 letters, 5 digits, 1 letter)
  if (A.tanOfEmployer && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(A.tanOfEmployer.toUpperCase())) {
    errors.push(err(18, 'Part A General', 'tanOfEmployer',
      `TAN "${A.tanOfEmployer}" is invalid. Format must be: 4 letters, 5 digits, 1 letter (e.g., MUMB01234X).`,
      'Check the TAN from Form 26AS or deductor communication.'));
  }

  // Rule 20: HUF & Non-Resident cannot claim 89A relief
  if ((isHUF || isNR) && I(OS.reliefUs89A) > 0) {
    errors.push(err(20, 'Part B-TTI', 'reliefUs89A',
      `${isHUF ? 'HUF' : 'Non-Resident Individual'} cannot claim relief from taxation under Section 89A.`,
      'Remove Section 89A relief. It is only available to resident individuals.'));
  }

  // Rule 24: Must select condition for audit liability u/s 44AB
  if (A.liableForAudit44AB === 'Y' && isBlank(A.auditCondition)) {
    errors.push(err(24, 'Part A General', 'auditCondition',
      'You must select the condition (turnover/gross receipts/profession) by virtue of which audit u/s 44AB is applicable.',
      'Select the applicable audit trigger in Part A General.'));
  }

  // Rule 25: Applicable due date must be selected
  if (isBlank(A.applicableDueDate)) {
    errors.push(err(25, 'Part A General', 'applicableDueDate',
      'Applicable due date for filing is mandatory in Part A General.',
      'Select the correct due date (31-Jul / 31-Oct / 30-Nov) based on your audit status.'));
  }

  // Rule 31/32: Aadhaar in Part A must match profile Aadhaar
  if (kyc.aadhaar && A.aadhaarNo && kyc.aadhaar !== A.aadhaarNo) {
    errors.push(err(31, 'Part A General', 'aadhaarNo',
      'Aadhaar number in Part A General does not match the Aadhaar on the e-filing profile.',
      'Ensure the same Aadhaar number is used in both the return and your e-filing profile.'));
  }

  // Rule 36: Tax regime must not change in revised return filed after due date
  if (A.returnType === 'revised' && A.revisedAfterDueDate === 'Y' && A.taxRegimeChanged === 'Y') {
    errors.push(err(36, 'Part A General', 'taxRegime',
      'Tax regime cannot be changed in a revised return filed after the due date.',
      'Use the same tax regime as selected in the original return.'));
  }

  // Rule 39: Business income — must answer A19(b)(I)
  if (I(BP.totalBusinessIncome) > 0 && isBlank(A.a19bI)) {
    errors.push(err(39, 'Part A General', 'a19bI',
      'Answer is mandatory at Sl. No. A19(b)(I) when business income exists.',
      'Fill in the business income-related question in Part A General.'));
  }

  // Rule 40: No business income — must answer A19(b)(II)
  if (!isPos(BP.totalBusinessIncome) && isBlank(A.a19bII)) {
    errors.push(err(40, 'Part A General', 'a19bII',
      'Answer is mandatory at Sl. No. A19(b)(II) when there is no business income.',
      'Answer the non-business income question in Part A General.'));
  }

  // Rule 47: Representative assessee — email/phone must differ from taxpayer
  if (A.representativeAssessee === 'Y') {
    if (A.repEmail && A.repEmail === kyc.email) {
      errors.push(err(47, 'Part A General', 'repEmail',
        "Representative assessee's email must not match the taxpayer's primary email.",
        'Use a different email address for the representative assessee.'));
    }
    if (A.repMobile && A.repMobile === kyc.mobileNo) {
      errors.push(err(47, 'Part A General', 'repMobile',
        "Representative assessee's contact number must not match the taxpayer's primary contact.",
        'Use a different mobile number for the representative assessee.'));
    }
  }

  // Rule 49: Secondary address is mandatory
  if (!A.secondaryAddress?.city && !A.secondaryAddressSameAsPrimary) {
    errors.push(err(49, 'Part A General', 'secondaryAddress',
      'Secondary address in Part A General Information is mandatory.',
      "Enter secondary address, or tick 'Secondary address same as primary address'."));
  }

  // Rule 51: Audit u/s 44AB → BS and P&L must be filed
  if (A.liableForAudit44AB === 'Y') {
    if (!d.partABS || Object.keys(d.partABS || {}).length === 0) {
      errors.push(err(51, 'Part A BS', 'partABS',
        'Audit u/s 44AB is applicable — Part A Balance Sheet must be filled.',
        'Fill Part A Balance Sheet completely.'));
    }
    if (!d.partAPL || Object.keys(d.partAPL || {}).length === 0) {
      errors.push(err(51, 'Part A P&L', 'partAPL',
        'Audit u/s 44AB is applicable — Part A P&L must be filled.',
        'Fill Part A P&L (Trading Account + P&L) completely.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PART A — BALANCE SHEET (Rules 52–60)
  // ───────────────────────────────────────────────────────────────────────
  const BS = d.partABS || {};

  // Rule 52: Sources of funds = Total application of funds
  if (BS.totalSourcesOfFunds !== undefined && BS.totalApplicationOfFunds !== undefined) {
    if (I(BS.totalSourcesOfFunds) !== I(BS.totalApplicationOfFunds)) {
      errors.push(err(52, 'Part A BS', 'totalSourcesOfFunds',
        `Balance Sheet does not balance. Sources = ₹${I(BS.totalSourcesOfFunds).toLocaleString('en-IN')}, Application = ₹${I(BS.totalApplicationOfFunds).toLocaleString('en-IN')}.`,
        'Reconcile the Balance Sheet — Sources must equal Application of Funds.'));
    }
  }

  // Rule 53: Total Proprietor's Fund = Capital + Reserve & Surplus
  if (BS.totalProprietorsFund !== undefined) {
    const expected = I(BS.proprietorsCapital) + I(BS.totalReserveAndSurplus);
    if (I(BS.totalProprietorsFund) !== expected) {
      errors.push(err(53, 'Part A BS', 'totalProprietorsFund',
        `Total Proprietor's Fund (₹${I(BS.totalProprietorsFund).toLocaleString('en-IN')}) must equal Capital + Reserve & Surplus (₹${expected.toLocaleString('en-IN')}).`,
        'Correct Proprietor\'s Capital or Reserve & Surplus figure.'));
    }
  }

  // Rule 54: Total Loan Funds = Secured + Unsecured Loans
  if (BS.totalLoanFunds !== undefined) {
    const expected = I(BS.securedLoans) + I(BS.unsecuredLoans);
    if (I(BS.totalLoanFunds) !== expected) {
      errors.push(err(54, 'Part A BS', 'totalLoanFunds',
        `Total Loan Funds (₹${I(BS.totalLoanFunds).toLocaleString('en-IN')}) must equal Secured + Unsecured Loans (₹${expected.toLocaleString('en-IN')}).`,
        'Verify Secured and Unsecured Loan breakup in Balance Sheet.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE P&L / TRADING ACCOUNT (Rules 61–148)
  // ───────────────────────────────────────────────────────────────────────
  const PL = d.partAPL || {};

  // Rule 75: Trading account Sl.No.12 = 6-7-8-9-10xii-11
  if (PL.sl12 !== undefined) {
    const computed = I(PL.sl6) - I(PL.sl7) - I(PL.sl8) - I(PL.sl9) - I(PL.sl10xii) - I(PL.sl11);
    if (I(PL.sl12) !== computed) {
      errors.push(err(75, 'Part A Trading Account', 'sl12',
        `Sl.No.12 gross profit (₹${I(PL.sl12).toLocaleString('en-IN')}) does not equal 6−7−8−9−10xii−11 (₹${computed.toLocaleString('en-IN')}).`,
        'Check the trading account computation for correct gross profit.'));
    }
  }

  // Rule 100: 44AD — digital receipts ≥ 6% of turnover
  if (BP.presumptive44AD?.grossReceiptsDigital > 0) {
    const digital = I(BP.presumptive44AD.grossReceiptsDigital);
    const income6pct = I(BP.presumptive44AD.income6pct);
    const minAllowed = Math.round(digital * 0.06);
    if (income6pct < minAllowed) {
      errors.push(err(100, 'Part A P&L', 'presumptiveIncome44AD',
        `Presumptive income on digital turnover (6%) cannot be less than ₹${minAllowed.toLocaleString('en-IN')} (6% of ₹${digital.toLocaleString('en-IN')}).`,
        'Declare at least 6% of digital/banking turnover as income under 44AD.'));
    }
  }

  // Rule 101: 44AD — cash receipts ≥ 8% of cash turnover
  if (BP.presumptive44AD?.grossReceiptsCash > 0) {
    const cash = I(BP.presumptive44AD.grossReceiptsCash);
    const income8pct = I(BP.presumptive44AD.income8pct);
    const minAllowed = Math.round(cash * 0.08);
    if (income8pct < minAllowed) {
      errors.push(err(101, 'Part A P&L', 'presumptiveIncome44AD8pct',
        `Presumptive income on cash turnover (8%) cannot be less than ₹${minAllowed.toLocaleString('en-IN')} (8% of ₹${cash.toLocaleString('en-IN')}).`,
        'Declare at least 8% of cash turnover as income under 44AD.'));
    }
  }

  // Rule 104: 44ADA — declared income ≥ 50% of gross receipts
  if (BP.presumptive44ADA?.grossReceipts > 0) {
    const gr = I(BP.presumptive44ADA.grossReceipts);
    const income = I(BP.presumptive44ADA.income);
    if (income < Math.round(gr * 0.50)) {
      errors.push(err(104, 'Part A P&L', 'presumptiveIncome44ADA',
        `Presumptive income under 44ADA cannot be less than 50% of gross receipts (₹${Math.round(gr*0.5).toLocaleString('en-IN')}).`,
        'Declare at least 50% of gross professional receipts as income under 44ADA.'));
    }
  }

  // Rule 111: Income u/s 44ADA cannot exceed gross receipts
  if (BP.presumptive44ADA?.income > BP.presumptive44ADA?.grossReceipts) {
    errors.push(err(111, 'Part A P&L', 'presumptiveIncome44ADA',
      'Income u/s 44ADA cannot exceed gross receipts.',
      'Reduce the declared income to at most the gross professional receipts.'));
  }

  // Rule 120: Non-Resident cannot disclose presumptive income u/s 44AD
  if (isNR && isPos(BP.presumptive44AD?.totalIncome)) {
    errors.push(err(120, 'Schedule BP', 'presumptive44AD',
      'Non-Resident Individual cannot disclose presumptive business income under Section 44AD.',
      'Remove Section 44AD income. Non-residents are not eligible for Section 44AD.'));
  }

  // Rule 121: 44AD not applicable for general commission agents / 44AA(1) professions
  if (A.businessCode44AA1 === 'Y' && isPos(BP.presumptive44AD?.totalIncome)) {
    errors.push(err(121, 'Schedule BP', 'presumptive44AD',
      'Section 44AD is not applicable for general commission agents or professions listed under Section 44AA(1).',
      'Remove 44AD income for commission agents or specified professionals. Use regular accounting.'));
  }

  // Rule 130: HUF not eligible for 44ADA
  if (isHUF && isPos(BP.presumptive44ADA?.income)) {
    errors.push(err(130, 'Schedule BP', 'presumptive44ADA',
      'HUF is not eligible to disclose presumptive income under Section 44ADA.',
      'Remove Section 44ADA income for HUF — only individuals/firms are eligible.'));
  }

  // Rule 134: 44ADA gross receipts > 50L with >5% cash → audit mandatory
  if (BP.presumptive44ADA) {
    const gr44ada = I(BP.presumptive44ADA.grossReceipts);
    const cashPct44ada = Number(BP.presumptive44ADA.cashReceiptsPct || 0);
    if (gr44ada > 5000000 && cashPct44ada > 5 && A.liableForAudit44AB !== 'Y') {
      errors.push(err(134, 'Part A P&L', 'audit44AB',
        'Gross receipts u/s 44ADA exceed ₹50 lakh and cash receipts exceed 5% — tax audit u/s 44AB is mandatory.',
        'Enable audit u/s 44AB and fill auditor details in Part A General.'));
    }
  }

  // Rule 135/138: 44AD limits for audit
  if (BP.presumptive44AD) {
    const gr44ad = I(BP.presumptive44AD.grossTurnover);
    const cashPct44ad = Number(BP.presumptive44AD.cashReceiptsPct || 0);
    if (gr44ad > 20000000 && cashPct44ad > 5 && A.liableForAudit44AB !== 'Y') {
      errors.push(err(135, 'Part A P&L', 'audit44AB',
        'Gross receipts u/s 44AD exceed ₹2 crore with >5% cash — tax audit u/s 44AB is mandatory.',
        'Enable audit u/s 44AB in Part A General.'));
    }
    if (gr44ad > 30000000 && A.liableForAudit44AB !== 'Y') {
      errors.push(err(138, 'Part A P&L', 'audit44AB',
        'Gross receipts u/s 44AD exceed ₹3 crore — tax audit u/s 44AB is mandatory regardless of cash percentage.',
        'Enable audit u/s 44AB in Part A General.'));
    }
  }

  // Rule 137: 44ADA gross receipts > 75L → audit mandatory
  if (BP.presumptive44ADA && I(BP.presumptive44ADA.grossReceipts) > 7500000 && A.liableForAudit44AB !== 'Y') {
    errors.push(err(137, 'Part A P&L', 'audit44AB',
      'Gross receipts u/s 44ADA exceed ₹75 lakh — tax audit u/s 44AB is mandatory.',
      'Enable audit u/s 44AB in Part A General.'));
  }

  // Rule 142–146: Minimum declared profit for special sections
  const specialSections = [
    { section: '44BBD', min: 0.25, field: 'net44BBD', label: '44BBD' },
    { section: '44B',   min: 0.075, field: 'net44B',  label: '44B' },
    { section: '44BB',  min: 0.10,  field: 'net44BB', label: '44BB' },
    { section: '44BBA', min: 0.05,  field: 'net44BBA',label: '44BBA' },
    { section: '44BBC', min: 0.20,  field: 'net44BBC', label: '44BBC' },
  ];
  specialSections.forEach(({ section, min, field, label }) => {
    const rec = BP[field];
    if (rec && I(rec.grossReceipts) > 0) {
      const minRequired = Math.round(I(rec.grossReceipts) * min);
      if (I(rec.netProfit) < minRequired) {
        errors.push(err(
          section === '44BBD' ? 142 : section === '44B' ? 143 : section === '44BB' ? 144 : section === '44BBA' ? 145 : 146,
          'Part A P&L', field,
          `Net profit under Section ${label} cannot be less than ${(min * 100)}% of gross receipts/turnover. Minimum: ₹${minRequired.toLocaleString('en-IN')}.`,
          `Declare at least ${(min*100)}% of gross receipts as net profit under Section ${label}.`));
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE BP (Rules 237–303)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 238: Current year speculative loss in CFL = BP B42
  if (CFL.currentYrSpeculativeLoss !== undefined && BP.b42 !== undefined) {
    if (I(CFL.currentYrSpeculativeLoss) !== I(BP.b42)) {
      errors.push(err(238, 'Schedule CFL', 'currentYrSpeculativeLoss',
        `Current year speculative loss in Schedule CFL (₹${I(CFL.currentYrSpeculativeLoss).toLocaleString('en-IN')}) must equal BP Sl.No.B42 (₹${I(BP.b42).toLocaleString('en-IN')}).`,
        'Reconcile the speculative loss between Schedule BP B42 and Schedule CFL.'));
    }
  }

  // Rule 244: Schedule BP A6 = sum of specific items
  if (BP.a6 !== undefined) {
    const a6Expected = I(BP.a1) - I(BP.a2a) - I(BP.a2b) - I(BP.a3a) - I(BP.a3b) - I(BP.a3c) - I(BP.a3d) - I(BP.a3e) - I(BP.a3f) - I(BP.a4a) - I(BP.a4b) - I(BP.a5d) - I(BP.a5A);
    if (I(BP.a6) !== a6Expected) {
      errors.push(err(244, 'Schedule BP', 'a6',
        `Schedule BP Sl.No.A6 (₹${I(BP.a6).toLocaleString('en-IN')}) does not match the computed value (₹${a6Expected.toLocaleString('en-IN')}).`,
        'Recompute Schedule BP A6 as per the formula: A1 − 2a − 2b − 3a − 3b − 3c − 3d − 3e − 3f − 4a − 4b − 5d − 5A.'));
    }
  }

  // Rule 269: Schedule BP Sl.No. D = A37 + B42 + C48
  if (BP.totalBusinessProfession !== undefined) {
    const expected = I(BP.a37) + I(BP.b42) + I(BP.c48);
    if (I(BP.totalBusinessProfession) !== expected) {
      errors.push(err(269, 'Schedule BP', 'totalBusinessProfession',
        `Income chargeable under PGBP (₹${I(BP.totalBusinessProfession).toLocaleString('en-IN')}) must equal A37 + B42 + C48 (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute Total PGBP income in Schedule BP.'));
    }
  }

  // Rule 278: Depreciation u/s 32(1)(i) only for power sector
  if (BP.depn32_1_i > 0 && !['05001','06008'].includes(A.businessCode)) {
    errors.push(err(278, 'Schedule BP', 'depn32_1_i',
      'Depreciation under Section 32(1)(i) can only be claimed by power sector businesses (code 05001 or 06008).',
      'Remove 32(1)(i) depreciation unless business code is 05001 or 06008.'));
  }

  // Rule 282: A3a in BP cannot exceed salary income
  if (I(BP.a3a) > I(S.incomeSalary)) {
    errors.push(err(282, 'Schedule BP', 'a3a',
      'Amount reduced from Sl.No.A3a in Schedule BP cannot exceed income offered under Salary.',
      'Reduce BP A3a to at most the salary income disclosed in Schedule S.'));
  }

  // Rule 287: New regime — 35AD deduction not allowed
  if (isNewRegime && I(BP.deduction35AD) > 0) {
    errors.push(err(287, 'Schedule BP', 'deduction35AD',
      'Deduction under Section 35AD cannot be claimed under the New Tax Regime.',
      'Remove Section 35AD deduction — switch to old regime to claim it.'));
  }

  // Rule 300: VDA income in BP must match Schedule VDA total
  if (d.scheduleVDA?.totalBusinessIncome !== undefined && BP.vdaIncome !== undefined) {
    if (I(BP.vdaIncome) !== I(d.scheduleVDA.totalBusinessIncome)) {
      errors.push(err(300, 'Schedule BP', 'vdaIncome',
        `VDA income in Schedule BP (₹${I(BP.vdaIncome).toLocaleString('en-IN')}) must match Schedule VDA total (₹${I(d.scheduleVDA.totalBusinessIncome).toLocaleString('en-IN')}).`,
        'Reconcile Virtual Digital Asset income between Schedule VDA and Schedule BP.'));
    }
  }

  // Rule 303: ITR-3 requires business income (with listed exceptions)
  const hasBusinessIncome = isPos(BP.totalBusinessProfession);
  const hasScheduleIF    = IF && Object.keys(IF).length > 0;
  const isLiableAudit92E = A.liableAuditUs92E === 'Y';
  const hasCFLSpecified  = isPos(CFL.specifiedBusinessLoss);
  const hasUDBalance     = isPos(d.scheduleUD?.col3Total) || isPos(d.scheduleUD?.col6Total);
  if (!hasBusinessIncome && !hasScheduleIF && !isLiableAudit92E && !hasCFLSpecified && !hasUDBalance) {
    warnings.push(warn(303, 'Part A General', 'businessIncome',
      'ITR-3 should not be filed if there is no business income (unless specific exceptions apply — partnership firm, 92E audit, specified business loss c/f, or UD balance).',
      'Verify if ITR-3 is the correct form. If no business income exists and no exceptions apply, consider ITR-1 or ITR-2.'));
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE S — SALARY (Rules 160–209)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 160: Gross Salary = sum of components
  if (S.grossSalary !== undefined) {
    const expected = I(S.sl1a) + I(S.sl1b) + I(S.sl1c) + I(S.sl1d) + I(S.sl1e) + I(S.sl1f);
    if (I(S.grossSalary) !== expected) {
      errors.push(err(160, 'Schedule S', 'grossSalary',
        `Gross Salary (₹${I(S.grossSalary).toLocaleString('en-IN')}) must equal sum of 1a+1b+1c+1d+1e+1f (₹${expected.toLocaleString('en-IN')}).`,
        'Recheck breakdown of gross salary components in Schedule S.'));
    }
  }

  // Rule 163: Net Salary = Gross Salary − 2a − exempt allowances
  if (S.netSalary !== undefined) {
    const expected = I(S.totalGrossSalary) - I(S.sl2a) - I(S.sl3ExemptAllowances);
    if (I(S.netSalary) !== expected) {
      errors.push(err(163, 'Schedule S', 'netSalary',
        `Net Salary (₹${I(S.netSalary).toLocaleString('en-IN')}) must equal Total Gross Salary − 2a − Exempt Allowances (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute Net Salary in Schedule S.'));
    }
  }

  // Rule 164: Deductions u/s 16 = 5a + 5b + 5c
  if (S.deductions16 !== undefined) {
    const expected = I(S.sl5a) + I(S.sl5b) + I(S.sl5c);
    if (I(S.deductions16) !== expected) {
      errors.push(err(164, 'Schedule S', 'deductions16',
        `Deductions u/s 16 (₹${I(S.deductions16).toLocaleString('en-IN')}) must equal 5a + 5b + 5c (₹${expected.toLocaleString('en-IN')}).`,
        'Verify standard deduction (5a), entertainment allowance (5b), and professional tax (5c) in Schedule S.'));
    }
  }

  // Rule 165: Income chargeable under Salaries = Net Salary − Deductions u/s 16
  if (S.incomeChargeable !== undefined) {
    const expected = I(S.netSalary) - I(S.deductions16);
    if (I(S.incomeChargeable) !== expected) {
      errors.push(err(165, 'Schedule S', 'incomeChargeable',
        `Income chargeable under Salaries (₹${I(S.incomeChargeable).toLocaleString('en-IN')}) must equal Net Salary − Deductions u/s 16 (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute taxable salary income in Schedule S.'));
    }
  }

  // Rule 166: Gratuity exemption limits
  if (S.gratuityExemption > 0) {
    const isGovtEmp = ['CG','SG','PSU','CG-Pensioner','SG-Pensioner'].includes(S.employerCategory);
    const maxLimit = isGovtEmp ? 2500000 : 2000000;
    if (I(S.gratuityExemption) > maxLimit) {
      errors.push(err(166, 'Schedule S', 'gratuityExemption',
        `Gratuity exemption cannot exceed ₹${(maxLimit/100000).toFixed(0)} lakh for ${isGovtEmp ? 'Govt/PSU' : 'other'} employees.`,
        `Cap gratuity exemption at ₹${(maxLimit/100000).toFixed(0)} lakh.`));
    }
  }

  // Rule 172: Entertainment allowance u/s 16(ii) — only for Govt/PSU employees
  if (I(S.entertainmentAllowance) > 0) {
    const isGovtOrPSU = ['CG','SG','PSU'].includes(S.employerCategory);
    if (!isGovtOrPSU) {
      errors.push(err(172, 'Schedule S', 'entertainmentAllowance',
        'Entertainment allowance u/s 16(ii) is only allowed for Central/State Government and PSU employees.',
        'Remove entertainment allowance deduction — not available to private sector employees.'));
    }
  }

  // Rule 173: Entertainment allowance cap for Govt/PSU employees
  if (I(S.entertainmentAllowance) > 0 && ['CG','SG','PSU'].includes(S.employerCategory)) {
    const maxEnt = Math.min(5000, Math.round(I(S.basicSalary) / 5));
    if (I(S.entertainmentAllowance) > maxEnt) {
      errors.push(err(173, 'Schedule S', 'entertainmentAllowance',
        `Entertainment allowance u/s 16(ii) limited to ₹${maxEnt.toLocaleString('en-IN')} (₹5,000 or 1/5th of basic salary, whichever lower).`,
        `Reduce entertainment allowance to ₹${maxEnt.toLocaleString('en-IN')}.`));
    }
  }

  // Rule 174: Professional tax limited to ₹5,000
  if (I(S.professionalTax) > 5000) {
    errors.push(err(174, 'Schedule S', 'professionalTax',
      'Professional tax deduction u/s 16(iii) is allowed only up to ₹5,000.',
      'Cap professional tax at ₹5,000.'));
  }

  // Rule 177: Standard deduction ≤ ₹50,000 in Old Regime
  if (isOld && I(S.standardDeduction) > 50000) {
    errors.push(err(177, 'Schedule S', 'standardDeduction',
      'Standard deduction u/s 16(ia) cannot exceed ₹50,000 in the Old Tax Regime.',
      'Cap standard deduction at ₹50,000 for old regime.'));
  }

  // Rule 192: If HRA exempt claimed, 80GG cannot be claimed for same period
  if (I(S.hraExemption) > 0 && I(VIA.sec80GG) > 0) {
    errors.push(err(192, 'Schedule VIA', 'sec80GG',
      'If HRA exemption u/s 10(13A) is claimed, deduction u/s 80GG cannot be claimed for the same period.',
      'Remove either HRA exemption or 80GG deduction — both cannot be claimed simultaneously for the same period.'));
  }

  // Rule 194–195: New Regime — certain allowances not claimable
  if (isNewRegime) {
    if (I(S.entertainmentAllowance) > 0) {
      errors.push(err(194, 'Schedule S', 'entertainmentAllowance',
        'Entertainment allowance u/s 16(ii) cannot be claimed under the New Tax Regime.',
        'Remove entertainment allowance — not available in new regime.'));
    }
    if (I(S.professionalTax) > 0) {
      errors.push(err(195, 'Schedule S', 'professionalTax',
        'Professional tax u/s 16(iii) cannot be claimed under the New Tax Regime.',
        'Remove professional tax deduction — not available in new regime.'));
    }
  }

  // Rule 199: HUF cannot have Schedule S
  if (isHUF && (isPos(S.grossSalary) || isPos(S.netSalary))) {
    errors.push(err(199, 'Schedule S', 'grossSalary',
      'Schedule Salary should be blank if status is HUF.',
      'Remove all salary income — HUF cannot have salary income.'));
  }

  // Rule 204: HRA u/s 10(13A) ≤ actual rent - 10% of (basic + DA)
  if (S.hraExemption > 0 && S.actualRentPaid > 0 && S.basicSalaryForHRA > 0) {
    const rentBasedLimit = Math.max(0, I(S.actualRentPaid) - Math.round(I(S.basicSalaryForHRA) * 0.10));
    if (I(S.hraExemption) > rentBasedLimit) {
      errors.push(err(204, 'Schedule S', 'hraExemption',
        `HRA exemption (₹${I(S.hraExemption).toLocaleString('en-IN')}) cannot exceed actual rent paid minus 10% of (basic + DA) = ₹${rentBasedLimit.toLocaleString('en-IN')}.`,
        'Recompute HRA exemption using the three-limit minimum formula.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE HP — HOUSE PROPERTY (Rules 210–236)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 210: Standard deduction = 30% of Annual Value
  if (HP.standardDeduction !== undefined && HP.annualValue !== undefined) {
    const expected30 = Math.round(I(HP.annualValue) * 0.30);
    if (I(HP.standardDeduction) !== expected30) {
      errors.push(err(210, 'Schedule HP', 'standardDeduction',
        `Standard deduction (₹${I(HP.standardDeduction).toLocaleString('en-IN')}) must be exactly 30% of Annual Value (₹${expected30.toLocaleString('en-IN')}).`,
        'Set standard deduction to 30% of the Annual Value of house property.'));
    }
  }

  // Rule 215: Self-occupied property — max interest ₹2L (old regime only)
  if (isOld && HP.propertyType === 'Self Occupied' && I(HP.interestBorrowedCapital) > 200000) {
    errors.push(err(215, 'Schedule HP', 'interestBorrowedCapital',
      'Maximum interest on borrowed capital for self-occupied property is ₹2,00,000 under the Old Tax Regime.',
      'Cap interest deduction at ₹2,00,000 for self-occupied property.'));
  }

  // Rule 223: Cannot claim more than two self-occupied properties
  const soProperties = (HP.properties || []).filter(p => p.propertyType === 'Self Occupied');
  if (soProperties.length > 2) {
    errors.push(err(223, 'Schedule HP', 'properties',
      `Cannot claim more than two properties as self-occupied. You have ${soProperties.length} self-occupied properties.`,
      'Change excess self-occupied properties to "Deemed Let Out".'));
  }

  // Rule 224: New Regime — no interest on borrowed capital for self-occupied
  if (isNewRegime && HP.propertyType === 'Self Occupied' && I(HP.interestBorrowedCapital) > 0) {
    errors.push(err(224, 'Schedule HP', 'interestBorrowedCapital',
      'Interest on borrowed capital for self-occupied property cannot be claimed under the New Tax Regime.',
      'Remove interest deduction for self-occupied property under new regime.'));
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE CG — CAPITAL GAINS (Rules 355–483)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 393: LTCG u/s 112A = Schedule 112A Col 14 total
  if (CG.ltcg112A !== undefined && d.schedule112A?.totalBalance !== undefined) {
    if (I(CG.ltcg112A) !== I(d.schedule112A.totalBalance)) {
      errors.push(err(393, 'Schedule CG', 'ltcg112A',
        `LTCG u/s 112A (₹${I(CG.ltcg112A).toLocaleString('en-IN')}) must equal Col.14 total of Schedule 112A (₹${I(d.schedule112A.totalBalance).toLocaleString('en-IN')}).`,
        'Reconcile Schedule 112A with Schedule CG LTCG 112A figure.'));
    }
  }

  // Rule 444: Beneficial LTCG rate on property — only if acquired before 23 July 2024
  if (CG.ltcgPropertyBeneficialRate && CG.propertyAcquisitionDate) {
    const acqDate = new Date(CG.propertyAcquisitionDate);
    const cutoff = new Date('2024-07-23');
    if (acqDate >= cutoff) {
      errors.push(err(444, 'Schedule CG', 'ltcgPropertyBeneficialRate',
        'The beneficial LTCG rate (with indexation) on land/building is only available if the asset was acquired before 23 July 2024.',
        'For property acquired on or after 23 July 2024, apply 12.5% LTCG rate without indexation.'));
    }
  }

  // Rule 445: Indexation not allowed for Non-Residents
  if (isNR && CG.indexationClaimed === 'Y') {
    errors.push(err(445, 'Schedule CG', 'indexationClaimed',
      'Non-Residents cannot claim indexation benefit in Schedule CG.',
      'Remove indexation and use 12.5% LTCG rate without indexation.'));
  }

  // Rule 471: Section 54EC investment ≤ ₹50 lakh
  if (I(CG.deduction54EC) > 5000000) {
    errors.push(err(471, 'Schedule CG', 'deduction54EC',
      `Section 54EC deduction (₹${I(CG.deduction54EC).toLocaleString('en-IN')}) cannot exceed ₹50 lakh.`,
      'Cap Section 54EC investment deduction at ₹50,00,000.'));
  }

  // Rule 480: Section 54F deduction ≤ ₹10 crore
  if (I(CG.deduction54F) > 100000000) {
    errors.push(err(480, 'Schedule CG', 'deduction54F',
      `Section 54F deduction (₹${I(CG.deduction54F).toLocaleString('en-IN')}) cannot exceed ₹10 crore.`,
      'Cap Section 54F deduction at ₹10,00,00,000.'));
  }

  // Rule 483: Date of sale of land/building cannot be after 31st March of FY
  if (CG.landBuildingSaleDate) {
    const saleDate = new Date(CG.landBuildingSaleDate);
    const fyEnd = new Date('2026-03-31');
    if (saleDate > fyEnd) {
      errors.push(err(483, 'Schedule CG', 'landBuildingSaleDate',
        `Date of sale/transfer of land or building (${CG.landBuildingSaleDate}) cannot be after 31 March 2026.`,
        'Enter the correct date of sale — must be within FY 2025-26 (before 1 April 2026).'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE OS — OTHER SOURCES (Rules 506–548)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 506: Gross amount at normal rates = sum of sub-items
  if (OS.grossNormalRate !== undefined) {
    const expected = I(OS.sl1a) + I(OS.sl1b) + I(OS.sl1c) + I(OS.sl1d) + I(OS.sl1e);
    if (I(OS.grossNormalRate) !== expected) {
      errors.push(err(506, 'Schedule OS', 'grossNormalRate',
        `Gross amount chargeable at normal rates (₹${I(OS.grossNormalRate).toLocaleString('en-IN')}) must equal sum of 1a+1b+1c+1d+1e (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute total normal-rate income in Schedule OS.'));
    }
  }

  // Rule 529: Interest expenditure u/s 57(1) ≤ 20% of dividend income
  if (I(OS.interestExpDiv) > 0 && I(OS.dividendIncome) > 0) {
    const maxIntExp = Math.round(I(OS.dividendIncome) * 0.20);
    if (I(OS.interestExpDiv) > maxIntExp) {
      errors.push(err(529, 'Schedule OS', 'interestExpDiv',
        `Interest expenditure on dividend u/s 57(1) (₹${I(OS.interestExpDiv).toLocaleString('en-IN')}) cannot exceed 20% of dividend income (₹${maxIntExp.toLocaleString('en-IN')}).`,
        `Cap the interest expense allocation for dividend income at ₹${maxIntExp.toLocaleString('en-IN')}.`));
    }
  }

  // Rule 531: Deduction u/s 57(iia) — old regime ≤ min(1/3rd of pension, ₹15,000)
  if (isOld && I(OS.ded57iia) > 0 && I(OS.familyPension) > 0) {
    const maxOld = Math.min(Math.round(I(OS.familyPension) / 3), 15000);
    if (I(OS.ded57iia) > maxOld + 1) { // allow ±1 rounding
      errors.push(err(531, 'Schedule OS', 'ded57iia',
        `Deduction u/s 57(iia) (₹${I(OS.ded57iia).toLocaleString('en-IN')}) cannot exceed ₹${maxOld.toLocaleString('en-IN')} (1/3 of family pension or ₹15,000, whichever lower) under Old Tax Regime.`,
        `Reduce 57(iia) deduction to ₹${maxOld.toLocaleString('en-IN')}.`));
    }
  }

  // Rule 548: New regime — 57(iia) family pension deduction ≤ ₹25,000 or 1/3rd
  if (isNewRegime && I(OS.ded57iia) > 0 && I(OS.familyPension) > 0) {
    const maxNew = Math.min(Math.round(I(OS.familyPension) / 3), 25000);
    if (I(OS.ded57iia) > maxNew + 1) {
      errors.push(err(548, 'Schedule OS', 'ded57iia',
        `Deduction u/s 57(iia) under New Regime (₹${I(OS.ded57iia).toLocaleString('en-IN')}) cannot exceed ₹${maxNew.toLocaleString('en-IN')} (1/3 of family pension or ₹25,000, whichever lower).`,
        `Reduce 57(iia) deduction to ₹${maxNew.toLocaleString('en-IN')}.`));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE VIA — DEDUCTIONS (Rules 634–825)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 646: Schedule 80G must be blank in new regime
  if (isNewRegime && isPos(VIA.sec80G)) {
    errors.push(err(646, 'Schedule VIA', 'sec80G',
      'Deduction u/s 80G cannot be claimed under the New Tax Regime.',
      'Remove Section 80G donation deductions — not available in new regime.'));
  }

  // Rule 652: Schedule 80GGA must be blank in new regime
  if (isNewRegime && isPos(VIA.sec80GGA)) {
    errors.push(err(652, 'Schedule VIA', 'sec80GGA',
      'Deduction u/s 80GGA cannot be claimed under the New Tax Regime.',
      'Remove Section 80GGA deductions — not available in new regime.'));
  }

  // Rule 635: 80G donation in cash ≤ ₹2,000 per donee PAN
  if (d.schedule80G?.entries) {
    d.schedule80G.entries.forEach(entry => {
      if (I(entry.donationCash) > 2000) {
        errors.push(err(635, 'Schedule 80G', 'donationCash',
          `Cash donation of ₹${I(entry.donationCash).toLocaleString('en-IN')} to donee PAN ${entry.doneePAN} exceeds the ₹2,000 cash limit for 80G deduction.`,
          'Donations above ₹2,000 must be made by account payee cheque, DD, or electronic transfer to qualify for 80G deduction.'));
      }
    });
  }

  // Rule 648: PAN of donee mandatory for 80G donations
  if (d.schedule80G?.entries) {
    d.schedule80G.entries.forEach((entry, i) => {
      if (I(entry.donationTotal) > 0 && isBlank(entry.doneePAN)) {
        errors.push(err(648, 'Schedule 80G', 'doneePAN',
          `Donee PAN is mandatory for row ${i+1} in Schedule 80G (donation amount: ₹${I(entry.donationTotal).toLocaleString('en-IN')}).`,
          'Enter the PAN of the donation recipient in Schedule 80G.'));
      }
    });
  }

  // Rule 670/671: 80DD deduction — fixed amounts
  if (isOld && I(VIA.sec80DD) > 0) {
    const isDependentWithDisability = VIA.disabilityType === 'disability';
    const isDependentSevere = VIA.disabilityType === 'severe';
    if (isDependentWithDisability && I(VIA.sec80DD) !== 75000) {
      errors.push(err(670, 'Schedule VIA', 'sec80DD',
        'Deduction u/s 80DD for dependent with disability must be exactly ₹75,000 (not more, not less).',
        'Set 80DD deduction to exactly ₹75,000 for dependent with disability.'));
    }
    if (isDependentSevere && I(VIA.sec80DD) !== 125000) {
      errors.push(err(671, 'Schedule VIA', 'sec80DD',
        'Deduction u/s 80DD for dependent with severe disability must be exactly ₹1,25,000.',
        'Set 80DD deduction to exactly ₹1,25,000 for severe disability.'));
    }
  }

  // Rule 676/678: 80U deduction — fixed amounts
  if (isOld && I(VIA.sec80U) > 0) {
    if (VIA.selfDisabilityType === 'disability' && I(VIA.sec80U) !== 75000) {
      errors.push(err(676, 'Schedule VIA', 'sec80U',
        'Deduction u/s 80U for self with disability must be exactly ₹75,000.',
        'Set 80U deduction to exactly ₹75,000.'));
    }
    if (VIA.selfDisabilityType === 'severe' && I(VIA.sec80U) !== 125000) {
      errors.push(err(678, 'Schedule VIA', 'sec80U',
        'Deduction u/s 80U for self with severe disability must be exactly ₹1,25,000.',
        'Set 80U deduction to exactly ₹1,25,000.'));
    }
  }

  // Rule 750: 80C + 80CCC + 80CCD(1) ≤ ₹1,50,000 (old regime)
  if (isOld) {
    const combined = I(VIA.sec80C) + I(VIA.sec80CCC) + I(VIA.sec80CCD1);
    if (combined > 150000) {
      errors.push(err(750, 'Schedule VIA', 'combined80C',
        `Combined deduction u/s 80C + 80CCC + 80CCD(1) (₹${combined.toLocaleString('en-IN')}) cannot exceed ₹1,50,000.`,
        `Reduce combined 80C/80CCC/80CCD(1) deductions to ₹1,50,000.`));
    }
  }

  // Rule 754: 80CCD(2) > 10% of salary for private employers
  if (I(VIA.sec80CCD2) > 0 && !['CG','SG'].includes(S.employerCategory)) {
    const maxCCD2 = Math.round(I(S.basicSalaryForCCD2 || S.basicSalary || 0) * 0.10);
    if (I(VIA.sec80CCD2) > maxCCD2) {
      errors.push(err(754, 'Schedule VIA', 'sec80CCD2',
        `Deduction u/s 80CCD(2) (₹${I(VIA.sec80CCD2).toLocaleString('en-IN')}) cannot exceed 10% of salary (₹${maxCCD2.toLocaleString('en-IN')}) for non-Govt employers in old regime.`,
        `Cap 80CCD(2) employer NPS contribution at ₹${maxCCD2.toLocaleString('en-IN')}.`));
    }
  }

  // New regime: 80CCD(2) ≤ 14% of basic + DA
  if (isNewRegime && I(VIA.sec80CCD2) > 0) {
    const basicDA = I(S.basicSalary || 0) + I(S.da || 0);
    const max14pct = Math.round(basicDA * 0.14);
    if (I(VIA.sec80CCD2) > max14pct) {
      errors.push(err(797, 'Schedule VIA', 'sec80CCD2',
        `Under New Tax Regime, 80CCD(2) cannot exceed 14% of basic salary + DA (₹${max14pct.toLocaleString('en-IN')}).`,
        `Cap employer NPS contribution at ₹${max14pct.toLocaleString('en-IN')} (14% of basic + DA).`));
    }
  }

  // Rule 755: 80CCD(2) cannot be claimed by HUF
  if (isHUF && I(VIA.sec80CCD2) > 0) {
    errors.push(err(755, 'Schedule VIA', 'sec80CCD2',
      'Deduction u/s 80CCD(2) cannot be claimed by HUF.',
      'Remove 80CCD(2) employer NPS contribution — only individuals can claim this.'));
  }

  // Rule 767: 80CCD(1B) max ₹50,000 (old regime)
  if (isOld && I(VIA.sec80CCD1B) > 50000) {
    errors.push(err(767, 'Schedule VIA', 'sec80CCD1B',
      'Maximum deduction under Section 80CCD(1B) is ₹50,000.',
      'Cap 80CCD(1B) additional NPS deduction at ₹50,000.'));
  }

  // Rule 771: 80TTA max ₹10,000 (old regime only)
  if (isOld && I(VIA.sec80TTA) > 10000) {
    errors.push(err(771, 'Schedule VIA', 'sec80TTA',
      'Maximum deduction under Section 80TTA is ₹10,000.',
      'Cap 80TTA savings bank interest deduction at ₹10,000.'));
  }

  // Rule 763: 80TTA cannot be claimed by senior citizens
  const isSenior = ['60-80', '>80'].includes(A.ageGroup || kyc.ageGroup);
  if (isSenior && I(VIA.sec80TTA) > 0) {
    errors.push(err(763, 'Schedule VIA', 'sec80TTA',
      'Deduction u/s 80TTA cannot be claimed by senior citizens (60 years or above). Senior citizens should claim 80TTB instead.',
      'Replace 80TTA with 80TTB for senior citizens.'));
  }

  // Rule 772: 80TTB max ₹50,000
  if (I(VIA.sec80TTB) > 50000) {
    errors.push(err(772, 'Schedule VIA', 'sec80TTB',
      'Maximum deduction under Section 80TTB is ₹50,000.',
      'Cap 80TTB interest deduction at ₹50,000.'));
  }

  // Rule 764: 80TTB only for resident senior citizens
  if (I(VIA.sec80TTB) > 0 && !isSenior) {
    errors.push(err(764, 'Schedule VIA', 'sec80TTB',
      'Deduction u/s 80TTB is available only to resident senior citizens (60 years or above).',
      'Non-senior citizens cannot claim 80TTB. Use 80TTA instead if eligible.'));
  }

  // Rule 792: New regime — most Chapter VI-A deductions cannot be claimed
  if (isNewRegime) {
    const blockedNewRegime = [
      { key: 'sec80C', label: '80C' }, { key: 'sec80CCC', label: '80CCC' },
      { key: 'sec80CCD1', label: '80CCD(1)' }, { key: 'sec80CCD1B', label: '80CCD(1B)' },
      { key: 'sec80D', label: '80D' }, { key: 'sec80DD', label: '80DD' },
      { key: 'sec80DDB', label: '80DDB' }, { key: 'sec80E', label: '80E' },
      { key: 'sec80EE', label: '80EE' }, { key: 'sec80EEA', label: '80EEA' },
      { key: 'sec80EEB', label: '80EEB' }, { key: 'sec80GG', label: '80GG' },
      { key: 'sec80GGA', label: '80GGA' }, { key: 'sec80TTA', label: '80TTA' },
      { key: 'sec80U', label: '80U' },
    ];
    blockedNewRegime.forEach(({ key, label }) => {
      if (isPos(VIA[key])) {
        errors.push(err(792, 'Schedule VIA', key,
          `Deduction u/s ${label} cannot be claimed under the New Tax Regime.`,
          `Remove Section ${label} — switch to Old Tax Regime to claim this deduction.`));
      }
    });
  }

  // Rule 789: Total VIA deductions = sum of individual deductions
  if (VIA.totalDeductions !== undefined) {
    const components = [
      VIA.sec80C, VIA.sec80CCC, VIA.sec80CCD1, VIA.sec80CCD1B, VIA.sec80CCD2,
      VIA.sec80D, VIA.sec80DD, VIA.sec80DDB, VIA.sec80E, VIA.sec80EE,
      VIA.sec80EEA, VIA.sec80EEB, VIA.sec80G, VIA.sec80GG, VIA.sec80GGA,
      VIA.sec80GGC, VIA.sec80TTA, VIA.sec80TTB, VIA.sec80U, VIA.sec80CCH,
      VIA.sec80QQB, VIA.sec80RRB,
    ];
    const expected = components.reduce((sum, v) => sum + I(v), 0);
    if (Math.abs(I(VIA.totalDeductions) - expected) > 2) {
      errors.push(err(789, 'Schedule VIA', 'totalDeductions',
        `Total Chapter VI-A deductions (₹${I(VIA.totalDeductions).toLocaleString('en-IN')}) does not match sum of individual deductions (₹${expected.toLocaleString('en-IN')}).`,
        'Recalculate total deductions — it must equal the sum of all individual deduction amounts.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PART B-TI (Rules 913–949)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 919: GTI = sum of all head incomes
  if (BTI.grossTotalIncome !== undefined) {
    const expected = I(BTI.salaryIncome) + I(BTI.hpIncome) + I(BTI.pgbpIncome) + I(BTI.cgIncome) + I(BTI.osIncome);
    if (Math.abs(I(BTI.grossTotalIncome) - expected) > 5) {
      errors.push(err(919, 'Part B-TI', 'grossTotalIncome',
        `Gross Total Income (₹${I(BTI.grossTotalIncome).toLocaleString('en-IN')}) does not equal sum of all head incomes (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute GTI as: Salary + HP + PGBP + Capital Gains + Other Sources.'));
    }
  }

  // Rule 935: Total Income = GTI − Chapter VI-A (with ±5 rounding tolerance)
  if (BTI.totalIncome !== undefined && BTI.grossTotalIncome !== undefined) {
    const expected = I(BTI.grossTotalIncome) - I(BTI.chapterVIADeductions);
    if (Math.abs(I(BTI.totalIncome) - expected) > 5) {
      errors.push(err(935, 'Part B-TI', 'totalIncome',
        `Total Income (₹${I(BTI.totalIncome).toLocaleString('en-IN')}) must equal GTI minus Chapter VI-A deductions (₹${expected.toLocaleString('en-IN')}). Rounding of ±5 allowed.`,
        'Recompute Total Income = GTI − Chapter VI-A Deductions.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PART B-TTI (Rules 957–989)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 957: Old regime — rebate u/s 87A ≤ ₹12,500
  if (isOld && I(TTI.rebate87A) > 12500) {
    errors.push(err(957, 'Part B-TTI', 'rebate87A',
      'Rebate u/s 87A cannot exceed ₹12,500 under the Old Tax Regime.',
      'Cap 87A rebate at ₹12,500.'));
  }

  // Rule 973/974: Rebate 87A only for resident individuals
  if (I(TTI.rebate87A) > 0) {
    if (isHUF) {
      errors.push(err(974, 'Part B-TTI', 'rebate87A',
        'Rebate u/s 87A is not available to HUF.',
        'Remove 87A rebate — available only to individual taxpayers.'));
    }
    if (isNR) {
      errors.push(err(973, 'Part B-TTI', 'rebate87A',
        'Rebate u/s 87A is not available to Non-Residents.',
        'Remove 87A rebate — available only to resident individuals.'));
    }
  }

  // Rule 975: Old regime — 87A not available if total income > ₹5L
  if (isOld && I(BTI.totalIncome) > 500000 && I(TTI.rebate87A) > 0) {
    errors.push(err(975, 'Part B-TTI', 'rebate87A',
      'Rebate u/s 87A cannot be claimed under Old Tax Regime when Total Income exceeds ₹5,00,000.',
      'Remove 87A rebate — total income exceeds the ₹5 lakh threshold.'));
  }

  // Rule 988: New regime — 87A not available if total income > ₹12L
  if (isNewRegime && I(BTI.totalIncome) > 1200000 && I(TTI.rebate87A) > 0) {
    warnings.push(warn(988, 'Part B-TTI', 'rebate87A',
      `Total income (₹${I(BTI.totalIncome).toLocaleString('en-IN')}) exceeds ₹12,00,000 — check if 87A rebate is correctly computed with marginal relief. Income above ₹12,70,590 cannot claim any rebate.`,
      'Recompute 87A rebate with marginal relief provisions for income between ₹12L and ₹12.7L.'));
  }

  // Rule 965: Gross Tax Liability = Tax Payable + Surcharge + Cess
  if (TTI.grossTaxLiability !== undefined) {
    const expected = I(TTI.taxPayable) + I(TTI.surcharge) + I(TTI.educationCess);
    if (I(TTI.grossTaxLiability) !== expected) {
      errors.push(err(965, 'Part B-TTI', 'grossTaxLiability',
        `Gross Tax Liability (₹${I(TTI.grossTaxLiability).toLocaleString('en-IN')}) must equal Tax Payable + Surcharge + Education Cess (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute gross tax liability.'));
    }
  }

  // Rule 970: Aggregate Liability = Net Tax Liability + Total Interest & Fees
  if (TTI.aggregateLiability !== undefined) {
    const expected = I(TTI.netTaxLiability) + I(TTI.totalInterestFees);
    if (I(TTI.aggregateLiability) !== expected) {
      errors.push(err(970, 'Part B-TTI', 'aggregateLiability',
        `Aggregate Liability (₹${I(TTI.aggregateLiability).toLocaleString('en-IN')}) must equal Net Tax Liability + Total Interest/Fees (₹${expected.toLocaleString('en-IN')}).`,
        'Recompute aggregate tax liability.'));
    }
  }

  // Rule 976: Refund = Total Taxes Paid − Aggregate Liability
  if (TTI.refund !== undefined && TTI.totalTaxesPaid !== undefined && TTI.aggregateLiability !== undefined) {
    const expectedRefund = Math.max(0, I(TTI.totalTaxesPaid) - I(TTI.aggregateLiability));
    if (I(TTI.refund) !== expectedRefund) {
      errors.push(err(976, 'Part B-TTI', 'refund',
        `Refund (₹${I(TTI.refund).toLocaleString('en-IN')}) must equal Total Taxes Paid minus Aggregate Liability (₹${expectedRefund.toLocaleString('en-IN')}).`,
        'Recompute refund amount.'));
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE AL (Rule 905)
  // ───────────────────────────────────────────────────────────────────────

  if (I(BTI.totalIncome) > 10000000 && (!AL || Object.keys(AL).length === 0)) {
    errors.push(err(905, 'Schedule AL', 'scheduleAL',
      'Schedule AL (Assets and Liabilities) must be filled when Total Income exceeds ₹1 crore.',
      'Fill Schedule AL with details of all assets and liabilities as on 31 March 2026.'));
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE FA (Rule 901/902)
  // ───────────────────────────────────────────────────────────────────────
  if (TTI.foreignAssets === 'Y' && (!FA || Object.keys(FA).length === 0)) {
    errors.push(err(901, 'Schedule FA', 'scheduleFA',
      'Schedule FA (Foreign Assets) must be filled when "Yes" is answered for foreign assets at Sl.No.14 of Part B-TTI.',
      'Fill Schedule FA with all details of foreign bank accounts, assets, and income.'));
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE AMT (Rules 829–848)
  // ───────────────────────────────────────────────────────────────────────

  // Rule 836: Schedule AMT must be blank in new regime
  if (isNewRegime && AMT.adjustedTotalIncome !== undefined && isPos(AMT.adjustedTotalIncome)) {
    errors.push(err(836, 'Schedule AMT', 'adjustedTotalIncome',
      'Schedule AMT should be blank when New Tax Regime is selected.',
      'Clear Schedule AMT — AMT does not apply under the New Tax Regime.'));
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHEDULE VDA (Rules 501–504)
  // ───────────────────────────────────────────────────────────────────────
  if (d.scheduleVDA) {
    (d.scheduleVDA.entries || []).forEach((entry, i) => {
      if (I(entry.income) !== I(entry.saleConsideration) - I(entry.costOfAcquisition)) {
        errors.push(err(501, 'Schedule VDA', `entry_${i}_income`,
          `VDA Row ${i+1}: Income (₹${I(entry.income).toLocaleString('en-IN')}) must equal Sale Consideration minus Cost of Acquisition (₹${(I(entry.saleConsideration) - I(entry.costOfAcquisition)).toLocaleString('en-IN')}).`,
          'Recompute VDA income as Sale Consideration − Cost of Acquisition.'));
      }
      // Rule 504: Date cannot be after 31 March 2026
      if (entry.acquisitionDate && new Date(entry.acquisitionDate) > new Date('2026-03-31')) {
        errors.push(err(504, 'Schedule VDA', `entry_${i}_acquisitionDate`,
          `VDA Row ${i+1}: Date of Acquisition cannot be after 31 March 2026.`,
          'Enter the correct acquisition date within FY 2025-26.'));
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY B — WARNINGS (upload allowed, notice/defect risk)
  // ═══════════════════════════════════════════════════════════════════════

  // B-Rule 2: Loss carry forward not allowed if filed after due date (except HP)
  if (A.returnFiledAfterDueDate === 'Y') {
    if (I(CFL.businessLoss) > 0 || I(CFL.stcLoss) > 0 || I(CFL.ltcLoss) > 0 || I(CFL.osLoss) > 0) {
      warnings.push(warn('B-2', 'Schedule CFL', 'lossCarryForward',
        'Return filed after due date — current year losses (except HP loss) cannot be carried forward.',
        'Losses other than house property loss must be forfeited if the return is filed after the due date.'));
    }
  }

  // B-Rule 3: Income > ₹2.5L from business — Balance Sheet should be filled
  if (I(BP.totalBusinessProfession) > 250000 && (!BS || Object.keys(BS).length === 0)) {
    warnings.push(warn('B-3', 'Part A BS', 'balanceSheet',
      'Business income exceeds ₹2.5 lakh — Balance Sheet should be filled in Part A.',
      'Fill Part A Balance Sheet — required under explanation (d) to Section 139(9) read with Section 44AA.'));
  }

  // B-Rule 6: Turnover > ₹10 crore → audit u/s 44AB
  if (I(BP.grossTurnover) > 100000000 && A.liableForAudit44AB !== 'Y') {
    warnings.push(warn('B-6', 'Part A Trading Account', 'grossTurnover',
      'Turnover exceeds ₹10 crore — assessee is liable for tax audit u/s 44AB.',
      'Enable audit u/s 44AB and fill auditor details.'));
  }

  // B-Rule 9: Audit liability → Form 3CA-3CD or 3CB-3CD must be filed
  if (A.liableForAudit44AB === 'Y' && !A.auditReportAcknNo) {
    warnings.push(warn('B-9', 'Part A General', 'auditReportAcknNo',
      'Assessee is liable for audit u/s 44AB — Form 3CA-3CD/3CB-3CD must be filed separately.',
      'File Form 3CA-3CD (if accounts required) or 3CB-3CD (if not required) before or along with ITR-3.'));
  }

  // B-Rule 22: PAN-Aadhaar linking required
  if (!kyc.panAadhaarLinked) {
    warnings.push(warn('B-22', 'Part A General', 'panAadhaarLinked',
      'PAN-Aadhaar linking is required. Unlinked PAN may attract consequences as per Circular 03/2023.',
      'Link PAN and Aadhaar at the Income Tax e-filing portal before submitting the return.'));
  }

  // B-Rule 28: VDA income — TDS was deducted but income not offered to tax
  if (d.tds2Entries?.some(t => t.section === '194S') && !d.scheduleVDA?.entries?.length) {
    warnings.push(warn('B-28', 'Schedule VDA', 'vdaIncome',
      'TDS has been deducted on VDA (crypto/digital asset) income under Section 194S but no VDA income has been declared.',
      'Declare VDA income in Schedule VDA with details of each transaction.'));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CATEGORY D — ADVISORIES (upload allowed, deduction may be disallowed)
  // ═══════════════════════════════════════════════════════════════════════

  // D-Rule 1: AMT > normal tax → Form 29C must be filed
  if (!isNewRegime && I(AMT.taxPayable115JC) > I(TTI.normalTaxPayable)) {
    advisories.push(advisory('D-1', 'Schedule AMT', 'form29C',
      'AMT under Section 115JC is more than normal tax — Form 29C must be filed.',
      'File Form 29C (Audit Report under Section 115JC) with a Chartered Accountant.'));
  }

  // D-Rule 3: 80JJAA claimed → Form 10DA required
  if (I(VIA.sec80JJAA) > 0) {
    advisories.push(advisory('D-3', 'Schedule VIA', 'sec80JJAA',
      'Deduction u/s 80JJAA claimed — Form 10DA (Report from auditor) must be filed.',
      'File Form 10DA along with the ITR to substantiate the 80JJAA deduction.'));
  }

  // D-Rule 4: Part C deductions only if return filed within due date
  if (A.returnFiledAfterDueDate === 'Y') {
    const partCDeductions = I(VIA.partCTotal);
    if (partCDeductions > 0) {
      advisories.push(advisory('D-4', 'Schedule VIA', 'partCDeductions',
        'Chapter VI-A Part C deductions (80-IA, 80-IB, etc.) can only be claimed if the original return is filed on or before the due date.',
        'Verify that the return is being filed within the due date to claim Part C deductions.'));
    }
  }

  // D-Rule 5: Claiming 90/91 relief → Form 67 must be filed within due date
  if (I(TTI.reliefUs90) > 0 || I(TTI.reliefUs91) > 0) {
    advisories.push(advisory('D-5', 'Part B-TTI', 'foreignTaxRelief',
      'Relief u/s 90/91 (foreign tax credit) claimed — Form 67 must be filed within the due date allowed u/s 139(1).',
      'File Form 67 on the e-filing portal before the return due date to claim foreign tax credit.'));
  }

  // D-Rule 6: 10AA deduction → Form 56F required
  if (I(BTI.deduction10AA) > 0) {
    advisories.push(advisory('D-6', 'Part B-TI', 'deduction10AA',
      'Deduction u/s 10AA claimed — Form 56F (Audit Report for SEZ units) must be filed.',
      'File Form 56F through your CA to support the Section 10AA deduction.'));
  }

  // D-Rule 8: Goods carriage tonnage cannot exceed 100MT per vehicle
  if (BP.goods44AE?.vehicles) {
    BP.goods44AE.vehicles.forEach((v, i) => {
      if (I(v.tonnage) > 100) {
        advisories.push(advisory('D-8', 'Part A P&L', `vehicle_${i}`,
          `Vehicle ${i+1}: Tonnage capacity (${I(v.tonnage)} MT) cannot exceed 100 MT.`,
          'Enter correct tonnage capacity. Maximum is 100 MT per goods carriage vehicle.'));
      }
    });
  }

  // D-Rule 12: AMT liable → Form 29C should be filed
  if (!isNewRegime && isPos(TTI.taxPayable115JC)) {
    advisories.push(advisory('D-12', 'Schedule AMT', 'form29C',
      'Liability to pay AMT u/s 115JC — Form 29C should be filed separately.',
      'Get Form 29C signed by a Chartered Accountant and upload it on the e-filing portal.'));
  }

  // D-Rule 14: Relief u/s 89 → Form 10E must be filed
  if (I(TTI.reliefUs89) > 0) {
    advisories.push(advisory('D-14', 'Part B-TTI', 'reliefUs89',
      'Relief u/s 89 (arrear salary) claimed — Form 10E must be filed before the ITR.',
      'File Form 10E on the Income Tax portal before filing this return. Relief may be disallowed otherwise.'));
  }

  // D-Rule 15: Total sales > ₹50 crore → Section 269SU payment modes
  if (I(BP.grossTurnover) > 500000000) {
    advisories.push(advisory('D-15', 'Part A General', 'prescribedPaymentModes',
      'Total sales/turnover exceeds ₹50 crore — details of prescribed payment modes under Section 269SU must be provided in the Compliance Module of the e-filing portal.',
      'Log in to the e-filing portal and fill in the Compliance Module for Section 269SU.'));
  }

  return { errors, warnings, advisories };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT: Summary helper
// ═══════════════════════════════════════════════════════════════════════════
export function getValidationSummary(itr3Data) {
  const { errors, warnings, advisories } = validateITR3(itr3Data);
  return {
    isReadyToFile: errors.length === 0,
    blockingErrors: errors.length,
    softWarnings: warnings.length,
    advisoryCount: advisories.length,
    errors,
    warnings,
    advisories,
    totalIssues: errors.length + warnings.length + advisories.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT: Check a specific section only
// ═══════════════════════════════════════════════════════════════════════════
export function validateSection(itr3Data, section) {
  const { errors, warnings, advisories } = validateITR3(itr3Data);
  const all = [...errors, ...warnings, ...advisories];
  return all.filter(r => r.schedule?.toLowerCase().includes(section.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT: Pre-flight check — call before generateITRJson for ITR-3
// Returns only Category A errors (blocking). Use before download/submission.
// ═══════════════════════════════════════════════════════════════════════════
export function preFlightITR3(itr3Data) {
  const { errors } = validateITR3(itr3Data);
  if (errors.length > 0) {
    const errorSummary = errors.map(e => `[Rule ${e.ruleNo}] ${e.schedule}: ${e.message}`).join('\n');
    throw new Error(`ITR-3 has ${errors.length} blocking error(s) that will cause portal rejection:\n${errorSummary}`);
  }
  return true;
}
