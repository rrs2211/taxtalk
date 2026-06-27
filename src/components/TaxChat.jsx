import React, { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, ChevronRight, FileText, RotateCcw, Send, Loader, AlertCircle, Info } from 'lucide-react';
import { computeTax, formatINR, formatINRShort } from '../data/flow.js';
import { useTranslation, translate } from '../i18n.js';
import CGCollector from './CGCollector.jsx';
import HintPanel, { HintSummaryBar } from './HintPanel.jsx';
import { checkReturnCompleteness, hintsFor } from '../lib/completenessCheck.js';
import CGTransactionImporter from './CGTransactionImporter.jsx';
import { Button, Card, Badge } from './UI.jsx';
import { useReturn } from '../hooks/useReturn.js';
import { supabase, lockIdentity, getOrCreateReturn, loadConversation } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

// ── Steps ─────────────────────────────────────────────────────────────────────
const S = {
  // PAN collection — first time only, before anything else
  PAN_COLLECT: 'pan_collect',
  // Welcome — offer prev year ITR upload (optional)
  WELCOME: 'welcome',
  // Income type selection — ALL types (salary, business, freelancer, etc.)
  PROFILE_SELECT: 'profile_select',
  PREV_ITR: 'prev_itr',          // optional: upload last year ITR/computation
  // AIS — now optional
  AIS_UPLOAD: 'ais_upload',
  AIS_CONFIRM: 'ais_confirm',
  // Identity manual entry (when no AIS)
  MANUAL_IDENTITY: 'manual_identity',
  // Salaried
  FORM16: 'form16',
  // Business
  BIZ_TYPE: 'biz_type',
  BIZ_DOCS: 'biz_docs',
  BIZ_PRESUMPTIVE: 'biz_presumptive',
  // Other income confirmation
  INCOME_CONFIRM: 'income_confirm',
  OS_INCOME: 'os_income',
  HP_TYPE: 'hp_type', HP_RENT: 'hp_rent', HP_MUNI: 'hp_muni',
  CG_CONFIRM: 'cg_confirm',
  CG_COLLECT: 'cg_collect',         // CGCollector for manual entry
  CG_IMPORT: 'cg_import',           // NEW: import from broker report
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
    <div style={{ display:'flex', gap:10, alignItems:'flex-end', maxWidth:'88%' }}>
      <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>T</div>
      <div className="bubble-ai" style={{ animation:'fadeUp 0.3s ease' }}>{children}</div>
    </div>
  );
}
function UserBubble({ children }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div className="bubble-user" style={{ animation:'fadeUp 0.2s ease', lineHeight:1.5 }}>{children}</div>
    </div>
  );
}
function Chip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} className={`chip${selected?' active':''}`} style={{ fontSize:13 }}>
      {label}
    </button>
  );
}
function UploadBtn({ label, subLabel, onFile, uploading, progress, accept='.pdf,.jpg,.jpeg,.png' }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} style={{ display:'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <button onClick={() => ref.current.click()} disabled={uploading} className="upload-btn">
        {uploading
          ? <><Loader size={20} style={{ animation:'spin 1s linear infinite' }} /><span>Reading... {progress>0?`${progress}%`:''}</span></>
          : <><Upload size={22}/><span>{label}</span>{subLabel && <span style={{ fontSize:12, opacity:0.75, fontWeight:400 }}>{subLabel}</span>}</>
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

        <SH c="Capital gains"/>
        <div style={{ padding:'4px 0' }}>
          <CGCollector compact value={inp.capitalGains || { enabled:false }}
            onChange={cg => setInp(p => ({...p, capitalGains: cg}))} />
        </div>

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

      {/* Bank account — required for refund and ITR filing */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:!(inp.bankAccounts||[]).some(b=>b.BankAccountNo&&b.IFSCCode)?"var(--danger)":"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Bank account for refund {!(inp.bankAccounts||[]).some(b=>b.BankAccountNo&&b.IFSCCode) && <span>⚠️ Required</span>}</div>
        {(inp.bankAccounts||[{IFSCCode:"",BankAccountNo:"",BankName:"",UseForRefund:"Y"}]).map((b,i)=>(
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, padding:"8px 12px", background:"var(--surface-2)", borderRadius:8, marginBottom:6, border:(!b.BankAccountNo||!b.IFSCCode)?"1.5px solid var(--danger)":"1px solid var(--border)" }}>
            <div><div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:3 }}>Account number *</div>
              <input value={b.BankAccountNo||""} onChange={e=>setInp(p=>({...p,bankAccounts:(p.bankAccounts||[{}]).map((x,j)=>j===i?{...x,BankAccountNo:e.target.value}:x)}))} placeholder="Account number" style={{ width:"100%", padding:"7px 10px", border:"1px solid var(--border-strong)", borderRadius:6, fontSize:13, outline:"none", boxSizing:"border-box" }}/></div>
            <div><div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:3 }}>IFSC code *</div>
              <input value={b.IFSCCode||""} onChange={e=>setInp(p=>({...p,bankAccounts:(p.bankAccounts||[{}]).map((x,j)=>j===i?{...x,IFSCCode:e.target.value.toUpperCase()}:x)}))} placeholder="SBIN0001234" style={{ width:"100%", padding:"7px 10px", border:"1px solid var(--border-strong)", borderRadius:6, fontSize:13, outline:"none", boxSizing:"border-box" }}/></div>
          </div>
        ))}
        {(!(inp.bankAccounts)||inp.bankAccounts.length===0) && (
          <button onClick={()=>setInp(p=>({...p,bankAccounts:[{IFSCCode:"",BankAccountNo:"",BankName:"",UseForRefund:"Y"}]}))} style={{ width:"100%", padding:"9px", border:"2px dashed var(--danger)", borderRadius:8, background:"var(--danger-light)", color:"var(--danger)", fontSize:13, cursor:"pointer" }}>+ Add bank account (required for refund and filing)</button>
        )}
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

      {/* Completeness hints at the moment of submission */}
      {(() => {
        const { hints: subHints } = checkReturnCompleteness(
          { ...comp, betterRegime: regime, bankAccounts: inp.bankAccounts || [],
            deductions80D: comp.cap80D, deductions80G: comp.cap80G, deductions80C: comp.cap80C,
            houseProperty: comp.houseProperty, capitalGains: comp.capitalGains },
          {},
          'ITR-1',
          [],
          []
        );
        const clientHints = hintsFor(subHints, 'client').filter(h => h.severity === 'block');
        return clientHints.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <HintPanel hints={clientHints} score={null} audience="client" collapsible={false} defaultOpen={true} />
          </div>
        ) : null;
      })()}
      <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => onApprove({...comp, betterRegime:regime, chosenTax:selTax, balanceDue:balance, refund})} disabled={submitting}>
        {submitting ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Submitting…</> : <><CheckCircle size={15}/> {lang==='hi'?'पुष्टि करें और CA को भेजें':lang==='gu'?'CA ને મોકલો':'Confirm & send to CA for review'}</>}
      </Button>
      <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:8 }}>Your CA at RB Shah & Associates will verify and file</p>
    </Card>
  );
}



// ─── PAN Validation ──────────────────────────────────────────────────────────
// PAN format: AAAAA9999A — 5 letters, 4 digits, 1 letter (10 chars total)
// 4th character = entity type:
//   P = Individual (Person)       C = Company        H = HUF
//   F = Firm                      A = AOP/BOI        T = Trust
//   B = Body of Individuals        J = Artificial juridical person
//   G = Government                L = Local authority

const PAN_ENTITY_CHARS = {
  P: 'Individual (Person)',
  C: 'Company',
  H: 'HUF (Hindu Undivided Family)',
  F: 'Firm / Partnership',
  A: 'AOP / BOI',
  T: 'Trust',
  B: 'Body of Individuals',
  J: 'Artificial Juridical Person',
  G: 'Government',
  L: 'Local Authority',
};
const PAN_REGEX = /^[A-Z]{3}[PCHFATBJGL][A-Z]\d{4}[A-Z]$/;

export function validatePAN(pan) {
  if (!pan || typeof pan !== 'string') return { valid: false, error: 'PAN is required' };
  const p = pan.trim().toUpperCase();
  if (p.length !== 10) return { valid: false, error: `PAN must be exactly 10 characters (entered: ${p.length})` };
  if (!/^[A-Z]{5}/.test(p)) return { valid: false, error: 'First 5 characters of PAN must be letters' };
  if (!/\d{4}/.test(p.slice(5,9))) return { valid: false, error: 'Characters 6–9 must be digits' };
  if (!/[A-Z]$/.test(p)) return { valid: false, error: 'Last character must be a letter' };
  const entityChar = p[3];
  if (!PAN_ENTITY_CHARS[entityChar]) return { valid: false, error: `4th character "${entityChar}" is not a valid entity type` };
  return { valid: true, pan: p, entityType: PAN_ENTITY_CHARS[entityChar] };
}

// ─── Unified input bar ────────────────────────────────────────────────────────
// Combines: structured amount entry, free-text chat, and document upload
// All in ONE bar so there's never two inputs on screen simultaneously

const DOC_TYPES = [
  { type: 'ais',           label: 'AIS / 26AS',   icon: '📄' },
  { type: 'form16',        label: 'Form 16',       icon: '🧾' },
  { type: 'balance_sheet', label: 'Balance Sheet', icon: '📊' },
  { type: 'pl_statement',  label: 'P&L',           icon: '📈' },
  { type: 'supporting_doc',label: 'Other',         icon: '📎' },
];

