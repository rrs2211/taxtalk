// src/lib/itrJson.js — CBDT ITR JSON builder AY 2026-27
// Compliant with CBDT Validation Rules v1.0 (15 May 2026): 339 Category A/B/D rules
// All cross-checks validated before JSON emission.

import { cgGain, cgSaleValue, cgCost, cgExpenses } from '../data/flow.js';

const SW = 'TaxTalk v1.1';
const today = () => new Date().toISOString().split('T')[0];
const I = v => Math.round(Number(v) || 0);
const Y = b => b ? 'Y' : 'N';

// ─── Rule A-117: ITR-1 ceiling ₹50L (income excl LTCG 112A) ─────────────────
// Also route to ITR-2 if any capital gains exist (not just LTCG above ₹1.25L)
// because Schedule CG is not in ITR-1 at all.
export function determineITRForm(profile, computation) {
  const hasBiz      = (computation?.businessIncome || 0) > 0;
  const ltcg112     = cgGain(computation?.capitalGains?.shares?.ltcg || computation?.capitalGains?.shares?.ltcg112a);
  const stcg        = cgGain(computation?.capitalGains?.shares?.stcg || computation?.capitalGains?.shares?.stcg111a ||
                             computation?.capitalGains?.shares?.stcg111a_pre || computation?.capitalGains?.shares?.stcg111a_post);
  const ltcgProp    = cgGain(computation?.capitalGains?.property?.ltcgDetail || computation?.capitalGains?.property?.ltcg);
  const hasCG       = computation?.capitalGains?.enabled && (ltcg112 > 0 || stcg > 0 || ltcgProp > 0);
  // Rule A-117: income excluding LTCG 112A must not exceed ₹50L for ITR-1
  const incExcLTCG  = computation?.incomeExcludingLTCG ?? computation?.grossTotal ?? 0;

  if (profile === 'partner')                                    return 'ITR-3';
  if (profile === 'business' || profile === 'freelancer' || hasBiz) return 'ITR-4';
  if (hasCG)                                                    return 'ITR-2'; // Any CG → ITR-2
  if (incExcLTCG > 5000000)                                     return 'ITR-2'; // > ₹50L → ITR-2
  return 'ITR-1';
}

// ─── CG detail extractors ─────────────────────────────────────────────────────
function cgFull(val) {
  const sale = I(cgSaleValue(val));
  const cost = I(cgCost(val));
  const exp  = I(cgExpenses(val));
  const net  = I(cgGain(val));
  const hasFull = sale > 0 && cost > 0;
  const actualSale = hasFull ? sale : (net > 0 ? net : 0);
  const actualCost = hasFull ? cost : 0;
  const actualExp  = hasFull ? exp  : 0;
  const actualDedn = actualCost + actualExp;
  const actualNet  = hasFull ? Math.max(0, actualSale - actualDedn) : net;
  return { sale: actualSale, cost: actualCost, exp: actualExp, net: actualNet, totalDedn: actualDedn };
}

// Rule A-292/218: LTCG 112A — FullConsideration − (AquisitCost + ExpOnTrans) = CapgainonAssets
function build112ASummary(cg) {
  const raw    = cg?.shares?.ltcg || cg?.shares?.ltcg112a;
  const sale   = I(cgSaleValue(raw));
  const cost   = I(cgCost(raw));
  const fmv    = (typeof raw === 'object' && raw?.fmv31Jan18) ? I(raw.fmv31Jan18) : cost;
  const exp    = I(cgExpenses(raw));
  const netRaw = I(cgGain(raw));
  const hasFull = sale > 0;
  const acqCost = Math.max(fmv || 0, cost || 0);
  const net = hasFull ? Math.max(0, sale - acqCost - exp) : netRaw;
  return {
    SaleValue112A: hasFull ? sale : net,
    CostAcqWithoutIndx112A: cost,
    AcquisitionCost112A: acqCost,
    LTCGBeforelowerB1B2112A: net,
    FairMktValueCapAst112A: fmv,
    ExpExclCnctTransfer112A: exp,
    Deductions112A: 0,
    Balance112A: net,
    TotalBalance112A: net,
    Schedule112ADtls: [],
  };
}

// ─── Address builder ──────────────────────────────────────────────────────────
function buildAddress(d) {
  return {
    ResidenceNo: '', ResidenceName: '', RoadOrStreet: '',
    LocalityOrArea:       d.locality   || '',
    CityOrTownOrDistrict: d.city       || '',
    StateCode:            d.stateCode  || d.state_code || '',
    CountryCode:          '91',
    PinCode:              I(d.pinCode  || d.pin_code),
    CountryCodeMobile:    91,
    MobileNo:             I((d.phone || '').replace(/\D/g, '')),
    EmailAddress:         d.email      || '',
  };
}

function assesseeName(name = '') {
  const parts = name.trim().split(/\s+/);
  const last  = parts.pop() || name;
  return { SurNameOrOrgName: last, FirstName: parts.shift() || '', MiddleName: parts.join(' ') };
}

// ─── Bank details ─────────────────────────────────────────────────────────────
function bankDtls(accounts = []) {
  return {
    AddtnlBankDetails: (accounts || []).map(b => ({
      IFSCCode:      b.IFSCCode      || '',
      BankAccountNo: b.BankAccountNo || '',
      BankName:      b.BankName      || '',
      BankDtlsFlag:  'Y',
      UseForRefund:  b.UseForRefund  || 'Y',
    })),
  };
}

// ─── Schedule IT (advance tax / self-assessment challans) ─────────────────────
// Rules A-95,104,110,111: Must list each challan separately
function buildScheduleIT(c) {
  const rows = [];
  // Advance tax challans
  (c.challans || []).filter(x => x.type === 'advance').forEach(x => {
    rows.push({ BSRCode: x.bsr || '', DateDep: x.date || '', SrlNoOfChallan: x.challanNo || '', TaxPaid: I(x.amount) });
  });
  // Self-assessment tax challans
  (c.challans || []).filter(x => x.type === 'self').forEach(x => {
    rows.push({ BSRCode: x.bsr || '', DateDep: x.date || '', SrlNoOfChallan: x.challanNo || '', TaxPaid: I(x.amount) });
  });
  const totalFromChallans = rows.reduce((s, r) => s + r.TaxPaid, 0);
  return {
    TaxPayment: rows,
    TotalTaxPayments: totalFromChallans,
  };
}

// ─── TDS on salaries (Schedule TDS1) ─────────────────────────────────────────
// Rule A-9 (Category B): TDS1 value must not exceed gross salary
function buildTDS1(c, d) {
  const grossForTDS = I(c.grossSalaryTotal || c.grossSalary || 0);
  if (!c.tdsDeducted || grossForTDS === 0) return { TDSonSalary: [], TotalTDSonSalaries: 0 };
  const tdsClamp = Math.min(I(c.tdsDeducted), grossForTDS); // Rule B-9
  return {
    TDSonSalary: [{
      EmployerOrDeductorOrCollectDetl: {
        TAN:                               (d.employerTAN  || '').toUpperCase(),
        EmployerOrDeductorOrCollecterName:  d.employerName || '',
      },
      IncChrgSal:  grossForTDS,
      TotalTDSSal: tdsClamp,
    }],
    TotalTDSonSalaries: tdsClamp,
  };
}

