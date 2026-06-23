// src/components/CGCollector.jsx
// Capital gains collector — used in TaxChat (simple) and CAReturnEditor (detailed)
// Collects FULL sale + purchase + expenses for ITR schema compliance.
// The schema requires: FullConsideration − (AquisitCost + ExpOnTrans) = CapgainonAssets

import React, { useState } from 'react';
import { CheckCircle, Info } from 'lucide-react';
import { formatINR } from '../data/flow.js';
import { Button } from './UI.jsx';

// ── Inline number field ───────────────────────────────────────────────────────
function NF({ label, value, onChange, note, sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'9px 12px', borderBottom:'1px solid var(--border)', gap:12 }}>
      <div>
        <div style={{ fontSize:13, color:'var(--text-secondary)' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <span style={{ fontSize:13, color:'var(--text-muted)' }}>₹</span>
        <input type="number" value={value || ''} placeholder="0"
          onChange={e => onChange(Math.round(parseFloat(e.target.value) || 0))}
          style={{ width:130, padding:'6px 8px', border:'1.5px solid var(--border-strong)',
            borderRadius:6, fontSize:13, textAlign:'right', outline:'none',
            background:'var(--surface)', color:'var(--text-primary)' }}/>
      </div>
    </div>
  );
}

// ── Single CG section collector ───────────────────────────────────────────────
function CGSection({ title, badge, badgeColor, fields, data, onChange, children }) {
  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
      <div style={{ padding:'9px 12px', background:'var(--surface-3)', display:'flex',
        alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontWeight:600, fontSize:13 }}>{title}</span>
        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20,
          background: badgeColor || 'var(--brand-light)',
          color: badgeColor ? '#fff' : 'var(--brand)' }}>{badge}</span>
      </div>
      {fields.map(f => (
        <NF key={f.key} label={f.label} sub={f.sub} value={data[f.key] || 0}
          onChange={v => onChange({ ...data, [f.key]: v })} />
      ))}
      {children}
    </div>
  );
}

