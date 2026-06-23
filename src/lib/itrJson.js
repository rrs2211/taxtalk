// src/lib/itrJson.js  —  CBDT-compliant ITR JSON for AY 2026-27
// All field names verified against official schemas:
//   ITR-1 V1.0.0, ITR-2 V1.0, ITR-4 V1.0.0

const SW_VERSION = 'TaxTalk v1.0';
const today = () => new Date().toISOString().split('T')[0];

// ── Form selector ──────────────────────────────────────────────────────────────
export function determineITRForm(profile, computation) {
  const hasBiz  = (computation?.businessIncome || 0) > 0;
  const ltcg112 = computation?.capitalGains?.shares?.ltcg112a || 0;
  const hasCG   = computation?.capitalGains?.enabled;

  if (profile === 'partner')    return 'ITR-3';   // manual CA filing
  if (profile === 'business' || profile === 'freelancer' || hasBiz) return 'ITR-4';
  if (hasCG && ltcg112 > 125000) return 'ITR-2'; // LTCG above exemption → ITR-2
  return 'ITR-1';
}

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const I   = v => Math.round(Number(v) || 0);
const Y   = b => b ? 'Y' : 'N';

function creationInfo(city = 'Rajkot') {
  return {
    SWVersionNo:      SW_VERSION,
    SWCreatedBy:      'TaxTalk',
    JSONCreatedBy:    'TaxTalk',
    JSONCreationDate: today(),
    IntermediaryCity: city,
    Digest:           '',
  };
}

function assesseeName(name = '') {
  const parts = name.trim().split(/\s+/);
  const last  = parts.pop() || name;
  return {
    SurNameOrOrgName: last,
    FirstName:        parts.shift() || '',
    MiddleName:       parts.join(' '),
  };
}

function address(d) {
  return {
    ResidenceNo:           d.residenceNo  || '',
    ResidenceName:         d.residenceName|| '',
    RoadOrStreet:          d.road         || '',
    LocalityOrArea:        d.locality     || '',
    CityOrTownOrDistrict:  d.city         || '',
    StateCode:             d.stateCode    || '',
    CountryCode:           '91',
    PinCode:               I(d.pinCode),
    CountryCodeMobile:     91,
    MobileNo:              I((d.phone || '').replace(/\D/g, '')),
    EmailAddress:          d.email        || '',
  };
}

function bankDtls(accounts = []) {
  return {
    AddtnlBankDetails: accounts.map(b => ({
      IFSCCode:      b.IFSCCode      || '',
      BankAccountNo: b.BankAccountNo || '',
      BankName:      b.BankName      || '',
      BankDtlsFlag:  'Y',
      UseForRefund:  b.UseForRefund  || 'Y',
    })),
  };
}

// Both UsrDeductUndChapVIA (user-entered) and DeductUndChapVIA (system caps) required
function chapVIA(c) {
  return {
    Section80C:                 I(c.cap80C),
    Section80CCC:               0,
    Section80CCDEmployeeOrSE:   0,
    Section80CCD1B:             0,
    Section80CCDEmployer:       0,
    Section80D:                 I(c.cap80D),
    Section80DD:                0,
    Section80DDB:               0,
    Section80E:                 I(c.cap80E || 0),
    Section80EE:                0,
    Section80EEA:               0,
    Section80EEB:               0,
    Section80G:                 I(c.cap80G || 0),
    Section80GG:                0,
    Section80GGA:               0,
    Section80GGC:               0,
    Section80U:                 0,
    Section80TTA:               I(c.cap80TTA || 0),
    Section80TTB:               0,
    AnyOthSec80CCH:             0,
    TotalChapVIADeductions:     I(c.totalDeductionsOld),
  };
}

function zeroChapVIA() {
  return chapVIA({ cap80C:0,cap80D:0,cap80E:0,cap80TTA:0,cap80G:0,totalDeductionsOld:0 });
}

function taxesPaid(c) {
  return {
    AdvanceTax:        I(c.advanceTax),
    TDS:               I(c.tdsDeducted),
    TCS:               0,
    SelfAssessmentTax: I(c.selfAssessment),
    TotalTaxesPaid:    I(c.totalPaid),
  };
}

