import React, { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle, Info } from 'lucide-react';
import { computeTax, formatINR, formatINRShort } from '../data/flow.js';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

// ── Steps ─────────────────────────────────────────────────────────────────────
const S = {
  // AIS first
  AIS_UPLOAD: 'ais_upload',
  AIS_CONFIRM: 'ais_confirm',
  // Identity
  PROFILE_CONFIRM: 'profile_confirm',  // confirm what AIS shows
  PROFILE_SELECT: 'profile_select',    // manual fallback
  // Salaried
  FORM16: 'form16',
  // Business
  BIZ_TYPE: 'biz_type',
  BIZ_DOCS: 'biz_docs',            // upload P&L + B/S
  BIZ_PRESUMPTIVE: 'biz_presumptive',
  // Other income confirmation
  INCOME_CONFIRM: 'income_confirm', // show what AIS found, let user confirm/add
  OS_INCOME: 'os_income',
  HP_TYPE: 'hp_type', HP_RENT: 'hp_rent', HP_MUNI: 'hp_muni',
  CG_CONFIRM: 'cg_confirm',
  // Deductions
  DED_80C: 'ded_80c', DED_80C_AMT: 'ded_80c_amt',
  DED_OTHER: 'ded_other', DED_MED_AMT: 'ded_med_amt',
  // Taxes
  TAXES_CONFIRM: 'taxes_confirm',
  // End
  COMPUTATION: 'computation', DONE: 'done',
};

// ── UI Atoms ──────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display:'flex', gap:6, padding:'10px 14px', background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', width:'fit-content' }}>
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
      <div style={{ background:'var(--brand)', borderRadius:'18px 18px 4px 18px', padding:'10px 16px', fontSize:14, color:'#fff', maxWidth:'75%', animation:'fadeUp 0.2s ease', lineHeight:1.5 }}>{children}</div>
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
function UploadBtn({ label, subLabel, onFile, uploading, progress, accept='.pdf,.jpg,.jpeg,.png' }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} style={{ display:'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <button onClick={() => ref.current.click()} disabled={uploading}
        style={{ width:'100%', padding:'16px 14px', borderRadius:'var(--radius-md)', border:'2px dashed var(--brand)', background:'var(--brand-light)', color:'var(--brand)', fontSize:14, fontWeight:500, cursor:uploading?'wait':'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
        {uploading
          ? <><Loader size={18} style={{ animation:'spin 1s linear infinite' }} /><span>Reading document... {progress>0?`${progress}%`:''}</span></>
          : <><Upload size={20}/><span>{label}</span>{subLabel && <span style={{ fontSize:12, opacity:0.75, fontWeight:400 }}>{subLabel}</span>}</>
        }
      </button>
    </div>
  );
}
function ProcessBubble({ msg }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'82%' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>T</div>
      <div style={{ background:'var(--surface-3)', borderRadius:'18px 18px 18px 4px', padding:'12px 16px', fontSize:13, color:'var(--text-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'var(--brand)' }}/>{msg}
      </div>
    </div>
  );
}

// ── Confirm row (shows what AIS found, lets user edit) ────────────────────────
function ConfirmRow({ label, value, onEdit, editable=true }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const ref = useRef(null);
  function start() { setDraft(String(value||0)); setEditing(true); setTimeout(()=>ref.current?.select(),40); }
  function commit() { onEdit(isNaN(draft) ? draft : (parseInt(draft)||0)); setEditing(false); }
  const isNum = typeof value === 'number';
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <span style={{ color:'var(--text-secondary)' }}>{label}</span>
      {editing
        ? <input ref={ref} type={isNum?'number':'text'} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();}} style={{ width:130, padding:'3px 8px', border:'1.5px solid var(--brand)', borderRadius:6, fontSize:13, textAlign:'right', outline:'none', background:'var(--surface)', color:'var(--text-primary)' }} />
        : <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontWeight:600, color:value?'var(--brand)':'var(--text-muted)' }}>
              {isNum ? formatINR(value) : (value || '—')}
            </span>
            {editable && <button onClick={start} style={{ padding:'2px 8px', fontSize:11, border:'1px solid var(--border-strong)', borderRadius:5, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'pointer' }}>Edit</button>}
          </div>
      }
    </div>
  );
}

// ── Editable field (review card) ──────────────────────────────────────────────
function EditField({ label, value, onChange, note }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const ref = useRef(null);
  function start() { setDraft(value||0); setEditing(true); setTimeout(()=>ref.current?.select(),40); }
  function commit() { onChange(parseInt(String(draft).replace(/[^0-9]/g,''))||0); setEditing(false); }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <div>
        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
        {note && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{note}</span>}
      </div>
      {editing
        ? <div style={{ display:'flex', gap:5 }}>
            <span style={{ color:'var(--text-muted)' }}>₹</span>
            <input ref={ref} type="number" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}} style={{ width:110, padding:'3px 8px', border:'1.5px solid var(--brand)', borderRadius:6, fontSize:13, textAlign:'right', outline:'none', background:'var(--surface)', color:'var(--text-primary)' }} />
          </div>
        : <div style={{ display:'flex', gap:8 }}>
            <span style={{ fontWeight:500, color:value<0?'var(--danger)':'var(--brand)' }}>{value<0?'−':''}{formatINR(Math.abs(value||0))}</span>
            <button onClick={start} style={{ padding:'2px 8px', fontSize:11, border:'1px solid var(--border-strong)', borderRadius:5, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'pointer' }}>Edit</button>
          </div>
      }
    </div>
  );
}

