// src/lib/completenessCheck.js
// Central completeness engine — runs on any return and produces structured hints
// Used by: CAReturnEditor, CADashboard, ClientReturnManager, TaxChat
// Every hint has: { id, severity, target, title, detail, ruleRef, forCA, forClient }
// severity: 'block' (will reject at portal) | 'warn' (risk of rejection) | 'info' (advisory)
// target: 'ca' | 'client' | 'both'

import { cgGain } from '../data/flow.js';

// ─── Master check list ────────────────────────────────────────────────────────
export function checkReturnCompleteness(comp, kycData, itrForm, challans = [], tds2Entries = []) {
  const hints = [];

  const c   = comp || {};
  const kyc = kycData || {};
  const isOld = c.betterRegime === 'old';
  const isSalaried = c.grossSalary > 0;
  const isBusiness = c.businessIncome > 0;
  const hasCG = c.capitalGains?.enabled;
  const hasHP = c.houseProperty?.enabled;
  const isSenior = c.ageGroup === '60-80' || c.ageGroup === '>80';
  const grossTotal = c.grossTotal || c.grossTotalOld || 0;

  // ─── IDENTITY (both parties must act) ───────────────────────────────────────
  if (!kyc.pan || kyc.pan.length !== 10) {
    hints.push({ id:'kyc_pan', severity:'block', target:'both',
      title:'PAN missing or invalid',
      detail:'PAN is mandatory for ITR filing. The return cannot be submitted without a valid 10-character PAN.',
      ruleRef:'ITR-1 Rule A-19 / ITR-2 Rule 2',
      actionClient:'Go to Profile → KYC to enter your PAN.',
      actionCA:'Verify PAN from client\'s Form 16 or PAN card before proceeding.' });
  }
  if (!kyc.full_name?.trim()) {
    hints.push({ id:'kyc_name', severity:'block', target:'both',
      title:'Name not entered in KYC',
      detail:'The taxpayer name in the ITR must exactly match the name in the PAN database. A mismatch causes Category A rejection.',
      ruleRef:'ITR-1 Rule A-19 / ITR-2 Rule 2',
      actionClient:'Go to Profile → KYC to enter your full name exactly as on your PAN card.',
      actionCA:'Cross-check name against PAN card or Form 16 header.' });
  }
  if (!kyc.dob) {
    hints.push({ id:'kyc_dob', severity:'block', target:'both',
      title:'Date of birth missing',
      detail:'DOB determines age group (senior/super-senior), tax slabs, 80TTA vs 80TTB eligibility, and basic exemption limits.',
      ruleRef:'ITR-1 Rule A-13 / ITR-2 Rule 3',
      actionClient:'Go to Profile → KYC to enter your date of birth.',
      actionCA:'Verify from PAN card — DOB must match PAN database exactly.' });
  }
  if (!kyc.aadhaar && !kyc.aadhaar_last4) {
    hints.push({ id:'kyc_aadhaar', severity:'warn', target:'both',
      title:'Aadhaar not linked',
      detail:'Aadhaar quoting is mandatory u/s 139(AA). PAN-Aadhaar linking must be done to avoid penalty and return rejection.',
      ruleRef:'ITR-2 Category B Rule 23/24',
      actionClient:'Link your Aadhaar to PAN at incometax.gov.in → Aadhaar Linking.',
      actionCA:'Confirm client has completed PAN-Aadhaar linking before filing.' });
  }

  // ─── BANK ACCOUNT (blocks refund) ────────────────────────────────────────────
  const bankAccounts = c.bankAccounts || [];
  const hasValidBank = bankAccounts.some(b => b.BankAccountNo?.trim() && b.IFSCCode?.trim());
  if (!hasValidBank) {
    hints.push({ id:'bank_missing', severity:'block', target:'both',
      title:'Bank account for refund not entered',
      detail:'At least one bank account with account number and IFSC is required. Without this the ITR JSON fails pre-validation and refunds cannot be credited.',
      ruleRef:'ITR-1 Rule A-107',
      actionClient:'Enter your bank account details in the return.',
      actionCA:'Collect client\'s bank account number and IFSC code — get a cancelled cheque or bank passbook copy.' });
  } else {
    // IFSC format validation
    const badIFSC = bankAccounts.filter(b => b.IFSCCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.IFSCCode));
    if (badIFSC.length > 0) {
      hints.push({ id:'bank_ifsc_invalid', severity:'block', target:'ca',
        title:`Invalid IFSC code: ${badIFSC.map(b => b.IFSCCode).join(', ')}`,
        detail:'IFSC must be 11 characters: 4 letters (bank code), 0, then 6 alphanumeric characters. An invalid IFSC will cause portal pre-validation failure.',
        ruleRef:'ITR-1 Rule A-107 (IFSC must match RBI database)',
        actionCA:'Verify IFSC from the bank\'s passbook or cheque leaf. Common format: SBIN0001234.' });
    }
  }

  // ─── INCOME — SALARY ──────────────────────────────────────────────────────────
  if (isSalaried) {
    if (!c.employerTAN?.trim() && c.tdsDeducted > 0) {
      hints.push({ id:'salary_tan', severity:'block', target:'ca',
        title:'Employer TAN missing — required when salary TDS > 0',
        detail:'Schedule TDS1 requires the deductor\'s TAN. Portal validates TAN format (first 4 letters = city/state code). Missing TAN causes rejection.',
        ruleRef:'ITR-1 Rule A-100 / ITR-2 Rule 11',
        actionCA:'Obtain TAN from Form 16 Part A (top section). Format: XXXX00000X.' });
    }
    if (!c.employerName?.trim()) {
      hints.push({ id:'salary_empname', severity:'info', target:'ca',
        title:'Employer name not entered',
        detail:'Employer name is shown in Schedule TDS1 and the ITR acknowledgement.',
        actionCA:'Enter employer name as it appears on Form 16 (usually the legal company name).' });
    }
    if (c.tdsDeducted > (c.grossSalaryTotal || c.grossSalary || 0)) {
      hints.push({ id:'tds_exceeds_salary', severity:'block', target:'ca',
        title:'TDS on salary exceeds gross salary — portal rejection guaranteed',
        detail:'Schedule TDS1 TDS amount cannot exceed gross salary. This will cause Category B rejection at upload.',
        ruleRef:'ITR-2 Category B Rule 9',
        actionCA:'Cross-check TDS amount from Form 26AS and Form 16 Part A. TDS > salary is impossible and indicates a data entry error.' });
    }
    if (itrForm === 'ITR-2' && !c.perquisites && !c.profitsInLieu && c.grossSalaryTotal > c.grossSalary) {
      hints.push({ id:'salary_17_decomp', severity:'warn', target:'ca',
        title:'Salary 17(1)/17(2)/17(3) decomposition may be incomplete',
        detail:'ITR-2 requires breakdown of gross salary into s17(1) salary, s17(2) perquisites, and s17(3) profits in lieu. If client received ESOPs, car allowance, or gratuity, enter these separately.',
        ruleRef:'ITR-2 Rules 22-27, 32-34',
        actionCA:'Check Form 16 Part B for perquisites (Annex 1) and profits in lieu of salary breakdown.' });
    }
  }

  // ─── INCOME — BUSINESS/PROFESSIONAL ──────────────────────────────────────────
  if (isBusiness) {
    if (!c.bizTurnover || c.bizTurnover === 0) {
      hints.push({ id:'biz_turnover', severity:'block', target:'ca',
        title:'Business/professional turnover not entered',
        detail:'ITR-4 requires gross turnover for Schedule BP (44AD/44ADA presumptive computation). Without turnover the 6%/8%/50% income computation cannot proceed.',
        actionCA:'Enter gross receipts or turnover for the year. For 44AD: total receipts from business. For 44ADA: total gross receipts from profession.' });
    }
    if (itrForm === 'ITR-4') {
      const bsCols = [c.bsCapital, c.bsBank, c.bsCash, c.bsDebtors, c.bsCreditors];
      const missingBS = bsCols.every(v => !v || v === 0);
      if (missingBS) {
        hints.push({ id:'bs_missing', severity:'warn', target:'ca',
          title:'Balance sheet figures not entered — required for ITR-4',
          detail:'ITR-4 requires FinanclPartclrOfBusiness: capital, bank balance, cash, debtors, creditors as on 31 March 2026. Approximate figures are acceptable for presumptive filers.',
          actionCA:'Ask client for: (1) Net worth/capital account, (2) Bank balance on 31-Mar-2026, (3) Cash in hand, (4) Outstanding debtors, (5) Outstanding creditors.' });
      }
    }
  }

  // ─── INCOME — CAPITAL GAINS ───────────────────────────────────────────────────
  if (hasCG) {
    const stcg    = cgGain(c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a ||
                           c.capitalGains?.shares?.stcg111a_pre || c.capitalGains?.shares?.stcg111a_post);
    const ltcgEq  = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
    const ltcgProp= cgGain(c.capitalGains?.property?.ltcgDetail || c.capitalGains?.property?.ltcg);

    if (ltcgEq > 0) {
      const raw = c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a;
      const hasSaleValue = typeof raw === 'object' && raw?.saleValue > 0;
      if (!hasSaleValue) {
        hints.push({ id:'cg_112a_no_detail', severity:'block', target:'ca',
          title:'LTCG (Sec 112A) — sale value, cost, FMV needed for Schedule 112A',
          detail:'ITR-2 Schedule 112A requires per-transaction: quantity, sale price per unit, purchase cost, FMV as on 31-Jan-2018. A lump-sum gain figure alone is not sufficient — portal validates all column arithmetic.',
          ruleRef:'ITR-2 Rules 84-90',
          actionCA:'Obtain the capital gains statement from the broker (Zerodha Console → Tax P&L, Groww Tax Centre, CDSL/NSDL CAS statement). The CGCollector in TaxTalk can extract these from a broker PDF.' });
      }
    }

    if (ltcgProp > 0) {
      const raw = c.capitalGains?.property?.ltcgDetail;
      const hasSaleDate = typeof raw === 'object' && raw?.dateOfSale;
      if (!hasSaleDate) {
        hints.push({ id:'cg_prop_date', severity:'warn', target:'ca',
          title:'Property LTCG — sale date and purchase date required',
          detail:'Date of sale determines the applicable tax rate (12.5% post 23-Jul-2024; 20% with indexation for residents who acquired before 23-Jul-2024). Also required for holding period validation.',
          ruleRef:'ITR-2 Rules 182-185, 569-572',
          actionCA:'Obtain: (1) Sale deed date, (2) Original purchase deed date, (3) Sale value, (4) Indexed cost of acquisition for pre-2024 acquisitions, (5) Any 54EC bond investment for exemption.' });
      }
      if (ltcgProp > 5000000) {
        hints.push({ id:'cg_54ec_check', severity:'info', target:'ca',
          title:'Property LTCG > ₹50L — check if 54EC bonds invested',
          detail:'Capital gains from property sale can be exempted up to ₹50L under Sec 54EC by investing in NHAI/REC bonds within 6 months of sale. If client invested, deduct from LTCG before computing tax.',
          ruleRef:'ITR-2 Rule 591 (54EC max ₹50L)',
          actionCA:'Ask: "Did you invest in 54EC capital gains bonds (NHAI/REC)?" If yes, obtain bond certificate amount and investment date.' });
      }
    }

    if (hasCG && itrForm === 'ITR-1') {
      hints.push({ id:'cg_wrong_form', severity:'block', target:'ca',
        title:'Capital gains reported but ITR-1 selected — must use ITR-2',
        detail:'ITR-1 does not have a Schedule CG. Any capital gain (equity, MF, property) requires ITR-2 or higher. Filing ITR-1 with CG income will cause rejection.',
        ruleRef:'ITR-1 eligibility — no CG schedule',
        actionCA:'Switch ITR form to ITR-2 before generating JSON.' });
    }
  }

  // ─── INCOME — HOUSE PROPERTY ───────────────────────────────────────────────
  if (hasHP) {
    const hpType = c.houseProperty?.type;
    if (hpType === 'Rented' && !c.houseProperty?.rentReceived) {
      hints.push({ id:'hp_rent_zero', severity:'block', target:'ca',
        title:'Rented property — annual rent is zero',
        detail:'If property type is "Rented / Let out", gross rent received must be greater than zero. Portal validates this.',
        ruleRef:'ITR-1 Rule A-44/45',
        actionCA:'Enter the actual annual rent received. If property was vacant for part of the year, enter actual rent received (not lettable value).' });
    }
    if (hpType === 'Rented' && c.houseProperty?.municipalTaxes > (c.houseProperty?.rentReceived || 0)) {
      hints.push({ id:'hp_muni_exceeds', severity:'warn', target:'ca',
        title:'Municipal tax exceeds rent received',
        detail:'Annual value = Rent − Municipal tax. If municipal tax exceeds rent, annual value becomes negative, which is incorrect for rented property. Verify the figures.',
        actionCA:'Confirm municipal tax paid does not exceed gross rent. Check municipality receipt vs rent agreement.' });
    }
    if (c.houseProperty?.interestPaid > 200000 && hpType !== 'Rented') {
      hints.push({ id:'hp_interest_cap', severity:'block', target:'ca',
        title:'Home loan interest exceeds ₹2,00,000 cap for self-occupied',
        detail:'Sec 24(b) limits interest deduction to ₹2,00,000 for self-occupied property in old regime. In new regime, self-occupied interest = ₹0.',
        ruleRef:'ITR-1 Rule A-48, ITR-2 Rule 72',
        actionCA:'Cap interest at ₹2,00,000 for old regime self-occupied. For new regime, set to ₹0.' });
    }
  }

  // ─── DEDUCTIONS ───────────────────────────────────────────────────────────────
  if (isOld) {
    // 80C+80CCD(1) combined cap
    const combined80 = (c.cap80C || 0) + (c.cap80CCD1 || 0);
    if (combined80 > 150000) {
      hints.push({ id:'ded_80c_cap', severity:'block', target:'ca',
        title:'80C + 80CCD(1) exceeds ₹1,50,000 combined cap',
        detail:'The combined limit for 80C + 80CCC + 80CCD(1) is ₹1,50,000. Excess claimed will be rejected at portal.',
        ruleRef:'ITR-1 Rule A-1',
        actionCA:`Currently computed: 80C = ₹${(c.cap80C||0).toLocaleString('en-IN')}, 80CCD(1) = ₹${(c.cap80CCD1||0).toLocaleString('en-IN')}. Reduce one of them.` });
    }

    // 80TTA vs 80TTB
    if (isSenior && (c.cap80TTA || 0) > 0) {
      hints.push({ id:'ded_80tta_senior', severity:'block', target:'ca',
        title:'Senior citizen cannot claim 80TTA — should use 80TTB',
        detail:'80TTA is only for non-senior citizens. Senior citizens (60+ years) must use 80TTB which allows up to ₹50,000 on all interest income.',
        ruleRef:'ITR-1 Rule A-13',
        actionCA:'Remove 80TTA. Enter the interest income amount under 80TTB (max ₹50,000).' });
    }
    if (!isSenior && (c.cap80TTB || 0) > 0) {
      hints.push({ id:'ded_80ttb_nonsenior', severity:'block', target:'ca',
        title:'Non-senior citizen cannot claim 80TTB',
        detail:'80TTB is only for resident senior citizens aged 60 and above.',
        ruleRef:'ITR-1 Rule A-15',
        actionCA:'Remove 80TTB. Use 80TTA for savings bank interest (max ₹10,000).' });
    }

    // 80D — insurer details
    if ((c.cap80D || 0) > 0) {
      const hasInsurerDetails = c.schedule80DData?.insurers?.length > 0;
      if (!hasInsurerDetails) {
        hints.push({ id:'ded_80d_insurer', severity:'warn', target:'ca',
          title:'80D claimed — insurer name and policy number needed for compliant filing',
          detail:'Schedule 80D requires insurer name and policy number for each health insurance premium. Without these, the deduction may be disallowed.',
          ruleRef:'ITR-1 Rules A-256-259, ITR-2 Rules 611-618',
          actionCA:'Obtain the health insurance policy number and insurer name from the premium receipt. Enter via the 80D details section.' });
      }
      // 80D total cap
      if ((c.deductions80D || 0) > 100000) {
        hints.push({ id:'ded_80d_cap', severity:'block', target:'ca',
          title:'80D total exceeds ₹1,00,000 maximum limit',
          detail:'Combined 80D (self+family+parents) cannot exceed ₹1,00,000. Current entry exceeds this.',
          ruleRef:'ITR-1 Rule A-136, ITR-2 Rule 300',
          actionCA:`Reduce 80D to ₹1,00,000 or below. Current: ₹${(c.deductions80D||0).toLocaleString('en-IN')}.` });
      }
    }

    // 80G — donee details
    if ((c.cap80G || 0) > 0) {
      const hasDoneeDetails = c.schedule80GData?.donees?.length > 0;
      if (!hasDoneeDetails) {
        hints.push({ id:'ded_80g_donee', severity:'block', target:'ca',
          title:'80G claimed — donee details (PAN, name, amount) required',
          detail:'Schedule 80G requires PAN, name, address, and donation amount for each donee. Without per-donee detail, the deduction is disallowed and the portal shows Category A error.',
          ruleRef:'ITR-1 Rule A-8, ITR-2 Rules 277-290',
          actionClient:'Collect donation receipts for all charitable donations made during the year.',
          actionCA:'Enter donee details using the 80G schedule. Each donee needs PAN and donation split (cash vs other mode). Cash donations > ₹2,000 are ineligible.' });
      }
    }

    // 80E — loan details
    if ((c.cap80E || 0) > 0) {
      hints.push({ id:'ded_80e_loan', severity:'warn', target:'ca',
        title:'80E (education loan interest) — loan details needed',
        detail:'Schedule 80E requires the loan sanction year and lender details. Without these the deduction may not be accepted.',
        ruleRef:'ITR-2 Rule 623',
        actionCA:'Obtain loan sanction letter or bank certificate showing interest paid during FY 2025-26.' });
    }

    // Chapter VI-A > GTI
    if (grossTotal > 0 && (c.totalDeductionsOld || 0) > grossTotal) {
      hints.push({ id:'ded_exceeds_gti', severity:'block', target:'ca',
        title:'Total Chapter VI-A deductions exceed Gross Total Income',
        detail:'Deductions cannot exceed GTI. The excess will be rejected at the portal.',
        ruleRef:'ITR-1 Rule A-18, ITR-2 Rule 330',
        actionCA:`GTI = ₹${grossTotal.toLocaleString('en-IN')}, Total deductions = ₹${(c.totalDeductionsOld||0).toLocaleString('en-IN')}. Reduce deductions to match GTI.` });
    }
  }

  // New regime: no deductions (except 80CCD2)
  if (!isOld) {
    const hasDisallowedDed = (c.cap80C||0)+(c.cap80D||0)+(c.cap80E||0)+(c.cap80TTA||0)+(c.cap80G||0) > 0;
    if (hasDisallowedDed) {
      hints.push({ id:'new_regime_ded', severity:'block', target:'ca',
        title:'Deductions not allowed in new tax regime',
        detail:'80C, 80D, 80E, 80TTA, 80G etc. are zero in new regime. Only 80CCD(2) employer NPS is allowed.',
        ruleRef:'ITR-1 Rules A-146, 153-175',
        actionCA:'Switch to old regime if deductions are significant, OR set all disallowed deductions to ₹0 for new regime.' });
    }
  }

  // ─── TAXES PAID ────────────────────────────────────────────────────────────
  // TDS2 — if non-salary TDS is claimed but no entries
  if ((c.tdsNonSalary || 0) > 0 && tds2Entries.length === 0) {
    hints.push({ id:'tds2_no_entries', severity:'warn', target:'ca',
      title:'Non-salary TDS claimed but no TDS2 entries — deductor details needed',
      detail:'Portal validates Schedule TDS2: each deductor\'s TAN, gross income, TDS deducted, and TDS claimed must be entered separately. A lump-sum TDS amount without deductor detail may be rejected.',
      ruleRef:'ITR-1 Rules A-98-103, ITR-2 Rule 462-466',
      actionCA:'Obtain Form 26AS or AIS. Enter each non-salary TDS entry (bank, tenant, professional client) separately in Schedule TDS2 via the TDS2 Entries section.' });
  }

  // Advance tax paid but no challan detail
  const advTax = (c.advanceTax || 0) + (c.challanAdvance || 0);
  if (advTax > 0 && challans.filter(x => x.type === 'advance').length === 0) {
    hints.push({ id:'advance_tax_no_challan', severity:'warn', target:'ca',
      title:'Advance tax claimed but no challan details entered',
      detail:'Schedule IT requires BSR code, date, and challan serial number for each advance tax payment. Missing challan data may fail cross-validation with portal\'s challan register.',
      ruleRef:'ITR-1 Rule A-110',
      actionCA:'Obtain challan counterfoil or check IT portal challan status. Enter BSR code, date and serial number for each advance tax payment.' });
  }

  // Self-assessment tax challan
  const selfTax = (c.selfAssessment || 0) + (c.challanSelf || 0);
  if (selfTax > 0 && challans.filter(x => x.type === 'self').length === 0) {
    hints.push({ id:'self_assess_no_challan', severity:'warn', target:'ca',
      title:'Self-assessment tax claimed but challan details not entered',
      detail:'Schedule IT requires BSR code and date for self-assessment tax payments made after 31-Mar-2026.',
      ruleRef:'ITR-1 Rule A-111',
      actionCA:'Enter challan details (BSR, date, serial number) for self-assessment tax paid.' });
  }

  // Suspicious: balance due but no self-assessment tax
  const chosenTax = c.chosenTax || 0;
  const totalPaid = c.totalPaid || 0;
  const balanceDue = Math.max(0, chosenTax - totalPaid);
  if (balanceDue > 10000 && selfTax === 0) {
    hints.push({ id:'balance_due_unpaid', severity:'warn', target:'both',
      title:`Balance tax of ₹${balanceDue.toLocaleString('en-IN')} is unpaid`,
      detail:'Self-assessment tax must be paid before filing. Interest u/s 234B/234C will apply on unpaid tax. File return only after paying.',
      ruleRef:'Section 140A — self-assessment tax payment',
      actionClient:`Pay ₹${balanceDue.toLocaleString('en-IN')} at incometax.gov.in → e-Pay Tax before your CA files the return.`,
      actionCA:'Confirm client has paid self-assessment tax. Enter challan details once paid.' });
  }

  // ─── FORM/DOCUMENT-SPECIFIC ────────────────────────────────────────────────
  // ITR-2 specific
  if (itrForm === 'ITR-2') {
    // AMT check
    const taxable = isOld ? (c.oldTaxable || 0) : (c.newTaxable || 0);
    if (taxable > 2000000 && isOld) {
      hints.push({ id:'amt_check', severity:'info', target:'ca',
        title:'Income > ₹20L — verify AMT (Alternate Minimum Tax) u/s 115JC',
        detail:'AMT applies when Adjusted Total Income > ₹20L. If 80QQB or 80RRB deductions are claimed, they are added back for AMT computation. Tax payable = max(normal tax, AMT).',
        ruleRef:'ITR-2 Rule 428',
        actionCA:'Check if AMT > normal tax. If so, the higher of the two is the actual tax liability. Also check if Form 29C (report u/s 115JC) is required.' });
    }

    // Brought-forward losses
    if (c.has_bf_losses) {
      hints.push({ id:'bfla_needed', severity:'warn', target:'ca',
        title:'Client has prior year losses — Schedule BFLA/CFL needs to be populated',
        detail:'Prior year loss carry-forwards must be entered in Schedule CFL and set off in Schedule BFLA. The portal validates BFLA figures against CFL and CYLA.',
        ruleRef:'ITR-2 Rules 234-276',
        actionCA:'Obtain CFL details from the previous year\'s ITR acknowledgement. Enter brought-forward STCG/LTCG/HP losses in the BF Losses section.' });
    }

    // Foreign income
    if (c.has_foreign_income) {
      hints.push({ id:'fsi_needed', severity:'warn', target:'ca',
        title:'Foreign income indicated — Schedule FSI and TR required',
        detail:'Overseas income must be disclosed in Schedule FSI per country. DTAA relief requires Schedule TR and Form 67 (to be filed separately).',
        ruleRef:'ITR-2 Rules 442-455, Category B/D Rule 3',
        actionCA:'Obtain foreign tax payment receipts and TRC (Tax Residency Certificate) from client. File Form 67 separately before claiming DTAA relief.' });
    }

    // Schedule AL (assets/liabilities)
    if (taxable > 10000000) {
      hints.push({ id:'schedule_al', severity:'block', target:'ca',
        title:'Total income > ₹1 Crore — Schedule AL (Assets & Liabilities) is mandatory',
        detail:'Taxpayers with total income exceeding ₹1 Crore must disclose assets and liabilities in Schedule AL as on 31 March 2026.',
        ruleRef:'ITR-2 Rule 456',
        actionCA:'Collect: immovable property details, financial assets (shares, MF, FD), jewellery, vehicle, other assets, and corresponding liabilities.' });
    }
  }

  // ITR-3 partner warning
  if (itrForm === 'ITR-3') {
    hints.push({ id:'itr3_manual', severity:'block', target:'both',
      title:'Partnership firm return — ITR-3 requires manual CA preparation',
      detail:'TaxTalk does not auto-generate ITR-3. Partner returns require Schedule BP with interest/remuneration from firm, Schedule FSI, and often audit reports. This return must be prepared manually.',
      actionClient:'Please coordinate directly with your CA at RB Shah & Associates for partnership return filing.',
      actionCA:'Prepare ITR-3 manually using income tax utility software. Key items: share of profit (exempt), remuneration u/s 40(b), interest on capital.' });
  }

  // ─── SCORING ─────────────────────────────────────────────────────────────
  const score = computeScore(hints, c, kyc);

  return { hints, score };
}

