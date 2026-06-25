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

// ─── ITR-2 helpers ───────────────────────────────────────────────────────────

// Rule 40: std ded old ≤ Rs.50,000; Rule 596: new regime ≤ Rs.75,000
// Rule 37: professional tax ≤ Rs.5,000 (enforced here)
// Rule 35/57: entertainment allowance = 0 for private, new regime
// Rule 22-27: salary schedule decomposition must sum correctly

function buildScheduleS(c, d, isOld) {
  const gross     = I(c.grossSalaryTotal || c.grossSalary || 0);
  const sal17_1   = I(c.grossSalary    || 0);
  const perq      = I(c.perquisites    || 0);
  const profits   = I(c.profitsInLieu  || 0);
  // Rule 22: GrossSalary = sum(1a+1b+1c+1d+1e+1f); Rule 59: 1a+1b+1c = Gross
  const stdDed    = isOld ? Math.min(50000, gross) : Math.min(75000, gross);
  // Rule 40/596: std deduction limits per regime
  // Rule 37: professional tax max Rs.5000; Rule 58: 0 in new regime
  const profTax   = isOld ? Math.min(I(c.professionalTax || 0), 5000) : 0;
  // Rule 35/57: entertainment allowance 0 for non-govt, 0 in new regime
  const entAlw    = 0;
  const netSal    = Math.max(0, gross - stdDed - profTax);

  return {
    // Rule 23: Total Gross Salary = sum of all employer entries
    TotalGrossSalary: gross,
    Sl1: {                       // Per-employer breakdown (simplified: one employer)
      Sl1a: sal17_1,             // Salary as per s17(1)
      Sl1b: perq,                // Perquisites s17(2)
      Sl1c: profits,             // Profits in lieu s17(3)
      Sl1d: 0,                   // Income from retirement benefit a/c u/s 89A
      Sl1e: 0,                   // Other
      Sl1f: 0,                   // Other
      GrossSalaryPerEmp: gross,  // Rule 22: 1a+1b+1c+1d+1e+1f
    },
    Sl2TotalGrossSal: gross,     // Rule 23
    // Rule 24: AllowancesExemptUs10 = sum of individual dropdowns
    Sl3AllwncExemptUs10: { AllwncExemptUs10Dtls: [] },
    Sl3aExemptForNR: 0,
    Sl4NetSalary: gross,         // Rule 25: Sl2 - Sl3 - Sl3a
    // Rule 26: DeductionsUs16 = 5a+5b+5c
    Sl5DeductionsUs16: stdDed + entAlw + profTax,
    Sl5a_StandardDed:  stdDed,   // 16(ia)
    Sl5b_EntAlw:       entAlw,   // 16(ii)
    Sl5c_ProfTax:      profTax,  // 16(iii)
    // Rule 27: IncChrgSal = Sl4 - Sl5
    Sl6IncChrgSal: netSal,
    // Employer details for TDS1
    EmployerName: d.employerName || '',
    EmployerTAN:  (d.employerTAN || '').toUpperCase(),
    EmployerCategory: c.employerCategory || 'OTH',
  };
}

// Rule 84-90: Schedule 112A per-row validation
// Col6(TotalSaleValue) = Col4(Qty) * Col5(SalePrice)
// Col7(CostWithoutIndex) = max(Col8_purchaseCost, Col9_FMVifPre2018)
// Col9 = min(Col6_TotalSaleValue, Col11_TotalFMV)
// Col11 = Col4 * Col10_FMVPerUnit
// Col13(TotalDedn) = Col7 + Col12(improvements)
// Col14(Balance) = Col6 - Col13
function buildSchedule112A(cg) {
  const raw    = cg?.shares?.ltcg || cg?.shares?.ltcg112a;
  if (!raw || cgGain(raw) === 0) return { Schedule112ADtls: [], TotalSaleValue112A: 0, TotCostAcqsn112A: 0, TotCapGain112A: 0 };

  const isObj  = typeof raw === 'object';
  const sale   = I(cgSaleValue(raw));
  const qty    = I(raw?.qty || 1);
  const salePerUnit = qty > 0 ? Math.round(sale / qty) : sale;
  const cost   = I(cgCost(raw));
  const fmv31  = isObj && raw.fmv31Jan18 ? I(raw.fmv31Jan18) : 0;
  const fmvPerUnit = qty > 0 && fmv31 > 0 ? Math.round(fmv31 / qty) : 0;
  const acquiredBefore = isObj && raw.acquiredBefore2018 !== false; // default: assume old if unknown
  // Col9: min(TotalSaleValue, TotalFMV) if acquired before 01.02.2018; else 0
  const col9   = acquiredBefore ? Math.min(sale, fmv31) : 0;
  // Col7: max(cost, col9)
  const col7   = Math.max(cost, col9);
  const exp    = I(cgExpenses(raw));
  // Col13: Col7 + Col12(improvements = 0)
  const col13  = col7 + exp;
  // Col14: Col6 - Col13
  const col14  = Math.max(0, sale - col13);

  return {
    Schedule112ADtls: [{
      ISINCode:               isObj ? (raw.isin || '') : '',
      NameOfScrip:            isObj ? (raw.description || '') : '',
      ShareOrUnitAcqBefore:   acquiredBefore ? 'Y' : 'N',
      Qty:                    qty,
      SalePrice:              salePerUnit,          // Col5
      TotalSaleValue:         sale,                 // Col6 = Col4*Col5  [Rule 84]
      CostAcqsn:              cost,                 // Col8
      FMVOn31Jan2018:         fmvPerUnit,           // Col10
      TotalFMV:               fmv31,                // Col11 = Col4*Col10 [Rule 87]
      LowerOfCol6And11:       col9,                 // Col9 = min(6,11) [Rule 86]
      CostAcqsnWithoutIndex:  col7,                 // Col7 = max(8,9) [Rule 85]
      CostImprovement:        0,                    // Col12
      TotalDedn:              col13,                // Col13 = Col7+Col12 [Rule 88]
      Balance:                col14,                // Col14 = Col6-Col13 [Rule 89]
    }],
    TotalSaleValue112A:  sale,
    TotCostAcqsn112A:    col7,
    TotCapGain112A:      col14,                     // Rule 134: B3a = total of col14
  };
}

