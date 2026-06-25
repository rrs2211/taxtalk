// src/lib/itrJson.js — CBDT-compliant ITR JSON for AY 2026-27
// Schema: ITR-1 V1.0.0, ITR-2 V1.0, ITR-4 V1.0.0
// Key principle: ALL CG fields require sale + purchase + expenses, not just net gain.
// The schema validates: FullConsideration − (AquisitCost + ExpOnTrans) = CapgainonAssets

import { cgGain, cgSaleValue, cgCost, cgExpenses } from '../data/flow.js';

const SW = 'TaxTalk v1.0';
const today = () => new Date().toISOString().split('T')[0];

// ── ITR form selector ─────────────────────────────────────────────────────────
export function determineITRForm(profile, computation) {
  const hasBiz  = (computation?.businessIncome || 0) > 0;
  const ltcg112 = cgGain(computation?.capitalGains?.shares?.ltcg || computation?.capitalGains?.shares?.ltcg112a);
  const hasCG   = computation?.capitalGains?.enabled;
  if (profile === 'partner')                           return 'ITR-3';
  if (profile === 'business'  || profile === 'freelancer' || hasBiz) return 'ITR-4';
  if (hasCG && ltcg112 > 125000)                      return 'ITR-2'; // LTCG above exemption → ITR-2
  return 'ITR-1';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const I = v => Math.round(Number(v) || 0);
const Y = b => b ? 'Y' : 'N';

// Extract CG figures from either {saleValue, purchaseCost, expenses, gain} or plain number
function cgFull(val, defaultSale = 0, defaultCost = 0) {
  const sale = cgSaleValue(val) || defaultSale;
  const cost = cgCost(val)      || defaultCost;
  const exp  = cgExpenses(val);
  const net  = cgGain(val);
  return { sale: I(sale), cost: I(cost), exp: I(exp), net: I(net), totalDedn: I(cost + exp) };
}

function creationInfo(city = 'Rajkot') {
  return { SWVersionNo: SW, SWCreatedBy: 'TaxTalk', JSONCreatedBy: 'TaxTalk', JSONCreationDate: today(), IntermediaryCity: city, Digest: '' };
}

function assesseeName(name = '') {
  const parts = name.trim().split(/\s+/);
  const last  = parts.pop() || name;
  return { SurNameOrOrgName: last, FirstName: parts.shift() || '', MiddleName: parts.join(' ') };
}

function buildAddress(d) {
  return {
    ResidenceNo: '', ResidenceName: '', RoadOrStreet: '',
    LocalityOrArea:        d.locality || '',
    CityOrTownOrDistrict:  d.city     || '',
    StateCode:             d.stateCode|| '',
    CountryCode:           '91',
    PinCode:               I(d.pinCode),
    CountryCodeMobile:     91,
    MobileNo:              I((d.phone || '').replace(/\D/g, '')),
    EmailAddress:          d.email    || '',
  };
}

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

function chapVIA(c) {
  return {
    Section80C:               I(c.cap80C   || 0),
    Section80CCC:             0,
    Section80CCDEmployeeOrSE: 0,
    Section80CCD1B:           0,
    Section80CCDEmployer:     0,
    Section80D:               I(c.cap80D   || 0),
    Section80DD:              0,
    Section80DDB:             0,
    Section80E:               I(c.cap80E   || 0),
    Section80EE:              0, Section80EEA: 0, Section80EEB: 0,
    Section80G:               I(c.cap80G   || 0),
    Section80GG:              0, Section80GGA: 0, Section80GGC: 0, Section80U: 0,
    Section80TTA:             I(c.cap80TTA || 0),
    Section80TTB:             I(c.cap80TTB || 0),
    AnyOthSec80CCH:           0,
    TotalChapVIADeductions:   I(c.totalDeductionsOld || 0),
  };
}

function zeroChapVIA() {
  return chapVIA({ cap80C:0,cap80D:0,cap80E:0,cap80TTA:0,cap80TTB:0,cap80G:0,totalDeductionsOld:0 });
}

function taxesPaid(c) {
  return {
    AdvanceTax:        I(c.advanceTax    || 0),
    TDS:               I(c.tdsDeducted   || 0),
    TCS:               0,
    SelfAssessmentTax: I(c.selfAssessment|| 0),
    TotalTaxesPaid:    I(c.totalPaid     || 0),
  };
}

function intrstPay(c) {
  return {
    IntrstPayUs234A: 0,
    IntrstPayUs234B: I(c.est234B || 0),  // estimated 234B interest
    IntrstPayUs234C: 0,
    LateFilingFee234F: 0,
  };
}

function tdsOnSalaries(c, d) {
  if (!c.tdsDeducted || c.grossSalary === 0) return { TDSonSalary: [], TotalTDSonSalaries: 0 };
  return {
    TDSonSalary: [{
      EmployerOrDeductorOrCollectDetl: {
        TAN:                              (d.employerTAN  || '').toUpperCase(),
        EmployerOrDeductorOrCollecterName: d.employerName || '',
      },
      IncChrgSal:  I(c.grossSalary),
      TotalTDSSal: I(c.tdsDeducted),
    }],
    TotalTDSonSalaries: I(c.tdsDeducted),
  };
}

function tdsOnOthThanSals(c, d, forBusiness = false) {
  if (!forBusiness || !c.tdsDeducted) return { TDSonOthThanSalDtls: [], TotalTDSonOthThanSals: 0 };
  return {
    TDSonOthThanSalDtls: [{
      TANOfDeductor:       (d.employerTAN || '').toUpperCase(),
      TDSDeducted:         I(c.tdsDeducted),
      TDSClaimed:          I(c.tdsDeducted),
      TDSCreditCarriedFwd: 0,
      GrossAmount:         I(c.businessIncome || 0),
      TDSSection:          '194J',
      HeadOfIncome:        'BP',
      BroughtFwdTDSAmt:    0,
    }],
    TotalTDSonOthThanSals: I(c.tdsDeducted),
  };
}

function othersInc(c) {
  const items = [];
  // Savings bank interest (80TTA applies — split from FD for correct Schedule OS)
  if (I(c.savingsInterest || 0) > 0)
    items.push({ OthSrcNatureDesc: 'SAV', OthSrcNatureAmt: I(c.savingsInterest) });
  // FD / term deposit interest (no 80TTA)
  if (I(c.fdInterest || 0) > 0)
    items.push({ OthSrcNatureDesc: 'OTH', OthSrcNatureAmt: I(c.fdInterest) });
  // If split not available, fall back to combined interestIncome as SAV
  if (!c.savingsInterest && !c.fdInterest && I(c.interestIncome) > 0)
    items.push({ OthSrcNatureDesc: 'SAV', OthSrcNatureAmt: I(c.interestIncome) });
  if (I(c.dividendIncome) > 0)
    items.push({ OthSrcNatureDesc: 'DIV', OthSrcNatureAmt: I(c.dividendIncome) });
  if (I(c.otherIncome) > 0)
    items.push({ OthSrcNatureDesc: 'OTH', OthSrcNatureAmt: I(c.otherIncome) });
  return { OthersIncDtlsOthSrc: items };
}

function schedule80G(c) {
  const total = I(c.cap80G || 0);
  const bucket = (cash = 0, other = total) => ({
    DoneeWithPan: [], [`Tot${cash > 0 ? 'Cash' : ''}Don`]: cash || other,
  });
  return {
    Don100Percent:          { DoneeWithPan:[], TotDon100PercentCash:0, TotDon100PercentOtherMode:total, TotDon100Percent:total, TotEligibleDon100Percent:total },
    Don50PercentNoApprReqd: { DoneeWithPan:[], TotDon50PercentNoApprRqdCash:0, TotDon50PercentNoApprRqdOtherMode:0, TotDon50PercentNoApprRqd:0, TotEligibleDon50PercentNoApprRqd:0 },
    Don100PercentApprReqd:  { DoneeWithPan:[], TotDon100PercentApprRqdCash:0, TotDon100PercentApprRqdOtherMode:0, TotDon100PercentApprRqd:0, TotEligibleDon100PercentApprRqd:0 },
    Don50PercentApprReqd:   { DoneeWithPan:[], TotDon50PercentApprRqdCash:0, TotDon50PercentApprRqdOtherMode:0, TotDon50PercentApprRqd:0, TotEligibleDon50PercentApprRqd:0 },
    TotalDonationsUs80GCash:0, TotalDonationsUs80GOtherMode:total,
    TotalDonationsUs80G:total, TotalEligibleDonationsUs80G:total,
  };
}

function schedule80D(c) {
  const isSenior = c.ageGroup === '60-80' || c.ageGroup === '>80';
  return {
    Sec80DSelfFamSrCtznHealth: {
      SeniorCitizenFlag:  isSenior ? 'Y' : 'N',
      SelfAndFamily:      Math.min(I(c.cap80D || 0), 25000),
      HealthInsPremSlfFam: I(c.cap80D || 0),
      Sec80DSelfFamHIDtls: { Sch80DInsDtls: [] },
    },
  };
}

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

function buildHPDetail(c, d, sno = 1) {
  const hp     = c.houseProperty || {};
  const isRent = hp.type === 'Rented';
  const rent   = I(hp.rentReceived    || 0);
  const muni   = I(hp.municipalTaxes  || 0);
  const int_   = I(hp.interestPaid    || 0);
  const av     = Math.max(0, rent - muni);
  const stdDed = Math.round(av * 0.30);
  return {
    HPSNo: sno,
    AddressDetailWithZipCode: {
      AddrDetail: d.locality || '', CityOrTownOrDistrict: d.city || '',
      StateCode: d.stateCode || '', CountryCode: '91', PinCode: I(d.pinCode),
    },
    PropertyOwner: 'S', PropCoOwnedFlg: 'N',
    ifLetOut: isRent ? 'L' : 'S',
    Rentdetails: isRent ? {
      AnnualLetableValue: av, RentNotRealized: 0, LocalTaxes: muni,
      TotalUnrealizedAndTax: muni, BalanceALV: av, AnnualOfPropOwned: av,
      ThirtyPercentOfBalance: stdDed, IntOnBorwCap: int_,
      TotalDeduct: stdDed + int_, ArrearsUnrealizedRentRcvd: 0,
      IncomeOfHP: I(c.hpIncome || 0),
    } : {
      AnnualLetableValue:0, TotalUnrealizedAndTax:0, BalanceALV:0,
      AnnualOfPropOwned:0, ThirtyPercentOfBalance:0, IntOnBorwCap: int_,
      TotalDeduct: int_, ArrearsUnrealizedRentRcvd:0, IncomeOfHP: I(c.hpIncome || 0),
    },
  };
}

// ── STCG 111A block ───────────────────────────────────────────────────────────
// Schema validates: FullConsideration - TotalDedn = CapgainonAssets
// We NEVER guess sale/purchase — use only what client actually provided
function build111ABlock(cg) {
  const raw  = cg?.shares?.stcg || cg?.shares?.stcg111a;
  const sale = I(cgSaleValue(raw));
  const cost = I(cgCost(raw));
  const exp  = I(cgExpenses(raw));
  const net  = I(cgGain(raw));
  // If CGCollector was used: sale/cost/exp all present, recompute net from components
  // If only net gain (legacy): reconstruct minimum valid structure
  const hasFull = sale > 0 && cost > 0;
  const actualSale  = hasFull ? sale : (net > 0 ? net : 0);
  const actualCost  = hasFull ? cost : 0;
  const actualExp   = hasFull ? exp  : 0;
  const actualDedn  = actualCost + actualExp;
  const actualNet   = hasFull ? Math.max(0, actualSale - actualDedn) : net;
  return {
    FullConsideration:  actualSale,
    DeductSec48: { AquisitCost: actualCost, ImproveCost: 0, ExpOnTrans: actualExp, TotalDedn: actualDedn },
    BalanceCG:          Math.max(0, actualSale - actualDedn),
    LossSec94of7Or94of8: 0,
    CapgainonAssets:    actualNet,
  };
}

// ── LTCG 112A block ──────────────────────────────────────────────────────────
// LTCG = SaleValue - max(PurchaseCost, FMV31Jan18) - Expenses
// Exempt: first ₹1,25,000. Taxable = LTCG - 1,25,000 (if positive)
function build112ASummary(cg) {
  const raw     = cg?.shares?.ltcg || cg?.shares?.ltcg112a;
  const sale    = I(cgSaleValue(raw));
  const cost    = I(cgCost(raw));
  const fmv     = (typeof raw === 'object' && raw?.fmv31Jan18) ? I(raw.fmv31Jan18) : cost;
  const exp     = I(cgExpenses(raw));
  const netRaw  = I(cgGain(raw));
  const hasFull = sale > 0;
  const acqCost = Math.max(fmv || 0, cost || 0);
  const net     = hasFull ? Math.max(0, sale - acqCost - exp) : netRaw;
  return {
    SaleValue112A:            hasFull ? sale : net,
    CostAcqWithoutIndx112A:   cost,
    AcquisitionCost112A:      acqCost,
    LTCGBeforelowerB1B2112A:  net,
    FairMktValueCapAst112A:   fmv,
    ExpExclCnctTransfer112A:  exp,
    Deductions112A:           0,
    Balance112A:              net,
    TotalBalance112A:         net,
    Schedule112ADtls: [],
  };
}

// ── Property LTCG block ───────────────────────────────────────────────────────
// Indexed cost = Purchase price × (CII 2025-26 348 / CII of purchase year)
function buildPropLTCG(cg) {
  const raw  = cg?.property?.ltcgDetail;
  const net  = I(cgGain(raw || cg?.property?.ltcg));
  const sale = I(cgSaleValue(raw));
  const cost = I(cgCost(raw));       // indexed cost entered by user/CA
  const exp  = I(cgExpenses(raw));
  const hasFull = sale > 0 && cost > 0;
  const computedNet = hasFull ? Math.max(0, sale - cost - exp) : net;
  return {
    sale: hasFull ? sale : net,
    cost: cost,
    exp:  exp,
    net:  computedNet,
  };
}

// ─── Common schedule blocks ───────────────────────────────────────────────────
const scheduleCommon = (c, d) => ({
  Schedule80C:    { Schedule80CDtls: [], TotalAmt: I(c.cap80C || 0) },
  Schedule80D:    schedule80D(c),
  Schedule80E:    { IntPaidEduLoan: I(c.cap80E || 0), LoanSanctnYr: '' },
  Schedule80EE:   {}, Schedule80EEA: {}, Schedule80EEB: {},
  Schedule80G:    schedule80G(c),
  Schedule80GGC:  { TotDon80GGC: 0 },
  Schedule80DD:   {}, Schedule80U:   {},
  ScheduleEA10_13A: { Placeofwork:'', ActlHRARecv:0, ActlRentPaid:0, DtlsSalUsSec171:0, BasicSalary:0, ActlRentPaid10Per:0, Sal40Or50Per:0, EligbleExmpAllwncUs13A:0 },
  ScheduleTDS3Dtls: { TDS3Details: [], TotalTDS3Details: 0 },
  ScheduleTCS:      { TCS: [], TotalSchTCS: 0 },
  Verification:     verification(d),
  TaxReturnPreparer: { IdentificationNoOfTRP: '', NameOfTRP: d.caDetails?.name || 'RB Shah & Associates', ReImbFrmGov: 0 },
});

// ─── ITR-1 ────────────────────────────────────────────────────────────────────
function buildITR1(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess   = Math.max(0, tax - Math.round((Math.max(0,slab-rebate) + I(c.cgTax||0) + sc)));
  const ltcgG  = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcg   = build112ASummary(c.capitalGains);
  const hp     = I(c.hpIncome || 0);
  const gross  = I(c.grossSalary || 0);
  const stdDed = I(c.standardDeduction || 0);  // 0 when no salary
  const pTax   = I(c.professionalTax || 0);
  const os     = I((c.interestIncome||0) + (c.dividendIncome||0) + (c.cgSlabIncome||0));

  return { ITR: { ITR1: {
    CreationInfo: creationInfo(d.city),
    Form_ITR1:   { FormName:'ITR-1', Description:'For Individuals (Resident) income upto Rs.50 lakh', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
    PersonalInfo: {
      AssesseeName:     assesseeName(d.name),
      PAN:              (d.pan||'').toUpperCase(),
      Address:          buildAddress(d),
      SecondaryAdd:     'N',
      DOB:              d.dob || '',
      EmployerCategory: 'OTH',
      AadhaarCardNo:    d.aadhaar || '',
    },
    FilingStatus: {
      ReturnFileSec: 11, OptOutNewTaxRegime: Y(isOld), SeventhProvisio139: 'N',
      IncrExpAggAmt2LkTrvFrgnCntryFlg:'N', IncrExpAggAmt1LkElctrctyPrYrFlg:'N',
      clauseiv7provisio139i:'N', AsseseeRepFlg:'N', ItrFilingDueDate:'2026-07-31',
    },
    ITR1_IncomeDeductions: {
      GrossSalary: gross, Salary: gross, PerquisitesValue:0, ProfitsInSalary:0,
      AllwncExemptUs10: { AllwncExemptUs10Dtls: [] },
      NetSalary: I(c.salaryAfterStdDed || 0),
      DeductionUs16: stdDed + pTax, DeductionUs16ia: stdDed,
      EntertainmentAlw16ii:0, ProfessionalTaxUs16iii: pTax,
      IncomeFromSal: I(c.salaryAfterStdDed || 0),
      PropertyDetails: hp !== 0 ? [buildHPDetail(c, d, 1)] : [],
      TotalIncomeChargeableUnHP: hp,
      IncomeOthSrc: os, OthersInc: othersInc(c), DeductionUs57iia: 0,
      GrossTotIncome: I(c.grossTotal),
      GrossTotIncomeIncLTCG112A: I(c.grossTotal) + ltcgG,
      UsrDeductUndChapVIA: isOld ? chapVIA(c) : zeroChapVIA(),
      DeductUndChapVIA:    isOld ? chapVIA(c) : zeroChapVIA(),
      TotalIncome: taxInc,
      ExemptIncAgriOthUs10: { ExemptIncAgriOthUs10Dtls: [] },
    },
    ITR1_TaxComputation: {
      TotalTaxPayable: slab + I(c.cgTax||0), Rebate87A: rebate,
      TaxPayableOnRebate: Math.max(0, slab-rebate) + I(c.cgTax||0),
      EducationCess: Math.max(0, cess), GrossTaxLiability: tax,
      Section89: 0, NetTaxLiability: tax, TotalIntrstPay: I(c.est234B||0),
      IntrstPay: intrstPay(c), TotTaxPlusIntrstPay: tax + I(c.est234B||0),
    },
    TaxPaid:  { TaxesPaid: taxesPaid(c), BalTaxPayable: I(c.balanceDue) },
    Refund:   { RefundDue: I(c.refund), BankAccountDtls: bankDtls(d.bankAccounts) },
    ...scheduleCommon(c, d),
    TDSonSalaries:    tdsOnSalaries(c, d),
    TDSonOthThanSals: { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },
    TaxPayments:      { TaxPayment: [], TotalTaxPayments: I((c.advanceTax||0)+(c.selfAssessment||0)) },
    LTCG112A: ltcgG > 0 ? {
      TotSaleCnsdrn: ltcg.SaleValue112A,
      TotCstAcqisn:  ltcg.AcquisitionCost112A,
      LongCap112A:   Math.min(ltcgG, 125000),  // schema max 125000
    } : { TotSaleCnsdrn:0, TotCstAcqisn:0, LongCap112A:0 },
  }}};
}

// ─── ITR-2 ────────────────────────────────────────────────────────────────────
function buildITR2(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess   = Math.max(0, tax - Math.round((Math.max(0,slab-rebate)+I(c.cgTax||0)+sc)));
  const stcgG  = cgGain(c.capitalGains?.shares?.stcg || c.capitalGains?.shares?.stcg111a);
  const ltcgG  = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcgAboveExempt = Math.max(0, ltcgG - 125000);
  const stcg111A = build111ABlock(c.capitalGains);
  const ltcg112A = build112ASummary(c.capitalGains);
  const hp     = I(c.hpIncome || 0);
  const gross  = I(c.grossSalary || 0);
  const stdDed = I(c.standardDeduction || 0);
  const pTax   = I(c.professionalTax || 0);

  return { ITR: { ITR2: {
    CreationInfo: creationInfo(d.city),
    Form_ITR2:   { FormName:'ITR-2', Description:'For Individuals and HUFs not having income from profits and gains of business or profession', AssessmentYear:'2026', SchemaVer:'1.0', FormVer:'V1.0' },
    PartA_GEN1: {
      PersonalInfo: { AssesseeName:assesseeName(d.name), PAN:(d.pan||'').toUpperCase(), Address:buildAddress(d), SecondaryAdd:'N', DOB:d.dob||'', EmployerCategory:'OTH', AadhaarCardNo:d.aadhaar||'' },
      FilingStatus: { ReturnFileSec:11, OptOutNewTaxRegime:Y(isOld), SeventhProvisio139:'N', IncrExpAggAmt2LkTrvFrgnCntryFlg:'N', IncrExpAggAmt1LkElctrctyPrYrFlg:'N', clauseiv7provisio139i:'N', AsseseeRepFlg:'N', ItrFilingDueDate:'2026-07-31' },
    },
    ScheduleS: {
      Salaries:gross, AllwncExemptUs10:{AllwncExemptUs10Dtls:[]},
      NetSalary: I(c.salaryAfterStdDed||0),
      DeductionUs16:stdDed+pTax, DeductionUs16ia:stdDed, EntertainmentAlw:0, ProfessionalTax:pTax,
      IncChrgSal: I(c.salaryAfterStdDed||0), TotalIncomeOfHP:0,
    },
    ScheduleHP: { Propertys: hp !== 0 ? [buildHPDetail(c, d, 1)] : [], PassThroughIncome: 0 },
    ScheduleCGFor23: {
      ShortTermCapGainFor23: {
        EquityMFonSTT: stcgG > 0 ? [{ MFSectionCode:'1A', EquityMFonSTTDtls: stcg111A }] : [],
        TotSTCGChargblSpecRate: stcgG, TotalShortTermCapLoss:0, BalStCGAfterSetOff: stcgG, TotalSTCG: stcgG,
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
        TotLTCGChargblSpecRate: ltcgAboveExempt, LTCGLossSetOff:0, TotalLTCGLoss:0,
        BalLTCGAfterSetOff: ltcgAboveExempt,
      },
      SumOfCGIncm: stcgG + ltcgAboveExempt,
      IncmFromVDATrnsf: 0, TotScheduleCGFor23: stcgG + ltcgAboveExempt,
      CurrYrLosses: { LossSummaryDetail:[] }, AccruOrRecOfCG: { AccruOrRecOfCGDtls:[] },
    },
    Schedule112A: ltcgG > 0 ? ltcg112A : { Schedule112ADtls:[], SaleValue112A:0, CostAcqWithoutIndx112A:0, AcquisitionCost112A:0, LTCGBeforelowerB1B2112A:0, FairMktValueCapAst112A:0, ExpExclCnctTransfer112A:0, Deductions112A:0, Balance112A:0, TotalBalance112A:0 },
    Schedule115AD: { Schedule115ADDtls:[] },
    ScheduleVDA:   { ScheduleVDADtls:[] },
    ScheduleOS: {
      IncOthThanOwnRaceHorse: othersInc(c),
      TotOthSrcNoRaceHorse:   I((c.interestIncome||0)+(c.dividendIncome||0)),
      IncChargeable:          I((c.interestIncome||0)+(c.dividendIncome||0)),
      IncFrmLottery:{DateRange:[]}, IncFrmOnGames:{DateRange:[]}, DividendIncUs115BBDA:{DateRange:[]},
      DividendIncUs115BBDAaiii:{DateRange:[]}, DividendIncUs115A1ai:{DateRange:[]},
      DividendIncUs115A1aA:{DateRange:[]}, DividendIncUs115AC:{DateRange:[]},
      DividendIncUs115ACA:{DateRange:[]}, DividendIncUs115AD1i:{DateRange:[]},
      DividendDTAA:{DateRange:[]}, NOT89A:{DateRange:[]},
    },
    ScheduleCYLA: { CYLA:[] }, ScheduleBFLA: { BFLA:[] },
    'PartB-TI': {
      Salaries: I(c.salaryAfterStdDed||0),
      IncomeFromHP: hp, CapGain:{STCG:stcgG, LTCG:ltcgAboveExempt},
      IncFromOS:{ IncFromOS: I((c.interestIncome||0)+(c.dividendIncome||0)) },
      TotalTI: taxInc, CurrentYearLoss:0, BalanceAfterSetoffLosses:taxInc,
      BroughtFwdLossesSetoff:0, GrossTotalIncome: I(c.grossTotal),
      IncChargeTaxSplRate111A112: stcgG + ltcgAboveExempt,
      DeductionsUnderScheduleVIA: isOld ? I(c.totalDeductionsOld||0) : 0,
      TotalIncome: taxInc, IncChargeableTaxSplRates: stcgG + ltcgAboveExempt,
      NetAgricultureIncomeOrOtherIncomeForRate:0, AggregateIncome:taxInc,
      LossesOfCurrentYearCarriedFwd:0, DeemedIncomeUs115JC:0,
    },
    PartB_TTI: {
      TaxPayable: slab + I(c.cgTax||0), Rebate87A:rebate,
      TaxAfterRebate: Math.max(0,slab-rebate)+I(c.cgTax||0),
      HealthEduCess:cess, TotTaxLiability:tax, Section89:0, NetTaxLiab:tax,
      TotalIntrstPay: I(c.est234B||0), IntrstPay:intrstPay(c),
      TotTaxAndIntrstPay: tax + I(c.est234B||0),
      TaxPaid: { TaxesPaid:taxesPaid(c), BalTaxPayable: I(c.balanceDue) },
      Refund:  { RefundDue:I(c.refund), BankAccountDtls:bankDtls(d.bankAccounts) },
    },
    ScheduleVIA:  isOld ? chapVIA(c) : zeroChapVIA(),
    ...scheduleCommon(c, d),
    TDSonSalaries:    tdsOnSalaries(c, d),
    TDSonOthThanSals: { TDSonOthThanSalDtls:[], TotalTDSonOthThanSals:0 },
    TaxPayments:      { TaxPayment:[], TotalTaxPayments: I((c.advanceTax||0)+(c.selfAssessment||0)) },
  }}};
}

// ─── ITR-4 ────────────────────────────────────────────────────────────────────
function buildITR4(ret, d, c) {
  const isOld  = c.betterRegime === 'old';
  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess   = Math.max(0, tax - Math.round((Math.max(0,slab-rebate)+I(c.cgTax||0)+sc)));
  const biz    = I(c.businessIncome || 0);
  const gross  = I(c.grossSalary    || 0);
  const stdDed = I(c.standardDeduction || 0);
  const pTax   = I(c.professionalTax|| 0);
  const hp     = I(c.hpIncome       || 0);
  const is44AD  = ret?.profile === 'business';
  const is44ADA = ret?.profile === 'freelancer';
  const turn    = I(d.bizTurnover || c.bizTurnover || 0);
  const cashPct = Number(d.bizCashPct !== undefined ? d.bizCashPct : (c.bizCashPct ?? 50)) / 100;
  const bankT   = Math.round(turn * (1 - cashPct));
  const ltcgG   = cgGain(c.capitalGains?.shares?.ltcg || c.capitalGains?.shares?.ltcg112a);
  const ltcg112 = build112ASummary(c.capitalGains);

  return { ITR: { ITR4: {
    CreationInfo: creationInfo(d.city),
    Form_ITR4: { FormName:'ITR-4', Description:'For Individuals, HUFs and Firms (other than LLP) being a Resident', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
    PersonalInfo: { AssesseeName:assesseeName(d.name), PAN:(d.pan||'').toUpperCase(), Address:buildAddress(d), SecondaryAdd:'N', DOB:d.dob||'', EmployerCategory:'OTH', Status:'Individual', AadhaarCardNo:d.aadhaar||'' },
    FilingStatus: {
      ReturnFileSec:11, Form10IEAEarlierAYOldRegime:'N', AsseseeRepFlg:'N',
      ItrFilingDueDate:'2026-07-31', SeventhProvisio139:'N',
      IncrExpAggAmt2LkTrvFrgnCntryFlg:'N', IncrExpAggAmt1LkElctrctyPrYrFlg:'N',
      clauseiv7provisio139i:'N', F10IEACurrAYOldRegime: Y(isOld),
    },
    IncomeDeductions: {
      IncomeFromBusinessProf:biz, GrossSalary:gross, Salary:gross, PerquisitesValue:0, ProfitsInSalary:0,
      AllwncExemptUs10:{AllwncExemptUs10Dtls:[]},
      NetSalary: I(c.salaryAfterStdDed||0), DeductionUs16:stdDed+pTax, DeductionUs16ia:stdDed,
      EntertainmntalwncUs16ii:0, ProfessionalTaxUs16iii:pTax,
      IncomeFromSal: I(c.salaryAfterStdDed||0),
      PropertyDetails: hp !== 0 ? [buildHPDetail(c, d, 1)] : [],
      TotalIncomeChargeableUnHP: hp,
      IncomeOthSrc: I((c.interestIncome||0)+(c.dividendIncome||0)),
      OthersInc: othersInc(c), DeductionUs57iia:0,
      GrossTotIncome: I(c.grossTotal), GrossTotIncomeIncLTCG112A: I(c.grossTotal),
      UsrDeductUndChapVIA: isOld ? chapVIA(c) : zeroChapVIA(),
      DeductUndChapVIA:    isOld ? chapVIA(c) : zeroChapVIA(),
      TotalIncome: taxInc,
    },
    TaxComputation: {
      TotalTaxPayable: slab+I(c.cgTax||0), Rebate87A:rebate,
      TaxPayableOnRebate: Math.max(0,slab-rebate)+I(c.cgTax||0),
      EducationCess:cess, GrossTaxLiability:tax, Section89:0, NetTaxLiability:tax,
      IntrstPay:intrstPay(c), TotTaxPlusIntrstPay: tax+I(c.est234B||0),
    },
    ScheduleBP: {
      NatOfBus44AD: is44AD ? [{ NameOfBusiness: d.bizName||c.bizName||'Business', CodeAD: d.bizCodeAD||c.bizCodeAD||'09028', Description:'' }] : [],
      PersumptiveInc44AD: {
        GrsTotalTrnOver:         is44AD ? turn : 0,
        GrsTrnOverBank:          is44AD ? bankT : 0,
        GrsTotalTrnOverInCash:   is44AD ? turn-bankT : 0,
        GrsTrnOverAnyOthMode:    0,
        PersumptiveInc44AD6Per:  is44AD ? Math.round(bankT*(0.06)) : 0,
        PersumptiveInc44AD8Per:  is44AD ? Math.round((turn-bankT)*0.08) : 0,
        TotPersumptiveInc44AD:   is44AD ? biz : 0,
      },
      NatOfBus44ADA: is44ADA ? [{ NameOfBusiness: d.bizName||c.bizName||'Profession', CodeADA: d.bizCodeADA||c.bizCodeADA||'16019', Description:'' }] : [],
      PersumptiveInc44ADA: {
        GrsReceipt:                 is44ADA ? turn : 0,
        GrsTrnOverBank44ADA:        is44ADA ? bankT : 0,
        GrsTotalTrnOverInCash44ADA: is44ADA ? turn-bankT : 0,
        GrsTrnOverAnyOthMode44ADA:  0,
        TotPersumptiveInc44ADA:     is44ADA ? biz : 0,
      },
      NatOfBus44AE:[], GoodsDtlsUs44AE:[],
      PersumptiveInc44AE: { TotPersumptiveInc44AE:0 },
      TurnoverGrsRcptForGSTIN: (d.gstin||c.gstin) ? [{ GSTIN:(d.gstin||c.gstin), TurnoverGrsRcpt:turn }] : [],
      TotalTurnoverGrsRcptGSTIN: turn,
      FinanclPartclrOfBusiness: {
        PartnerMemberOwnCapital: I(d.bsCapital||c.bsCapital||0),
        SecuredLoans:0, UnSecuredLoans:0, Advances:0,
        SundryCreditors: I(d.bsCreditors||c.bsCreditors||0),
        OthrCurrLiab:0,
        TotCapLiabilities: I((d.bsCapital||c.bsCapital||0)+(d.bsCreditors||c.bsCreditors||0)),
        FixedAssets:0, Investments:0, Inventories:0,
        SundryDebtors: I(d.bsDebtors||c.bsDebtors||0),
        BalWithBanks:  I(d.bsBank||c.bsBank||0),
        CashInHand:    I(d.bsCash||c.bsCash||0),
        LoansAndAdvances:0, OtherAssets:0,
        // TotalAssets must equal TotCapLiabilities for balance sheet to balance
        TotalAssets: I((d.bsCapital||c.bsCapital||0)+(d.bsCreditors||c.bsCreditors||0)+(d.bsDebtors||c.bsDebtors||0)+(d.bsBank||c.bsBank||0)+(d.bsCash||c.bsCash||0)),
      },
    },
    TaxPaid:  { TaxesPaid:taxesPaid(c), BalTaxPayable:I(c.balanceDue) },
    Refund:   { RefundDue:I(c.refund), BankAccountDtls:bankDtls(d.bankAccounts) },
    ...scheduleCommon(c, d),
    TaxExmpIntIncDtls: { OthersInc: { OthersIncDtlsOthSrc:[] } },
    LTCG112A: ltcgG > 0 ? {
      TotSaleCnsdrn: ltcg112.SaleValue112A,
      TotCstAcqisn:  ltcg112.AcquisitionCost112A,
      LongCap112A:   Math.min(ltcgG, 125000),
    } : { TotSaleCnsdrn:0, TotCstAcqisn:0, LongCap112A:0 },
    TDSonSalaries:    gross > 0 ? tdsOnSalaries(c,d) : {TDSonSalary:[],TotalTDSonSalaries:0},
    TDSonOthThanSals: tdsOnOthThanSals(c, d, gross === 0),
    ScheduleTDS3Dtls: { TDS3Details:[], TotalTDS3Details:0 },
    ScheduleTCS:      { TCS:[], TotalSchTCS:0 },
    ScheduleIT:       { TaxPayment:[], TotalTaxPayments: I((c.advanceTax||0)+(c.selfAssessment||0)) },
    Verification:     verification(d),
    TaxReturnPreparer:{ IdentificationNoOfTRP:'', NameOfTRP: d.caDetails?.name||'RB Shah & Associates', ReImbFrmGov:0 },
  }}};
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function generateITRJson(itrForm, ret, d, c) {
  const comp = { ...c, ageGroup: c.ageGroup || ret?.ageGroup || '<60' };
  switch (itrForm) {
    case 'ITR-1': return buildITR1(ret, d, comp);
    case 'ITR-2': return buildITR2(ret, d, comp);
    case 'ITR-4': return buildITR4(ret, d, comp);
    case 'ITR-3':
      // ITR-3 (partners) requires separate CA preparation — cannot be auto-generated
      throw new Error(
        'ITR-3 is required for partners in a firm. This return must be prepared manually by your CA. ' +
        'Please contact RB Shah & Associates directly for partner return filing.'
      );
    default:
      throw new Error(`Unsupported ITR form: ${itrForm}. Please contact your CA.`);
  }
}

export function downloadITRJson(json, pan, ay) {
  const fn   = `${(pan||'NOPAN').toUpperCase()}_AY${(ay||'2026-27').replace('-','')}_ITR.json`;
  const blob = new Blob([JSON.stringify(json, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:fn });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