// ── Net gain display ──────────────────────────────────────────────────────────
function NetGain({ sale, cost, fmv, exp, label, exempt = 0 }) {
  const acqCost = fmv !== undefined ? Math.max(fmv || 0, cost || 0) : (cost || 0);
  const net = Math.max(0, (sale || 0) - acqCost - (exp || 0));
  const taxable = Math.max(0, net - exempt);
  return (
    <div style={{ padding:'9px 12px', background:'var(--brand-light)', fontSize:13 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
        <span style={{ color:'var(--text-secondary)' }}>Net {label}</span>
        <span style={{ fontWeight:700, color:'var(--brand)' }}>{formatINR(net)}</span>
      </div>
      {exempt > 0 && net > exempt && (
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
          <span style={{ color:'var(--text-muted)' }}>Taxable (above ₹{(exempt/100000).toFixed(2)}L exempt)</span>
          <span style={{ fontWeight:600, color:'var(--warn)' }}>{formatINR(taxable)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main CGCollector component ────────────────────────────────────────────────
export default function CGCollector({ value = {}, onChange, compact = false }) {
  const enabled = value.enabled || false;
  const shares  = value.shares  || {};
  const stcg    = shares.stcg   || {};
  const ltcg    = shares.ltcg   || {};
  const prop    = value.property?.ltcgDetail || {};

  function update(key, subKey, val) {
    const current = key === 'stcg' ? stcg : key === 'ltcg' ? ltcg : prop;
    const updated  = { ...current, ...val };
    // Always recompute net gain
    if (key === 'stcg') {
      const net = Math.max(0, (updated.saleValue||0) - (updated.purchaseCost||0) - (updated.expenses||0));
      onChange({ ...value, enabled:true, shares: { ...shares, stcg: { ...updated, gain: net } } });
    } else if (key === 'ltcg') {
      const acq = Math.max(updated.fmv31Jan18||0, updated.purchaseCost||0);
      const net = Math.max(0, (updated.saleValue||0) - acq - (updated.expenses||0));
      onChange({ ...value, enabled:true, shares: { ...shares, ltcg: { ...updated, gain: net } } });
    } else {
      const net = Math.max(0, (updated.saleValue||0) - (updated.indexedCost||0) - (updated.expenses||0));
      onChange({ ...value, enabled:true, property: { ltcgDetail: { ...updated, gain: net } } });
    }
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12,
        padding:'10px 12px', background:'var(--surface-2)', borderRadius:8 }}>
        <input type="checkbox" id="cg-enabled" checked={enabled}
          onChange={e => onChange({ ...value, enabled: e.target.checked })} />
        <label htmlFor="cg-enabled" style={{ fontSize:13, cursor:'pointer', fontWeight:500 }}>
          Has capital gains from shares, mutual funds, or property sale
        </label>
      </div>

      {!compact && enabled && (
        <div style={{ background:'var(--brand-light)', border:'1px solid var(--brand)',
          borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--text-secondary)',
          display:'flex', gap:6, alignItems:'flex-start' }}>
          <Info size={13} color="var(--brand)" style={{ marginTop:1, flexShrink:0 }}/>
          <span>Enter the <strong>full sale proceeds</strong> and <strong>purchase cost</strong> for
          each type. Net gain is computed automatically. These figures come from your broker's P&L
          statement or Zerodha/Groww tax report. The ITR schema requires sale + purchase separately —
          net gain alone is not accepted.</span>
        </div>
      )}

      {enabled && (
        <>
          {/* STCG 111A — Equity / Equity MF held < 12 months */}
          <CGSection title="Short-term capital gains (STCG)" badge="Sec 111A · 20% tax"
            badgeColor="#f59e0b"
            fields={[
              { key:'saleValue',    label:'Total sale proceeds',       sub:'Total of all sell transactions' },
              { key:'purchaseCost', label:'Total purchase cost',       sub:'Total of all buy transactions' },
              { key:'expenses',     label:'Brokerage / STT / expenses',sub:'Transfer expenses (usually 0 for MF)' },
            ]}
            data={stcg} onChange={val => update('stcg', null, val)}>
            <NetGain sale={stcg.saleValue} cost={stcg.purchaseCost} exp={stcg.expenses} label="STCG (111A)"/>
          </CGSection>

          {/* LTCG 112A — Equity / Equity MF held ≥ 12 months */}
          <CGSection title="Long-term capital gains — Equity (LTCG)" badge="Sec 112A · 12.5% above ₹1.25L"
            badgeColor="#7c3aed"
            fields={[
              { key:'saleValue',    label:'Total sale proceeds',           sub:'Total of all sell transactions' },
              { key:'purchaseCost', label:'Original purchase cost',        sub:'What you paid when you bought' },
              { key:'fmv31Jan18',   label:'FMV as on 31 Jan 2018',        sub:'For shares bought before Feb 2018 — from broker report. If bought after, same as purchase cost.' },
              { key:'expenses',     label:'Transfer expenses / brokerage', sub:'Usually 0 for equity MF' },
            ]}
            data={ltcg} onChange={val => update('ltcg', null, val)}>
            <NetGain sale={ltcg.saleValue} cost={ltcg.purchaseCost} fmv={ltcg.fmv31Jan18}
              exp={ltcg.expenses} label="LTCG (112A)" exempt={125000}/>
          </CGSection>

          {/* Property LTCG */}
          <CGSection title="Long-term capital gains — Property / Land" badge="Sec 112 · 12.5% tax"
            badgeColor="#059669"
            fields={[
              { key:'saleValue',   label:'Sale consideration',    sub:'Actual sale price (or circle rate, whichever higher)' },
              { key:'indexedCost', label:'Indexed cost of acquisition', sub:'Purchase price × (CII 2025-26 / CII of purchase year)' },
              { key:'expenses',    label:'Transfer expenses',     sub:'Brokerage, stamp duty, registration, legal fees' },
            ]}
            data={prop} onChange={val => update('prop', null, val)}>
            <NetGain sale={prop.saleValue} cost={prop.indexedCost} exp={prop.expenses} label="LTCG (Property)"/>
          </CGSection>
        </>
      )}
    </div>
  );
}
