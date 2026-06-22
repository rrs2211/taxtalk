import React, { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { PROFILES, DEDUCTION_OPTIONS, OTHER_DEDUCTION_OPTIONS, computeTax, calcHousePropertyIncome, formatINR, formatINRShort } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

const STEP = {
  WELCOME:'welcome', PROFILE:'profile', AGE:'age', FORM16:'form16', EMPLOYERS:'employers',
  OTHER_INCOME_Q:'other_income_q',
  INTEREST_AMT:'interest_amt',
  HP_Q:'hp_q', HP_TYPE:'hp_type', HP_RENT:'hp_rent', HP_INTEREST:'hp_interest',
  CG_Q:'cg_q', CG_EQUITY_STCG:'cg_equity_stcg', CG_EQUITY_LTCG:'cg_equity_ltcg', CG_PROP_LTCG:'cg_prop_ltcg',
  DEDUCTIONS_80C:'deductions_80c', DEDUCTIONS_80C_AMOUNT:'deductions_80c_amount',
  OTHER_DEDUCTIONS:'other_deductions', MEDICLAIM_AMOUNT:'mediclaim_amount',
  TAXES_PAID:'taxes_paid', ADVANCE_TAX:'advance_tax',
  COMPUTATION:'computation', DONE:'done',
};

// ── UI primitives ─────────────────────────────────────────────────────────────
function TypingIndicator() {
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
function UploadZone({ onFile, uploading, progress }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <button onClick={() => ref.current.click()} disabled={uploading} style={{ width:'100%', padding:14, borderRadius:'var(--radius-md)', border:'2px dashed var(--brand)', background:'var(--brand-light)', color:'var(--brand)', fontSize:14, fontWeight:500, cursor:uploading?'wait':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {uploading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Uploading… {progress>0?`${progress}%`:''}</> : <><Upload size={18}/> Upload Form 16 (PDF / Image)</>}
      </button>
    </div>
  );
}
function ExtractingBubble() {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:13, color:'var(--text-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'var(--brand)' }} /> Reading your document — this takes 10–15 seconds…
      </div>
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────
function EditField({ label, value, onChange, note, allowNegative }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const ref = useRef(null);
  function start() { setDraft(value !== 0 ? String(Math.abs(value)) : ''); setEditing(true); setTimeout(() => ref.current?.select(), 40); }
  function commit() { const n = parseInt(draft.replace(/[^0-9]/g,'')) || 0; onChange(n); setEditing(false); }
  const display = value < 0 ? `−${formatINR(Math.abs(value))}` : formatINR(value);
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <div><span style={{ color:'var(--text-secondary)' }}>{label}</span>{note&&<span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{note}</span>}</div>
      {editing
        ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ color:'var(--text-muted)', fontWeight:600 }}>₹</span>
            <input ref={ref} type="number" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}} style={{ width:110, padding:'3px 8px', border:'1.5px solid var(--brand)', borderRadius:6, fontSize:13, textAlign:'right', outline:'none', background:'var(--surface)', color:'var(--text-primary)' }} />
          </div>
        : <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:500, color: value<0?'var(--danger)':'var(--brand)' }}>{display}</span>
            <button onClick={start} style={{ padding:'2px 8px', fontSize:11, border:'1px solid var(--border-strong)', borderRadius:5, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'pointer' }}>Edit</button>
          </div>
      }
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────
function RegimeCard({ label, data, regime, selected, better, onSelect }) {
  const tax     = regime==='old' ? data.oldTax     : data.newTax;
  const taxable = regime==='old' ? data.oldTaxable : data.newTaxable;
  const slab    = regime==='old' ? data.oldSlabTax : data.newSlabTax;
  const rebate  = regime==='old' ? data.oldRebate  : data.newRebate;
  const sc      = regime==='old' ? data.oldSurcharge : data.newSurcharge;
  const balance = Math.max(0, tax - data.totalPaid);
  const refund  = Math.max(0, data.totalPaid - tax);
  return (
    <div onClick={onSelect} style={{ flex:1, borderRadius:10, border:`2px solid ${selected?'var(--brand)':'var(--border)'}`, background:selected?'var(--brand-light)':'var(--surface)', padding:'14px', cursor:'pointer', transition:'all 0.15s', position:'relative', overflow:'visible' }}>
      {better && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'var(--success)', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20, whiteSpace:'nowrap' }}>RECOMMENDED</div>}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:selected?'var(--brand)':'var(--text-primary)' }}>{label}</span>
        <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selected?'var(--brand)':'var(--border-strong)'}`, background:selected?'var(--brand)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {selected && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
        </div>
      </div>
      {[
        { l:'Taxable income', v:formatINR(taxable) },
        { l:'Slab tax', v:formatINR(slab) },
        ...(rebate>0 ? [{ l:'Rebate u/s 87A', v:`−${formatINR(rebate)}` }] : []),
        ...(data.cgTax>0 ? [{ l:'CG tax (special rates)', v:formatINR(data.cgTax) }] : []),
        ...(sc>0 ? [{ l:'Surcharge', v:formatINR(sc) }] : []),
        { l:'Tax + 4% cess', v:formatINR(tax), bold:true },
      ].map((r,i)=>(
        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', borderBottom:'0.5px solid var(--border)', color: r.bold?'var(--text-primary)':'var(--text-secondary)', fontWeight:r.bold?700:400 }}>
          <span>{r.l}</span><span style={{ color:r.bold?(selected?'var(--brand)':'var(--text-primary)'):'inherit' }}>{r.v}</span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)', fontSize:13, fontWeight:600 }}>
        {refund>0 ? <span style={{ color:'var(--success)' }}>Refund: {formatINR(refund)}</span>
                  : <span style={{ color:balance>0?'var(--warn)':'var(--text-muted)' }}>{balance>0?`Pay: ${formatINR(balance)}`:'No balance due'}</span>}
      </div>
    </div>
  );
}

// ── Full computation review ───────────────────────────────────────────────────
function ComputationCard({ initialData, initialInputs, onApprove, submitting }) {
  const [inp, setInp] = useState({
    grossSalary:    initialInputs.grossSalary    || 0,
    standardDeduction: initialInputs.standardDeduction || 75000,
    professionalTax: initialInputs.professionalTax || 0,
    otherIncome:    initialInputs.otherIncome    || 0,
    houseProperty:  initialInputs.houseProperty  || null,
    capitalGains:   initialInputs.capitalGains   || null,
    deductions80C:  initialInputs.deductions80C  || 0,
    deductions80D:  initialInputs.deductions80D  || 0,
    deductions24b:  initialInputs.deductions24b  || 0,
    deductions80E:  initialInputs.deductions80E  || 0,
    deductions80TTA:initialInputs.deductions80TTA|| 0,
    deductions80G:  initialInputs.deductions80G  || 0,
    tdsDeducted:    initialInputs.tdsDeducted    || 0,
    advanceTax:     initialInputs.advanceTax     || 0,
    selfAssessment: initialInputs.selfAssessment || 0,
    ageGroup:       initialInputs.ageGroup       || '<60',
  });
  const [regime, setRegime] = useState(initialData.betterRegime || 'new');

  const comp = computeTax(inp);

  const selTax     = regime==='old' ? comp.oldTax : comp.newTax;
  const balanceDue = Math.max(0, selTax - comp.totalPaid);
  const refund     = Math.max(0, comp.totalPaid - selTax);

  const set = f => v => setInp(p => ({ ...p, [f]: v }));

  const hasHP  = !!inp.houseProperty?.enabled;
  const hasCG  = !!inp.capitalGains?.enabled;

  function handleApprove() {
    onApprove({ ...comp, betterRegime:regime, chosenTax:selTax, balanceDue, refund });
  }

  const SH = ({ children }) => (
    <div style={{ padding:'7px 12px', background:'var(--surface-3)', fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{children}</div>
  );

  return (
    <Card style={{ marginTop:8 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:3 }}>Review & confirm your details</div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>All values are editable — tap <strong>Edit</strong> to correct. Computation updates instantly.</div>
      </div>

      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
        <SH>Salary income</SH>
        <EditField label="Gross salary"            value={inp.grossSalary}        onChange={set('grossSalary')} />
        <EditField label="Standard deduction (16ia)" value={inp.standardDeduction} onChange={set('standardDeduction')} note="default ₹75,000" />
        <EditField label="Professional tax (16iii)" value={inp.professionalTax}   onChange={set('professionalTax')} />

        <SH>Other income sources</SH>
        <EditField label="Interest / dividends / other income" value={inp.otherIncome} onChange={set('otherIncome')} note="Schedule OS" />

        {hasHP && (
          <>
            <SH>House property</SH>
            <div style={{ padding:'8px 12px', fontSize:13, color:'var(--text-secondary)', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
              Type: <strong>{inp.houseProperty.type}</strong>
              {inp.houseProperty.type==='Rented' && <> · Rent: {formatINR(inp.houseProperty.rentReceived)} · Municipal tax: {formatINR(inp.houseProperty.municipalTaxes)}</>}
              {' '}· Interest: {formatINR(inp.houseProperty.interestPaid)}
              {' '}→ <strong style={{ color: comp.hpIncome<0?'var(--danger)':'var(--success)' }}>{formatINR(comp.hpIncome)}</strong>
            </div>
          </>
        )}

        {hasCG && (
          <>
            <SH>Capital gains</SH>
            {(inp.capitalGains.shares?.stcg111a||0)>0 && <EditField label="STCG — Equity/funds (Sec 111A @ 20%)" value={inp.capitalGains.shares.stcg111a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,stcg111a:v}}}))} />}
            {(inp.capitalGains.shares?.ltcg112a||0)>0 && <EditField label="LTCG — Equity/funds (Sec 112A @ 12.5%)" value={inp.capitalGains.shares.ltcg112a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,ltcg112a:v}}}))} />}
            {(inp.capitalGains.property?.ltcg||0)>0 && <EditField label="LTCG — Property @ 12.5%" value={inp.capitalGains.property.ltcg} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,property:{...p.capitalGains.property,ltcg:v}}}))} />}
          </>
        )}

        <SH>Deductions — old regime only</SH>
        <EditField label="Section 80C"         value={inp.deductions80C}   onChange={set('deductions80C')}   note="max ₹1,50,000" />
        <EditField label="Section 80D"         value={inp.deductions80D}   onChange={set('deductions80D')}   note="max ₹75,000" />
        {!hasHP && <EditField label="Home loan interest (24b)" value={inp.deductions24b} onChange={set('deductions24b')} note="max ₹2,00,000" />}
        <EditField label="Education loan (80E)" value={inp.deductions80E}  onChange={set('deductions80E')} />
        <EditField label="Savings interest (80TTA)" value={inp.deductions80TTA} onChange={set('deductions80TTA')} note="max ₹10,000" />
        <EditField label="Donations (80G)"     value={inp.deductions80G}   onChange={set('deductions80G')} />

        <SH>Taxes already paid</SH>
        <EditField label="TDS deducted"         value={inp.tdsDeducted}    onChange={set('tdsDeducted')} />
        <EditField label="Advance tax paid"     value={inp.advanceTax}     onChange={set('advanceTax')} />
        <EditField label="Self-assessment tax"  value={inp.selfAssessment} onChange={set('selfAssessment')} />
      </div>

      {/* Gross total summary */}
      <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ color:'var(--text-secondary)' }}>Gross total income</span>
          <span style={{ fontWeight:600 }}>{formatINR(comp.grossTotal)}</span>
        </div>
        {comp.cgTax > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-muted)' }}>
          <span>Capital gains tax (special rates)</span><span>{formatINR(comp.cgTax)}</span>
        </div>}
      </div>

      {/* Regime selector */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>
          Choose your tax regime <span style={{ fontSize:11, fontWeight:400, color:'var(--text-muted)' }}>— tap a card to select</span>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <RegimeCard label="Old regime" data={comp} regime="old" selected={regime==='old'} better={comp.betterRegime==='old'} onSelect={()=>setRegime('old')} />
          <RegimeCard label="New regime" data={comp} regime="new" selected={regime==='new'} better={comp.betterRegime==='new'} onSelect={()=>setRegime('new')} />
        </div>
        {regime !== comp.betterRegime && (
          <div style={{ marginTop:8, fontSize:12, color:'var(--warn)', padding:'6px 10px', background:'var(--warn-light)', borderRadius:6 }}>
            ⚠️ You've chosen the {regime} regime — it costs {formatINR(Math.abs(comp.oldTax-comp.newTax))} more than recommended. Your CA will confirm before filing.
          </div>
        )}
      </div>

      {/* Outcome */}
      <div style={{ borderRadius:8, padding:'12px 14px', marginBottom:14, background:refund>0?'var(--success-light)':balanceDue>0?'var(--warn-light)':'var(--surface-3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>
              {refund>0 ? '🎉 Refund due' : balanceDue>0 ? '⚠️ Self-assessment tax to pay' : '✅ No balance due'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{regime==='old'?'Old':'New'} regime · Std deduction ₹75,000 included</div>
          </div>
          <div style={{ fontSize:24, fontWeight:700, color:refund>0?'var(--success)':balanceDue>0?'var(--warn)':'var(--text-muted)' }}>
            {refund>0 ? formatINR(refund) : balanceDue>0 ? formatINR(balanceDue) : '₹0'}
          </div>
        </div>
      </div>

      {/* Advance tax schedule */}
      {comp.advanceTaxSchedule?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>Advance tax instalments</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {comp.advanceTaxSchedule.map((s,i) => (
              <div key={i} style={{ background:'var(--surface-2)', borderRadius:6, padding:'8px 10px', textAlign:'center', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{s.due}</div>
                <div style={{ fontSize:12, fontWeight:600, marginTop:2 }}>{formatINRShort(s.amount)}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={handleApprove} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }} /> Submitting…</> : <><CheckCircle size={15}/> Confirm & send to CA for review</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will verify and file</p>
    </Card>
  );
}

// ── Main chat ─────────────────────────────────────────────────────────────────
export default function TaxChat({ userId }) {
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = useReturn(userId);

  const [step, setStep]           = useState(STEP.WELCOME);
  const [taxProfile, setTaxProfile] = useState(null);
  const [ageGroup, setAgeGroup]   = useState('<60');
  const [salary, setSalary]       = useState(0);
  const [tds, setTds]             = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
  const [advanceTax, setAdvanceTax]   = useState(0);
  const [houseProperty, setHP]    = useState(null);
  const [capitalGains, setCG]     = useState(null);
  const [deductions80C, setD80C]  = useState(0);
  const [deductions80D, setD80D]  = useState(0);
  const [deductions80E, setD80E]  = useState(0);
  const [deductions80TTA, setD80TTA] = useState(0);
  const [deductions80G, setD80G]  = useState(0);
  const [selected80C, setSel80C]  = useState([]);
  const [selectedOther, setSelOther] = useState([]);
  const [messages, setMessages]   = useState([]);
  const [typing, setTyping]       = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputContext, setInputContext] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (loadingReturn) return;
    const t = setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom:8 }}>👋 Hi! I'm <strong>TaxTalk</strong> — your personal CA assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>Filing your ITR will feel like a simple chat. I'll ask plain questions — no forms, no jargon.</p>
          <p>Ready to get started?</p>
        </>, () => setStep(STEP.PROFILE)
      );
    }, 600);
    return () => clearTimeout(t);
  }, [loadingReturn]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing, step, extracting]);

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
  function askAmount(prompt, ctx) {
    addAI(<p>{prompt}</p>, () => { setInputValue(''); setInputContext(ctx); setShowInput(true); });
  }

  // ── Profile ────────────────────────────────────────────────
  function handleProfileSelect(key) {
    setTaxProfile(key);
    addUser(PROFILES[key].label);
    setStep(STEP.AGE);
    addAI(<p>Got it. What is your <strong>age group</strong> for this financial year? This affects your basic exemption limit.</p>, null);
  }

  // ── Age ────────────────────────────────────────────────────
  function handleAgeSelect(age, label) {
    setAgeGroup(age);
    addUser(label);
    setStep(STEP.FORM16);
    addAI(<><p style={{ marginBottom:8 }}>The first document I need is your <strong>Form 16</strong> — it's the certificate your employer gives every year showing salary and TDS.</p><p>Please upload it below. PDF or image both work.</p></>, null);
  }

  // ── Upload ─────────────────────────────────────────────────
  async function handleFileUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0); setExtractError(null);
    addUser(`Uploaded: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'form16', p => setUploadPct(p));
      setUploading(false); setExtracting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Extraction failed');
      const { extracted } = await res.json();
      setExtracting(false);
      const sal    = extracted.gross_salary || 0;
      const tdsVal = extracted.total_tds_deducted || 0;
      const d80C   = (extracted.deduction_80c||0)+(extracted.deduction_80ccc||0)+(extracted.deduction_80ccd1||0);
      const d80D   = extracted.deduction_80d || 0;
      setSalary(sal); setTds(tdsVal);
      if (d80C>0) setD80C(d80C);
      if (d80D>0) setD80D(d80D);

      const extractedCard = (
        <>
          <p style={{ marginBottom:8 }}>I have read your Form 16 ✨</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13 }}>
            {extracted.employer_name && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Employer</span><span>{extracted.employer_name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross salary</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(sal)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tdsVal)}</span></div>
          </div>
          <p>Did you work for any <strong>other employer</strong> this year?</p>
        </>
      );
      setMessages(m => [...m, { from:'ai', key:Date.now(), content: extractedCard }]);
      setStep(STEP.EMPLOYERS);
    } catch (e) {
      setUploading(false); setExtracting(false); setExtractError(e.message);
      addAI(<><p style={{ marginBottom:8 }}>⚠️ Couldn't read the document. You can:</p><p>• Try uploading again<br/>• Enter salary manually</p></>, null);
    }
  }

  function handleManual() {
    addUser("I'll enter details manually");
    setStep(STEP.EMPLOYERS); // skip to salary manual entry
    askAmount('What was your <strong>total gross salary</strong> for FY 2025-26? (from your salary slips or Form 16 Part A)', 'salary');
  }

  // ── Employers / salary manual ──────────────────────────────
  function handleEmployers(multi) {
    if (multi) { addUser('Yes, changed jobs'); addAI(<p>Please upload the Form 16 from your previous employer too.</p>, null); return; }
    addUser('No, only one employer');
    proceedToOtherIncome();
  }

  function proceedToOtherIncome() {
    setStep(STEP.OTHER_INCOME_Q);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Other than your salary, did you earn any of these this year?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply</p>
      </>, null
    );
  }

  // ── Other income ───────────────────────────────────────────
  const [otherIncomeTypes, setOtherIncomeTypes] = useState([]);
  function toggleOtherType(id) {
    if (id==='none') { setOtherIncomeTypes(['none']); return; }
    setOtherIncomeTypes(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  const OTHER_INCOME_TYPES = [
    { id:'interest',  label:'Bank / FD / savings interest' },
    { id:'dividend',  label:'Dividends' },
    { id:'rental',    label:'Rental income (house property)' },
    { id:'cg',        label:'Capital gains (shares / property)' },
    { id:'none',      label:'None of these' },
  ];
  function confirmOtherIncomeTypes() {
    const types = otherIncomeTypes;
    addUser(types.includes('none') || types.length===0 ? 'None of these' : OTHER_INCOME_TYPES.filter(t=>types.includes(t.id)).map(t=>t.label).join(', '));
    if (types.includes('interest') || types.includes('dividend')) {
      setStep(STEP.INTEREST_AMT);
      askAmount('What was your total <strong>interest + dividend income</strong> this year? (savings interest, FD interest, dividends combined)', 'interest');
    } else if (types.includes('rental')) {
      proceedToHP();
    } else if (types.includes('cg')) {
      proceedToCG();
    } else {
      proceedToDeductions();
    }
  }

  function proceedToHP() {
    setStep(STEP.HP_Q);
    addAI(<p>Tell me about your <strong>house property</strong> — is it self-occupied or rented out?</p>, null);
  }
  function proceedToCG() {
    setStep(STEP.CG_Q);
    addAI(<><p style={{ marginBottom:8 }}>Did you sell any <strong>shares or mutual funds</strong> this year?</p></>, null);
  }
  function proceedToDeductions() {
    setStep(STEP.DEDUCTIONS_80C);
    addAI(
      <><p style={{ marginBottom:8 }}>Now let's check your <strong>tax-saving investments</strong> for FY 2025-26. These reduce tax only under the old regime.</p><p>Select all that apply:</p></>,
      null
    );
  }

  // ── HP flow ────────────────────────────────────────────────
  function handleHPType(type) {
    addUser(type==='Rented' ? 'It is rented out' : 'Self-occupied');
    setHP({ enabled:true, type, rentReceived:0, municipalTaxes:0, interestPaid:0 });
    if (type==='Rented') {
      setStep(STEP.HP_RENT);
      askAmount('What was the <strong>annual rent received</strong>?', 'hp_rent');
    } else {
      setStep(STEP.HP_INTEREST);
      askAmount('Did you pay <strong>home loan interest</strong> on this property? Enter the annual interest paid (enter 0 if none):', 'hp_interest');
    }
  }

  // ── CG flow ────────────────────────────────────────────────
  function handleCGStcg(ans) {
    if (ans) {
      setStep(STEP.CG_EQUITY_STCG);
      askAmount('What was your <strong>Short Term Capital Gain (STCG) on shares/equity funds</strong>? (sold within 12 months) — Section 111A, taxed at 20%', 'cg_stcg');
    } else {
      addUser('No STCG on shares');
      setStep(STEP.CG_EQUITY_LTCG);
      askAmount('What was your <strong>Long Term Capital Gain (LTCG) on shares/equity funds</strong>? (held 12+ months) — Section 112A, taxed at 12.5% above ₹1.25L. Enter 0 if none.', 'cg_ltcg');
    }
  }

  // ── Deductions ─────────────────────────────────────────────
  function toggle80C(id) {
    if (id==='none') { setSel80C(['none']); return; }
    setSel80C(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirm80C() {
    if (sel80C.includes('none')||sel80C.length===0) {
      addUser('None'); goToOtherDed();
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o=>sel80C.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels);
      if (deductions80C>0) {
        setStep(STEP.DEDUCTIONS_80C_AMOUNT);
        askAmount(`I found ${formatINR(deductions80C)} 80C in your Form 16. Is that correct, or enter the actual total:`, 'd80c');
      } else {
        setStep(STEP.DEDUCTIONS_80C_AMOUNT);
        askAmount('What was your <strong>total Section 80C investment</strong> this year? (max ₹1,50,000 for tax saving)', 'd80c');
      }
    }
  }
  function goToOtherDed() {
    setStep(STEP.OTHER_DEDUCTIONS);
    addAI(<><p style={{ marginBottom:8 }}>Any other deductions?</p><p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply:</p></>, null);
  }
  function toggleOtherDed(id) {
    if (id==='none') { setSelOther(['none']); return; }
    setSelOther(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirmOtherDed() {
    const hasMed = selectedOther.includes('mediclaim_self')||selectedOther.includes('mediclaim_parents');
    if (selectedOther.includes('none')||selectedOther.length===0) {
      addUser('None'); goToTaxesPaid();
    } else {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o=>selectedOther.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels);
      if (hasMed) {
        setStep(STEP.MEDICLAIM_AMOUNT);
        askAmount('What was your total <strong>mediclaim / health insurance premium</strong> paid this year?', 'd80d');
      } else {
        goToTaxesPaid();
      }
    }
  }

  // ── Taxes paid ─────────────────────────────────────────────
  function goToTaxesPaid() {
    setStep(STEP.TAXES_PAID);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Have you paid any <strong>advance tax</strong> during the year?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Advance tax is paid in instalments during the year if your tax liability exceeds ₹10,000.</p>
      </>, null
    );
  }

  // ── Amount input handler ───────────────────────────────────
  function handleAmountSubmit() {
    const val = parseInt(inputValue.replace(/[^0-9]/g,'')) || 0;
    setShowInput(false); setInputValue('');
    addUser(`₹${val.toLocaleString('en-IN')}`);
    const ctx = inputContext;

    if (ctx==='salary') {
      setSalary(val);
      askAmount('What was the <strong>TDS deducted</strong> from your salary by your employer? (enter 0 if none)', 'tds_manual');
    } else if (ctx==='tds_manual') {
      setTds(val); proceedToOtherIncome();
    } else if (ctx==='interest') {
      setOtherIncome(val);
      if (otherIncomeTypes.includes('rental')) proceedToHP();
      else if (otherIncomeTypes.includes('cg')) proceedToCG();
      else proceedToDeductions();
    } else if (ctx==='hp_rent') {
      setHP(p => ({ ...p, rentReceived:val }));
      askAmount('What was the <strong>municipal tax / property tax</strong> paid on this property? (enter 0 if none)', 'hp_municipal');
    } else if (ctx==='hp_municipal') {
      setHP(p => ({ ...p, municipalTaxes:val }));
      setStep(STEP.HP_INTEREST);
      askAmount('What was the <strong>home loan interest</strong> paid on this property? (enter 0 if no loan)', 'hp_interest');
    } else if (ctx==='hp_interest') {
      setHP(p => ({ ...p, interestPaid:val }));
      if (otherIncomeTypes.includes('cg')) proceedToCG();
      else proceedToDeductions();
    } else if (ctx==='cg_stcg') {
      setCG(p => ({ ...p, enabled:true, shares:{ ...(p?.shares||{}), stcg111a:val } }));
      setStep(STEP.CG_EQUITY_LTCG);
      askAmount('What was your <strong>LTCG on shares/equity funds</strong>? (held 12+ months, Sec 112A @ 12.5%). Enter 0 if none.', 'cg_ltcg');
    } else if (ctx==='cg_ltcg') {
      setCG(p => ({ ...p, enabled:true, shares:{ ...(p?.shares||{}), ltcg112a:val } }));
      setStep(STEP.CG_PROP_LTCG);
      askAmount('Did you sell any <strong>property / land</strong>? Enter the Long Term Capital Gain amount (enter 0 if none). Taxed at 12.5% without indexation.', 'cg_prop');
    } else if (ctx==='cg_prop') {
      setCG(p => ({ ...p, enabled:true, property:{ ...(p?.property||{}), ltcg:val } }));
      proceedToDeductions();
    } else if (ctx==='d80c') {
      setD80C(val); goToOtherDed();
    } else if (ctx==='d80d') {
      setD80D(val); goToTaxesPaid();
    } else if (ctx==='advance_tax') {
      setAdvanceTax(val); computeAndShow();
    }
  }

  // ── Computation ────────────────────────────────────────────
  function computeAndShow() {
    const inputs = {
      grossSalary: salary, otherIncome, houseProperty, capitalGains,
      deductions80C, deductions80D, deductions80E, deductions80TTA, deductions80G,
      tdsDeducted:tds, advanceTax, ageGroup,
      standardDeduction:75000, professionalTax:0,
    };
    const result = computeTax(inputs);
    saveComputation(result).catch(console.error);
    setStep(STEP.COMPUTATION);
    addAI(
      <>
        <p style={{ marginBottom:6 }}>Your tax summary is ready! 🎉</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Review all details below, edit anything that's wrong, and choose your preferred regime. Computation updates live.</p>
      </>, null
    );
    setTimeout(() => {
      setMessages(m => [...m, {
        from:'ai', key:Date.now()+1,
        content:<ComputationCard initialData={result} initialInputs={inputs} onApprove={handleFinalSubmit} submitting={submitting} />
      }]);
    }, 900);
  }

  async function handleFinalSubmit(finalComp) {
    setSubmitting(true);
    try {
      await saveComputation(finalComp);
      const note = `${taxProfile} | ${ageGroup} | Income: ${formatINR(finalComp.grossTotal)} | Tax: ${formatINR(finalComp.chosenTax)} | Regime: ${finalComp.betterRegime} | ${finalComp.refund>0?'Refund: '+formatINR(finalComp.refund):'Balance: '+formatINR(finalComp.balanceDue)}`;
      await submitToCA(note, []);
      setStep(STEP.DONE);
      addUser('Confirmed & sent to CA');
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ <strong>Done!</strong> Your return has been sent to the CA team at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They'll review it within 24 hours and contact you if anything is needed. You'll be notified once it's filed.</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Acknowledgment number will be shared after filing.</p>
        </>, null
      );
    } catch(e) {
      addAI(<p style={{ color:'var(--danger)' }}>⚠️ Could not submit — {e.message}</p>, null);
    } finally { setSubmitting(false); }
  }

  function handleReset() {
    setStep(STEP.WELCOME); setMessages([]); setTaxProfile(null); setSalary(0); setTds(0);
    setOtherIncome(0); setAdvanceTax(0); setHP(null); setCG(null);
    setD80C(0); setD80D(0); setD80E(0); setD80TTA(0); setD80G(0);
    setSel80C([]); setSelOther([]); setOtherIncomeTypes([]); setAgeGroup('<60');
    setShowInput(false); setInputValue(''); setExtractError(null);
    setTimeout(() => addAI(<p>👋 Ready to file another return?</p>, () => setStep(STEP.PROFILE)), 400);
  }

  const AGE_OPTIONS = [
    { id:'<60',   label:'Below 60 years' },
    { id:'60-80', label:'60–80 (Senior citizen)' },
    { id:'>80',   label:'Above 80 (Super senior)' },
  ];

  if (loadingReturn) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)', fontSize:14 }}>
      <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading…
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
        {typing && <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>T</div><TypingIndicator/></div>}
        {extracting && <ExtractingBubble/>}
        <div ref={bottomRef}/>
      </div>

      {/* Controls */}
      {!typing && !extracting && (
        <div style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:16, flexShrink:0 }}>

          {step===STEP.PROFILE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(PROFILES).map(([k,p]) => (
                <button key={k} onClick={()=>handleProfileSelect(k)}
                  style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', textAlign:'left', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', gap:10, color:'var(--text-primary)', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.background='var(--brand-light)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--surface)';}}>
                  <span style={{ fontSize:20 }}>{p.icon}</span><span>{p.label}</span><ChevronRight size={16} style={{ marginLeft:'auto', color:'var(--text-muted)' }}/>
                </button>
              ))}
            </div>
          )}

          {step===STEP.AGE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {AGE_OPTIONS.map(a => (
                <button key={a.id} onClick={()=>handleAgeSelect(a.id,a.label)}
                  style={{ padding:'11px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', gap:8, color:'var(--text-primary)' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.background='var(--brand-light)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--surface)';}}>
                  {a.label}<ChevronRight size={15} style={{ marginLeft:'auto', color:'var(--text-muted)' }}/>
                </button>
              ))}
            </div>
          )}

          {step===STEP.FORM16 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadZone onFile={handleFileUpload} uploading={uploading} progress={uploadPct}/>
              {extractError && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--danger)' }}><AlertCircle size={13}/>{extractError}</div>}
              <button onClick={handleManual} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>I don't have it — enter manually</button>
            </div>
          )}

          {step===STEP.EMPLOYERS && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={()=>handleEmployers(true)}>Yes, changed jobs</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={()=>handleEmployers(false)}>No, one employer</Button>
            </div>
          )}

          {step===STEP.OTHER_INCOME_Q && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_INCOME_TYPES.map(t=><Chip key={t.id} label={t.label} selected={otherIncomeTypes.includes(t.id)} onClick={()=>toggleOtherType(t.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherIncomeTypes} disabled={otherIncomeTypes.length===0} style={{ alignSelf:'flex-end' }}>Continue<ChevronRight size={15}/></Button>
            </div>
          )}

          {step===STEP.HP_Q && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={()=>handleHPType('Self Occupied')}>Self-occupied</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={()=>handleHPType('Rented')}>Rented out</Button>
            </div>
          )}

          {step===STEP.CG_Q && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={()=>handleCGStcg(false)}>No STCG on shares</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={()=>handleCGStcg(true)}>Yes, enter STCG</Button>
            </div>
          )}

          {step===STEP.DEDUCTIONS_80C && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {DEDUCTION_OPTIONS.map(o=><Chip key={o.id} label={o.label} selected={sel80C.includes(o.id)} onClick={()=>toggle80C(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={sel80C.length===0} style={{ alignSelf:'flex-end' }}>Continue<ChevronRight size={15}/></Button>
            </div>
          )}

          {step===STEP.OTHER_DEDUCTIONS && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_DEDUCTION_OPTIONS.map(o=><Chip key={o.id} label={o.label} selected={selectedOther.includes(o.id)} onClick={()=>toggleOtherDed(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherDed} disabled={selectedOther.length===0} style={{ alignSelf:'flex-end' }}>Continue<ChevronRight size={15}/></Button>
            </div>
          )}

          {step===STEP.TAXES_PAID && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={()=>{ addUser('No advance tax'); computeAndShow(); }}>No, I haven't paid advance tax</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={()=>{ setStep(STEP.ADVANCE_TAX); askAmount('Enter the total <strong>advance tax</strong> you paid during FY 2025-26:', 'advance_tax'); }}>Yes, enter amount</Button>
            </div>
          )}

          {showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', padding:'0 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
                <span style={{ fontWeight:600, color:'var(--text-muted)' }}>₹</span>
                <input type="number" placeholder="Enter amount" value={inputValue} onChange={e=>setInputValue(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&inputValue&&handleAmountSubmit()} autoFocus
                  style={{ flex:1, fontSize:15, padding:'12px 0', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none' }}/>
              </div>
              <Button variant="primary" onClick={handleAmountSubmit} disabled={!inputValue}><Send size={15}/></Button>
            </div>
          )}

          {step===STEP.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14}/> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