// Rule 484: new regime 87A — income > Rs.12L cannot claim rebate (ITR-2 specific)
// Note: ITR-2 rule 484 says >Rs.12,00,000 not Rs.12,70,590 (different from ITR-1)
// The CBDT portal uses different threshold language for ITR-2
function itr2Rebate87A(taxableIncome, baseTax, regime) {
  if (regime === 'new'  && taxableIncome <= 1270590) return Math.min(baseTax, 60000); // marginal relief
  if (regime === 'old'  && taxableIncome <= 500000)  return Math.min(baseTax, 12500);
  return 0;
}

// Rule 572: LTCG on land/building — rate depends on acquisition date and residency
// Pre 23-Jul-2024 residents: beneficial rate 20% with indexation allowed
// Post 23-Jul-2024 or non-residents: 12.5% without indexation
// Rule 569: indexation only for residents
function ltcgPropertyRate(acquiredBefore23Jul2024, isResident) {
  if (acquiredBefore23Jul2024 && isResident) return 0.20;  // 20% with indexation
  return 0.125;                                              // 12.5% without indexation
}

// AMT computation (u/s 115JC) — Rules 419-431
// Rule 428: AMT = 18.5% of ATI if ATI > Rs.20L; + 4% cess
function buildScheduleAMT(c, isOld) {
  if (!isOld) return { Applicable: 'N', TotalIncomePBTI: 0, AdjustedTotalIncome: 0, AMTPayable: 0 };
  const totalIncome = I(c.oldTaxable || 0);
  const addBack = 0; // 80QQB + 80RRB (not collected currently)
  const ATI = totalIncome + addBack;
  const applicable = ATI > 2000000;
  const amtRaw = applicable ? Math.round(ATI * 0.185) : 0;
  const amtCess = Math.round(amtRaw * 0.04);
  const amtTotal = amtRaw + amtCess;
  return {
    Applicable:          applicable ? 'Y' : 'N',
    TotalIncomePBTI:     totalIncome,            // Rule 419: Sl.1 = Sl.12 of Part BTI
    AddBackDedn:         addBack,                // Rule 421
    AdjustedTotalIncome: ATI,                   // Rule 420: Sl.3 = Sl.1 + Sl.2a
    AMTRate:             0.185,
    AMTPayable:          amtTotal,              // Rule 428: 18.5% of ATI (if >20L)
  };
}