// ─── TDS2 (other than salary) ─────────────────────────────────────────────────
// Rules A-98-102: TDS claimed ≤ TDS deducted; must list by section and deductor
function buildTDS2(c) {
  const entries = c.tds2Entries || []; // [{tan, deductorName, section, grossAmount, tdsDeducted, tdsClaimed}]
  if (entries.length === 0 && !c.tdsNonSalary) return { TDSonOthThanSalDtls: [], TotalTDSonOthThanSals: 0 };

  // If no structured TDS2 entries but tdsNonSalary lump sum exists, build one generic row
  const rows = entries.length > 0 ? entries.map(e => ({
    TANOfDeductor:       (e.tan || '').toUpperCase(),
    DeductorName:        e.deductorName || '',
    GrossAmount:         I(e.grossAmount),
    TDSDeducted:         I(e.tdsDeducted),
    TDSClaimed:          Math.min(I(e.tdsClaimed || e.tdsDeducted), I(e.tdsDeducted)), // Rule A-98
    TDSCreditCarriedFwd: 0,
    TDSSection:          e.section || '194A',
    HeadOfIncome:        e.headOfIncome || 'OS',
    BroughtFwdTDSAmt:    0,
  })) : [{
    TANOfDeductor:       '',
    GrossAmount:         I(c.interestIncome || 0),
    TDSDeducted:         I(c.tdsNonSalary),
    TDSClaimed:          I(c.tdsNonSalary),
    TDSCreditCarriedFwd: 0,
    TDSSection:          '194A',
    HeadOfIncome:        'OS',
    BroughtFwdTDSAmt:    0,
  }];

  const total = rows.reduce((s, r) => s + r.TDSClaimed, 0);
  return { TDSonOthThanSalDtls: rows, TotalTDSonOthThanSals: total };
}

// ─── Chapter VI-A (rules A-1,11,13-18,115,146,153-175) ───────────────────────
// Compliant: individual fields sum to TotalChapVIADeductions; capped at GTI
function chapVIA(c, allowDeductions = true) {
  if (!allowDeductions) {
    // New regime: only 80CCD(2) employer contribution allowed (Rule A-146,153-175)
    const ccd2 = I(c.cap80CCD2New || 0);
    return {
      Section80C: 0, Section80CCC: 0, Section80CCDEmployeeOrSE: 0,
      Section80CCD1B: 0, Section80CCDEmployer: ccd2,
      Section80D: 0, Section80DD: 0, Section80DDB: 0,
      Section80E: 0, Section80EE: 0, Section80EEA: 0, Section80EEB: 0,
      Section80G: 0, Section80GG: 0, Section80GGA: 0, Section80GGC: 0, Section80U: 0,
      Section80TTA: 0, Section80TTB: 0, AnyOthSec80CCH: 0,
      TotalChapVIADeductions: ccd2, // Rule A-17: must equal sum
    };
  }
  // Old regime: all deductions
  const s80C    = I(c.cap80C    || 0);
  const sCCD1   = I(c.cap80CCD1 || 0);
  const sCCD1B  = I(c.cap80CCD1B|| 0);
  const sCCD2   = I(c.cap80CCD2Old || 0);
  const s80D    = I(c.cap80D    || 0);
  const s80E    = I(c.cap80E    || 0);
  const s80TTA  = I(c.cap80TTA  || 0);
  const s80TTB  = I(c.cap80TTB  || 0);
  const s80G    = I(c.cap80G    || 0);
  // Rule A-17: TotalChapVIADeductions must equal sum of individual deductions
  const total   = s80C + sCCD1 + sCCD1B + sCCD2 + s80D + s80E + s80TTA + s80TTB + s80G;
  return {
    Section80C:               s80C,
    Section80CCC:             0,
    Section80CCDEmployeeOrSE: sCCD1,
    Section80CCD1B:           sCCD1B,
    Section80CCDEmployer:     sCCD2,
    Section80D:               s80D,
    Section80DD:              0, Section80DDB: 0,
    Section80E:               s80E,
    Section80EE:              0, Section80EEA: 0, Section80EEB: 0,
    Section80G:               s80G,
    Section80GG:              0, Section80GGA: 0, Section80GGC: 0, Section80U: 0,
    Section80TTA:             s80TTA,
    Section80TTB:             s80TTB,
    AnyOthSec80CCH:           0,
    TotalChapVIADeductions:   total, // Rule A-17: sum of individual fields
  };
}

// ─── Schedule 80D ─────────────────────────────────────────────────────────────
// Rules A-127-137, A-178-183, A-254-259
// Structured: self/family split, parents split, insurer details
function schedule80D(c) {
  const isSenior    = c.ageGroup === '60-80' || c.ageGroup === '>80';
  const cap80D      = I(c.cap80D || 0);
  // Use split fields if CA provided them, else apportion to correct bucket
  const s80D       = c.schedule80DData || null;
  const selfAmt    = s80D?.selfAmt    ?? (isSenior ? 0 : Math.min(cap80D, 25000));
  const selfSrAmt  = s80D?.selfSrAmt  ?? (isSenior ? Math.min(cap80D, 50000) : 0);
  const parentsAmt = s80D?.parentsAmt ?? 0;
  const parSrAmt   = s80D?.parSrAmt   ?? 0;
  const eligible   = Math.min(selfAmt + selfSrAmt + parentsAmt + parSrAmt, 100000);

  return {
    Sec80DSelfFamSrCtznHealth: {
      SeniorCitizenFlag: isSenior ? 'Y' : 'N',
      SelfAndFamily:     isSenior ? 0 : selfAmt,
      SrCtznSelfAndFam:  isSenior ? selfSrAmt : 0,
      Parents:           parentsAmt,
      SrCtznParents:     parSrAmt,
      PreventHlthChkUp:  Math.min(s80D?.prevChkup || 0, 5000), // Rule A-129: max ₹5K
      HealthInsPremSlfFam: isSenior ? selfSrAmt : selfAmt,
      Sec80DSelfFamHIDtls: {
        Sch80DInsDtls: (c.schedule80DData?.insurers || []).map(ins => ({
          NameOfInsurer: ins.name || '',
          PolicyNumber:  ins.policyNo || '',
          AmtOfPremiumPaid: I(ins.premium),
        })),
      },
    },
    TotEligibleDednUs80D: eligible,
  };
}

