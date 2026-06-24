import React, { useState } from 'react';
import { User, Lock, CheckCircle, Loader, Eye, EyeOff } from 'lucide-react';
import { changePassword, updateProfile } from '../lib/supabase.js';
import { Button, Card } from './UI.jsx';
import KYCScreen from './KYCScreen.jsx';

export default function ProfileSettings({ user, profile, onUpdate, onClose }) {
  const [tab, setTab]           = useState('profile'); // 'profile' | 'password'
  const [showKYC, setShowKYC]   = useState(false);

  // Password tab
  const [current,  setCurrent]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState(null);

  async function handlePasswordChange() {
    if (newPass.length < 8) { setMsg({ type:'error', text:'Password must be at least 8 characters' }); return; }
    if (newPass !== confirm) { setMsg({ type:'error', text:'Passwords do not match' }); return; }
    setSaving(true); setMsg(null);
    try {
      await changePassword(newPass);
      setMsg({ type:'success', text:'Password updated successfully' });
      setCurrent(''); setNewPass(''); setConfirm('');
    } catch (e) {
      setMsg({ type:'error', text: e.message });
    } finally { setSaving(false); }
  }

  if (showKYC) {
    return (
      <KYCScreen
        userId={user.id}
        existingProfile={{ ...profile, kyc_complete: true }}
        onComplete={() => { setShowKYC(false); onUpdate(); }}
      />
    );
  }

  const inp = { style: { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border-strong)', borderRadius:'var(--radius-md)', fontSize:14, outline:'none', background:'var(--surface)', color:'var(--text-primary)', fontFamily:'inherit', boxSizing:'border-box' } };
  const lbl = { fontSize:13, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:5 };

  return (
    <div style={{ minHeight:'100dvh', background:'var(--surface-2)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px', paddingTop:'env(safe-area-inset-top,16px)', overflowY:'auto' }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:'24px 18px', width:'100%', maxWidth:440, boxShadow:'var(--shadow-md)', marginTop:'auto', marginBottom:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:18 }}>My Account</div>
          <button onClick={onClose} style={{ padding:'6px 12px', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer' }}>← Back</button>
        </div>

        {/* Profile summary */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--surface-3)', borderRadius:'var(--radius-md)', marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#fff' }}>
            {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:600, fontSize:14 }}>{profile?.full_name || 'No name set'}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{user.email} {profile?.pan && `· ${profile.pan}`}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:20 }}>
          {[{id:'profile', label:'Profile', icon:<User size={14}/>},{id:'password', label:'Password', icon:<Lock size={14}/>}].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===t.id?600:400, color:tab===t.id?'var(--brand)':'var(--text-secondary)', borderBottom:`2px solid ${tab===t.id?'var(--brand)':'transparent'}` }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div>
            <div style={{ display:'grid', gap:10, marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>Full name</span>
                <span style={{ fontWeight:500 }}>{profile?.full_name || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>PAN</span>
                <span style={{ fontWeight:500 }}>{profile?.pan || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>Date of birth</span>
                <span style={{ fontWeight:500 }}>{profile?.dob || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>Mobile</span>
                <span style={{ fontWeight:500 }}>{profile?.phone || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>City</span>
                <span style={{ fontWeight:500 }}>{profile?.city || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13 }}>
                <span style={{ color:'var(--text-secondary)' }}>Aadhaar</span>
                <span style={{ fontWeight:500 }}>{profile?.aadhaar ? `XXXXXXXX${profile.aadhaar.slice(-4)}` : '—'}</span>
              </div>
            </div>
            <Button variant="primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => setShowKYC(true)}>
              <User size={14}/> Edit profile details
            </Button>
          </div>
        )}

        {tab === 'password' && (
          <div style={{ display:'grid', gap:14 }}>
            <div>
              <label style={lbl}>New password</label>
              <div style={{ position:'relative' }}>
                <input {...inp} type={showPwd?'text':'password'} value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Minimum 8 characters" />
                <button onClick={()=>setShowPwd(p=>!p)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <div>
              <label style={lbl}>Confirm new password</label>
              <input {...inp} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat new password" />
            </div>

            {msg && (
              <div style={{ padding:'8px 12px', borderRadius:8, fontSize:13, background: msg.type==='success'?'var(--success-light)':'var(--danger-light)', color: msg.type==='success'?'var(--success)':'var(--danger)', border:`1px solid ${msg.type==='success'?'#86efac':'#fca5a5'}` }}>
                {msg.type==='success' ? <CheckCircle size={14} style={{ marginRight:6, verticalAlign:'middle' }}/> : '⚠️ '}{msg.text}
              </div>
            )}

            <Button variant="primary" onClick={handlePasswordChange} disabled={saving || !newPass || !confirm} style={{ justifyContent:'center' }}>
              {saving ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Saving…</> : <><Lock size={14}/> Update password</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
