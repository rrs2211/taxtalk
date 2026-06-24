// src/components/CGTransactionImporter.jsx
// Imports capital gain transactions from broker CSV/Excel/PDF
// Supports: Zerodha Tax P&L, Groww Tax Report, Angel One, generic format
// Computes STCG 111A, LTCG 112A, property gains with full sale/purchase detail

import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet, Info, X } from 'lucide-react';
import { formatINR } from '../data/flow.js';
import { supabase } from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

// ── AI-powered transaction extraction ─────────────────────────────────────────
async function extractCGFromDoc(file, returnId) {
  const { data: { session } } = await supabase.auth.getSession();

  // Upload the file first
  const validateErr = file.size > 10 * 1024 * 1024 ? 'File must be under 10MB' : null;
  if (validateErr) throw new Error(validateErr);

  const ext = file.name.split('.').pop().toLowerCase();
  const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // Get presigned URL
  const urlRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ returnId, docType: 'supporting_doc', fileName: file.name, fileSize: file.size, contentType }),
  });
  const { uploadUrl, key } = await urlRes.json();

  // Upload to R2
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.addEventListener('load', () => xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.send(file);
  });

  // Register
  const regRes = await fetch('/api/register-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ returnId, docType: 'supporting_doc', key, fileName: file.name, fileSizeKb: Math.round(file.size / 1024) }),
  });
  const { document: doc } = await regRes.json();

  // Extract CG using AI with specialized prompt
  const extractRes = await fetch('/api/extract-cg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ documentId: doc.id }),
  });

  if (!extractRes.ok) throw new Error('Could not extract capital gains from this document');
  const { extracted } = await extractRes.json();
  return { extracted, docId: doc.id };
}