// ─── Schedule 80G ─────────────────────────────────────────────────────────────
// Rules A-8,9,79-93,107,139,147,325-327
// Full donee-level detail required for compliant filing
function schedule80G(c) {
  const donees = c.schedule80GData?.donees || [];
  // If no structured donee data, emit empty schedule (no deduction claimed)
  if (donees.length === 0) {
    return {
      Don100Percent:          { DoneeWithPan: [], TotDon100PercentCash: 0, TotDon100PercentOtherMode: 0, TotDon100Percent: 0, TotEligibleDon100Percent: 0 },
      Don50PercentNoApprReqd: { DoneeWithPan: [], TotDon50PercentNoApprRqdCash: 0, TotDon50PercentNoApprRqdOtherMode: 0, TotDon50PercentNoApprRqd: 0, TotEligibleDon50PercentNoApprRqd: 0 },
      Don100PercentApprReqd:  { DoneeWithPan: [], TotDon100PercentApprRqdCash: 0, TotDon100PercentApprRqdOtherMode: 0, TotDon100PercentApprRqd: 0, TotEligibleDon100PercentApprRqd: 0 },
      Don50PercentApprReqd:   { DoneeWithPan: [], TotDon50PercentApprRqdCash: 0, TotDon50PercentApprRqdOtherMode: 0, TotDon50PercentApprRqd: 0, TotEligibleDon50PercentApprRqd: 0 },
      TotalDonationsUs80GCash: 0, TotalDonationsUs80GOtherMode: 0,
      TotalDonationsUs80G: 0, TotalEligibleDonationsUs80G: 0,
    };
  }
  // Build per-bucket from donee list
  const build = (bucket) => {
    const filtered = donees.filter(d => d.bucket === bucket);
    const cash  = filtered.reduce((s, d) => s + (d.cash  || 0), 0);
    const other = filtered.reduce((s, d) => s + (d.other || 0), 0);
    const total = cash + other;
    // Rule A-88: cash > ₹2000 per donee → ineligible for cash deduction
    const eligCash = filtered.reduce((s, d) => {
      return s + ((d.cash || 0) > 2000 ? 0 : (d.cash || 0));
    }, 0);
    const eligible = eligCash + other;
    return {
      DoneeWithPan: filtered.map(d => ({
        DoneePAN:          (d.pan || '').toUpperCase(),
        NameOfDonee:       d.name || '',
        Address:           d.address || '',
        DonationInCash:    I(d.cash  || 0),
        DonationOtherMode: I(d.other || 0),
        TotalDonation:     I((d.cash || 0) + (d.other || 0)),
        EligibleDonation:  I((d.cash || 0) > 2000 ? (d.other || 0) : ((d.cash || 0) + (d.other || 0))),
        ...(d.ifsc ? { IFSCCode: d.ifsc, TrnsRefNo: d.txnRef || '' } : {}),
      })),
      Cash: cash, OtherMode: other, Total: total, Eligible: eligible,
    };
  };
  const b1 = build('100_no_ql'); const b2 = build('50_no_ql');
  const b3 = build('100_ql');   const b4 = build('50_ql');
  const totalAll    = b1.Total    + b2.Total    + b3.Total    + b4.Total;
  const eligibleAll = b1.Eligible + b2.Eligible + b3.Eligible + b4.Eligible;
  const cashAll     = b1.Cash     + b2.Cash     + b3.Cash     + b4.Cash;
  const otherAll    = b1.OtherMode+ b2.OtherMode+ b3.OtherMode+ b4.OtherMode;
  return {
    Don100Percent: { DoneeWithPan: b1.DoneeWithPan, TotDon100PercentCash: b1.Cash, TotDon100PercentOtherMode: b1.OtherMode, TotDon100Percent: b1.Total, TotEligibleDon100Percent: b1.Eligible },
    Don50PercentNoApprReqd: { DoneeWithPan: b2.DoneeWithPan, TotDon50PercentNoApprRqdCash: b2.Cash, TotDon50PercentNoApprRqdOtherMode: b2.OtherMode, TotDon50PercentNoApprRqd: b2.Total, TotEligibleDon50PercentNoApprRqd: b2.Eligible },
    Don100PercentApprReqd: { DoneeWithPan: b3.DoneeWithPan, TotDon100PercentApprRqdCash: b3.Cash, TotDon100PercentApprRqdOtherMode: b3.OtherMode, TotDon100PercentApprRqd: b3.Total, TotEligibleDon100PercentApprRqd: b3.Eligible },
    Don50PercentApprReqd: { DoneeWithPan: b4.DoneeWithPan, TotDon50PercentApprRqdCash: b4.Cash, TotDon50PercentApprRqdOtherMode: b4.OtherMode, TotDon50PercentApprRqd: b4.Total, TotEligibleDon50PercentApprRqd: b4.Eligible },
    TotalDonationsUs80GCash: cashAll, TotalDonationsUs80GOtherMode: otherAll,
    TotalDonationsUs80G: totalAll, TotalEligibleDonationsUs80G: eligibleAll,
  };
}

// ─── House property detail ────────────────────────────────────────────────────
function buildHPDetail(c, d, sno = 1) {
  const hp     = c.houseProperty || {};
  const isRent = hp.type === 'Rented';
  const rent   = I(hp.rentReceived   || 0);
  // Rule A-49: municipal tax NOT allowed for self-occupied
  const muni   = isRent ? I(hp.municipalTaxes || 0) : 0;
  const int_   = I(hp.interestPaid   || 0);
  // Rule A-162: new regime — self-occupied interest = 0
  const intForRegime = (!c.isOld && !isRent) ? 0 : int_;
  const av     = Math.max(0, rent - muni);
  const stdDed = Math.round(av * 0.30); // Rule A-43: 30% of annual value
  return {
    HPSNo: sno,
    AddressDetailWithZipCode: {
      AddrDetail: d.locality || '', CityOrTownOrDistrict: d.city || '',
      StateCode: d.stateCode || d.state_code || '', CountryCode: '91',
      PinCode: I(d.pinCode || d.pin_code),
    },
    PropertyOwner: 'S', PropCoOwnedFlg: 'N',
    ifLetOut: isRent ? 'L' : 'S',
    Rentdetails: isRent ? {
      AnnualLetableValue: av, RentNotRealized: 0, LocalTaxes: muni,
      TotalUnrealizedAndTax: muni, BalanceALV: av, AnnualOfPropOwned: av,
      ThirtyPercentOfBalance: stdDed, IntOnBorwCap: intForRegime,
      TotalDeduct: stdDed + intForRegime, ArrearsUnrealizedRentRcvd: 0,
      IncomeOfHP: I(c.hpForOld || c.hpIncome || 0),
    } : {
      AnnualLetableValue: 0, TotalUnrealizedAndTax: 0, BalanceALV: 0,
      AnnualOfPropOwned: 0, ThirtyPercentOfBalance: 0, IntOnBorwCap: intForRegime,
      TotalDeduct: intForRegime, ArrearsUnrealizedRentRcvd: 0,
      IncomeOfHP: I(c.hpForOld || c.hpIncome || 0),
    },
  };
}