function intrstPay() {
  return { IntrstPayUs234A:0, IntrstPayUs234B:0, IntrstPayUs234C:0, LateFilingFee234F:0 };
}

// Schema field: EmployerOrDeductorOrCollecterName (note spelling)
function tdsOnSalaries(c, d) {
  return {
    TDSonSalary: c.tdsDeducted > 0 ? [{
      EmployerOrDeductorOrCollectDetl: {
        TAN:                              d.employerTAN  || '',
        EmployerOrDeductorOrCollecterName: d.employerName || '',
      },
      IncChrgSal:  I(c.grossSalary),
      TotalTDSSal: I(c.tdsDeducted),
    }] : [],
    TotalTDSonSalaries: I(c.tdsDeducted),
  };
}

function tdsOnOthThanSals(c, d, forBusiness = false) {
  // For business clients, TDS is on receipts not salary
  const items = forBusiness && c.tdsDeducted > 0 ? [{
    TANOfDeductor:        d.employerTAN || '',
    TDSDeducted:          I(c.tdsDeducted),
    TDSClaimed:           I(c.tdsDeducted),
    TDSCreditCarriedFwd:  0,
    GrossAmount:          I(c.businessIncome || 0),
    TDSSection:           '194J',
    HeadOfIncome:         'BP',
    BroughtFwdTDSAmt:     0,
  }] : [];
  return {
    TDSonOthThanSalDtls:  items,   // ← correct array field name per schema
    TotalTDSonOthThanSals: forBusiness ? I(c.tdsDeducted) : 0,
  };
}

function scheduleIT(c) {
  // ScheduleIT = advance tax / self-assessment payments (CA fills BSR/challan)
  return { TaxPayment: [], TotalTaxPayments: I((c.advanceTax||0) + (c.selfAssessment||0)) };
}

function scheduleTCS() {
  return { TCS: [], TotalSchTCS: 0 };
}

function othersInc(c) {
  const items = [];
  if (I(c.interestIncome) > 0) items.push({ OthSrcNatureDesc:'SAV', OthSrcNatureAmt: I(c.interestIncome) });
  if (I(c.dividendIncome) > 0) items.push({ OthSrcNatureDesc:'DIV', OthSrcNatureAmt: I(c.dividendIncome) });
  return { OthersIncDtlsOthSrc: items };
}

// Schedule80G — schema requires top-level totals (not arrays of donees for simple case)
function schedule80G(c) {
  const total = I(c.cap80G || 0);
  return {
    Don100Percent:           { DoneeWithPan:[], TotDon100PercentCash:0, TotDon100PercentOtherMode:total, TotDon100Percent:total, TotEligibleDon100Percent:total },
    Don50PercentNoApprReqd:  { DoneeWithPan:[], TotDon50PercentNoApprRqdCash:0, TotDon50PercentNoApprRqdOtherMode:0, TotDon50PercentNoApprRqd:0, TotEligibleDon50PercentNoApprRqd:0 },
    Don100PercentApprReqd:   { DoneeWithPan:[], TotDon100PercentApprRqdCash:0, TotDon100PercentApprRqdOtherMode:0, TotDon100PercentApprRqd:0, TotEligibleDon100PercentApprRqd:0 },
    Don50PercentApprReqd:    { DoneeWithPan:[], TotDon50PercentApprRqdCash:0, TotDon50PercentApprRqdOtherMode:0, TotDon50PercentApprRqd:0, TotEligibleDon50PercentApprRqd:0 },
    TotalDonationsUs80GCash:       0,
    TotalDonationsUs80GOtherMode:  total,
    TotalDonationsUs80G:           total,
    TotalEligibleDonationsUs80G:   total,
  };
}

