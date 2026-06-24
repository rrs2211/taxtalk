import React, { useState, useEffect } from 'react';
import { MessageCircle, ClipboardCheck, Inbox, User, LogOut, Shield, ChevronLeft } from 'lucide-react';
import { useAuth } from './hooks/useAuth.js';
import AuthScreen from './components/AuthScreen.jsx';
import TaxChat from './components/TaxChat.jsx';
import CADashboard from './components/CADashboard.jsx';
import ClientReturnManager from './components/ClientReturnManager.jsx';
import KYCScreen from './components/KYCScreen.jsx';
import ProfileSettings from './components/ProfileSettings.jsx';
import './index.css';

// ── PWA install prompt ────────────────────────────────────────────────────────
function InstallBanner({ onInstall, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))',
      left: 12, right: 12, zIndex: 200,
      background: 'var(--brand)', color: '#fff',
      borderRadius: 14, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 24px rgba(26,86,232,0.4)',
      animation: 'slideUp 0.35s ease',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>T</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Add TaxTalk to Home Screen</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Works offline, instant access</div>
      </div>
      <button onClick={onInstall} style={{ background: 'white', color: 'var(--brand)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Install</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#1a56e8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 auto 14px', boxShadow: '0 8px 24px rgba(26,86,232,0.25)' }}>T</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>TaxTalk</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading...</div>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [view, setView]           = useState('chat');
  const [showProfile, setShowProfile] = useState(false);
  const [deferredPrompt, setDeferred] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  // PWA install prompt
  useEffect(() => {
    const handler = e => { e.preventDefault(); setDeferred(e); setTimeout(() => setShowInstall(true), 5000); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferred(null); setShowInstall(false);
  }

  if (auth.loading) return <Spinner/>;
  if (!auth.user)   return <AuthScreen onAuth={{ signIn: auth.signIn, signUp: auth.signUp, forgotPassword: auth.forgotPassword }}/>;

  const needsKYC = !auth.isCA && !auth.profile?.kyc_complete;
  if (needsKYC) {
    return <KYCScreen userId={auth.user.id} existingProfile={auth.profile} onComplete={() => auth.refreshProfile()}/>;
  }
  if (showProfile) {
    return (
      <ProfileSettings
        user={auth.user} profile={auth.profile}
        onUpdate={() => { auth.refreshProfile(); setShowProfile(false); }}
        onClose={() => setShowProfile(false)}
      />
    );
  }

  // Tab config
  const TABS = auth.isCA ? [
    { id: 'chat',  label: 'File return',  icon: MessageCircle },
    { id: 'ca',    label: 'CA review',    icon: ClipboardCheck },
    { id: 'profile', label: 'Account',   icon: User },
  ] : [
    { id: 'chat',  label: 'File return',  icon: MessageCircle },
    { id: 'inbox', label: 'My returns',   icon: Inbox },
    { id: 'profile', label: 'Account',   icon: User },
  ];

  const firstName = auth.profile?.full_name?.split(' ')[0] || auth.profile?.email?.split('@')[0] || 'Account';

  return (
    <div className="app-shell">
      {/* Top nav */}
      <header className="top-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#1a56e8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>T</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>TaxTalk</span>
          {auth.isCA && (
            <span style={{ fontSize: 10, padding: '2px 7px', background: 'var(--brand-light)', color: 'var(--brand)', borderRadius: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Shield size={9}/> CA
            </span>
          )}
        </div>

        {/* Logout on far right */}
        <button onClick={auth.signOut} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', minHeight: 36 }}>
          <LogOut size={13}/> <span style={{ display: 'none' }}>Sign out</span>
        </button>
      </header>

      {/* Page content */}
      <div className="page-full">
        {/* Chat tab */}
        <div style={{ display: view === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TaxChat userId={auth.user.id}/>
        </div>

        {/* Inbox tab */}
        <div style={{ display: view === 'inbox' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="page-content">
            {!auth.isCA && <ClientReturnManager userId={auth.user.id}/>}
          </div>
        </div>

        {/* CA review tab */}
        <div style={{ display: view === 'ca' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="page-content">
            {auth.isCA && <CADashboard caUserId={auth.user.id}/>}
          </div>
        </div>

        {/* Profile tab */}
        <div style={{ display: view === 'profile' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="page-content" style={{ padding: '20px 16px' }}>
            {/* Profile summary */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#1a56e8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {firstName[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.profile?.full_name || firstName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.user.email}</div>
                  {auth.profile?.pan && <div style={{ fontSize: 12, color: 'var(--brand)', fontFamily: 'monospace', marginTop: 2 }}>{auth.profile.pan}</div>}
                </div>
              </div>
              <button onClick={() => setShowProfile(true)} className="btn btn-secondary btn-full" style={{ fontSize: 14 }}>
                <User size={14}/> Edit profile & change password
              </button>
            </div>

            {/* KYC status */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>KYC details</div>
              {[
                { l: 'Full name', v: auth.profile?.full_name },
                { l: 'PAN',      v: auth.profile?.pan },
                { l: 'Date of birth', v: auth.profile?.dob },
                { l: 'Mobile',   v: auth.profile?.phone },
                { l: 'City',     v: auth.profile?.city },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{r.l}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.v || '—'}</span>
                </div>
              ))}
            </div>

            {/* Sign out */}
            <button onClick={auth.signOut} className="btn btn-danger btn-full">
              <LogOut size={15}/> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="bottom-nav">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button key={tab.id} className="bottom-nav-item" onClick={() => setView(tab.id)}
              style={{ color: active ? 'var(--brand)' : 'var(--text-muted)' }}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8}/>
              <span className="nav-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* PWA install prompt */}
      {showInstall && <InstallBanner onInstall={handleInstall} onDismiss={() => setShowInstall(false)}/>}
    </div>
  );
}