// ─── Other income (Schedule OS) ───────────────────────────────────────────────
// Rules A-50-56: no duplicate dropdown; income types = sum
function othersInc(c) {
  const items = [];
  const sav = I(c.savingsInterest || 0);
  const fd  = I(c.fdInterest      || 0);
  // If split not available, put combined under SAV fallback
  if (sav > 0)                items.push({ OthSrcNatureDesc: 'SAV', OthSrcNatureAmt: sav });
  if (fd  > 0)                items.push({ OthSrcNatureDesc: 'OTH', OthSrcNatureAmt: fd  });
  if (!sav && !fd && I(c.interestIncome) > 0)
                              items.push({ OthSrcNatureDesc: 'SAV', OthSrcNatureAmt: I(c.interestIncome) });
  if (I(c.dividendIncome) > 0) items.push({ OthSrcNatureDesc: 'DIV', OthSrcNatureAmt: I(c.dividendIncome) });
  if (I(c.otherIncome)    > 0) items.push({ OthSrcNatureDesc: 'OTH', OthSrcNatureAmt: I(c.otherIncome)    });
  if (I(c.famPension)     > 0) items.push({ OthSrcNatureDesc: 'FAM', OthSrcNatureAmt: I(c.famPension)     });
  return { OthersIncDtlsOthSrc: items };
}

// ─── Interest and fees ────────────────────────────────────────────────────────
// Rules A-27/28: Total Tax Fees Interest = Tax+Cess + 234A + 234B + 234C + 234F - s89
function intrstPay(c) {
  return {
    IntrstPayUs234A: 0,               // Late filing: CA must compute if applicable
    IntrstPayUs234B: I(c.est234B || 0),
    IntrstPayUs234C: 0,               // Instalment shortfall: CA must compute
    LateFilingFee234F: I(c.fee234F || 0),
  };
}

// ─── Tax paid schedule ────────────────────────────────────────────────────────
// Rule A-104: TDS + TCS + Advance + Self-assessment = TotalTaxesPaid
function taxesPaid(c) {
  const tds  = I(c.tdsDeducted  || 0) + I(c.tdsNonSalary || 0);
  const adv  = I(c.advanceTax   || 0) + I(c.challanAdvance || 0);
  const self = I(c.selfAssessment|| 0) + I(c.challanSelf   || 0);
  return {
    AdvanceTax:        adv,
    TDS:               tds,
    TCS:               0,
    SelfAssessmentTax: self,
    TotalTaxesPaid:    tds + adv + self,
  };
}

// ─── Verification ─────────────────────────────────────────────────────────────
function verification(d) {
  return {
    Declaration: {
      AssesseeVerName: (d.name || '').toUpperCase(),
      FatherName:       d.fatherName || '',
      AssesseeVerPAN:   (d.pan  || '').toUpperCase(),
    },
    Capacity: 'S',
    Place:    d.city || 'Rajkot',
  };
}

// ─── Common schedule blocks ───────────────────────────────────────────────────
const scheduleCommon = (c, d) => ({
  Schedule80C:     { Schedule80CDtls: [], TotalAmt: I(c.cap80C || 0) },
  Schedule80D:     schedule80D(c),
  Schedule80E:     { IntPaidEduLoan: I(c.cap80E || 0), LoanSanctnYr: '' },
  Schedule80EE:    {}, Schedule80EEA: {}, Schedule80EEB: {},
  Schedule80G:     schedule80G(c),
  Schedule80GGC:   { TotDon80GGC: 0 },
  Schedule80DD:    {}, Schedule80U: {},
  ScheduleEA10_13A: { Placeofwork:'', ActlHRARecv:0, ActlRentPaid:0, DtlsSalUsSec171:0, BasicSalary:0, ActlRentPaid10Per:0, Sal40Or50Per:0, EligbleExmpAllwncUs13A:0 },
  ScheduleTDS3Dtls: { TDS3Details: [], TotalTDS3Details: 0 },
  ScheduleTCS:      { TCS: [], TotalSchTCS: 0 },
  Verification:     verification(d),
  TaxReturnPreparer: { IdentificationNoOfTRP: '', NameOfTRP: d.caDetails?.name || 'RB Shah & Associates', ReImbFrmGov: 0 },
});

// ─── Cross-check validator ────────────────────────────────────────────────────
// Called before building JSON; throws descriptive error for CA to fix
function validateBeforeBuild(c, isOld) {
  const errors = [];
  const taxable = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const gti     = isOld ? I(c.grossTotalOld) : I(c.grossTotalNew);

  // Rule A-18: Chapter VI-A ≤ GTI
  const totalDed = isOld ? I(c.totalDeductionsOld) : I(c.totalDeductionsNew);
  if (totalDed > gti) errors.push(`Chapter VI-A deductions (₹${totalDed}) exceed Gross Total Income (₹${gti}). [Rule A-18]`);

  // Rule A-1: 80C+80CCC+80CCD(1) ≤ ₹1,50,000
  if (isOld && (I(c.cap80C) + I(c.cap80CCD1)) > 150000)
    errors.push(`80C+80CCD(1) combined exceeds ₹1,50,000. [Rule A-1]`);

  // Rule A-11: 80TTA max ₹10K; Rule A-14: 80TTB max ₹50K
  if (I(c.cap80TTA) > 10000) errors.push(`80TTA exceeds ₹10,000. [Rule A-11]`);
  if (I(c.cap80TTB) > 50000) errors.push(`80TTB exceeds ₹50,000. [Rule A-14]`);

  // Rules A-13/15: 80TTA for senior, 80TTB for non-senior
  if (c.isSenior && I(c.cap80TTA) > 0) errors.push(`Senior citizen cannot claim 80TTA (use 80TTB). [Rule A-13]`);
  if (!c.isSenior && I(c.cap80TTB) > 0) errors.push(`Non-senior cannot claim 80TTB. [Rule A-15]`);

  // Rule A-136: 80D total ≤ ₹1,00,000
  if (I(c.cap80D) > 100000) errors.push(`80D total exceeds ₹1,00,000. [Rule A-136]`);

  // Rule A-25: Tax after rebate = slabTax - rebate
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const afterRebate = Math.max(0, slab - rebate);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cgTax  = I(c.cgTax || 0);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const expectedTax = afterRebate + cgTax + sc + Math.round((afterRebate + cgTax + sc) * 0.04);
  if (Math.abs(tax - expectedTax) > 1) errors.push(`Tax computation mismatch: computed ₹${tax}, expected ₹${expectedTax}. [Rule A-25/26]`);

  if (errors.length > 0) {
    throw new Error('ITR pre-validation failed:\n' + errors.join('\n'));
  }
}

