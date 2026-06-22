import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, MessageSquare, Clock, ChevronDown, ChevronUp, Send, FileText, TrendingUp } from 'lucide-react';
import { MOCK_QUEUE } from '../data/queue.js';
import { Avatar, Badge, Button, Card, Divider } from './UI.jsx';
import { formatINR } from '../data/flow.js';

const STATUS_CONFIG = {
  clean: { label: 'Clean', variant: 'success', icon: <CheckCircle size={12} /> },
  flagged: { label: 'Flagged', variant: 'warn', icon: <AlertTriangle size={12} /> },
  critical: { label: 'Needs attention', variant: 'danger', icon: <AlertCircle size={12} /> },
};

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FlagBlock({ flag }) {
  const isWarn = flag.type === 'warn';
  return (
    <div style={{
      background: isWarn ? 'var(--warn-light)' : 'var(--danger-light)',
      border: `1px solid ${isWarn ? '#fcd34d' : '#fca5a5'}`,
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: isWarn ? '#92400e' : '#991b1b', marginBottom: 4 }}>
        {isWarn ? <AlertTriangle size={14} /> : <AlertCircle size={14} />}
        {flag.title}
      </div>
      <p style={{ fontSize: 13, color: isWarn ? '#78350f' : '#7f1d1d', lineHeight: 1.5 }}>{flag.body}</p>
    </div>
  );
}

function CompRow({ label, value, bold, positive, negative }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 500, color: positive ? 'var(--success)' : negative ? 'var(--danger)' : 'var(--brand)' }}>{value}</span>
    </div>
  );
}

function ClientCard({ client, onApprove, onHold }) {
  const [expanded, setExpanded] = useState(client.status === 'flagged' || client.status === 'critical');
  const [queryMode, setQueryMode] = useState(false);
  const [queryText, setQueryText] = useState(client.queryTemplate || '');
  const [querySent, setQuerySent] = useState(false);
  const [approved, setApproved] = useState(false);
  const [onHoldState, setOnHoldState] = useState(false);

  const cfg = STATUS_CONFIG[client.status];
  const comp = client.computation;

  if (approved) {
    return (
      <Card style={{ border: '1.5px solid #86efac', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--success)' }}>
          <CheckCircle size={18} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{client.name} — ITR approved and queued for filing</span>
        </div>
      </Card>
    );
  }

  if (onHoldState) {
    return (
      <Card style={{ border: '1.5px solid #fcd34d', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--warn)' }}>
          <Clock size={18} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{client.name} — Put on hold, query sent to client</span>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 10, border: expanded ? '1px solid var(--brand)' : '1px solid var(--border)', transition: 'border-color 0.2s' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <Avatar initials={client.initials} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{client.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {client.profile} · Taxable income {formatINR(client.taxableIncome)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Badge variant={cfg.variant}>{cfg.icon} {cfg.label}</Badge>
          {expanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          <Divider />

          {/* Computation */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>Tax computation</div>
          {comp.grossSalary && <CompRow label="Gross salary" value={formatINR(comp.grossSalary)} />}
          {comp.grossTurnover && <CompRow label="Gross turnover" value={formatINR(comp.grossTurnover)} />}
          {comp.presumptiveIncome && <CompRow label="Presumptive income (44AD)" value={formatINR(comp.presumptiveIncome)} />}
          {comp.shareOfProfit && <CompRow label="Share of profit from firm" value={formatINR(comp.shareOfProfit)} />}
          {comp.deductions80C && <CompRow label="Section 80C" value={`− ${formatINR(comp.deductions80C)}`} />}
          {comp.deductions80D && <CompRow label="Section 80D" value={`− ${formatINR(comp.deductions80D)}`} />}
          <CompRow label={`Taxable income (${comp.regime})`} value={formatINR(comp.taxableIncome)} bold />
          <CompRow label="Tax + 4% cess" value={formatINR(comp.taxPayable)} />
          <CompRow label="TDS deducted" value={`− ${formatINR(comp.tdsDeducted)}`} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: 700 }}>
            <span>{comp.refund ? 'Refund due' : 'Balance tax payable'}</span>
            <span style={{ color: comp.refund ? 'var(--success)' : 'var(--warn)' }}>
              {comp.refund ? formatINR(comp.refund) : formatINR(comp.balanceDue)}
            </span>
          </div>

          {/* Regime badge */}
          <div style={{ marginBottom: 12 }}>
            <Badge variant="info"><TrendingUp size={11} /> {comp.regime} selected</Badge>
          </div>

          {/* Flags */}
          {client.flags.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI flags</div>
              {client.flags.map((f, i) => <FlagBlock key={i} flag={f} />)}
            </>
          )}

          {/* AI note */}
          <div style={{
            background: 'var(--surface-3)', borderLeft: '3px solid var(--brand)',
            padding: '10px 14px', borderRadius: '0 8px 8px 0', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', marginBottom: 4 }}>AI review note</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{client.aiNote}</p>
          </div>

          {/* Query box */}
          {queryMode && !querySent && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Message to {client.name.split(' ')[0]} (sent via app + WhatsApp):</div>
              <textarea
                value={queryText}
                onChange={e => setQueryText(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)', fontSize: 13, lineHeight: 1.5,
                  background: 'var(--surface)', color: 'var(--text-primary)',
                }}
              />
              <Button variant="warn" size="sm" style={{ marginTop: 8 }} onClick={() => { setQuerySent(true); setOnHoldState(true); }}>
                <Send size={13} /> Send query & put on hold
              </Button>
            </div>
          )}
          {querySent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 13, marginBottom: 12 }}>
              <CheckCircle size={14} /> Query sent — return moved to "Awaiting client response"
            </div>
          )}

          {/* Actions */}
          {!querySent && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {client.status !== 'critical' && (
                <Button variant="success" onClick={() => setApproved(true)}>
                  <CheckCircle size={15} /> Approve & file
                </Button>
              )}
              <Button variant="warn" onClick={() => setQueryMode(q => !q)}>
                <MessageSquare size={15} /> {queryMode ? 'Cancel query' : 'Query client'}
              </Button>
              <Button variant="secondary" onClick={() => setOnHoldState(true)}>
                <Clock size={15} /> Put on hold
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function CADashboard() {
  const [queue] = useState(MOCK_QUEUE);

  const pending = queue.length;
  const flagged = queue.filter(c => c.status === 'flagged' || c.status === 'critical').length;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>CA Review Queue</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>RB Shah & Associates · AY 2026-27</p>
          </div>
          <Badge variant="info"><FileText size={11} /> {pending} pending</Badge>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatCard label="Pending review" value={pending} color="var(--warn)" />
        <StatCard label="Flagged by AI" value={flagged} color="var(--danger)" />
        <StatCard label="Approved today" value={8} color="var(--success)" />
        <StatCard label="Filed this week" value={31} />
      </div>

      {/* Queue */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        Review queue — flagged returns shown first
      </div>
      {queue.map(client => (
        <ClientCard key={client.id} client={client} />
      ))}
    </div>
  );
}
