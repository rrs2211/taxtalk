// src/components/CAReturnEditor.jsx
// Full return editor for CA — allows editing any income head, deductions, taxes paid
// Includes bank account validation before allowing filing

import React, { useState, useEffect } from 'react';
import { Save, Loader, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { computeTax, formatINR } from '../data/flow.js';
import CGCollector from './CGCollector.jsx';
import { caUpdateReturn } from '../lib/supabase.js';
import { Button } from './UI.jsx';

const INP = {
  style: {
    width: '100%', padding: '8px 10px',
    border: '1px solid var(--border-strong)',
    borderRadius: 6, fontSize: 13, outline: 'none',
    background: 'var(--surface)', color: 'var(--text-primary)',
    fontFamily: 'inherit', boxSizing: 'border-box',
  }
};
const LBL = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 };
const SEC = ({ t }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px', paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>{t}</div>
);

function NumField({ label, value, onChange, note, max }) {
  return (
    <div>
      <label style={LBL}>{label}{note && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>{note}</span>}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>₹</span>
        <input type="number" {...INP} value={value || ''} placeholder="0"
          onChange={e => { const v = parseInt(e.target.value) || 0; onChange(max ? Math.min(v, max) : v); }}
          style={{ ...INP.style, flex: 1 }} />
      </div>
      {max && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Max ₹{max.toLocaleString('en-IN')}</div>}
    </div>
  );
}
function TxtField({ label, value, onChange, placeholder, upper }) {
  return (
    <div>
      <label style={LBL}>{label}</label>
      <input type="text" {...INP} value={value || ''} placeholder={placeholder || ''}
        onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} />
    </div>
  );
}
function SelField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={LBL}>{label}</label>
      <select {...INP} value={value || ''} onChange={e => onChange(e.target.value)} style={{ ...INP.style, cursor: 'pointer' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function CAReturnEditor({ ret, kycData, onSave, onClose }) {
  const comp = ret?.computation || {};

  // ── Income ────────────────────────────────────────────────────
  const [grossSalary,    setGrossSalary]    = useState(comp.grossSalary    || 0);
  const [stdDed,         setStdDed]         = useState(comp.standardDeduction || 75000);
  const [profTax,        setProfTax]        = useState(comp.professionalTax || 0);
  const [businessIncome, setBizIncome]      = useState(comp.businessIncome || 0);
  const [bizTurnover,    setBizTurnover]    = useState(comp.bizTurnover    || 0);
  const [bizCashPct,     setBizCashPct]     = useState(comp.bizCashPct     || 0);
  const [bizName,        setBizName]        = useState(comp.bizName        || '');
  const [bizCodeAD,      setBizCodeAD]      = useState(comp.bizCodeAD      || '09028');
  const [savingsInt,     setSavingsInt]     = useState(comp.savingsInterest || 0);
  const [fdInt,          setFdInt]          = useState(comp.fdInterest     || 0);
  const [dividendIncome, setDividend]       = useState(comp.dividendIncome || 0);
  const [otherOSIncome,  setOtherOS]        = useState(comp.otherIncome    || 0);

  // HP
  const [hpEnabled,  setHpEnabled]  = useState(comp.houseProperty?.enabled  || false);
  const [hpType,     setHpType]     = useState(comp.houseProperty?.type      || 'Self Occupied');
  const [hpRent,     setHpRent]     = useState(comp.houseProperty?.rentReceived   || 0);
  const [hpMuni,     setHpMuni]     = useState(comp.houseProperty?.municipalTaxes || 0);
  const [hpInterest, setHpInterest] = useState(comp.houseProperty?.interestPaid   || 0);

  // CG
  const [cgEnabled,  setCgEnabled]  = useState(comp.capitalGains?.enabled  || false);
  const [stcg111a,   setStcg111a]   = useState(comp.capitalGains?.shares?.stcg111a || 0);
  const [ltcg112a,   setLtcg112a]   = useState(comp.capitalGains?.shares?.ltcg112a || 0);
  const [ltcgProp,   setLtcgProp]   = useState(comp.capitalGains?.property?.ltcg   || 0);
  const [capGains,   setCapGains]   = useState(comp.capitalGains || null); // full CG with sale/purchase

  // ── Deductions ────────────────────────────────────────────────
  const [d80C,   setD80C]   = useState(comp.deductions80C   || 0);
  const [d80D,   setD80D]   = useState(comp.deductions80D   || 0);
  const [d24b,   setD24b]   = useState(comp.deductions24b   || 0);
  const [d80E,   setD80E]   = useState(comp.deductions80E   || 0);
  const [d80TTA, setD80TTA] = useState(comp.deductions80TTA || 0);
  const [d80G,   setD80G]   = useState(comp.deductions80G   || 0);

  // ── Taxes paid ────────────────────────────────────────────────
  const [tds,          setTds]          = useState(comp.tdsDeducted    || 0);
  const [advanceTax,   setAdvanceTax]   = useState(comp.advanceTax     || 0);
  const [selfAssess,   setSelfAssess]   = useState(comp.selfAssessment || 0);
  const [ageGroup,     setAgeGroup]     = useState(comp.ageGroup       || '<60');
  const [regime,       setRegime]       = useState(comp.betterRegime   || 'new');

  // ── Bank accounts ─────────────────────────────────────────────
  const initBanks = (comp.bankAccounts && comp.bankAccounts.length > 0)
    ? comp.bankAccounts
    : [{ IFSCCode: '', BankAccountNo: '', BankName: '', UseForRefund: 'Y' }];
  const [bankAccounts, setBankAccounts] = useState(initBanks);

  // ── Balance sheet (ITR-4) ─────────────────────────────────────
  const [bsCapital,   setBsCapital]   = useState(comp.bsCapital   || 0);
  const [bsBank,      setBsBank]      = useState(comp.bsBank      || 0);
  const [bsCash,      setBsCash]      = useState(comp.bsCash      || 0);
  const [bsDebtors,   setBsDebtors]   = useState(comp.bsDebtors   || 0);
  const [bsCreditors, setBsCreditors] = useState(comp.bsCreditors || 0);

  // ── Employer TDS details ──────────────────────────────────────
  const [empTAN,  setEmpTAN]  = useState(comp.employerTAN  || '');
  const [empName, setEmpName] = useState(comp.employerName || '');

  // ── GSTIN ─────────────────────────────────────────────────────
  const [gstin, setGstin] = useState(comp.gstin || '');

  // ── Validation ────────────────────────────────────────────────
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const isSalaried  = ret?.profile === 'salaried' || (grossSalary > 0);
  const isBusiness  = ret?.profile === 'business' || ret?.profile === 'freelancer' || businessIncome > 0;
  const is44AD      = ret?.profile === 'business';
  const is44ADA     = ret?.profile === 'freelancer';

  // Live computation
  const houseProperty = hpEnabled ? { enabled: true, type: hpType, rentReceived: hpRent, municipalTaxes: hpMuni, interestPaid: hpInterest } : null;
  const capitalGains  = cgEnabled ? { enabled: true, shares: { stcg111a, ltcg112a }, property: { ltcg: ltcgProp } } : null;

  const liveComp = computeTax({
    grossSalary, standardDeduction: stdDed, professionalTax: profTax,
    businessIncome, interestIncome: savingsInt + fdInt, dividendIncome,
    otherIncome: otherOSIncome, savingsInterest: savingsInt, fdInterest: fdInt,
    houseProperty, capitalGains, deductions80C: d80C, deductions80D: d80D,
    deductions24b: d24b, deductions80E: d80E,
    deductions80TTA: Math.min(savingsInt, 10000), deductions80G: d80G,
    tdsDeducted: tds, advanceTax, selfAssessment: selfAssess, ageGroup,
  });

  const selTax     = regime === 'old' ? liveComp.oldTax : liveComp.newTax;
  const balanceDue = Math.max(0, selTax - (liveComp.totalPaid || 0));
  const refund     = Math.max(0, (liveComp.totalPaid || 0) - selTax);

  function validate() {
    const e = {};
    // Bank account required before filing
    const hasBank = bankAccounts.some(b => b.BankAccountNo && b.IFSCCode);
    if (!hasBank) e.bank = 'At least one bank account with account number and IFSC is required';
    // 44AD: turnover required
    if ((is44AD || is44ADA) && bizTurnover === 0) e.turnover = 'Gross turnover/receipts required for presumptive filing';
    // Employer TAN for salaried with TDS
    if (isSalaried && tds > 0 && !empTAN) e.empTAN = 'Employer TAN required when TDS is deducted';
    return e;
  }

  async function handleSave() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const finalComp = {
        ...liveComp,
        betterRegime: regime, chosenTax: selTax, balanceDue, refund,
        // Store all inputs for re-editing
        grossSalary, standardDeduction: stdDed, professionalTax: profTax,
        businessIncome, bizTurnover, bizCashPct, bizName, bizCodeAD, gstin,
        savingsInterest: savingsInt, fdInterest: fdInt, dividendIncome,
        otherIncome: otherOSIncome, houseProperty, capitalGains,
        deductions80C: d80C, deductions80D: d80D, deductions24b: d24b,
        deductions80E: d80E, deductions80TTA: Math.min(savingsInt, 10000), deductions80G: d80G,
        tdsDeducted: tds, advanceTax, selfAssessment: selfAssess, ageGroup,
        employerTAN: empTAN, employerName: empName,
        bankAccounts, bsCapital, bsBank, bsCash, bsDebtors, bsCreditors,
      };
      await caUpdateReturn(ret.id, {
        computation: finalComp,
        old_regime_tax: liveComp.oldTax,
        new_regime_tax: liveComp.newTax,
        chosen_regime: regime,
        refund_amount: refund,
        balance_due: balanceDue,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSave(finalComp);
    } catch (err) {
      setErrors({ general: err.message });
    } finally { setSaving(false); }
  }

  const STATES = [['01','J&K'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','UP'],['10','Bihar'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','MP'],['24','Gujarat'],['27','Maharashtra'],['28','AP'],['29','Karnataka'],['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],['36','Telangana']];

  return (
    <div style={{ maxHeight: '80dvh', overflowY: 'auto', overflowX: 'hidden', padding: '2px', WebkitOverflowScrolling: 'touch' }}>

      {/* Live tax summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: '12px', background: 'var(--surface-2)', borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross income</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatINR(liveComp.grossTotal)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tax ({regime === 'old' ? 'Old' : 'New'} regime)</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatINR(selTax)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{refund > 0 ? 'Refund' : 'Balance due'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: refund > 0 ? 'var(--success)' : balanceDue > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
            {refund > 0 ? formatINR(refund) : balanceDue > 0 ? formatINR(balanceDue) : '₹0'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Regime</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['old', 'new'].map(r => (
              <button key={r} onClick={() => setRegime(r)}
                style={{ padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${regime === r ? 'var(--brand)' : 'var(--border-strong)'}`, background: regime === r ? 'var(--brand-light)' : 'transparent', color: regime === r ? 'var(--brand)' : 'var(--text-secondary)', fontSize: 12, fontWeight: regime === r ? 600 : 400, cursor: 'pointer' }}>
                {r === 'old' ? 'Old' : 'New'}
                {r === liveComp.betterRegime && <span style={{ marginLeft: 4, fontSize: 10 }}>★</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errors.general && <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>⚠️ {errors.general}</div>}

      {/* ── Salary income ── */}
      <SEC t="Salary income" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <NumField label="Gross salary" value={grossSalary} onChange={setGrossSalary} />
        <NumField label="Standard deduction" value={stdDed} onChange={setStdDed} note="(16ia)" max={75000} />
        <NumField label="Professional tax" value={profTax} onChange={setProfTax} note="(16iii)" max={2500} />
        <div />
        <TxtField label="Employer TAN" value={empTAN} onChange={setEmpTAN} placeholder="AHMA12345A" upper />
        <TxtField label="Employer name" value={empName} onChange={setEmpName} placeholder="Acme Pvt Ltd" />
      </div>
      {errors.empTAN && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>⚠️ {errors.empTAN}</div>}

      {/* ── Business income ── */}
      <SEC t="Business / professional income (Sec 44AD / 44ADA)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <NumField label={`Gross ${is44ADA ? 'professional receipts' : 'business turnover'}`} value={bizTurnover} onChange={setBizTurnover} />
        <NumField label="Cash receipts %" value={bizCashPct} onChange={v => setBizCashPct(Math.min(100, Math.max(0, v)))} note="(0–100)" max={100} />
        <NumField label="Presumptive income" value={businessIncome} onChange={setBizIncome} note="(auto or override)" />
        <TxtField label="Business / profession name" value={bizName} onChange={setBizName} placeholder="CA Practice / Trading" />
        <TxtField label="GSTIN" value={gstin} onChange={setGstin} placeholder="24ABCDE1234F1Z5" upper />
        <SelField label="Business nature code (CodeAD)" value={bizCodeAD} onChange={setBizCodeAD} options={[
          ['09028','09028 — Retail sale of other products'],
          ['09027','09027 — Wholesale of other products'],
          ['16001','16001 — Legal profession'],
          ['16002','16002 — Accounting'],
          ['16003','16003 — Tax consultancy'],
          ['16005','16005 — Engineering consultancy'],
          ['16013','16013 — Business & management consultancy'],
          ['16019','16019 — Other professional services'],
          ['14001','14001 — Software development'],
          ['14002','14002 — Other software consultancy'],
          ['13016','13016 — Financial advisers'],
          ['21009','21009 — Speculative trading'],
          ['21010','21010 — Futures & Options trading'],
        ]} />
      </div>
      {errors.turnover && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>⚠️ {errors.turnover}</div>}

      {/* ── Other source income ── */}
      <SEC t="Other source income (Schedule OS)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <NumField label="Savings bank interest" value={savingsInt} onChange={setSavingsInt} note="(80TTA max ₹10K)" />
        <NumField label="FD / RD / term deposit interest" value={fdInt} onChange={setFdInt} />
        <NumField label="Dividends" value={dividendIncome} onChange={setDividend} />
        <NumField label="Other income (gifts, misc)" value={otherOSIncome} onChange={setOtherOS} />
      </div>

      {/* ── House property ── */}
      <SEC t="House property income / (loss)" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <input type="checkbox" id="hp-chk" checked={hpEnabled} onChange={e => setHpEnabled(e.target.checked)} />
        <label htmlFor="hp-chk" style={{ fontSize: 13, cursor: 'pointer' }}>Has house property income or home loan</label>
      </div>
      {hpEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <SelField label="Property type" value={hpType} onChange={setHpType} options={[['Self Occupied','Self Occupied'],['Rented','Rented / let out']]} />
          {hpType === 'Rented' && <>
            <NumField label="Annual rent received" value={hpRent} onChange={setHpRent} />
            <NumField label="Municipal / property tax paid" value={hpMuni} onChange={setHpMuni} />
          </>}
          <NumField label="Home loan interest paid" value={hpInterest} onChange={setHpInterest} note={hpType === 'Self Occupied' ? 'max ₹2,00,000' : ''} max={hpType === 'Self Occupied' ? 200000 : undefined} />
        </div>
      )}

      {/* ── Capital gains ── */}
      <SEC t="Capital gains" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <input type="checkbox" id="cg-chk" checked={cgEnabled} onChange={e => setCgEnabled(e.target.checked)} />
        <label htmlFor="cg-chk" style={{ fontSize: 13, cursor: 'pointer' }}>Has capital gains transactions</label>
      </div>
      {cgEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <NumField label="STCG — Equity / equity MF (Sec 111A @ 20%)" value={stcg111a} onChange={setStcg111a} />
          <NumField label="LTCG — Equity / equity MF (Sec 112A @ 12.5%)" value={ltcg112a} onChange={setLtcg112a} note="₹1.25L exempt" />
          <NumField label="LTCG — Property / land (@ 12.5%)" value={ltcgProp} onChange={setLtcgProp} />
        </div>
      )}

      {/* ── Deductions ── */}
      <SEC t="Deductions — Chapter VI-A (old regime only)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <NumField label="Section 80C (PPF, LIC, ELSS, home loan principal)" value={d80C} onChange={setD80C} max={150000} />
        <NumField label="Section 80D (mediclaim premium)" value={d80D} onChange={setD80D} max={75000} />
        {!hpEnabled && <NumField label="Home loan interest — Sec 24(b)" value={d24b} onChange={setD24b} max={200000} />}
        <NumField label="Education loan interest — Sec 80E" value={d80E} onChange={setD80E} />
        <NumField label="Savings bank interest — Sec 80TTA" value={d80TTA} onChange={setD80TTA} max={10000} />
        <NumField label="Donations — Sec 80G" value={d80G} onChange={setD80G} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        Note: In new regime, none of these deductions apply. Only 80C NPS employer contribution (80CCD2) is allowed.
      </div>

      {/* ── Taxes paid ── */}
      <SEC t="Taxes already paid" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <NumField label="TDS deducted (salary + professional)" value={tds} onChange={setTds} />
        <NumField label="Advance tax paid" value={advanceTax} onChange={setAdvanceTax} />
        <NumField label="Self-assessment tax paid" value={selfAssess} onChange={setSelfAssess} />
        <SelField label="Age group" value={ageGroup} onChange={setAgeGroup} options={[['<60','Below 60'],['60-80','60–80 (Senior)'],['> 80','>80 (Super senior)']]} />
      </div>

      {/* ── Bank accounts — REQUIRED ── */}
      <SEC t="Bank account for refund ⚠️ Required" />
      {errors.bank && <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>⚠️ {errors.bank}</div>}
      {bankAccounts.map((b, i) => (
        <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <TxtField label="Account number *" value={b.BankAccountNo} onChange={v => setBankAccounts(bs => bs.map((x,j)=>j===i?{...x,BankAccountNo:v}:x))} placeholder="Account number" />
            <TxtField label="IFSC code *" value={b.IFSCCode} onChange={v => setBankAccounts(bs => bs.map((x,j)=>j===i?{...x,IFSCCode:v.toUpperCase()}:x))} placeholder="SBIN0001234" upper />
            <TxtField label="Bank name" value={b.BankName} onChange={v => setBankAccounts(bs => bs.map((x,j)=>j===i?{...x,BankName:v}:x))} placeholder="SBI" />
            <SelField label="Use for refund" value={b.UseForRefund} onChange={v => setBankAccounts(bs => bs.map((x,j)=>j===i?{...x,UseForRefund:v}:x))} options={[['Y','Yes'],['N','No']]} />
          </div>
          {bankAccounts.length > 1 && (
            <button onClick={() => setBankAccounts(bs => bs.filter((_, j) => j !== i))} style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12}/> Remove
            </button>
          )}
        </div>
      ))}
      <button onClick={() => setBankAccounts(bs => [...bs, { IFSCCode:'', BankAccountNo:'', BankName:'', UseForRefund:'N' }])}
        style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: '1px dashed var(--brand)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Plus size={12}/> Add another bank account
      </button>

      {/* ── Balance sheet (ITR-4) ── */}
      {isBusiness && (
        <>
          <SEC t="Financial particulars of business (FinanclPartclrOfBusiness — ITR-4)" />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Required for ITR-4. Approximate figures acceptable for presumptive filers.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <NumField label="Own capital / net worth" value={bsCapital} onChange={setBsCapital} />
            <NumField label="Balance in banks (all accounts)" value={bsBank} onChange={setBsBank} />
            <NumField label="Cash in hand" value={bsCash} onChange={setBsCash} />
            <NumField label="Outstanding debtors (receivables)" value={bsDebtors} onChange={setBsDebtors} />
            <NumField label="Outstanding creditors (payables)" value={bsCreditors} onChange={setBsCreditors} />
          </div>
        </>
      )}

      {/* ── Save button ── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</Button>
        <Button variant="primary" style={{ flex: 2, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</>
                  : saved ? <><CheckCircle size={14}/> Saved!</>
                  : <><Save size={14}/> Save return data</>}
        </Button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