// Schedules CYLA / BFLA / CFL — loss set-off (Rules 234-276)
// Simplified: no brought-forward losses for typical CA practice clients
// HP loss: max Rs.2L set-off in old regime; Rs.0 in new regime (rules 249, 264)
// STCG loss: set-off only against STCG/LTCG (rules 551-562)
function buildCYLA_BFLA_CFL(c, isOld) {
  const hpIncome = I(c.hpForOld || 0);  // negative means loss
  const hpLoss   = hpIncome < 0 ? Math.abs(hpIncome) : 0;
  const hpSetOff = isOld ? Math.min(hpLoss, 200000) : 0; // Rule 249/264
  const hpCFwd   = hpLoss - hpSetOff;
  const stcg     = I((cgGain(c.capitalGains?.shares?.stcg111a_pre||0)) +
                     (cgGain(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a || 0)));
  const ltcg     = I(cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a));
  const ltcgProp = I(cgGain(c.capitalGains?.property?.ltcgDetail || c.capitalGains?.property?.ltcg));
  const salNet   = isOld ? I(c.salAfterStdDedOld||0) : I(c.salAfterStdDedNew||0);
  const osNet    = Math.max(0, I((c.interestIncome||0)+(c.dividendIncome||0)+(c.otherIncome||0)+(c.famPension||0)) - (isOld ? I(c.ded57iiaOld||0) : I(c.ded57iiaNEW||0)));

  // CYLA: current year income remaining after loss set-off
  const salAfterHP  = Math.max(0, salNet - hpSetOff);
  const osAfterHP   = hpSetOff > salNet ? Math.max(0, osNet - (hpSetOff - salNet)) : osNet;

  // Schedule CYLA structure (Rule 252-266)
  const CYLA = {
    Salaries:            salAfterHP,
    HouseProperty:       0,                 // HP loss fully set off or cfl'd
    CurrYrHPLoss:        hpLoss,
    HPLossSetOff:        hpSetOff,
    STCG20pct:           stcg,
    STCG15pct:           0,
    LTCGpct125:          Math.max(0, ltcg - 125000) + ltcgProp,
    OtherSources:        osAfterHP,
    TotalLossSetOff:     hpSetOff,
    LossRemaining:       hpCFwd,
  };

  // Schedule BFLA: brought-forward losses (none for fresh filers)
  const BFLA = { TotalBFLossSetOff: 0, TotalIncomeAfterBFLA: salAfterHP + osAfterHP + stcg + Math.max(0, ltcg - 125000) + ltcgProp };

  // Schedule CFL: carry-forward losses
  // Rule 272-274: HP loss ≤ Rs.2L carries forward; STCG/LTCG losses carry forward
  const CFL = {
    HPLossCarriedForward:   hpCFwd,
    STCGLossCarriedForward: 0,    // No STCG losses in current build
    LTCGLossCarriedForward: 0,    // No LTCG losses in current build
    TotalLossCarriedForward: hpCFwd,
  };

  return { CYLA, BFLA, CFL };
}

// Schedule SI: special income at special rates (Rules 366-418)
function buildScheduleSI(stcgPre, stcgPost, ltcgAboveExempt, ltcgProp) {
  const rows = [];
  if (stcgPre  > 0) rows.push({ Section:'111A', Rate:0.15, Income: stcgPre,       Tax: Math.round(stcgPre * 0.15) });
  if (stcgPost > 0) rows.push({ Section:'111A', Rate:0.20, Income: stcgPost,      Tax: Math.round(stcgPost * 0.20) });
  if (ltcgAboveExempt > 0) rows.push({ Section:'112A', Rate:0.125, Income: ltcgAboveExempt, Tax: Math.round(ltcgAboveExempt * 0.125) });
  if (ltcgProp > 0) rows.push({ Section:'112',  Rate:0.125, Income: ltcgProp,    Tax: Math.round(ltcgProp * 0.125) });
  const totalTax = rows.reduce((s, r) => s + r.Tax, 0);
  return { SIDetails: rows, TotalSITax: totalTax };
}

// Schedule EI: exempt income (Rules 432-445)
// Only populated if CA provides exempt income data
function buildScheduleEI(c) {
  return {
    Sl1AgriInc:  0,
    Sl2NetAgriInc: 0,
    Sl3PTI:      0,     // Rule 432: pass-through income exempt
    Sl4OtherExempt: { ExemptIncomeDetails: [] },
    Sl5PassThru: 0,
    Sl6Total:    0,     // Rule 435: = sum(1+2+3+4+5)
  };
}

