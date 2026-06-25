// src/components/ConsentGate.jsx
// Shown after signup verification, before KYC. Records explicit consent.

import { useState } from 'react';
import { recordConsent } from '../lib/supabase.js';

const TERMS_VERSION   = 'v1.0';
const PRIVACY_VERSION = 'v1.0';

export default function ConsentGate({ userId, onConsented }) {
  const [checkedTerms,   setTerms]   = useState(false);
  const [checkedPrivacy, setPrivacy] = useState(false);
  const [checkedCookies, setCookies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const allChecked = checkedTerms && checkedPrivacy && checkedCookies;

  async function handleConsent() {
    if (!allChecked) { setError('Please accept all three to continue.'); return; }
    setSaving(true);
    setError('');
    try {
      await recordConsent(userId, {
        termsVersion:   TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        cookieConsent:  checkedCookies,
      });
      onConsented();
    } catch(e) {
      setError('Could not record consent. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const S = {
    wrap: {
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', padding: '24px 16px',
    },
    card: {
      width: '100%', maxWidth: 460,
      background: '#fff', borderRadius: 20,
      boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
      padding: '32px 28px',
    },
    logo: {
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
    },
    logoMark: {
      width: 38, height: 38, borderRadius: 10,
      background: 'linear-gradient(135deg,#1a56e8,#7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800, color: '#fff',
    },
    title: { fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 6 },
    sub:   { fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 28 },
    checkRow: {
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px', borderRadius: 12,
      border: '1.5px solid #e2e8f0', marginBottom: 10,
      cursor: 'pointer', transition: 'border-color .15s, background .15s',
    },
    checkRowActive: {
      borderColor: '#1a56e8', background: '#f0f4ff',
    },
    cb: { marginTop: 2, width: 18, height: 18, accentColor: '#1a56e8', flexShrink: 0 },
    lbl: { fontSize: 14, color: '#1e293b', lineHeight: 1.6, userSelect: 'none' },
    link: { color: '#1a56e8', fontWeight: 500 },
    btn: {
      width: '100%', padding: '14px', marginTop: 20,
      background: 'linear-gradient(135deg,#1a56e8,#7c3aed)',
      color: '#fff', border: 'none', borderRadius: 12,
      fontSize: 15, fontWeight: 600, cursor: 'pointer',
      opacity: allChecked ? 1 : 0.5,
      transition: 'opacity .15s',
    },
    err: {
      fontSize: 13, color: '#dc2626', marginTop: 10, textAlign: 'center',
    },
    note: {
      fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 16, lineHeight: 1.6,
    },
  };

  function Row({ checked, onChange, children }) {
    return (
      <div style={{ ...S.checkRow, ...(checked ? S.checkRowActive : {}) }}
           onClick={() => onChange(!checked)}>
        <input type="checkbox" style={S.cb} checked={checked}
               onChange={e => onChange(e.target.checked)}
               onClick={e => e.stopPropagation()} />
        <span style={S.lbl}>{children}</span>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.logoMark}>T</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>TaxTalk</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>RB Shah & Associates</div>
          </div>
        </div>

        <div style={S.title}>Before we begin</div>
        <div style={S.sub}>
          We handle your PAN, income, and tax documents. Please read and accept
          our policies before we proceed to KYC.
        </div>

        <Row checked={checkedTerms} onChange={setTerms}>
          I have read and agree to the{' '}
          <a href="/terms.html" target="_blank" rel="noopener" style={S.link}
             onClick={e => e.stopPropagation()}>Terms & Conditions</a>{' '}
          of TaxTalk by RB Shah & Associates.
        </Row>

        <Row checked={checkedPrivacy} onChange={setPrivacy}>
          I have read and agree to the{' '}
          <a href="/privacy.html" target="_blank" rel="noopener" style={S.link}
             onClick={e => e.stopPropagation()}>Privacy Policy</a>.
          I understand how my PAN, Aadhaar (last 4 digits), income data, and documents are stored and used.
        </Row>

        <Row checked={checkedCookies} onChange={setCookies}>
          I consent to{' '}
          <a href="/privacy.html#cookies" target="_blank" rel="noopener" style={S.link}
             onClick={e => e.stopPropagation()}>essential cookies</a>{' '}
          required for login sessions. TaxTalk does not use advertising or tracking cookies.
        </Row>

        {error && <div style={S.err}>{error}</div>}

        <button style={S.btn} onClick={handleConsent} disabled={saving || !allChecked}>
          {saving ? 'Recording your consent...' : 'I agree — continue to KYC'}
        </button>

        <div style={S.note}>
          Your consent is recorded with a timestamp and policy version for legal compliance
          under the DPDP Act 2023 and IT Act 2000. You can view your consent history in
          your account settings.
        </div>
      </div>
    </div>
  );
}
