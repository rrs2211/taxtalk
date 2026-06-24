import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, MessageSquare, Clock, ChevronDown, ChevronUp, Send, FileText, TrendingUp, Loader, RefreshCw, Download, ExternalLink, Users, Trash2, X, Upload, Eye } from 'lucide-react';
import { Avatar, Badge, Button, Card, Divider } from './UI.jsx';
import { formatINR } from '../data/flow.js';
import { supabase, approveReturn, sendCAQuery, getAllUsers, getAllCAQueries, getReturnDocuments, deleteReturnAsCA, sendMessage, getReturnMessages } from '../lib/supabase.js';
import CAReturnEditor from './CAReturnEditor.jsx';
import { determineITRForm, generateITRJson, downloadITRJson } from '../lib/itrJson.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

const STATUS_CFG = {
  submitted: { label:'Pending review',  variant:'warn',    icon:<Clock size={12}/> },
  queried:   { label:'Awaiting client', variant:'info',    icon:<MessageSquare size={12}/> },
  approved:  { label:'Approved',        variant:'success', icon:<CheckCircle size={12}/> },
  filed:     { label:'Filed ✓',         variant:'success', icon:<CheckCircle size={12}/> },
  on_hold:   { label:'On hold',         variant:'neutral', icon:<Clock size={12}/> },
};