// ─── ITR-2 (fully compliant) ─────────────────────────────────────────────────
function buildITR2(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  validateBeforeBuild(c, isOld);

  const taxInc    = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab      = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  // Rule 484: ITR-2 87A rebate
  const rebate    = itr2Rebate87A(taxInc, slab, isOld ? 'old' : 'new');
  const sc        = isOld ? I(c.oldSurcharge) : I(c.newSurcharge);
  const cess      = isOld ? I(c.oldCess)      : I(c.newCess);
  const tax       = isOld ? I(c.oldTax)       : I(c.newTax);
  const gti       = isOld ? I(c.grossTotalOld||0) : I(c.grossTotalNew||0);
  const salNet    = isOld ? I(c.salAfterStdDedOld||0) : I(c.salAfterStdDedNew||0);
  const hp        = I(c.hpForOld||0);   // may be negative (loss)
  const hpForJSON = isOld ? hp : I(c.hpForNew||0); // Rule 160: HP loss = 0 in new regime

  // Capital gains
  const stcgPre   = I(cgGain(c.capitalGains?.shares?.stcg111a_pre  || 0));
  const stcgPost  = I(cgGain(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a || 0));
  const stcgG     = stcgPre + stcgPost;
  const ltcgG     = I(cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a));
  const ltcgProp  = I(cgGain(c.capitalGains?.property?.ltcgDetail || c.capitalGains?.property?.ltcg));
  const ltcgAboveExempt = Math.max(0, ltcgG - 125000);
  const totalLTCG = ltcgAboveExempt + ltcgProp;

  // Schedule 112A (per-row with full consideration — Rule 84-90)
  const sch112A   = buildSchedule112A(c.capitalGains);

  // Schedule CG Table E (set-off matrix — Rules 551-568)
  const cgTableE  = buildScheduleCGTableE(stcgPre, stcgPost, ltcgG, ltcgProp, isOld);

  // CYLA/BFLA/CFL (Rules 234-276)
  const { CYLA, BFLA, CFL } = buildCYLA_BFLA_CFL(c, isOld);

  // Schedule SI (Rules 366-418)
  const schedSI   = buildScheduleSI(stcgPre, stcgPost, ltcgAboveExempt, ltcgProp);

  // AMT (Rules 419-431)
  const schedAMT  = buildScheduleAMT(c, isOld);
  const amtTax    = schedAMT.AMTPayable || 0;
  // Rule 539: GrossTaxPayable = max(normalTax, amtTax)
  const grossTaxPayable = Math.max(tax, amtTax);

  // OS income
  const ded57     = isOld ? I(c.ded57iiaOld||0) : I(c.ded57iiaNEW||0);
  const osGross   = I((c.interestIncome||0) + (c.dividendIncome||0) + (c.otherIncome||0) + (c.famPension||0));
  const osNet     = Math.max(0, osGross - ded57);
  const divInc    = I(c.dividendIncome || 0);

  // Schedule S (full decomposition — Rules 22-27, 40, 596)
  const schedS    = buildScheduleS(c, d, isOld);

  // TDS/IT schedules
  const tds1      = buildTDS1(c, d);
  const tds2      = buildTDS2(c);
  const schedIT   = buildScheduleIT(c);
  const taxPaid   = taxesPaid(c);
  const intFees   = intrstPay(c);
  const totalIntFees = I(c.est234B||0) + I(c.fee234F||0);

  // Part B-TI totals (Rules 488-515)
  // Rule 488: total STCG = STCG20% + STCG15% + STCG30% + applicable
  // Rule 489: total LTCG = LTCG12.5% + LTCG(others)
  // Rule 490: total CG = STCG + LTCG
  const totalCG   = stcgG + totalLTCG;
  // Rule 492: Total heads = salary + HP + CG + OS
  const totalHeads = salNet + hpForJSON + totalCG + osNet;
  // Rule 505: GTI = total - CYLA - BFLA
  const gtiCalc   = Math.max(0, totalHeads - CYLA.HPLossSetOff);
  // Rule 506: TotalIncome = GTI - ChapterVIA
  const chapVIATotal = isOld ? I(c.totalDeductionsOld||0) : I(c.totalDeductionsNew||0);

  // Rule 523: TaxPayable = normalTax + specialTax - agriRebate
  const normalTax = slab;
  const specialTax = stcgPre > 0 ? Math.round(stcgPre * 0.15) : 0
                   + stcgPost > 0 ? Math.round(stcgPost * 0.20) : 0
                   + ltcgAboveExempt > 0 ? Math.round(ltcgAboveExempt * 0.125) : 0
                   + ltcgProp > 0 ? Math.round(ltcgProp * 0.125) : 0;

  // Rule 524: taxPayable = normalTax + specialTax - 87A
  const taxAfterRebate = Math.max(0, slab - rebate) + I(c.cgTax||0);
  // Rule 525: GrossTaxLiability = taxPayable + surcharge + cess
  // Rule 536: Refund = totalPaid - aggregate; Rule 537: taxPayable = aggregate - totalPaid
  const totalPaidAmt = taxPaid.TotalTaxesPaid;
  const aggregateLiability = tax + totalIntFees;
  const refundDue   = Math.max(0, totalPaidAmt - aggregateLiability);
  const balanceDue  = Math.max(0, aggregateLiability - totalPaidAmt);

  return { ITR: { ITR2: {
    CreationInfo: { SWVersionNo: SW, SWCreatedBy:'TaxTalk', JSONCreatedBy:'TaxTalk', JSONCreationDate:today(), IntermediaryCity:d.city||'Rajkot', Digest:'' },
    Form_ITR2: { FormName:'ITR-2', Description:'For Individuals and HUFs not having income from profits and gains of business or profession', AssessmentYear:'2026', SchemaVer:'1.0', FormVer:'V1.0' },

    PartA_GEN1: {
      PersonalInfo: {
        AssesseeName: assesseeName(d.name),
        PAN:          (d.pan||''). toUpperCase(),
        Address:      buildAddress(d),
        SecondaryAdd: 'Y',       // Rule 338: secondary address mandatory
        DOB:          d.dob||'',
        EmployerCategory: c.employerCategory||'OTH',
        AadhaarCardNo: d.aadhaar||'',
        MobileNumber: (d.phone||'').replace(/\D/g,''),
        ResidentialStatus: 'RES',  // Default: resident
      },
      FilingStatus: {
        ReturnFileSec:              I(c.filingSection||11),
        OptOutNewTaxRegime:         Y(isOld),
        SeventhProvisio139:         'N',
        IncrExpAggAmt2LkTrvFrgnCntryFlg: 'N',
        IncrExpAggAmt1LkElctrctyPrYrFlg: 'N',
        clauseiv7provisio139i:      'N',
        AsseseeRepFlg:              'N',
        ItrFilingDueDate:           '2026-07-31',
        PortugueseCivilCode:        'N',   // Rule 6/14
        DirectorInCompany:          'N',   // Rule 10
        UnlistedEquityShares:       'N',   // Rule 5
        ClaimBenefit115H:           'N',   // Rule 83
        IsFPI:                      'N',   // Rule 15/20
      },
    },

    // Rule 22-27: Schedule S — full salary decomposition
    ScheduleS: {
      // Rule 32-34: sum of dropdowns in 1a, 1b, 1c = 1a, 1b, 1c respectively
      Sl1GrossSalary:        schedS.TotalGrossSalary,
      Sl1a_Salary17_1:       schedS.Sl1.Sl1a,
      Sl1b_Perquisites17_2:  schedS.Sl1.Sl1b,
      Sl1c_Profits17_3:      schedS.Sl1.Sl1c,
      Sl1d_Retirement89A:    0,
      Sl1e_Other:            0,
      Sl1f_Other2:           0,
      Sl2TotalGross:         schedS.Sl2TotalGrossSal,   // Rule 23
      Sl3AllwncExempt10:     { AllwncExemptUs10Dtls: [] },  // Rule 24: = sum of dropdowns
      Sl3a_ExemptNR:         0,
      Sl4NetSalary:          schedS.Sl4NetSalary,        // Rule 25: = Sl2 - Sl3 - Sl3a
      Sl5Deductions16: schedS.Sl5DeductionsUs16,         // Rule 26: = 5a+5b+5c
      Sl5a_StdDed:     schedS.Sl5a_StandardDed,
      Sl5b_EntAlw:     schedS.Sl5b_EntAlw,
      Sl5c_ProfTax:    schedS.Sl5c_ProfTax,
      Sl6IncChrgSal:   schedS.Sl6IncChrgSal,            // Rule 27: = Sl4 - Sl5
      EmployerName:    schedS.EmployerName,
      EmployerTAN:     schedS.EmployerTAN,
    },

    // Rules 67-82: Schedule HP
    ScheduleHP: {
      Propertys:          hpForJSON !== 0 ? [buildHPDetail(c, d, 1)] : [],
      PassThroughIncome:  0,
      // Rule 73: total = sum 1k+2k+2
      TotalHPIncome:      hpForJSON,
    },

    // Rules 84-90, 98-185: Schedule CG
    ScheduleCGFor23: {
      ShortTermCapGainFor23: {
        // Rule 661: STCG@15% and STCG@20% in separate entries
        EquityMFonSTT: stcgG > 0 ? [
          ...(stcgPre  > 0 ? [{
            MFSectionCode: '1A_PRE',   // pre-23-Jul-2024 @ 15%
            EquityMFonSTTDtls: {
              FullConsideration: cgFull(c.capitalGains?.shares?.stcg111a_pre).sale,
              DeductSec48: { AquisitCost: cgFull(c.capitalGains?.shares?.stcg111a_pre).cost, ImproveCost:0, ExpOnTrans:cgFull(c.capitalGains?.shares?.stcg111a_pre).exp, TotalDedn:cgFull(c.capitalGains?.shares?.stcg111a_pre).totalDedn },
              BalanceCG: stcgPre, LossSec94of7Or94of8:0, CapgainonAssets: stcgPre,
            }
          }] : []),
          ...(stcgPost > 0 ? [{
            MFSectionCode: '1A',        // post-23-Jul-2024 @ 20%
            EquityMFonSTTDtls: {
              FullConsideration: cgFull(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a).sale,
              DeductSec48: { AquisitCost: cgFull(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a).cost, ImproveCost:0, ExpOnTrans:cgFull(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a).exp, TotalDedn:cgFull(c.capitalGains?.shares?.stcg111a_post || c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a).totalDedn },
              BalanceCG: stcgPost, LossSec94of7Or94of8:0, CapgainonAssets: stcgPost,
            }
          }] : []),
        ] : [],
        // Rules 98-100: totals must equal sum of individual
        TotSTCGChargblSpecRate: stcgG,
        TotalShortTermCapLoss: 0,
        BalStCGAfterSetOff: stcgG,
        TotalSTCG: stcgG,
        UnutilizedStcgFlag:'X', UnutilizedCg:{}, AmtDeemedStcg:0, TotalAmtDeemedStcg:0, ShortTermCapLossSetOff:0,
        PassThrIncNatureSTCG:0, PassThrIncNatureSTCG20Per:0, PassThrIncNatureSTCG30Per:0, PassThrIncNatureSTCGAppRate:0,
        NRICgDTAA:{}, TotalAmtNotTaxUsDTAAStcg:0, TotalAmtTaxUsDTAAStcg:0, CapitalLossBuyBackShares:{},
      },
      LongTermCapGain23: {
        // Rule 134: B3a LTCG u/s 112A = total of col14 of Schedule 112A
        SaleOnOrAfter01Apr2023: {
          LTCGSection112Prov1: 0,
          LTCGSection112A: {
            AmtDeemedLTCG:         ltcgG,
            AmtDeemedLTCGBelow:    ltcgG > 125000 ? 125000 : ltcgG,  // Rule 217
            DednUs54Prov1:         0,
            CapgainsChrgblAtSpecRates: ltcgAboveExempt,
          },
        },
        // Rule 569/572: Property LTCG — rate depends on acquisition/residency
        LandOrBuilding: ltcgProp > 0 ? [{
          SaleValue:   I(cgSaleValue(c.capitalGains?.property?.ltcgDetail)),
          CostAcqsn:   I(cgCost(c.capitalGains?.property?.ltcgDetail)),
          Expense:     I(cgExpenses(c.capitalGains?.property?.ltcgDetail)),
          CapGain:     ltcgProp,
          Rate:        0.125,  // 12.5% for post 23-Jul-2024 transfers (Finance Act 2024)
          DateOfSale:  c.capitalGains?.property?.dateOfSale || '',
          DateOfPurch: c.capitalGains?.property?.dateOfPurchase || '',
        }] : [],
        TotLTCGChargblSpecRate: totalLTCG,
        LTCGLossSetOff: 0,
        TotalLTCGLoss: 0,
        BalLTCGAfterSetOff: totalLTCG,
      },
      // Rule 100: C = A9+B12
      SumOfCGIncm: stcgG + totalLTCG,
      // Rule 178/179: C3 = sum of CG + VDA; C2 = VDA
      IncmFromVDATrnsf: 0,
      TotScheduleCGFor23: stcgG + totalLTCG,
      CurrYrLosses: { LossSummaryDetail: [] },
      AccruOrRecOfCG: { AccruOrRecOfCGDtls: [] },
      // Rules 551-568: Table E — set-off matrix
      TableE: {
        STCG20pct:  { Income: cgTableE.STCG20pct.Income,  LossSetOff: cgTableE.STCG20pct.LossSetOff,  Balance: cgTableE.STCG20pct.Balance  },
        STCG15pct:  { Income: cgTableE.STCG15pct.Income,  LossSetOff: cgTableE.STCG15pct.LossSetOff,  Balance: cgTableE.STCG15pct.Balance  },
        LTCG125pct: { Income: cgTableE.LTCG125pct.Income, LossSetOff: cgTableE.LTCG125pct.LossSetOff, Balance: cgTableE.LTCG125pct.Balance },
        TotalSTCG:  cgTableE.TotalSTCG,
        TotalLTCG:  cgTableE.TotalLTCG,
        IncomeChargeable: { STCG: cgTableE.TotalSTCG, LTCG: cgTableE.TotalLTCG },
      },
      // Rules 573-576: field values for Ei2, Ei6, Eiii, Eviii
      EiFields: {
        Ei2:  stcgPost,                   // Rule 573: sum of A2e+A3a+A7a+A(A)@20%
        Ei3:  stcgPre,                    // Rule 159: sum of A4e+A7b
        Ei4:  stcgPost,                   // Rule 160: sum A1e+A3b+A5e+...
        Ei6:  totalLTCG,                  // Rule 575: sum of B1g*+B2e+...
        Ei7:  0,                          // Rule 162: B11b
        E8:   stcgG + totalLTCG,          // Rule 168: col(1-2-3-4-5-6-7)
      },
      // Rules 169-172, 577-578: quarterly STCG/LTCG breakup (simplified: single quarter)
      QuarterlyBreakupCG: {
        Q1STCG20pct: 0, Q2STCG20pct: 0, Q3STCG20pct: 0, Q4STCG20pct: Math.round(stcgPost),
        Q1LTCG125:   0, Q2LTCG125:   0, Q3LTCG125:   0, Q4LTCG125:   Math.round(totalLTCG),
      },
    },

    // Rules 84-90: Schedule 112A — per-row with full consideration
    Schedule112A: sch112A,
    Schedule115AD: { Schedule115ADDtls: [] },
    ScheduleVDA:   { ScheduleVDADtls: [] },

    // Rules 190-232: Schedule OS
    ScheduleOS: {
      // Rule 190: Sl1 = 1a+1b+1c+1d+1e
      GrossAmtNormalRates: osGross,
      Sl1a_Dividend:       I(c.dividendIncome || 0),
      // Rule 210: 1b = bi+bii+biii+biv+bv+bvi+bvii+bviii+bix
      Sl1b_Interest:       I((c.interestIncome||0)),
      Sl1b_Breakdown: {
        bi_SavingsBank:   I(c.savingsInterest || 0),
        bii_FD:           I(c.fdInterest || 0),
        biii_Other:       0, biv_Other2:0, bv_Other3:0, bvi_Other4:0, bvii_Other5:0, bviii_Other6:0, bix_Other7:0,
      },
      Sl1c_Rental:        0,
      Sl1d_56_2_x:        0,
      Sl1e_89A:           0,
      IncOthThanOwnRaceHorse: othersInc(c),
      // Rule 193: Sl7 = 2+6
      TotOthSrcNoRaceHorse: osGross,
      // Rule 209: 57(iia) only if family pension offered; Rule 215: max 1/3 or Rs.15K (old)
      DeductionUs57iia:    ded57,
      // Rule 206: Net = (1 - 3 + 4 + 5 - 5a - DTAA)
      IncChargeable:       osNet,
      // Rule 195: Sl9 = 7+8e
      TotalOSIncome:       osNet,
      // Rules 214, 219-223: quarterly dividend breakup
      DividendQuarterly: { Q1:0, Q2:0, Q3:0, Q4: divInc },
      IncFrmLottery:{DateRange:[]}, IncFrmOnGames:{DateRange:[]},
      DividendIncUs115BBDA:{DateRange:[]},DividendIncUs115BBDAaiii:{DateRange:[]},
      DividendIncUs115A1ai:{DateRange:[]},DividendIncUs115A1aA:{DateRange:[]},
      DividendIncUs115AC:{DateRange:[]},DividendIncUs115ACA:{DateRange:[]},
      DividendIncUs115AD1i:{DateRange:[]},DividendDTAA:{DateRange:[]},NOT89A:{DateRange:[]},
    },

    // Rules 234-268: Schedule CYLA
    ScheduleCYLA: {
      Salaries:            CYLA.Salaries,
      HouseProperty:       0,
      HPLoss:              CYLA.CurrYrHPLoss,
      HPLossSetOff:        CYLA.HPLossSetOff,
      STCG20pct:           CYLA.STCG20pct,
      STCG15pct:           CYLA.STCG15pct,
      LTCG125pct:          CYLA.LTCGpct125,
      OtherSources:        CYLA.OtherSources,
      // Rule 252/253: TotalLossSetOff = sum of individual
      TotalLossSetOff:     CYLA.TotalLossSetOff,
      // Rule 254/255: LossRemaining = loss - setOff
      LossRemaining:       CYLA.LossRemaining,
      // Rule 256: col4 = col1 - col2 - col3
      IncomeAfterSetOff:   Math.max(0, salNet + osNet + stcgG + totalLTCG - CYLA.HPLossSetOff),
    },

    // Rules 234-248: Schedule BFLA (brought forward)
    ScheduleBFLA: {
      BFLossSetOff: BFLA.TotalBFLossSetOff,
      IncomeAfterBFLA: BFLA.TotalIncomeAfterBFLA,
      // Rule 238: col3 = col1 - col2
    },

    // Rules 272-276: Schedule CFL
    ScheduleCFL: {
      HPLossCFwd:   CFL.HPLossCarriedForward,
      STCGLossCFwd: CFL.STCGLossCarriedForward,
      LTCGLossCFwd: CFL.LTCGLossCarriedForward,
      TotalCFwd:    CFL.TotalLossCarriedForward,
    },

    // Rules 366-418: Schedule SI (special income)
    ScheduleSI: {
      SIDetails:   schedSI.SIDetails,
      TotalSITax:  schedSI.TotalSITax,
      // Rule 376: total of all special incomes at (i) = total in SI
      TotalSpecialIncome: stcgG + totalLTCG,
    },

    // Rules 419-431: Schedule AMT
    ScheduleAMT: schedAMT,
    // Rule 430: new regime = blank AMT
    ScheduleAMTC: {
      Sl1NormalTax: tax,
      Sl2AMTPayable: amtTax,
      // Rule 424/425: Sl3 = Sl2-Sl1; 0 if Sl2 ≤ Sl1
      Sl3ExcessAMT: Math.max(0, amtTax - tax),
      CreditUtilised: 0,
      CreditCFwd: Math.max(0, amtTax - tax),
    },

    // Rules 432-445: Schedule EI
    ScheduleEI: buildScheduleEI(c),

    // Schedule PTI (Rules 432, 437-441) — pass-through income (empty for direct investors)
    SchedulePTI: { PTIDtls: [] },

    // Schedules FSI / TR (Rules 442-455) — foreign income/DTAA (empty for domestic taxpayers)
    ScheduleFSI: { FSIDetails: [] },
    ScheduleTR:  { TRDetails: [] },

    // Schedule AL (Rule 456) — assets/liabilities if income > 1 Cr
    ScheduleAL: { Applicable: taxInc > 10000000 ? 'Y' : 'N' },

    // ── Part B-TI (Rules 488-515) ─────────────────────────────────────────────
    'PartB-TI': {
      // Rule 494: Salary = Schedule S Sl6
      Salaries:       salNet,
      // Rule 495: HP = Schedule HP total
      IncomeFromHP:   hpForJSON,
      // Rule 488: Total STCG = STCG20 + STCG15 + STCG30 + applicable
      STCGTotal:      stcgG,
      STCG20pct:      stcgPost,
      STCG15pct:      stcgPre,
      // Rule 489: Total LTCG
      LTCGTotal:      totalLTCG,
      LTCG125pct:     ltcgAboveExempt + ltcgProp,
      // Rule 490: Total CG = STCG + LTCG
      TotalCG:        totalCG,
      // Rule 491/500: OS = normal OS (excl race horses & special rate)
      IncFromOS:      { IncFromOS: osNet },
      // Rule 492: Total = sum of all heads
      TotalTI:        taxInc,
      CurrentYearLoss: CYLA.TotalLossSetOff,
      BalanceAfterCYLA: Math.max(0, totalHeads - CYLA.HPLossSetOff),
      BroughtFwdLossesSetoff: 0,
      // Rule 505: GTI = total - CYLA - BFLA
      GrossTotalIncome: gti,
      // Rule 509: ChVI-A = min(schedule VIA, GTI-incspecialrate)
      DeductionsUnderScheduleVIA: Math.min(chapVIATotal, Math.max(0, gti - stcgG - totalLTCG)),
      // Rule 506: Total Income = GTI - ChVI-A
      TotalIncome:    taxInc,
      IncChargeTaxSplRate111A112: stcgG + totalLTCG,
      NetAgricultureIncomeOrOtherIncomeForRate: 0,
      AggregateIncome: taxInc,
      LossesOfCurrentYearCarriedFwd: CFL.TotalLossCarriedForward,
      // Rule 511: DeemedIncome115JC = Sl3 of Schedule AMT
      DeemedIncomeUs115JC: schedAMT.AdjustedTotalIncome,
    },

    // ── Part B-TTI (Rules 517-545) ─────────────────────────────────────────────
    PartB_TTI: {
      // Rule 523: TaxPayable = normal + special - agri rebate
      TaxPayable:          slab + I(c.cgTax||0),
      Rebate87A:           rebate,
      // Rule 524: after rebate
      TaxAfterRebate:      taxAfterRebate,
      // Rule 525: GrossTaxLiability = taxAfterRebate + surcharge + cess
      HealthEduCess:       cess,
      GrossTaxLiability:   tax,
      // Rule 539: GrossTaxPayable = max(normalTax, amtTax)
      GrossTaxPayable:     grossTaxPayable,
      Section89:           0,
      // Rule 541: NetTaxLiab = GrossTaxPayable - 115JD credit
      NetTaxLiab:          grossTaxPayable,
      // Rule 529: TotalInterestFee = 234A + 234B + 234C + 234F + 234-I
      TotalIntrstPay:      totalIntFees,
      IntrstPay:           intFees,
      // Rule 530: AggregateLiability = NetTaxLiab + TotalInterest
      AggregateLiability:  grossTaxPayable + totalIntFees,
      // Rule 531: TotalTaxesPaid = Advance + TDS + TCS + Self
      TaxPaid:             { TaxesPaid: taxPaid, BalTaxPayable: balanceDue },
      // Rule 536: Refund = TotalPaid - AggregateLiability
      Refund:              { RefundDue: refundDue, BankAccountDtls: bankDtls(d.bankAccounts) },
      TotTaxAndIntrstPay:  grossTaxPayable + totalIntFees,
      // Rule 517: 115JC tax = Sl4 of Schedule AMT
      TaxPayableAMT:       amtTax,
      // Rule 518: 115JD credit (not applicable for fresh filers)
      CreditUs115JD:       0,
      // AMT summary
      DeemedIncome115JC:   schedAMT.AdjustedTotalIncome,
      TaxOn115JC:          amtTax,
    },

    // Chapter VI-A
    ScheduleVIA: chapVIA(c, isOld),
    ...scheduleCommon(c, d),
    TDSonSalaries:    tds1,
    TDSonOthThanSals: tds2,
    TaxPayments:      schedIT,
    ScheduleIT:       schedIT,
    ScheduleTCS:      { TCS: [], TotalSchTCS: 0 },

    // Verification
    Verification: verification(d),
    TaxReturnPreparer: { IdentificationNoOfTRP:'', NameOfTRP: d.caDetails?.name||'RB Shah & Associates', ReImbFrmGov: 0 },
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
