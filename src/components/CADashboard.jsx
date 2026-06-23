import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, MessageSquare, Clock, ChevronDown, ChevronUp, Send, FileText, TrendingUp, Loader, RefreshCw, Download, ExternalLink } from 'lucide-react';
import { Avatar, Badge, Button, Card, Divider } from './UI.jsx';
import { formatINR } from '../data/flow.js';
import { supabase, approveReturn, sendCAQuery } from '../lib/supabase.js';
import { determineITRForm, generateITRJson, downloadITRJson } from '../lib/itrJson.js';

const STATUS_CONFIG = {
  submitted: { label:'Pending review', variant:'warn',    icon:<Clock size={12}/> },
  queried:   { label:'Awaiting client', variant:'info',   icon:<MessageSquare size={12}/> },
  approved:  { label:'Approved',        variant:'success', icon:<CheckCircle size={12}/> },
  filed:     { label:'Filed ✓',         variant:'success', icon:<CheckCircle size={12}/> },
  on_hold:   { label:'On hold',         variant:'neutral', icon:<Clock size={12}/> },
};

// ── Client detail modal ───────────────────────────────────────────────────────
function ClientDetailModal({ profile, ret, onSave, onClose }) {
  const isSalaried = ret?.profile === 'salaried';
  const isBiz      = ret?.profile === 'business' || ret?.profile === 'freelancer';

  const [pan,         setPan]         = useState(profile?.pan       || '');
  const [name,        setName]        = useState(profile?.full_name  || '');
  const [phone,       setPhone]       = useState(profile?.phone      || '');
  const [email,       setEmail]       = useState(profile?.email      || '');
  const [dob,         setDob]         = useState('');
  const [aadhaar,     setAadhaar]     = useState('');
  const [city,        setCity]        = useState('');
  const [stateCode,   setStateCode]   = useState('');
  const [pinCode,     setPinCode]     = useState('');
  const [locality,    setLocality]    = useState('');
  const [employerTAN, setEmpTAN]      = useState('');
  const [employerName,setEmpName]     = useState('');
  const [bizName,     setBizName]     = useState('');
  const [bizTurnover, setBizTurnover] = useState('');
  const [gstin,       setGstin]       = useState('');
  const [bankAc,      setBankAc]      = useState('');
  const [ifsc,        setIfsc]        = useState('');
  const [saving,      setSaving]      = useState(false);

  const STATES = [
    ['01','J&K'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
    ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],
    ['09','Uttar Pradesh'],['10','Bihar'],['18','Assam'],['19','West Bengal'],
    ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],
    ['24','Gujarat'],['27','Maharashtra'],['28','Andhra Pradesh'],['29','Karnataka'],
    ['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],['36','Telangana'],['38','Ladakh'],
  ];

  async function handleSave() {
    if (!pan || pan.length !== 10) { alert('Please enter a valid 10-digit PAN'); return; }
    if (!name.trim()) { alert('Please enter full name as per PAN card'); return; }
    setSaving(true);
    try {
      await supabase.from('profiles').update({ pan, full_name:name, phone }).eq('id', profile.id).catch(() => {});
      onSave({
        pan, name, phone, email, dob, aadhaar, city, stateCode,
        pinCode: parseInt(pinCode) || 0, locality,
        employerTAN, employerName, bizName,
        bizTurnover: parseInt(bizTurnover.replace(/[^0-9]/g,'')) || 0,
        gstin,
        bankAccounts: bankAc ? [{ IFSCCode:ifsc, BankAccountNo:bankAc, BankName:'', UseForRefund:'Y' }] : [],
      });
    } finally { setSaving(false); }
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', background:'var(--surface)', color:'var(--text-primary)', fontFamily:'inherit' };
  const lbl = { fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:5 };
  const Sec = ({ t }) => React.createElement('div', { style:{ fontSize:11, fontWeight:700, color:'var(--brand)', margin:'8px 0 6px', textTransform:'uppercase', letterSpacing:'0.05em' } }, t);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:24, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Client details for ITR JSON</div>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Fields marked * are required by the CBDT schema.</p>

        <div style={{ display:'grid', gap:10 }}>
          <Sec t="Personal" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Full name (PAN card) *</label><input style={inp} value={name} onChange={e => setName(e.target.value.toUpperCase())} placeholder="RAHUL KUMAR SHAH" /></div>
            <div><label style={lbl}>PAN *</label><input style={inp} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Date of birth *</label><input type="date" style={inp} value={dob} onChange={e => setDob(e.target.value)} /></div>
            <div><label style={lbl}>Aadhaar number</label><input style={inp} value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g,''))} placeholder="123456789012" maxLength={12} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Mobile *</label><input style={inp} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))} placeholder="9876543210" maxLength={10} /></div>
            <div><label style={lbl}>Email *</label><input style={inp} value={email} onChange={e => setEmail(e.target.value)} placeholder="client@email.com" /></div>
          </div>

          <Sec t="Address" />
          <div><label style={lbl}>Locality / Area *</label><input style={inp} value={locality} onChange={e => setLocality(e.target.value)} placeholder="Kalavad Road" /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <div><label style={lbl}>City *</label><input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Rajkot" /></div>
            <div><label style={lbl}>State *</label>
              <select style={inp} value={stateCode} onChange={e => setStateCode(e.target.value)}>
                <option value="">Select</option>
                {STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>PIN code</label><input style={inp} value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="360001" maxLength={6} /></div>
          </div>

          {isSalaried && <>
            <Sec t="Employer (for TDS schedule)" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Employer TAN</label><input style={inp} value={employerTAN} onChange={e => setEmpTAN(e.target.value.toUpperCase())} placeholder="MUMA12345A" maxLength={10} /></div>
              <div><label style={lbl}>Employer name</label><input style={inp} value={employerName} onChange={e => setEmpName(e.target.value)} placeholder="Acme Private Ltd" /></div>
            </div>
          </>}

          {isBiz && <>
            <Sec t="Business (for Schedule BP)" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Business/profession name</label><input style={inp} value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Consulting / Trading" /></div>
              <div><label style={lbl}>Gross turnover / receipts (₹)</label><input style={inp} value={bizTurnover} onChange={e => setBizTurnover(e.target.value)} placeholder="2500000" /></div>
            </div>
            <div><label style={lbl}>GSTIN (if registered)</label><input style={inp} value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} /></div>
          </>}

          <Sec t="Bank account (for refund)" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Account number</label><input style={inp} value={bankAc} onChange={e => setBankAc(e.target.value)} placeholder="Account number" /></div>
            <div><label style={lbl}>IFSC code</label><input style={inp} value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234" /></div>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</Button>
          <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Download size={14}/>} Generate ITR JSON
          </Button>
        </div>
      </div>
    </div>
  );
}
// ── Filing steps panel ────────────────────────────────────────────────────────
function FilingSteps({ ret, profile, itrJson, itrForm, onMarkFiled }) {
  const [step, setStep]     = useState(1);
  const [filing, setFiling] = useState(false);

  const comp    = ret?.computation || {};
  const balance = comp.balanceDue || 0;
  const refund  = comp.refund     || 0;

  return (
    <div style={{ background:'var(--surface-2)', borderRadius:'var(--radius-md)', padding:16, marginTop:12 }}>
      <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>Filing steps</div>

      {/* Step 1: Pay tax (if balance due) */}
      {balance > 0 && (
        <div style={{ marginBottom:14, padding:12, background: step>=1?'var(--surface)':'var(--surface-3)', border:`1px solid ${step===1?'var(--brand)':'var(--border)'}`, borderRadius:'var(--radius-md)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:24, height:24, borderRadius:'50%', background: step>1?'var(--success)':'var(--brand)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
              {step>1 ? '✓' : '1'}
            </div>
            <span style={{ fontWeight:600, fontSize:13 }}>Pay self-assessment tax — {formatINR(balance)}</span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, marginBottom:10 }}>
            The client has a balance tax of {formatINR(balance)} to pay before filing. Guide them to pay via the IT portal challan.
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <a href="https://www.incometax.gov.in/iec/foportal/e-pay-tax" target="_blank" rel="noreferrer"
              style={{ padding:'7px 14px', background:'var(--brand-light)', color:'var(--brand)', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
              <ExternalLink size={13}/> Pay tax on IT portal
            </a>
            <Button variant="success" size="sm" onClick={() => setStep(2)}>Tax paid — continue ↓</Button>
          </div>
        </div>
      )}

      {/* Step 2: Download ITR JSON */}
      <div style={{ marginBottom:14, padding:12, background:'var(--surface)', border:`1px solid ${step===(balance>0?2:1)?'var(--brand)':'var(--border)'}`, borderRadius:'var(--radius-md)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--brand)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
            {balance > 0 ? '2' : '1'}
          </div>
          <span style={{ fontWeight:600, fontSize:13 }}>Download ITR JSON file</span>
          <Badge variant="success">Ready</Badge>
        </div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, marginBottom:10 }}>
          The {itrForm} JSON is generated from TaxTalk data. Download it and import into the IT Department offline utility to file.
        </p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button variant="primary" size="sm" onClick={() => downloadITRJson(itrJson, profile?.pan, '2026-27')}>
            <Download size={13}/> Download {itrForm} JSON
          </Button>
          <a href="https://www.incometax.gov.in/iec/foportal/downloads/income-tax-returns" target="_blank" rel="noreferrer"
            style={{ padding:'6px 14px', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--text-secondary)', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
            <ExternalLink size={13}/> Download IT Dept offline utility
          </a>
        </div>
      </div>

      {/* Step 3: Import & submit */}
      <div style={{ marginBottom:14, padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--surface-3)', color:'var(--text-muted)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
            {balance > 0 ? '3' : '2'}
          </div>
          <span style={{ fontWeight:600, fontSize:13 }}>Import into offline utility & submit</span>
        </div>
        <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:10 }}>
          <p style={{ marginBottom:4 }}>1. Open the IT Dept offline utility → File Returns → Import pre-filled data</p>
          <p style={{ marginBottom:4 }}>2. Select the downloaded JSON → validate → preview</p>
          <p style={{ marginBottom:4 }}>3. Submit → client gets OTP on their registered mobile → enter to e-verify</p>
          <p>4. Download ITR-V acknowledgment</p>
        </div>
        <a href="https://www.incometax.gov.in/iec/foportal/help/offline-utility" target="_blank" rel="noreferrer"
          style={{ padding:'6px 14px', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--text-secondary)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}>
          <ExternalLink size={13}/> Offline utility guide
        </a>
      </div>

      {/* Step 4: E-verify */}
      <div style={{ marginBottom:14, padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--surface-3)', color:'var(--text-muted)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
            {balance > 0 ? '4' : '3'}
          </div>
          <span style={{ fontWeight:600, fontSize:13 }}>E-verify & get acknowledgment</span>
        </div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, marginBottom:10 }}>
          Client e-verifies via Aadhaar OTP, net banking, or bank account. ITR-V acknowledgment is downloaded. Return is complete.
        </p>
        <a href="https://www.incometax.gov.in/iec/foportal/e-verify-return" target="_blank" rel="noreferrer"
          style={{ padding:'6px 14px', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--text-secondary)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}>
          <ExternalLink size={13}/> E-verify on IT portal
        </a>
      </div>

      {/* Mark as filed */}
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
        <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>Once the return is successfully filed and e-verified:</div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <input type="text" placeholder="Enter acknowledgment number (15 digits)" id="ack-no"
            style={{ flex:1, padding:'8px 12px', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' }} />
          <Button variant="success" onClick={async () => {
            const ackNo = document.getElementById('ack-no')?.value;
            if (!ackNo) { alert('Please enter acknowledgment number'); return; }
            setFiling(true);
            try { await onMarkFiled(ackNo); } finally { setFiling(false); }
          }} disabled={filing}>
            {filing ? <Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> : <CheckCircle size={14}/>} Mark as filed
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background:'var(--surface-3)', borderRadius:'var(--radius-md)', padding:'14px 16px' }}>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function FlagBlock({ flag }) {
  const isCrit = flag.severity === 'critical';
  return (
    <div style={{ background: isCrit ? 'var(--danger-light)' : 'var(--warn-light)', border:`1px solid ${isCrit ? '#fca5a5' : '#fcd34d'}`, borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:13, color: isCrit ? '#991b1b' : '#92400e', marginBottom:4 }}>
        {isCrit ? <AlertCircle size={14}/> : <AlertTriangle size={14}/>} {flag.title}
      </div>
      <p style={{ fontSize:13, color: isCrit ? '#7f1d1d' : '#78350f', lineHeight:1.5 }}>{flag.body}</p>
    </div>
  );
}

function CompRow({ label, value, bold }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <span style={{ color:'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 500, color: bold ? 'var(--text-primary)' : 'var(--brand)' }}>{value}</span>
    </div>
  );
}

function ClientCard({ entry, caUserId, onRefresh }) {
  const [expanded, setExpanded]     = useState(entry.flags?.some(f => f.severity === 'critical'));
  const [queryMode, setQueryMode]   = useState(false);
  const [queryText, setQueryText]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [status, setStatus]         = useState(entry.returns?.status || 'submitted');
  const [queried, setQueried]       = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [itrJson, setItrJson]       = useState(null);
  const [showFiling, setShowFiling] = useState(false);

  const ret     = entry.returns;
  const comp    = ret?.computation || {};
  const flags   = entry.flags || [];
  const profile = entry.profiles;
  const cfg     = STATUS_CONFIG[status] || STATUS_CONFIG.submitted;

  const critCount = flags.filter(f => f.severity === 'critical').length;
  const warnCount = flags.filter(f => f.severity === 'warn').length;
  const badgeVariant = critCount > 0 ? 'danger' : warnCount > 0 ? 'warn' : 'success';
  const badgeLabel   = critCount > 0 ? `${critCount} critical` : warnCount > 0 ? `${warnCount} flagged` : 'Clean';

  const itrForm = determineITRForm(ret?.profile, comp);

  async function handleApprove() {
    setSaving(true);
    try {
      await approveReturn(ret.id, caUserId);
      setStatus('approved');
      onRefresh();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleSendQuery() {
    if (!queryText.trim()) return;
    setSaving(true);
    try {
      await sendCAQuery(ret.id, caUserId, entry.user_id, queryText);
      setQueried(true);
      setQueryMode(false);
      setStatus('queried');
      onRefresh();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  function handleGenerateJson(clientDetails) {
    setShowModal(false);
    const returnData = { ...clientDetails, pan: clientDetails.pan || profile?.pan, name: clientDetails.name || profile?.full_name, phone: clientDetails.phone || profile?.phone, email: clientDetails.email || profile?.email };
    const json = generateITRJson(itrForm, returnData, ret?.profile, comp);
    setItrJson(json);
    setShowFiling(true);
  }

  async function handleMarkFiled(ackNo) {
    await supabase.from('returns').update({ status:'filed', acknowledgement_no:ackNo, filed_at:new Date().toISOString(), filed_by:caUserId }).eq('id', ret.id);
    await supabase.from('audit_log').insert({ return_id:ret.id, user_id:caUserId, action:'itr_filed', detail:{ ackNo } });
    // Notify client via ca_queries
    await supabase.from('ca_queries').insert({ return_id:ret.id, from_user_id:caUserId, to_user_id:entry.user_id, message:`Your ${itrForm} for AY 2026-27 has been filed successfully! Acknowledgment number: ${ackNo}. Please e-verify within 30 days if not already done.` });
    setStatus('filed');
    onRefresh();
  }

  const taxableIncome = comp?.betterRegime === 'old' ? comp?.oldTaxable : comp?.newTaxable;

  return (
    <>
      {showModal && <ClientDetailModal profile={profile} ret={ret} onSave={handleGenerateJson} onClose={() => setShowModal(false)} />}

      <Card style={{ marginBottom:10, border: expanded ? '1px solid var(--brand)' : '1px solid var(--border)', transition:'border-color 0.2s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
          <Avatar initials={(profile?.full_name || profile?.email || 'U').substring(0,2).toUpperCase()} size={40} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:600, fontSize:14 }}>{profile?.full_name || profile?.email || 'Client'}</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
              {ret?.profile} · {itrForm} · {taxableIncome ? `Taxable income ${formatINR(taxableIncome)}` : 'Computation pending'}
              {profile?.pan && <span style={{ marginLeft:8, color:'var(--text-muted)' }}>{profile.pan}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
            <Badge variant={cfg.variant}>{cfg.icon} {cfg.label}</Badge>
            {expanded ? <ChevronUp size={16} color="var(--text-muted)"/> : <ChevronDown size={16} color="var(--text-muted)"/>}
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop:16 }}>
            <Divider />

            {/* Computation */}
            {comp && Object.keys(comp).length > 0 && (
              <>
                <div style={{ fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', margin:'12px 0 8px' }}>Tax computation</div>
                {comp.grossTotal > 0   && <CompRow label="Gross income" value={formatINR(comp.grossTotal)} />}
                {comp.cap80C > 0       && <CompRow label="80C deductions" value={`− ${formatINR(comp.cap80C)}`} />}
                {comp.cap80D > 0       && <CompRow label="80D mediclaim"  value={`− ${formatINR(comp.cap80D)}`} />}
                {taxableIncome > 0     && <CompRow label={`Taxable income (${comp.betterRegime} regime)`} value={formatINR(taxableIncome)} bold />}
                {(comp.cgTax||0) > 0   && <CompRow label="CG tax (special rates)" value={formatINR(comp.cgTax)} />}
                {comp.chosenTax > 0    && <CompRow label="Total tax + cess" value={formatINR(comp.chosenTax)} />}
                {comp.tdsDeducted > 0  && <CompRow label="TDS deducted" value={`− ${formatINR(comp.tdsDeducted)}`} />}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:14, fontWeight:700 }}>
                  <span style={{ color: comp.refund > 0 ? 'var(--success)' : 'var(--warn)' }}>
                    {comp.refund > 0 ? '🎉 Refund due' : '⚠️ Balance payable'}
                  </span>
                  <span style={{ color: comp.refund > 0 ? 'var(--success)' : 'var(--warn)' }}>
                    {formatINR(comp.refund > 0 ? comp.refund : comp.balanceDue)}
                  </span>
                </div>
                {comp.betterRegime && (
                  <div style={{ marginBottom:12 }}>
                    <Badge variant="info"><TrendingUp size={11}/> {comp.betterRegime === 'old' ? 'Old' : 'New'} regime · saves {formatINR(comp.savings || 0)} vs other</Badge>
                  </div>
                )}
              </>
            )}

            {/* Flags */}
            {flags.length > 0 && (
              <>
                <div style={{ fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>AI flags</div>
                {flags.map((f,i) => <FlagBlock key={i} flag={f} />)}
              </>
            )}

            {/* AI note */}
            {entry.ai_note && (
              <div style={{ background:'var(--surface-3)', borderLeft:'3px solid var(--brand)', padding:'10px 14px', borderRadius:'0 8px 8px 0', marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--brand)', marginBottom:4 }}>AI note</div>
                <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.55 }}>{entry.ai_note}</p>
              </div>
            )}

            {/* Filing steps (shown after JSON generation) */}
            {showFiling && itrJson && (
              <FilingSteps ret={ret} profile={profile} itrJson={itrJson} itrForm={itrForm} onMarkFiled={handleMarkFiled} />
            )}

            {/* Query box */}
            {queryMode && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6 }}>Message to {profile?.full_name?.split(' ')[0] || 'client'} (sent via app):</div>
                <textarea value={queryText} onChange={e => setQueryText(e.target.value)} rows={3} style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--radius-md)', border:'1px solid var(--border-strong)', fontSize:13, lineHeight:1.5, background:'var(--surface)', color:'var(--text-primary)', resize:'none', fontFamily:'inherit' }} />
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <Button variant="warn" size="sm" onClick={handleSendQuery} disabled={saving || !queryText.trim()}>
                    {saving ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={13}/>} Send query
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setQueryMode(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {queried && <div style={{ display:'flex', alignItems:'center', gap:6, color:'var(--success)', fontSize:13, marginBottom:12 }}><CheckCircle size={14}/> Query sent to client</div>}

            {/* Action buttons */}
            {status !== 'filed' && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                {status === 'submitted' && critCount === 0 && (
                  <Button variant="success" onClick={handleApprove} disabled={saving}>
                    {saving ? <Loader size={15} style={{ animation:'spin 1s linear infinite' }}/> : <CheckCircle size={15}/>} Approve
                  </Button>
                )}
                {(status === 'approved' || status === 'submitted') && critCount === 0 && (
                  <Button variant="primary" onClick={() => { if (!showFiling) setShowModal(true); else setShowFiling(false); }}>
                    <Download size={15}/> {showFiling ? 'Hide filing steps' : 'Prepare & file ITR'}
                  </Button>
                )}
                <Button variant="warn" onClick={() => setQueryMode(q => !q)}>
                  <MessageSquare size={15}/> {queryMode ? 'Cancel' : 'Query client'}
                </Button>
              </div>
            )}

            {status === 'filed' && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--success-light)', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:600, color:'var(--success)' }}>
                <CheckCircle size={16}/> ITR filed · Ack: {ret?.acknowledgement_no || 'Saved'}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

export default function CADashboard({ caUserId }) {
  const [queue, setQueue]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('ca_queue')
        .select(`
          *,
          returns (id, status, profile, itr_form, computation, extracted_data,
            flags (*)
          ),
          profiles:user_id (full_name, email, pan, phone)
        `)
        .order('priority', { ascending:true })
        .order('created_at', { ascending:true });

      if (error) throw error;

      // Flatten flags up to the entry level so the rest of the component works unchanged
      const normalised = (data || []).map(entry => ({
        ...entry,
        flags: entry.returns?.flags || [],
      }));

      setQueue(normalised);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Live updates via Supabase realtime
  useEffect(() => {
    loadQueue();
    const channel = supabase
      .channel('ca_queue_live')
      .on('postgres_changes', { event:'*', schema:'public', table:'ca_queue' }, loadQueue)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const pending  = queue.filter(e => e.returns?.status === 'submitted').length;
  const flagged  = queue.filter(e => (e.flags?.length || 0) > 0).length;
  const approved = queue.filter(e => e.returns?.status === 'approved').length;

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 16px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700 }}>CA Review Queue</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>RB Shah & Associates · AY 2026-27</p>
        </div>
        <button onClick={loadQueue} title="Refresh" style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:24 }}>
        <StatCard label="Pending review" value={pending}  color="var(--warn)" />
        <StatCard label="Flagged"        value={flagged}  color="var(--danger)" />
        <StatCard label="Approved"       value={approved} color="var(--success)" />
        <StatCard label="Total in queue" value={queue.length} />
      </div>

      {loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40, gap:8, color:'var(--text-muted)' }}>
          <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading queue…
        </div>
      )}

      {error && (
        <Card style={{ border:'1px solid var(--danger-light)', marginBottom:16 }}>
          <div style={{ color:'var(--danger)', fontSize:14 }}>⚠️ {error}</div>
        </Card>
      )}

      {!loading && queue.length === 0 && (
        <Card>
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
            <CheckCircle size={32} style={{ margin:'0 auto 12px', color:'var(--success)' }}/>
            <div style={{ fontSize:15, fontWeight:500 }}>Queue is clear</div>
            <div style={{ fontSize:13, marginTop:4 }}>No returns pending review</div>
          </div>
        </Card>
      )}

      {!loading && queue.map(entry => (
        <ClientCard key={entry.id} entry={entry} caUserId={caUserId} onRefresh={loadQueue} />
      ))}
    </div>
  );
}