// ── Manual transaction entry ───────────────────────────────────────────────────
function ManualEntry({ onAdd }) {
  const [type, setType] = useState('equity_stcg');
  const [sale,     setSale]    = useState('');
  const [cost,     setCost]    = useState('');
  const [fmv,      setFmv]     = useState('');
  const [exp,      setExp]     = useState('');
  const [desc,     setDesc]    = useState('');

  const saleN = parseFloat(sale) || 0;
  const costN = parseFloat(cost) || 0;
  const fmvN  = parseFloat(fmv)  || 0;
  const expN  = parseFloat(exp)  || 0;
  const acqCost = type === 'equity_ltcg' ? Math.max(fmvN, costN) : costN;
  const net   = Math.max(0, saleN - acqCost - expN);

  function handleAdd() {
    if (!saleN || !costN) { alert('Sale proceeds and purchase cost are required'); return; }
    onAdd({ type, saleValue: saleN, purchaseCost: costN, fmv31Jan18: fmvN, expenses: expN, gain: net, description: desc });
    setSale(''); setCost(''); setFmv(''); setExp(''); setDesc('');
  }

  const INP = { style: { width: '100%', padding: '8px 10px', border: '1.5px solid var(--border-strong)', borderRadius: 6, fontSize: 16, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' } };

  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px', marginTop: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add transaction manually</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Transaction type</label>
          <select {...INP} value={type} onChange={e => setType(e.target.value)}>
            <option value="equity_stcg">Equity / Equity MF — STCG (held {'<'} 12 months)</option>
            <option value="equity_ltcg">Equity / Equity MF — LTCG (held ≥ 12 months)</option>
            <option value="property_ltcg">Property / Land — LTCG</option>
            <option value="other">Other asset</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Description (optional)</label>
          <input {...INP} value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Reliance Industries, Axis Bluechip MF"/>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Sale proceeds (₹) *</label>
          <input {...INP} type="number" value={sale} onChange={e => setSale(e.target.value)} placeholder="Total sale value"/>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            {type === 'property_ltcg' ? 'Indexed cost of acquisition (₹) *' : 'Purchase cost (₹) *'}
          </label>
          <input {...INP} type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="Total purchase cost"/>
        </div>
        {type === 'equity_ltcg' && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>FMV as on 31 Jan 2018 (₹)</label>
            <input {...INP} type="number" value={fmv} onChange={e => setFmv(e.target.value)} placeholder="From broker report"/>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Transfer expenses (₹)</label>
          <input {...INP} type="number" value={exp} onChange={e => setExp(e.target.value)} placeholder="Brokerage, STT etc."/>
        </div>
      </div>
      {saleN > 0 && costN > 0 && (
        <div style={{ background: net >= 0 ? 'var(--success-light)' : 'var(--danger-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
          Net gain: <strong style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatINR(net)}</strong>
          {type === 'equity_ltcg' && net > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Taxable above ₹1.25L: {formatINR(Math.max(0, net - 125000))}</span>}
        </div>
      )}
      <button onClick={handleAdd} className="btn btn-primary" style={{ fontSize: 13 }}>
        <CheckCircle size={14}/> Add transaction
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CGTransactionImporter({ returnId, value = {}, onChange }) {
  const [uploading,   setUploading]   = useState(false);
  const [extracting,  setExtracting]  = useState(false);
  const [imported,    setImported]    = useState(false);
  const [showManual,  setShowManual]  = useState(false);
  const [uploadErr,   setUploadErr]   = useState(null);
  const fileRef = useRef(null);

  // Aggregated totals from all transactions
  const transactions = value.transactions || [];
  const stcgTotal    = transactions.filter(t => t.type === 'equity_stcg').reduce((s,t)=>(s.saleValue||0)+(t.saleValue||0), {saleValue:0,purchaseCost:0,expenses:0,gain:0});
  // Better: just sum gains by type
  const stcgSale = transactions.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.saleValue||0),0);
  const stcgCost = transactions.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.purchaseCost||0),0);
  const stcgExp  = transactions.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.expenses||0),0);
  const stcgGain = transactions.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.gain||0),0);

  const ltcgSale = transactions.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.saleValue||0),0);
  const ltcgCost = transactions.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(Math.max(t.fmv31Jan18||0, t.purchaseCost||0)),0);
  const ltcgExp  = transactions.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.expenses||0),0);
  const ltcgGain = transactions.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.gain||0),0);

  const propSale = transactions.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.saleValue||0),0);
  const propCost = transactions.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.purchaseCost||0),0);
  const propExp  = transactions.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.expenses||0),0);
  const propGain = transactions.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.gain||0),0);

  function buildCGObject() {
    const enabled = stcgGain > 0 || ltcgGain > 0 || propGain > 0;
    return {
      enabled,
      transactions,
      shares: {
        stcg: stcgGain > 0 ? { saleValue: stcgSale, purchaseCost: stcgCost, expenses: stcgExp, gain: stcgGain } : null,
        ltcg: ltcgGain > 0 ? { saleValue: ltcgSale, purchaseCost: ltcgCost, expenses: ltcgExp, gain: ltcgGain } : null,
      },
      property: propGain > 0 ? { ltcgDetail: { saleValue: propSale, indexedCost: propCost, expenses: propExp, gain: propGain } } : null,
    };
  }

  async function handleFileUpload(file) {
    setUploadErr(null);
    if (file.size > 10 * 1024 * 1024) { setUploadErr('File must be under 10MB'); return; }
    setUploading(true);
    try {
      setExtracting(true);
      const { extracted } = await extractCGFromDoc(file, returnId);
      // Map extracted transactions
      const txns = (extracted.transactions || []).map(t => ({
        type: t.type || 'equity_ltcg',
        description: t.description || t.scrip || '',
        saleValue: parseFloat(t.sale_value || t.saleValue || 0),
        purchaseCost: parseFloat(t.purchase_cost || t.purchaseCost || 0),
        fmv31Jan18: parseFloat(t.fmv || t.fmv31Jan18 || 0),
        expenses: parseFloat(t.expenses || t.brokerage || 0),
        gain: parseFloat(t.gain || t.net_gain || 0),
      }));
      const updated = { ...value, transactions: [...(value.transactions||[]), ...txns] };
      onChange({ ...updated, ...buildCGWithTxns([...transactions, ...txns]) });
      setImported(true);
    } catch(e) {
      setUploadErr(e.message || 'Could not read capital gain transactions from this file');
    } finally { setUploading(false); setExtracting(false); }
  }

  function buildCGWithTxns(txns) {
    const sS = txns.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.saleValue||0),0);
    const cS = txns.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.purchaseCost||0),0);
    const eS = txns.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.expenses||0),0);
    const gS = txns.filter(t=>t.type==='equity_stcg').reduce((s,t)=>s+(t.gain||0),0);
    const sL = txns.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.saleValue||0),0);
    const cL = txns.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(Math.max(t.fmv31Jan18||0, t.purchaseCost||0)),0);
    const eL = txns.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.expenses||0),0);
    const gL = txns.filter(t=>t.type==='equity_ltcg').reduce((s,t)=>s+(t.gain||0),0);
    const sP = txns.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.saleValue||0),0);
    const cP = txns.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.purchaseCost||0),0);
    const eP = txns.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.expenses||0),0);
    const gP = txns.filter(t=>t.type==='property_ltcg').reduce((s,t)=>s+(t.gain||0),0);
    return {
      enabled: gS > 0 || gL > 0 || gP > 0,
      transactions: txns,
      shares: {
        stcg: gS > 0 ? { saleValue: sS, purchaseCost: cS, expenses: eS, gain: gS } : null,
        ltcg: gL > 0 ? { saleValue: sL, purchaseCost: cL, expenses: eL, gain: gL } : null,
      },
      property: gP > 0 ? { ltcgDetail: { saleValue: sP, indexedCost: cP, expenses: eP, gain: gP } } : null,
    };
  }

  function handleManualAdd(txn) {
    const newTxns = [...transactions, txn];
    onChange(buildCGWithTxns(newTxns));
  }

  function removeTransaction(idx) {
    const newTxns = transactions.filter((_, i) => i !== idx);
    onChange(newTxns.length > 0 ? buildCGWithTxns(newTxns) : { enabled: false, transactions: [] });
  }

  const TYPE_LABELS = { equity_stcg: 'STCG (Equity)', equity_ltcg: 'LTCG (Equity)', property_ltcg: 'LTCG (Property)', other: 'Other' };

  return (
    <div>
      {/* Info */}
      <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
        <Info size={13} color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }}/>
        <span>Upload your broker's tax P&L report (Zerodha Tax P&L, Groww Tax Report, Angel One P&L, Upstox Report) as PDF, image, or CSV. Each transaction is auto-classified as STCG or LTCG based on holding period.</span>
      </div>

      {/* Upload area */}
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.csv" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}/>
      <button onClick={() => fileRef.current?.click()} disabled={uploading || extracting} className="upload-btn" style={{ marginBottom: 8 }}>
        {uploading || extracting
          ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> {extracting ? 'Extracting transactions...' : 'Uploading...'}</>
          : <><FileSpreadsheet size={20}/><span>Upload broker P&L / Tax report</span><span style={{ fontSize: 11, opacity: 0.75 }}>PDF, image, or CSV</span></>
        }
      </button>

      {uploadErr && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 10px', background: 'var(--danger-light)', borderRadius: 6, marginBottom: 8 }}>⚠️ {uploadErr}</div>}

      {/* Transactions list */}
      {transactions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {transactions.length} transaction(s) recorded
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {transactions.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description || TYPE_LABELS[t.type] || t.type}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Sale: {formatINR(t.saleValue)} · Cost: {formatINR(t.purchaseCost)}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: (t.gain||0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {(t.gain||0) >= 0 ? '+' : ''}{formatINR(t.gain||0)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{TYPE_LABELS[t.type]}</div>
                </div>
                <button onClick={() => removeTransaction(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, flexShrink: 0 }}>
                  <X size={13}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary tiles */}
      {(stcgGain > 0 || ltcgGain > 0 || propGain > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          {stcgGain > 0 && (
            <div style={{ background: 'var(--warn-light)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>STCG (111A @ 20%)</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatINR(stcgGain)}</div>
            </div>
          )}
          {ltcgGain > 0 && (
            <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>LTCG (112A @ 12.5%)</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatINR(ltcgGain)}</div>
              {ltcgGain > 125000 && <div style={{ fontSize: 10, color: '#7c3aed' }}>Taxable: {formatINR(ltcgGain - 125000)}</div>}
            </div>
          )}
          {propGain > 0 && (
            <div style={{ background: 'var(--success-light)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Property LTCG (@ 12.5%)</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatINR(propGain)}</div>
            </div>
          )}
        </div>
      )}

      {/* Manual entry toggle */}
      <button onClick={() => setShowManual(m => !m)}
        style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        {showManual ? '▲ Hide manual entry' : '▼ Enter transaction manually instead'}
      </button>
      {showManual && <ManualEntry onAdd={handleManualAdd}/>}
    </div>
  );
}