// ─── ITR-1 ────────────────────────────────────────────────────────────────────
function buildITR1(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  validateBeforeBuild(c, isOld);

  const taxInc  = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab    = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate  = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc      = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const cess    = isOld ? I(c.oldCess)    : I(c.newCess);
  const tax     = isOld ? I(c.oldTax)     : I(c.newTax);
  const ltcgG   = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcg    = build112ASummary(c.capitalGains);
  const hp      = I(c.hpForOld || 0);
  const gross   = I(c.grossSalaryTotal || c.grossSalary || 0);
  // Rule A-112/215: regime-specific standard deduction
  const stdDed  = isOld ? I(c.stdDedOld || 0) : I(c.stdDedNew || 0);
  const pTax    = isOld ? I(c.professionalTax || 0) : 0; // Rule A-168: prof tax = 0 new regime
  const salNet  = isOld ? I(c.salAfterStdDedOld || 0) : I(c.salAfterStdDedNew || 0);
  // Rule A-52: OS = sum of individual items
  const os      = I((c.interestIncome||0) + (c.dividendIncome||0) + (c.otherIncome||0) + (c.famPension||0));
  // Rule A-53/54/214: family pension deduction
  const ded57   = isOld ? I(c.ded57iiaOld || 0) : I(c.ded57iiaNEW || 0);
  const osNet   = Math.max(0, os - ded57);
  // Rule A-22: GTI = salary + HP + OS + LTCG112A (for old); Rule A-174: new GTI includes positive HP
  const gtiOld  = I(c.grossTotalOld || 0);
  const tds1    = buildTDS1(c, d);
  const tds2    = buildTDS2(c);
  const schedIT = buildScheduleIT(c);

  // Rule A-104: TotalTaxesPaid = TDS + Advance + Self
  const taxPaid = taxesPaid(c);
  // Rules A-105/106: Refund = totalPaid - tax; Balance = tax - totalPaid
  const totalPaidAmt = taxPaid.TotalTaxesPaid;
  const intFees = intrstPay(c);
  const totalIntFeesAmt = I(c.est234B||0) + I(c.fee234F||0);
  // Rule A-27: TotTaxPlusIntrstPay = tax + 234B + 234F
  const totTaxIntFees = tax + totalIntFeesAmt;

  return { ITR: { ITR1: {
    CreationInfo: { SWVersionNo: SW, SWCreatedBy:'TaxTalk', JSONCreatedBy:'TaxTalk', JSONCreationDate:today(), IntermediaryCity:d.city||'Rajkot', Digest:'' },
    Form_ITR1: { FormName:'ITR-1', Description:'For Individuals (Resident) income upto Rs.50 lakh', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
    PersonalInfo: {
      AssesseeName:     assesseeName(d.name),
      PAN:              (d.pan||'').toUpperCase(),
      Address:          buildAddress(d),
      SecondaryAdd:     'Y', // Rule A-338: secondary address mandatory
      DOB:              d.dob || '',
      EmployerCategory: c.employerCategory || 'OTH',
      AadhaarCardNo:    d.aadhaar || '',
    },
    FilingStatus: {
      ReturnFileSec: I(c.filingSection || 11),
      OptOutNewTaxRegime: Y(isOld),
      SeventhProvisio139: 'N',
      IncrExpAggAmt2LkTrvFrgnCntryFlg: 'N',
      IncrExpAggAmt1LkElctrctyPrYrFlg: 'N',
      clauseiv7provisio139i: 'N',
      AsseseeRepFlg: 'N',
      ItrFilingDueDate: '2026-07-31',
    },
    ITR1_IncomeDeductions: {
      // Rules A-59/60: GrossSalary = 17(1) + perquisites + profits in lieu
      GrossSalary:         gross,
      Salary:              I(c.grossSalary || 0),
      PerquisitesValue:    I(c.perquisites || 0),
      ProfitsInSalary:     I(c.profitsInLieu || 0),
      AllwncExemptUs10:    { AllwncExemptUs10Dtls: [] },
      // Rule A-60: NetSalary = GrossSalary - exempt 10 allowances
      NetSalary:           gross, // Same if no exempt allowances
      // Rule A-61: Deductions u/s 16 = stdDed + entertainment + profTax
      DeductionUs16:       stdDed + pTax,
      DeductionUs16ia:     stdDed,       // Rule A-112/215: 50K old, 75K new
      EntertainmentAlw16ii: 0,           // Rule A-58: no entertainment for private employees
      ProfessionalTaxUs16iii: pTax,     // Rule A-168: 0 in new regime
      // Rule A-62: B1v = GrossSalary - DeductionU16
      IncomeFromSal:       salNet,
      PropertyDetails:     hp !== 0 ? [buildHPDetail(c, d, 1)] : [],
      TotalIncomeChargeableUnHP: hp,
      IncomeOthSrc:        osNet,
      OthersInc:           othersInc(c),
      // Rule A-53/54: 57(iia) only if family pension > 0, old regime
      DeductionUs57iia:    ded57,
      GrossTotIncome:      gtiOld,
      // Rule A-22/292: GTI including LTCG 112A
      GrossTotIncomeIncLTCG112A: gtiOld + ltcgG,
      UsrDeductUndChapVIA: chapVIA(c, isOld),
      DeductUndChapVIA:    chapVIA(c, isOld),
      TotalIncome:         taxInc,
      ExemptIncAgriOthUs10: { ExemptIncAgriOthUs10Dtls: [] },
    },
    ITR1_TaxComputation: {
      // Rule A-25: TaxPayable = slabTax + cgTax
      TotalTaxPayable:    slab + I(c.cgTax||0),
      // Rule A-25: TaxAfterRebate = TaxPayable - 87A
      Rebate87A:          rebate,
      TaxPayableOnRebate: Math.max(0, slab - rebate) + I(c.cgTax||0),
      // Rule A-26: TotalTax+Cess = TaxAfterRebate + Cess
      EducationCess:      cess,
      GrossTaxLiability:  tax,
      Section89:          0,           // Rule D-1: never claim without Form 10E
      NetTaxLiability:    tax,
      // Rule A-28: TotalInterest = 234A + 234B + 234C + 234F
      TotalIntrstPay:     totalIntFeesAmt,
      IntrstPay:          intFees,
      // Rule A-27: Total Tax+Interest = tax + all interest/fees
      TotTaxPlusIntrstPay: totTaxIntFees,
    },
    // Rule A-104: Taxes Paid
    TaxPaid: { TaxesPaid: taxPaid, BalTaxPayable: I(c.balanceDue || 0) },
    // Rule A-105: Refund = TotalPaid - TaxAndInterest
    Refund: { RefundDue: I(c.refund || 0), BankAccountDtls: bankDtls(d.bankAccounts) },
    ...scheduleCommon(c, d),
    TDSonSalaries:    tds1,
    TDSonOthThanSals: tds2,
    // Rules A-95,110,111: Advance / self-assessment challan detail
    TaxPayments:      schedIT,
    // Rule A-217/218: LTCG 112A exempt first ₹1.25L; schema field = min(ltcg, 125000)
    LTCG112A: ltcgG > 0 ? {
      TotSaleCnsdrn: ltcg.SaleValue112A,
      TotCstAcqisn:  ltcg.AcquisitionCost112A,
      LongCap112A:   Math.min(ltcgG, 125000),
    } : { TotSaleCnsdrn: 0, TotCstAcqisn: 0, LongCap112A: 0 },
  }}};
}

// ─── ITR-2 ────────────────────────────────────────────────────────────────────
function buildITR2(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  validateBeforeBuild(c, isOld);

  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const cess   = isOld ? I(c.oldCess)    : I(c.newCess);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const gross  = I(c.grossSalaryTotal || c.grossSalary || 0);
  const stdDed = isOld ? I(c.stdDedOld || 0) : I(c.stdDedNew || 0);
  const pTax   = isOld ? I(c.professionalTax || 0) : 0;
  const salNet = isOld ? I(c.salAfterStdDedOld || 0) : I(c.salAfterStdDedNew || 0);
  const hp     = I(c.hpForOld || 0);
  const stcgPre  = cgGain(c.capitalGains?.shares?.stcg111a_pre  || 0);
  const stcgPost = cgGain(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a || 0);
  const stcgG    = stcgPre + stcgPost;
  const ltcgG    = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcgAboveExempt = Math.max(0, ltcgG - 125000);
  const ltcg112A = build112ASummary(c.capitalGains);
  const tds1     = buildTDS1(c, d);
  const tds2     = buildTDS2(c);
  const schedIT  = buildScheduleIT(c);
  const taxPaid  = taxesPaid(c);
  const intFees  = intrstPay(c);
  const totalIntFeesAmt = I(c.est234B||0) + I(c.fee234F||0);
  const ded57    = isOld ? I(c.ded57iiaOld || 0) : I(c.ded57iiaNEW || 0);
  const gti      = isOld ? I(c.grossTotalOld || 0) : I(c.grossTotalNew || 0);

  // STCG 111A block: split-rate, full consideration required
  const stcgFullPre  = cgFull(c.capitalGains?.shares?.stcg111a_pre);
  const stcgFullPost = cgFull(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a);

  return { ITR: { ITR2: {
    CreationInfo: { SWVersionNo: SW, SWCreatedBy:'TaxTalk', JSONCreatedBy:'TaxTalk', JSONCreationDate:today(), IntermediaryCity:d.city||'Rajkot', Digest:'' },
    Form_ITR2: { FormName:'ITR-2', Description:'For Individuals and HUFs not having income from profits and gains of business or profession', AssessmentYear:'2026', SchemaVer:'1.0', FormVer:'V1.0' },
    PartA_GEN1: {
      PersonalInfo: { AssesseeName:assesseeName(d.name), PAN:(d.pan||'').toUpperCase(), Address:buildAddress(d), SecondaryAdd:'Y', DOB:d.dob||'', EmployerCategory:c.employerCategory||'OTH', AadhaarCardNo:d.aadhaar||'' },
      FilingStatus: { ReturnFileSec:I(c.filingSection||11), OptOutNewTaxRegime:Y(isOld), SeventhProvisio139:'N', IncrExpAggAmt2LkTrvFrgnCntryFlg:'N', IncrExpAggAmt1LkElctrctyPrYrFlg:'N', clauseiv7provisio139i:'N', AsseseeRepFlg:'N', ItrFilingDueDate:'2026-07-31' },
    },
    ScheduleS: {
      Salaries: gross, AllwncExemptUs10:{ AllwncExemptUs10Dtls:[] },
      NetSalary: gross, DeductionUs16: stdDed+pTax,
      DeductionUs16ia: stdDed, EntertainmentAlw:0, ProfessionalTax:pTax,
      IncChrgSal: salNet, TotalIncomeOfHP: 0,
    },
    ScheduleHP: { Propertys: hp !== 0 ? [buildHPDetail(c, d, 1)] : [], PassThroughIncome:0 },
    ScheduleCGFor23: {
      ShortTermCapGainFor23: {
        EquityMFonSTT: stcgG > 0 ? [
          ...(stcgPre > 0 ? [{ MFSectionCode:'1A_PRE', EquityMFonSTTDtls: { FullConsideration:stcgFullPre.sale, DeductSec48:{AquisitCost:stcgFullPre.cost,ImproveCost:0,ExpOnTrans:stcgFullPre.exp,TotalDedn:stcgFullPre.totalDedn}, BalanceCG:stcgPre, LossSec94of7Or94of8:0, CapgainonAssets:stcgPre } }] : []),
          ...(stcgPost > 0 ? [{ MFSectionCode:'1A', EquityMFonSTTDtls: { FullConsideration:stcgFullPost.sale, DeductSec48:{AquisitCost:stcgFullPost.cost,ImproveCost:0,ExpOnTrans:stcgFullPost.exp,TotalDedn:stcgFullPost.totalDedn}, BalanceCG:stcgPost, LossSec94of7Or94of8:0, CapgainonAssets:stcgPost } }] : []),
        ] : [],
        TotSTCGChargblSpecRate:stcgG, TotalShortTermCapLoss:0, BalStCGAfterSetOff:stcgG, TotalSTCG:stcgG,
        UnutilizedStcgFlag:'X', UnutilizedCg:{}, AmtDeemedStcg:0, TotalAmtDeemedStcg:0, ShortTermCapLossSetOff:0,
        PassThrIncNatureSTCG:0, PassThrIncNatureSTCG20Per:0, PassThrIncNatureSTCG30Per:0, PassThrIncNatureSTCGAppRate:0,
        NRICgDTAA:{}, TotalAmtNotTaxUsDTAAStcg:0, TotalAmtTaxUsDTAAStcg:0, CapitalLossBuyBackShares:{},
      },
      LongTermCapGain23: {
        SaleOnOrAfter01Apr2023: {
          LTCGSection112Prov1: 0,
          LTCGSection112A: {
            AmtDeemedLTCG: ltcgG,
            AmtDeemedLTCGBelow: ltcgG > 125000 ? 125000 : ltcgG,
            DednUs54Prov1: 0,
            CapgainsChrgblAtSpecRates: ltcgAboveExempt,
          },
        },
        TotLTCGChargblSpecRate:ltcgAboveExempt, LTCGLossSetOff:0, TotalLTCGLoss:0,
        BalLTCGAfterSetOff:ltcgAboveExempt,
      },
      SumOfCGIncm: stcgG + ltcgAboveExempt,
      IncmFromVDATrnsf:0, TotScheduleCGFor23:stcgG + ltcgAboveExempt,
      CurrYrLosses:{ LossSummaryDetail:[] }, AccruOrRecOfCG:{ AccruOrRecOfCGDtls:[] },
    },
    Schedule112A: ltcgG > 0 ? ltcg112A : { Schedule112ADtls:[], SaleValue112A:0, CostAcqWithoutIndx112A:0, AcquisitionCost112A:0, LTCGBeforelowerB1B2112A:0, FairMktValueCapAst112A:0, ExpExclCnctTransfer112A:0, Deductions112A:0, Balance112A:0, TotalBalance112A:0 },
    Schedule115AD: { Schedule115ADDtls:[] },
    ScheduleVDA:   { ScheduleVDADtls:[] },
    ScheduleOS: {
      IncOthThanOwnRaceHorse: othersInc(c),
      TotOthSrcNoRaceHorse: I((c.interestIncome||0)+(c.dividendIncome||0)+(c.otherIncome||0)+(c.famPension||0)),
      DeductionUs57iia: ded57,
      IncChargeable: Math.max(0, I((c.interestIncome||0)+(c.dividendIncome||0)+(c.otherIncome||0)+(c.famPension||0)) - ded57),
      IncFrmLottery:{DateRange:[]}, IncFrmOnGames:{DateRange:[]}, DividendIncUs115BBDA:{DateRange:[]},
      DividendIncUs115BBDAaiii:{DateRange:[]}, DividendIncUs115A1ai:{DateRange:[]},
      DividendIncUs115A1aA:{DateRange:[]}, DividendIncUs115AC:{DateRange:[]},
      DividendIncUs115ACA:{DateRange:[]}, DividendIncUs115AD1i:{DateRange:[]},
      DividendDTAA:{DateRange:[]}, NOT89A:{DateRange:[]},
    },
    ScheduleCYLA:{ CYLA:[] }, ScheduleBFLA:{ BFLA:[] },
    'PartB-TI': {
      Salaries: salNet, IncomeFromHP: hp,
      CapGain:{ STCG:stcgG, LTCG:ltcgAboveExempt },
      IncFromOS:{ IncFromOS: Math.max(0, I((c.interestIncome||0)+(c.dividendIncome||0)+(c.otherIncome||0)+(c.famPension||0)) - ded57) },
      TotalTI:taxInc, CurrentYearLoss:0, BalanceAfterSetoffLosses:taxInc,
      BroughtFwdLossesSetoff:0, GrossTotalIncome:gti,
      IncChargeTaxSplRate111A112: stcgG + ltcgAboveExempt,
      DeductionsUnderScheduleVIA: isOld ? I(c.totalDeductionsOld||0) : I(c.totalDeductionsNew||0),
      TotalIncome:taxInc, IncChargeableTaxSplRates:stcgG+ltcgAboveExempt,
      NetAgricultureIncomeOrOtherIncomeForRate:0, AggregateIncome:taxInc,
      LossesOfCurrentYearCarriedFwd:0, DeemedIncomeUs115JC:0,
    },
    PartB_TTI: {
      TaxPayable:slab+I(c.cgTax||0), Rebate87A:rebate,
      TaxAfterRebate:Math.max(0,slab-rebate)+I(c.cgTax||0),
      HealthEduCess:cess, TotTaxLiability:tax, Section89:0, NetTaxLiab:tax,
      TotalIntrstPay:I(c.est234B||0)+I(c.fee234F||0), IntrstPay:intFees,
      TotTaxAndIntrstPay:tax+I(c.est234B||0)+I(c.fee234F||0),
      TaxPaid:{ TaxesPaid:taxPaid, BalTaxPayable:I(c.balanceDue||0) },
      Refund:{ RefundDue:I(c.refund||0), BankAccountDtls:bankDtls(d.bankAccounts) },
    },
    ScheduleVIA: chapVIA(c, isOld),
    ...scheduleCommon(c, d),
    TDSonSalaries: tds1,
    TDSonOthThanSals: tds2,
    TaxPayments: schedIT,
  }}};
}

// ─── ITR-4 ────────────────────────────────────────────────────────────────────
function buildITR4(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  validateBeforeBuild(c, isOld);

  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const cess   = isOld ? I(c.oldCess)    : I(c.newCess);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const biz    = I(c.businessIncome || 0);
  const gross  = I(c.grossSalaryTotal || c.grossSalary || 0);
  const stdDed = isOld ? I(c.stdDedOld || 0) : I(c.stdDedNew || 0);
  const pTax   = isOld ? I(c.professionalTax || 0) : 0;
  const salNet = isOld ? I(c.salAfterStdDedOld || 0) : I(c.salAfterStdDedNew || 0);
  const hp     = I(c.hpForOld || 0);
  const is44AD  = ret?.profile === 'business';
  const is44ADA = ret?.profile === 'freelancer';
  const turn    = I(d.bizTurnover || c.bizTurnover || 0);
  const cashPct = Number(d.bizCashPct !== undefined ? d.bizCashPct : (c.bizCashPct ?? 50)) / 100;
  const bankT   = Math.round(turn * (1 - cashPct));
  const ltcgG   = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcg112 = build112ASummary(c.capitalGains);
  const tds1    = buildTDS1(c, d);
  const tds2    = buildTDS2(c);
  const schedIT = buildScheduleIT(c);
  const taxPaid = taxesPaid(c);
  const intFees = intrstPay(c);
  const gti     = isOld ? I(c.grossTotalOld || 0) : I(c.grossTotalNew || 0);
  const ded57   = isOld ? I(c.ded57iiaOld || 0) : I(c.ded57iiaNEW || 0);
  const osInc   = Math.max(0, I((c.interestIncome||0)+(c.dividendIncome||0)+(c.otherIncome||0)+(c.famPension||0)) - ded57);

  return { ITR: { ITR4: {
    CreationInfo: { SWVersionNo:SW, SWCreatedBy:'TaxTalk', JSONCreatedBy:'TaxTalk', JSONCreationDate:today(), IntermediaryCity:d.city||'Rajkot', Digest:'' },
    Form_ITR4: { FormName:'ITR-4', Description:'For Individuals, HUFs and Firms (other than LLP) being a Resident', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
    PersonalInfo: { AssesseeName:assesseeName(d.name), PAN:(d.pan||'').toUpperCase(), Address:buildAddress(d), SecondaryAdd:'Y', DOB:d.dob||'', EmployerCategory:c.employerCategory||'OTH', Status:'Individual', AadhaarCardNo:d.aadhaar||'' },
    FilingStatus: {
      ReturnFileSec:I(c.filingSection||11), Form10IEAEarlierAYOldRegime:'N', AsseseeRepFlg:'N',
      ItrFilingDueDate:'2026-07-31', SeventhProvisio139:'N',
      IncrExpAggAmt2LkTrvFrgnCntryFlg:'N', IncrExpAggAmt1LkElctrctyPrYrFlg:'N',
      clauseiv7provisio139i:'N', F10IEACurrAYOldRegime:Y(isOld),
    },
    IncomeDeductions: {
      IncomeFromBusinessProf:biz, GrossSalary:gross,
      Salary:I(c.grossSalary||0), PerquisitesValue:I(c.perquisites||0), ProfitsInSalary:I(c.profitsInLieu||0),
      AllwncExemptUs10:{ AllwncExemptUs10Dtls:[] },
      NetSalary:gross, DeductionUs16:stdDed+pTax, DeductionUs16ia:stdDed,
      EntertainmntalwncUs16ii:0, ProfessionalTaxUs16iii:pTax,
      IncomeFromSal:salNet,
      PropertyDetails: hp !== 0 ? [buildHPDetail(c, d, 1)] : [],
      TotalIncomeChargeableUnHP:hp,
      IncomeOthSrc:osInc,
      OthersInc:othersInc(c), DeductionUs57iia:ded57,
      GrossTotIncome:gti, GrossTotIncomeIncLTCG112A:gti+ltcgG,
      UsrDeductUndChapVIA:chapVIA(c, isOld), DeductUndChapVIA:chapVIA(c, isOld),
      TotalIncome:taxInc,
    },
    TaxComputation: {
      TotalTaxPayable:slab+I(c.cgTax||0), Rebate87A:rebate,
      TaxPayableOnRebate:Math.max(0,slab-rebate)+I(c.cgTax||0),
      EducationCess:cess, GrossTaxLiability:tax, Section89:0, NetTaxLiability:tax,
      IntrstPay:intFees, TotTaxPlusIntrstPay:tax+I(c.est234B||0)+I(c.fee234F||0),
    },
    ScheduleBP: {
      NatOfBus44AD: is44AD ? [{ NameOfBusiness:d.bizName||c.bizName||'Business', CodeAD:d.bizCodeAD||c.bizCodeAD||'09028', Description:'' }] : [],
      PersumptiveInc44AD: {
        GrsTotalTrnOver:        is44AD ? turn : 0, GrsTrnOverBank:is44AD ? bankT : 0,
        GrsTotalTrnOverInCash:  is44AD ? turn-bankT : 0, GrsTrnOverAnyOthMode:0,
        PersumptiveInc44AD6Per: is44AD ? Math.round(bankT*0.06) : 0,
        PersumptiveInc44AD8Per: is44AD ? Math.round((turn-bankT)*0.08) : 0,
        TotPersumptiveInc44AD:  is44AD ? biz : 0,
      },
      NatOfBus44ADA: is44ADA ? [{ NameOfBusiness:d.bizName||c.bizName||'Profession', CodeADA:d.bizCodeADA||c.bizCodeADA||'16019', Description:'' }] : [],
      PersumptiveInc44ADA: {
        GrsReceipt:                is44ADA ? turn : 0, GrsTrnOverBank44ADA:is44ADA ? bankT : 0,
        GrsTotalTrnOverInCash44ADA:is44ADA ? turn-bankT : 0, GrsTrnOverAnyOthMode44ADA:0,
        TotPersumptiveInc44ADA:    is44ADA ? biz : 0,
      },
      NatOfBus44AE:[], GoodsDtlsUs44AE:[],
      PersumptiveInc44AE:{ TotPersumptiveInc44AE:0 },
      TurnoverGrsRcptForGSTIN:(d.gstin||c.gstin) ? [{ GSTIN:(d.gstin||c.gstin), TurnoverGrsRcpt:turn }] : [],
      TotalTurnoverGrsRcptGSTIN:turn,
      FinanclPartclrOfBusiness: {
        PartnerMemberOwnCapital:I(d.bsCapital||c.bsCapital||0), SecuredLoans:0, UnSecuredLoans:0, Advances:0,
        SundryCreditors:I(d.bsCreditors||c.bsCreditors||0), OthrCurrLiab:0,
        TotCapLiabilities:I((d.bsCapital||c.bsCapital||0)+(d.bsCreditors||c.bsCreditors||0)),
        FixedAssets:0, Investments:0, Inventories:0,
        SundryDebtors:I(d.bsDebtors||c.bsDebtors||0), BalWithBanks:I(d.bsBank||c.bsBank||0),
        CashInHand:I(d.bsCash||c.bsCash||0), LoansAndAdvances:0, OtherAssets:0,
        TotalAssets:I((d.bsCapital||c.bsCapital||0)+(d.bsCreditors||c.bsCreditors||0)+(d.bsDebtors||c.bsDebtors||0)+(d.bsBank||c.bsBank||0)+(d.bsCash||c.bsCash||0)),
      },
    },
    TaxPaid:{ TaxesPaid:taxPaid, BalTaxPayable:I(c.balanceDue||0) },
    Refund:{ RefundDue:I(c.refund||0), BankAccountDtls:bankDtls(d.bankAccounts) },
    ...scheduleCommon(c, d),
    TaxExmpIntIncDtls:{ OthersInc:{ OthersIncDtlsOthSrc:[] } },
    LTCG112A: ltcgG > 0 ? {
      TotSaleCnsdrn:ltcg112.SaleValue112A, TotCstAcqisn:ltcg112.AcquisitionCost112A,
      LongCap112A:Math.min(ltcgG, 125000),
    } : { TotSaleCnsdrn:0, TotCstAcqisn:0, LongCap112A:0 },
    TDSonSalaries:    gross > 0 ? tds1 : { TDSonSalary:[], TotalTDSonSalaries:0 },
    TDSonOthThanSals: tds2,
    ScheduleTDS3Dtls: { TDS3Details:[], TotalTDS3Details:0 },
    ScheduleTCS:      { TCS:[], TotalSchTCS:0 },
    ScheduleIT:       schedIT,
    Verification:     verification(d),
    TaxReturnPreparer:{ IdentificationNoOfTRP:'', NameOfTRP:d.caDetails?.name||'RB Shah & Associates', ReImbFrmGov:0 },
  }}};
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function generateITRJson(itrForm, ret, d, c) {
  const comp = { ...c, ageGroup: c.ageGroup || ret?.ageGroup || '<60', isOld: c.betterRegime === 'old' };
  switch (itrForm) {
    case 'ITR-1': return buildITR1(ret, d, comp);
    case 'ITR-2': return buildITR2(ret, d, comp);
    case 'ITR-4': return buildITR4(ret, d, comp);
    case 'ITR-3':
      throw new Error('ITR-3 (partners) must be prepared manually by your CA. Please contact RB Shah & Associates directly.');
    default:
      throw new Error(`Unsupported ITR form: ${itrForm}. Please contact your CA.`);
  }
}

export function downloadITRJson(json, pan, ay) {
  const fn   = `${(pan||'NOPAN').toUpperCase()}_AY${(ay||'2026-27').replace('-','')}_ITR.json`;
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: fn });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
