import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle } from 'lucide-react';
import { PROFILES, DEDUCTION_OPTIONS, OTHER_DEDUCTION_OPTIONS, computeTax, formatINR } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

const STEP = {
  WELCOME: 'welcome', PROFILE: 'profile', FORM16: 'form16',
  EMPLOYERS: 'employers', DEDUCTIONS_80C: 'deductions_80c',
  DEDUCTIONS_80C_AMOUNT: 'deductions_80c_amount', OTHER_DEDUCTIONS: 'other_deductions',
  MEDICLAIM_AMOUNT: 'mediclaim_amount', OTHER_INCOME: 'other_income',
  COMPUTATION: 'computation', DONE: 'done',
};

function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', width:'fit-content' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--text-muted)', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
      ))}
    </div>
  );
}

function AIBubble({ children }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:14, lineHeight:1.6, color:'var(--text-primary)', border:'1px solid var(--border)', animation:'fadeUp 0.3s ease' }}>
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ background:'var(--brand)', borderRadius:'18px 18px 4px 18px', padding:'10px 16px', fontSize:14, lineHeight:1.5, color:'#fff', maxWidth:'75%', animation:'fadeUp 0.2s ease' }}>
        {children}
      </div>
    </div>
  );
}

function ChoiceChip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:'8px 16px', borderRadius:24, border:`1.5px solid ${selected ? 'var(--brand)' : 'var(--border-strong)'}`, background:selected ? 'var(--brand-light)' : 'var(--surface)', color:selected ? 'var(--brand)' : 'var(--text-primary)', fontSize:13, fontWeight:selected ? 600 : 400, cursor:'pointer', transition:'all 0.15s' }}>
      {label}
    </button>
  );
}

function UploadZone({ onFile, uploading, progress, accept = '.pdf,.jpg,.jpeg,.png' }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} style={{ display:'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <button onClick={() => ref.current.click()} disabled={uploading} style={{ width:'100%', padding:14, borderRadius:'var(--radius-md)', border:'2px dashed var(--brand)', background:'var(--brand-light)', color:'var(--brand)', fontSize:14, fontWeight:500, cursor: uploading ? 'wait' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {uploading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Uploading… {progress > 0 ? `${progress}%` : ''}</> : <><Upload size={18} /> Upload PDF / Image</>}
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

function ComputationCard({ data, onApprove, submitting }) {
  const rows = [
    { label:'Gross salary / income', value:formatINR(data.grossTotal) },
    { label:'Standard deduction', value:`− ${formatINR(data.stdDeduction)}` },
    ...(data.cap80C > 0 ? [{ label:'Section 80C', value:`− ${formatINR(data.cap80C)}` }] : []),
    ...(data.cap80D > 0 ? [{ label:'Section 80D (mediclaim)', value:`− ${formatINR(data.cap80D)}` }] : []),
    ...(data.cap24b > 0 ? [{ label:'Home loan interest (24b)', value:`− ${formatINR(data.cap24b)}` }] : []),
    { label:`Taxable income (${data.betterRegime} regime)`, value:formatINR(data.betterRegime === 'old' ? data.oldTaxable : data.newTaxable), bold:true },
    { label:'Tax + 4% cess', value:formatINR(data.chosenTax) },
    { label:'TDS already deducted', value:`− ${formatINR(data.tdsDeducted)}` },
  ];
  return (
    <Card style={{ marginTop:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontWeight:600, fontSize:14 }}>Tax computation</span>
        <Badge variant={data.betterRegime === 'old' ? 'success' : 'info'}>
          {data.betterRegime === 'old' ? 'Old' : 'New'} regime saves {formatINR(data.savings)}
        </Badge>
      </div>
      <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', background: i%2===0 ? 'var(--surface)' : 'var(--surface-2)', fontSize:13, fontWeight: r.bold ? 600 : 400 }}>
            <span style={{ color:'var(--text-secondary)' }}>{r.label}</span>
            <span style={{ color: r.bold ? 'var(--text-primary)' : 'var(--brand)', fontWeight: r.bold ? 600 : 500 }}>{r.value}</span>
          </div>
        ))}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 12px', background: data.refund > 0 ? 'var(--success-light)' : 'var(--warn-light)', fontSize:14, fontWeight:700 }}>
          <span style={{ color: data.refund > 0 ? '#14532d' : '#92400e' }}>{data.refund > 0 ? 'Refund due to you' : 'Balance tax to pay'}</span>
          <span style={{ color: data.refund > 0 ? 'var(--success)' : 'var(--warn)' }}>{formatINR(data.refund > 0 ? data.refund : data.balanceDue)}</span>
        </div>
      </div>
      <Button variant="primary" style={{ width:'100%', marginTop:14, justifyContent:'center' }} onClick={onApprove} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }} /> Submitting…</> : <><CheckCircle size={15} /> Send to CA for review & filing</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will review this before filing</p>
    </Card>
  );
}