function UnifiedInput({
  showInput, isTextInput, inputCtx, inputValue, setInputVal, handleAmount,
  freeText, setFreeText, handleFreeChat, chatLoading, lang,
  returnId, getReturnId, uploading, uploadPct, setUploading, setUploadPct,
  addAI, setTds, setAdvTax, formatINR, done,
  supabase, uploadDocument, setProcessing,
}) {
  const [showDocs, setShowDocs] = React.useState(false);
  const [showHints, setShowHints] = React.useState(true);
  const fileRefs = React.useRef({});

  if (done) return null;

  // When showInput, the chatbox takes the amount input role
  const isAmountMode = showInput;
  const placeholder = isAmountMode
    ? (isTextInput
        ? (lang==='hi' ? 'यहाँ लिखें...' : lang==='gu' ? 'અહીં લખો...' : 'Type here...')
        : (lang==='hi' ? '₹ राशि लिखें...' : lang==='gu' ? '₹ રકમ લખો...' : '₹ Enter amount...'))
    : (lang==='hi' ? 'salary, TDS, deductions, capital gains — सब एक साथ लिखें...'
     : lang==='gu' ? 'salary, TDS, deductions, capital gains — બધું એકસાથે લખો...'
     : 'Type anything — salary, TDS, deductions, capital gains...');

  const currentValue = isAmountMode ? inputValue : freeText;

  function handleChange(e) {
    if (isAmountMode) setInputVal(e.target.value);
    else setFreeText(e.target.value);
  }

  function handleSend() {
    if (isAmountMode) { if (inputValue) handleAmount(); }
    else { if (freeText.trim()) handleFreeChat(); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleDocUpload(file, docType) {
    setUploading(true); setShowDocs(false);
    try {
      const rid = (getReturnId ? await getReturnId() : returnId);
      if (!rid) { addAI(<p style={{ color:'var(--danger)' }}>Start the filing process first, then upload your document.</p>, null); setUploading(false); return; }
      const doc = await uploadDocument(file, rid, docType, p => setUploadPct(p));
      addAI(<p>✅ Document received — <strong>{file.name}</strong>. Reading it now...</p>, null);
      if (docType === 'ais' || docType === 'form16' || docType === 'balance_sheet' || docType === 'pl_statement') {
        setProcessing('Reading document...');
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ documentId: doc.id }),
        });
        const { extracted } = await res.json();
        setProcessing(null);
        if (extracted) {
          // ── PAN mismatch check ─────────────────────────────────────────────
          const profilePAN  = (profile?.pan || manualPAN || '').toUpperCase();
          const extractedPAN = (extracted.pan || '').toUpperCase();
          if (extractedPAN && profilePAN && extractedPAN !== profilePAN) {
            addAI(
              <div style={{ background:'var(--warn-light)', border:'1px solid var(--warn)', borderRadius:8, padding:'10px 14px' }}>
                <p style={{ fontWeight:600, color:'var(--warn)', marginBottom:6 }}>⚠️ PAN mismatch detected</p>
                <p style={{ fontSize:13 }}>This document belongs to PAN <strong>{extractedPAN}</strong>, but your account PAN is <strong>{profilePAN}</strong>.</p>
                <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:6 }}>This document appears to be for a <strong>different person</strong>. Please confirm below.</p>
              </div>, null
            );
            // Show confirmation buttons — these appear in the structured controls
            // We use a special step to show confirm/reject buttons
            setInputCtx('pan_mismatch_confirm_' + doc.id);
            setTimeout(() => {
              addAI(<p>Is this document yours (you may have multiple PANs or a correction)?</p>, null);
            }, 600);
            return; // Don't apply data until confirmed
          }
          // ── Apply extracted data ───────────────────────────────────────────
          const updates = [];
          if (extracted.total_tds > 0)         { setTds(extracted.total_tds); updates.push(`TDS: ${formatINR(extracted.total_tds)}`); }
          if (extracted.total_advance_tax > 0) { setAdvTax(extracted.total_advance_tax); updates.push(`Advance tax: ${formatINR(extracted.total_advance_tax)}`); }
          if (extracted.gross_salary > 0)       updates.push(`Salary: ${formatINR(extracted.gross_salary)}`);
          const summary = updates.length > 0 ? updates.join(' · ') : 'Data extracted';
          addAI(<p>✅ <strong>{docType === 'ais' ? 'AIS' : docType === 'form16' ? 'Form 16' : 'Document'}</strong> read — {summary}. All figures updated.</p>, null);
        }
      } else {
        addAI(<p>✅ Document saved. Your CA will review it along with your return.</p>, null);
      }
    } catch(e) {
      setProcessing(null);
      addAI(<p style={{ color:'var(--danger)' }}>Upload failed: {e.message}</p>, null);
    } finally { setUploading(false); setUploadPct(0); }
  }

  const canSend = isAmountMode ? !!inputValue : (!!freeText.trim() && !chatLoading);
  const inputType = isAmountMode && !isTextInput ? 'number' : 'text';
  const inputMode = isAmountMode && !isTextInput ? 'numeric' : 'text';

  const examples = [
    lang==='hi' ? 'salary 8 lakh, TDS 50K, PPF 1.5L' :
    lang==='gu' ? 'salary 8 lakh, TDS 50K, PPF 1.5L' :
    'salary 8 lakh, TDS 50K, PPF 1.5L',

    lang==='hi' ? 'FD interest 45000, mediclaim 20000' :
    lang==='gu' ? 'FD interest 45000, mediclaim 20000' :
    'FD interest 45K, mediclaim 20K',
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

      {/* Doc upload panel — slides in above the input */}
      {showDocs && (
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', padding:'10px 12px', marginBottom:6, animation:'fadeUp 0.18s ease' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            {lang==='hi' ? 'दस्तावेज़ अपलोड करें' : lang==='gu' ? 'દસ્તાવેજ અપલોડ કરો' : 'Upload document'}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {DOC_TYPES.map(d => {
              if (!fileRefs.current[d.type]) fileRefs.current[d.type] = React.createRef();
              return (
                <div key={d.type}>
                  <input type="file" ref={fileRefs.current[d.type]} accept=".pdf,.jpg,.jpeg,.png,.csv"
                    style={{ display:'none' }}
                    onChange={e => { const f = e.target.files[0]; if (f) handleDocUpload(f, d.type); e.target.value=''; }}
                  />
                  <button onClick={() => fileRefs.current[d.type].current?.click()}
                    disabled={uploading}
                    style={{ padding:'6px 12px', borderRadius:20, border:'1px solid var(--border-strong)', background:'var(--surface)', fontSize:12, cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:4, minHeight:34 }}>
                    <span>{d.icon}</span> {d.label}
                  </button>
                </div>
              );
            })}
          </div>
          {uploading && (
            <div style={{ marginTop:8, fontSize:12, color:'var(--brand)', display:'flex', alignItems:'center', gap:6 }}>
              <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> Uploading{uploadPct > 0 ? ` ${uploadPct}%` : '...'}
            </div>
          )}
        </div>
      )}

      {/* Main input box */}
      <div style={{
        display:'flex', alignItems:'stretch',
        border:`1.5px solid ${isAmountMode ? 'var(--warn)' : 'var(--brand)'}`,
        borderRadius:'var(--radius-md)',
        background:'var(--surface)',
        overflow:'hidden',
        boxShadow: isAmountMode ? '0 0 0 3px var(--warn-light)' : '0 0 0 3px var(--brand-light)',
        transition:'border-color 0.2s, box-shadow 0.2s',
      }}>
        {/* Upload button */}
        <button
          onClick={() => setShowDocs(d => !d)}
          title={lang==='hi' ? 'दस्तावेज़ अपलोड' : lang==='gu' ? 'ડૉક્યુમેન્ટ' : 'Upload document'}
          style={{ padding:'0 12px', background:'transparent', border:'none', borderRight:`1px solid ${isAmountMode ? '#fde68a' : 'var(--border)'}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color: showDocs ? 'var(--brand)' : 'var(--text-muted)', flexShrink:0 }}>
          <Upload size={17}/>
        </button>

        {/* Amount prefix for number mode */}
        {isAmountMode && !isTextInput && (
          <div style={{ padding:'0 6px 0 2px', display:'flex', alignItems:'center', color:'var(--warn)', fontWeight:700, fontSize:16, flexShrink:0 }}>₹</div>
        )}

        {/* The input */}
        <input
          type={inputType}
          inputMode={inputMode}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={isAmountMode}
          style={{ flex:1, fontSize:15, padding:'14px 10px', background:'transparent', color:'var(--text-primary)', border:'none', outline:'none', minWidth:0 }}
        />

        {/* Loading indicator */}
        {chatLoading && !isAmountMode && (
          <div style={{ padding:'0 10px', display:'flex', alignItems:'center', flexShrink:0 }}>
            <Loader size={15} style={{ animation:'spin 1s linear infinite', color:'var(--brand)' }}/>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{ padding:'0 16px', background: canSend ? (isAmountMode ? 'var(--warn)' : 'var(--brand)') : 'var(--surface-3)', color: canSend ? '#fff' : 'var(--text-muted)', border:'none', borderLeft:`1px solid ${isAmountMode ? '#fde68a' : 'var(--border)'}`, cursor: canSend ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s' }}>
          <Send size={16}/>
        </button>
      </div>

      {/* Context label — shows what the input is expecting */}
      {isAmountMode && (
        <div style={{ fontSize:11, color:'var(--warn)', fontWeight:500, marginTop:4, paddingLeft:2 }}>
          {lang==='hi' ? '↑ राशि दर्ज करें और ↵ दबाएं' : lang==='gu' ? '↑ રકમ દાખલ કરો અને ↵ દબાવો' : '↑ Enter the amount above and press ↵ or tap →'}
        </div>
      )}

      {/* Example hints — only in free chat mode */}
      {!isAmountMode && showHints && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, color:'var(--text-muted)', flexShrink:0 }}>
            {lang==='hi' ? '💡' : lang==='gu' ? '💡' : '💡'}
          </span>
          {examples.map((ex, i) => (
            <button key={i} onClick={() => { setFreeText(ex); setShowHints(false); }}
              style={{ fontSize:10, color:'var(--brand)', background:'var(--brand-light)', border:'none', borderRadius:20, padding:'3px 8px', cursor:'pointer', whiteSpace:'nowrap' }}>
              {ex}
            </button>
          ))}
          <button onClick={() => setShowHints(false)} style={{ fontSize:10, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:0, marginLeft:'auto', flexShrink:0 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── Main TaxChat ──────────────────────────────────────────────────────────────
export default function TaxChat({ userId, lang: langProp, profile: initialProfile, onProfileUpdate }) {
  const { returnRecord, loadingReturn, saveComputation, persistMessage, submitToCA } = useReturn(userId);
  const [chatRestoreState, setChatRestoreState] = useState('loading'); // 'loading'|'ask'|'fresh'|'restored'
  const [savedMessages, setSavedMessages] = useState([]); // raw DB rows for restore

  // Safe returnId getter — waits up to 5s for returnRecord to load if null at upload time
  const getReturnId = React.useCallback(async () => {
    if (returnRecord?.id) return returnRecord.id;
    const rec = await Promise.race([
      getOrCreateReturn(userId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Return not ready. Please refresh and try again.')), 5000)),
    ]);
    return rec.id;
  }, [returnRecord, userId]);
  const { lang, t: tr }   = useTranslation();

  // Convenience: translate with current lang
  const T = (key, vars) => translate(key, lang, vars);

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
  const [isTextInput, setIsTextInput] = useState(false);  // true = text, false = number
  const [inputValue, setInputVal]   = useState('');
  const [inputCtx, setInputCtx]     = useState('');

  // HP queue position stored in ref to avoid stale closure
  const hpQueueIdx = useRef(0);

  // Previous year ITR extracted data
  const [prevItrData, setPrevItrData]   = useState(null);
  // Persistent floating doc upload
  const [showDocTray, setShowDocTray]   = useState(false);
  const [showStructured, setShowStructured] = useState(false); // toggle structured form vs chat
  // Manual identity (when no AIS)
  const [profile,      setProfile]       = useState(initialProfile || null);
  const [manualName,  setManualName]    = useState('');
  const [panError,    setPanError]      = useState('');
  const [manualPAN,   setManualPAN]     = useState('');
  const [manualDOB,   setManualDOB]     = useState('');
  const [manualPhone, setManualPhone]   = useState('');

  const bottomRef     = useRef(null);

  // Free-text chat (always available alongside structured flow)
  const [freeText,    setFreeText]    = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ── On returnRecord load: check for existing conversation ──────────────────
  useEffect(() => {
    if (loadingReturn || !returnRecord?.id) return;
    (async () => {
      try {
        const rows = await loadConversation(returnRecord.id);
        if (rows && rows.length > 3) {
          setSavedMessages(rows);
          setChatRestoreState('ask');
        } else {
          setChatRestoreState('fresh');
        }
      } catch {
        setChatRestoreState('fresh');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingReturn, returnRecord?.id]);

  // ── Restore previous conversation messages ──────────────────────────────────
  function doRestoreChat() {
    const restored = savedMessages.map((row, i) => ({
      from: row.role === 'user' ? 'user' : 'ai',
      content: row.content || '',
      key: row.id || i,
    }));
    setMessages(restored);
    setChatRestoreState('restored');
    // Restore step from DB if available
    if (returnRecord?.extracted_data?.__step) {
      setStep(returnRecord.extracted_data.__step);
    } else {
      setStep(S.WELCOME);
    }
  }

  // ── When restoreState becomes 'fresh': show normal welcome ──────────────────
  useEffect(() => {
    if (chatRestoreState !== 'fresh') return;
    const t = setTimeout(() => {
      const wLang = localStorage.getItem('taxtalk_lang') || 'en';
      const W = (k) => translate(k, wLang);
      const prof = profile || initialProfile;

      // If PAN/name/DOB not yet in profile — collect FIRST before anything else
      if (!prof?.kyc_complete && (!prof?.pan || !prof?.full_name || !prof?.dob)) {
        setStep(S.PAN_COLLECT);
        addAI(
          <>
            <p style={{ marginBottom:8 }}>{W('chat.welcome_1')}</p>
            <p style={{ marginBottom:8 }}>
              {wLang==='hi' ? 'शुरू करने से पहले, मुझे आपका PAN Card विवरण चाहिए।' :
               wLang==='gu' ? 'શરૂ કરતા પહેલાં, મને તમારી PAN Card ની વિગત જોઈએ.' :
               'Before we begin, I need your PAN Card details. This identifies you and cannot be changed later.'}
            </p>
          </>, null
        );
        setTimeout(() => {
          ask(
            wLang==='hi'
              ? <p>आपका <strong>पूरा नाम</strong> (PAN Card के अनुसार)?</p>
              : wLang==='gu'
              ? <p>તમારું <strong>પૂરું નામ</strong> (PAN Card પ્રમાણે)?</p>
              : <p>What is your <strong>full name</strong> as on your PAN card?</p>,
            'pan_collect_name', true
          );
        }, 800);
        return;
      }

      // Identity is known — proceed to normal welcome
      setStep(S.WELCOME);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>{W('chat.welcome_1')}</p>
          <p style={{ marginBottom:8 }}>{W('chat.welcome_2')}</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>{W('chat.welcome_3')}</p>
        </>, null
      );
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRestoreState, profile?.pan, profile?.kyc_complete]);

  // ── Previous year ITR upload ────────────────────────────────────────────────
  async function handlePrevItrUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0);
    addUser('Uploading previous year ITR / computation...');
    try {
      const rid = await getReturnId();
      const doc = await uploadDocument(file, rid, 'supporting_doc', p => setUploadPct(p));
      setUploading(false);
      setProcessing('Reading previous year ITR...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const { extracted } = await res.json();
      setProcessing(null);
      setPrevItrData(extracted);
      // Pre-fill identity from old ITR
      if (extracted.pan) setManualPAN(extracted.pan);
      if (extracted.name) setManualName(extracted.name);
      if (extracted.dob) setManualDOB(extracted.dob);
      if (extracted.mobile) setManualPhone(extracted.mobile);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>✨ Details found in your previous year ITR:</p>
          <div style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {extracted.pan   && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>PAN</span><strong>{extracted.pan}</strong></div>}
            {extracted.name  && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Name</span><strong>{extracted.name}</strong></div>}
            {extracted.bank_account && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px' }}><span style={{ color:'var(--text-muted)' }}>Bank account</span><strong>{extracted.bank_account}</strong></div>}
          </div>
        </>, () => goToAISStep()
      );
    } catch(e) {
      setUploading(false); setProcessing(null);
      addAI(<p>⚠️ Could not read that file. No problem — let us continue without it.</p>, () => goToAISStep());
    }
  }

  function goToAISStep() {
    setStep(S.AIS_UPLOAD);
    addAI(
      <>
        <p style={{ marginBottom:8 }}>Now, let us get your AIS. This pre-fills all income and TDS details automatically.</p>
        <p style={{ marginBottom:8 }}>Upload your <strong>AIS / Form 26AS</strong> from incometax.gov.in, or skip and enter details manually.</p>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>Download: incometax.gov.in → AIS tab → Export PDF</p>
      </>, null
    );
  }

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
  function ask(jsxContent, ctx, textMode=false) {
    addAI(jsxContent, () => { setInputVal(''); setInputCtx(ctx); setIsTextInput(textMode); setShowInput(true); });
  }

  // ── Freeform chat handler ──────────────────────────────────────────────────
  async function handleFreeChat() {
    if (!freeText.trim()) return;
    const text = freeText.trim();
    setFreeText('');
    addUser(text);
    setChatLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          message: text,
          lang: langProp || lang || localStorage.getItem('taxtalk_lang') || 'en',
          state: {
            step, profile: taxProfile,
            grossSalary, businessIncome, bizTurnover,
            savingsInterest, fdInterest, dividendIncome,
            tds, advanceTax, selfAssessment: selfAssess,
            deductions80C, deductions80D, ageGroup,
          },
        }),
      });
      const parsed = await res.json();
      setChatLoading(false);

      const ext = parsed?.extracted || {};
      let updates = [];

      // Apply extracted values — handles both camelCase (/api/chat) and snake_case (legacy)
      const gs = ext.grossSalary || ext.gross_salary;
      const td = ext.tds || ext.tds_deducted;
      const at = ext.advanceTax || ext.advance_tax;
      const sa = ext.selfAssessment || ext.self_assessment_tax;
      const si = ext.savingsInterest || ext.savings_interest;
      const fi = ext.fdInterest || ext.fd_interest;
      const di = ext.dividendIncome || ext.dividend_income;
      const bi = ext.businessIncome || ext.business_income;
      const d80c = ext.deductions80C || ext.deductions_80c;
      const d80d = ext.deductions80D || ext.deductions_80d;
      const prof = ext.profile;
      const ag = ext.ageGroup;

      if (gs)   { setGross(gs);   setTaxProfile(p => p || 'salaried'); updates.push(`Salary: ${formatINR(gs)}`); }
      if (td)   { setTds(td);     updates.push(`TDS: ${formatINR(td)}`); }
      if (at)   { setAdvTax(at);  updates.push(`Advance tax: ${formatINR(at)}`); }
      if (sa)   { setSelfAss(sa); updates.push(`Self-assessment tax: ${formatINR(sa)}`); }
      if (si)   { setSavInt(si);  setInt(x => x + si); updates.push(`Savings interest: ${formatINR(si)}`); }
      if (fi)   { setFdInt(fi);   setInt(x => x + fi); updates.push(`FD interest: ${formatINR(fi)}`); }
      if (di)   { setDiv(di);     updates.push(`Dividends: ${formatINR(di)}`); }
      if (bi)   { setBiz(bi);     setTaxProfile(p => p || 'business'); updates.push(`Business income: ${formatINR(bi)}`); }
      if (d80c) { setD80C(d80c);  updates.push(`80C: ${formatINR(d80c)}`); }
      if (d80d) { setD80D(d80d);  updates.push(`Mediclaim: ${formatINR(d80d)}`); }
      if (prof) { setTaxProfile(prof); }
      if (ag)   { setAgeGroup(ag); }

      // Build response message
      const confirmed = parsed.understood_message || '';
      const followUps = parsed.follow_up_questions || [];

      addAI(
        <>
          {updates.length > 0 && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--brand)', marginBottom:4 }}>
                {parsed.language === 'gu' ? 'સ​મ​જ​યો:' : parsed.language === 'hi' ? 'समझा:' : 'Understood:'}
              </div>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', fontSize:13 }}>
                {updates.map((u,i) => (
                  <div key={i} style={{ padding:'6px 10px', borderBottom: i<updates.length-1?'1px solid var(--border)':'none', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'var(--text-secondary)' }}>{u.split(':')[0]}</span>
                    <span style={{ fontWeight:600, color:'var(--brand)' }}>{u.split(':').slice(1).join(':')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {followUps.length > 0 && (
            <div>
              {followUps.map((q, i) => <p key={i} style={{ marginBottom: i<followUps.length-1?6:0 }}>{q}</p>)}
            </div>
          )}
          {updates.length === 0 && !followUps.length && (
            <p>{parsed.language === 'gu' ? 'xyamā māhitī mēḷwī ṣakyō nathī. nīcē wIgat dasro.' : parsed.language === 'hi' ? 'जानकारी नहीं मिली। नीचे विवरण दें।' : 'Could not extract specific figures. Please use the steps below or be more specific.'}</p>
          )}
        </>, null
      );
    } catch(e) {
      setChatLoading(false);
      addAI(<p>Could not process your message. Please try again.</p>, null);
    }
  }

  // ── AIS Upload & Parse ──────────────────────────────────────────────────────
  async function handleAISUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0); setUploadErr(null);
    addUser(`Uploaded: ${file.name}`);
    try {
      const rid = await getReturnId();
      const doc = await uploadDocument(file, rid, 'ais', p => setUploadPct(p));
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
      // Store full sale/purchase details from AIS for accurate JSON generation
      if (stcg111a||ltcg112a||ltcgProp) {
        const aisCG = c.capitalGains?.shares ? c.capitalGains : {};
        const stcgEntry = (ais.capital_gains||[]).filter(x=>x.section==='111A');
        const ltcgEntry = (ais.capital_gains||[]).filter(x=>x.section==='112A');
        const propEntry = (ais.capital_gains||[]).filter(x=>x.asset_type==='property');
        setCG({
          enabled: true,
          shares: {
            stcg: stcgEntry.length > 0 ? {
              saleValue:    stcgEntry.reduce((s,x)=>s+(x.sale_value||0),0),
              purchaseCost: stcgEntry.reduce((s,x)=>s+(x.purchase_value||0),0),
              expenses:     0,
              gain:         stcg111a,
            } : stcg111a,
            ltcg: ltcgEntry.length > 0 ? {
              saleValue:    ltcgEntry.reduce((s,x)=>s+(x.sale_value||0),0),
              purchaseCost: ltcgEntry.reduce((s,x)=>s+(x.purchase_value||0),0),
              fmv31Jan18:   ltcgEntry.reduce((s,x)=>s+(x.purchase_value||0),0), // AIS uses purchase as FMV
              expenses:     0,
              gain:         ltcg112a,
            } : ltcg112a,
          },
          property: {
            ltcg: propEntry.length > 0 ? {
              saleValue:   propEntry.reduce((s,x)=>s+(x.sale_value||0),0),
              indexedCost: propEntry.reduce((s,x)=>s+(x.purchase_value||0),0),
              expenses:    0,
              gain:        ltcgProp,
            } : ltcgProp,
          },
        });
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
    if (has.includes('business') && taxProfile!=='business') {
      setTaxProfile('mixed'); setStep(S.BIZ_TYPE); addAI(<p>What type of business income do you have?</p>, null);
    } else if (has.includes('cg')) {
      // CG not pre-filled from AIS — collect manually
      setStep(S.CG_COLLECT);
      addAI(
        <>
          <p style={{ marginBottom:8 }}>Let us record your <strong>capital gains</strong> for the year.</p>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>You will need your broker's P&L statement or annual tax report (Zerodha Tax P&L, Groww Tax Report, etc.) for accurate figures. Enter sale proceeds and purchase cost separately — the ITR requires both.</p>
        </>, null
      );
    } else if (has.includes('hp')) {
      setStep(S.HP_TYPE); addAI(<p>Is your property <strong>self-occupied</strong> or <strong>rented out</strong>?</p>, null);
    } else { routeToNextStep(); }
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
      const rid = await getReturnId();
      const doc = await uploadDocument(file, rid, 'form16', p => setUploadPct(p));
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

  function skipAIS() {
    addUser("I don't have my AIS right now");
    setStep(S.MANUAL_IDENTITY);
    addAI(
      <p style={{ marginBottom:8 }}>No problem. Let me ask you a few questions to get started. You can always upload your AIS later from the <strong>My Returns</strong> tab.</p>,
      null
    );
    setTimeout(() => {
      ask(<p>What is your <strong>full name</strong> (as on PAN card)?</p>, 'manual_name', true);
    }, 800);
  }

  // ── Primary income type (first question) ─────────────────────────────────────
  const INCOME_TYPES = [
    { id:'salaried',   label: lang==='hi' ? 'नौकरी / वेतन'      : lang==='gu' ? 'નોકરી / પગાર'      : 'Salaried — Job / Employment',           sub: lang==='hi' ? 'Form 16, TDS deduction' : lang==='gu' ? 'Form 16, TDS કપાત' : 'Salary income · Form 16 · TDS deducted by employer' },
    { id:'business',   label: lang==='hi' ? 'व्यापार / दुकान'    : lang==='gu' ? 'વ્યવસાય / દુકાન'    : 'Business / Shop (Sec 44AD)',             sub: lang==='hi' ? 'कारोबार ₹3 Cr तक · अनुमानित आय' : lang==='gu' ? 'ટર્નઓવર ₹3 Cr સુધી · અનુમાનિત આવક' : 'Turnover ≤ ₹3 Cr · Presumptive income @ 6%/8%' },
    { id:'freelancer', label: lang==='hi' ? 'फ्रीलांसर / पेशेवर' : lang==='gu' ? 'ફ્રીલાન્સર / વ્યાવસાયિક' : 'Professional / Freelancer (Sec 44ADA)', sub: lang==='hi' ? 'CA, डॉक्टर, वकील आदि · प्राप्तियां ₹75L तक' : lang==='gu' ? 'CA, ડૉક્ટર, વકીલ · ₹75L સુધી' : 'CA, Doctor, Lawyer, Consultant · Receipts ≤ ₹75L · 50% income' },
    { id:'partner',    label: lang==='hi' ? 'फर्म में साझेदार'  : lang==='gu' ? 'ફર્મ ભાગીદાર'     : 'Partner in a Firm (ITR-3)',               sub: lang==='hi' ? 'ITR-3 · CA तैयार करेगा' : lang==='gu' ? 'ITR-3 · CA ભરશે' : 'Partnership firm share · CA will handle ITR-3' },
    { id:'investor',   label: lang==='hi' ? 'निवेशक / FD / किराया': lang==='gu' ? 'રોકાણ / FD / ભાડું' : 'Investor / FD / Rental only (ITR-1/2)', sub: lang==='hi' ? 'वेतन नहीं · केवल ब्याज, लाभांश, किराया, CG' : lang==='gu' ? 'પગાર નહીં · ફક્ત FD, ભાડું, CG' : 'No salary or business · Interest, dividends, rent, capital gains' },
  ];
  const [selIncomeType, setSelIncomeType] = useState('salaried');

  // ── Business sub-type ─────────────────────────────────────────────────────
  const BIZ_TYPES = [
    { id:'44AD',   label:'Presumptive — Business (Sec 44AD)',    sub:'Turnover ≤ ₹3 Cr · 6%/8% of turnover · No books needed' },
    { id:'44ADA',  label:'Presumptive — Professional (Sec 44ADA)',sub:'Receipts ≤ ₹75L · 50% of receipts · No books needed' },
    { id:'actual', label:'Actual profit — books of accounts',    sub:'Upload P&L and Balance Sheet · CA handles disallowances' },
  ];
  // Freeform chat
  const [selBizType,  setSelBizType]  = useState('44AD');
  const [bizTurnover, setBizTurnover] = useState(0);       // raw turnover
  const [bizCashPct,  setBizCashPct]  = useState(0);       // % cash turnover (for 44AD 8% calc)
  const [bizName,     setBizNameState]= useState('');       // for ScheduleBP NatOfBus
  const [bizCodeAD,   setBizCodeAD]   = useState('09028'); // default: retail sale of other products
  // Balance sheet items (required for FinanclPartclrOfBusiness)
  const [bsCapital,   setBsCapital]   = useState(0);
  const [bsBank,      setBsBank]      = useState(0);
  const [bsDebtors,   setBsDebtors]   = useState(0);
  const [bsCreditors, setBsCreditors] = useState(0);
  const [bsCash,      setBsCash]      = useState(0);

  function handleIncomeTypeConfirm() {
    const sel = INCOME_TYPES.find(t => t.id === selIncomeType);
    addUser(sel?.label || selIncomeType);
    if (selIncomeType === 'salaried') {
      setTaxProfile('salaried');
      setStep(S.FORM16);
      const wLang = lang || 'en';
      addAI(
        <>
          <p style={{ marginBottom:8 }}>
            {wLang==='hi' ? 'आपका Form 16 अपलोड करें — यह TDS और वेतन विवरण के साथ आता है।'
            : wLang==='gu' ? 'Form 16 અપલોડ કરો — TDS અને પગારની વિગત સાથે.'
            : 'Please upload your Form 16 — it comes from your employer and contains TDS and salary details.'}
          </p>
          <p style={{ fontSize:12, color:'var(--text-muted)' }}>
            {wLang==='hi' ? 'आपका नियोक्ता मार्च या अप्रैल में यह देता है।'
            : wLang==='gu' ? 'તમારા એમ્પ્લોયર તરફથી માર્ચ-એપ્રિલ મળે.'
            : 'Provided by your employer, usually in March or April.'}
          </p>
        </>, null
      );
    } else if (selIncomeType === 'investor') {
      setTaxProfile('salaried'); // ITR-1 path
      setStep(S.INCOME_CONFIRM);
      const wLang = lang || 'en';
      addAI(
        <p>
          {wLang==='hi' ? 'आपकी कोई अन्य आय है? ब्याज, लाभांश, किराया, पूंजी लाभ?'
          : wLang==='gu' ? 'કોઈ અન્ય આવક? FD વ્યાજ, ભાડું, CG?'
          : 'What types of income do you have? Select all that apply:'}
        </p>, null
      );
    } else if (selIncomeType === 'partner') {
      setTaxProfile('partner');
      setStep(S.DONE); // Partner — CA handles ITR-3
      addAI(
        <p>
          {lang==='hi' ? 'फर्म साझेदारों के लिए ITR-3 CA द्वारा तैयार किया जाएगा। कृपया अपने CA से संपर्क करें।'
          : lang==='gu' ? 'ભાગીદારી ફર્મ — ITR-3 CA તૈयार करशे.'
          : 'For partnership firm partners, ITR-3 is prepared by your CA. Please share your firm details with us. Your CA at RB Shah & Associates will handle this return.'}
        </p>, null
      );
    } else {
      // Business or freelancer — go to business sub-type selection
      setTaxProfile(selIncomeType);
      setStep(S.BIZ_TYPE);
      const wLang = lang || 'en';
      addAI(
        <p>
          {wLang==='hi' ? 'आप कौन सा विकल्प चुनना चाहते हैं?'
          : wLang==='gu' ? 'કઈ પ્રકારની ગણતરી?'
          : 'How is your business income calculated?'}
        </p>, null
      );
    }
  }

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

  // ── Business details: name, code, balance sheet items ──────────────────────
  function askBizDetails() {
    // Ask business/profession name for ScheduleBP NatOfBus
    ask(
      <>
        <p>What is the <strong>name of your business / profession</strong>?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>E.g. "CA Practice", "Trading", "Consulting", "Medical Clinic"</p>
      </>, 'biz_name', true
    );
  }

  // ── P&L / B/S upload (assisted) ────────────────────────────────────────────
  async function handlePLUpload(file) {
    const err = validateFile(file);
    if (err) { addAI(<p style={{ color:'var(--danger)' }}>⚠️ {err}</p>, null); return; }
    setUploading(true); setUploadPct(0);
    addUser(`Uploaded P&L: ${file.name}`);
    try {
      const rid = await getReturnId();
      const doc = await uploadDocument(file, rid, 'pl_statement', p => setUploadPct(p));
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
      const rid = await getReturnId();
      const doc = await uploadDocument(file, rid, 'balance_sheet', p => setUploadPct(p));
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

  function proceedToBalanceSheet() {
    ask(
      <>
        <p>A few quick balance sheet items are required for the ITR-4 filing.</p>
        <p style={{ marginTop:4, fontSize:13 }}>What was your <strong>own capital / net worth</strong> in the business as on 31 March 2026?</p>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>This is opening capital + profits - drawings. Enter your best estimate.</p>
      </>, 'bs_capital'
    );
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
  async function handleAmount() {
    const isText = isTextInput;
    const val  = isText ? inputValue.trim() : (parseInt(inputValue.replace(/[^0-9]/g,'')) || 0);
    setShowInput(false); setInputVal(''); setIsTextInput(false);
    addUser(isText ? String(val) : `₹${Number(val).toLocaleString('en-IN')}`);
    const ctx = inputCtx;

    // ── PAN collection flow (first time, before any filing) ─────────────────
    if (ctx === 'pan_collect_name') {
      setManualName(String(val));
      setPanError('');
      const langNow = localStorage.getItem('taxtalk_lang') || 'en';
      ask(
        langNow==='hi'
          ? <p>आपका <strong>PAN number</strong> क्या है? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(10 अंक, जैसे ABCDE1234F)</span></p>
          : langNow==='gu'
          ? <p>તમારો <strong>PAN number</strong> શું છે? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(10 અક્ષર, જેવા ABCDE1234F)</span></p>
          : <p>What is your <strong>PAN number</strong>? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(10 characters, e.g. ABCDE1234F)</span></p>,
        'pan_collect_pan', true
      );
      return;
    }
    if (ctx === 'pan_collect_pan') {
      const panVal = String(val).toUpperCase().trim();
      const panCheck = validatePAN(panVal);
      if (!panCheck.valid) {
        setPanError(panCheck.error);
        addAI(
          <div style={{ color:'var(--danger)' }}>
            <p>⚠️ Invalid PAN: <strong>{panCheck.error}</strong></p>
            <p style={{ fontSize:12, marginTop:4 }}>PAN format: first 5 letters · 4 digits · 1 letter (total 10 characters). The 4th character indicates the entity type (P = Individual).</p>
          </div>, null
        );
        setTimeout(() => {
          ask(<p>Please enter a valid <strong>PAN number</strong>:</p>, 'pan_collect_pan', true);
        }, 1000);
        return;
      }
      setPanError('');
      setManualPAN(panVal);
      const langNow = localStorage.getItem('taxtalk_lang') || 'en';
      // Show entity type confirmation
      addAI(
        <p>PAN accepted — <strong>{panVal}</strong> ({panCheck.entityType})</p>, null
      );
      setTimeout(() => {
        ask(
          langNow==='hi'
            ? <p>आपकी <strong>जन्म तिथि</strong> क्या है? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(DD/MM/YYYY)</span></p>
            : langNow==='gu'
            ? <p>તમારી <strong>જન્મ તારીખ</strong> શું છે? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(DD/MM/YYYY)</span></p>
            : <p>What is your <strong>date of birth</strong>? <span style={{ fontSize:12, color:'var(--text-muted)' }}>(DD/MM/YYYY)</span></p>,
          'pan_collect_dob', true
        );
      }, 800);
      return;
    }
    if (ctx === 'pan_collect_dob') {
      const dobVal = String(val).trim();
      setManualDOB(dobVal);
      // Save to profile immediately — these are locked once set
      try {
        const saved = await lockIdentity(userId, { full_name: manualName, pan: manualPAN, dob: dobVal });
        setProfile(saved);
        if (onProfileUpdate) onProfileUpdate();
        const langNow = localStorage.getItem('taxtalk_lang') || 'en';
        addAI(
          <>
            <p style={{ marginBottom:6 }}>
              {langNow==='hi' ? '✅ आपकी पहचान सुरक्षित हो गई है।'
              : langNow==='gu' ? '✅ તમારી ઓળખ સુરક્ષિત સંગ્રહ કરાઈ.'
              : '✅ Identity saved and locked.'}
            </p>
            <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>Name</span><strong>{manualName}</strong></div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid var(--border)' }}><span style={{ color:'var(--text-muted)' }}>PAN</span><strong style={{ fontFamily:'monospace' }}>{manualPAN}</strong></div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px' }}><span style={{ color:'var(--text-muted)' }}>Date of birth</span><strong>{dobVal}</strong></div>
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:6 }}>
              {langNow==='hi' ? 'ये विवरण अब बदले नहीं जा सकते।' : langNow==='gu' ? 'આ વિગતો હવે બદલી શકાશે નહીં.' : 'These details are now locked and cannot be changed.'}
            </p>
          </>,
          () => { setStep(S.WELCOME); }
        );
        // Now show welcome
        setTimeout(() => {
          const W = (k) => translate(k, langNow);
          addAI(
            <>
              <p style={{ marginBottom:8 }}>{W('chat.welcome_2')}</p>
              <p style={{ fontSize:13, color:'var(--text-muted)' }}>{W('chat.welcome_3')}</p>
            </>, null
          );
        }, 2000);
      } catch(e) {
        addAI(<p style={{ color:'var(--danger)' }}>Could not save identity: {e.message}. Please try again.</p>, null);
      }
      return;
    }

    // ── Manual identity (legacy path when AIS skipped) ─────────────────────
    if (ctx === 'manual_name') {
      setManualName(String(val));
      ask(<p>What is your <strong>PAN number</strong>?</p>, 'pan_collect_pan', true);
      return;
    }
    if (ctx === 'manual_pan') {
      const panVal = String(val).toUpperCase().trim();
      const panCheck = validatePAN(panVal);
      if (!panCheck.valid) {
        addAI(<p style={{ color:'var(--danger)' }}>⚠️ {panCheck.error}</p>, null);
        setTimeout(() => ask(<p>Please re-enter your <strong>PAN</strong>:</p>, 'manual_pan', true), 800);
        return;
      }
      setManualPAN(panVal);
      ask(<p>Date of birth? <span style={{ color:'var(--text-muted)', fontSize:12 }}>DD/MM/YYYY</span></p>, 'manual_dob', true);
      return;
    }
    if (ctx === 'manual_dob') {
      setManualDOB(String(val));
      ask(<p>Mobile number?</p>, 'manual_phone', true);
      return;
    }
    if (ctx === 'manual_phone') {
      setManualPhone(String(val));
      setIdentity({ name:manualName, pan:manualPAN, dob:manualDOB, phone:String(val), email:'', address:'' });
      const wLang2 = localStorage.getItem('taxtalk_lang') || 'en';
      addAI(
        <p>
          {wLang2==='hi' ? 'ठीक है! आप कभी भी ऊपर के बटन से AIS / Form 16 अपलोड कर सकते हैं।'
          : wLang2==='gu' ? 'ઠીક છે! ઉપરના બટનથી AIS / Form 16 ગમે ત્યારે અપલોડ કરી શકો.'
          : 'Got it. You can upload AIS or Form 16 any time using the upload button in the chat.'}
        </p>,
        () => {
          setTaxProfile(null);
          setStep(S.PROFILE_SELECT);
          const wLang3 = localStorage.getItem('taxtalk_lang') || 'en';
          addAI(
            <p>
              {wLang3==='hi' ? 'आपकी मुख्य आय का स्रोत क्या है?'
              : wLang3==='gu' ? 'તમારી મુખ્ય આવક શું છે?'
              : 'What is your primary source of income this year?'}
            </p>, null
          );
        }
      );
      return;
    }
    if (ctx === 'biz_name') {
      setBizNameState(String(val));
      proceedToBalanceSheet();
      return;
    }

    if (ctx === 'biz_turnover' || ctx === 'biz_turnover_confirm') {
      const bizReceipts = (aisData?.business_receipts||[]).reduce((s,x)=>s+(x.amount||0),0);
      const turnover = ctx === 'biz_turnover_confirm' ? (val || bizReceipts) : val;
      setBizTurnover(turnover);
      if (selBizType === '44ADA') {
        // 44ADA: always 50%
        const presumptive = Math.round(turnover * 0.5);
        setBiz(presumptive);
        addAI(
          <><p>Presumptive income: <strong>{formatINR(presumptive)}</strong> (50% of {formatINR(turnover)})</p></>,
          () => askBizDetails()
        );
      } else {
        // 44AD: ask digital vs cash split (6% digital, 8% cash)
        ask(
          <>
            <p>What percentage of your turnover was received via <strong>bank / digital</strong> means? The rest is treated as cash.</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Digital receipts: 6% · Cash receipts: 8% · Enter 0-100 (e.g. enter 80 if 80% was digital)</p>
          </>, 'biz_digital_pct'
        );
      }
    } else if (ctx === 'biz_digital_pct') {
      const pct = Math.min(100, Math.max(0, val));
      setBizCashPct(100 - pct);
      const digitalT = Math.round(bizTurnover * pct / 100);
      const cashT    = bizTurnover - digitalT;
      const presumptive = Math.round(digitalT * 0.06) + Math.round(cashT * 0.08);
      setBiz(presumptive);
      addAI(
        <>
          <p style={{ marginBottom:6 }}>Presumptive income computed: <strong>{formatINR(presumptive)}</strong></p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}><span style={{ color:'var(--text-secondary)' }}>Digital ({pct}%): {formatINR(digitalT)} × 6%</span><span style={{ fontWeight:500 }}>{formatINR(Math.round(digitalT*0.06))}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}><span style={{ color:'var(--text-secondary)' }}>Cash ({100-pct}%): {formatINR(cashT)} × 8%</span><span style={{ fontWeight:500 }}>{formatINR(Math.round(cashT*0.08))}</span></div>
          </div>
        </>,
        () => askBizDetails()
      );
    } else if (ctx === 'biz_name_done') {
      // This is triggered via button, not amount input
      proceedToBalanceSheet();
    } else if (ctx === 'bs_capital') {
      setBsCapital(val);
      ask(<p>What was the <strong>balance in all bank accounts</strong> as on 31 March 2026?</p>, 'bs_bank');
    } else if (ctx === 'bs_bank') {
      setBsBank(val);
      ask(<p>What was the <strong>cash in hand</strong> as on 31 March 2026? (enter 0 if you operate fully digitally)</p>, 'bs_cash');
    } else if (ctx === 'bs_cash') {
      setBsCash(val);
      ask(<p>What was the total <strong>outstanding debtors</strong> (money clients owe you) as on 31 March 2026? (enter 0 if none)</p>, 'bs_debtors');
    } else if (ctx === 'bs_debtors') {
      setBsDebtors(val);
      ask(<p>What was the total <strong>outstanding creditors</strong> (money you owe suppliers) as on 31 March 2026? (enter 0 if none)</p>, 'bs_creditors');
    } else if (ctx === 'bs_creditors') {
      setBsCreditors(val);
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

  // ── Free-text chat handler ─────────────────────────────────────────────────
  // Conversation history for multi-turn context (last 6 turns)
  const chatHistoryRef = useRef([]);

  async function handleFreeChat() {
    if (!freeText.trim() || chatLoading) return;
    const msg = freeText.trim();
    setFreeText('');
    addUser(msg);
    setChatLoading(true);

    // Add to history
    chatHistoryRef.current = [
      ...chatHistoryRef.current.slice(-5),
      { role: 'user', content: msg },
    ];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          message: msg,
          lang: langProp || lang || localStorage.getItem('taxtalk_lang') || 'en',
          conversationHistory: chatHistoryRef.current.slice(0, -1), // exclude current
          state: {
            step,
            profile:        taxProfile,
            grossSalary,
            businessIncome,
            bizTurnover,
            savingsInterest,
            fdInterest,
            dividendIncome,
            otherIncome:    otherOSIncome,
            houseRentReceived: houseProperty?.rentReceived || 0,
            tds,
            advanceTax,
            selfAssessment: selfAssess,
            deductions80C,
            deductions80D,
            homeLoanInterest: houseProperty?.interestPaid || 0,
            capitalGainStcg: (capitalGains?.shares?.stcg?.gain) || 0,
            capitalGainLtcg: (capitalGains?.shares?.ltcg?.gain) || 0,
            hasBankAccount:  false, // will track later
            ageGroup,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Chat API error');
      }

      const parsed = await res.json();
      const ex = parsed.extracted || {};

      // ── Apply ALL extracted fields to state ─────────────────────────────────
      let profileUpdated = null;

      if (ex.profile            != null) { setTaxProfile(ex.profile); profileUpdated = ex.profile; }
      if (ex.ageGroup           != null)   setAgeGroup(ex.ageGroup);

      // Income
      if (ex.grossSalary        != null) { setGross(ex.grossSalary); profileUpdated = profileUpdated || 'salaried'; setTaxProfile(p => p || 'salaried'); }
      if (ex.businessIncome     != null) { setBiz(ex.businessIncome); setTaxProfile(p => p || ex.bizType === '44ADA' ? 'freelancer' : 'business'); }
      if (ex.bizTurnover        != null)   setBizTurnover(ex.bizTurnover);
      if (ex.bizType            != null)   setSelBizType(ex.bizType);
      if (ex.bizName            != null)   setBizNameState(ex.bizName);
      if (ex.bizCashPct         != null)   setBizCashPct(ex.bizCashPct);
      if (ex.savingsInterest    != null) { setSavInt(ex.savingsInterest); setInt(ex.savingsInterest + (fdInterest || 0)); }
      if (ex.fdInterest         != null) { setFdInt(ex.fdInterest); setInt((savingsInterest || 0) + ex.fdInterest); }
      if (ex.dividendIncome     != null)   setDiv(ex.dividendIncome);
      if (ex.otherIncome        != null)   setOtherOS(ex.otherIncome);
      if (ex.employerName       != null)   setEmpName(ex.employerName);
      if (ex.employerTAN        != null)   setEmpTAN(ex.employerTAN);

      // House property
      if (ex.houseRentReceived != null || ex.municipalTax != null || ex.homeLoanInterest != null) {
        setHP(p => ({
          enabled:        true,
          type:           ex.houseRentReceived ? 'Rented' : (p?.type || 'Self Occupied'),
          rentReceived:   ex.houseRentReceived   ?? p?.rentReceived   ?? 0,
          municipalTaxes: ex.municipalTax         ?? p?.municipalTaxes ?? 0,
          interestPaid:   ex.homeLoanInterest      ?? p?.interestPaid   ?? 0,
        }));
      }

      // Capital gains
      if (ex.capitalGainStcg != null || ex.capitalGainLtcg != null || ex.capitalGainProperty != null) {
        setCG(p => ({
          ...p, enabled: true,
          shares: {
            stcg: ex.capitalGainStcg    != null ? { gain: ex.capitalGainStcg, saleValue: 0, purchaseCost: 0, expenses: 0 } : p?.shares?.stcg,
            ltcg: ex.capitalGainLtcg    != null ? { gain: ex.capitalGainLtcg, saleValue: 0, purchaseCost: 0, expenses: 0 } : p?.shares?.ltcg,
          },
          property: ex.capitalGainProperty != null ? { ltcgDetail: { gain: ex.capitalGainProperty, saleValue: 0, indexedCost: 0, expenses: 0 } } : p?.property,
        }));
      }

      // Taxes
      if (ex.tds              != null) setTds(ex.tds);
      if (ex.advanceTax       != null) setAdvTax(ex.advanceTax);
      if (ex.selfAssessment   != null) setSelfAss(ex.selfAssessment);

      // Deductions — ADDITIVE (user may give 80C items piecemeal)
      if (ex.deductions80C    != null) setD80C(prev => ex.deductions80C); // replace with total
      if (ex.deductions80D    != null) setD80D(ex.deductions80D);

      // ── Show AI reply ─────────────────────────────────────────────────────────
      // Build confirmation card if data was extracted
      const hasExtracted = Object.values(ex).some(v => v != null);

      if (parsed.reply) {
        // Show data summary inline as a structured card when multiple fields extracted
        const summaryFields = [
          ex.grossSalary        && { l: 'Salary income',         v: `₹${ex.grossSalary.toLocaleString('en-IN')}` },
          ex.businessIncome     && { l: 'Business income',        v: `₹${ex.businessIncome.toLocaleString('en-IN')}` },
          ex.tds                && { l: 'TDS deducted',           v: `₹${ex.tds.toLocaleString('en-IN')}` },
          ex.advanceTax         && { l: 'Advance tax',            v: `₹${ex.advanceTax.toLocaleString('en-IN')}` },
          ex.deductions80C      && { l: '80C deductions',         v: `₹${ex.deductions80C.toLocaleString('en-IN')}` },
          ex.deductions80D      && { l: '80D (mediclaim)',         v: `₹${ex.deductions80D.toLocaleString('en-IN')}` },
          ex.savingsInterest    && { l: 'Savings interest',        v: `₹${ex.savingsInterest.toLocaleString('en-IN')}` },
          ex.fdInterest         && { l: 'FD interest',            v: `₹${ex.fdInterest.toLocaleString('en-IN')}` },
          ex.dividendIncome     && { l: 'Dividend income',         v: `₹${ex.dividendIncome.toLocaleString('en-IN')}` },
          ex.capitalGainStcg    && { l: 'STCG (shares)',           v: `₹${ex.capitalGainStcg.toLocaleString('en-IN')}` },
          ex.capitalGainLtcg    && { l: 'LTCG (shares)',           v: `₹${ex.capitalGainLtcg.toLocaleString('en-IN')}` },
          ex.homeLoanInterest   && { l: 'Home loan interest',      v: `₹${ex.homeLoanInterest.toLocaleString('en-IN')}` },
          ex.houseRentReceived  && { l: 'House rent received',     v: `₹${ex.houseRentReceived.toLocaleString('en-IN')}` },
        ].filter(Boolean);

        addAI(
          <>
            <p style={{ lineHeight:1.6, marginBottom: summaryFields.length > 0 ? 10 : 0 }}>{parsed.reply}</p>
            {summaryFields.length > 1 && (
              <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', fontSize:12 }}>
                <div style={{ padding:'6px 10px', background:'var(--surface-3)', fontWeight:600, fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Recorded ✓
                </div>
                {summaryFields.map((f, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderTop:'1px solid var(--border)', gap:8 }}>
                    <span style={{ color:'var(--text-secondary)' }}>{f.l}</span>
                    <span style={{ fontWeight:600, color:'var(--brand)' }}>{f.v}</span>
                  </div>
                ))}
              </div>
            )}
          </>, null
        );
      }

      // Add AI reply to history
      if (parsed.reply) {
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
          { role: 'assistant', content: parsed.reply },
        ];
      }

      // ── Show follow-up question ─────────────────────────────────────────────
      if (parsed.followup_question) {
        setTimeout(() => {
          addAI(<p style={{ lineHeight:1.6 }}>{parsed.followup_question}</p>, null);
        }, 900);
      }

      // ── Advance step intelligently ──────────────────────────────────────────
      if (parsed.show_computation) {
        // We have enough data — compute and show
        setTimeout(() => computeAndShow(), 1200);
      } else if (parsed.next_step) {
        // API suggests a specific next step
        const ns = parsed.next_step;
        if (ns === 'profile_select') {
          setTimeout(() => {
            setStep(S.BIZ_TYPE);
            addAI(<p>What type of income do you primarily have?</p>, null);
          }, 1100);
        } else if (ns === 'ask_salary') {
          setTimeout(() => {
            ask(<p>What was your <strong>gross salary</strong> for FY 2025-26?</p>, 'salary');
          }, 1100);
        } else if (ns === 'ask_deductions') {
          setTimeout(() => proceedToDeductions(), 1100);
        } else if (ns === 'taxes_confirm') {
          setTimeout(() => goToTaxesConfirm(), 1100);
        } else if (ns === 'ready_to_compute') {
          setTimeout(() => computeAndShow(), 1200);
        }
      }

    } catch(e) {
      console.error('chat error:', e);
      addAI(
        <p style={{ color:'var(--danger)', fontSize:13 }}>
          Sorry, I couldn't process that right now. Please try again, or use the buttons above.
        </p>, null
      );
    } finally {
      setChatLoading(false);
    }
  }

  // ── Compute & show ──────────────────────────────────────────────────────────
  function computeAndShow() {
    const totalInterest = savingsInterest + fdInterest;
    const inputs = {
      grossSalary, standardDeduction:75000, professionalTax:0,
      businessIncome,
      bizTurnover, bizCashPct,        // for ScheduleBP 6%/8% split
      bizName,                        // for NatOfBus44AD
      bizCodeAD,                      // nature of business code
      // Balance sheet items for FinanclPartclrOfBusiness
      bsCapital, bsBank, bsCash, bsDebtors, bsCreditors,
      interestIncome: totalInterest,
      dividendIncome,
      otherIncome: otherOSIncome,
      savingsInterest, fdInterest,
      houseProperty, capitalGains,  // full object with sale/purchase details
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
      const note = `${taxProfile} | ${ageGroup} | Income: ${formatINR(finalComp.grossTotal)} | Tax: ${formatINR(finalComp.chosenTax)} | ${finalComp.betterRegime} regime | ${finalComp.refund>0?'Refund: '+formatINR(finalComp.refund):'Balance: '+formatINR(finalComp.balanceDue)}`;
      // Pass finalComp to submitToCA — saves before status change to avoid RLS violation
      await submitToCA(note, aisFlags.map(f => ({ severity:'warn', ...f })), finalComp);
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
    setBizTurnover(0); setBizCashPct(0); setBizNameState(''); setBizCodeAD('09028');
    setBsCapital(0); setBsBank(0); setBsCash(0); setBsDebtors(0); setBsCreditors(0);
    setShowInput(false); setInputVal(''); setIsTextInput(false); setUploadErr(null);
    setTimeout(() => addAI(<p>Ready to file another return?</p>, null), 400);
  }

  if (loadingReturn || chatRestoreState === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)', fontSize:14 }}>
      <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading...
    </div>
  );

  // ── Continue / Fresh dialog ─────────────────────────────────────────────────
  if (chatRestoreState === 'ask') {
    const lastMsg = savedMessages[savedMessages.length - 1];
    const lastDate = lastMsg?.created_at
      ? new Date(lastMsg.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '';
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:'24px 20px', gap:20, background:'var(--surface-2)' }}>
        <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:'28px 24px', maxWidth:400, width:'100%', boxShadow:'var(--shadow-md)', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>💬</div>
          <div style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>Welcome back!</div>
          <div style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:6 }}>
            You have an ITR filing in progress.
          </div>
          {lastDate && (
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:20 }}>
              Last activity: {lastDate}
            </div>
          )}
          <div style={{ background:'var(--surface-2)', borderRadius:'var(--radius-md)', padding:'12px 14px', marginBottom:20, fontSize:13, color:'var(--text-secondary)', textAlign:'left', maxHeight:100, overflow:'hidden', borderLeft:'3px solid var(--brand)' }}>
            {lastMsg?.content?.slice(0, 160) || 'Previous conversation found'}{(lastMsg?.content?.length || 0) > 160 ? '…' : ''}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button
              onClick={doRestoreChat}
              style={{ padding:'12px 16px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:'var(--radius-md)', fontWeight:600, fontSize:14, cursor:'pointer' }}
            >
              ▶ Continue where I left off
            </button>
            <button
              onClick={() => { setMessages([]); setSavedMessages([]); setChatRestoreState('fresh'); }}
              style={{ padding:'12px 16px', background:'var(--surface)', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontWeight:500, fontSize:14, cursor:'pointer' }}
            >
              🆕 Start a fresh return
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:14 }}>
            Your previous data is safely stored. Starting fresh will create a new return session.
          </div>
        </div>
      </div>
    );
  }

  const itrBadge = taxProfile === 'salaried' ? 'ITR-1' : taxProfile === 'business' || taxProfile === 'freelancer' ? 'ITR-4' : taxProfile === 'partner' ? 'ITR-3' : 'ITR';

  return (
    <div className="chat-shell">

{/* Document upload tray moved to chatbox toolbar */}

      {/* Sub-header in chat */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, color:'var(--success)', display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--success)', flexShrink:0 }}/>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {lang==='hi' ? 'RB Shah & Associates · AY 2026-27 · हिंदी' :
               lang==='gu' ? 'RB Shah & Associates · AY 2026-27 · ગુજ.' :
               'RB Shah & Associates · AY 2026-27'}
            </span>
          </div>
        </div>
        <Badge variant="info"><FileText size={11}/> {itrBadge}</Badge>
        {/* Upload button moved to chatbox toolbar */}
      </div>

      {/* Messages */}
      <div className="chat-wrap" style={{ flex:1, gap:14 }}>
        {messages.map(m => m.from==='ai' ? <AIBubble key={m.key}>{m.content}</AIBubble> : <UserBubble key={m.key}>{m.content}</UserBubble>)}
        {typing    && <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>T</div><TypingDots/></div>}
        {processing && <ProcessBubble msg={processing}/>}
        <div ref={bottomRef}/>
      </div>

      {/* Controls */}
      {!typing && !processing && (
        <div className="controls-panel">
          {/* Structured form toggle — secondary to chat */}
          {step !== S.DONE && step !== S.WELCOME && step !== S.AIS_UPLOAD &&
           step !== S.COMPUTATION && !showInput && (
            <button onClick={() => setShowStructured(s => !s)}
              style={{ width:'100%', padding:'7px 12px', marginBottom:8, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>{showStructured ? '▲ Hide step guide' : '▼ Show step-by-step guide instead'}</span>
              <span style={{ fontSize:10, color:'var(--text-muted)' }}>Optional</span>
            </button>
          )}
          {/* Structured controls — hidden by default, shown when toggled */}
          {(showStructured || step === S.WELCOME || step === S.AIS_UPLOAD || step === S.COMPUTATION ||
            step === S.PROFILE_SELECT || step === S.AIS_CONFIRM || step === S.INCOME_CONFIRM || step === S.CG_COLLECT ||
            step === S.CG_IMPORT || step === S.DED_80C || step === S.DED_OTHER || step === S.HP_TYPE ||
            step === S.TAXES_CONFIRM || step === S.BIZ_TYPE || step === S.FORM16 || step === S.DONE || showInput) && (
          <>

          {/* Step 0: Welcome — prev year ITR (optional) */}
          {step === S.WELCOME && !uploading && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload previous year ITR or Computation" subLabel="Optional — PDF or image" onFile={handlePrevItrUpload} uploading={uploading} progress={uploadPct}/>
              <button onClick={goToAISStep} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                {lang==='hi' ? 'छोड़ें — पिछले साल का ITR नहीं है' : lang==='gu' ? 'છોડો — ગત વર્ષનો ITR નથી' : "Skip — I don't have previous year ITR"}
              </button>
            </div>
          )}

          {/* Step 1: AIS upload — now OPTIONAL */}
          {step === S.AIS_UPLOAD && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label="Upload AIS / Form 26AS" subLabel="PDF from incometax.gov.in" onFile={handleAISUpload} uploading={uploading} progress={uploadPct}/>
              <button onClick={skipAIS} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                {T('ais.skip')}
              </button>
              {uploadError && <div style={{ display:'flex', gap:6, fontSize:12, color:'var(--danger)', alignItems:'center' }}><AlertCircle size={13}/>{uploadError}</div>}
            </div>
          )}

          {/* Manual identity (no AIS path) */}
          {step === S.MANUAL_IDENTITY && !showInput && (
            <div style={{ padding:'10px 14px', background:'var(--surface-2)', borderRadius:8, fontSize:13, color:'var(--text-secondary)' }}>
              Entering details manually...
            </div>
          )}

          {/* AIS confirmed — show income options */}
          {step === S.AIS_CONFIRM && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser(T('ais.some_differ'));
                addAI(<p style={{ marginBottom:8 }}>No problem — you can correct any figure in the final review screen. Shall we continue?</p>, null);
                setTimeout(confirmAIS, 1200);
              }}>{T('ais.some_differ')}</Button>
              <Button variant="primary" style={{ flex:1, justifyContent:'center' }} onClick={confirmAIS}>{T('ais.looks_correct')}</Button>
            </div>
          )}

          {/* Additional income not in AIS */}
          {step === S.INCOME_CONFIRM && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {EXTRA_INCOME_TYPES.map(item => (
                  <Chip key={item.id} label={T(item.i18nKey) || item.label} selected={extraIncomeTypes.includes(item.id)} onClick={() => toggleExtra(item.id)}/>
                ))}
              </div>
              <Button variant="primary" onClick={confirmExtraIncome} disabled={extraIncomeTypes.length===0} style={{ alignSelf:"flex-end" }}>
                {T('common.continue')} <ChevronRight size={15}/>
              </Button>
            </div>
          )}

          {/* CG collection — full sale/purchase details OR import from broker */}
          {(step === S.CG_COLLECT || step === S.CG_IMPORT) && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Toggle between import and manual */}
              <div style={{ display:'flex', gap:6, borderBottom:'1px solid var(--border)', paddingBottom:8 }}>
                <button onClick={() => setStep(S.CG_IMPORT)} style={{ fontSize:12, padding:'5px 12px', borderRadius:20, border:'1.5px solid '+(step===S.CG_IMPORT?'var(--brand)':'var(--border-strong)'), background:step===S.CG_IMPORT?'var(--brand-light)':'transparent', color:step===S.CG_IMPORT?'var(--brand)':'var(--text-secondary)', cursor:'pointer' }}>
                  📊 Import from broker report
                </button>
                <button onClick={() => setStep(S.CG_COLLECT)} style={{ fontSize:12, padding:'5px 12px', borderRadius:20, border:'1.5px solid '+(step===S.CG_COLLECT?'var(--brand)':'var(--border-strong)'), background:step===S.CG_COLLECT?'var(--brand-light)':'transparent', color:step===S.CG_COLLECT?'var(--brand)':'var(--text-secondary)', cursor:'pointer' }}>
                  ✏️ Enter manually
                </button>
              </div>
              {step === S.CG_IMPORT && returnRecord?.id && (
                <CGTransactionImporter returnId={returnRecord.id} value={capitalGains || {}} onChange={cg => setCG(cg)} />
              )}
              {step === S.CG_COLLECT && (
                <CGCollector value={capitalGains || { enabled:true }} onChange={cg => setCG(cg)} />
              )}
              <Button variant="primary" onClick={() => {
                addUser("Capital gains details confirmed");
                if (extraIncomeTypes.includes("hp")) {
                  setStep(S.HP_TYPE);
                  addAI(<p>Is your property <strong>self-occupied</strong> or <strong>rented out</strong>?</p>, null);
                } else { routeToNextStep(); }
              }} style={{ alignSelf:"flex-end" }}>{lang==='hi'?'पूंजी लाभ की पुष्टि करें':lang==='gu'?'કેપિટલ ગેઇન્સ ખાતરી':' Confirm capital gains'} <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Form 16 */}
          {step === S.FORM16 && !showInput && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <UploadBtn label={T('form16.upload')} subLabel={T('form16.sub')} onFile={handleForm16Upload} uploading={uploading} progress={uploadPct}/>
              <button onClick={skipForm16} style={{ padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>
                {T('form16.skip')}
              </button>
            </div>
          )}

          {/* Income type selection — ALL types (salary, business, etc.) */}
          {step === S.PROFILE_SELECT && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {INCOME_TYPES.map(t => (
                <button key={t.id} onClick={() => setSelIncomeType(t.id)}
                  style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:`1.5px solid ${selIncomeType===t.id?'var(--brand)':'var(--border-strong)'}`, background:selIncomeType===t.id?'var(--brand-light)':'var(--surface)', textAlign:'left', cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontWeight:600, fontSize:14, color:selIncomeType===t.id?'var(--brand)':'var(--text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3, lineHeight:1.4 }}>{t.sub}</div>
                </button>
              ))}
              <Button variant="primary" onClick={handleIncomeTypeConfirm} style={{ alignSelf:'flex-end' }}>
                {T('common.continue')} <ChevronRight size={15}/>
              </Button>
            </div>
          )}

          {/* Business sub-type — 44AD / 44ADA / Actual (only shown after business/freelancer selected) */}
          {step === S.BIZ_TYPE && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {BIZ_TYPES.map(b => (
                <button key={b.id} onClick={() => setSelBizType(b.id)}
                  style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', border:`1.5px solid ${selBizType===b.id?'var(--brand)':'var(--border-strong)'}`, background:selBizType===b.id?'var(--brand-light)':'var(--surface)', textAlign:'left', cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontWeight:600, fontSize:14, color:selBizType===b.id?'var(--brand)':'var(--text-primary)' }}>{b.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3, lineHeight:1.4 }}>{b.sub}</div>
                </button>
              ))}
              <Button variant="primary" onClick={handleBizConfirm} style={{ alignSelf:'flex-end' }}>
                {T('common.continue')} <ChevronRight size={15}/>
              </Button>
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
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, overflowX:'hidden' }}>
                {DEDUCTION_OPTIONS.map(o => <Chip key={o.id} label={T(o.i18nKey) || o.label} selected={sel80C.includes(o.id)} onClick={() => toggle80C(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirm80C} disabled={sel80C.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* Deductions — other */}
          {step === S.DED_OTHER && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, overflowX:'hidden' }}>
                {OTHER_DED_OPTIONS.map(o => <Chip key={o.id} label={T(o.i18nKey) || o.label} selected={selOther.includes(o.id)} onClick={() => toggleOtherDed(o.id)}/>)}
              </div>
              <Button variant="primary" onClick={confirmOtherDed} disabled={selOther.length===0} style={{ alignSelf:'flex-end' }}>Continue <ChevronRight size={15}/></Button>
            </div>
          )}

          {/* HP type */}
          {step === S.HP_TYPE && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Self Occupied')}>{T('hp.self_occupied')}</Button>
              <Button variant="primary"   style={{ flex:1, justifyContent:'center' }} onClick={() => handleHPType('Rented')}>{T('hp.rented')}</Button>
            </div>
          )}

          {/* Taxes confirm */}
          {step === S.TAXES_CONFIRM && !showInput && (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser(T('tax.update_figures'));
                ask(<p>Enter the correct <strong>total TDS deducted</strong> as per your records:</p>, 'tds_update');
                setInputCtx('tds_update');
              }}>{T('tax.update_figures')}</Button>
              <Button variant="primary" style={{ flex:1, justifyContent:'center' }} onClick={() => {
                addUser(T('tax.correct_continue'));
                computeAndShow();
              }}>{T('tax.correct_continue')}</Button>
            </div>
          )}

{/* Amount input is now merged into the unified chat box below — no separate input */}

          {/* Done */}
          {step === S.DONE && (
            <button onClick={handleReset} style={{ width:'100%', padding:12, border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--surface-3)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <RotateCcw size={14}/> {lang==='hi' ? 'नया रिटर्न शुरू करें' : lang==='gu' ? 'નવો રિટર્ન શરૂ કરો' : 'Start a new return'}
            </button>
          )}
          </>
          )}

          {/* ── UNIFIED chatbox — amount entry + free chat + upload, all in one ── */}
          <UnifiedInput
            showInput={showInput}
            isTextInput={isTextInput}
            inputCtx={inputCtx}
            inputValue={inputValue}
            setInputVal={setInputVal}
            handleAmount={handleAmount}
            freeText={freeText}
            setFreeText={setFreeText}
            handleFreeChat={handleFreeChat}
            chatLoading={chatLoading}
            lang={lang}
            returnId={returnRecord?.id}
            getReturnId={getReturnId}
            uploading={uploading}
            uploadPct={uploadPct}
            setUploading={setUploading}
            setUploadPct={setUploadPct}
            addAI={addAI}
            setTds={setTds}
            setAdvTax={setAdvTax}
            formatINR={formatINR}
            done={step === S.DONE}
            supabase={supabase}
            uploadDocument={uploadDocument}
            setProcessing={setProcessing}
          />
        </div>
      )}
    </div>
  );
}
