import React from 'react';

const COLORS = [
  { bg: '#e8f0fe', text: '#1a56e8' },
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dcfce7', text: '#16a34a' },
  { bg: '#fef3c7', text: '#b45309' },
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#fff4ed', text: '#c2410c' },
];

function getColor(initials) {
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % COLORS.length;
  return COLORS[idx];
}

export function Avatar({ initials, size = 40 }) {
  const { bg, text } = getColor(initials);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: size * 0.35, flexShrink: 0,
      letterSpacing: '0.02em',
    }}>
      {initials}
    </div>
  );
}

const BADGE_STYLES = {
  warn: { bg: 'var(--warn-light)', text: '#92400e', border: '#fcd34d' },
  danger: { bg: 'var(--danger-light)', text: '#991b1b', border: '#fca5a5' },
  success: { bg: 'var(--success-light)', text: '#14532d', border: '#86efac' },
  info: { bg: 'var(--brand-light)', text: '#1e3a8a', border: '#93c5fd' },
  neutral: { bg: 'var(--surface-3)', text: 'var(--text-secondary)', border: 'var(--border)' },
};

export function Badge({ variant = 'neutral', children, style }) {
  const s = BADGE_STYLES[variant] || BADGE_STYLES.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 500,
      background: s.bg, color: s.text,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}

export function Button({ variant = 'primary', children, onClick, disabled, style, size = 'md' }) {
  const sizes = { sm: { padding: '6px 14px', fontSize: 13 }, md: { padding: '9px 20px', fontSize: 14 }, lg: { padding: '12px 28px', fontSize: 15 } };
  const variants = {
    primary: { bg: 'var(--brand)', color: '#fff', border: 'transparent', hoverBg: 'var(--brand-dark)' },
    secondary: { bg: 'var(--surface)', color: 'var(--text-primary)', border: 'var(--border-strong)', hoverBg: 'var(--surface-3)' },
    success: { bg: 'var(--success-light)', color: '#14532d', border: '#86efac', hoverBg: '#bbf7d0' },
    warn: { bg: 'var(--warn-light)', color: '#92400e', border: '#fcd34d', hoverBg: '#fde68a' },
    danger: { bg: 'var(--danger-light)', color: '#991b1b', border: '#fca5a5', hoverBg: '#fecaca' },
    ghost: { bg: 'transparent', color: 'var(--text-secondary)', border: 'transparent', hoverBg: 'var(--surface-3)' },
  };
  const v = variants[variant] || variants.primary;
  const sz = sizes[size] || sizes.md;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sz,
        background: v.bg, color: v.color,
        border: `1px solid ${v.border}`,
        borderRadius: 'var(--radius-md)',
        fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...style,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = v.hoverBg)}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = v.bg)}
    >
      {children}
    </button>
  );
}

export function Card({ children, style, padding = '1.25rem' }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Divider({ style }) {
  return <div style={{ height: 1, background: 'var(--border)', margin: '12px 0', ...style }} />;
}
