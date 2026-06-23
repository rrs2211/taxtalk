import React, { useState } from 'react';
import { MessageCircle, ClipboardCheck, Inbox, User, LogOut, Shield } from 'lucide-react';
import { useAuth } from './hooks/useAuth.js';
import AuthScreen from './components/AuthScreen.jsx';
import TaxChat from './components/TaxChat.jsx';
import CADashboard from './components/CADashboard.jsx';
import ClientInbox from './components/ClientInbox.jsx';
import KYCScreen from './components/KYCScreen.jsx';
import ProfileSettings from './components/ProfileSettings.jsx';
import './index.css';

function Spinner() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', margin:'0 auto 12px' }}>T</div>
        <div style={{ fontSize:13, color:'#94a3b8' }}>Loading TaxTalk...</div>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [view, setView] = useState('client');
  const [showProfile, setShowProfile] = useState(false);

  if (auth.loading) return <Spinner/>;
  if (!auth.user)   return <AuthScreen onAuth={{ signIn:auth.signIn, signUp:auth.signUp, forgotPassword:auth.forgotPassword }}/>;

  // KYC gate — non-CA users must complete profile before accessing chat
  const needsKYC = !auth.isCA && !auth.profile?.kyc_complete;
  if (needsKYC) {
    return (
      <KYCScreen
        userId={auth.user.id}
        existingProfile={auth.profile}
        onComplete={() => auth.refreshProfile()}
      />
    );
  }

  if (showProfile) {
    return (
      <ProfileSettings
        user={auth.user}
        profile={auth.profile}
        onUpdate={() => { auth.refreshProfile(); setShowProfile(false); }}
        onClose={() => setShowProfile(false)}
      />
    );
  }

  const tabs = [
    { id:'client',  label:'File my return', icon:<MessageCircle size={15}/>, show:true },
    { id:'inbox',   label:'My returns',     icon:<Inbox size={15}/>,         show:!auth.isCA },
    { id:'ca',      label:'CA review',      icon:<ClipboardCheck size={15}/>,show:auth.isCA },
  ].filter(t => t.show);

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', background:'#f8fafc' }}>
      <nav style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 20px', display:'flex', alignItems:'center', position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginRight:28, padding:'12px 0' }}>
          <div style={{ width:28, height:28, borderRadius:8, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff' }}>T</div>
          <span style={{ fontWeight:700, fontSize:16, letterSpacing:'-0.02em' }}>TaxTalk</span>
        </div>

        {tabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'16px 14px 14px', border:'none', background:'transparent', fontSize:13, fontWeight:view===t.id?600:400, color:view===t.id?'#1a56e8':'#64748b', borderBottom:`2px solid ${view===t.id?'#1a56e8':'transparent'}`, cursor:'pointer', transition:'all .15s' }}>
            {t.icon}{t.label}
          </button>
        ))}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, padding:'12px 0' }}>
          <button onClick={() => setShowProfile(true)} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', border:'1px solid #e2e8f0', borderRadius:8, background:'transparent', color:'#64748b', fontSize:12, cursor:'pointer' }}>
            <User size={13}/>
            <span>{auth.profile?.full_name?.split(' ')[0] || auth.profile?.email?.split('@')[0] || 'Profile'}</span>
            {auth.isCA && <Shield size={11} color="#1a56e8"/>}
          </button>
          <button onClick={auth.signOut} style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', border:'1px solid #e2e8f0', borderRadius:8, background:'transparent', color:'#64748b', fontSize:12, cursor:'pointer' }}>
            <LogOut size={13}/>
          </button>
        </div>
      </nav>

      <div style={{ flex:1, display:view==='client'?'flex':'none', flexDirection:'column', height:'calc(100vh - 49px)' }}>
        <TaxChat userId={auth.user.id}/>
      </div>
      <div style={{ flex:1, display:view==='inbox'?'block':'none', overflowY:'auto' }}>
        {!auth.isCA && <ClientInbox userId={auth.user.id}/>}
      </div>
      <div style={{ flex:1, display:view==='ca'?'block':'none', overflowY:'auto' }}>
        {auth.isCA && <CADashboard caUserId={auth.user.id}/>}
      </div>
    </div>
  );
}
