import React, { useState, useEffect } from 'react';
import { MessageSquare, FileText, CheckCircle, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { supabase, getMyCAQueries, replyToCAQuery, getMyReturns } from '../lib/supabase.js';
import { formatINR } from '../data/flow.js';
import { Card, Badge, Button } from './UI.jsx';

const STATUS = {
  in_progress: { label:'In progress',  variant:'info' },
  submitted:   { label:'Under review', variant:'warn' },
  queried:     { label:'Needs info',   variant:'danger' },
  approved:    { label:'Approved',     variant:'success' },
  filed:       { label:'Filed',        variant:'success' },
  on_hold:     { label:'On hold',      variant:'neutral' },
};

function QueryCard({ q, onRefresh }) {
  const [expanded, setExpanded] = useState(!q.client_reply);
  const [reply, setReply]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [sent, setSent]         = useState(!!q.client_reply);

  async function handleReply() {
    if (!reply.trim()) return;
    setSaving(true);
    try {
      await replyToCAQuery(q.id, reply);
      setSent(true);
      onRefresh();
    } catch(e) { alert('Could not send reply: ' + e.message); }
    finally { setSaving(false); }
  }

  const caName = q.from_profile?.full_name || q.from_profile?.email || 'CA team';
  const ayLabel = q.returns?.assessment_year ? `AY ${q.returns.assessment_year}` : '';

  return (
    <Card style={{ marginBottom:10, border: !q.client_reply ? '1px solid var(--warn)' : '1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>CA</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontWeight:600, fontSize:14 }}>{caName}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{ayLabel}</span>
            {!q.client_reply && <Badge variant="danger">Awaiting your reply</Badge>}
            {q.client_reply && <Badge variant="success">Replied</Badge>}
          </div>
          <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.5 }}>
            {expanded ? q.message : q.message.substring(0,80) + (q.message.length>80?'...':'')}
          </p>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            {new Date(q.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} color="var(--text-muted)"/> : <ChevronDown size={16} color="var(--text-muted)"/>}
      </div>

      {expanded && (
        <div style={{ marginTop:14 }}>
          <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, lineHeight:1.6, color:'var(--text-primary)' }}>
            {q.message}
          </div>

          {q.client_reply ? (
            <div style={{ background:'var(--brand-light)', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:11, color:'var(--brand)', fontWeight:600, marginBottom:4 }}>Your reply</div>
              <p style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.5 }}>{q.client_reply}</p>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                Sent on {new Date(q.replied_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6 }}>Your reply:</div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder="Type your reply here..."
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:13, lineHeight:1.5, background:'var(--surface)', color:'var(--text-primary)', resize:'none', outline:'none', fontFamily:'inherit' }}
              />
              <Button variant="primary" size="sm" style={{ marginTop:8 }} onClick={handleReply} disabled={saving || !reply.trim()}>
                {saving ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={13}/>} Send reply
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ReturnCard({ ret }) {
  const [expanded, setExpanded] = useState(false);
  const cfg    = STATUS[ret.status] || STATUS.in_progress;
  const comp   = ret.computation || {};
  const regime = comp.betterRegime || 'new';
  const tax    = comp.chosenTax || 0;
  const refund = comp.refund || 0;
  const balance= comp.balanceDue || 0;

  return (
    <Card style={{ marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width:40, height:40, borderRadius:8, background:'var(--surface-3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <FileText size={18} color="var(--text-muted)"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>AY {ret.assessment_year} — {ret.itr_form || 'ITR'}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
            {ret.profile} · Started {new Date(ret.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {expanded ? <ChevronUp size={16} color="var(--text-muted)"/> : <ChevronDown size={16} color="var(--text-muted)"/>}
        </div>
      </div>

      {expanded && comp && Object.keys(comp).length > 0 && (
        <div style={{ marginTop:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { l:'Gross income', v:formatINR(comp.grossTotal||0) },
              { l:'Tax payable', v:formatINR(tax) },
              { l:refund>0?'Refund due':'Balance to pay', v:refund>0?formatINR(refund):formatINR(balance), highlight:true },
            ].map((item,i) => (
              <div key={i} style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{item.l}</div>
                <div style={{ fontSize:14, fontWeight:600, color:item.highlight?(refund>0?'var(--success)':'var(--warn)'):'var(--text-primary)' }}>{item.v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--text-muted)' }}>
            {regime==='old'?'Old':'New'} regime selected · Last updated {new Date(ret.updated_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ClientInbox({ userId }) {
  const [tab, setTab]         = useState('queries');
  const [queries, setQueries] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [q, r] = await Promise.all([getMyCAQueries(userId), getMyReturns(userId)]);
      setQueries(q);
      setReturns(r);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // Realtime subscription for new queries
    const channel = supabase
      .channel('my_queries')
      .on('postgres_changes', { event:'*', schema:'public', table:'ca_queries', filter:`to_user_id=eq.${userId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const pendingQueries = queries.filter(q => !q.client_reply).length;

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 16px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>My Returns</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)' }}>Track your filing status and reply to CA queries</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:20 }}>
        {[
          { id:'queries', label:'CA Queries', count:pendingQueries },
          { id:'returns', label:'Return History', count:returns.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer',
            fontSize:13, fontWeight:tab===t.id?600:400,
            color:tab===t.id?'var(--brand)':'var(--text-secondary)',
            borderBottom:`2px solid ${tab===t.id?'var(--brand)':'transparent'}`,
            display:'flex', alignItems:'center', gap:6,
          }}>
            {t.label}
            {t.count>0 && (
              <span style={{ background:t.id==='queries'&&pendingQueries>0?'var(--danger)':'var(--surface-3)', color:t.id==='queries'&&pendingQueries>0?'#fff':'var(--text-secondary)', borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:600 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40, gap:8, color:'var(--text-muted)' }}>
          <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Loading...
        </div>
      )}

      {/* Queries tab */}
      {!loading && tab==='queries' && (
        <div>
          {queries.length===0 && (
            <Card>
              <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                <MessageSquare size={32} style={{ margin:'0 auto 12px', opacity:0.4 }}/>
                <div style={{ fontSize:15, fontWeight:500 }}>No queries yet</div>
                <div style={{ fontSize:13, marginTop:4 }}>Your CA will send queries here if they need more information</div>
              </div>
            </Card>
          )}
          {queries.map(q => <QueryCard key={q.id} q={q} onRefresh={load}/>)}
        </div>
      )}

      {/* Returns tab */}
      {!loading && tab==='returns' && (
        <div>
          {returns.length===0 && (
            <Card>
              <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                <FileText size={32} style={{ margin:'0 auto 12px', opacity:0.4 }}/>
                <div style={{ fontSize:15, fontWeight:500 }}>No returns yet</div>
                <div style={{ fontSize:13, marginTop:4 }}>Start filing from the "File my return" tab</div>
              </div>
            </Card>
          )}
          {returns.map(r => <ReturnCard key={r.id} ret={r}/>)}
        </div>
      )}
    </div>
  );
}