function StatCard({ label, value, color }) {
  return (
    <div style={{ background:'var(--surface-3)', borderRadius:'var(--radius-md)', padding:'14px 16px' }}>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: color||'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
function FlagBlock({ flag }) {
  const c = flag.severity==='critical';
  return (
    <div style={{ background:c?'var(--danger-light)':'var(--warn-light)', border:`1px solid ${c?'#fca5a5':'#fcd34d'}`, borderRadius:8, padding:'9px 13px', marginBottom:7 }}>
      <div style={{ display:'flex', gap:6, fontWeight:600, fontSize:13, color:c?'#991b1b':'#92400e', marginBottom:3 }}>
        {c?<AlertCircle size={13}/>:<AlertTriangle size={13}/>} {flag.title}
      </div>
      <p style={{ fontSize:12, color:c?'#7f1d1d':'#78350f', lineHeight:1.5 }}>{flag.body}</p>
    </div>
  );
}
function CompRow({ label, value, bold }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <span style={{ color:'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight:bold?600:500, color:bold?'var(--text-primary)':'var(--brand)' }}>{value}</span>
    </div>
  );
}

// ── Client detail modal ───────────────────────────────────────────────────────
// Pre-fills from client KYC — CA only fills gaps
function ClientDetailModal({ profile, ret, kycData, onSave, onClose }) {
  const isSalaried = ret?.profile==='salaried';
  const isBiz      = ret?.profile==='business'||ret?.profile==='freelancer';
  // Pre-fill from KYC (client already entered these)
  const k = kycData || {};
  const [pan,        setPan]    = useState(k.pan        || profile?.pan        || '');
  const [name,       setName]   = useState(k.full_name  || profile?.full_name  || '');
  const [dob,        setDob]    = useState(k.dob        || '');
  const [phone,      setPhone]  = useState(k.phone      || profile?.phone      || '');
  const [email,      setEmail]  = useState(k.email      || profile?.email      || '');
  const [aadhaar,    setAadhaar]= useState(k.aadhaar    || '');
  const [locality,   setLoc]    = useState(k.locality   || '');
  const [city,       setCity]   = useState(k.city       || profile?.city       || '');
  const [stateCode,  setState_] = useState(k.state_code || '');
  const [pinCode,    setPin]    = useState(k.pin_code   || '');
  const [empTAN,     setEmpTAN] = useState('');
  const [empName,    setEmpName]= useState('');
  const [bizName,    setBiz]    = useState('');
  const [bizTurnover,setBizT]   = useState('');
  const [gstin,      setGstin]  = useState('');
  const [bankAc,     setBankAc] = useState('');
  const [ifsc,       setIfsc]   = useState('');
  const [saving,     setSaving] = useState(false);

  const STATES=[['01','J&K'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','UP'],['10','Bihar'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','MP'],['24','Gujarat'],['27','Maharashtra'],['28','AP'],['29','Karnataka'],['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],['36','Telangana'],['38','Ladakh']];
  const inp = { style:{ width:'100%', padding:'9px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', background:'var(--surface)', color:'var(--text-primary)', fontFamily:'inherit', boxSizing:'border-box' }};
  const lbl = { fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 };
  const Sec = ({ t }) => <div style={{ fontSize:11, fontWeight:700, color:'var(--brand)', margin:'8px 0 6px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{t}</div>;

  async function handleSave() {
    if (!pan||pan.length!==10) { alert('Valid 10-character PAN required'); return; }
    if (!name.trim()) { alert('Full name required'); return; }
    setSaving(true);
    try {
      await supabase.from('profiles').update({ pan, full_name:name, phone, dob, aadhaar, city, state_code:stateCode, pin_code:pinCode, locality }).eq('id', profile.id);
      onSave({ pan, name, dob, phone, email, aadhaar, locality, city, stateCode, pinCode: parseInt(pinCode)||0, employerTAN:empTAN, employerName:empName, bizName, bizTurnover:parseInt(bizTurnover)||0, gstin, bankAccounts: bankAc?[{IFSCCode:ifsc, BankAccountNo:bankAc, BankName:'', UseForRefund:'Y'}]:[] });
    } finally { setSaving(false); }
  }

  const kycBadge = (k.kyc_complete) && (
    <div style={{ fontSize:11, padding:'2px 8px', background:'var(--success-light)', color:'var(--success)', borderRadius:20, display:'inline-flex', alignItems:'center', gap:4, marginBottom:8 }}>
      <CheckCircle size={10}/> KYC details pre-filled from client profile
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:24, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Client details for ITR JSON</div>
        {kycBadge}
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>Verify all details before generating JSON. Fields marked * are required by CBDT schema.</p>
        <div style={{ display:'grid', gap:10 }}>
          <Sec t="Personal (from client KYC)" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Full name (PAN card) *</label><input {...inp} value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="RAHUL KUMAR SHAH"/></div>
            <div><label style={lbl}>PAN *</label><input {...inp} value={pan} onChange={e=>setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10}/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Date of birth *</label><input type="date" {...inp} value={dob} onChange={e=>setDob(e.target.value)}/></div>
            <div><label style={lbl}>Aadhaar</label><input {...inp} value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,''))} placeholder="123456789012" maxLength={12}/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Mobile *</label><input {...inp} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} placeholder="9876543210" maxLength={10}/></div>
            <div><label style={lbl}>Email</label><input {...inp} value={email} onChange={e=>setEmail(e.target.value)}/></div>
          </div>
          <Sec t="Address" />
          <div><label style={lbl}>Locality / Area *</label><input {...inp} value={locality} onChange={e=>setLoc(e.target.value)} placeholder="Kalavad Road"/></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <div><label style={lbl}>City *</label><input {...inp} value={city} onChange={e=>setCity(e.target.value)} placeholder="Rajkot"/></div>
            <div><label style={lbl}>State *</label>
              <select {...inp} value={stateCode} onChange={e=>setState_(e.target.value)} style={{ ...inp.style, cursor:'pointer' }}>
                <option value="">Select</option>{STATES.map(([c,l])=><option key={c} value={c}>{l}</option>)}
              </select>
            </div>
            <div><label style={lbl}>PIN</label><input {...inp} value={pinCode} onChange={e=>setPin(e.target.value)} placeholder="360001" maxLength={6}/></div>
          </div>
          {isSalaried && <><Sec t="Employer (for TDS schedule)" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Employer TAN</label><input {...inp} value={empTAN} onChange={e=>setEmpTAN(e.target.value.toUpperCase())} placeholder="AHMA12345A"/></div>
              <div><label style={lbl}>Employer name</label><input {...inp} value={empName} onChange={e=>setEmpName(e.target.value)} placeholder="Acme Pvt Ltd"/></div>
            </div></>}
          {isBiz && <><Sec t="Business (for Schedule BP)" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Business name</label><input {...inp} value={bizName} onChange={e=>setBiz(e.target.value)} placeholder="Consulting"/></div>
              <div><label style={lbl}>Gross turnover (₹)</label><input {...inp} value={bizTurnover} onChange={e=>setBizT(e.target.value)} placeholder="2500000"/></div>
            </div>
            <div><label style={lbl}>GSTIN</label><input {...inp} value={gstin} onChange={e=>setGstin(e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15}/></div></>}
          <Sec t="Bank account (for refund)" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Account number</label><input {...inp} value={bankAc} onChange={e=>setBankAc(e.target.value)} placeholder="Account number"/></div>
            <div><label style={lbl}>IFSC</label><input {...inp} value={ifsc} onChange={e=>setIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234"/></div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</Button>
          <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
            {saving?<Loader size={14} style={{ animation:'spin 1s linear infinite' }}/>:<Download size={14}/>} Generate ITR JSON
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Filing steps ──────────────────────────────────────────────────────────────
function FilingSteps({ ret, profile, itrJson, itrForm, onMarkFiled }) {
  const [filing, setFiling] = useState(false);
  const comp    = ret?.computation || {};
  const balance = comp.balanceDue  || 0;
  return (
    <div style={{ background:'var(--surface-2)', borderRadius:'var(--radius-md)', padding:14, marginTop:12 }}>
      <div style={{ fontWeight:600, fontSize:14, marginBottom:12 }}>Filing steps</div>
      {balance>0 && (
        <div style={{ marginBottom:12, padding:12, background:'var(--surface)', border:'1px solid var(--warn)', borderRadius:'var(--radius-md)' }}>
          <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>1. Pay self-assessment tax — {formatINR(balance)}</div>
          <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>Client must pay via IT portal before filing.</p>
          <a href="https://www.incometax.gov.in/iec/foportal/e-pay-tax" target="_blank" rel="noreferrer" style={{ padding:'6px 12px', background:'var(--brand-light)', color:'var(--brand)', borderRadius:'var(--radius-md)', fontSize:13, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}><ExternalLink size={12}/> Pay on IT portal</a>
        </div>
      )}
      <div style={{ padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', marginBottom:10 }}>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>{balance>0?'2.':'1.'} Download & import ITR JSON</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button variant="primary" size="sm" onClick={() => downloadITRJson(itrJson, profile?.pan, '2026-27')}><Download size={13}/> Download {itrForm} JSON</Button>
          <a href="https://www.incometax.gov.in/iec/foportal/downloads/income-tax-returns" target="_blank" rel="noreferrer" style={{ padding:'6px 12px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--text-secondary)', textDecoration:'none', display:'inline-flex', gap:5, alignItems:'center' }}><ExternalLink size={12}/> IT offline utility</a>
        </div>
      </div>
      <div style={{ padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', marginBottom:10 }}>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>{balance>0?'3.':'2.'} Client e-verifies</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)' }}>Client e-verifies via Aadhaar OTP or net banking on IT portal.</p>
      </div>
      <div style={{ padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)' }}>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>{balance>0?'4.':'3.'} Mark as filed</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="text" placeholder="Enter acknowledgment number (15 digits)" id="ack-input"
            style={{ flex:1, padding:'7px 10px', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' }}/>
          <Button variant="success" onClick={async()=>{ const n=document.getElementById('ack-input')?.value; if(!n){alert('Enter ack number');return;} setFiling(true); try{await onMarkFiled(n);}finally{setFiling(false);} }} disabled={filing}>
            {filing?<Loader size={13} style={{ animation:'spin 1s linear infinite' }}/>:<CheckCircle size={13}/>} Mark filed
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Document viewer ───────────────────────────────────────────────────────────
function DocumentsPanel({ returnId, caUserId }) {
  const [docs,    setDocs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null); // { url, name }
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getReturnDocuments(returnId).then(d => { setDocs(d); setLoading(false); }).catch(()=>setLoading(false));
  }, [returnId]);

  async function viewDoc(docId, name) {
    const { data:{ session } } = await supabase.auth.getSession();
    const res = await fetch('/api/doc-url', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` }, body: JSON.stringify({ documentId: docId }) });
    const { url } = await res.json();
    setViewing({ url, name });
  }

  async function handleUpload(file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      const doc = await uploadDocument(file, returnId, 'ca_note', () => {});
      setDocs(d => [...d, { id:doc.id, doc_type:'ca_note', original_name:file.name, extraction_status:'success', created_at:new Date().toISOString() }]);
    } catch(e) { alert('Upload failed: ' + e.message); }
    finally { setUploading(false); }
  }

  const DOC_LABELS = { ais:'AIS / 26AS', form16:'Form 16', balance_sheet:'Balance Sheet', pl_statement:'P&L', supporting_doc:'Supporting document', ca_note:'CA note' };

  return (
    <div style={{ marginTop:10 }}>
      {viewing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:2000, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--surface)', padding:'12px 16px', borderRadius:'var(--radius-md)', marginBottom:10, display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontWeight:600 }}>{viewing.name}</span>
            <a href={viewing.url} target="_blank" rel="noreferrer" style={{ color:'var(--brand)', fontSize:13 }}>Open in new tab</a>
            <button onClick={() => setViewing(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer' }}><X size={18}/></button>
          </div>
          <iframe src={viewing.url} style={{ width:'90vw', height:'85vh', border:'none', borderRadius:8 }} title="Document" />
        </div>
      )}
      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>Uploaded documents</div>
      {loading ? <div style={{ fontSize:13, color:'var(--text-muted)' }}>Loading...</div> : docs.length===0 ? <div style={{ fontSize:13, color:'var(--text-muted)' }}>No documents</div> : docs.map(d=>(
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'var(--surface-2)', borderRadius:7, marginBottom:6, fontSize:13 }}>
          <FileText size={14} color="var(--brand)"/>
          <span style={{ flex:1, color:'var(--text-secondary)' }}>{DOC_LABELS[d.doc_type]||d.doc_type}: <span style={{ color:'var(--text-primary)' }}>{d.original_name}</span></span>
          <Badge variant={d.extraction_status==='success'?'success':d.extraction_status==='failed'?'danger':'neutral'}>{d.extraction_status}</Badge>
          <button onClick={() => viewDoc(d.id, d.original_name)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:12, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:4 }}><Eye size={12}/> View</button>
        </div>
      ))}
      <div style={{ marginTop:8 }}>
        <input ref={fileRef} type="file" style={{ display:'none' }} onChange={e => e.target.files[0]&&handleUpload(e.target.files[0])}/>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading?<><Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> Uploading...</>:<><Upload size={13}/> Upload document</>}
        </Button>
      </div>
    </div>
  );
}

// ── Client card ───────────────────────────────────────────────────────────────
function ClientCard({ entry, caUserId, onRefresh }) {
  const [expanded,   setExpanded]   = useState(false);
  const [queryMode,  setQueryMode]  = useState(false);
  const [queryText,  setQueryText]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [status,     setStatus]     = useState(entry.returns?.status||'submitted');
  const [queried,    setQueried]    = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [itrJson,    setItrJson]    = useState(null);
  const [showFiling, setShowFiling] = useState(false);
  const [showDocs,   setShowDocs]   = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editedComp, setEditedComp] = useState(null);
  const [kycData,    setKycData]    = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const ret     = entry.returns;
  const comp    = ret?.computation||{};
  const flags   = entry.flags||[];
  const profile = entry.profiles;
  const cfg     = STATUS_CFG[status]||STATUS_CFG.submitted;
  const critCount= flags.filter(f=>f.severity==='critical').length;
  const warnCount= flags.filter(f=>f.severity==='warn').length;
  const itrForm  = determineITRForm(ret?.profile, comp);
  const taxableIncome = comp?.betterRegime==='old' ? comp?.oldTaxable : comp?.newTaxable;

  // Load client KYC when expanding
  useEffect(() => {
    if (expanded && !kycData && profile?.id) {
      supabase.from('profiles').select('*').eq('id', entry.user_id).single()
        .then(({ data }) => setKycData(data));
    }
  }, [expanded]);

  async function handleApprove() {
    setSaving(true);
    try { await approveReturn(ret.id, caUserId); setStatus('approved'); onRefresh(); }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleSendQuery() {
    if (!queryText.trim()) return;
    setSaving(true);
    try { await sendCAQuery(ret.id, caUserId, entry.user_id, queryText); setQueried(true); setQueryMode(false); setStatus('queried'); onRefresh(); }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  function handleGenerateJson(clientDetails) {
    setShowModal(false);
    const json = generateITRJson(itrForm, ret, clientDetails, comp);
    setItrJson(json); setShowFiling(true);
  }

  async function handleMarkFiled(ackNo) {
    await supabase.from('returns').update({ status:'filed', acknowledgement_no:ackNo, filed_at:new Date().toISOString(), filed_by:caUserId }).eq('id', ret.id);
    await supabase.from('ca_queries').insert({ return_id:ret.id, from_user_id:caUserId, to_user_id:entry.user_id, message:`Your ${itrForm} for AY 2026-27 has been filed! Acknowledgment: ${ackNo}. Please e-verify within 30 days.` });
    setStatus('filed'); onRefresh();
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try { await deleteReturnAsCA(ret.id); onRefresh(); }
    catch(e) { alert(e.message); setDeleting(false); setConfirmDel(false); }
  }

  return (
    <>
      {showModal && <ClientDetailModal profile={profile} ret={ret} kycData={kycData} onSave={handleGenerateJson} onClose={()=>setShowModal(false)} />}
      <Card style={{ marginBottom:10, border:expanded?'1px solid var(--brand)':'1px solid var(--border)', transition:'border-color 0.2s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', minWidth:0, overflow:'hidden' }} onClick={()=>setExpanded(e=>!e)}>
          <Avatar initials={(profile?.full_name||profile?.email||'U').substring(0,2).toUpperCase()} size={40} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:600, fontSize:14 }}>{profile?.full_name||profile?.email||'Client'}</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
              {ret?.profile} · {itrForm} · {taxableIncome?`Tax income ${formatINR(taxableIncome)}`:'Pending'}
              {profile?.pan && <span style={{ marginLeft:8, color:'var(--text-muted)', fontFamily:'monospace' }}>{profile.pan}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <Badge variant={critCount>0?'danger':warnCount>0?'warn':'success'}>{critCount>0?`${critCount} critical`:warnCount>0?`${warnCount} flagged`:'Clean'}</Badge>
            <Badge variant={cfg.variant}>{cfg.icon} {cfg.label}</Badge>
            {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop:16 }}>
            <Divider />

            {/* Computation */}
            {comp&&Object.keys(comp).length>0&&(
              <>
                <div style={{ fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', margin:'12px 0 8px' }}>Tax computation</div>
                {comp.grossTotal>0   &&<CompRow label="Gross income"          value={formatINR(comp.grossTotal)}/>}
                {comp.cap80C>0       &&<CompRow label="80C deductions"         value={`− ${formatINR(comp.cap80C)}`}/>}
                {comp.cap80D>0       &&<CompRow label="80D mediclaim"          value={`− ${formatINR(comp.cap80D)}`}/>}
                {taxableIncome>0     &&<CompRow label={`Taxable income (${comp.betterRegime} regime)`} value={formatINR(taxableIncome)} bold/>}
                {(comp.cgTax||0)>0   &&<CompRow label="CG tax (special rates)" value={formatINR(comp.cgTax)}/>}
                {comp.chosenTax>0    &&<CompRow label="Tax + 4% cess"          value={formatINR(comp.chosenTax)}/>}
                {comp.tdsDeducted>0  &&<CompRow label="TDS deducted"           value={`− ${formatINR(comp.tdsDeducted)}`}/>}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:14, fontWeight:700 }}>
                  <span style={{ color:comp.refund>0?'var(--success)':'var(--warn)' }}>{comp.refund>0?'🎉 Refund due':'⚠️ Balance payable'}</span>
                  <span style={{ color:comp.refund>0?'var(--success)':'var(--warn)' }}>{formatINR(comp.refund>0?comp.refund:comp.balanceDue)}</span>
                </div>
                {comp.betterRegime&&<div style={{ marginBottom:12 }}><Badge variant="info"><TrendingUp size={11}/> {comp.betterRegime==='old'?'Old':'New'} regime · saves {formatINR(comp.savings||0)}</Badge></div>}
              </>
            )}

            {/* Flags */}
            {flags.length>0&&(<><div style={{ fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>AI flags</div>{flags.map((f,i)=><FlagBlock key={i} flag={f}/>)}</>)}

            {/* Documents */}
            <button onClick={()=>setShowDocs(d=>!d)} style={{ fontSize:13, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', padding:'4px 0', marginBottom:4 }}>
              {showDocs?'▲':'▶'} View / upload documents
            </button>
            {showDocs && <DocumentsPanel returnId={ret.id} caUserId={caUserId}/>}

            {/* Return editor */}
            {showEditor && (
              <div style={{ marginTop:12, padding:16, background:'var(--surface-2)', borderRadius:'var(--radius-md)', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ fontWeight:600, fontSize:15 }}>Edit return data</div>
                  <button onClick={()=>setShowEditor(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><X size={16}/></button>
                </div>
                <CAReturnEditor
                  ret={{ ...ret, computation: editedComp || comp }}
                  kycData={kycData}
                  onSave={(updatedComp) => { setEditedComp(updatedComp); setShowEditor(false); onRefresh(); }}
                  onClose={() => setShowEditor(false)}
                />
              </div>
            )}

            {/* Message thread with client */}
            <CAMessageThread returnId={ret.id} caUserId={caUserId} clientId={entry.user_id} clientName={profile?.full_name?.split(' ')[0]||'Client'} />

            {/* Filing steps */}
            {showFiling&&itrJson&&<FilingSteps ret={ret} profile={profile} itrJson={itrJson} itrForm={itrForm} onMarkFiled={handleMarkFiled}/>}

            {/* Query box */}
            {queryMode&&(
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6 }}>Message to {profile?.full_name?.split(' ')[0]||'client'}:</div>
                <textarea value={queryText} onChange={e=>setQueryText(e.target.value)} rows={3} style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--radius-md)', border:'1px solid var(--border-strong)', fontSize:13, background:'var(--surface)', color:'var(--text-primary)', resize:'none', fontFamily:'inherit' }}/>
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <Button variant="warn" size="sm" onClick={handleSendQuery} disabled={saving||!queryText.trim()}>
                    {saving?<Loader size={13} style={{ animation:'spin 1s linear infinite' }}/>:<Send size={13}/>} Send query
                  </Button>
                  <Button variant="ghost" size="sm" onClick={()=>setQueryMode(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {queried&&<div style={{ display:'flex', gap:6, color:'var(--success)', fontSize:13, marginBottom:10 }}><CheckCircle size={14}/> Query sent to client</div>}

            {/* Actions */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
              {status!=='filed'&&status==='submitted'&&critCount===0&&<Button variant="success" onClick={handleApprove} disabled={saving}><CheckCircle size={15}/> Approve</Button>}
              <Button variant="secondary" onClick={()=>setShowEditor(e=>!e)}>✏️ {showEditor?'Close editor':'Edit return'}</Button>
              {status!=='filed'&&critCount===0&&(status==='approved'||status==='submitted')&&(
                <Button variant="primary" onClick={()=>{ if(!showFiling)setShowModal(true); else setShowFiling(false); }}>
                  <Download size={15}/> {showFiling?'Hide filing':'Prepare & file ITR'}
                </Button>
              )}
              {status!=='filed'&&<Button variant="warn" onClick={()=>setQueryMode(q=>!q)}><MessageSquare size={15}/> {queryMode?'Cancel':'Query client'}</Button>}
              {confirmDel&&<span style={{ fontSize:12, color:'var(--danger)', alignSelf:'center' }}>Confirm?</span>}
              <Button variant={confirmDel?'danger':'ghost'} size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting?<Loader size={13} style={{ animation:'spin 1s linear infinite' }}/>:<Trash2 size={13}/>} {confirmDel?'Delete':'Delete return'}
              </Button>
              {confirmDel&&<Button variant="secondary" size="sm" onClick={()=>setConfirmDel(false)}><X size={13}/></Button>}
            </div>

            {status==='filed'&&<div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--success-light)', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:600, color:'var(--success)', marginTop:10 }}><CheckCircle size={16}/> Filed · Ack: {ret?.acknowledgement_no||'Saved'}</div>}
          </div>
        )}
      </Card>
    </>
  );
}

// ── CA Message Thread (inline in ClientCard) ───────────────────────────────────
function CAMessageThread({ returnId, caUserId, clientId, clientName }) {
  const [messages,  setMessages]  = useState([]);
  const [reply,     setReply]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [unread,    setUnread]    = useState(0);
  const bottomRef = useRef(null);

  async function load() {
    const { data } = await supabase.from('ca_queries').select('*, from_profile:from_user_id(id, full_name)').eq('return_id', returnId).order('created_at', { ascending: true });
    setMessages(data || []);
    const u = (data||[]).filter(m => m.to_user_id===caUserId && !m.is_read).length;
    setUnread(u);
    if (u > 0) await supabase.from('ca_queries').update({ is_read:true }).eq('return_id', returnId).eq('to_user_id', caUserId).catch(()=>{});
  }

  useEffect(() => {
    load();
    const ch = supabase.channel(`ca_thread_${returnId}`).on('postgres_changes', { event:'INSERT', schema:'public', table:'ca_queries', filter:`return_id=eq.${returnId}` }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [returnId]);

  useEffect(() => { if (expanded) bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, expanded]);

  async function handleSend() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await supabase.from('ca_queries').insert({ return_id:returnId, from_user_id:caUserId, to_user_id:clientId, message:reply.trim() });
      setReply(''); load();
    } finally { setSending(false); }
  }

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-md)', overflow:'hidden', marginTop:8 }}>
      <button onClick={()=>setExpanded(e=>!e)} style={{ width:'100%', padding:'9px 14px', background:'var(--surface-3)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, fontWeight:500, color:'var(--text-secondary)' }}>
        <span>💬 Messages with {clientName}</span>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {unread > 0 && <span style={{ background:'var(--danger)', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{unread} new</span>}
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding:'12px' }}>
          <div style={{ maxHeight:220, overflowY:'auto', display:'flex', flexDirection:'column', gap:7, marginBottom:10 }}>
            {messages.length===0 && <div style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', padding:12 }}>No messages yet</div>}
            {messages.map(m => {
              const isCA = m.from_user_id===caUserId;
              return (
                <div key={m.id} style={{ display:'flex', justifyContent:isCA?'flex-end':'flex-start' }}>
                  <div style={{ maxWidth:'80%', background:isCA?'var(--brand)':'var(--surface-2)', color:isCA?'#fff':'var(--text-primary)', borderRadius:isCA?'12px 12px 2px 12px':'12px 12px 12px 2px', padding:'7px 11px', fontSize:13, border:isCA?'none':'1px solid var(--border)' }}>
                    {!isCA && <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:2 }}>{clientName}</div>}
                    <div>{m.message}</div>
                    <div style={{ fontSize:10, opacity:0.65, marginTop:2 }}>{new Date(m.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==='Enter'&&reply.trim()&&handleSend()} placeholder={`Message ${clientName}...`} style={{ flex:1, padding:'7px 10px', border:'1px solid var(--border-strong)', borderRadius:8, fontSize:13, outline:'none' }}/>
            <button onClick={handleSend} disabled={sending||!reply.trim()} style={{ padding:'7px 12px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:13 }}>
              {sending?<Loader size={12} style={{ animation:'spin 1s linear infinite' }}/>:<Send size={12}/>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Users panel ───────────────────────────────────────────────────────────────
function UsersPanel() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => { getAllUsers().then(u => { setUsers(u); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || (u.full_name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || (u.pan||'').toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email, PAN..."
          style={{ width:'100%', padding:'9px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none', background:'var(--surface)', color:'var(--text-primary)', boxSizing:'border-box' }}/>
      </div>
      {loading ? <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></div>
        : filtered.length===0 ? <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:14 }}>No users found</div>
        : (
          <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-md)', overflow:'hidden', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr', padding:'8px 12px', background:'var(--surface-3)', fontSize:10, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em', gap:6, minWidth:500 }}>
              <span>Name / Email</span><span>PAN</span><span>City</span><span>KYC</span><span>Last seen</span>
            </div>
            {filtered.map((u,i) => (
              <div key={u.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr', padding:'10px 12px', borderTop:'1px solid var(--border)', fontSize:12, gap:6, background:i%2===0?'var(--surface)':'var(--surface-2)', alignItems:'center', minWidth:500 }}>
                <div>
                  <div style={{ fontWeight:500 }}>{u.full_name||'—'}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{u.email}</div>
                </div>
                <span style={{ fontFamily:'monospace', fontSize:12 }}>{u.pan||'—'}</span>
                <span style={{ color:'var(--text-secondary)' }}>{u.city||'—'}</span>
                <Badge variant={u.kyc_complete?'success':'neutral'}>{u.kyc_complete?'Done':'Pending'}</Badge>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>{u.updated_at ? new Date(u.updated_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}</span>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── CA Message Center ─────────────────────────────────────────────────────────
function MessageCenter({ caUserId }) {
  const [threads,  setThreads]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply,    setReply]    = useState('');
  const [sending,  setSending]  = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getAllCAQueries();
      // Group by return_id + to_user_id
      const map = {};
      data.forEach(q => {
        const key = q.return_id || `no_return_${q.to_user_id}`;
        if (!map[key]) map[key] = { key, client: q.client || q.sender, ret: q.returns, messages:[], returnId: q.return_id };
        map[key].messages.push(q);
      });
      setThreads(Object.values(map));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const ch = supabase.channel('ca_msg').on('postgres_changes',{event:'*',schema:'public',table:'ca_queries'},load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function handleSend() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const clientId = selected.client?.id || selected.messages[0]?.to_user_id;
      const returnId = selected.ret?.id;
      await supabase.from('ca_queries').insert({ return_id:returnId, from_user_id:caUserId, to_user_id:clientId, message:reply.trim() });
      setReply('');
      load();
    } finally { setSending(false); }
  }

  if (loading) return <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></div>;

  const selThread = selected ? threads.find(t=>t.key===selected.key) : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%', minHeight:400 }}>
      {/* Thread list */}
      <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-md)', overflow:'auto', maxHeight:200 }}>
        {threads.length===0
          ? <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:13 }}>No messages yet</div>
          : threads.map(t => {
            const unread = t.messages.filter(m => m.from_user_id===caUserId && !m.client_reply).length;
            const last   = t.messages[t.messages.length-1];
            return (
              <div key={t.key} onClick={() => setSelected(t)} style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:selected?.key===t.key?'var(--brand-light)':'transparent' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{t.client?.full_name||t.client?.email||'Client'}</span>
                  {unread>0 && <Badge variant="danger">{unread}</Badge>}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>AY {t.ret?.assessment_year} · {t.ret?.profile}</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{last?.message?.substring(0,60)}...</div>
              </div>
            );
          })
        }
      </div>

      {/* Message thread */}
      <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-md)', display:'flex', flexDirection:'column' }}>
        {!selThread ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--text-muted)', fontSize:14 }}>Select a conversation</div>
        ) : (
          <>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--surface-3)' }}>
              <div style={{ fontWeight:600 }}>{selThread.client?.full_name||selThread.client?.email}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>AY {selThread.ret?.assessment_year} · {selThread.ret?.profile} · {selThread.ret?.itr_form}</div>
            </div>
            <div style={{ flex:1, overflow:'auto', padding:12, display:'flex', flexDirection:'column', gap:8 }}>
              {selThread.messages.map(m => {
                const isCA = m.from_user_id===caUserId;
                return (
                  <React.Fragment key={m.id}>
                    {/* CA message */}
                    <div style={{ display:'flex', justifyContent:isCA?'flex-end':'flex-start' }}>
                      <div style={{ maxWidth:'75%', background:isCA?'var(--brand)':'var(--surface-3)', color:isCA?'#fff':'var(--text-primary)', borderRadius:isCA?'12px 12px 2px 12px':'12px 12px 12px 2px', padding:'8px 12px', fontSize:13, lineHeight:1.5 }}>
                        <div>{m.message}</div>
                        <div style={{ fontSize:10, opacity:0.7, marginTop:3 }}>{new Date(m.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                    {/* Client reply shown as separate bubble */}
                    {m.client_reply && (
                      <div style={{ display:'flex', justifyContent:'flex-start' }}>
                        <div style={{ maxWidth:'75%', background:'var(--surface-3)', color:'var(--text-primary)', borderRadius:'12px 12px 12px 2px', padding:'8px 12px', fontSize:13, lineHeight:1.5, border:'1px solid var(--border)' }}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>Client replied</div>
                          <div>{m.client_reply}</div>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>{m.replied_at ? new Date(m.replied_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{ padding:10, borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
              <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()} placeholder="Type a message..." style={{ flex:1, padding:'8px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, outline:'none' }}/>
              <Button variant="primary" onClick={handleSend} disabled={sending||!reply.trim()}><Send size={14}/></Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main CA Dashboard ─────────────────────────────────────────────────────────
export default function CADashboard({ caUserId }) {
  const [tab,     setTab]     = useState('queue');
  const [queue,   setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  async function loadQueue() {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.from('ca_queue').select(`
        *, user_id,
        returns (id, status, profile, itr_form, computation, extracted_data, flags (*)),
        profiles:user_id (id, full_name, email, pan, phone, city, kyc_complete)
      `).order('priority',{ascending:true}).order('created_at',{ascending:true});
      if (error) throw error;
      setQueue((data||[]).map(e => ({ ...e, flags: e.returns?.flags||[] })));
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    loadQueue();
    const ch = supabase.channel('ca_queue_live').on('postgres_changes',{event:'*',schema:'public',table:'ca_queue'},loadQueue).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const pending  = queue.filter(e=>e.returns?.status==='submitted').length;
  const flagged  = queue.filter(e=>(e.flags?.length||0)>0).length;
  const approved = queue.filter(e=>e.returns?.status==='approved').length;

  const TABS = [
    { id:'queue',   label:'Review Queue' },
    { id:'messages',label:'Messages' },
    { id:'users',   label:'All Clients' },
  ];

  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'16px 14px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>CA Dashboard</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>RB Shah & Associates · AY 2026-27</p>
        </div>
        <button onClick={loadQueue} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
        <StatCard label="Pending review" value={pending}  color="var(--warn)"/>
        <StatCard label="Flagged"        value={flagged}  color="var(--danger)"/>
        <StatCard label="Approved"       value={approved} color="var(--success)"/>
        <StatCard label="Total in queue" value={queue.length}/>
      </div>

      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:16, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===t.id?600:400, color:tab===t.id?'var(--brand)':'var(--text-secondary)', borderBottom:`2px solid ${tab===t.id?'var(--brand)':'transparent'}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='queue' && (<>
        {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40, gap:8, color:'var(--text-muted)' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading...</div>}
        {error && <Card style={{ border:'1px solid var(--danger-light)', marginBottom:12 }}><div style={{ color:'var(--danger)', fontSize:14 }}>⚠️ {error}</div></Card>}
        {!loading && queue.length===0 && <Card><div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}><CheckCircle size={28} style={{ margin:'0 auto 10px', color:'var(--success)' }}/><div style={{ fontSize:15, fontWeight:500 }}>Queue is clear</div><div style={{ fontSize:13, marginTop:4 }}>No returns pending review</div></div></Card>}
        {!loading && queue.map(e => <ClientCard key={e.id} entry={e} caUserId={caUserId} onRefresh={loadQueue}/>)}
      </>)}

      {tab==='messages' && <MessageCenter caUserId={caUserId}/>}
      {tab==='users'    && <UsersPanel/>}
    </div>
  );
}
