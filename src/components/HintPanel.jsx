// src/components/HintPanel.jsx
// Reusable hint display component used by CA editor, CA dashboard, and client view
// Renders completeness hints with severity, action buttons, and collapsible detail

import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { groupHints, hintsFor } from '../lib/completenessCheck.js';

// ─── Single hint card ─────────────────────────────────────────────────────────
function HintCard({ hint, audience }) {
  const [open, setOpen] = useState(false);
  const action = audience === 'ca' ? hint.actionCA : hint.actionClient;
  const sharedAction = hint.detail;

  const colors = {
    block: { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', text: '#7f1d1d', badgeBg: '#fee2e2', badgeText: '#991b1b', badge: 'Action required' },
    warn:  { bg: '#fffbeb', border: '#fcd34d', icon: '#d97706', text: '#78350f', badgeBg: '#fef3c7', badgeText: '#92400e', badge: 'Needs attention' },
    info:  { bg: '#eff6ff', border: '#bfdbfe', icon: '#2563eb', text: '#1e3a8a', badgeBg: '#dbeafe', badgeText: '#1e40af', badge: 'Advisory' },
  };
  const col = colors[hint.severity] || colors.info;
  const Icon = hint.severity === 'block' ? AlertCircle : hint.severity === 'warn' ? AlertTriangle : Info;

  return (
    <div style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', cursor: 'pointer' }}
           onClick={() => setOpen(o => !o)}>
        <Icon size={15} style={{ color: col.icon, flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: col.text }}>{hint.title}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
              background: col.badgeBg, color: col.badgeText, flexShrink: 0 }}>{col.badge}</span>
          </div>
        </div>
        <div style={{ color: col.icon, flexShrink: 0, marginTop: 1 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 13px 12px 38px', borderTop: `1px solid ${col.border}` }}>
          <p style={{ fontSize: 12, color: col.text, lineHeight: 1.65, marginTop: 10, marginBottom: 0 }}>
            {sharedAction}
          </p>
          {action && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col.icon, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
                What to do
              </div>
              <p style={{ fontSize: 12, color: col.text, lineHeight: 1.6, margin: 0 }}>{action}</p>
            </div>
          )}
          {hint.ruleRef && (
            <div style={{ marginTop: 6, fontSize: 11, color: col.icon, opacity: 0.7 }}>
              Reference: {hint.ruleRef}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, grade, color, blocks, warns }) {
  const r = 28, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
      background: '#f8fafc', borderRadius: 12, marginBottom: 14 }}>
      <svg width={68} height={68} viewBox="0 0 68 68">
        <circle cx={34} cy={34} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={34} y={38} textAnchor="middle" fontSize={15} fontWeight={700}
          fill={color} fontFamily="inherit">{score}</text>
      </svg>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color }}>{grade}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
          {blocks > 0 && <span style={{ color: '#dc2626', marginRight: 10 }}>● {blocks} blocking</span>}
          {warns > 0  && <span style={{ color: '#d97706', marginRight: 10 }}>● {warns} advisory</span>}
          {blocks === 0 && warns === 0 && <span style={{ color: '#16a34a' }}>● All clear</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main HintPanel component ─────────────────────────────────────────────────
// audience: 'ca' | 'client' | 'both'
export default function HintPanel({ hints, score, audience = 'ca', collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const grouped = groupHints(hintsFor(hints, audience));
  const total   = grouped.block.length + grouped.warn.length + grouped.info.length;

  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 12 }}>
        <CheckCircle size={15} style={{ color: '#16a34a' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#14532d' }}>
          {audience === 'ca' ? 'No issues found — return is ready for review' : 'Your return looks complete!'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Score ring */}
      {score && <ScoreRing {...score} />}

      {/* Collapsible header */}
      {collapsible ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', marginBottom: open ? 10 : 0 }}
             onClick={() => setOpen(o => !o)}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
            {grouped.block.length > 0
              ? `⚠️ ${grouped.block.length} issue${grouped.block.length > 1 ? 's' : ''} need${grouped.block.length === 1 ? 's' : ''} to be fixed`
              : `${total} hint${total > 1 ? 's' : ''}`}
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      ) : (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 8 }}>
          {audience === 'ca' ? 'Completeness checklist' : 'What\'s needed'}
        </div>
      )}

      {open && (
        <div>
          {/* Blocking issues first */}
          {grouped.block.map(h => <HintCard key={h.id} hint={h} audience={audience} />)}
          {/* Warnings */}
          {grouped.warn.map(h => <HintCard key={h.id} hint={h} audience={audience} />)}
          {/* Info */}
          {grouped.info.map(h => <HintCard key={h.id} hint={h} audience={audience} />)}
        </div>
      )}
    </div>
  );
}

// ─── Compact summary bar (for list views) ─────────────────────────────────────
export function HintSummaryBar({ hints, onClick }) {
  const blocks = hints.filter(h => h.severity === 'block').length;
  const warns  = hints.filter(h => h.severity === 'warn').length;
  if (blocks === 0 && warns === 0) return null;
  return (
    <div onClick={onClick} style={{ display: 'flex', gap: 6, cursor: onClick ? 'pointer' : 'default', flexWrap: 'wrap' }}>
      {blocks > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
          padding: '2px 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 20 }}>
          <AlertCircle size={10}/> {blocks} blocking
        </span>
      )}
      {warns > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
          padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 20 }}>
          <AlertTriangle size={10}/> {warns} advisory
        </span>
      )}
    </div>
  );
}
