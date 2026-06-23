import React, { useState } from 'react';
import { User, Save, Loader, CheckCircle } from 'lucide-react';
import { saveKYC } from '../lib/supabase.js';
import { Button } from './UI.jsx';

const STATES = [
  ['01','J&K'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],
  ['09','Uttar Pradesh'],['10','Bihar'],['18','Assam'],['19','West Bengal'],
  ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],
  ['24','Gujarat'],['27','Maharashtra'],['28','Andhra Pradesh'],['29','Karnataka'],
  ['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],['36','Telangana'],['38','Ladakh'],
];

export default function KYCScreen({ userId, existingProfile, onComplete }) {
  const p = existingProfile || {};
  const [fullName,   setFullName]   = useState(p.full_name  || '');
  const [pan,        setPan]        = useState(p.pan        || '');
  const [dob,        setDob]        = useState(p.dob        || '');
  const [phone,      setPhone]      = useState(p.phone      || '');
  const [aadhaar,    setAadhaar]    = useState(p.aadhaar    || '');
  const [locality,   setLocality]   = useState(p.locality   || '');
  const [city,       setCity]       = useState(p.city       || '');
  const [stateCode,  setStateCode]  = useState(p.state_code || '');
  const [pinCode,    setPinCode]    = useState(p.pin_code   || '');
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState({});

  const isEditing = !!p.kyc_complete; // editing vs first-time setup

  function validate() {
    const e = {};
    if (!fullName.trim())     e.fullName = 'Required';
    if (!pan || pan.length !== 10) e.pan = 'Enter valid 10-character PAN';
    if (!dob)                  e.dob = 'Required';
    if (!phone || phone.replace(/\D/g,'').length !== 10) e.phone = 'Enter valid 10-digit mobile';
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await saveKYC(userId, {
        full_name:  fullName.toUpperCase(),
        pan:        pan.toUpperCase(),
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

  const inp = (err) => ({
    style: {
      width: '100%', padding: '10px 12px',
      border: `1.5px solid ${err ? 'var(--danger)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none',
      background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit',
      boxSizing: 'border-box',
    }
  });
  const lbl = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };
  const Field = ({ label, error, children }) => (
    <div>
      <label style={lbl}>{label}</label>
      {children}
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>{error}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 32, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-md)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1a56e8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{isEditing ? 'Edit your profile' : 'Complete your profile'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>RB Shah & Associates · TaxTalk AY 2026-27</div>
          </div>
        </div>

        {!isEditing && (
          <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            We need a few details before you start filing. These are stored securely and pre-filled in your ITR — you will not have to enter them again.
          </div>
        )}

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Personal information</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Full name (as per PAN) *" error={errors.fullName}>
              <input {...inp(errors.fullName)} value={fullName} onChange={e => setFullName(e.target.value.toUpperCase())} placeholder="RAHUL KUMAR SHAH" />
            </Field>
            <Field label="PAN *" error={errors.pan}>
              <input {...inp(errors.pan)} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date of birth *" error={errors.dob}>
              <input type="date" {...inp(errors.dob)} value={dob} onChange={e => setDob(e.target.value)} />
            </Field>
            <Field label="Mobile number *" error={errors.phone}>
              <input {...inp(errors.phone)} value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} />
            </Field>
          </div>

          <Field label="Aadhaar number">
            <input {...inp()} value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g,''))} placeholder="123456789012" maxLength={12} />
          </Field>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Address</div>

          <Field label="Locality / Area">
            <input {...inp()} value={locality} onChange={e => setLocality(e.target.value)} placeholder="Kalavad Road" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="City">
              <input {...inp()} value={city} onChange={e => setCity(e.target.value)} placeholder="Rajkot" />
            </Field>
            <Field label="State">
              <select {...inp()} value={stateCode} onChange={e => setStateCode(e.target.value)} style={{ ...inp().style, cursor: 'pointer' }}>
                <option value="">Select</option>
                {STATES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </Field>
            <Field label="PIN code">
              <input {...inp()} value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="360001" maxLength={6} />
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
            <Button variant="secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onComplete}>Cancel</Button>
          )}
          <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</> : <><CheckCircle size={15}/> {isEditing ? 'Save changes' : 'Continue to filing'}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
