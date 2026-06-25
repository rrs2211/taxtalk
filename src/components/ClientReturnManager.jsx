// src/components/ClientReturnManager.jsx
// Full return management for the client side:
// - View return status and tax summary
// - Message CA
// - Edit income computation (post-submission)
// - Manage documents (view, delete, replace)
// - Re-import AIS (when new TDS appears)
// - Add challan entries for taxes paid not in 26AS

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, MessageSquare, Edit3, Upload, Trash2, RefreshCw,
  CheckCircle, ChevronDown, ChevronUp, Send, Loader, X,
  PlusCircle, Eye, AlertTriangle, Info, Receipt, RotateCcw
} from 'lucide-react';
import { useTranslation, translate } from '../i18n.js';
import { supabase, getMyReturnsWithDocs, getMyDocuments, deleteDocument,
  clientUpdateComputation, addChallan, deleteChallan, getChallans,
  sendMessage, markMessagesRead, deleteReturn } from '../lib/supabase.js';
import { uploadDocument, validateFile, getDocumentUrl } from '../lib/storage.js';
import { computeTax, formatINR, formatINRShort } from '../data/flow.js';
import CGCollector from './CGCollector.jsx';
import { Card, Badge, Button } from './UI.jsx';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS = {
  in_progress: { label: 'In progress',   variant: 'info',    note: 'Your return is being prepared' },
  submitted:   { label: 'Under review',  variant: 'warn',    note: 'CA is reviewing your return' },
  queried:     { label: 'CA needs info', variant: 'danger',  note: 'Check messages — CA has a question' },
  approved:    { label: 'Approved',      variant: 'success', note: 'Return is approved and ready to file' },
  filed:       { label: 'Filed ✓',       variant: 'success', note: 'ITR successfully filed' },
  on_hold:     { label: 'On hold',       variant: 'neutral', note: 'CA has put this return on hold' },
};

const DOC_LABELS = {
  ais: 'AIS / Form 26AS',
  form16: 'Form 16',
  balance_sheet: 'Balance Sheet',
  pl_statement: 'P&L Statement',
  supporting_doc: 'Supporting document',
  ca_note: 'CA note',
};

// ── Spin helper ───────────────────────────────────────────────────────────────
const Spin = () => <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/>;