export default function TaxChat({ userId }) {
  const returnHook = useReturn(userId);
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = returnHook;

  const [step, setStep]               = useState(STEP.WELCOME);
  const [taxProfile, setTaxProfile]   = useState(null);
  const [selected80C, setSelected80C] = useState([]);
  const [selectedOther, setSelectedOther] = useState([]);
  const [amount80C, setAmount80C]     = useState(0);
  const [mediclaim, setMediclaim]     = useState(0);
  const [salary, setSalary]           = useState(0);
  const [tds, setTds]                 = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
  const [messages, setMessages]       = useState([]);
  const [typing, setTyping]           = useState(false);
  const [showInput, setShowInput]     = useState(false);
  const [inputValue, setInputValue]   = useState('');
  const [computation, setComputation] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extracting, setExtracting]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [extractError, setExtractError] = useState(null);
  const bottomRef = useRef(null);

  // Start welcome message once return record is loaded
  useEffect(() => {
    if (loadingReturn) return;
    const timer = setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom:8 }}>👋 Hi! I'm <strong>TaxTalk</strong> — your personal tax assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>Filing your income tax return will feel like a simple chat. I'll ask plain questions, you answer — no forms, no jargon.</p>
          <p>Ready to get started?</p>
        </>,
        () => setStep(STEP.PROFILE)
      );
    }, 600);
    return () => clearTimeout(timer);
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

  // ── Profile selection ──────────────────────────────────────
  function handleProfileSelect(key) {
    const p = PROFILES[key];
    setTaxProfile(key);
    addUser(p.label);
    persistMessage('assistant', `Profile selected: ${key}`).catch(console.error);
    setStep(STEP.FORM16);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Got it! The first document I need is your <strong>Form 16</strong> — your employer gives this to you every year. It shows your salary and how much tax was already deducted.</p>
        <p>Please upload it below. PDF or image both work.</p>
      </>,
      null
    );
  }

  // ── Form 16 upload → R2 → AI extraction ───────────────────
  async function handleFileUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }

    setUploading(true);
    setUploadProgress(0);
    setExtractError(null);
    addUser(`Uploaded: ${file.name}`);

    try {
      // Step 1: Upload to R2
      const doc = await uploadDocument(file, returnRecord.id, 'form16', (pct) => setUploadProgress(pct));
      setUploading(false);

      // Step 2: Show extracting state
      setExtracting(true);

      // Step 3: Trigger AI extraction via server
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });

      if (!res.ok) throw new Error('Extraction failed — please try again or enter details manually');
      const { extracted } = await res.json();
      setExtracting(false);

      // Step 4: Map extracted data to state
      const sal = extracted.gross_salary || 0;
      const tdsVal = extracted.total_tds_deducted || 0;
      const deduct80C = (extracted.deduction_80c || 0) + (extracted.deduction_80ccc || 0) + (extracted.deduction_80ccd1 || 0);
      const deduct80D = extracted.deduction_80d || 0;

      setSalary(sal);
      setTds(tdsVal);
      if (deduct80C > 0) setAmount80C(deduct80C);
      if (deduct80D > 0) setMediclaim(deduct80D);

      const lowConfidence = (extracted.confidence || 1) < 0.8;

      setMessages(m => [...m, { from:'ai', key:Date.now(), content:(
        <>
          <p style={{ marginBottom:8 }}>I've read your Form 16 ✨ Here's what I found{lowConfidence ? ' — please verify these numbers' : ''}:</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13 }}>
            {extracted.employer_name && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Employer</span><span>{extracted.employer_name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross salary</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(sal)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', ...(deduct80C > 0 ? { borderBottom:'1px solid var(--border)' } : {}) }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tdsVal)}</span></div>
            {deduct80C > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--text-secondary)' }}>80C in Form 16</span><span>{formatINR(deduct80C)}</span></div>}
          </div>
          {lowConfidence && <p style={{ fontSize:12, color:'var(--warn)', marginBottom:8 }}>⚠️ Some values had low confidence — your CA will verify before filing.</p>}
          <p>Did you work for any <strong>other employer</strong> this year too?</p>
        </>
      )}]);
      setStep(STEP.EMPLOYERS);

    } catch (e) {
      setUploading(false);
      setExtracting(false);
      setExtractError(e.message);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>⚠️ I had trouble reading that document. You can:</p>
          <p>• Try uploading it again<br/>• Or enter your salary details manually below</p>
        </>,
        null
      );
    }
  }

  function handleManualEntry() {
    addUser("I'll enter details manually");
    setSalary(0); setTds(0);
    addAI(<p>No problem! What was your <strong>total gross salary</strong> for FY 2025-26? (You'll find this on your salary slips or Form 16 Part A)</p>, () => { setStep(STEP.DEDUCTIONS_80C_AMOUNT); setShowInput(true); });
  }

  // ── Employer ───────────────────────────────────────────────
  function handleEmployerAnswer(multi) {
    if (multi) {
      addUser('Yes, I changed jobs');
      addAI(<p>Please upload the Form 16 from your previous employer too — same way as before.</p>, null);
    } else {
      addUser('No, only this one');
      setStep(STEP.DEDUCTIONS_80C);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>Now let's check your <strong>tax-saving investments</strong> — things like LIC, PPF, ELSS. These reduce your taxable income.</p>
          <p>Did you invest in any of these in FY 2025-26? <span style={{ color:'var(--text-muted)', fontSize:13 }}>(Select all that apply)</span></p>
        </>,
        null
      );
    }
  }

  // ── 80C ───────────────────────────────────────────────────
  function toggle80C(id) {
    if (id === 'none') { setSelected80C(['none']); return; }
    setSelected80C(prev => { const w = prev.filter(x => x !== 'none'); return w.includes(id) ? w.filter(x => x !== id) : [...w, id]; });
  }

  function confirm80C() {
    if (selected80C.includes('none') || selected80C.length === 0) {
      addUser('None of these');
      setStep(STEP.OTHER_DEDUCTIONS);
      addAI(<p>Okay. Any other deductions — like <strong>health insurance (mediclaim)</strong>, home loan interest, or donations?</p>, null);
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o => selected80C.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      // If already pre-filled from Form 16, skip the amount question
      if (amount80C > 0) {
        addAI(<p>I already picked up ₹{amount80C.toLocaleString('en-IN')} from your Form 16. Is that the correct total, or would you like to update it?</p>, null);
        setStep(STEP.DEDUCTIONS_80C_AMOUNT);
        setInputValue(String(amount80C));
        setShowInput(true);
      } else {
        setStep(STEP.DEDUCTIONS_80C_AMOUNT);
        addAI(<p>What was the <strong>total amount</strong> invested across all of these? <span style={{ color:'var(--text-muted)', fontSize:12 }}>(Max ₹1,50,000 saves tax)</span></p>, () => setShowInput(true));
      }
    }
  }

  // ── Other deductions ───────────────────────────────────────
  function toggleOther(id) {
    if (id === 'none') { setSelectedOther(['none']); return; }
    setSelectedOther(prev => { const w = prev.filter(x => x !== 'none'); return w.includes(id) ? w.filter(x => x !== id) : [...w, id]; });
  }

  function confirmOther() {
    const hasMediclaim = selectedOther.includes('mediclaim_self') || selectedOther.includes('mediclaim_parents');
    if (selectedOther.includes('none') || selectedOther.length === 0) {
      addUser('None of these');
      goToOtherIncome();
    } else if (hasMediclaim) {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o => selectedOther.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      if (mediclaim > 0) {
        addAI(<p>I found ₹{mediclaim.toLocaleString('en-IN')} mediclaim in your Form 16. Correct, or update it?</p>, () => { setInputValue(String(mediclaim)); setShowInput(true); });
      } else {
        addAI(<p>What was your total mediclaim / health insurance premium paid this year?</p>, () => setShowInput(true));
      }
      setStep(STEP.MEDICLAIM_AMOUNT);
    } else {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o => selectedOther.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      goToOtherIncome();
    }
  }

  function goToOtherIncome() {
    setStep(STEP.OTHER_INCOME);
    addAI(<p>Last question — did you earn any <strong>other income</strong> this year? Like bank interest, dividends, or rental income? <span style={{ color:'var(--text-muted)', fontSize:13 }}>(Enter 0 if none)</span></p>, () => setShowInput(true));
  }

  // ── Amount submission ──────────────────────────────────────
  function handleAmountSubmit() {
    const val = parseInt(inputValue.replace(/[^0-9]/g, '')) || 0;
    setShowInput(false);
    setInputValue('');
    addUser(`₹${val.toLocaleString('en-IN')}`);

    if (step === STEP.DEDUCTIONS_80C_AMOUNT) {
      setAmount80C(val);
      setStep(STEP.OTHER_DEDUCTIONS);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>Got it. Now — do you pay <strong>health insurance premium</strong> for yourself, family, or parents?</p>
          <p>Select what applies <span style={{ color:'var(--text-muted)', fontSize:13 }}>(you can pick multiple)</span></p>
        </>,
        null
      );
    } else if (step === STEP.MEDICLAIM_AMOUNT) {
      setMediclaim(val);
      goToOtherIncome();
    } else if (step === STEP.OTHER_INCOME) {
      setOtherIncome(val);
      computeAndShow(val);
    }
  }

  // ── Tax computation ────────────────────────────────────────
  function computeAndShow(extraIncome = 0) {
    const result = computeTax({
      grossSalary:   salary,
      deductions80C: amount80C,
      deductions80D: mediclaim,
      tdsDeducted:   tds,
      otherIncome:   extraIncome,
    });
    setComputation(result);
    setStep(STEP.COMPUTATION);
    saveComputation(result).catch(console.error);
    addAI(<p style={{ marginBottom:8 }}>Your return is ready! 🎉 I've compared both tax regimes and picked the one that saves you more.</p>, null);
    setTimeout(() => {
      setMessages(m => [...m, { from:'ai', key:Date.now()+1, content:<ComputationCard data={result} onApprove={handleFinalSubmit} submitting={submitting} /> }]);
    }, 1000);
  }

  // ── Submit to CA ───────────────────────────────────────────
  async function handleFinalSubmit() {
    setSubmitting(true);
    try {
      const aiNote = `${taxProfile} return. Gross income: ${formatINR(computation?.grossTotal)}. Tax: ${formatINR(computation?.chosenTax)}. Regime: ${computation?.betterRegime}. Balance due: ${formatINR(computation?.balanceDue)}.`;
      await submitToCA(aiNote, []);
      setStep(STEP.DONE);
      addUser('Send to CA for review & filing');
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ <strong>Done!</strong> Your return has been sent to the CA team at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They'll review it and let you know if they need anything. You'll be notified once it's filed.</p>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>Your acknowledgment number will be shared after filing.</p>
        </>,
        null
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

  const currentStep = step;

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
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'var(--shadow-sm)', flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>T</div>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>TaxTalk</div>
          <div style={{ fontSize:12, color:'var(--success)', display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--success)' }} />
            RB Shah & Associates · AY 2026-27
          </div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <Badge variant="info"><FileText size={11} /> {taxProfile ? PROFILES[taxProfile].itr : 'ITR'}</Badge>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
        {messages.map(m => m.from === 'ai' ? <AIBubble key={m.key}>{m.content}</AIBubble> : <UserBubble key={m.key}>{m.content}</UserBubble>)}
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

          {currentStep === STEP.PROFILE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(PROFILES).map(([key, p]) => (
                <button key={key} onClick={() => handleProfileSelect(key)} style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-strong)', background:'var(--surface)', textAlign:'left', fontSize:14, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:10, color:'var(--text-primary)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--brand)'; e.currentTarget.style.background='var(--brand-light)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-strong)'; e.currentTarget.style.background='var(--surface)'; }}>
                  <span style={{ fontSize:20 }}>{p.icon}</span>
                  <span>{p.label}</span>
                  <ChevronRight size={16} style={{ marginLeft:'auto', color:'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          )}

          {currentStep === STEP.FORM16 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadZone onFile={handleFileUpload} uploading={uploading} progress={uploadProgress} />
              {extractError && (
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--danger)', padding:'6px 0' }}>
                  <AlertCircle size={13} /> {extractError}
                </div>
              )}
              <button onClick={handleManualEntry} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                I don't have it — enter manually
              </button>
            </div>
          )}

          {currentStep === STEP.EMPLOYERS && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => handleEmployerAnswer(true)}>Yes, changed jobs</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => handleEmployerAnswer(false)}>No, only one employer</Button>
            </div>
          )}

          {currentStep === STEP.DEDUCTIONS_80C && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {DEDUCTION_OPTIONS.map(o => <ChoiceChip key={o.id} label={o.label} selected={selected80C.includes(o.id)} onClick={() => toggle80C(o.id)} />)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={selected80C.length === 0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15} /></Button>
            </div>
          )}

          {currentStep === STEP.OTHER_DEDUCTIONS && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_DEDUCTION_OPTIONS.map(o => <ChoiceChip key={o.id} label={o.label} selected={selectedOther.includes(o.id)} onClick={() => toggleOther(o.id)} />)}
              </div>
              <Button variant="primary" onClick={confirmOther} disabled={selectedOther.length === 0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15} /></Button>
            </div>
          )}

          {showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', padding:'0 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
                <span style={{ fontWeight:600, color:'var(--text-muted)' }}>₹</span>
                <input type="number" placeholder="Enter amount" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && inputValue && handleAmountSubmit()} autoFocus style={{ flex:1, fontSize:15, padding:'12px 0', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none' }} />
              </div>
              <Button variant="primary" onClick={handleAmountSubmit} disabled={!inputValue}><Send size={15} /></Button>
            </div>
          )}

          {currentStep === STEP.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14} /> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