// ── Assisted filing notice ────────────────────────────────────────────────────
function AssistedNotice({ reason }) {
  return (
    <div style={{ background:'var(--brand-light)', border:'1.5px solid var(--brand)', borderRadius:'var(--radius-md)', padding:'14px 16px' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <Info size={18} color="var(--brand)" style={{ flexShrink:0, marginTop:2 }}/>
        <div>
          <div style={{ fontWeight:600, fontSize:14, color:'var(--brand)', marginBottom:6 }}>Assisted filing required</div>
          <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:10 }}>{reason}</p>
          <p style={{ fontSize:12, color:'var(--text-muted)' }}>Your CA at RB Shah & Associates will review your uploaded documents and prepare the return. You will be notified when it is ready for your review.</p>
        </div>
      </div>
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────
function RegimeCard({ label, data, regime, selected, better, onSelect }) {
  const tax    = regime==='old' ? data.oldTax    : data.newTax;
  const taxable= regime==='old' ? data.oldTaxable: data.newTaxable;
  const slab   = regime==='old' ? data.oldSlabTax: data.newSlabTax;
  const rebate = regime==='old' ? data.oldRebate : data.newRebate;
  const sc     = regime==='old' ? data.oldSurcharge: data.newSurcharge;
  const balance= Math.max(0, tax-(data.totalPaid||0));
  const refund = Math.max(0, (data.totalPaid||0)-tax);
  return (
    <div onClick={onSelect} style={{ flex:1, borderRadius:10, border:`2px solid ${selected?'var(--brand)':'var(--border)'}`, background:selected?'var(--brand-light)':'var(--surface)', padding:14, cursor:'pointer', transition:'all 0.15s', position:'relative', overflow:'visible' }}>
      {better && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'var(--success)', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20, whiteSpace:'nowrap' }}>RECOMMENDED</div>}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:selected?'var(--brand)':'var(--text-primary)' }}>{label}</span>
        <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selected?'var(--brand)':'var(--border-strong)'}`, background:selected?'var(--brand)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {selected && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
        </div>
      </div>
      {[
        { l:'Taxable income',    v:formatINR(taxable) },
        { l:'Slab tax',          v:formatINR(slab) },
        ...(rebate>0  ?[{ l:'Less: Rebate 87A',   v:`−${formatINR(rebate)}` }]:[]),
        ...((data.cgTax||0)>0?[{ l:'CG tax (special)',v:formatINR(data.cgTax) }]:[]),
        ...(sc>0      ?[{ l:'Surcharge',           v:formatINR(sc) }]:[]),
        { l:'Tax + 4% cess',     v:formatINR(tax), bold:true },
      ].map((r,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', borderBottom:'0.5px solid var(--border)', color:r.bold?'var(--text-primary)':'var(--text-secondary)', fontWeight:r.bold?700:400 }}>
          <span>{r.l}</span><span style={{ color:r.bold?(selected?'var(--brand)':'var(--text-primary)'):'inherit' }}>{r.v}</span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:6, borderTop:'1px solid var(--border)', fontSize:13, fontWeight:600 }}>
        {refund>0 ? <span style={{ color:'var(--success)' }}>Refund: {formatINR(refund)}</span>
                  : <span style={{ color:balance>0?'var(--warn)':'var(--text-muted)' }}>{balance>0?`Pay: ${formatINR(balance)}`:'No balance due'}</span>}
      </div>
    </div>
  );
}

// ── Computation review card ───────────────────────────────────────────────────
function ComputationCard({ initialData, initialInputs, aisFlags, onApprove, submitting }) {
  const [inp, setInp] = useState({ ...initialInputs });
  const [regime, setRegime] = useState(initialData.betterRegime || 'new');
  const comp    = computeTax(inp);
  const selTax  = regime==='old' ? comp.oldTax : comp.newTax;
  const balance = Math.max(0, selTax-(comp.totalPaid||0));
  const refund  = Math.max(0, (comp.totalPaid||0)-selTax);
  const set = f => v => setInp(p => ({ ...p, [f]: v }));

  const SH = ({ c }) => <div style={{ padding:'7px 12px', background:'var(--surface-3)', fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{c}</div>;

  return (
    <Card style={{ marginTop:8 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:3 }}>Review your return</div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>All figures extracted from your documents. Tap <strong>Edit</strong> to correct anything — computation updates live.</div>
      </div>

      {aisFlags?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--warn)', marginBottom:6, textTransform:'uppercase' }}>AIS cross-check flags</div>
          {aisFlags.map((f,i) => (
            <div key={i} style={{ background:'var(--warn-light)', border:'1px solid #fcd34d', borderRadius:8, padding:'8px 12px', marginBottom:6, fontSize:13 }}>
              <div style={{ fontWeight:600, color:'#92400e', marginBottom:2 }}>⚠️ {f.title}</div>
              <div style={{ color:'#78350f' }}>{f.body}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
        {(inp.grossSalary||0) > 0 && <>
          <SH c="Salary income"/>
          <EditField label="Gross salary" value={inp.grossSalary||0} onChange={set('grossSalary')} />
          <EditField label="Standard deduction" value={inp.standardDeduction||75000} onChange={set('standardDeduction')} note="default ₹75,000" />
          <EditField label="Professional tax (16iii)" value={inp.professionalTax||0} onChange={set('professionalTax')} />
        </>}

        {(inp.businessIncome||0) > 0 && <>
          <SH c="Business / professional income"/>
          <EditField label="Net taxable business income" value={inp.businessIncome||0} onChange={set('businessIncome')} />
        </>}

        <SH c="Other source income (Schedule OS)"/>
        <EditField label="Savings bank interest" value={inp.savingsInterest||0} onChange={v => setInp(p => ({...p, savingsInterest:v, interestIncome:(p.fdInterest||0)+v}))} note="80TTA deductible" />
        <EditField label="FD / RD / other interest" value={inp.fdInterest||0} onChange={v => setInp(p => ({...p, fdInterest:v, interestIncome:(p.savingsInterest||0)+v}))} />
        <EditField label="Dividends" value={inp.dividendIncome||0} onChange={set('dividendIncome')} />
        <EditField label="Other miscellaneous income" value={inp.otherIncome||0} onChange={set('otherIncome')} />

        {inp.houseProperty?.enabled && <>
          <SH c="House property"/>
          <div style={{ padding:'8px 12px', fontSize:13, color:'var(--text-secondary)', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
            {inp.houseProperty.type} · {inp.houseProperty.type==='Rented'?`Rent: ${formatINR(inp.houseProperty.rentReceived||0)} · `:''}Interest: {formatINR(inp.houseProperty.interestPaid||0)}
            <span style={{ marginLeft:8, fontWeight:600, color:comp.hpIncome<0?'var(--danger)':'var(--success)' }}>→ {comp.hpIncome<0?'−':''}{formatINR(Math.abs(comp.hpIncome||0))}</span>
          </div>
        </>}

        {inp.capitalGains?.enabled && <>
          <SH c="Capital gains"/>
          {(inp.capitalGains.shares?.stcg111a||0)>0 && <EditField label="STCG — Equity (111A @ 20%)" value={inp.capitalGains.shares.stcg111a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,stcg111a:v}}}))} />}
          {(inp.capitalGains.shares?.ltcg112a||0)>0 && <EditField label="LTCG — Equity (112A @ 12.5%)" value={inp.capitalGains.shares.ltcg112a} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,shares:{...p.capitalGains.shares,ltcg112a:v}}}))} />}
          {(inp.capitalGains.property?.ltcg||0)>0 && <EditField label="LTCG — Property (@ 12.5%)" value={inp.capitalGains.property.ltcg} onChange={v=>setInp(p=>({...p,capitalGains:{...p.capitalGains,property:{...p.capitalGains.property,ltcg:v}}}))} />}
        </>}

        <SH c="Deductions — old regime only"/>
        <EditField label="Section 80C" value={inp.deductions80C||0} onChange={set('deductions80C')} note="max ₹1,50,000" />
        <EditField label="Section 80D — mediclaim" value={inp.deductions80D||0} onChange={set('deductions80D')} note="max ₹75,000" />
        {!inp.houseProperty?.enabled && <EditField label="Home loan interest (24b)" value={inp.deductions24b||0} onChange={set('deductions24b')} note="max ₹2,00,000" />}
        <EditField label="Education loan (80E)" value={inp.deductions80E||0} onChange={set('deductions80E')} />
        <EditField label="Savings interest (80TTA)" value={inp.deductions80TTA||0} onChange={set('deductions80TTA')} note="max ₹10,000" />
        <EditField label="Donations (80G)" value={inp.deductions80G||0} onChange={set('deductions80G')} />

        <SH c="Taxes paid"/>
        <EditField label="TDS deducted (salary + other)" value={inp.tdsDeducted||0} onChange={set('tdsDeducted')} />
        <EditField label="Advance tax paid" value={inp.advanceTax||0} onChange={set('advanceTax')} />
        <EditField label="Self-assessment tax" value={inp.selfAssessment||0} onChange={set('selfAssessment')} />
      </div>

      <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'var(--text-secondary)' }}>Gross total income</span>
          <span style={{ fontWeight:600 }}>{formatINR(comp.grossTotal)}</span>
        </div>
      </div>

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Choose tax regime <span style={{ fontSize:11, fontWeight:400, color:'var(--text-muted)' }}>— tap to select</span></div>
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <RegimeCard label="Old regime" data={comp} regime="old" selected={regime==='old'} better={comp.betterRegime==='old'} onSelect={()=>setRegime('old')} />
        <RegimeCard label="New regime" data={comp} regime="new" selected={regime==='new'} better={comp.betterRegime==='new'} onSelect={()=>setRegime('new')} />
      </div>
      {regime!==comp.betterRegime && <div style={{ fontSize:12, color:'var(--warn)', padding:'6px 10px', background:'var(--warn-light)', borderRadius:6, marginBottom:14 }}>⚠️ The {regime} regime costs {formatINR(Math.abs(comp.oldTax-comp.newTax))} more. Your CA will confirm before filing.</div>}

      <div style={{ borderRadius:8, padding:'12px 14px', marginBottom:14, background:refund>0?'var(--success-light)':balance>0?'var(--warn-light)':'var(--surface-3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{refund>0?'🎉 Refund due':balance>0?'⚠️ Self-assessment tax to pay':'✅ No balance due'}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{regime==='old'?'Old':'New'} regime · Std deduction ₹75,000</div>
          </div>
          <div style={{ fontSize:24, fontWeight:700, color:refund>0?'var(--success)':balance>0?'var(--warn)':'var(--text-muted)' }}>
            {refund>0?formatINR(refund):balance>0?formatINR(balance):'₹0'}
          </div>
        </div>
      </div>

      {comp.advanceTaxSchedule?.length>0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>Advance tax instalments</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {comp.advanceTaxSchedule.map((s,i) => (
              <div key={i} style={{ background:'var(--surface-2)', borderRadius:6, padding:8, textAlign:'center', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.due}</div>
                <div style={{ fontSize:12, fontWeight:600, marginTop:2 }}>{formatINRShort(s.amount)}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => onApprove({...comp, betterRegime:regime, chosenTax:selTax, balanceDue:balance, refund})} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Submitting…</> : <><CheckCircle size={15}/> Confirm & send to CA for review</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will verify and file</p>
    </Card>
  );
}

// ── Main TaxChat ──────────────────────────────────────────────────────────────
export default function TaxChat({ userId }) {
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = useReturn(userId);

  const [step, setStep]             = useState(S.AIS_UPLOAD);
  const [messages, setMessages]     = useState([]);
  const [typing, setTyping]         = useState(false);
  const [processing, setProcessing] = useState(null);

  // AIS extracted data — drives everything
  const [aisData, setAisData]       = useState(null);

  // Identity (from AIS or manual)
  const [identity, setIdentity]     = useState({ name:'', pan:'', dob:'', address:'', phone:'', email:'' });

  // Income heads
  const [taxProfile, setTaxProfile] = useState(null); // 'salaried'|'business'|'freelancer'|'partner'|'mixed'
  const [ageGroup, setAgeGroup]     = useState('<60');
  const [grossSalary, setGross]     = useState(0);
  const [tds, setTds]               = useState(0);
  const [businessIncome, setBiz]    = useState(0);
  const [interestIncome, setInt]    = useState(0);
  const [dividendIncome, setDiv]    = useState(0);
  const [savingsInterest, setSavInt]= useState(0);
  const [fdInterest, setFdInt]      = useState(0);
  const [otherOSIncome, setOtherOS] = useState(0);
  const [advanceTax, setAdvTax]     = useState(0);
  const [selfAssess, setSelfAss]    = useState(0);
  const [houseProperty, setHP]      = useState(null);
  const [capitalGains, setCG]       = useState(null);
  const [deductions80C, setD80C]    = useState(0);
  const [deductions80D, setD80D]    = useState(0);
  const [aisFlags, setAisFlags]     = useState([]);

  // Deduction selections
  const [sel80C, setSel80C]         = useState([]);
  const [selOther, setSelOther]     = useState([]);

  // Upload
  const [uploading, setUploading]   = useState(false);
  const [uploadPct, setUploadPct]   = useState(0);
  const [uploadError, setUploadErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Amount input
  const [showInput, setShowInput]   = useState(false);
  const [inputValue, setInputVal]   = useState('');
  const [inputCtx, setInputCtx]     = useState('');

  // HP queue position stored in ref to avoid stale closure
  const hpQueueIdx = useRef(0);

  const bottomRef = useRef(null);

  useEffect(() => {
    if (loadingReturn) return;
    const t = setTimeout(() => {
      addAI(
        <>
          <p style={{ marginBottom:8 }}>👋 Hi! I am <strong>TaxTalk</strong> — your CA assistant from RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>Let us start by uploading your <strong>AIS (Annual Information Statement)</strong> or <strong>Form 26AS</strong> from the IT portal. This pre-fills your name, PAN, income details and TDS — so you do not have to type anything manually.</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Download it from: incometax.gov.in → AIS / Form 26AS tab → Export PDF</p>
        </>, null
      );
    }, 500);
    return () => clearTimeout(t);
  }, [loadingReturn]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing, step, processing]);

  function addAI(content, onDone) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { from:'ai', content, key:Date.now() }]);
      if (onDone) setTimeout(onDone, 300);
    }, 600 + Math.random()*300);
  }
  function addUser(text) {
    setMessages(m => [...m, { from:'user', content:text, key:Date.now() }]);
    persistMessage('user', text).catch(() => {});
  }
  function ask(jsxContent, ctx) {
    addAI(jsxContent, () => { setInputVal(''); setInputCtx(ctx); setShowInput(true); });
  }

  // ── AIS Upload & Parse ──────────────────────────────────────────────────────
  async function handleAISUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0); setUploadErr(null);
    addUser(`Uploaded: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'ais', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading your AIS — extracting identity and income details...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Could not read AIS');
      const { extracted } = await res.json();
      setProcessing(null);
      setAisData(extracted);
      processAISData(extracted);
    } catch(e) {
      setUploading(false); setProcessing(null); setUploadErr(e.message);
      addAI(
        <>
          <p style={{ marginBottom:6 }}>⚠️ Could not read that document. Please try:</p>
          <p>• Make sure it is a PDF (not a scanned image)<br/>• Download the AIS from the IT portal directly</p>
        </>, null
      );
    }
  }

  function processAISData(ais) {
    // ── Pre-fill identity ────────────────────────────────────────────────────
    const idName = ais.name || '';
    const idPAN  = ais.pan  || '';
    setIdentity({ name:idName, pan:idPAN, dob:ais.dob||'', address:ais.address||'', phone:ais.mobile||'', email:ais.email||'' });

    // ── Determine income heads from AIS ─────────────────────────────────────
    const hasSalary   = (ais.salary_income||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasBizRecpt = (ais.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasInterest = (ais.interest_income||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasDividend = (ais.dividend_income||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasRent     = (ais.rent_income||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasCG       = (ais.capital_gains||[]).length > 0;

    // Pre-fill OS income totals
    const totalTDS       = ais.total_tds       || (ais.tds_summary||[]).reduce((s,x)=>s+(x.tds_deducted||0),0);
    const totalAdvTax    = ais.total_advance_tax|| (ais.advance_tax||[]).reduce((s,x)=>s+(x.amount||0),0);
    const totalSelfAss   = (ais.self_assessment_tax||[]).reduce((s,x)=>s+(x.amount||0),0);

    // Interest — split savings vs FD
    const savBankInt = (ais.interest_income||[]).filter(x=>x.source_type==='savings_bank').reduce((s,x)=>s+(x.amount||0),0);
    const fdInt      = (ais.interest_income||[]).filter(x=>x.source_type!=='savings_bank').reduce((s,x)=>s+(x.amount||0),0);
    const totalDiv   = (ais.dividend_income||[]).reduce((s,x)=>s+(x.amount||0),0);

    // Pre-fill CG from AIS
    if (hasCG) {
      const stcg111a = (ais.capital_gains||[]).filter(x=>x.section==='111A').reduce((s,x)=>s+(x.gain||0),0);
      const ltcg112a = (ais.capital_gains||[]).filter(x=>x.section==='112A').reduce((s,x)=>s+(x.gain||0),0);
      const ltcgProp = (ais.capital_gains||[]).filter(x=>x.asset_type==='property').reduce((s,x)=>s+(x.gain||0),0);
      if (stcg111a||ltcg112a||ltcgProp) {
        setCG({ enabled:true, shares:{ stcg111a, ltcg112a }, property:{ ltcg:ltcgProp } });
      }
    }

    // Pre-fill totals
    setTds(totalTDS); setAdvTax(totalAdvTax); setSelfAss(totalSelfAss);
    setSavInt(savBankInt); setFdInt(fdInt); setDiv(totalDiv);
    setInt(savBankInt + fdInt);

    // HP from rent income
    if (hasRent) {
      const totalRent = (ais.rent_income||[]).reduce((s,x)=>s+(x.amount||0),0);
      setHP({ enabled:true, type:'Rented', rentReceived:totalRent, municipalTaxes:0, interestPaid:0 });
    }

    // ── Build income summary card ────────────────────────────────────────────
    const incomeSummary = (
      <>
        <p style={{ marginBottom:10 }}>Here is what I found in your AIS:</p>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', fontSize:13, marginBottom:10 }}>
          {idName && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)', background:'var(--surface-3)' }}><span style={{ color:'var(--text-muted)' }}>Name</span><strong>{idName}</strong></div>}
          {idPAN  && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>PAN</span><strong>{idPAN}</strong></div>}
          {hasSalary   && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Salary income</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR((ais.salary_income||[]).reduce((s,x)=>s+(x.amount||0),0))}</span></div>}
          {hasBizRecpt && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Business receipts</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR((ais.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0))}</span></div>}
          {hasInterest && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Interest income</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(savBankInt+fdInt)}</span></div>}
          {hasDividend && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Dividends</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(totalDiv)}</span></div>}
          {hasRent     && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Rent income</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR((ais.rent_income||[]).reduce((s,x)=>s+(x.amount||0),0))}</span></div>}
          {hasCG       && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Capital gains</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{(ais.capital_gains||[]).length} transaction(s)</span></div>}
          {totalTDS>0  && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Total TDS</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(totalTDS)}</span></div>}
          {totalAdvTax>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px' }}><span style={{ color:'var(--text-muted)' }}>Advance tax</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(totalAdvTax)}</span></div>}
        </div>
        <p style={{ fontSize:13, color:'var(--text-muted)' }}>Does this look correct? You can edit any figure in the final review.</p>
      </>
    );
    setMessages(m => [...m, { from:'ai', key:Date.now(), content:incomeSummary }]);

    // ── Route to correct next step ───────────────────────────────────────────
    setStep(S.AIS_CONFIRM);

    // Store income flags for AIS cross-check display
    const flags = [];
    (ais.high_value_transactions||[]).filter(x=>(x.amount||0)>500000).forEach(t => {
      flags.push({ title:`High-value transaction: ${t.type}`, body:`AIS shows ${formatINR(t.amount)} — ${t.party||''}. Your CA will review if disclosure is needed.` });
    });
    setAisFlags(flags);
  }

  // Additional income types not in AIS
  const [extraIncomeTypes, setExtraIncomeTypes] = useState([]);
  const EXTRA_INCOME_TYPES = [
    { id:'salary_other',  label:'Salary from another employer' },
    { id:'business',      label:'Business / professional income' },
    { id:'hp',            label:'House property (rental)' },
    { id:'cg',            label:'Capital gains (shares / property)' },
    { id:'interest_add',  label:'More interest / dividend income' },
    { id:'none',          label:'Nothing else' },
  ];
  function toggleExtra(id) {
    if (id==='none') { setExtraIncomeTypes(['none']); return; }
    setExtraIncomeTypes(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function confirmExtraIncome() {
    const has = extraIncomeTypes;
    if (has.includes('none') || has.length===0) { addUser('Nothing else'); routeToNextStep(); return; }
    const labels = EXTRA_INCOME_TYPES.filter(t=>has.includes(t.id)&&t.id!=='none').map(t=>t.label).join(', ');
    addUser(labels);
    if (has.includes('business') && taxProfile!=='business') { setTaxProfile('mixed'); setStep(S.BIZ_TYPE); addAI(<p>What type of business income do you have?</p>, null); }
    else if (has.includes('hp')) { setStep(S.HP_TYPE); addAI(<p>Is your property <strong>self-occupied</strong> or <strong>rented out</strong>?</p>, null); }
    else { routeToNextStep(); }
  }
  function routeToNextStep() {
    if (taxProfile==='salaried'||taxProfile==='mixed') {
      setStep(S.FORM16);
      addAI(<><p style={{ marginBottom:8 }}>Please upload your <strong>Form 16</strong> from your employer.</p><p style={{ fontSize:12, color:'var(--text-muted)' }}>PDF or clear photo works.</p></>, null);
    } else if (taxProfile==='business') {
      setStep(S.BIZ_TYPE);
      addAI(<p>What type of business income do you have?</p>, null);
    } else { proceedToDeductions(); }
  }

  function confirmAIS() {
    addUser('Yes, looks correct');
    const hasSalary = (aisData?.salary_income||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    const hasBiz    = (aisData?.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0) > 0;
    if (hasSalary && !hasBiz)      setTaxProfile('salaried');
    else if (hasBiz && !hasSalary) setTaxProfile('business');
    else if (hasBiz && hasSalary)  setTaxProfile('mixed');
    else                           setTaxProfile('investor');
    // Always ask for additional income not in AIS
    setStep(S.INCOME_CONFIRM);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>
          {hasSalary&&hasBiz?'AIS shows salary and business income.':hasSalary?'AIS shows salary income.':hasBiz?'AIS shows business receipts.':'AIS shows investment income.'}
          {' '}Do you have <strong>any other income</strong> not reflected in the AIS above?
        </p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply — or choose "Nothing else" to continue:</p>
      </>, null
    );
  }

  // ── Form 16 Upload ──────────────────────────────────────────────────────────
  async function handleForm16Upload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0);
    addUser(`Uploaded: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'form16', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading Form 16...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Could not read Form 16');
      const { extracted: f16 } = await res.json();
      setProcessing(null);

      const sal  = f16.gross_salary || 0;
      const tdsF = f16.total_tds_deducted || 0;
      const d80C = (f16.deduction_80c||0)+(f16.deduction_80ccc||0)+(f16.deduction_80ccd1||0);
      const d80D = f16.deduction_80d || 0;
      setGross(sal);
      // Merge TDS — AIS TDS is the authoritative source; Form 16 may be partial (one employer)
      if (tdsF > tds) setTds(tdsF);
      if (d80C > 0) setD80C(d80C);
      if (d80D > 0) setD80D(d80D);

      const card = (
        <>
          <p style={{ marginBottom:8 }}>Form 16 read ✨ — cross-checked with your AIS.</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:10 }}>
            {f16.employer_name && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Employer</span><span>{f16.employer_name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross salary</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(sal)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', ...(d80C>0?{borderBottom:'1px solid var(--border)'}:{}) }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tdsF)}</span></div>
            {d80C>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--text-secondary)' }}>80C in Form 16</span><span>{formatINR(d80C)}</span></div>}
          </div>
        </>
      );
      setMessages(m => [...m, { from:'ai', key:Date.now(), content:card }]);
      // Cross-check Form 16 salary vs AIS salary
      const aisSalary = (aisData?.salary_income||[]).reduce((s,x)=>s+(x.amount||0),0);
      if (aisSalary > 0 && sal > 0 && Math.abs(aisSalary - sal) > 1000) {
        setAisFlags(f => [...f, { title:'Salary mismatch between Form 16 and AIS', body:`Form 16 shows ${formatINR(sal)}, AIS shows ${formatINR(aisSalary)}. Difference: ${formatINR(Math.abs(aisSalary-sal))}. Could be multiple employers or a correction. Your CA will reconcile.` }]);
      }
      proceedToDeductions();
    } catch(e) {
      setUploading(false); setProcessing(null);
      addAI(<><p style={{ marginBottom:6 }}>⚠️ Could not read Form 16. Please try a clearer scan.</p><p style={{ fontSize:12, color:'var(--text-muted)' }}>You can also skip and I will use the salary figures from your AIS.</p></>, null);
    }
  }

  function skipForm16() {
    addUser("I'll use AIS salary figures");
    const aisSalary = (aisData?.salary_income||[]).reduce((s,x)=>s+(x.amount||0),0);
    setGross(aisSalary);
    proceedToDeductions();
  }

  // ── Business type ───────────────────────────────────────────────────────────
  const BIZ_TYPES = [
    { id:'44AD',   label:'Presumptive — Business (Sec 44AD)',    sub:'Turnover ≤ ₹3 Cr · 6%/8% of turnover · No books needed' },
    { id:'44ADA',  label:'Presumptive — Professional (Sec 44ADA)',sub:'Receipts ≤ ₹75L · 50% of receipts · No books needed' },
    { id:'actual', label:'Actual profit — books of accounts',    sub:'Upload P&L and Balance Sheet · CA handles disallowances' },
  ];
  const [selBizType, setSelBizType] = useState('44AD');

  function handleBizConfirm() {
    addUser(BIZ_TYPES.find(b=>b.id===selBizType)?.label || selBizType);
    if (selBizType === 'actual') {
      // Assisted filing — upload P&L and B/S
      setStep(S.BIZ_DOCS);
      addAI(
        <>
          <AssistedNotice reason="You have opted for actual profit filing. This requires detailed analysis of your books — depreciation as per IT Act, disallowances under Sec 40A(3), 40(a)(ia), 43B, personal expenses, and other adjustments. This cannot be done through a chat alone." />
          <p style={{ marginTop:12, fontSize:13 }}>Please upload your <strong>Profit & Loss Account</strong> and <strong>Balance Sheet</strong> for FY 2025-26. Your CA will compute the correct taxable income and prepare the return.</p>
        </>, null
      );
    } else {
      // Presumptive — just need turnover
      const bizReceipts = (aisData?.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0);
      if (bizReceipts > 0) {
        addAI(
          <>
            <p>AIS shows business receipts of <strong>{formatINR(bizReceipts)}</strong>.</p>
            <p style={{ marginTop:6, fontSize:13, color:'var(--text-muted)' }}>Is this your total turnover / receipts for the year, or is the actual figure different?</p>
          </>, null
        );
        setStep(S.BIZ_PRESUMPTIVE);
      } else {
        ask(<><p>What was your total <strong>{selBizType==='44ADA'?'professional receipts':'business turnover'}</strong> for FY 2025-26?</p></>, 'biz_turnover');
        setStep(S.BIZ_PRESUMPTIVE);
      }
    }
  }

  // ── P&L / B/S upload (assisted) ────────────────────────────────────────────
  async function handlePLUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0);
    addUser(`Uploaded P&L: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'pl_statement', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading P&L — identifying possible disallowances...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const { extracted: pl } = await res.json();
      setProcessing(null);

      const disallowances = pl.possible_disallowances || [];
      addAI(
        <>
          <p style={{ marginBottom:8 }}>P&L read ✨</p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Gross turnover</span><span style={{ color:'var(--brand)', fontWeight:600 }}>{formatINR(pl.gross_turnover||0)}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Net profit (books)</span><span style={{ fontWeight:600 }}>{formatINR(pl.net_profit_before_tax||0)}</span></div>
            {disallowances.length > 0 && <div style={{ padding:'6px 0', color:'var(--warn)' }}>⚠️ {disallowances.length} possible disallowance(s) identified — CA will verify</div>}
          </div>
          {disallowances.length > 0 && (
            <div style={{ marginBottom:8 }}>
              {disallowances.map((d,i) => (
                <div key={i} style={{ background:'var(--warn-light)', border:'1px solid #fcd34d', borderRadius:6, padding:'7px 10px', marginBottom:5, fontSize:12 }}>
                  <strong>{d.section}:</strong> {d.description} — est. {formatINR(d.estimated_amount||0)}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Your CA will review these and make the correct adjustments before filing. Now please upload your Balance Sheet.</p>
        </>, null
      );
    } catch(e) {
      setUploading(false); setProcessing(null);
      addAI(<p>Could not read P&L. Please upload again.</p>, null);
    }
  }

  async function handleBSUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0);
    addUser(`Uploaded Balance Sheet: ${file.name}`);
    try {
      const doc = await uploadDocument(file, returnRecord.id, 'balance_sheet', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading Balance Sheet...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      await res.json();
      setProcessing(null);
      // Submit to CA for assisted filing
      await submitToCA(`Assisted filing — actual books. Business income. P&L and Balance Sheet uploaded. CA to compute taxable income and disallowances.`, aisFlags.map(f=>({severity:'warn', ...f})));
      setStep(S.DONE);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ All documents sent to your CA at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They will compute your taxable income after all allowable deductions, disallowances, and depreciation adjustments — and prepare the return for your review.</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>You will be notified via the Queries tab when the return is ready.</p>
        </>, null
      );
    } catch(e) {
      setUploading(false); setProcessing(null);
      addAI(<p>Could not read Balance Sheet. Please try again.</p>, null);
    }
  }

  // ── Deductions ──────────────────────────────────────────────────────────────
  const DEDUCTION_OPTIONS = [
    { id:'ppf',  label:'PPF / EPF contributions' },
    { id:'lic',  label:'LIC premium' },
    { id:'elss', label:'ELSS mutual fund' },
    { id:'tuition', label:"Children's tuition fees" },
    { id:'homeloan_principal', label:'Home loan principal' },
    { id:'nps',  label:'NPS (80CCD)' },
    { id:'none', label:'None of these' },
  ];
  const OTHER_DED_OPTIONS = [
    { id:'mediclaim_self',    label:'Mediclaim — self & family' },
    { id:'mediclaim_parents', label:'Mediclaim — parents (senior)' },
    { id:'home_interest',     label:'Home loan interest (24b)' },
    { id:'education_loan',    label:'Education loan interest (80E)' },
    { id:'donations',         label:'Donations (80G)' },
    { id:'none',              label:'None of these' },
  ];

  function toggle80C(id) {
    if (id==='none') { setSel80C(['none']); return; }
    setSel80C(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }
  function toggleOtherDed(id) {
    if (id==='none') { setSelOther(['none']); return; }
    setSelOther(p => { const w=p.filter(x=>x!=='none'); return w.includes(id)?w.filter(x=>x!==id):[...w,id]; });
  }

  function proceedToDeductions() {
    setStep(S.DED_80C);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Good. Now let us check your <strong>tax-saving investments</strong> for FY 2025-26. These reduce tax under the old regime.</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply:</p>
      </>, null
    );
  }

  function confirm80C() {
    if (sel80C.includes('none') || sel80C.length===0) {
      addUser('None'); proceedToOtherDed();
    } else {
      const labels = DEDUCTION_OPTIONS.filter(o=>sel80C.includes(o.id)&&o.id!=='none').map(o=>o.label).join(', ');
      addUser(labels);
      setStep(S.DED_80C_AMT);
      if (deductions80C > 0) {
        ask(<><p>I found <strong>{formatINR(deductions80C)}</strong> in 80C from your Form 16. Is that the correct total? Or enter the actual amount:</p></>, 'd80c');
      } else {
        ask(<><p>What was your total <strong>Section 80C investment</strong>?</p><p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Max ₹1,50,000 qualifies for deduction.</p></>, 'd80c');
      }
    }
  }
  function proceedToOtherDed() {
    setStep(S.DED_OTHER);
    addAI(<><p style={{ marginBottom:8 }}>Any other deductions?</p><p style={{ fontSize:12, color:'var(--text-muted)' }}>Select all that apply:</p></>, null);
  }
  function confirmOtherDed() {
    const hasMed = selOther.includes('mediclaim_self') || selOther.includes('mediclaim_parents');
    if (selOther.includes('none') || selOther.length===0) {
      addUser('None');
      goToTaxesConfirm();
    } else {
      const labels = OTHER_DED_OPTIONS.filter(o=>selOther.includes(o.id)&&o.id!=='none').map(o=>o.label).join(', ');
      addUser(labels);
      if (hasMed) {
        setStep(S.DED_MED_AMT);
        if (deductions80D > 0) {
          ask(<p>I found <strong>{formatINR(deductions80D)}</strong> mediclaim from Form 16. Correct total, or update:</p>, 'd80d');
        } else {
          ask(<p>What was your total <strong>mediclaim / health insurance premium</strong>?</p>, 'd80d');
        }
      } else {
        goToTaxesConfirm();
      }
    }
  }

  // ── Taxes confirmation (AIS has this pre-filled) ────────────────────────────
  function goToTaxesConfirm() {
    setStep(S.TAXES_CONFIRM);
    const totalPaid = tds + advanceTax + selfAssess;
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Here is a summary of <strong>taxes already paid</strong> from your AIS. Please verify:</p>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', fontSize:13, marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>TDS deducted</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(tds)}</span></div>
          {advanceTax > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Advance tax paid</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(advanceTax)}</span></div>}
          {selfAssess > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-secondary)' }}>Self-assessment tax</span><span style={{ color:'var(--success)', fontWeight:600 }}>{formatINR(selfAssess)}</span></div>}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', background:'var(--surface-3)' }}><span style={{ fontWeight:600 }}>Total taxes paid</span><span style={{ fontWeight:700, color:'var(--success)' }}>{formatINR(totalPaid)}</span></div>
        </div>
      </>, null
    );
  }

  // ── Amount handler ──────────────────────────────────────────────────────────
  function handleAmount() {
    const val = parseInt(inputValue.replace(/[^0-9]/g,'')) || 0;
    setShowInput(false); setInputVal('');
    addUser(`₹${val.toLocaleString('en-IN')}`);
    const ctx = inputCtx;

    if (ctx === 'biz_turnover') {
      const rate = selBizType==='44ADA' ? 0.5 : 0.06;
      const presumptive = Math.round(val * rate);
      setBiz(presumptive);
      addAI(
        <><p>Presumptive income: <strong>{formatINR(presumptive)}</strong> ({selBizType==='44ADA'?'50%':'6%'} of {formatINR(val)})</p></>,
        () => proceedToDeductions()
      );
    } else if (ctx === 'biz_turnover_confirm') {
      const bizReceipts = (aisData?.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0);
      const turnover = val || bizReceipts;
      const rate = selBizType==='44ADA' ? 0.5 : 0.06;
      setBiz(Math.round(turnover * rate));
      proceedToDeductions();
    } else if (ctx === 'd80c') {
      setD80C(val); proceedToOtherDed();
    } else if (ctx === 'd80d') {
      setD80D(val); goToTaxesConfirm();
    } else if (ctx === 'hp_rent') {
      setHP(p => ({ ...p, rentReceived:val }));
      ask(<p>What was the <strong>municipal / property tax</strong> paid? (Enter 0 if none)</p>, 'hp_muni');
    } else if (ctx === 'hp_muni') {
      setHP(p => ({ ...p, municipalTaxes:val }));
      ask(<p>What was the <strong>home loan interest</strong> paid on this property? (Enter 0 if no loan)</p>, 'hp_int');
    } else if (ctx === 'hp_int' || ctx === 'hp_int_so') {
      setHP(p => ({ ...p, interestPaid:val }));
      proceedToDeductions();
    }
  }

  // ── HP flow (if user adds property not in AIS) ──────────────────────────────
  function handleHPType(type) {
    addUser(type==='Rented' ? 'Rented out' : 'Self-occupied');
    setHP({ enabled:true, type, rentReceived:0, municipalTaxes:0, interestPaid:0 });
    if (type==='Rented') {
      ask(<p>What was the <strong>annual rent received</strong>?</p>, 'hp_rent');
    } else {
      ask(<p>What was the <strong>home loan interest</strong> paid? (Enter 0 if no loan)</p>, 'hp_int_so');
    }
  }

  // ── Compute & show ──────────────────────────────────────────────────────────
  function computeAndShow() {
    const totalInterest = savingsInterest + fdInterest;
    const inputs = {
      grossSalary, standardDeduction:75000, professionalTax:0,
      businessIncome,
      interestIncome: totalInterest,
      dividendIncome,
      otherIncome: otherOSIncome,
      savingsInterest, fdInterest,
      houseProperty, capitalGains,
      deductions80C, deductions80D,
      deductions80E:0, deductions80TTA: Math.min(savingsInterest, 10000),
      deductions80G:0,
      tdsDeducted:tds, advanceTax, selfAssessment:selfAssess,
      ageGroup,
      profile: taxProfile,
    };
    const result = computeTax(inputs);
    saveComputation(result).catch(console.error);
    setStep(S.COMPUTATION);
    addAI(
      <>
        <p style={{ marginBottom:6 }}>Your tax summary is ready 🎉</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>All figures are pre-filled from your AIS and documents. Review below and edit anything that needs correction.</p>
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
      const note = `${taxProfile} | ${ageGroup} | Income: ${formatINR(finalComp.grossTotal)} | Tax: ${formatINR(finalComp.chosenTax)} | ${finalComp.betterRegime} regime | ${finalComp.refund>0?'Refund: '+formatINR(finalComp.refund):'Balance: '+formatINR(finalComp.balanceDue)}`;
      await submitToCA(note, aisFlags.map(f => ({ severity:'warn', ...f })));
      setStep(S.DONE);
      addUser('Confirmed and sent to CA');
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✅ <strong>Done!</strong> Your return is with the CA team at RB Shah & Associates.</p>
          <p style={{ marginBottom:8 }}>They will review it and file once everything is verified. Check the <strong>My Returns</strong> tab for queries and status updates.</p>
        </>, null
      );
    } catch(e) {
      addAI(<p style={{ color:'var(--danger)' }}>⚠️ Could not submit: {e.message}</p>, null);
    } finally { setSubmitting(false); }
  }

  function handleReset() {
    setStep(S.AIS_UPLOAD); setMessages([]); setAisData(null);
    setTaxProfile(null); setGross(0); setTds(0); setBiz(0);
    setInt(0); setDiv(0); setSavInt(0); setFdInt(0); setOtherOS(0);
    setAdvTax(0); setSelfAss(0); setHP(null); setCG(null);
    setD80C(0); setD80D(0); setSel80C([]); setSelOther([]); setAisFlags([]);
    setShowInput(false); setInputVal(''); setUploadErr(null);
    setTimeout(() => addAI(<p>Ready to file another return?</p>, null), 400);
  }

  if (loadingReturn) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)', fontSize:14 }}>
      <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading...
    </div>
  );

  const itrBadge = taxProfile === 'salaried' ? 'ITR-1' : taxProfile === 'business' || taxProfile === 'freelancer' ? 'ITR-4' : taxProfile === 'partner' ? 'ITR-3' : 'ITR';

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
        <div style={{ marginLeft:'auto' }}><Badge variant="info"><FileText size={11}/> {itrBadge}</Badge></div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
        {messages.map(m => m.from==='ai' ? <AIBubble key={m.key}>{m.content}</AIBubble> : <UserBubble key={m.key}>{m.content}</UserBubble>)}
        {typing    && <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>T</div><TypingDots/></div>}
        {processing && <ProcessBubble msg={processing}/>}
        <div ref={bottomRef}/>
      </div>

      {/* Controls */}
      {!typing && !processing && (
        <div style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:16, flexShrink:0 }}>

          {/* Step 1: AIS upload */}
          {step === S.AIS_UPLOAD && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload AIS / Form 26AS" subLabel="PDF from incometax.gov.in" onFile={handleAISUpload} uploading={uploading} progress={uploadPct}/>
              {uploadError && <div style={{ display:'flex', gap:6, fontSize:12, color:'var(--danger)', alignItems:'center' }}><AlertCircle size={13}/>{uploadError}</div>}
            </div>
          )}

          {/* AIS confirmed — show income options */}
          {step === S.AIS_CONFIRM && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser('Some details are different');
                addAI(<p style={{ marginBottom:8 }}>No problem — you can correct any figure in the final review screen. Shall we continue?</p>, null);
                setTimeout(confirmAIS, 1200);
              }}>Some details differ</Button>
              <Button variant="primary" style={{ flex:1, justifyContent:'center' }} onClick={confirmAIS}>Looks correct ✓</Button>
            </div>
          )}

          {/* Additional income not in AIS */}
          {step === S.INCOME_CONFIRM && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {EXTRA_INCOME_TYPES.map(t => (
                  <Chip key={t.id} label={t.label} selected={extraIncomeTypes.includes(t.id)} onClick={() => toggleExtra(t.id)}/>
                ))}
              </div>
              <Button variant="primary" onClick={confirmExtraIncome} disabled={extraIncomeTypes.length===0} style={{ alignSelf:"flex-end" }}>
                Continue <ChevronRight size={15}/>
              </Button>
            </div>
          )}

          {/* Form 16 */}
          {step === S.FORM16 && !showInput && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload Form 16" subLabel="PDF or clear photo" onFile={handleForm16Upload} uploading={uploading} progress={uploadPct}/>
              <button onClick={skipForm16} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                Skip — use AIS salary figures instead
              </button>
            </div>
          )}

          {/* Business type */}
          {step === S.BIZ_TYPE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {BIZ_TYPES.map(b => (
                <button key={b.id} onClick={() => setSelBizType(b.id)}
                  style={{ padding:'11px 16px', borderRadius:'var(--radius-md)', border:`1.5px solid ${selBizType===b.id?'var(--brand)':'var(--border-strong)'}`, background:selBizType===b.id?'var(--brand-light)':'var(--surface)', textAlign:'left', cursor:'pointer' }}>
                  <div style={{ fontWeight:600, fontSize:13, color:selBizType===b.id?'var(--brand)':'var(--text-primary)' }}>{b.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{b.sub}</div>
                </button>
              ))}
              <Button variant="primary" onClick={handleBizConfirm} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Presumptive business — confirm/override AIS turnover */}
          {step === S.BIZ_PRESUMPTIVE && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                ask(<p>Enter the correct <strong>total turnover / receipts</strong>:</p>, 'biz_turnover_confirm');
              }}>Actual figure is different</Button>
              <Button variant="primary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                const bizReceipts = (aisData?.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0);
                const rate = selBizType==='44ADA' ? 0.5 : 0.06;
                setBiz(Math.round(bizReceipts * rate));
                addUser('Yes, AIS figure is correct');
                proceedToDeductions();
              }}>Yes, AIS figure is correct</Button>
            </div>
          )}

          {/* Assisted — P&L and B/S uploads */}
          {step === S.BIZ_DOCS && !uploading && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload Profit & Loss Account" subLabel="FY 2025-26 P&L statement" onFile={handlePLUpload} uploading={uploading} progress={uploadPct}/>
              <UploadBtn label="Upload Balance Sheet" subLabel="As at 31 March 2026" onFile={handleBSUpload} uploading={uploading} progress={uploadPct}/>
            </div>
          )}

          {/* Deductions — 80C */}
          {step === S.DED_80C && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {DEDUCTION_OPTIONS.map(o => <Chip key={o.id} label={o.label} selected={sel80C.includes(o.id)} onClick={() => toggle80C(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={sel80C.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Deductions — other */}
          {step === S.DED_OTHER && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {OTHER_DED_OPTIONS.map(o => <Chip key={o.id} label={o.label} selected={selOther.includes(o.id)} onClick={() => toggleOtherDed(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherDed} disabled={selOther.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* HP type */}
          {step === S.HP_TYPE && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Self Occupied')}>Self-occupied</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Rented')}>Rented out</Button>
            </div>
          )}

          {/* Taxes confirm */}
          {step === S.TAXES_CONFIRM && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser('Need to update tax figures');
                ask(<p>Enter the correct <strong>total TDS deducted</strong> as per your records:</p>, 'tds_update');
                setInputCtx('tds_update');
              }}>Update figures</Button>
              <Button variant="primary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser('Tax figures are correct');
                computeAndShow();
              }}>Correct — continue ✓</Button>
            </div>
          )}

          {/* Amount input */}
          {showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', padding:'0 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
                <span style={{ fontWeight:600, color:'var(--text-muted)' }}>₹</span>
                <input type="number" placeholder="Enter amount" value={inputValue} onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && inputValue && handleAmount()} autoFocus
                  style={{ flex:1, fontSize:15, padding:'12px 0', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none' }}/>
              </div>
              <Button variant="primary" onClick={handleAmount} disabled={!inputValue}><Send size={15}/></Button>
            </div>
          )}

          {/* Done */}
          {step === S.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14}/> Start a new return
            </button>
          )}
        </div>
      )}
    </div>
  );
}
