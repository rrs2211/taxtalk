import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle } from 'lucide-react';
import { PROFILES, DEDUCTION_OPTIONS, OTHER_DEDUCTION_OPTIONS, computeTax, formatINR } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

const STEP = {
  WELCOME:'welcome', PROFILE:'profile', FORM16:'form16', EMPLOYERS:'employers',
  DEDUCTIONS_80C:'deductions_80c', DEDUCTIONS_80C_AMOUNT:'deductions_80c_amount',
  OTHER_DEDUCTIONS:'other_deductions', MEDICLAIM_AMOUNT:'mediclaim_amount',
  OTHER_INCOME:'other_income', COMPUTATION:'computation', DONE:'done',
};

// ── Small helpers ─────────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', width:'fit-content' }}>
      {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--text-muted)', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
    </div>
  );
}
function AIBubble({ children }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
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
function ChoiceChip({ label, selected, onClick }) {
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
        {uploading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Uploading… {progress>0?`${progress}%`:''}</> : <><Upload size={18} /> Upload PDF / Image</>}
      </button>
    </div>
  );
}
function ExtractingBubble() {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:13, color:'var(--text-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'var(--brand)' }} />
        Reading your document — this takes about 10–15 seconds…
      </div>
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────
function EditableField({ label, value, onChange, note }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef              = useRef(null);

  function startEdit() {
    setDraft(value > 0 ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }
  function commit() {
    const n = parseInt(draft.replace(/[^0-9]/g, '')) || 0;
    onChange(n);
    setEditing(false);
  }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <div>
        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
        {note && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{note}</span>}
      </div>
      {editing ? (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'var(--text-muted)', fontWeight:600 }}>₹</span>
          <input ref={inputRef} type="number" value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
            style={{ width:110, padding:'3px 8px', border:'1.5px solid var(--brand)', borderRadius:6, fontSize:13, textAlign:'right', outline:'none', background:'var(--surface)', color:'var(--text-primary)' }} />
        </div>
      ) : (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:500, color:'var(--brand)' }}>{formatINR(value)}</span>
          <button onClick={startEdit} style={{ padding:'2px 8px', fontSize:11, border:'1px solid var(--border-strong)', borderRadius:5, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'pointer' }}>Edit</button>
        </div>
      )}
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────
function RegimeCard({ label, taxable, tax, tds, selected, better, onSelect }) {
  const balance = Math.max(0, tax - tds);
  const refund  = Math.max(0, tds - tax);
  return (
    <div onClick={onSelect} style={{ flex:1, borderRadius:10, border:`2px solid ${selected?'var(--brand)':'var(--border)'}`, background:selected?'var(--brand-light)':'var(--surface)', padding:'14px', cursor:'pointer', transition:'all 0.15s', position:'relative' }}>
      {better && (
        <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'var(--success)', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20, whiteSpace:'nowrap' }}>
          RECOMMENDED
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:selected?'var(--brand)':'var(--text-primary)' }}>{label}</span>
        <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selected?'var(--brand)':'var(--border-strong)'}`, background:selected?'var(--brand)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {selected && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
        </div>
      </div>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>Taxable income</div>
      <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>{formatINR(taxable)}</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>Tax payable (incl. 4% cess)</div>
      <div style={{ fontSize:20, fontWeight:700, color:selected?'var(--brand)':'var(--text-primary)', marginBottom:10 }}>{formatINR(tax)}</div>
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, fontSize:12 }}>
        {refund > 0
          ? <span style={{ color:'var(--success)', fontWeight:600 }}>Refund: {formatINR(refund)}</span>
          : <span style={{ color:balance>0?'var(--warn)':'var(--text-muted)', fontWeight:600 }}>
              {balance > 0 ? `Pay before filing: ${formatINR(balance)}` : 'Fully covered by TDS'}
            </span>}
      </div>
    </div>
  );
}

// ── Computation review card ───────────────────────────────────────────────────
function ComputationCard({ initialData, initialInputs, onApprove, submitting }) {
  const [inputs, setInputs] = useState({
    grossSalary:   initialInputs.grossSalary   || 0,
    otherIncome:   initialInputs.otherIncome   || 0,
    deductions80C: initialInputs.deductions80C || 0,
    deductions80D: initialInputs.deductions80D || 0,
    deductions24b: initialInputs.deductions24b || 0,
    tdsDeducted:   initialInputs.tdsDeducted   || 0,
  });
  const [chosenRegime, setChosenRegime] = useState(initialData.betterRegime || 'new');

  const comp       = computeTax(inputs);
  const selTax     = chosenRegime === 'old' ? comp.oldTax     : comp.newTax;
  const selTaxable = chosenRegime === 'old' ? comp.oldTaxable : comp.newTaxable;
  const balanceDue = Math.max(0, selTax - comp.tdsDeducted);
  const refund     = Math.max(0, comp.tdsDeducted - selTax);

  function set(field) { return v => setInputs(prev => ({ ...prev, [field]: v })); }

  function handleApprove() {
    onApprove({ ...comp, betterRegime:chosenRegime, chosenTax:selTax, balanceDue, refund });
  }

  const SectionHead = ({ children }) => (
    <div style={{ padding:'7px 12px', background:'var(--surface-3)', fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{children}</div>
  );

  return (
    <Card style={{ marginTop:8 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:3 }}>Review & confirm your details</div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>Tap <strong>Edit</strong> next to any value to correct it — computation updates instantly</div>
      </div>

      {/* Editable inputs */}
      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
        <SectionHead>Income</SectionHead>
        <EditableField label="Gross salary"                        value={inputs.grossSalary}   onChange={set('grossSalary')} />
        <EditableField label="Other income (interest, rent, etc.)" value={inputs.otherIncome}   onChange={set('otherIncome')}   note="Schedule OS" />
        <SectionHead>Deductions (old regime only)</SectionHead>
        <EditableField label="Section 80C investments"             value={inputs.deductions80C} onChange={set('deductions80C')} note="max ₹1,50,000" />
        <EditableField label="Section 80D — mediclaim premium"     value={inputs.deductions80D} onChange={set('deductions80D')} note="max ₹75,000" />
        <EditableField label="Home loan interest (Sec 24b)"        value={inputs.deductions24b} onChange={set('deductions24b')} note="max ₹2,00,000" />
        <SectionHead>Tax already paid</SectionHead>
        <EditableField label="TDS deducted by employer / others"   value={inputs.tdsDeducted}   onChange={set('tdsDeducted')} />
      </div>

      {/* Regime selector */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
          Choose your tax regime
          <span style={{ fontSize:11, fontWeight:400, color:'var(--text-muted)' }}>— tap a card to select</span>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <RegimeCard label="Old regime" taxable={comp.oldTaxable} tax={comp.oldTax} tds={comp.tdsDeducted}
            selected={chosenRegime==='old'} better={comp.betterRegime==='old'} onSelect={() => setChosenRegime('old')} />
          <RegimeCard label="New regime" taxable={comp.newTaxable} tax={comp.newTax} tds={comp.tdsDeducted}
            selected={chosenRegime==='new'} better={comp.betterRegime==='new'} onSelect={() => setChosenRegime('new')} />
        </div>
        {chosenRegime !== comp.betterRegime && (
          <div style={{ marginTop:8, fontSize:12, color:'var(--warn)', padding:'6px 10px', background:'var(--warn-light)', borderRadius:6 }}>
            ⚠️ You've chosen the {chosenRegime} regime — it costs {formatINR(Math.abs(comp.oldTax - comp.newTax))} more than the recommended option. Your CA will confirm before filing.
          </div>
        )}
      </div>

      {/* Final outcome */}
      <div style={{ borderRadius:8, padding:'12px 14px', marginBottom:14, background:refund>0?'var(--success-light)':balanceDue>0?'var(--warn-light)':'var(--surface-3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>
              {refund>0 ? '🎉 Refund due to you' : balanceDue>0 ? '⚠️ Self-assessment tax to pay' : '✅ No balance due'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              {chosenRegime==='old'?'Old':'New'} regime · Standard deduction ₹75,000 included
            </div>
          </div>
          <div style={{ fontSize:24, fontWeight:700, color:refund>0?'var(--success)':balanceDue>0?'var(--warn)':'var(--text-muted)' }}>
            {refund>0 ? formatINR(refund) : balanceDue>0 ? formatINR(balanceDue) : '₹0'}
          </div>
        </div>
      </div>

      <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={handleApprove} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }} /> Submitting…</> : <><CheckCircle size={15} /> Confirm & send to CA for review</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will verify and file</p>
    </Card>
  );
}

// ── Main chat component ───────────────────────────────────────────────────────
export default function TaxChat({ userId }) {
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = useReturn(userId);

  const [step, setStep]                 = useState(STEP.WELCOME);
  const [taxProfile, setTaxProfile]     = useState(null);
  const [selected80C, setSelected80C]   = useState([]);
  const [selectedOther, setSelectedOther] = useState([]);
  const [amount80C, setAmount80C]       = useState(0);
  const [mediclaim, setMediclaim]       = useState(0);
  const [salary, setSalary]             = useState(0);
  const [tds, setTds]                   = useState(0);
  const [otherIncome, setOtherIncome]   = useState(0);
  const [messages, setMessages]         = useState([]);
  const [typing, setTyping]             = useState(false);
  const [showInput, setShowInput]       = useState(false);
  const [inputValue, setInputValue]     = useState('');
  const [computation, setComputation]   = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extracting, setExtracting]     = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [extractError, setExtractError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (loadingReturn) return;
    const t = setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom:8 }}>👋 Hi! I'm <strong>TaxTalk</strong> — your personal tax assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>Filing your income tax return will feel like a simple chat. I'll ask plain questions, you answer — no forms, no jargon.</p>
          <p>Ready to get started?</p>
        </>,
        () => setStep(STEP.PROFILE)
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
    }, 800 + Math.random() * 300);
  }
  function addUser(text) {
    setMessages(m => [...m, { from:'user', content:text, key:Date.now() }]);
    persistMessage('user', text).catch(console.error);
  }

  // ── Profile ────────────────────────────────────────────────
  function handleProfileSelect(key) {
    setTaxProfile(key);
    addUser(PROFILES[key].label);
    setStep(STEP.FORM16);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Got it! The first thing I need is your <strong>Form 16</strong> — your employer gives this every year. It shows your salary and how much tax was already deducted.</p>
        <p>Upload it below — PDF or image both work.</p>
      </>, null
    );
  }

  // ── Upload → extract ───────────────────────────────────────
  async function handleFileUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadProgress(0); setExtractError(null);
    addUser(`Uploaded: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'form16', pct => setUploadProgress(pct));
      setUploading(false);
      setExtracting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Extraction failed — please try again or enter details manually');
      const { extracted } = await res.json();
      setExtracting(false);

      const sal      = extracted.gross_salary || 0;
      const tdsVal   = extracted.total_tds_deducted || 0;
      const ded80C   = (extracted.deduction_80c||0) + (extracted.deduction_80ccc||0) + (extracted.deduction_80ccd1||0);
      const ded80D   = extracted.deduction_80d || 0;
      setSalary(sal); setTds(tdsVal);
      if (ded80C > 0) setAmount80C(ded80C);
      if (ded80D > 0) setMediclaim(ded80D);

      const lowConf = (extracted.confidence || 1) < 0.8;
      setMessages(m => [...m, { from:'ai', key:Date.now(), content:(
        <>
          <p style={{ marginBottom:8 }}>I've read your Form 16 ✨{lowConf ? ' — please verify these numbers' : ''}:</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13 }}>
            {extracted.employer_name && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Employer</span><span>{extracted.employer_name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross salary</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(sal)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', ...(ded80C>0?{borderBottom:'1px solid var(--border)'}:{}) }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tdsVal)}</span></div>
            {ded80C > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--text-secondary)' }}>80C in Form 16</span><span>{formatINR(ded80C)}</span></div>}
          </div>
          {lowConf && <p style={{ fontSize:12, color:'var(--warn)', marginBottom:8 }}>⚠️ Some values had low confidence — your CA will verify before filing.</p>}
          <p>Did you work for any <strong>other employer</strong> this year too?</p>
        </>
      )}]);
      setStep(STEP.EMPLOYERS);
    } catch (e) {
      setUploading(false); setExtracting(false); setExtractError(e.message);
      addAI(<><p style={{ marginBottom:8 }}>⚠️ I had trouble reading that document. You can:</p><p>• Try uploading again<br/>• Or enter your salary details manually below</p></>, null);
    }
  }

  function handleManualEntry() {
    addUser("I'll enter details manually");
    setSalary(0); setTds(0);
    setStep(STEP.DEDUCTIONS_80C_AMOUNT);
    addAI(<p>No problem! What was your <strong>total gross salary</strong> for FY 2025-26?</p>, () => { setInputValue(''); setShowInput(true); });
  }

  // ── Employer ───────────────────────────────────────────────
  function handleEmployerAnswer(multi) {
    if (multi) {
      addUser('Yes, I changed jobs');
      addAI(<p>Please upload the Form 16 from your previous employer too.</p>, null);
    } else {
      addUser('No, only this one');
      setStep(STEP.DEDUCTIONS_80C);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>Now let's check your <strong>tax-saving investments</strong> — LIC, PPF, ELSS, etc. These reduce your taxable income.</p>
          <p>Did you invest in any of these in FY 2025-26? <span style={{ color:'var(--text-muted)', fontSize:13 }}>(Select all that apply)</span></p>
        </>, null
      );
    }
  }

  // ── 80C ───────────────────────────────────────────────────
  function toggle80C(id) {
    if (id==='none') { setSelected80C(['none']); return; }
    setSelected80C(prev => { const w=prev.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirm80C() {
    if (selected80C.includes('none') || selected80C.length===0) {
      addUser('None of these');
      setStep(STEP.OTHER_DEDUCTIONS);
      addAI(<p>Okay. Any other deductions — <strong>mediclaim</strong>, home loan interest, or donations?</p>, null);
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o=>selected80C.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels);
      setStep(STEP.DEDUCTIONS_80C_AMOUNT);
      if (amount80C > 0) {
        addAI(<p>I picked up {formatINR(amount80C)} from your Form 16. Is that the correct total, or update it?</p>, () => { setInputValue(String(amount80C)); setShowInput(true); });
      } else {
        addAI(<p>What was the <strong>total amount</strong> invested? <span style={{ color:'var(--text-muted)', fontSize:12 }}>(max ₹1,50,000 for tax saving)</span></p>, () => { setInputValue(''); setShowInput(true); });
      }
    }
  }

  // ── Other deductions ───────────────────────────────────────
  function toggleOther(id) {
    if (id==='none') { setSelectedOther(['none']); return; }
    setSelectedOther(prev => { const w=prev.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirmOther() {
    const hasMed = selectedOther.includes('mediclaim_self') || selectedOther.includes('mediclaim_parents');
    if (selectedOther.includes('none') || selectedOther.length===0) {
      addUser('None of these'); goToOtherIncome();
    } else if (hasMed) {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o=>selectedOther.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels);
      setStep(STEP.MEDICLAIM_AMOUNT);
      if (mediclaim > 0) {
        addAI(<p>I found {formatINR(mediclaim)} mediclaim in your Form 16. Correct, or update?</p>, () => { setInputValue(String(mediclaim)); setShowInput(true); });
      } else {
        addAI(<p>What was your total mediclaim / health insurance premium paid this year?</p>, () => { setInputValue(''); setShowInput(true); });
      }
    } else {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o=>selectedOther.includes(o.id)).map(o=>o.label).join(', ');
      addUser(labels); goToOtherIncome();
    }
  }
  function goToOtherIncome() {
    setStep(STEP.OTHER_INCOME);
    addAI(<p>Last question — any <strong>other income</strong> this year? Bank interest, dividends, rent? <span style={{ color:'var(--text-muted)', fontSize:13 }}>(Enter 0 if none)</span></p>, () => { setInputValue(''); setShowInput(true); });
  }

  // ── Amount input ───────────────────────────────────────────
  function handleAmountSubmit() {
    const val = parseInt(inputValue.replace(/[^0-9]/g,'')) || 0;
    setShowInput(false); setInputValue('');
    addUser(`₹${val.toLocaleString('en-IN')}`);
    if (step === STEP.DEDUCTIONS_80C_AMOUNT) {
      // If salary is 0, this is the manual salary entry step
      if (salary === 0 && amount80C === 0) {
        setSalary(val);
        setStep(STEP.DEDUCTIONS_80C);
        addAI(<><p style={{ marginBottom:8 }}>Got it. Now, what was your <strong>TDS deducted</strong> by your employer? (You'll find this in your salary slips or Form 16)</p></>, () => { setInputValue(''); setShowInput(true); });
        // Reuse MEDICLAIM_AMOUNT step for TDS entry after manual salary
        setStep(STEP.MEDICLAIM_AMOUNT);
        addAI(<p>What TDS was deducted from your salary this year?</p>, () => { setInputValue(''); setShowInput(true); });
      } else {
        setAmount80C(val);
        setStep(STEP.OTHER_DEDUCTIONS);
        addAI(
          <><p style={{ marginBottom:8 }}>Got it. Do you pay <strong>health insurance (mediclaim) premium</strong> for yourself, family, or parents?</p><p>Select what applies <span style={{ color:'var(--text-muted)', fontSize:13 }}>(you can pick multiple)</span></p></>,
          null
        );
      }
    } else if (step === STEP.MEDICLAIM_AMOUNT) {
      // Could be mediclaim OR TDS (manual flow)
      if (salary > 0 && tds === 0 && amount80C === 0) {
        setTds(val);
        setStep(STEP.DEDUCTIONS_80C);
        addAI(
          <><p style={{ marginBottom:8 }}>Great. Now let's check your <strong>tax-saving investments</strong>.</p><p>Did you invest in any of these in FY 2025-26?</p></>,
          null
        );
      } else {
        setMediclaim(val);
        goToOtherIncome();
      }
    } else if (step === STEP.OTHER_INCOME) {
      setOtherIncome(val);
      computeAndShow(val);
    }
  }

  // ── Computation ────────────────────────────────────────────
  function computeAndShow(extraIncome = 0) {
    const result = computeTax({ grossSalary:salary, deductions80C:amount80C, deductions80D:mediclaim, tdsDeducted:tds, otherIncome:extraIncome });
    setComputation(result);
    setStep(STEP.COMPUTATION);
    addAI(
      <>
        <p style={{ marginBottom:6 }}>Here's your tax summary! 🎉</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Review and edit any details, compare both regimes, and choose the one you prefer. I've highlighted the one that saves you more.</p>
      </>, null
    );
    setTimeout(() => {
      setMessages(m => [...m, {
        from:'ai', key:Date.now()+1,
        content: <ComputationCard
          initialData={result}
          initialInputs={{ grossSalary:salary, otherIncome:extraIncome, deductions80C:amount80C, deductions80D:mediclaim, deductions24b:0, tdsDeducted:tds }}
          onApprove={handleFinalSubmit}
          submitting={submitting}
        />
      }]);
    }, 1000);
  }

  // ── Submit ─────────────────────────────────────────────────
  async function handleFinalSubmit(finalComp) {
    setSubmitting(true);
    try {
      await saveComputation(finalComp);
      const note = `${taxProfile} return. Income: ${formatINR(finalComp.grossTotal)}. Tax: ${formatINR(finalComp.chosenTax)}. Regime: ${finalComp.betterRegime}. ${finalComp.refund > 0 ? 'Refund: ' + formatINR(finalComp.refund) : 'Balance: ' + formatINR(finalComp.balanceDue)}.`;
      await submitToCA(note, []);
      setStep(STEP.DONE);
      addUser('Confirmed & sent to CA for review');
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ <strong>Done!</strong> Your return has been sent to the CA team at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They'll review it and let you know if they need anything. You'll be notified once it's filed.</p>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>Acknowledgment number will be shared after filing.</p>
        </>, null
      );
    } catch (e) {
      addAI(<p style={{ color:'var(--danger)' }}>⚠️ Could not submit — please try again. ({e.message})</p>, null);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep(STEP.WELCOME); setMessages([]); setTaxProfile(null); setComputation(null);
    setSelected80C([]); setSelectedOther([]); setAmount80C(0); setMediclaim(0);
    setSalary(0); setTds(0); setOtherIncome(0); setShowInput(false); setInputValue('');
    setExtractError(null);
    setTimeout(() => addAI(<p>👋 Ready to file another return?</p>, () => setStep(STEP.PROFILE)), 400);
  }

  if (loadingReturn) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)', fontSize:14 }}>
        <Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Loading your return…
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--surface-2)' }}>
      <style>{`
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)', flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>T</div>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>TaxTalk</div>
          <div style={{ fontSize:12, color:'var(--success)', display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--success)' }} /> RB Shah & Associates · AY 2026-27
          </div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <Badge variant="info"><FileText size={11} /> {taxProfile ? PROFILES[taxProfile].itr : 'ITR'}</Badge>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
        {messages.map(m => m.from==='ai' ? <AIBubble key={m.key}>{m.content}</AIBubble> : <UserBubble key={m.key}>{m.content}</UserBubble>)}
        {typing && (
          <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>T</div>
            <TypingIndicator />
          </div>
        )}
        {extracting && <ExtractingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Interactive area */}
      {!typing && !extracting && (
        <div style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:16, flexShrink:0 }}>

          {step === STEP.PROFILE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(PROFILES).map(([key,p]) => (
                <button key={key} onClick={() => handleProfileSelect(key)}
                  style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', textAlign:'left', fontSize:14, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:10, color:'var(--text-primary)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--brand)'; e.currentTarget.style.background='var(--brand-light)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-strong)'; e.currentTarget.style.background='var(--surface)'; }}>
                  <span style={{ fontSize:20 }}>{p.icon}</span><span>{p.label}</span>
                  <ChevronRight size={16} style={{ marginLeft:'auto', color:'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          )}

          {step === STEP.FORM16 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadZone onFile={handleFileUpload} uploading={uploading} progress={uploadProgress} />
              {extractError && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--danger)', padding:'4px 0' }}><AlertCircle size={13}/> {extractError}</div>}
              <button onClick={handleManualEntry} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                I don't have it — enter manually
              </button>
            </div>
          )}

          {step === STEP.EMPLOYERS && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => handleEmployerAnswer(true)}>Yes, changed jobs</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => handleEmployerAnswer(false)}>No, only one employer</Button>
            </div>
          )}

          {step === STEP.DEDUCTIONS_80C && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {DEDUCTION_OPTIONS.map(o => <ChoiceChip key={o.id} label={o.label} selected={selected80C.includes(o.id)} onClick={() => toggle80C(o.id)} />)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={selected80C.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {step === STEP.OTHER_DEDUCTIONS && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_DEDUCTION_OPTIONS.map(o => <ChoiceChip key={o.id} label={o.label} selected={selectedOther.includes(o.id)} onClick={() => toggleOther(o.id)} />)}
              </div>
              <Button variant="primary" onClick={confirmOther} disabled={selectedOther.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', padding:'0 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
                <span style={{ fontWeight:600, color:'var(--text-muted)' }}>₹</span>
                <input type="number" placeholder="Enter amount" value={inputValue} onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && inputValue && handleAmountSubmit()}
                  autoFocus style={{ flex:1, fontSize:15, padding:'12px 0', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none' }} />
              </div>
              <Button variant="primary" onClick={handleAmountSubmit} disabled={!inputValue}><Send size={15}/></Button>
            </div>
          )}

          {step === STEP.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14}/> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
