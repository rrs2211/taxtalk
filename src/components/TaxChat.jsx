import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle } from 'lucide-react';
import { PROFILES, DEDUCTION_OPTIONS, OTHER_DEDUCTION_OPTIONS, computeTax, formatINR, formatINRShort } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

// Steps
const S = {
  WELCOME:'welcome', PROFILE:'profile', AGE:'age',
  // Salaried
  FORM16:'form16', EMPLOYERS:'employers',
  // Business/freelancer
  BIZ_TYPE:'biz_type', BIZ_TURNOVER:'biz_turnover', BIZ_PROFIT:'biz_profit',
  // Partner
  PARTNER_PROFIT:'partner_profit',
  // Other income (multi-select then sequential collection)
  OTHER_INCOME_Q:'other_income_q',
  OI_INTEREST:'oi_interest', OI_DIVIDEND:'oi_dividend',
  HP_TYPE:'hp_type', HP_RENT:'hp_rent', HP_MUNI:'hp_muni', HP_INT:'hp_int',
  CG_STCG:'cg_stcg', CG_LTCG:'cg_ltcg', CG_PROP:'cg_prop',
  // 26AS
  AIS_Q:'ais_q', AIS_UPLOAD:'ais_upload',
  // Deductions
  DED_80C:'ded_80c', DED_80C_AMT:'ded_80c_amt',
  DED_OTHER:'ded_other', DED_MED_AMT:'ded_med_amt',
  // Taxes
  TAXES_Q:'taxes_q', TAXES_AMT:'taxes_amt',
  // End
  COMPUTATION:'computation', DONE:'done',
};

// ── UI primitives ─────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', width:'fit-content' }}>
      {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--text-muted)', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
    </div>
  );
}
function AIBubble({ children }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'84%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:14, lineHeight:1.6, color:'var(--text-primary)', border:'1px solid var(--border)', animation:'fadeUp 0.3s ease' }}>{children}</div>
    </div>
  );
}
function UserBubble({ children }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ background:'var(--brand)', borderRadius:'18px 18px 4px 18px', padding:'10px 16px', fontSize:14, lineHeight:1.5, color:'#fff', maxWidth:'75%', animation:'fadeUp 0.2s ease' }}>{children}</div>
    </div>
  );
}
function Chip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:'8px 16px', borderRadius:24, border:`1.5px solid ${selected?'var(--brand)':'var(--border-strong)'}`, background:selected?'var(--brand-light)':'var(--surface)', color:selected?'var(--brand)':'var(--text-primary)', fontSize:13, fontWeight:selected?600:400, cursor:'pointer', transition:'all 0.15s' }}>
      {label}
    </button>
  );
}
function UploadBtn({ label, onFile, uploading, progress, accept='.pdf,.jpg,.jpeg,.png' }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} style={{ display:'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <button onClick={() => ref.current.click()} disabled={uploading} style={{ width:'100%', padding:14, borderRadius:'var(--radius-md)', border:'2px dashed var(--brand)', background:'var(--brand-light)', color:'var(--brand)', fontSize:14, fontWeight:500, cursor:uploading?'wait':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {uploading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Uploading {progress>0?`${progress}%`:''}</> : <><Upload size={18}/> {label}</>}
      </button>
    </div>
  );
}
function ProcessingBubble({ msg }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:13, color:'var(--text-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'var(--brand)' }} /> {msg || 'Reading your document...'}
      </div>
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────
function EditField({ label, value, onChange, note }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  function start() { setDraft(value !== 0 ? String(Math.abs(value)) : ''); setEditing(true); setTimeout(() => ref.current?.select(), 40); }
  function commit() { onChange(parseInt(draft.replace(/[^0-9]/g,'')) || 0); setEditing(false); }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <div>
        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
        {note && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{note}</span>}
      </div>
      {editing
        ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ color:'var(--text-muted)' }}>₹</span>
            <input ref={ref} type="number" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if(e.key==='Enter') commit(); if(e.key==='Escape') setEditing(false); }} style={{ width:110, padding:'3px 8px', border:'1.5px solid var(--brand)', borderRadius:6, fontSize:13, textAlign:'right', outline:'none', background:'var(--surface)', color:'var(--text-primary)' }} />
          </div>
        : <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:500, color:value<0?'var(--danger)':'var(--brand)' }}>{value<0?'−':''}{formatINR(Math.abs(value))}</span>
            <button onClick={start} style={{ padding:'2px 8px', fontSize:11, border:'1px solid var(--border-strong)', borderRadius:5, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'pointer' }}>Edit</button>
          </div>
      }
    </div>
  );
}

