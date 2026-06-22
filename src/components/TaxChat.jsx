import React, { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send } from 'lucide-react';
import { PROFILES, DEDUCTION_OPTIONS, OTHER_DEDUCTION_OPTIONS, computeTax, formatINR } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';

const STEP = {
  WELCOME: 'welcome',
  PROFILE: 'profile',
  FORM16: 'form16',
  EMPLOYERS: 'employers',
  DEDUCTIONS_80C: 'deductions_80c',
  DEDUCTIONS_80C_AMOUNT: 'deductions_80c_amount',
  OTHER_DEDUCTIONS: 'other_deductions',
  MEDICLAIM_AMOUNT: 'mediclaim_amount',
  OTHER_INCOME: 'other_income',
  COMPUTATION: 'computation',
  DONE: 'done',
};

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--surface-3)', borderRadius: '18px 18px 18px 4px', width: 'fit-content' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function AIBubble({ children, isNew }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: '80%' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #1a56e8, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff',
      }}>T</div>
      <div style={{
        background: 'var(--surface-3)',
        borderRadius: '18px 18px 18px 4px',
        padding: '12px 16px',
        fontSize: 14, lineHeight: 1.6,
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        animation: isNew ? 'fadeUp 0.3s ease' : 'none',
      }}>
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: 'var(--brand)',
        borderRadius: '18px 18px 4px 18px',
        padding: '10px 16px',
        fontSize: 14, lineHeight: 1.5, color: '#fff',
        maxWidth: '75%',
        animation: 'fadeUp 0.2s ease',
      }}>
        {children}
      </div>
    </div>
  );
}

function ChoiceChip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 24,
      border: `1.5px solid ${selected ? 'var(--brand)' : 'var(--border-strong)'}`,
      background: selected ? 'var(--brand-light)' : 'var(--surface)',
      color: selected ? 'var(--brand)' : 'var(--text-primary)',
      fontSize: 13, fontWeight: selected ? 600 : 400,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

function ComputationCard({ data, onApprove }) {
  const isBetter = data.betterRegime === 'old';
  const rows = [
    { label: 'Gross salary / income', value: formatINR(data.grossTotal) },
    { label: 'Standard deduction', value: `− ${formatINR(data.stdDeduction)}` },
    ...(data.cap80C > 0 ? [{ label: 'Section 80C deductions', value: `− ${formatINR(data.cap80C)}` }] : []),
    ...(data.cap80D > 0 ? [{ label: 'Section 80D (mediclaim)', value: `− ${formatINR(data.cap80D)}` }] : []),
    ...(data.cap24b > 0 ? [{ label: 'Home loan interest (Sec 24b)', value: `− ${formatINR(data.cap24b)}` }] : []),
    { label: `Taxable income (${data.betterRegime === 'old' ? 'old' : 'new'} regime)`, value: formatINR(data.betterRegime === 'old' ? data.oldTaxable : data.newTaxable), bold: true },
    { label: 'Tax + 4% health & education cess', value: formatINR(data.chosenTax) },
    { label: 'TDS already deducted', value: `− ${formatINR(data.tdsDeducted)}` },
  ];

  return (
    <Card style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Tax computation</span>
        <Badge variant={isBetter ? 'success' : 'info'}>
          {data.betterRegime === 'old' ? 'Old regime saves more' : 'New regime saves more'} · {formatINR(data.savings)}
        </Badge>
      </div>

      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px',
            background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
            fontSize: 13,
            fontWeight: r.bold ? 600 : 400,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
            <span style={{ color: r.bold ? 'var(--text-primary)' : 'var(--brand)', fontWeight: r.bold ? 600 : 500 }}>{r.value}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px',
          background: data.refund > 0 ? 'var(--success-light)' : 'var(--warn-light)',
          fontSize: 14, fontWeight: 700,
        }}>
          <span style={{ color: data.refund > 0 ? '#14532d' : '#92400e' }}>
            {data.refund > 0 ? 'Refund due to you' : 'Balance tax to pay'}
          </span>
          <span style={{ color: data.refund > 0 ? 'var(--success)' : 'var(--warn)' }}>
            {data.refund > 0 ? formatINR(data.refund) : formatINR(data.balanceDue)}
          </span>
        </div>
      </div>

      <Button variant="primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={onApprove}>
        <CheckCircle size={15} /> Send to CA for review & filing
      </Button>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
        Your CA at RB Shah & Associates will review this before filing
      </p>
    </Card>
  );
}