// ── Section header ─────────────────────────────────────────────────────────────
const SH = ({ t, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
    color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '12px 0 6px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
    {icon}{t}
  </div>
);

// ── Editable number field (inline) ────────────────────────────────────────────
function EF({ label, value, onChange, note, max }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</div>}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>₹</span>
          <input ref={ref} type="number" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { onChange(Math.min(parseInt(draft)||0, max||Infinity)); setEditing(false); }}
            onKeyDown={e => { if(e.key==='Enter'){ onChange(Math.min(parseInt(draft)||0, max||Infinity)); setEditing(false); }}}
            style={{ width: 110, padding: '5px 8px', border: '1.5px solid var(--brand)',
              borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
            autoFocus
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{formatINR(value||0)}</span>
          <button onClick={() => { setDraft(String(value||0)); setEditing(true); }}
            style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border-strong)',
              borderRadius: 5, background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Message thread ────────────────────────────────────────────────────────────
function MessageThread({ returnId, userId, onUnread }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ca_queries')
      .select('*, from_profile:from_user_id(id, full_name, email)')
      .eq('return_id', returnId).order('created_at', { ascending: true });
    setMsgs(data || []);
    const unread = (data||[]).filter(m => m.to_user_id===userId && !m.is_read).length;
    onUnread(unread);
    if (unread > 0) await markMessagesRead(returnId, userId).catch(()=>{});
  }, [returnId, userId, onUnread]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`msg_${returnId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ca_queries', filter: `return_id=eq.${returnId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [returnId, load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  function getCAId() { return msgs.find(m => m.from_user_id !== userId)?.from_user_id || null; }

  async function send() {
    if (!text.trim()) return;
    const caId = getCAId();
    if (!caId) { alert('No CA assigned to this return yet.'); return; }
    setSending(true);
    try { await sendMessage(returnId, userId, caId, text.trim()); setText(''); load(); }
    catch(e) { alert(e.message); } finally { setSending(false); }
  }

  async function attach(file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    const caId = getCAId();
    if (!caId) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(file, returnId, 'supporting_doc', ()=>{});
      await sendMessage(returnId, userId, caId, `📎 Document attached: ${file.name}`);
      load();
    } catch(e) { alert('Upload failed: ' + e.message); }
    finally { setUploading(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 300 }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
            No messages yet. You can message your CA here.
          </div>
        )}
        {msgs.map(m => {
          const isMe = m.from_user_id === userId;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '82%', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, textAlign: isMe ? 'right' : 'left' }}>
                  {isMe ? 'You' : (m.from_profile?.full_name || 'CA team')}
                </div>
                <div style={{ background: isMe ? 'var(--brand)' : 'var(--surface-3)',
                  color: isMe ? '#fff' : 'var(--text-primary)',
                  borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  padding: '9px 13px', fontSize: 13, lineHeight: 1.55,
                  border: isMe ? 'none' : '1px solid var(--border)',
                  wordBreak: 'break-word' }}>
                  {m.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 6 }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && attach(e.target.files[0])}/>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', minHeight: 44 }}>
          {uploading ? <Spin/> : <Upload size={14}/>}
        </button>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key==='Enter' && !e.shiftKey && text.trim() && send()}
          placeholder="Message your CA..."
          style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--border-strong)', borderRadius: 8,
            fontSize: 16, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)', minWidth: 0 }}
        />
        <Button variant="primary" onClick={send} disabled={sending || !text.trim()} style={{ flexShrink: 0 }}>
          {sending ? <Spin/> : <Send size={14}/>}
        </Button>
      </div>
    </div>
  );
}