// ─── Completeness score (0-100) ───────────────────────────────────────────────
function computeScore(hints, comp, kyc) {
  const blocks  = hints.filter(h => h.severity === 'block').length;
  const warns   = hints.filter(h => h.severity === 'warn').length;

  // Base: start from 100, deduct per issue
  let score = 100 - (blocks * 20) - (warns * 8);
  score = Math.max(0, Math.min(100, score));

  // Grade
  let grade, color;
  if (score >= 95 && blocks === 0) { grade = 'Ready to file'; color = '#16a34a'; }
  else if (score >= 75 && blocks === 0) { grade = 'Almost ready'; color = '#ca8a04'; }
  else if (blocks > 0) { grade = 'Incomplete — cannot file'; color = '#dc2626'; }
  else { grade = 'Needs attention'; color = '#ea580c'; }

  return { score, grade, color, blocks, warns };
}

// ─── Hint display helpers ──────────────────────────────────────────────────────
// Group hints by severity for display
export function groupHints(hints) {
  return {
    block: hints.filter(h => h.severity === 'block'),
    warn:  hints.filter(h => h.severity === 'warn'),
    info:  hints.filter(h => h.severity === 'info'),
  };
}

// Filter hints for a specific audience
export function hintsFor(hints, audience) {
  return hints.filter(h => h.target === audience || h.target === 'both');
}