// ── AIS flag display ──────────────────────────────────────────
function AISFlag({ flag }) {
  return (
    <div style={{ background:'var(--warn-light)', border:'1px solid #fcd34d', borderRadius:8, padding:'8px 12px', marginBottom:6, fontSize:13 }}>
      <div style={{ fontWeight:600, color:'#92400e', marginBottom:3 }}>⚠️ {flag.title}</div>
      <div style={{ color:'#78350f' }}>{flag.body}</div>
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────
function RegimeCard({ label, data, regime, selected, better, onSelect }) {
  const tax     = regime==='old' ? data.oldTax     : data.newTax;
  const taxable = regime==='old' ? data.oldTaxable : data.newTaxable;
  const slab    = regime==='old' ? data.oldSlabTax : data.newSlabTax;
  const rebate  = regime==='old' ? data.oldRebate  : data.newRebate;
  const sc      = regime==='old' ? data.oldSurcharge : data.newSurcharge;
  const balance = Math.max(0, tax - (data.totalPaid||0));
  const refund  = Math.max(0, (data.totalPaid||0) - tax);
  return (
    <div onClick={onSelect} style={{ flex:1, borderRadius:10, border:`2px solid ${selected?'var(--brand)':'var(--border)'}`, background:selected?'var(--brand-light)':'var(--surface)', padding:'14px', cursor:'pointer', transition:'all 0.15s', position:'relative', overflow:'visible' }}>
      {better && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'var(--success)', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20, whiteSpace:'nowrap' }}>RECOMMENDED</div>}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:selected?'var(--brand)':'var(--text-primary)' }}>{label}</span>
        <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selected?'var(--brand)':'var(--border-strong)'}`, background:selected?'var(--brand)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {selected && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
        </div>
      </div>
      {[
        { l:'Taxable income', v:formatINR(taxable) },
        { l:'Slab tax', v:formatINR(slab) },
        ...(rebate>0?[{ l:'Less: Rebate 87A', v:`−${formatINR(rebate)}` }]:[]),
        ...(data.cgTax>0?[{ l:'CG tax (special)', v:formatINR(data.cgTax) }]:[]),
        ...(sc>0?[{ l:'Surcharge', v:formatINR(sc) }]:[]),
        { l:'Tax + 4% cess', v:formatINR(tax), bold:true },
      ].map((r,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', borderBottom:'0.5px solid var(--border)', color:r.bold?'var(--text-primary)':'var(--text-secondary)', fontWeight:r.bold?700:400 }}>
          <span>{r.l}</span>
          <span style={{ color:r.bold?(selected?'var(--brand)':'var(--text-primary)'):'inherit' }}>{r.v}</span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:6, borderTop:'1px solid var(--border)', fontSize:13, fontWeight:600 }}>
        {refund>0 ? <span style={{ color:'var(--success)' }}>Refund: {formatINR(refund)}</span>
                  : <span style={{ color:balance>0?'var(--warn)':'var(--text-muted)' }}>{balance>0?`Pay: ${formatINR(balance)}`:'No balance due'}</span>}
      </div>
    </div>
  );
}

// ── Computation review card ───────────────────────────────────
function ComputationCard({ initialData, initialInputs, aisFlags, onApprove, submitting }) {
  const [inp, setInp] = useState({ ...initialInputs });
  const [regime, setRegime] = useState(initialData.betterRegime || 'new');
  const comp = computeTax(inp);
  const selTax = regime==='old' ? comp.oldTax : comp.newTax;
  const balance = Math.max(0, selTax - (comp.totalPaid||0));
  const refund  = Math.max(0, (comp.totalPaid||0) - selTax);
  const set = f => v => setInp(p => ({ ...p, [f]: v }));

  const SH = ({ c }) => <div style={{ padding:'7px 12px', background:'var(--surface-3)', fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{c}</div>;

  return (
    <Card style={{ marginTop:8 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:3 }}>Review your details</div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>Tap <strong>Edit</strong> to correct any value — computation updates instantly</div>
      </div>

      {/* AIS flags */}
      {aisFlags?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:'var(--warn)' }}>⚠️ AIS cross-check flags</div>
          {aisFlags.map((f,i) => <AISFlag key={i} flag={f} />)}
        </div>
      )}

      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
        <SH c="Salary income" />
        <EditField label="Gross salary" value={inp.grossSalary||0} onChange={set('grossSalary')} />
        <EditField label="Standard deduction" value={inp.standardDeduction||75000} onChange={set('standardDeduction')} note="default ₹75,000" />
        <EditField label="Professional tax (16iii)" value={inp.professionalTax||0} onChange={set('professionalTax')} />

        {(inp.businessIncome||0) > 0 && <>
          <SH c="Business / professional income" />
          <EditField label="Net business profit" value={inp.businessIncome} onChange={set('businessIncome')} />
        </>}

        <SH c="Other income sources" />
        <EditField label="Interest income (FD, savings, etc.)" value={inp.interestIncome||0} onChange={set('interestIncome')} note="Schedule OS" />
        <EditField label="Dividend income" value={inp.dividendIncome||0} onChange={set('dividendIncome')} note="Schedule OS" />

        {inp.houseProperty?.enabled && <>
          <SH c="House property" />
          <div style={{ padding:'8px 12px', fontSize:13, color:'var(--text-secondary)', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
            {inp.houseProperty.type} · Interest: {formatINR(inp.houseProperty.interestPaid||0)}
            {inp.houseProperty.type==='Rented' && ` · Rent: ${formatINR(inp.houseProperty.rentReceived||0)}`}
            <span style={{ marginLeft:8, fontWeight:600, color:comp.hpIncome<0?'var(--danger)':'var(--success)' }}>→ {comp.hpIncome<0?'−':''}{formatINR(Math.abs(comp.hpIncome||0))}</span>
          </div>
        </>}

        {inp.capitalGains?.enabled && <>
          <SH c="Capital gains" />
          {(inp.capitalGains.shares?.stcg111a||0)>0 && <EditField label="STCG — Equity/funds (111A @ 20%)" value={inp.capitalGains.shares.stcg111a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,stcg111a:v}}}))} />}
          {(inp.capitalGains.shares?.ltcg112a||0)>0 && <EditField label="LTCG — Equity/funds (112A @ 12.5%)" value={inp.capitalGains.shares.ltcg112a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,ltcg112a:v}}}))} />}
          {(inp.capitalGains.property?.ltcg||0)>0 && <EditField label="LTCG — Property (@ 12.5%)" value={inp.capitalGains.property.ltcg} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,property:{...p.capitalGains.property,ltcg:v}}}))} />}
        </>}

        <SH c="Deductions — old regime only" />
        <EditField label="Section 80C" value={inp.deductions80C||0} onChange={set('deductions80C')} note="max ₹1,50,000" />
        <EditField label="Section 80D — mediclaim" value={inp.deductions80D||0} onChange={set('deductions80D')} note="max ₹75,000" />
        {!inp.houseProperty?.enabled && <EditField label="Home loan interest (24b)" value={inp.deductions24b||0} onChange={set('deductions24b')} note="max ₹2,00,000" />}
        <EditField label="Education loan interest (80E)" value={inp.deductions80E||0} onChange={set('deductions80E')} />
        <EditField label="Savings interest (80TTA)" value={inp.deductions80TTA||0} onChange={set('deductions80TTA')} note="max ₹10,000" />
        <EditField label="Donations (80G)" value={inp.deductions80G||0} onChange={set('deductions80G')} />

        <SH c="Taxes already paid" />
        <EditField label="TDS deducted" value={inp.tdsDeducted||0} onChange={set('tdsDeducted')} />
        <EditField label="Advance tax paid" value={inp.advanceTax||0} onChange={set('advanceTax')} />
        <EditField label="Self-assessment tax" value={inp.selfAssessment||0} onChange={set('selfAssessment')} />
      </div>

      <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'var(--text-secondary)' }}>Gross total income</span>
          <span style={{ fontWeight:600 }}>{formatINR(comp.grossTotal)}</span>
        </div>
        {(comp.cgTax||0)>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
          <span>Capital gains tax (special rates)</span><span>{formatINR(comp.cgTax)}</span>
        </div>}
      </div>

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>
        Choose your tax regime <span style={{ fontSize:11, fontWeight:400, color:'var(--text-muted)' }}>— tap to select</span>
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <RegimeCard label="Old regime" data={comp} regime="old" selected={regime==='old'} better={comp.betterRegime==='old'} onSelect={() => setRegime('old')} />
        <RegimeCard label="New regime" data={comp} regime="new" selected={regime==='new'} better={comp.betterRegime==='new'} onSelect={() => setRegime('new')} />
      </div>
      {regime !== comp.betterRegime && (
        <div style={{ fontSize:12, color:'var(--warn)', padding:'6px 10px', background:'var(--warn-light)', borderRadius:6, marginBottom:14 }}>
          ⚠️ The {regime} regime costs {formatINR(Math.abs(comp.oldTax-comp.newTax))} more. Your CA will confirm before filing.
        </div>
      )}

      <div style={{ borderRadius:8, padding:'12px 14px', marginBottom:14, background:refund>0?'var(--success-light)':balance>0?'var(--warn-light)':'var(--surface-3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>
              {refund>0 ? '🎉 Refund due to you' : balance>0 ? '⚠️ Self-assessment tax to pay' : '✅ No balance due'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{regime==='old'?'Old':'New'} regime · Std deduction ₹75,000 included</div>
          </div>
          <div style={{ fontSize:24, fontWeight:700, color:refund>0?'var(--success)':balance>0?'var(--warn)':'var(--text-muted)' }}>
            {refund>0?formatINR(refund):balance>0?formatINR(balance):'₹0'}
          </div>
        </div>
      </div>

      {comp.advanceTaxSchedule?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>Advance tax instalments</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {comp.advanceTaxSchedule.map((s,i) => (
              <div key={i} style={{ background:'var(--surface-2)', borderRadius:6, padding:'8px', textAlign:'center', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.due}</div>
                <div style={{ fontSize:12, fontWeight:600, marginTop:2 }}>{formatINRShort(s.amount)}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => onApprove({ ...comp, betterRegime:regime, chosenTax:selTax, balanceDue:balance, refund })} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }} /> Submitting…</> : <><CheckCircle size={15}/> Confirm & send to CA for review</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will verify and file</p>
    </Card>
  );
}

// ── Main chat ─────────────────────────────────────────────────
export default function TaxChat({ userId }) {
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = useReturn(userId);

  // Core flow state
  const [step, setStep]           = useState(S.WELCOME);
  const [taxProfile, setTaxProfile] = useState(null);
  const [ageGroup, setAgeGroup]   = useState('<60');
  const [messages, setMessages]   = useState([]);
  const [typing, setTyping]       = useState(false);
  const [processing, setProcessing] = useState(null); // null or string description

  // Input state
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputCtx, setInputCtx]   = useState('');

  // Income state
  const [grossSalary, setGrossSalary]     = useState(0);
  const [tds, setTds]                     = useState(0);
  const [businessIncome, setBizIncome]    = useState(0);
  const [bizType, setBizType]             = useState('44AD'); // 44AD, 44ADA, actual
  const [partnerProfit, setPartnerProfit] = useState(0);
  const [interestIncome, setInterestIncome] = useState(0);
  const [dividendIncome, setDivIncome]    = useState(0);
  const [advanceTax, setAdvanceTax]       = useState(0);
  const [houseProperty, setHP]            = useState(null);
  const [capitalGains, setCG]             = useState(null);
  const [aisFlags, setAisFlags]           = useState([]);

  // Deductions
  const [ded80C, setD80C]   = useState(0);
  const [ded80D, setD80D]   = useState(0);
  const [sel80C, setSel80C] = useState([]);
  const [selOther, setSelOther] = useState([]);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Multi-income type tracking
  const [otherIncomeTypes, setOtherIncomeTypes] = useState([]);
  const [otherIncomeQueue, setOtherIncomeQueue] = useState([]); // types still to collect

  const bottomRef = useRef(null);

  // ── Load chat history on mount ────────────────────────────
  useEffect(() => {
    if (loadingReturn) return;
    // For now start fresh each session — history shown in separate panel
    const t = setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom:8 }}>👋 Hi! I am <strong>TaxTalk</strong> — your personal CA assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>Filing your ITR will feel like a simple chat. I will ask plain questions — no forms, no jargon.</p>
          <p>Ready to get started?</p>
        </>, () => setStep(S.PROFILE)
      );
    }, 600);
    return () => clearTimeout(t);
  }, [loadingReturn]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing, step, processing]);

  function addAI(content, onDone) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { from:'ai', content, key:Date.now() }]);
      if (onDone) setTimeout(onDone, 300);
    }, 700 + Math.random() * 300);
  }
  function addUser(text) {
    setMessages(m => [...m, { from:'user', content:text, key:Date.now() }]);
    persistMessage('user', text).catch(console.error);
  }

  // Ask an amount question — uses JSX so no HTML-in-strings
  function ask(jsxContent, ctx) {
    addAI(jsxContent, () => { setInputValue(''); setInputCtx(ctx); setShowInput(true); });
  }

  // ── Profile selection ─────────────────────────────────────
  function handleProfile(key) {
    setTaxProfile(key);
    addUser(PROFILES[key].label);
    // Save profile to return record immediately
    if (returnRecord?.id) {
      import('../lib/supabase.js').then(({ updateReturn }) => {
        updateReturn(returnRecord.id, { profile: key }).catch(console.error);
      });
    }
    setStep(S.AGE);
    addAI(<p>What is your <strong>age group</strong>? This affects your basic exemption limit in the old regime.</p>, null);
  }

  // ── Age selection ─────────────────────────────────────────
  function handleAge(age, label) {
    setAgeGroup(age);
    addUser(label);
    if (taxProfile === 'salaried') {
      setStep(S.FORM16);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>The first document I need is your <strong>Form 16</strong> — your employer gives this every year, showing salary paid and TDS deducted.</p>
          <p>Upload it below — PDF or image both work.</p>
        </>, null
      );
    } else if (taxProfile === 'business' || taxProfile === 'freelancer') {
      setStep(S.BIZ_TYPE);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>How do you want to declare your {taxProfile === 'freelancer' ? 'professional' : 'business'} income?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)' }}>Presumptive is simpler — no need to maintain detailed books below certain turnover.</p>
        </>, null
      );
    } else if (taxProfile === 'partner') {
      setStep(S.PARTNER_PROFIT);
      ask(
        <>
          <p>What was your <strong>share of profit from the partnership firm</strong> for FY 2025-26?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>This is exempt u/s 10(2A) — but we need it for Schedule IF.</p>
        </>, 'partner_profit'
      );
    }
  }

  // ── Form 16 upload & extraction ───────────────────────────
  async function handleForm16Upload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0); setUploadError(null);
    addUser(`Uploaded: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'form16', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading your Form 16 — takes about 10-15 seconds...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Extraction failed — please try again or enter manually');
      const { extracted } = await res.json();
      setProcessing(null);
      const sal  = extracted.gross_salary || 0;
      const tdsV = extracted.total_tds_deducted || 0;
      const d80C = (extracted.deduction_80c||0)+(extracted.deduction_80ccc||0)+(extracted.deduction_80ccd1||0);
      setGrossSalary(sal); setTds(tdsV);
      if (d80C>0) setD80C(d80C);
      if (extracted.deduction_80d>0) setD80D(extracted.deduction_80d);
      const card = (
        <>
          <p style={{ marginBottom:8 }}>I have read your Form 16 ✨</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:10 }}>
            {extracted.employer_name && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Employer</span><span>{extracted.employer_name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross salary</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(sal)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tdsV)}</span></div>
          </div>
          <p>Did you work for any <strong>other employer</strong> this year too?</p>
        </>
      );
      setMessages(m => [...m, { from:'ai', key:Date.now(), content:card }]);
      setStep(S.EMPLOYERS);
    } catch(e) {
      setUploading(false); setProcessing(null); setUploadError(e.message);
      addAI(
        <>
          <p style={{ marginBottom:6 }}>⚠️ Could not read that document. You can:</p>
          <p>• Try uploading again<br/>• Enter salary details manually</p>
        </>, null
      );
    }
  }

  function handleManualSalary() {
    addUser("I will enter details manually");
    ask(<p>What was your <strong>total gross salary</strong> for FY 2025-26?</p>, 'salary');
  }

  function afterSalaryEntry() {
    setStep(S.OTHER_INCOME_Q);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Other than your salary, did you earn any of these in FY 2025-26?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply — I will collect each one</p>
      </>, null
    );
  }

  // ── Business income ────────────────────────────────────────
  const BIZ_TYPES = [
    { id:'44AD',  label:'Presumptive — Business (44AD)', sub:'Turnover up to ₹3Cr · 6% or 8% of turnover' },
    { id:'44ADA', label:'Presumptive — Professional (44ADA)', sub:'Receipts up to ₹75L · 50% of receipts' },
    { id:'actual', label:'Actual profit/loss', sub:'Maintain books of accounts' },
  ];
  const [selBizType, setSelBizType] = useState('44AD');

  function handleBizTypeConfirm() {
    addUser(BIZ_TYPES.find(b=>b.id===selBizType)?.label || selBizType);
    setBizType(selBizType);
    if (selBizType === '44AD' || selBizType === '44ADA') {
      setStep(S.BIZ_TURNOVER);
      ask(
        <>
          <p>What was your total <strong>{selBizType==='44AD'?'business turnover':'professional receipts'}</strong> for FY 2025-26?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>I will compute the presumptive income ({selBizType==='44AD'?'6% of turnover for digital, 8% for cash':'50% of receipts'}) automatically.</p>
        </>, 'biz_turnover'
      );
    } else {
      setStep(S.BIZ_PROFIT);
      ask(<p>What was your <strong>net profit from business</strong> after all expenses?</p>, 'biz_profit');
    }
  }

  // ── Other income — multi-type sequential collection ───────
  const OTHER_TYPES = [
    { id:'interest',  label:'Bank / FD interest' },
    { id:'dividend',  label:'Dividends' },
    { id:'rental',    label:'House property / rental income' },
    { id:'cg_equity', label:'Capital gains — shares / mutual funds' },
    { id:'cg_prop',   label:'Capital gains — property / land' },
    { id:'none',      label:'None of these' },
  ];

  function toggleOtherType(id) {
    if (id==='none') { setOtherIncomeTypes(['none']); return; }
    setOtherIncomeTypes(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }

  function confirmOtherTypes() {
    const types = otherIncomeTypes;
    if (types.includes('none') || types.length===0) {
      addUser('None of these');
      setOtherIncomeQueue([]);
      askAIS();
      return;
    }
    addUser(OTHER_TYPES.filter(t=>types.includes(t.id)).map(t=>t.label).join(', '));
    const queue = types.filter(t=>t!=='none');
    setOtherIncomeQueue(queue);
    collectNextOtherIncome(queue, 0);
  }

  function collectNextOtherIncome(queue, idx) {
    if (idx >= queue.length) { askAIS(); return; }
    const type = queue[idx];
    const next = () => collectNextOtherIncome(queue, idx+1);
    if (type==='interest') {
      ask(<p>What was your total <strong>bank / FD / savings interest income</strong> this year? (all banks combined)</p>, `oi_interest:${idx}`);
    } else if (type==='dividend') {
      ask(<p>What was your total <strong>dividend income</strong> from shares / mutual funds this year?</p>, `oi_dividend:${idx}`);
    } else if (type==='rental') {
      setStep(S.HP_TYPE);
      addAI(<p>Is your property <strong>self-occupied</strong> or <strong>rented out</strong>?</p>, null);
      // Store next index so we can continue after HP questions
      setInputCtx(`hp_continue:${idx}`);
    } else if (type==='cg_equity') {
      ask(
        <>
          <p>Short Term Capital Gain on <strong>shares / equity mutual funds</strong> sold within 12 months?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Section 111A — taxed at 20%. Enter 0 if no STCG.</p>
        </>, `cg_stcg:${idx}`
      );
    } else if (type==='cg_prop') {
      ask(
        <>
          <p>Long Term Capital Gain on <strong>property / land</strong> sold?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Taxed at 12.5% without indexation. Enter 0 if none.</p>
        </>, `cg_prop:${idx}`
      );
    }
  }

  // ── AIS / 26AS upload ─────────────────────────────────────
  function askAIS() {
    setStep(S.AIS_Q);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Do you have your <strong>AIS (Annual Information Statement)</strong> or <strong>Form 26AS</strong>?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Uploading it lets me cross-check your income and TDS against what the IT department has on record — and flag any mismatches before your CA sees it.</p>
      </>, null
    );
  }

  async function handleAISUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0); setUploadError(null);
    addUser(`Uploaded AIS: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'ais', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading your AIS — cross-checking income and TDS...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Could not read AIS');
      const { extracted } = await res.json();
      setProcessing(null);

      // Cross-check against what client told us
      const flags = [];
      const aisTDS = (extracted.tds_summary||[]).reduce((s,t) => s+(t.tds||0), 0);
      if (aisTDS>0 && tds>0 && Math.abs(aisTDS-tds)>500) {
        flags.push({ title:'TDS mismatch', body:`You mentioned TDS of ${formatINR(tds)}, but AIS shows ${formatINR(aisTDS)}. Difference: ${formatINR(Math.abs(aisTDS-tds))}. Your CA will reconcile this.` });
      }
      const aisInterest = (extracted.interest_income||[]).reduce((s,i) => s+(i.amount||0), 0);
      if (aisInterest>0 && interestIncome===0) {
        setInterestIncome(aisInterest);
        flags.push({ title:'Interest income found in AIS', body:`AIS shows ${formatINR(aisInterest)} interest income that you did not mention. I have added it to your return.` });
      }
      const aisDividend = (extracted.dividend_income||[]).reduce((s,d) => s+(d.amount||0), 0);
      if (aisDividend>0 && dividendIncome===0) {
        setDivIncome(aisDividend);
        flags.push({ title:'Dividend income found in AIS', body:`AIS shows ${formatINR(aisDividend)} dividend income. I have added it to your return.` });
      }
      const highValue = (extracted.high_value_transactions||[]).filter(t => (t.amount||0)>500000);
      highValue.forEach(t => {
        flags.push({ title:`High-value transaction: ${t.type}`, body:`AIS shows ${formatINR(t.amount)} transaction (${t.type}). Your CA will verify if disclosure is needed.` });
      });
      setAisFlags(flags);

      if (flags.length===0) {
        addAI(<p>AIS looks good ✅ — no discrepancies found. All your income and TDS figures match what the IT department has on record.</p>, () => proceedToDeductions());
      } else {
        addAI(
          <>
            <p style={{ marginBottom:8 }}>I cross-checked your AIS. Found <strong>{flags.length} item{flags.length>1?'s':''}</strong> to review:</p>
            {flags.map((f,i) => <AISFlag key={i} flag={f} />)}
            <p style={{ marginTop:8, fontSize:13, color:'var(--text-muted)' }}>These will be visible to your CA in the review. Continuing to deductions...</p>
          </>, () => proceedToDeductions()
        );
      }
    } catch(e) {
      setUploading(false); setProcessing(null);
      addAI(<p>Could not read AIS. Continuing without cross-check.</p>, () => proceedToDeductions());
    }
  }

  // ── Deductions ─────────────────────────────────────────────
  function proceedToDeductions() {
    setStep(S.DED_80C);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Now let us check your <strong>tax-saving investments</strong>. These reduce tax in the old regime.</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply for FY 2025-26:</p>
      </>, null
    );
  }

  function toggle80C(id) {
    if (id==='none') { setSel80C(['none']); return; }
    setSel80C(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirm80C() {
    if (sel80C.includes('none')||sel80C.length===0) {
      addUser('None'); proceedToOtherDed();
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o=>sel80C.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels);
      setStep(S.DED_80C_AMT);
      if (ded80C>0) {
        ask(<><p>I found <strong>{formatINR(ded80C)}</strong> in 80C from your Form 16. Is that the correct total, or enter the actual amount?</p></>, 'd80c');
      } else {
        ask(<><p>What was your total <strong>Section 80C investment</strong>?</p><p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Max ₹1,50,000 counts for tax saving.</p></>, 'd80c');
      }
    }
  }

  function proceedToOtherDed() {
    setStep(S.DED_OTHER);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Any other deductions?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply:</p>
      </>, null
    );
  }
  function toggleOtherDed(id) {
    if (id==='none') { setSelOther(['none']); return; }
    setSelOther(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirmOtherDed() {
    const hasMed = selOther.includes('mediclaim_self')||selOther.includes('mediclaim_parents');
    if (selOther.includes('none')||selOther.length===0) { addUser('None'); goToTaxesPaid(); return; }
    addUser(OTHER_DEDUCTION_OPTIONS.filter(o=>selOther.includes(o.id)).map(o=>o.label).join(', '));
    if (hasMed) {
      setStep(S.DED_MED_AMT);
      ask(<p>What was your total <strong>mediclaim / health insurance premium</strong> paid this year?</p>, 'd80d');
    } else { goToTaxesPaid(); }
  }

  // ── Taxes paid ─────────────────────────────────────────────
  function goToTaxesPaid() {
    setStep(S.TAXES_Q);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Have you paid any <strong>advance tax</strong> during FY 2025-26?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>This is tax paid in 4 instalments during the year — different from TDS.</p>
      </>, null
    );
  }

  // ── Amount handler ─────────────────────────────────────────
  function handleAmount() {
    const val = parseInt(inputValue.replace(/[^0-9]/g,'')) || 0;
    setShowInput(false); setInputValue('');
    addUser(`₹${val.toLocaleString('en-IN')}`);
    const ctx = inputCtx;

    if (ctx==='salary') {
      setGrossSalary(val);
      ask(<p>What was the <strong>TDS deducted</strong> by your employer? (Enter 0 if none)</p>, 'tds');
    } else if (ctx==='tds') {
      setTds(val); afterSalaryEntry();
    } else if (ctx==='partner_profit') {
      setPartnerProfit(val);
      afterSalaryEntry();
    } else if (ctx==='biz_turnover') {
      const rate = bizType==='44ADA' ? 0.5 : 0.06;
      const presumptive = Math.round(val * rate);
      setBizIncome(presumptive);
      addAI(
        <>
          <p>Presumptive income computed: <strong>{formatINR(presumptive)}</strong> ({bizType==='44ADA'?'50%':'6%'} of {formatINR(val)})</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>If you have any TDS deducted on professional receipts, I will ask next.</p>
        </>, () => {
          ask(<p>What was the <strong>TDS deducted</strong> on your business receipts? (Enter 0 if none)</p>, 'biz_tds');
        }
      );
    } else if (ctx==='biz_tds') {
      setTds(prev => prev + val);
      afterSalaryEntry();
    } else if (ctx==='biz_profit') {
      setBizIncome(val);
      ask(<p>What was <strong>TDS deducted</strong> on your business income? (Enter 0 if none)</p>, 'biz_tds');
    } else if (ctx.startsWith('oi_interest:')) {
      const idx = parseInt(ctx.split(':')[1]);
      setInterestIncome(val);
      collectNextOtherIncome(otherIncomeQueue, idx+1);
    } else if (ctx.startsWith('oi_dividend:')) {
      const idx = parseInt(ctx.split(':')[1]);
      setDivIncome(val);
      collectNextOtherIncome(otherIncomeQueue, idx+1);
    } else if (ctx.startsWith('cg_stcg:')) {
      const idx = parseInt(ctx.split(':')[1]);
      setCG(p => ({ ...p, enabled:true, shares:{ ...(p?.shares||{}), stcg111a:val } }));
      ask(
        <>
          <p>Long Term Capital Gain on <strong>shares / equity mutual funds</strong> held over 12 months?</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Section 112A — taxed at 12.5% above ₹1.25L exemption. Enter 0 if none.</p>
        </>, `cg_ltcg:${idx}`
      );
    } else if (ctx.startsWith('cg_ltcg:')) {
      const idx = parseInt(ctx.split(':')[1]);
      setCG(p => ({ ...p, enabled:true, shares:{ ...(p?.shares||{}), ltcg112a:val } }));
      collectNextOtherIncome(otherIncomeQueue, idx+1);
    } else if (ctx.startsWith('cg_prop:')) {
      const idx = parseInt(ctx.split(':')[1]);
      setCG(p => ({ ...p, enabled:true, property:{ ...(p?.property||{}), ltcg:val } }));
      collectNextOtherIncome(otherIncomeQueue, idx+1);
    } else if (ctx==='hp_rent') {
      setHP(p => ({ ...p, rentReceived:val }));
      ask(<p>What was the <strong>municipal / property tax</strong> paid on this property? (Enter 0 if none)</p>, 'hp_muni');
    } else if (ctx==='hp_muni') {
      setHP(p => ({ ...p, municipalTaxes:val }));
      ask(<p>What was the <strong>home loan interest</strong> paid on this property? (Enter 0 if no loan)</p>, 'hp_int');
    } else if (ctx==='hp_int' || ctx==='hp_int_so') {
      setHP(p => ({ ...p, interestPaid:val }));
      // Find the index we stored and continue queue
      const storedCtx = inputCtx.includes('hp_continue') ? inputCtx : 'hp_continue:0';
      const idx = parseInt((storedCtx.split(':')[1])||'0');
      collectNextOtherIncome(otherIncomeQueue, idx+1);
    } else if (ctx==='d80c') {
      setD80C(val); proceedToOtherDed();
    } else if (ctx==='d80d') {
      setD80D(val); goToTaxesPaid();
    } else if (ctx==='adv_tax') {
      setAdvanceTax(val); computeAndShow();
    }
  }

  // ── HP type ───────────────────────────────────────────────
  function handleHPType(type) {
    addUser(type==='Rented' ? 'It is rented out' : 'Self-occupied');
    setHP({ enabled:true, type, rentReceived:0, municipalTaxes:0, interestPaid:0 });
    if (type==='Rented') {
      ask(<p>What was the <strong>annual rent received</strong>?</p>, 'hp_rent');
    } else {
      ask(<p>What was the <strong>home loan interest</strong> paid on this property? (Enter 0 if no loan)</p>, 'hp_int_so');
    }
  }

  // ── Compute ───────────────────────────────────────────────
  function computeAndShow() {
    const inputs = {
      grossSalary, standardDeduction:75000, professionalTax:0,
      businessIncome: businessIncome + partnerProfit,
      interestIncome, dividendIncome,
      otherIncome: 0,
      houseProperty, capitalGains,
      deductions80C: ded80C, deductions80D: ded80D,
      deductions80E:0, deductions80TTA:0, deductions80G:0,
      tdsDeducted:tds, advanceTax, selfAssessment:0,
      ageGroup,
      profile: taxProfile, // for ITR form determination
    };
    const result = computeTax(inputs);
    saveComputation(result).catch(console.error);
    setStep(S.COMPUTATION);
    addAI(
      <>
        <p style={{ marginBottom:6 }}>Your tax summary is ready! 🎉</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Review all figures below, edit any that are wrong, and choose your preferred regime.</p>
      </>, null
    );
    setTimeout(() => {
      setMessages(m => [...m, {
        from:'ai', key:Date.now()+1,
        content:<ComputationCard initialData={result} initialInputs={inputs} aisFlags={aisFlags} onApprove={handleSubmit} submitting={submitting} />
      }]);
    }, 900);
  }

  async function handleSubmit(finalComp) {
    setSubmitting(true);
    try {
      await saveComputation(finalComp);
      const note = `${taxProfile} | ${ageGroup} | Income: ${formatINR(finalComp.grossTotal)} | Tax: ${formatINR(finalComp.chosenTax)} | Regime: ${finalComp.betterRegime} | ${finalComp.refund>0?'Refund: '+formatINR(finalComp.refund):'Balance: '+formatINR(finalComp.balanceDue)}`;
      await submitToCA(note, aisFlags.map(f => ({ severity:'warn', title:f.title, body:f.body })));
      setStep(S.DONE);
      addUser('Confirmed and sent to CA');
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ <strong>Done!</strong> Your return has been sent to the CA team at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They will review it within 24 hours. Check the <strong>Queries</strong> tab if they have any questions for you.</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Acknowledgment number will be shared after filing.</p>
        </>, null
      );
    } catch(e) {
      addAI(<p style={{ color:'var(--danger)' }}>⚠️ Could not submit: {e.message}</p>, null);
    } finally { setSubmitting(false); }
  }

  function handleReset() {
    setStep(S.WELCOME); setMessages([]); setTaxProfile(null); setAgeGroup('<60');
    setGrossSalary(0); setTds(0); setBizIncome(0); setPartnerProfit(0);
    setInterestIncome(0); setDivIncome(0); setAdvanceTax(0); setHP(null); setCG(null);
    setD80C(0); setD80D(0); setSel80C([]); setSelOther([]);
    setOtherIncomeTypes([]); setOtherIncomeQueue([]); setAisFlags([]);
    setShowInput(false); setInputValue(''); setUploadError(null);
    setTimeout(() => addAI(<p>Ready to file another return?</p>, () => setStep(S.PROFILE)), 400);
  }

  const AGE_OPTS = [
    { id:'<60',   label:'Below 60 years' },
    { id:'60-80', label:'60-80 (Senior citizen)' },
    { id:'>80',   label:'Above 80 (Super senior)' },
  ];

  if (loadingReturn) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)', fontSize:14 }}>
      <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading your return...
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--surface-2)' }}>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)', flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>T</div>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>TaxTalk</div>
          <div style={{ fontSize:12, color:'var(--success)', display:'flex', alignItems:'center', gap:4 }}><div style={{ width:6, height:6, borderRadius:'50%', background:'var(--success)' }}/> RB Shah & Associates · AY 2026-27</div>
        </div>
        <div style={{ marginLeft:'auto' }}><Badge variant="info"><FileText size={11}/> {taxProfile?PROFILES[taxProfile].itr:'ITR'}</Badge></div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
        {messages.map(m => m.from==='ai' ? <AIBubble key={m.key}>{m.content}</AIBubble> : <UserBubble key={m.key}>{m.content}</UserBubble>)}
        {typing && <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>T</div><TypingDots/></div>}
        {processing && <ProcessingBubble msg={processing}/>}
        <div ref={bottomRef}/>
      </div>

      {/* Controls */}
      {!typing && !processing && (
        <div style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:16, flexShrink:0 }}>

          {/* Profile */}
          {step===S.PROFILE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(PROFILES).map(([k,p]) => (
                <button key={k} onClick={() => handleProfile(k)}
                  style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', textAlign:'left', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', gap:10, color:'var(--text-primary)', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.background='var(--brand-light)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--surface)';}}>
                  <span style={{ fontSize:20 }}>{p.icon}</span><span>{p.label}</span><ChevronRight size={16} style={{ marginLeft:'auto', color:'var(--text-muted)' }}/>
                </button>
              ))}
            </div>
          )}

          {/* Age */}
          {step===S.AGE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {AGE_OPTS.map(a => (
                <button key={a.id} onClick={() => handleAge(a.id, a.label)}
                  style={{ padding:'11px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', gap:8, color:'var(--text-primary)' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.background='var(--brand-light)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--surface)';}}>
                  {a.label}<ChevronRight size={15} style={{ marginLeft:'auto', color:'var(--text-muted)' }}/>
                </button>
              ))}
            </div>
          )}

          {/* Form 16 */}
          {step===S.FORM16 && !showInput && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload Form 16 (PDF / Image)" onFile={handleForm16Upload} uploading={uploading} progress={uploadPct}/>
              {uploadError && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--danger)' }}><AlertCircle size={13}/> {uploadError}</div>}
              <button onClick={handleManualSalary} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>I don't have it — enter manually</button>
            </div>
          )}

          {/* Employer change */}
          {step===S.EMPLOYERS && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => { addUser('Yes, changed jobs'); addAI(<p>Please upload the Form 16 from your previous employer too.</p>, null); }}>Yes, changed jobs</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => { addUser('No, only one employer'); afterSalaryEntry(); }}>No, one employer</Button>
            </div>
          )}

          {/* Business type */}
          {step===S.BIZ_TYPE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {BIZ_TYPES.map(b => (
                <button key={b.id} onClick={() => setSelBizType(b.id)}
                  style={{ padding:'11px 16px', borderRadius:'var(--radius-md)', border:`1.5px solid ${selBizType===b.id?'var(--brand)':'var(--border-strong)'}`, background:selBizType===b.id?'var(--brand-light)':'var(--surface)', textAlign:'left', fontSize:13, cursor:'pointer' }}>
                  <div style={{ fontWeight:600, color:selBizType===b.id?'var(--brand)':'var(--text-primary)' }}>{b.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{b.sub}</div>
                </button>
              ))}
              <Button variant="primary" onClick={handleBizTypeConfirm} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Other income multi-select */}
          {step===S.OTHER_INCOME_Q && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_TYPES.map(t => <Chip key={t.id} label={t.label} selected={otherIncomeTypes.includes(t.id)} onClick={() => toggleOtherType(t.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherTypes} disabled={otherIncomeTypes.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* HP type */}
          {step===S.HP_TYPE && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Self Occupied')}>Self-occupied</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Rented')}>Rented out</Button>
            </div>
          )}

          {/* AIS question */}
          {step===S.AIS_Q && !showInput && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload AIS / Form 26AS (PDF)" onFile={handleAISUpload} uploading={uploading} progress={uploadPct}/>
              {uploadError && <div style={{ fontSize:12, color:'var(--danger)' }}>{uploadError}</div>}
              <button onClick={() => { addUser('Skip AIS upload'); proceedToDeductions(); }} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>Skip — continue without AIS</button>
            </div>
          )}

          {/* 80C deductions */}
          {step===S.DED_80C && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {DEDUCTION_OPTIONS.map(o => <Chip key={o.id} label={o.label} selected={sel80C.includes(o.id)} onClick={() => toggle80C(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={sel80C.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Other deductions */}
          {step===S.DED_OTHER && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_DEDUCTION_OPTIONS.map(o => <Chip key={o.id} label={o.label} selected={selOther.includes(o.id)} onClick={() => toggleOtherDed(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherDed} disabled={selOther.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Advance tax */}
          {step===S.TAXES_Q && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => { addUser('No advance tax paid'); computeAndShow(); }}>No</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => { ask(<p>What was the total <strong>advance tax</strong> paid during FY 2025-26?</p>, 'adv_tax'); }}>Yes, enter amount</Button>
            </div>
          )}

          {/* Amount input */}
          {showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', padding:'0 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
                <span style={{ fontWeight:600, color:'var(--text-muted)' }}>₹</span>
                <input type="number" placeholder="Enter amount" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key==='Enter' && inputValue && handleAmount()} autoFocus
                  style={{ flex:1, fontSize:15, padding:'12px 0', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none' }}/>
              </div>
              <Button variant="primary" onClick={handleAmount} disabled={!inputValue}><Send size={15}/></Button>
            </div>
          )}

          {/* Done */}
          {step===S.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14}/> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
