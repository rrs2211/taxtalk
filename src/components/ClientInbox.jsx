import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, FileText, CheckCircle, Clock, Send, ChevronDown, ChevronUp, Loader, Upload, Trash2, X } from 'lucide-react';
import { supabase, getMyCAQueries, getMyReturns, deleteReturn, sendMessage, markMessagesRead } from '../lib/supabase.js';
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

// ── Return thread — all messages for one return ───────────────────────────────
function ReturnThread({ returnId, userId, caName, onUnreadChange }) {
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [reply,     setReply]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef  = useRef(null);
  const bottomRef= useRef(null);

  async function load() {
    const { data } = await supabase
      .from('ca_queries')
      .select('*, from_profile:from_user_id(id, full_name, email)')
      .eq('return_id', returnId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    // Count unread (messages TO this user not yet read)
    const unread = (data || []).filter(m => m.to_user_id === userId && !m.is_read).length;
    onUnreadChange(unread);
    // Mark all as read
    if (unread > 0) {
      await markMessagesRead(returnId, userId).catch(() => {});
    }
  }

  useEffect(() => {
    load();
    const ch = supabase.channel(`thread_${returnId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ca_queries', filter: `return_id=eq.${returnId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [returnId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Find the CA user from messages to reply to
  function getCAUserId() {
    const caMsg = messages.find(m => m.from_user_id !== userId);
    return caMsg?.from_user_id || null;
  }

  async function handleSend() {
    if (!reply.trim()) return;
    const caId = getCAUserId();
    if (!caId) { alert('No CA assigned yet'); return; }
    setSending(true);
    try {
      await sendMessage(returnId, userId, caId, reply.trim());
      setReply(''); load();
    } catch(e) { alert(e.message); }
    finally { setSending(false); }
  }

  async function handleDocUpload(file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    const caId = getCAUserId();
    if (!caId) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(file, returnId, 'supporting_doc', p => setUploadPct(p));
      await sendMessage(returnId, userId, caId, `📎 Document uploaded: ${file.name} (ID: ${doc.id})`);
      load();
    } catch(e) { alert('Upload failed: ' + e.message); }
    finally { setUploading(false); setUploadPct(0); }
  }

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/> Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            No messages yet. Your CA will reach out here if they need information.
          </div>
        )}
        {messages.map(m => {
          const isMe = m.from_user_id === userId;
          const sender = isMe ? 'You' : (m.from_profile?.full_name || caName || 'CA team');
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '82%', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textAlign: isMe ? 'right' : 'left' }}>{sender}</div>
                <div style={{
                  background: isMe ? 'var(--brand)' : 'var(--surface-3)',
                  color: isMe ? '#fff' : 'var(--text-primary)',
                  borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  padding: '9px 13px', fontSize: 13, lineHeight: 1.55,
                  border: isMe ? 'none' : '1px solid var(--border)',
                }}>
                  {m.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {!isMe && !m.is_read && <span style={{ marginLeft: 4, color: 'var(--brand)', fontWeight: 600 }}>• New</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 6 }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleDocUpload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach document"
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
          {uploading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Upload size={14}/>}
        </button>
        <input
          value={reply} onChange={e => setReply(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && reply.trim() && handleSend()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--border-strong)', borderRadius: 8, fontSize: 16, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)', minWidth: 0 }}
        />
        <Button variant="primary" onClick={handleSend} disabled={sending || !reply.trim()}>
          {sending ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }}/> : <Send size={13}/>}
        </Button>
      </div>
    </div>
  );
}

// ── Return history card ───────────────────────────────────────────────────────
function ReturnCard({ ret, userId, caName, onDelete }) {
  const [expanded, setExpanded]     = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [unread, setUnread]         = useState(0);

  const cfg  = STATUS[ret.status] || STATUS.in_progress;
  const comp = ret.computation || {};
  const refund  = comp.refund    || 0;
  const balance = comp.balanceDue|| 0;
  const canDelete = ['in_progress', 'submitted'].includes(ret.status);

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try { await deleteReturn(ret.id, userId); onDelete(ret.id); }
    catch(e) { alert(e.message); setDeleting(false); setConfirmDel(false); }
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="var(--text-muted)"/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>AY {ret.assessment_year} — {ret.itr_form || 'ITR'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {ret.profile} · {new Date(ret.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unread > 0 && <Badge variant="danger">{unread} new</Badge>}
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {expanded ? <ChevronUp size={15} color="var(--text-muted)"/> : <ChevronDown size={15} color="var(--text-muted)"/>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          {/* Tax summary */}
          {comp && Object.keys(comp).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12, minWidth: 0 }}>
              {[
                { l: 'Gross income',    v: formatINR(comp.grossTotal || 0) },
                { l: 'Tax payable',     v: formatINR(comp.chosenTax  || 0) },
                { l: refund > 0 ? 'Refund' : 'Balance', v: refund > 0 ? formatINR(refund) : formatINR(balance), c: refund > 0 ? 'var(--success)' : 'var(--warn)' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{item.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: item.c || 'var(--text-primary)' }}>{item.v}</div>
                </div>
              ))}
            </div>
          )}

          {ret.acknowledgement_no && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--success-light)', borderRadius: 8, fontSize: 13, color: 'var(--success)', marginBottom: 12 }}>
              <CheckCircle size={14}/> Filed · Ack: {ret.acknowledgement_no}
            </div>
          )}

          {/* Message thread */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Messages with CA</div>
            <ReturnThread returnId={ret.id} userId={userId} caName={caName} onUnreadChange={setUnread} />
          </div>

          {canDelete && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {confirmDel && <span style={{ fontSize: 13, color: 'var(--danger)', alignSelf: 'center' }}>Tap again to confirm delete</span>}
              <Button variant={confirmDel ? 'danger' : 'ghost'} size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }}/> : <Trash2 size={13}/>}
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

// ── Main ClientInbox ──────────────────────────────────────────────────────────
export default function ClientInbox({ userId }) {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await getMyReturns(userId);
      setReturns(r);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [userId]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>My Returns</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Track your filing status and message your CA directly</p>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, color: 'var(--text-muted)' }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }}/> Loading...
        </div>
      )}

      {!loading && returns.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
            <FileText size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>No returns yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Start filing from the "File my return" tab</div>
          </div>
        </Card>
      )}

      {!loading && returns.map(r => (
        <ReturnCard
          key={r.id} ret={r} userId={userId}
          onDelete={id => setReturns(rs => rs.filter(r => r.id !== id))}
        />
      ))}
    </div>
  );
}