export default function TaxChat() {
  const [step, setStep] = useState(STEP.WELCOME);
  const [profile, setProfile] = useState(null);
  const [selected80C, setSelected80C] = useState([]);
  const [selectedOther, setSelectedOther] = useState([]);
  const [amount80C, setAmount80C] = useState('');
  const [mediclaim, setMediclaim] = useState('');
  const [tds, setTds] = useState('');
  const [salary, setSalary] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [computation, setComputation] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom: 8 }}>👋 Hi! I'm <strong>TaxTalk</strong> — your personal tax assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom: 8 }}>Filing your income tax return will feel like a simple chat. I'll ask plain questions, you answer — no forms, no jargon.</p>
          <p>Ready to get started?</p>
        </>,
        () => setStep(STEP.PROFILE)
      );
    }, 600);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, step]);

  function addAI(content, onDone) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { from: 'ai', content, key: Date.now() }]);
      if (onDone) setTimeout(onDone, 300);
    }, 900 + Math.random() * 400);
  }

  function addUser(text) {
    setMessages(m => [...m, { from: 'user', content: text, key: Date.now() }]);
  }

  function handleProfileSelect(key) {
    const p = PROFILES[key];
    setProfile(key);
    addUser(p.label);
    setStep(STEP.FORM16);
    addAI(
      <>
        <p style={{ marginBottom: 8 }}>Got it! For a {key === 'salaried' ? 'salaried person' : key === 'business' ? 'business owner' : key === 'freelancer' ? 'freelancer' : 'partner'}, the most important document is your <strong>Form 16</strong> — it's a certificate {key === 'salaried' ? 'your employer gives you every year showing salary paid and tax deducted' : 'showing income and TDS details'}.</p>
        <p>Do you have it ready to upload?</p>
      </>,
      null
    );
  }

  function handleFileUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploadedFile(f.name);
    addUser(`Uploaded: ${f.name}`);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      // Simulate Form 16 reading
      setSalary('1240000');
      setTds('110400');
      setMessages(m => [...m, {
        from: 'ai', key: Date.now(), content: (
          <>
            <p style={{ marginBottom: 8 }}>I've read your Form 16 ✨ Here's what I found:</p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-secondary)' }}>Employer</span><span>Acme Pvt. Ltd.</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-secondary)' }}>Gross salary</span><span style={{ color: 'var(--brand)', fontWeight: 600 }}>₹12,40,000</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: 'var(--text-secondary)' }}>TDS already deducted</span><span style={{ color: 'var(--success)', fontWeight: 600 }}>₹1,10,400</span></div>
            </div>
            <p>Did you work for any <strong>other employer</strong> this year?</p>
          </>
        )
      }]);
      setStep(STEP.EMPLOYERS);
    }, 1400);
  }

  function handleEmployerAnswer(multi) {
    if (multi) {
      addUser('Yes, I changed jobs');
      addAI(<p>Please upload the Form 16 from your previous employer too — just upload it the same way.</p>, null);
    } else {
      addUser('No, only this one');
      setStep(STEP.DEDUCTIONS_80C);
      addAI(
        <>
          <p style={{ marginBottom: 8 }}>Now let me check if you've made any <strong>tax-saving investments</strong> this year — things like LIC, PPF, ELSS funds, or tuition fees. These reduce your taxable income.</p>
          <p>Did you invest in any of these in FY 2025-26? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>(Select all that apply)</span></p>
        </>,
        null
      );
    }
  }

  function toggle80C(id) {
    if (id === 'none') { setSelected80C(['none']); return; }
    setSelected80C(prev => {
      const without = prev.filter(x => x !== 'none');
      return without.includes(id) ? without.filter(x => x !== id) : [...without, id];
    });
  }

  function confirm80C() {
    if (selected80C.includes('none') || selected80C.length === 0) {
      addUser('None of these');
      setStep(STEP.OTHER_DEDUCTIONS);
      addAI(<p style={{ marginBottom: 8 }}>Okay. Any other deductions — like <strong>health insurance (mediclaim)</strong>, home loan interest, or donations?</p>, null);
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o => selected80C.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      setStep(STEP.DEDUCTIONS_80C_AMOUNT);
      addAI(
        <p>What was the <strong>total amount</strong> you paid/invested across all these in FY 2025-26? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(Maximum ₹1,50,000 counts for tax saving)</span></p>,
        () => setShowInput(true)
      );
    }
  }

  function handleAmountSubmit(field) {
    const val = parseInt(inputValue.replace(/[^0-9]/g, '')) || 0;
    setShowInput(false);
    setInputValue('');
    if (field === '80C') {
      setAmount80C(val);
      addUser(`₹${val.toLocaleString('en-IN')}`);
      setStep(STEP.OTHER_DEDUCTIONS);
      addAI(
        <>
          <p style={{ marginBottom: 8 }}>Perfect. Now, do you pay <strong>health insurance (mediclaim) premium</strong> for yourself, your family, or your parents? This saves additional tax under Section 80D.</p>
          <p>Select what applies <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>(you can pick multiple)</span></p>
        </>,
        null
      );
    } else if (field === 'mediclaim') {
      setMediclaim(val);
      addUser(`₹${val.toLocaleString('en-IN')}`);
      setStep(STEP.OTHER_INCOME);
      addAI(
        <p>Almost done! Did you earn any <strong>other income</strong> this year — like bank interest, dividends, or rental income? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>(Enter 0 if none)</span></p>,
        () => setShowInput(true)
      );
    } else if (field === 'other') {
      setOtherIncome(val);
      addUser(`₹${val.toLocaleString('en-IN')}`);
      computeAndShow(val);
    }
  }

  function toggleOther(id) {
    if (id === 'none') { setSelectedOther(['none']); return; }
    setSelectedOther(prev => {
      const without = prev.filter(x => x !== 'none');
      return without.includes(id) ? without.filter(x => x !== id) : [...without, id];
    });
  }

  function confirmOther() {
    if (selectedOther.includes('none') || selectedOther.length === 0) {
      addUser('None of these');
      setStep(STEP.OTHER_INCOME);
      addAI(<p>Got it. Last question — any <strong>other income</strong> this year like bank interest, dividends, rent? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>(Enter 0 if none)</span></p>, () => setShowInput(true));
    } else if (selectedOther.includes('mediclaim_self') || selectedOther.includes('mediclaim_parents')) {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o => selectedOther.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      setStep(STEP.MEDICLAIM_AMOUNT);
      addAI(<p>What was your total mediclaim / health insurance premium this year?</p>, () => setShowInput(true));
    } else {
      const labels = OTHER_DEDUCTION_OPTIONS.filter(o => selectedOther.includes(o.id)).map(o => o.label).join(', ');
      addUser(labels);
      setStep(STEP.OTHER_INCOME);
      addAI(<p>Almost done! Any other income this year — bank interest, dividends, or rent? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>(Enter 0 if none)</span></p>, () => setShowInput(true));
    }
  }

  function computeAndShow(extraIncome = 0) {
    const result = computeTax({
      grossSalary: parseInt(salary) || 1240000,
      deductions80C: parseInt(amount80C) || 0,
      deductions80D: parseInt(mediclaim) || 0,
      tdsDeducted: parseInt(tds) || 110400,
      otherIncome: extraIncome,
    });
    setComputation(result);
    setStep(STEP.COMPUTATION);
    addAI(
      <>
        <p style={{ marginBottom: 8 }}>Your return is ready! 🎉 I've compared both old and new tax regimes and chosen what's better for you.</p>
      </>,
      null
    );
    setTimeout(() => {
      setMessages(m => [...m, { from: 'ai', key: Date.now() + 1, content: <ComputationCard data={result} onApprove={handleFinalSubmit} /> }]);
    }, 1200);
  }

  function handleFinalSubmit() {
    setStep(STEP.DONE);
    addUser('Send to CA for review & filing');
    addAI(
      <>
        <p style={{ marginBottom: 8 }}>✅ <strong>Done!</strong> Your return has been sent to the CA team at RB Shah & Associates.</p>
        <p style={{ marginBottom: 8 }}>They'll review it within <strong>24 hours</strong> and let you know if they need anything. You'll get a WhatsApp message once it's filed.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Your acknowledgment number will be shared once the ITR is filed with the Income Tax Department.</p>
      </>,
      null
    );
  }

  const currentField = step === STEP.DEDUCTIONS_80C_AMOUNT ? '80C' : step === STEP.MEDICLAIM_AMOUNT ? 'mediclaim' : 'other';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-2)' }}>
      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a56e8, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
        }}>T</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>TaxTalk</div>
          <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            RB Shah & Associates · AY 2026-27
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Badge variant="info">
            <FileText size={11} /> {profile ? PROFILES[profile].itr : 'ITR'}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map(m => (
          m.from === 'ai'
            ? <AIBubble key={m.key}>{m.content}</AIBubble>
            : <UserBubble key={m.key}>{m.content}</UserBubble>
        ))}
        {typing && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1a56e8, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>T</div>
            <TypingIndicator />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Interactive area */}
      {!typing && (
        <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '16px' }}>

          {/* Profile selection */}
          {step === STEP.PROFILE && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(PROFILES).map(([key, p]) => (
                <button key={key} onClick={() => handleProfileSelect(key)} style={{
                  padding: '12px 16px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-strong)',
                  background: 'var(--surface)', textAlign: 'left',
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 10,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--surface)'; }}
                >
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <span>{p.label}</span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          )}

          {/* Upload Form 16 */}
          {step === STEP.FORM16 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
              <button onClick={() => fileRef.current.click()} style={{
                padding: '14px', borderRadius: 'var(--radius-md)',
                border: '2px dashed var(--brand)', background: 'var(--brand-light)',
                color: 'var(--brand)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Upload size={18} /> Upload Form 16 (PDF)
              </button>
              <button onClick={() => {
                addUser("I don't have Form 16 yet");
                addAI(<p>No problem — you can still continue. I'll ask you to enter your salary and TDS details manually. Just let me know when you have your salary slip or Form 16 Part A handy.</p>, null);
                setSalary('1240000'); setTds('110400');
                setStep(STEP.EMPLOYERS);
              }} style={{
                padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>
                I don't have it right now — enter manually
              </button>
            </div>
          )}

          {/* Multiple employers */}
          {step === STEP.EMPLOYERS && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleEmployerAnswer(true)}>Yes, I changed jobs</Button>
              <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleEmployerAnswer(false)}>No, only this employer</Button>
            </div>
          )}

          {/* 80C deductions */}
          {step === STEP.DEDUCTIONS_80C && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DEDUCTION_OPTIONS.map(o => (
                  <ChoiceChip key={o.id} label={o.label} selected={selected80C.includes(o.id)} onClick={() => toggle80C(o.id)} />
                ))}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={selected80C.length === 0} style={{ alignSelf: 'flex-end' }}>
                Continue <ChevronRight size={15} />
              </Button>
            </div>
          )}

          {/* Other deductions */}
          {step === STEP.OTHER_DEDUCTIONS && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {OTHER_DEDUCTION_OPTIONS.map(o => (
                  <ChoiceChip key={o.id} label={o.label} selected={selectedOther.includes(o.id)} onClick={() => toggleOther(o.id)} />
                ))}
              </div>
              <Button variant="primary" onClick={confirmOther} disabled={selectedOther.length === 0} style={{ alignSelf: 'flex-end' }}>
                Continue <ChevronRight size={15} />
              </Button>
            </div>
          )}

          {/* Amount input */}
          {showInput && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, border: '1.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && inputValue && handleAmountSubmit(currentField)}
                  autoFocus
                  style={{ flex: 1, fontSize: 15, padding: '12px 0', background: 'transparent', color: 'var(--text-primary)' }}
                />
              </div>
              <Button variant="primary" onClick={() => handleAmountSubmit(currentField)} disabled={!inputValue}>
                <Send size={15} />
              </Button>
            </div>
          )}

          {/* Done state */}
          {step === STEP.DONE && (
            <button onClick={() => { setStep(STEP.WELCOME); setMessages([]); setProfile(null); setComputation(null); setSelected80C([]); setSelectedOther([]); setAmount80C(''); setMediclaim(''); setOtherIncome(''); setShowInput(false); setUploadedFile(null); setTimeout(() => { addAI(<p>👋 Welcome back! Ready to file another return?</p>, () => setStep(STEP.PROFILE)); }, 400); }}
              style={{ width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-3)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <RotateCcw size={14} /> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
