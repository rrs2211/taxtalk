import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, FileText, CheckCircle, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Loader, Upload, Trash2, X } from 'lucide-react';
import { supabase, getMyCAQueries, replyToCAQuery, getMyReturns, deleteReturn } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';
import { formatINR } from '../data/flow.js';
import { Card, Badge, Button } from './UI.jsx';

const STATUS = {
  in_progress:{ label:'In progress',  variant:'info' },
  submitted:  { label:'Under review', variant:'warn' },
  queried:    { label:'Needs info',   variant:'danger' },
  approved:   { label:'Approved',     variant:'success' },
  filed:      { label:'Filed ✓',      variant:'success' },
  on_hold:    { label:'On hold',      variant:'neutral' },
};

function ThreadedQuery({ q, userId, onRefresh }) {
  const [expanded, setExpanded]   = useState(!q.client_reply);
  const [reply,    setReply]      = useState('');
  const [saving,   setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef(null);

  const caName = q.from_profile?.full_name || q.from_profile?.email || 'CA team';
  const isFromCA = q.from_user_id !== userId;

  async function handleReply() {
    if (!reply.trim()) return;
    setSaving(true);
    try {
      await replyToCAQuery(q.id, reply.trim());
      setReply(''); onRefresh();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDocUpload(file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      // Find the return_id from query
      const returnId = q.return_id;
      const doc = await uploadDocument(file, returnId, 'supporting_doc', p => setUploadPct(p));
      // Attach doc reference to reply
      await replyToCAQuery(q.id, `[Document uploaded: ${file.name}] (document ID: ${doc.id})`);
      onRefresh();
    } catch(e) { alert('Upload failed: ' + e.message); }
    finally { setUploading(false); setUploadPct(0); }
  }

  return (
    <Card style={{ marginBottom:10, border: !q.client_reply && isFromCA ? '1px solid var(--warn)' : '1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }} onClick={() => setExpanded(e=>!e)}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
          {isFromCA ? 'CA' : 'Me'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' }}>
            <span style={{ fontWeight:600, fontSize:14 }}>{isFromCA ? caName : 'You'}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>AY {q.returns?.assessment_year}</span>
            {!q.client_reply && isFromCA && <Badge variant="danger">Reply needed</Badge>}
            {q.client_reply && <Badge variant="success">Replied</Badge>}
          </div>
          <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.5 }}>
            {expanded ? q.message : q.message.substring(0,100)+(q.message.length>100?'...':'')}
          </p>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
            {new Date(q.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </div>
        </div>
        {expanded ? <ChevronUp size={15} color="var(--text-muted)"/> : <ChevronDown size={15} color="var(--text-muted)"/>}
      </div>

      {expanded && (
        <div style={{ marginTop:12 }}>
          <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
            {q.message}
          </div>

          {q.client_reply ? (
            <div style={{ background:'var(--brand-light)', borderRadius:8, padding:'10px 14px', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'var(--brand)', fontWeight:600, marginBottom:3 }}>Your reply · {new Date(q.replied_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</div>
              <p style={{ fontSize:13, color:'var(--text-primary)' }}>{q.client_reply}</p>
            </div>
          ) : isFromCA ? (
            <div>
              <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} placeholder="Type your reply..."
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, lineHeight:1.5, background:'var(--surface)', color:'var(--text-primary)', resize:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <Button variant="primary" size="sm" onClick={handleReply} disabled={saving||!reply.trim()}>
                  {saving ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={13}/>} Send reply
                </Button>
                <input ref={fileRef} type="file" style={{ display:'none' }} onChange={e => e.target.files[0] && handleDocUpload(e.target.files[0])} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <><Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> {uploadPct}%</> : <><Upload size={13}/> Attach document</>}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ReturnCard({ ret, userId, onDelete }) {
  const [expanded, setExpanded]   = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const cfg  = STATUS[ret.status] || STATUS.in_progress;
  const comp = ret.computation || {};
  const selTax = comp.chosenTax || 0;
  const refund = comp.refund    || 0;
  const balance= comp.balanceDue|| 0;

  const canDelete = ['in_progress', 'submitted'].includes(ret.status);

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await deleteReturn(ret.id, userId);
      onDelete(ret.id);
    } catch(e) { alert('Delete failed: ' + e.message); setDeleting(false); setConfirmDel(false); }
  }

  return (
    <Card style={{ marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpanded(e=>!e)}>
        <div style={{ width:40, height:40, borderRadius:8, background:'var(--surface-3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <FileText size={18} color="var(--text-muted)"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>AY {ret.assessment_year} — {ret.itr_form||'ITR'}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
            {ret.profile} · {new Date(ret.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {expanded ? <ChevronUp size={15} color="var(--text-muted)"/> : <ChevronDown size={15} color="var(--text-muted)"/>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop:14 }}>
          {comp && Object.keys(comp).length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
              {[
                { l:'Gross income',     v:formatINR(comp.grossTotal||0) },
                { l:'Tax payable',      v:formatINR(selTax) },
                { l:refund>0?'Refund':'Balance', v:refund>0?formatINR(refund):formatINR(balance), c:refund>0?'var(--success)':'var(--warn)' },
              ].map((item,i) => (
                <div key={i} style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>{item.l}</div>
                  <div style={{ fontSize:14, fontWeight:600, color:item.c||'var(--text-primary)' }}>{item.v}</div>
                </div>
              ))}
            </div>
          )}
          {ret.acknowledgement_no && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'var(--success-light)', borderRadius:8, fontSize:13, color:'var(--success)', marginBottom:10 }}>
              <CheckCircle size={14}/> Filed · Ack: {ret.acknowledgement_no}
            </div>
          )}
          {canDelete && (
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              {confirmDel && <span style={{ fontSize:13, color:'var(--danger)', alignSelf:'center' }}>Tap again to confirm delete</span>}
              <Button variant={confirmDel?'danger':'ghost'} size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Trash2 size={13}/>}
                {confirmDel ? 'Confirm delete' : 'Delete return'}
              </Button>
              {confirmDel && <Button variant="secondary" size="sm" onClick={() => setConfirmDel(false)}><X size={13}/></Button>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ClientInbox({ userId }) {
  const [tab,     setTab]     = useState('queries');
  const [queries, setQueries] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [q, r] = await Promise.all([getMyCAQueries(userId), getMyReturns(userId)]);
      setQueries(q); setReturns(r);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const ch = supabase.channel('my_queries')
      .on('postgres_changes', { event:'*', schema:'public', table:'ca_queries', filter:`to_user_id=eq.${userId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId]);

  const pendingCount = queries.filter(q => !q.client_reply && q.from_user_id !== userId).length;

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 16px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>My Returns & Queries</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)' }}>Track status, reply to CA queries, and upload supporting documents</p>
      </div>

      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:20 }}>
        {[
          { id:'queries', label:'CA Queries', count:pendingCount },
          { id:'returns', label:'Return History', count:returns.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===t.id?600:400, color:tab===t.id?'var(--brand)':'var(--text-secondary)', borderBottom:`2px solid ${tab===t.id?'var(--brand)':'transparent'}`, display:'flex', alignItems:'center', gap:6 }}>
            {t.label}
            {t.count > 0 && <span style={{ background:t.id==='queries'&&pendingCount>0?'var(--danger)':'var(--surface-3)', color:t.id==='queries'&&pendingCount>0?'#fff':'var(--text-secondary)', borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:600 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40, gap:8, color:'var(--text-muted)' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading...</div>}

      {!loading && tab==='queries' && (
        queries.length===0
          ? <Card><div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}><MessageSquare size={28} style={{ margin:'0 auto 10px', opacity:0.3 }}/><div style={{ fontSize:14, fontWeight:500 }}>No queries yet</div><div style={{ fontSize:12, marginTop:4 }}>Your CA will send messages here when they need information from you</div></div></Card>
          : queries.map(q => <ThreadedQuery key={q.id} q={q} userId={userId} onRefresh={load}/>)
      )}

      {!loading && tab==='returns' && (
        returns.length===0
          ? <Card><div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}><FileText size={28} style={{ margin:'0 auto 10px', opacity:0.3 }}/><div style={{ fontSize:14, fontWeight:500 }}>No returns yet</div><div style={{ fontSize:12, marginTop:4 }}>Start filing from the "File my return" tab</div></div></Card>
          : returns.map(r => <ReturnCard key={r.id} ret={r} userId={userId} onDelete={id => setReturns(rs => rs.filter(r => r.id !== id))} />)
      )}
    </div>
  );
}
