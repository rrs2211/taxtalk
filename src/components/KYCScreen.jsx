import React, { useState } from 'react';
import { User, CheckCircle, Loader } from 'lucide-react';
import { saveKYC } from '../lib/supabase.js';
import { validatePAN } from './TaxChat.jsx';
import { Button } from './UI.jsx';

// ── Defined OUTSIDE component — prevents remount on every render ──────────────
const INP_STYLE = {
  width: '100%', padding: '10px 12px',
  border: '1.5px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none',
  background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const INP_ERR_STYLE = { ...INP_STYLE, border: '1.5px solid var(--danger)' };
const LBL_STYLE = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };

// Field wrapper also outside — no re-creation on parent render
function Field({ label, error, children }) {
  return (
    <div>
      <label style={LBL_STYLE}>{label}</label>
      {children}
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>{error}</div>}
    </div>
  );
}

const STATES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],
  ['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['18','Assam'],
  ['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],
  ['23','Madhya Pradesh'],['24','Gujarat'],['27','Maharashtra'],['28','Andhra Pradesh'],
  ['29','Karnataka'],['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],
  ['36','Telangana'],['38','Ladakh'],
];

export default function KYCScreen({ userId, existingProfile, onComplete }) {
  const p = existingProfile || {};
  const isEditing = !!p.kyc_complete;
  const identityLocked = !!p.identity_locked; // PAN/name/DOB cannot be changed

  const [fullName,  setFullName]  = useState(p.full_name  || '');
  const [pan,       setPan]       = useState(p.pan        || '');
  const [dob,       setDob]       = useState(p.dob        || '');
  const [phone,     setPhone]     = useState(p.phone      || '');
  const [aadhaar,   setAadhaar]   = useState(p.aadhaar    || '');
  const [locality,  setLocality]  = useState(p.locality   || '');
  const [city,      setCity]      = useState(p.city       || '');
  const [stateCode, setStateCode] = useState(p.state_code || '');
  const [pinCode,   setPinCode]   = useState(p.pin_code   || '');
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState({});

  function validate() {
    const e = {};
    if (!fullName.trim())                            e.fullName = 'Required';
    const panCheck = validatePAN(pan);
    if (!panCheck.valid)                             e.pan = panCheck.error;
    if (!dob)                                        e.dob      = 'Required';
    if (!(phone.replace(/\D/g,'').length === 10))    e.phone    = 'Enter valid 10-digit mobile';
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await saveKYC(userId, {
        full_name:  fullName.toUpperCase().trim(),
        pan:        pan.toUpperCase().trim(),
        dob,
        phone:      phone.replace(/\D/g,''),
        aadhaar:    aadhaar.replace(/\D/g,''),
        locality,
        city,
        state_code: stateCode,
        pin_code:   pinCode,
      });
      onComplete();
    } catch (err) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', paddingTop: 'calc(20px + env(safe-area-inset-top))', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px 20px', width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-md)', marginTop: 'auto', marginBottom: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1a56e8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={20} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{isEditing ? 'Edit your profile' : 'Complete your profile'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>RB Shah & Associates · TaxTalk AY 2026-27</div>
          </div>
        </div>

        {!isEditing && (
          <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            We need a few details before you start filing. These are stored securely and pre-filled in your ITR — you will not have to enter them again.
          </div>
        )}

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          {/* Section: Personal */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Personal information</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="Full name (as per PAN) *" error={errors.fullName}>
              <input
                style={identityLocked ? { ...INP_STYLE, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'not-allowed' } : (errors.fullName ? INP_ERR_STYLE : INP_STYLE)}
                value={fullName}
                onChange={e => !identityLocked && setFullName(e.target.value.toUpperCase())}
                placeholder="RAHUL KUMAR SHAH"
                readOnly={identityLocked}
              />
              {identityLocked && <div style={{ fontSize:11, color:'var(--brand)', marginTop:2 }}>🔒 Locked — name cannot be changed</div>}
            </Field>
            <Field label="PAN *" error={errors.pan}>
              <div style={{ position:'relative' }}>
                <input
                  style={identityLocked ? { ...INP_STYLE, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'not-allowed', fontFamily:'monospace', letterSpacing:'0.1em' } : (errors.pan ? INP_ERR_STYLE : { ...INP_STYLE, fontFamily:'monospace', letterSpacing:'0.08em' })}
                  value={pan}
                  onChange={e => !identityLocked && setPan(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  readOnly={identityLocked}
                />
                {/* PAN character guide */}
                {!identityLocked && pan.length === 10 && (() => {
                  const check = validatePAN(pan);
                  return check.valid ? (
                    <div style={{ fontSize:11, color:'var(--success)', marginTop:2 }}>✓ Valid PAN — {check.entityType}</div>
                  ) : (
                    <div style={{ fontSize:11, color:'var(--danger)', marginTop:2 }}>⚠️ {check.error}</div>
                  );
                })()}
                {!identityLocked && pan.length > 0 && pan.length < 10 && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    {pan.length}/10 — Format: AAAAA9999A (5 letters · 4 digits · 1 letter, 4th letter = entity type)
                  </div>
                )}
              </div>
              {identityLocked && <div style={{ fontSize:11, color:'var(--brand)', marginTop:2 }}>🔒 Locked — PAN cannot be changed</div>}
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="Date of birth *" error={errors.dob}>
              <input
                type="date"
                style={identityLocked ? { ...INP_STYLE, background:'var(--surface-3)', color:'var(--text-secondary)', cursor:'not-allowed' } : (errors.dob ? INP_ERR_STYLE : INP_STYLE)}
                value={dob}
                onChange={e => !identityLocked && setDob(e.target.value)}
                readOnly={identityLocked}
              />
              {identityLocked && <div style={{ fontSize:11, color:'var(--brand)', marginTop:2 }}>🔒 Locked</div>}
            </Field>
            <Field label="Mobile number *" error={errors.phone}>
              <input
                style={errors.phone ? INP_ERR_STYLE : INP_STYLE}
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="9876543210"
                maxLength={10}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="Aadhaar number (optional)">
            <input
              style={INP_STYLE}
              value={aadhaar}
              onChange={e => setAadhaar(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="123456789012"
              maxLength={12}
              inputMode="numeric"
            />
          </Field>

          {/* Section: Address */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Address</div>

          <Field label="Locality / Area">
            <input
              style={INP_STYLE}
              value={locality}
              onChange={e => setLocality(e.target.value)}
              placeholder="Kalavad Road"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Field label="City">
              <input
                style={INP_STYLE}
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Rajkot"
              />
            </Field>
            <Field label="State">
              <select
                style={{ ...INP_STYLE, cursor: 'pointer' }}
                value={stateCode}
                onChange={e => setStateCode(e.target.value)}
              >
                <option value="">Select</option>
                {STATES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </Field>
            <Field label="PIN code">
              <input
                style={INP_STYLE}
                value={pinCode}
                onChange={e => setPinCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="360001"
                maxLength={6}
                inputMode="numeric"
              />
            </Field>
          </div>
        </div>

        {errors.general && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>
            ⚠️ {errors.general}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {isEditing && (
            <Button variant="secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onComplete}>
              Cancel
            </Button>
          )}
          <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</>
              : <><CheckCircle size={15}/> {isEditing ? 'Save changes' : 'Continue to filing'}</>
            }
          </Button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
