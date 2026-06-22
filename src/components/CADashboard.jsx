import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, MessageSquare, Clock, ChevronDown, ChevronUp, Send, FileText, TrendingUp, Loader, RefreshCw } from 'lucide-react';
import { Avatar, Badge, Button, Card, Divider } from './UI.jsx';
import { formatINR } from '../data/flow.js';
import { supabase, approveReturn, sendCAQuery } from '../lib/supabase.js';

const STATUS_CONFIG = {
  submitted: { label:'Pending review', variant:'warn',    icon:<Clock size={12}/> },
  queried:   { label:'Awaiting client', variant:'info',   icon:<MessageSquare size={12}/> },
  approved:  { label:'Approved',        variant:'success', icon:<CheckCircle size={12}/> },
  on_hold:   { label:'On hold',         variant:'neutral', icon:<Clock size={12}/> },
};

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
  const [expanded, setExpanded]   = useState(entry.flags?.some(f => f.severity === 'critical'));
  const [queryMode, setQueryMode] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);
  const [queried, setQueried]     = useState(false);

  const ret   = entry.returns;
  const comp  = ret?.computation || {};
  const flags = entry.flags || [];
  const profile = entry.profiles;
  const status = ret?.status || 'submitted';
  const cfg    = STATUS_CONFIG[status] || STATUS_CONFIG.submitted;

  const critCount = flags.filter(f => f.severity === 'critical').length;
  const warnCount = flags.filter(f => f.severity === 'warn').length;
  const badgeVariant = critCount > 0 ? 'danger' : warnCount > 0 ? 'warn' : 'success';
  const badgeLabel   = critCount > 0 ? `${critCount} critical` : warnCount > 0 ? `${warnCount} flagged` : 'Clean';

  async function handleApprove() {
    setSaving(true);
    try {
      await approveReturn(ret.id, caUserId);
      setDone(true);
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
      onRefresh();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  if (done) {
    return (
      <Card style={{ border:'1.5px solid #86efac', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--success)' }}>
          <CheckCircle size={18}/> <span style={{ fontWeight:600, fontSize:14 }}>{profile?.full_name || profile?.email} — Approved & queued for filing</span>
        </div>
      </Card>
    );
  }

  const itrForm = ret?.itr_form || 'ITR';
  const taxableIncome = comp?.betterRegime === 'old' ? comp?.oldTaxable : comp?.newTaxable;

  return (
    <Card style={{ marginBottom:10, border: expanded ? '1px solid var(--brand)' : '1px solid var(--border)', transition:'border-color 0.2s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
        <Avatar initials={(profile?.full_name || profile?.email || 'U').substring(0,2).toUpperCase()} size={40} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>{profile?.full_name || profile?.email || 'Client'}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
            {ret?.profile} · {itrForm} · {taxableIncome ? `Taxable income ${formatINR(taxableIncome)}` : 'Computation pending'}
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
              {comp.grossTotal > 0 && <CompRow label="Gross income" value={formatINR(comp.grossTotal)} />}
              {comp.cap80C > 0    && <CompRow label="Section 80C"  value={`− ${formatINR(comp.cap80C)}`} />}
              {comp.cap80D > 0    && <CompRow label="Section 80D"  value={`− ${formatINR(comp.cap80D)}`} />}
              {taxableIncome > 0  && <CompRow label={`Taxable income (${comp.betterRegime} regime)`} value={formatINR(taxableIncome)} bold />}
              {comp.chosenTax > 0 && <CompRow label="Tax + 4% cess" value={formatINR(comp.chosenTax)} />}
              {comp.tdsDeducted > 0 && <CompRow label="TDS deducted" value={`− ${formatINR(comp.tdsDeducted)}`} />}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:14, fontWeight:700 }}>
                <span>{comp.refund > 0 ? 'Refund due' : 'Balance tax payable'}</span>
                <span style={{ color: comp.refund > 0 ? 'var(--success)' : 'var(--warn)' }}>{formatINR(comp.refund > 0 ? comp.refund : comp.balanceDue)}</span>
              </div>
              {comp.betterRegime && (
                <div style={{ marginBottom:12 }}>
                  <Badge variant="info"><TrendingUp size={11}/> {comp.betterRegime === 'old' ? 'Old' : 'New'} regime saves {formatINR(comp.savings)}</Badge>
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
            <div style={{ background:'var(--surface-3)', borderLeft:'3px solid var(--brand)', padding:'10px 14px', borderRadius:'0 8px 8px 0', marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--brand)', marginBottom:4 }}>AI note</div>
              <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.55 }}>{entry.ai_note}</p>
            </div>
          )}

          {/* Query box */}
          {queryMode && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6 }}>Message to client (sent via app):</div>
              <textarea value={queryText} onChange={e => setQueryText(e.target.value)} rows={3} style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--radius-md)', border:'1px solid var(--border-strong)', fontSize:13, lineHeight:1.5, background:'var(--surface)', color:'var(--text-primary)', resize:'none' }} />
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <Button variant="warn" size="sm" onClick={handleSendQuery} disabled={saving || !queryText.trim()}>
                  {saving ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={13}/>} Send query
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setQueryMode(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {queried && <div style={{ display:'flex', alignItems:'center', gap:6, color:'var(--success)', fontSize:13, marginBottom:12 }}><CheckCircle size={14}/> Query sent — return moved to "Awaiting client"</div>}

          {/* Actions */}
          {!queried && status !== 'approved' && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {critCount === 0 && (
                <Button variant="success" onClick={handleApprove} disabled={saving}>
                  {saving ? <Loader size={15} style={{ animation:'spin 1s linear infinite' }}/> : <CheckCircle size={15}/>} Approve & file
                </Button>
              )}
              <Button variant="warn" onClick={() => setQueryMode(q => !q)}>
                <MessageSquare size={15}/> {queryMode ? 'Cancel' : 'Query client'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
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