// ── Document manager ─────────────────────────────────────────────────────────
function DocumentManager({ returnId, userId, onAISReplaced, onDocReplaced }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(null);
  const fileInputs = useRef({});

  async function load() {
    setLoading(true);
    const d = await getMyDocuments(returnId).catch(() => []);
    setDocs(d); setLoading(false);
  }

  useEffect(() => { load(); }, [returnId]);

  async function handleView(doc) {
    try {
      const url = await getDocumentUrl(doc.id);
      setViewing({ url, name: doc.original_name });
    } catch(e) { alert('Could not open document: ' + e.message); }
  }

  async function handleDelete(doc) {
    if (!confirm(`Delete "${doc.original_name}"? This cannot be undone.`)) return;
    setDeleting(doc.id);
    try {
      await deleteDocument(doc.id);
      setDocs(d => d.filter(x => x.id !== doc.id));
    } catch(e) { alert(e.message); }
    finally { setDeleting(null); }
  }

  async function handleReplace(doc, file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    setUploading(doc.id);
    try {
      // Soft delete old doc
      await deleteDocument(doc.id);
      // Upload new doc of same type
      const newDoc = await uploadDocument(file, returnId, doc.doc_type, ()=>{});
      // Extract from new doc
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: newDoc.id }),
      });
      const { extracted } = await res.json();
      // Notify parent to update computation
      if (doc.doc_type === 'ais') onAISReplaced(extracted, newDoc);
      else onDocReplaced(doc.doc_type, extracted, newDoc);
      load();
    } catch(e) { alert('Replace failed: ' + e.message); }
    finally { setUploading(null); }
  }

  if (loading) return <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}><Spin/> Loading documents...</div>;

  return (
    <>
      {/* Document viewer overlay */}
      {viewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 8, marginBottom: 10,
            display: 'flex', gap: 12, alignItems: 'center', maxWidth: '92vw' }}>
            <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewing.name}</span>
            <a href={viewing.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontSize: 12, flexShrink: 0 }}>Open in new tab</a>
            <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <X size={18}/>
            </button>
          </div>
          <iframe src={viewing.url} style={{ width: '92vw', height: '78dvh', border: 'none', borderRadius: 8 }} title="Document"/>
        </div>
      )}

      {docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
          No documents uploaded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
              background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={16} color="var(--brand)" style={{ flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {DOC_LABELS[doc.doc_type] || doc.doc_type}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {doc.original_name} · {new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <Badge variant={doc.extraction_status === 'success' ? 'success' : doc.extraction_status === 'failed' ? 'danger' : 'neutral'}>
                {doc.extraction_status === 'success' ? '✓ Read' : doc.extraction_status === 'failed' ? '✗ Error' : doc.extraction_status}
              </Badge>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => handleView(doc)} title="View"
                  style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--brand)' }}>
                  <Eye size={13}/>
                </button>
                <input type="file" ref={el => fileInputs.current[doc.id] = el}
                  accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleReplace(doc, e.target.files[0])}/>
                <button onClick={() => fileInputs.current[doc.id]?.click()} disabled={!!uploading} title="Replace"
                  style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--warn)' }}>
                  {uploading === doc.id ? <Spin/> : <RefreshCw size={13}/>}
                </button>
                <button onClick={() => handleDelete(doc)} disabled={deleting === doc.id} title="Delete"
                  style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--danger)' }}>
                  {deleting === doc.id ? <Spin/> : <Trash2 size={13}/>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── AIS Reimport panel ────────────────────────────────────────────────────────
function AISReimport({ returnId, aisVersion, onImported, lastImported }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  async function handleAIS(file) {
    const err = validateFile(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      const doc = await uploadDocument(file, returnId, 'ais', p => setProgress(p));
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error('Extraction failed');
      const { extracted } = await res.json();
      // Update ais_version and last_imported
      await supabase.from('returns').update({
        ais_version: (aisVersion || 1) + 1,
        ais_last_imported: new Date().toISOString(),
      }).eq('id', returnId);
      onImported(extracted, doc);
    } catch(e) { alert('AIS import failed: ' + e.message); }
    finally { setUploading(false); setProgress(0); }
  }

  return (
    <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <RefreshCw size={16} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand)', marginBottom: 4 }}>
            Reimport AIS / Form 26AS
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
            If you have paid tax after the last import, or if TDS has now appeared in your AIS,
            download a fresh AIS from incometax.gov.in and upload it here. TDS and advance tax
            figures will be updated automatically.
          </p>
          {lastImported && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Last imported: {new Date(lastImported).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {aisVersion > 1 && ` · Version ${aisVersion}`}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleAIS(e.target.files[0])}/>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-primary"
            style={{ fontSize: 13, minHeight: 40 }}>
            {uploading ? <><Spin/> Reading AIS... {progress > 0 ? `${progress}%` : ''}</> : <><Upload size={14}/> Upload updated AIS</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Challan entry panel ───────────────────────────────────────────────────────
function ChallanPanel({ returnId, userId, onChallanAdded }) {
  const [challans, setChallans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: 'self_assessment', amount: '', payment_date: '', bsr_code: '', serial_no: '', bank_name: '', remarks: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const c = await getChallans(returnId).catch(() => []);
    setChallans(c); setLoading(false);
  }

  useEffect(() => { load(); }, [returnId]);

  async function handleAdd() {
    if (!form.amount || !form.payment_date) { alert('Amount and payment date are required'); return; }
    setSaving(true);
    try {
      const c = await addChallan(returnId, userId, {
        ...form,
        amount: parseInt(form.amount.replace(/[^0-9]/g, '')) || 0,
        not_in_26as: true,
      });
      setChallans(prev => [...prev, c]);
      setForm({ type: 'self_assessment', amount: '', payment_date: '', bsr_code: '', serial_no: '', bank_name: '', remarks: '' });
      setAdding(false);
      onChallanAdded(c);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this challan entry?')) return;
    await deleteChallan(id).catch(e => alert(e.message));
    setChallans(c => c.filter(x => x.id !== id));
  }

  const INP = { style: { width: '100%', padding: '8px 10px', border: '1.5px solid var(--border-strong)', borderRadius: 6, fontSize: 16, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' } };
  const LBL = { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 } };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {loading ? 'Loading...' : challans.length === 0 ? 'No challan entries yet' : `${challans.length} challan(s) on record`}
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding(a => !a)}>
          {adding ? <X size={13}/> : <PlusCircle size={13}/>} {adding ? 'Cancel' : 'Add challan'}
        </Button>
      </div>

      {/* Existing challans */}
      {challans.map(c => (
        <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Receipt size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{formatINR(c.amount)}</span>
              <Badge variant={c.not_in_26as ? 'warn' : 'success'}>{c.not_in_26as ? 'Not in 26AS' : 'In 26AS'}</Badge>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {c.type.replace('_', ' ')} · {c.payment_date}
              {c.bsr_code && ` · BSR: ${c.bsr_code}`}
              {c.serial_no && ` / ${c.serial_no}`}
            </div>
            {c.remarks && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.remarks}</div>}
          </div>
          <button onClick={() => handleDelete(c.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, padding: 4 }}>
            <Trash2 size={13}/>
          </button>
        </div>
      ))}

      {/* Add form */}
      {adding && (
        <div style={{ border: '1.5px solid var(--brand)', borderRadius: 10, padding: 14, background: 'var(--brand-light)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand)', marginBottom: 12 }}>
            Enter tax payment details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div>
              <label {...LBL}>Payment type *</label>
              <select {...INP} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="self_assessment">Self-assessment tax (300)</option>
                <option value="advance_tax">Advance tax (302)</option>
              </select>
            </div>
            <div>
              <label {...LBL}>Amount (₹) *</label>
              <input {...INP} type="number" inputMode="numeric" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Enter amount"/>
            </div>
            <div>
              <label {...LBL}>Date of payment *</label>
              <input {...INP} type="date" value={form.payment_date}
                onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}/>
            </div>
            <div>
              <label {...LBL}>BSR code (7 digits)</label>
              <input {...INP} value={form.bsr_code} onChange={e => setForm(f => ({ ...f, bsr_code: e.target.value }))}
                placeholder="e.g. 0002410" maxLength={7}/>
            </div>
            <div>
              <label {...LBL}>Challan serial no.</label>
              <input {...INP} value={form.serial_no} onChange={e => setForm(f => ({ ...f, serial_no: e.target.value }))}
                placeholder="e.g. 00025"/>
            </div>
            <div>
              <label {...LBL}>Bank name</label>
              <input {...INP} value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder="HDFC Bank / SBI / etc."/>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label {...LBL}>Remarks (optional)</label>
            <input {...INP} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              placeholder="e.g. Paid for AY 2026-27 balance due"/>
          </div>
          <div style={{ background: 'var(--warn-light)', border: '1px solid #fcd34d', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 12 }}>
            ⚠️ Enter the BSR code and challan serial number from your bank receipt / CIN for these to appear correctly in your ITR JSON.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd} disabled={saving}>
              {saving ? <Spin/> : <PlusCircle size={14}/>} Save challan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Computation editor for clients ────────────────────────────────────────────
function ClientComputationEditor({ returnId, userId, initialComp, onSaved }) {
  const [inp, setInp] = useState({ ...initialComp });
  const [saving, setSaving] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  const set = key => val => setInp(p => ({ ...p, [key]: val }));
  const comp = computeTax(inp);
  const regime = inp.betterRegime || comp.betterRegime;
  const selTax = regime === 'old' ? comp.oldTax : comp.newTax;
  const refund = Math.max(0, (comp.totalPaid||0) - selTax);
  const balance = Math.max(0, selTax - (comp.totalPaid||0));

  async function handleSave() {
    if (!changeNote.trim()) { alert('Please describe what you changed before saving'); return; }
    setSaving(true);
    try {
      const final = { ...comp, betterRegime: regime, chosenTax: selTax, balanceDue: balance, refund,
        // preserve full CG object
        capitalGains: inp.capitalGains,
        houseProperty: inp.houseProperty,
        bankAccounts: inp.bankAccounts,
        employerTAN: inp.employerTAN,
        employerName: inp.employerName,
        bizName: inp.bizName, bizTurnover: inp.bizTurnover, bizCashPct: inp.bizCashPct,
        bizCodeAD: inp.bizCodeAD, gstin: inp.gstin,
        bsCapital: inp.bsCapital, bsBank: inp.bsBank, bsCash: inp.bsCash,
        bsDebtors: inp.bsDebtors, bsCreditors: inp.bsCreditors,
        profile: inp.profile, ageGroup: inp.ageGroup,
        savingsInterest: inp.savingsInterest, fdInterest: inp.fdInterest,
      };
      await clientUpdateComputation(returnId, userId, final, changeNote);
      onSaved(final, changeNote);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const SH2 = ({ t }) => <div style={{ padding: '6px 0', fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', marginBottom: 8, marginTop: 14 }}>{t}</div>;

  return (
    <div>
      {/* Live summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross income</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatINR(comp.grossTotal)}</div>
        </div>
        <div style={{ background: refund > 0 ? 'var(--success-light)' : balance > 0 ? 'var(--warn-light)' : 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{refund > 0 ? 'Refund' : balance > 0 ? 'Balance due' : 'No balance'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: refund > 0 ? 'var(--success)' : balance > 0 ? 'var(--warn)' : 'var(--text-muted)', marginTop: 2 }}>
            {refund > 0 ? formatINR(refund) : balance > 0 ? formatINR(balance) : '₹0'}
          </div>
        </div>
      </div>

      <SH2 t="Salary income"/>
      <EF label="Gross salary" value={inp.grossSalary||0} onChange={set('grossSalary')}/>
      <EF label="Standard deduction" value={inp.standardDeduction||75000} onChange={set('standardDeduction')} max={75000} note="Max ₹75,000"/>
      <EF label="Professional tax" value={inp.professionalTax||0} onChange={set('professionalTax')} max={2500}/>

      <SH2 t="Other source income"/>
      <EF label="Savings bank interest" value={inp.savingsInterest||inp.interestIncome||0} onChange={v => setInp(p => ({...p, savingsInterest: v, interestIncome: v + (p.fdInterest||0)}))} note="80TTA — max ₹10K deductible"/>
      <EF label="FD / RD interest" value={inp.fdInterest||0} onChange={v => setInp(p => ({...p, fdInterest: v, interestIncome: (p.savingsInterest||0) + v}))}/>
      <EF label="Dividends" value={inp.dividendIncome||0} onChange={set('dividendIncome')}/>
      <EF label="Other income" value={inp.otherIncome||0} onChange={set('otherIncome')}/>

      <SH2 t="Capital gains"/>
      <CGCollector compact value={inp.capitalGains || { enabled: false }}
        onChange={cg => setInp(p => ({ ...p, capitalGains: cg }))}/>

      <SH2 t="Deductions (old regime)"/>
      <EF label="Section 80C" value={inp.deductions80C||0} onChange={set('deductions80C')} max={150000} note="Max ₹1,50,000"/>
      <EF label="Section 80D (mediclaim)" value={inp.deductions80D||0} onChange={set('deductions80D')} max={75000} note="Max ₹75,000"/>
      <EF label="Home loan interest (24b)" value={inp.deductions24b||0} onChange={set('deductions24b')} max={200000}/>
      <EF label="Education loan (80E)" value={inp.deductions80E||0} onChange={set('deductions80E')}/>
      <EF label="Donations (80G)" value={inp.deductions80G||0} onChange={set('deductions80G')}/>

      <SH2 t="Taxes paid"/>
      <EF label="TDS deducted" value={inp.tdsDeducted||0} onChange={set('tdsDeducted')}/>
      <EF label="Advance tax paid" value={inp.advanceTax||0} onChange={set('advanceTax')}/>
      <EF label="Self-assessment tax" value={inp.selfAssessment||0} onChange={set('selfAssessment')}/>

      {/* Change note — required */}
      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
          What did you change? (required — CA will see this) *
        </label>
        <textarea value={changeNote} onChange={e => setChangeNote(e.target.value)} rows={2}
          placeholder="e.g. Updated FD interest from ₹45,000 to ₹52,000 as per actual bank statement"
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border-strong)', borderRadius: 8,
            fontSize: 13, lineHeight: 1.5, background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}/>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={handleSave} disabled={saving || !changeNote.trim()} style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? <><Spin/> Saving…</> : <><CheckCircle size={14}/> Save & notify CA</>}
        </Button>
      </div>
    </div>
  );
}


// ── Return stage timeline ─────────────────────────────────────────────────────
const STAGES = [
  { id: 'in_progress', labelKey: 'stage.in_progress', icon: '📝' },
  { id: 'submitted',   labelKey: 'stage.submitted',   icon: '🔍' },
  { id: 'approved',    labelKey: 'stage.approved',    icon: '✅' },
  { id: 'filed',       labelKey: 'stage.filed',       icon: '🎉' },
];

function ReturnTimeline({ currentStatus, ackNo, filedAt, lang = 'en' }) {
  const T = (k) => translate(k, lang);
  const statusOrder = ['in_progress', 'submitted', 'approved', 'filed'];
  // For queried, show it at submitted level
  const effectiveStatus = currentStatus === 'queried' ? 'submitted' : currentStatus;
  const currentIdx = statusOrder.indexOf(effectiveStatus);

  return (
    <div style={{ padding: '14px 0', marginBottom: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Filing progress</div>
      <div style={{ position: 'relative' }}>
        {/* Progress line */}
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, height: 2, background: 'var(--border)', zIndex: 0 }}>
          <div style={{ height: '100%', background: 'var(--brand)', width: `${Math.min(100, (currentIdx / (statusOrder.length - 1)) * 100)}%`, transition: 'width 0.5s ease' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          {statusOrder.map((stage, idx) => {
            const isComplete = idx < currentIdx;
            const isCurrent  = idx === currentIdx;
            const stage_data = STAGES.find(s => s.id === stage) || STAGES[idx];
            return (
              <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isComplete ? 'var(--brand)' : isCurrent ? 'var(--brand)' : 'var(--surface)',
                  border: `2px solid ${isComplete || isCurrent ? 'var(--brand)' : 'var(--border-strong)'}`,
                  fontSize: 14, marginBottom: 6,
                  boxShadow: isCurrent ? '0 0 0 4px var(--brand-light)' : 'none',
                }}>
                  {isComplete ? '✓' : stage_data?.icon || '○'}
                </div>
                <div style={{ fontSize: 10, textAlign: 'center', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'var(--brand)' : isComplete ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.3, maxWidth: 60 }}>
                  {stage_data?.labelKey ? T(stage_data.labelKey) : (stage_data?.label || stage)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Clarification notice */}
      {currentStatus === 'queried' && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--warn-light)', borderRadius: 8, fontSize: 12, color: '#92400e', display: 'flex', gap: 6 }}>
          💬 Your CA has a question. Check the Messages tab.
        </div>
      )}
      {/* Filed acknowledgment */}
      {currentStatus === 'filed' && ackNo && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--success-light)', borderRadius: 8, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
          🎉 Filed! Acknowledgment No: <span style={{ fontFamily: 'monospace' }}>{ackNo}</span>
          {filedAt && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>Filed on: {new Date(filedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
        </div>
      )}
    </div>
  );
}

// ── Return card — full featured ───────────────────────────────────────────────
function ReturnCard({ ret, userId, onDelete, onUpdate, lang = 'en' }) {
  const T = (k) => translate(k, lang);
  const [expanded, setExpanded]   = useState(false);
  const [activeTab, setActiveTab] = useState('messages');
  const [unread, setUnread]       = useState(0);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [computation, setComp]    = useState(ret.computation || {});
  const [retData, setRetData]     = useState(ret);
  const [showEditNotice, setEditNotice] = useState(false);

  const cfg     = STATUS[ret.status] || STATUS.in_progress;
  const refund  = computation.refund    || 0;
  const balance = computation.balanceDue|| 0;
  const canDelete = ['in_progress', 'submitted'].includes(ret.status);
  const canEdit   = ['submitted', 'queried'].includes(ret.status);

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try { await deleteReturn(ret.id, userId); onDelete(ret.id); }
    catch(e) { alert(e.message); setDeleting(false); setConfirmDel(false); }
  }

  function handleAISReplaced(extracted, doc) {
    // Update TDS and advance tax from new AIS
    const newTDS   = extracted.total_tds || (extracted.tds_summary||[]).reduce((s,x)=>s+(x.tds_deducted||0),0);
    const newAdvTax= extracted.total_advance_tax || (extracted.advance_tax||[]).reduce((s,x)=>s+(x.amount||0),0);
    const updated  = { ...computation, tdsDeducted: newTDS, advanceTax: newAdvTax, totalPaid: newTDS + newAdvTax + (computation.selfAssessment||0) };
    const recomputed = computeTax(updated);
    const final = { ...updated, ...recomputed };
    setComp(final);
    clientUpdateComputation(ret.id, userId, final, 'AIS reimported — TDS and advance tax updated').catch(console.error);
    onUpdate(ret.id, final);
  }

  function handleChallanAdded(challan) {
    // Add to computation taxes paid
    const type = challan.type === 'advance_tax' ? 'advanceTax' : 'selfAssessment';
    const updated = { ...computation, [type]: (computation[type]||0) + challan.amount };
    const recomputed = computeTax(updated);
    setComp({ ...updated, ...recomputed });
    clientUpdateComputation(ret.id, userId, { ...updated, ...recomputed }, `Challan added: ${challan.type} ₹${challan.amount}`).catch(console.error);
  }

  const TABS = [
    { id: 'messages',   label: 'Messages' },
    { id: 'edit',       label: 'Edit details',   hide: !canEdit },
    { id: 'challans',   label: 'Tax payments' },
    { id: 'documents',  label: 'Documents' },
    { id: 'ais',        label: 'Reimport AIS',   hide: !canEdit },
  ].filter(t => !t.hide);

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,var(--brand-light),#ede9fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="var(--brand)"/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            AY {ret.assessment_year} — {ret.itr_form || 'ITR'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
            {cfg.note}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {unread > 0 && <Badge variant="danger">{unread}</Badge>}
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {expanded ? <ChevronUp size={15} color="var(--text-muted)"/> : <ChevronDown size={15} color="var(--text-muted)"/>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          {/* Return stage timeline */}
          <ReturnTimeline currentStatus={ret.status} ackNo={ret.acknowledgement_no} filedAt={ret.filed_at} lang={lang}/>

          {/* Tax summary tiles */}
          {Object.keys(computation).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { l: 'Gross income', v: formatINRShort(computation.grossTotal||0) },
                { l: 'Tax',          v: formatINRShort(computation.chosenTax||0) },
                { l: refund>0?'Refund':'Balance', v: refund>0?formatINRShort(refund):formatINRShort(balance), c: refund>0?'var(--success)':balance>0?'var(--warn)':'var(--text-muted)' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{item.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: item.c || 'var(--text-primary)' }}>{item.v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filed acknowledgment */}
          {ret.acknowledgement_no && (
            <div style={{ display: 'flex', gap: 6, padding: '9px 12px', background: 'var(--success-light)', borderRadius: 8, fontSize: 13, color: 'var(--success)', marginBottom: 12 }}>
              <CheckCircle size={15} style={{ flexShrink: 0, marginTop: 1 }}/> Filed · Ack: <strong>{ret.acknowledgement_no}</strong>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, fontWeight: activeTab===t.id ? 600 : 400,
                  color: activeTab===t.id ? 'var(--brand)' : 'var(--text-secondary)',
                  borderBottom: `2px solid ${activeTab===t.id ? 'var(--brand)' : 'transparent'}`,
                  whiteSpace: 'nowrap' }}>
                {t.label}
                {t.id === 'messages' && unread > 0 && ` (${unread})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'messages' && (
            <MessageThread returnId={ret.id} userId={userId} onUnread={setUnread}/>
          )}

          {activeTab === 'edit' && canEdit && (
            <>
              <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                <Info size={13} color="var(--brand)" style={{ verticalAlign: 'middle', marginRight: 5 }}/>
                You can correct income details here. All changes will be notified to your CA immediately.
              </div>
              <ClientComputationEditor
                returnId={ret.id} userId={userId} initialComp={computation}
                onSaved={(final, note) => {
                  setComp(final);
                  setEditNotice(true);
                  onUpdate(ret.id, final);
                  setTimeout(() => setEditNotice(false), 4000);
                }}
              />
              {showEditNotice && (
                <div style={{ padding: '10px 14px', background: 'var(--success-light)', borderRadius: 8, fontSize: 13, color: 'var(--success)', marginTop: 10 }}>
                  <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 5 }}/> Saved — CA has been notified
                </div>
              )}
            </>
          )}

          {activeTab === 'challans' && (
            <ChallanPanel returnId={ret.id} userId={userId} onChallanAdded={handleChallanAdded}/>
          )}

          {activeTab === 'documents' && (
            <DocumentManager
              returnId={ret.id} userId={userId}
              onAISReplaced={handleAISReplaced}
              onDocReplaced={(docType, extracted, doc) => {
                // For Form16 replacements, update salary / TDS
                if (docType === 'form16') {
                  const updated = { ...computation, grossSalary: extracted.gross_salary || computation.grossSalary, tdsDeducted: extracted.total_tds_deducted || computation.tdsDeducted };
                  const recomp = computeTax(updated);
                  setComp({ ...updated, ...recomp });
                  clientUpdateComputation(ret.id, userId, { ...updated, ...recomp }, `Form 16 replaced — salary and TDS updated`).catch(console.error);
                }
              }}
            />
          )}

          {activeTab === 'ais' && canEdit && (
            <AISReimport
              returnId={ret.id}
              aisVersion={retData.ais_version || 1}
              lastImported={retData.ais_last_imported}
              onImported={(extracted, doc) => {
                handleAISReplaced(extracted, doc);
                setRetData(r => ({ ...r, ais_version: (r.ais_version||1)+1, ais_last_imported: new Date().toISOString() }));
              }}
            />
          )}

          {/* Delete */}
          {canDelete && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              {confirmDel && <span style={{ fontSize: 12, color: 'var(--danger)', alignSelf: 'center' }}>Tap again to confirm</span>}
              <Button variant={confirmDel ? 'danger' : 'ghost'} size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Spin/> : <Trash2 size={13}/>} {confirmDel ? 'Confirm delete' : 'Delete return'}
              </Button>
              {confirmDel && <Button variant="secondary" size="sm" onClick={() => setConfirmDel(false)}><X size={13}/></Button>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ClientReturnManager({ userId, lang: langProp = 'en' }) {
  const { lang: langCtx } = useTranslation();
  const lang = langProp || langCtx || 'en';
  const T = (k) => translate(k, lang);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await getMyReturnsWithDocs(userId).catch(() => []);
    setReturns(r);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  function handleUpdate(returnId, newComp) {
    setReturns(rs => rs.map(r => r.id === returnId ? { ...r, computation: newComp } : r));
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{T('returns.title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{T('returns.subtitle')}</p>
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
          key={r.id}
          ret={r}
          userId={userId}
          lang={lang}
          onDelete={id => setReturns(rs => rs.filter(r => r.id !== id))}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