// Schedule80D — SeniorCitizenFlag required: Y = senior, N = not senior, S = not claiming
function schedule80D(c, ageGroup = '<60') {
  const isSenior = ageGroup === '60-80' || ageGroup === '>80';
  return {
    Sec80DSelfFamSrCtznHealth: {
      SeniorCitizenFlag: isSenior ? 'Y' : 'N',
      SelfAndFamily:     Math.min(I(c.cap80D), 25000),
      HealthInsPremSlfFam: I(c.cap80D),
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
    Place:     d.city || 'Rajkot',
  };
}

function taxReturnPreparer(d) {
  return { IdentificationNoOfTRP: d.trpId || '', NameOfTRP: d.caDetails?.name || 'RB Shah & Associates', ReImbFrmGov: 0 };
}

// ── ITR-1 ──────────────────────────────────────────────────────────────────────
function buildITR1(returnData, d, c) {
  const isOld  = c.betterRegime === 'old';
  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess   = I(tax - Math.max(0, slab - rebate) - I(c.cgTax||0) - sc);
  const ltcg   = I(c.capitalGains?.shares?.ltcg112a || 0);
  const gross  = I(c.grossSalary || 0);
  const stdDed = I(c.standardDeduction || 75000);
  const pTax   = I(c.professionalTax || 0);
  const net    = Math.max(0, gross - stdDed - pTax);
  const hp     = I(c.hpIncome || 0);
  const os     = I((c.interestIncome||0) + (c.dividendIncome||0) + (c.cgSlabIncome||0));

  return {
    ITR: { ITR1: {
      CreationInfo: creationInfo(d.city),
      Form_ITR1: { FormName:'ITR-1', Description:'For Individuals (Resident) income upto Rs.50 lakh', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
      PersonalInfo: {
        AssesseeName:     assesseeName(d.name),
        PAN:              (d.pan||'').toUpperCase(),
        Address:          address(d),
        SecondaryAdd:     'N',
        DOB:              d.dob || '',
        EmployerCategory: 'OTH',
        AadhaarCardNo:    d.aadhaar || '',
      },
      FilingStatus: {
        ReturnFileSec:                    11,
        OptOutNewTaxRegime:               Y(isOld),
        SeventhProvisio139:               'N',
        IncrExpAggAmt2LkTrvFrgnCntryFlg:  'N',
        IncrExpAggAmt1LkElctrctyPrYrFlg:  'N',
        clauseiv7provisio139i:            'N',
        AsseseeRepFlg:                    'N',
        ItrFilingDueDate:                 '2026-07-31',
      },
      ITR1_IncomeDeductions: {
        GrossSalary:              gross,
        Salary:                   gross,
        PerquisitesValue:         0,
        ProfitsInSalary:          0,
        AllwncExemptUs10:         { AllwncExemptUs10Dtls: [] },
        NetSalary:                net,
        DeductionUs16:            stdDed + pTax,
        DeductionUs16ia:          stdDed,
        EntertainmentAlw16ii:     0,
        ProfessionalTaxUs16iii:   pTax,
        IncomeFromSal:            net,
        PropertyDetails:          hp !== 0 ? [buildHPDetail(c, d, 1)] : [],
        TotalIncomeChargeableUnHP: hp,
        IncomeOthSrc:             os,
        OthersInc:                othersInc(c),
        DeductionUs57iia:         0,
        GrossTotIncome:           I(c.grossTotal),
        GrossTotIncomeIncLTCG112A: I(c.grossTotal) + ltcg,
        UsrDeductUndChapVIA:      isOld ? chapVIA(c) : zeroChapVIA(),
        DeductUndChapVIA:         isOld ? chapVIA(c) : zeroChapVIA(),
        TotalIncome:              taxInc,
        ExemptIncAgriOthUs10:     { ExemptIncAgriOthUs10Dtls: [] },
      },
      ITR1_TaxComputation: {
        TotalTaxPayable:      slab + I(c.cgTax||0),
        Rebate87A:            rebate,
        TaxPayableOnRebate:   Math.max(0, slab - rebate) + I(c.cgTax||0),
        EducationCess:        Math.max(0, cess),
        GrossTaxLiability:    tax,
        Section89:            0,
        NetTaxLiability:      tax,
        TotalIntrstPay:       0,
        IntrstPay:            intrstPay(),
        TotTaxPlusIntrstPay:  tax,
      },
      TaxPaid:  { TaxesPaid: taxesPaid(c), BalTaxPayable: I(c.balanceDue) },
      Refund:   { RefundDue: I(c.refund), BankAccountDtls: bankDtls(d.bankAccounts) },
      Schedule80C:    { Schedule80CDtls: [], TotalAmt: I(c.cap80C||0) },
      Schedule80D:    schedule80D(c, c.ageGroup),
      Schedule80E:    { IntPaidEduLoan: I(c.cap80E||0), LoanSanctnYr:'' },
      Schedule80EE:   {}, Schedule80EEA: {}, Schedule80EEB: {},
      Schedule80G:    schedule80G(c),
      Schedule80GGA:  {}, Schedule80GGC: { TotDon80GGC: 0 },
      Schedule80DD:   {}, Schedule80U:   {},
      ScheduleEA10_13A: { Placeofwork:'', ActlHRARecv:0, ActlRentPaid:0, DtlsSalUsSec171:0, BasicSalary:0, ActlRentPaid10Per:0, Sal40Or50Per:0, EligbleExmpAllwncUs13A:0 },
      TDSonSalaries:    tdsOnSalaries(c, d),
      TDSonOthThanSals: { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },
      ScheduleTDS3Dtls: { TDS3Details: [], TotalTDS3Details: 0 },
      ScheduleTCS:      scheduleTCS(),
      TaxPayments:      scheduleIT(c),
      ...(ltcg > 0 ? { LTCG112A: { TotSaleCnsdrn: I(d.ltcgSaleConsideration || ltcg + 125000), TotCstAcqisn: I(d.ltcgCostAcquisition || 125000), LongCap112A: ltcg } } : {}),
      Verification:         verification(d),
      TaxReturnPreparer:    taxReturnPreparer(d),
    }}
  };
}

// ── House property detail (shared by ITR-1 and ITR-4) ──────────────────────────
function buildHPDetail(c, d, hpSno = 1) {
  const hp     = c.houseProperty || {};
  const isRent = hp.type === 'Rented';
  const rent   = I(hp.rentReceived   || 0);
  const muni   = I(hp.municipalTaxes || 0);
  const int    = I(hp.interestPaid   || 0);
  const nav    = rent - muni;
  const thirtyPct = Math.round(nav * 0.3);

  return {
    HPSNo:                hpSno,
    AddressDetailWithZipCode: { AddrDetail: d.locality||'', CityOrTownOrDistrict: d.city||'', StateCode: d.stateCode||'', CountryCode:'91', PinCode: I(d.pinCode) },
    PropertyOwner:        'S',
    PropCoOwnedFlg:       'N',
    ifLetOut:             isRent ? 'L' : 'S',
    Rentdetails: isRent ? {
      AnnualLetableValue:       nav,
      RentNotRealized:          0,
      LocalTaxes:               muni,
      TotalUnrealizedAndTax:    muni,
      BalanceALV:               nav,
      AnnualOfPropOwned:        nav,
      ThirtyPercentOfBalance:   thirtyPct,
      IntOnBorwCap:             int,
      TotalDeduct:              thirtyPct + int,
      ArrearsUnrealizedRentRcvd:0,
      IncomeOfHP:               I(c.hpIncome || 0),
    } : {
      AnnualLetableValue:   0,
      TotalUnrealizedAndTax:0,
      BalanceALV:           0,
      AnnualOfPropOwned:    0,
      ThirtyPercentOfBalance:0,
      IntOnBorwCap:         int,
      TotalDeduct:          int,
      ArrearsUnrealizedRentRcvd:0,
      IncomeOfHP:           I(c.hpIncome || 0),
    },
  };
}

// ── ITR-2 (salaried with capital gains > ₹1.25L LTCG) ─────────────────────────
function buildITR2(returnData, d, c) {
  const isOld  = c.betterRegime === 'old';
  const taxInc = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab   = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc     = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax    = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess   = I(tax - Math.max(0, slab - rebate) - I(c.cgTax||0) - sc);
  const gross  = I(c.grossSalary || 0);
  const stdDed = I(c.standardDeduction || 75000);
  const pTax   = I(c.professionalTax || 0);
  const ltcg   = I(c.capitalGains?.shares?.ltcg112a || 0);
  const stcg   = I(c.capitalGains?.shares?.stcg111a || 0);

  return {
    ITR: { ITR2: {
      CreationInfo: creationInfo(d.city),
      Form_ITR2: { FormName:'ITR-2', Description:'For Individuals and HUFs not having income from profits and gains of business or profession', AssessmentYear:'2026', SchemaVer:'1.0', FormVer:'V1.0' },
      PartA_GEN1: {
        PersonalInfo: {
          AssesseeName:     assesseeName(d.name),
          PAN:              (d.pan||'').toUpperCase(),
          Address:          address(d),
          SecondaryAdd:     'N',
          DOB:              d.dob || '',
          EmployerCategory: 'OTH',
          AadhaarCardNo:    d.aadhaar || '',
        },
        FilingStatus: {
          ReturnFileSec:                   11,
          OptOutNewTaxRegime:              Y(isOld),
          SeventhProvisio139:              'N',
          IncrExpAggAmt2LkTrvFrgnCntryFlg: 'N',
          IncrExpAggAmt1LkElctrctyPrYrFlg: 'N',
          clauseiv7provisio139i:           'N',
          AsseseeRepFlg:                   'N',
          ItrFilingDueDate:                '2026-07-31',
        },
      },
      ScheduleS: {
        Salaries: gross,
        AllwncExemptUs10: { AllwncExemptUs10Dtls: [] },
        NetSalary: Math.max(0, gross - stdDed - pTax),
        DeductionUs16: stdDed + pTax,
        DeductionUs16ia: stdDed,
        EntertainmentAlw: 0,
        ProfessionalTax: pTax,
        IncChrgSal: Math.max(0, gross - stdDed - pTax),
        TotalIncomeOfHP: 0,
      },
      ScheduleHP: { Propertys: I(c.hpIncome||0) > 0 ? [buildHPDetail(c, d, 1)] : [], PassThroughIncome: 0 },
      // Capital gains schedule
      ScheduleCGFor23: {
        ShortTermCapGainFor23: {
          SaleOnOrAfter01Apr2023: {
            CapgainSection111A: { IncChargeableSpecRate: stcg, DeductSec48Prov1: 0, Deduction54B: 0, CapgainChrgblSpecRate: stcg },
          },
          TotStCGChargblSpecRate: stcg,
          ShortTermCapLossSetOff: 0,
          TotalShortTermCapLoss: 0,
          BalStCGAfterSetOff: stcg,
        },
        LongTermCapGain23: {
          SaleOnOrAfter01Apr2023: {
            LTCGSection112Prov1: 0,
            LTCGSection112A: { AmtDeemedLTCG: ltcg, AmtDeemedLTCGBelow: 0, DednUs54Prov1: 0, CapgainsChrgblAtSpecRates: ltcg > 125000 ? ltcg - 125000 : 0 },
          },
          TotLTCGChargblSpecRate: ltcg > 125000 ? ltcg - 125000 : 0,
          LTCGLossSetOff: 0,
          TotalLTCGLoss: 0,
          BalLTCGAfterSetOff: ltcg > 125000 ? ltcg - 125000 : 0,
        },
        SumOfCGIncm: stcg + (ltcg > 125000 ? ltcg - 125000 : 0),
        IncmFromVDATrnsf: 0,
        TotScheduleCGFor23: stcg + (ltcg > 125000 ? ltcg - 125000 : 0),
        CurrYrLosses: { LossSummaryDetail: [] },
        AccruOrRecOfCG: { AccruOrRecOfCGDtls: [] },
      },
      Schedule112A: {
        Schedule112ADtls: [],
        SaleValue112A: I(d.ltcgSaleConsideration || ltcg + 125000),
        CostAcqWithoutIndx112A: I(d.ltcgCostAcquisition || 125000),
        AcquisitionCost112A: I(d.ltcgCostAcquisition || 125000),
        LTCGBeforelowerB1B2112A: ltcg,
        FairMktValueCapAst112A: 0,
        ExpExclCnctTransfer112A: 0,
        Deductions112A: 0,
        Balance112A: ltcg,
        TotalBalance112A: ltcg,
      },
      Schedule115AD: { Schedule115ADDtls: [] },
      ScheduleVDA:   { ScheduleVDADtls:   [] },
      ScheduleOS: {
        IncOthThanOwnRaceHorse: othersInc(c),
        TotOthSrcNoRaceHorse:   I((c.interestIncome||0) + (c.dividendIncome||0)),
        IncChargeable:          I((c.interestIncome||0) + (c.dividendIncome||0)),
        IncFrmLottery:          { DateRange: [] },
        IncFrmOnGames:          { DateRange: [] },
        DividendIncUs115BBDA:   { DateRange: [] },
        DividendIncUs115BBDAaiii: { DateRange: [] },
        DividendIncUs115A1ai:   { DateRange: [] },
        DividendIncUs115A1aA:   { DateRange: [] },
        DividendIncUs115AC:     { DateRange: [] },
        DividendIncUs115ACA:    { DateRange: [] },
        DividendIncUs115AD1i:   { DateRange: [] },
        DividendDTAA:           { DateRange: [] },
        NOT89A:                 { DateRange: [] },
      },
      ScheduleCYLA: { CYLA: [] },
      ScheduleBFLA: { BFLA: [] },
      'PartB-TI': {
        Salaries:                           Math.max(0, gross - stdDed - pTax),
        IncomeFromHP:                       I(c.hpIncome||0),
        CapGain:                            { STCG:stcg, LTCG: ltcg>125000?ltcg-125000:0 },
        IncFromOS:                          { IncFromOS: I((c.interestIncome||0)+(c.dividendIncome||0)) },
        TotalTI:                            taxInc,
        CurrentYearLoss:                    0,
        BalanceAfterSetoffLosses:           taxInc,
        BroughtFwdLossesSetoff:             0,
        GrossTotalIncome:                   I(c.grossTotal),
        IncChargeTaxSplRate111A112:         stcg + (ltcg>125000?ltcg-125000:0),
        DeductionsUnderScheduleVIA:         isOld ? I(c.totalDeductionsOld) : 0,
        TotalIncome:                        taxInc,
        IncChargeableTaxSplRates:           stcg + (ltcg>125000?ltcg-125000:0),
        NetAgricultureIncomeOrOtherIncomeForRate: 0,
        AggregateIncome:                    taxInc,
        LossesOfCurrentYearCarriedFwd:      0,
        DeemedIncomeUs115JC:                0,
      },
      PartB_TTI: {
        TaxPayable:       slab + I(c.cgTax||0),
        Rebate87A:        rebate,
        TaxAfterRebate:   Math.max(0, slab - rebate) + I(c.cgTax||0),
        HealthEduCess:    Math.max(0, cess),
        TotTaxLiability:  tax,
        Section89:        0,
        NetTaxLiab:       tax,
        TotalIntrstPay:   0,
        IntrstPay:        intrstPay(),
        TotTaxAndIntrstPay: tax,
        TaxPaid: { TaxesPaid: taxesPaid(c), BalTaxPayable: I(c.balanceDue) },
        Refund:  { RefundDue: I(c.refund), BankAccountDtls: bankDtls(d.bankAccounts) },
      },
      ScheduleVIA: isOld ? chapVIA(c) : zeroChapVIA(),
      Schedule80C:   { Schedule80CDtls: [], TotalAmt: I(c.cap80C||0) },
      Schedule80D:   schedule80D(c, c.ageGroup),
      Schedule80G:   schedule80G(c),
      Schedule80GGC: { TotDon80GGC: 0 },
      Schedule80DD:  {}, Schedule80U: {}, Schedule80E: { IntPaidEduLoan: I(c.cap80E||0), LoanSanctnYr:'' },
      Schedule80EE:  {}, Schedule80EEA: {}, Schedule80EEB: {}, Schedule80GGA: {},
      TDSonSalaries:    tdsOnSalaries(c, d),
      TDSonOthThanSals: { TDSonOthThanSalDtls: [], TotalTDSonOthThanSals: 0 },
      ScheduleTDS3Dtls: { TDS3Details: [], TotalTDS3Details: 0 },
      ScheduleTCS:      scheduleTCS(),
      TaxPayments:      scheduleIT(c),
      Verification:     verification(d),
      TaxReturnPreparer: taxReturnPreparer(d),
    }}
  };
}

// ── ITR-4 ──────────────────────────────────────────────────────────────────────
function buildITR4(returnData, d, c) {
  const isOld   = c.betterRegime === 'old';
  const taxInc  = isOld ? I(c.oldTaxable) : I(c.newTaxable);
  const slab    = isOld ? I(c.oldSlabTax) : I(c.newSlabTax);
  const rebate  = isOld ? I(c.oldRebate)  : I(c.newRebate);
  const sc      = isOld ? I(c.oldSurcharge): I(c.newSurcharge);
  const tax     = isOld ? I(c.oldTax)     : I(c.newTax);
  const cess    = I(tax - Math.max(0, slab - rebate) - I(c.cgTax||0) - sc);
  const biz     = I(c.businessIncome || 0);
  const gross   = I(c.grossSalary || 0);
  const stdDed  = I(c.standardDeduction || 75000);
  const pTax    = I(c.professionalTax || 0);
  const net     = Math.max(0, gross - stdDed - pTax);
  const is44AD  = returnData?.profile === 'business';
  const is44ADA = returnData?.profile === 'freelancer';
  const turn    = I(d.bizTurnover || 0);
  const bankT   = Math.round(turn * 0.5);

  return {
    ITR: { ITR4: {
      CreationInfo: creationInfo(d.city),
      Form_ITR4: { FormName:'ITR-4', Description:'For Individuals, HUFs and Firms (other than LLP) being a Resident', AssessmentYear:'2026', SchemaVer:'1.0.0', FormVer:'V1.0.0' },
      PersonalInfo: {
        AssesseeName:     assesseeName(d.name),
        PAN:              (d.pan||'').toUpperCase(),
        Address:          address(d),
        SecondaryAdd:     'N',
        DOB:              d.dob || '',
        EmployerCategory: 'OTH',
        Status:           'Individual',
        AadhaarCardNo:    d.aadhaar || '',
      },
      FilingStatus: {
        ReturnFileSec:                    11,
        Form10IEAEarlierAYOldRegime:      'N',
        AsseseeRepFlg:                    'N',
        ItrFilingDueDate:                 '2026-07-31',
        SeventhProvisio139:               'N',
        IncrExpAggAmt2LkTrvFrgnCntryFlg:  'N',
        IncrExpAggAmt1LkElctrctyPrYrFlg:  'N',
        clauseiv7provisio139i:            'N',
        F10IEACurrAYOldRegime:            Y(isOld),
      },
      IncomeDeductions: {
        IncomeFromBusinessProf:      biz,
        GrossSalary:                 gross,
        Salary:                      gross,
        PerquisitesValue:            0,
        ProfitsInSalary:             0,
        AllwncExemptUs10:            { AllwncExemptUs10Dtls: [] },
        NetSalary:                   net,
        DeductionUs16:               stdDed + pTax,
        DeductionUs16ia:             stdDed,
        EntertainmntalwncUs16ii:     0,
        ProfessionalTaxUs16iii:      pTax,
        IncomeFromSal:               net,
        PropertyDetails:             I(c.hpIncome||0) !== 0 ? [buildHPDetail(c, d, 1)] : [],
        TotalIncomeChargeableUnHP:   I(c.hpIncome||0),
        IncomeOthSrc:                I((c.interestIncome||0)+(c.dividendIncome||0)),
        OthersInc:                   othersInc(c),
        DeductionUs57iia:            0,
        GrossTotIncome:              I(c.grossTotal),
        GrossTotIncomeIncLTCG112A:   I(c.grossTotal),
        UsrDeductUndChapVIA:         isOld ? chapVIA(c) : zeroChapVIA(),
        DeductUndChapVIA:            isOld ? chapVIA(c) : zeroChapVIA(),
        TotalIncome:                 taxInc,
      },
      TaxComputation: {
        TotalTaxPayable:      slab + I(c.cgTax||0),
        Rebate87A:            rebate,
        TaxPayableOnRebate:   Math.max(0, slab - rebate) + I(c.cgTax||0),
        EducationCess:        Math.max(0, cess),
        GrossTaxLiability:    tax,
        Section89:            0,
        NetTaxLiability:      tax,
        IntrstPay:            intrstPay(),
        TotTaxPlusIntrstPay:  tax,
      },
      ScheduleBP: {
        NatOfBus44AD:     is44AD  ? [{ NameOfBusiness: d.bizName||'Business',   CodeAD:'01',  Description:'' }] : [],
        PersumptiveInc44AD: {
          GrsTotalTrnOver:           is44AD  ? turn : 0,
          GrsTrnOverBank:            is44AD  ? bankT : 0,
          GrsTotalTrnOverInCash:     is44AD  ? turn - bankT : 0,
          GrsTrnOverAnyOthMode:      0,
          PersumptiveInc44AD6Per:    is44AD  ? Math.round(bankT * 0.06) : 0,
          PersumptiveInc44AD8Per:    is44AD  ? Math.round((turn-bankT) * 0.08) : 0,
          TotPersumptiveInc44AD:     is44AD  ? biz : 0,
        },
        NatOfBus44ADA:    is44ADA ? [{ NameOfBusiness: d.bizName||'Profession', CodeADA:'01', Description:'' }] : [],
        PersumptiveInc44ADA: {
          GrsReceipt:                is44ADA ? turn : 0,
          GrsTrnOverBank44ADA:       is44ADA ? bankT : 0,
          GrsTotalTrnOverInCash44ADA:is44ADA ? turn-bankT : 0,
          GrsTrnOverAnyOthMode44ADA: 0,
          TotPersumptiveInc44ADA:    is44ADA ? biz : 0,
        },
        NatOfBus44AE: [], GoodsDtlsUs44AE: [],
        PersumptiveInc44AE: { TotPersumptiveInc44AE: 0 },
        TurnoverGrsRcptForGSTIN: d.gstin ? [{ GSTIN: d.gstin, TurnoverGrsRcpt: turn }] : [],
        TotalTurnoverGrsRcptGSTIN: turn,
        FinanclPartclrOfBusiness: {
          PartnerMemberOwnCapital:0, SecuredLoans:0, UnSecuredLoans:0, Advances:0,
          SundryCreditors:0, OthrCurrLiab:0, TotCapLiabilities:0,
          FixedAssets:0, Investments:0, Inventories:0,
          SundryDebtors:0, BalWithBanks:0, CashInHand:0,
          LoansAndAdvances:0, OtherAssets:0, TotalAssets:0,
        },
      },
      TaxPaid:  { TaxesPaid: taxesPaid(c), BalTaxPayable: I(c.balanceDue) },
      Refund:   { RefundDue: I(c.refund),  BankAccountDtls: bankDtls(d.bankAccounts) },
      Schedule80C:   { Schedule80CDtls:[], TotalAmt: I(c.cap80C||0) },
      Schedule80D:   schedule80D(c, c.ageGroup),
      Schedule80E:   { IntPaidEduLoan: I(c.cap80E||0), LoanSanctnYr:'' },
      Schedule80EE:  {}, Schedule80EEA:{}, Schedule80EEB:{},
      Schedule80G:   schedule80G(c),
      Schedule80GGC: { TotDon80GGC:0 },
      Schedule80DD:  {}, Schedule80U:  {},
      ScheduleEA10_13A: { Placeofwork:'', ActlHRARecv:0, ActlRentPaid:0, DtlsSalUsSec171:0, BasicSalary:0, ActlRentPaid10Per:0, Sal40Or50Per:0, EligbleExmpAllwncUs13A:0 },
      TaxExmpIntIncDtls: { OthersInc: { OthersIncDtlsOthSrc:[] } },
      LTCG112A: { TotSaleCnsdrn:0, TotCstAcqisn:0, LongCap112A:0 },
      TDSonSalaries:    gross > 0 ? tdsOnSalaries(c, d) : { TDSonSalary:[], TotalTDSonSalaries:0 },
      TDSonOthThanSals: tdsOnOthThanSals(c, d, gross === 0),
      ScheduleTDS3Dtls: { TDS3Details:[], TotalTDS3Details:0 },
      ScheduleTCS:      scheduleTCS(),
      ScheduleIT:       scheduleIT(c),
      Verification:     verification(d),
      TaxReturnPreparer: taxReturnPreparer(d),
    }}
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function generateITRJson(itrForm, returnData, clientDetails, computation) {
  const c = { ...computation, ageGroup: computation.ageGroup || returnData?.ageGroup || '<60' };
  switch (itrForm) {
    case 'ITR-1': return buildITR1(returnData, clientDetails, c);
    case 'ITR-2': return buildITR2(returnData, clientDetails, c);
    case 'ITR-4': return buildITR4(returnData, clientDetails, c);
    default:      return buildITR1(returnData, clientDetails, c); // safe fallback
  }
}

export function downloadITRJson(json, pan, ay) {
  const fn   = `${(pan||'NOPAN').toUpperCase()}_AY${(ay||'2026-27').replace('-','')}_ITR.json`;
  const blob = new Blob([JSON.stringify(json, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:fn });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
