import React from 'react';
import { MessageCircle, ClipboardCheck, Shield, LogOut } from 'lucide-react';
import { useAuth } from './hooks/useAuth.js';
import AuthScreen from './components/AuthScreen.jsx';
import TaxChat from './components/TaxChat.jsx';
import CADashboard from './components/CADashboard.jsx';
import './index.css';

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg, #1a56e8, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 auto 12px',
        }}>T</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [view, setView] = React.useState('client');

  if (auth.loading) return <Spinner />;
  if (!auth.user) return <AuthScreen onAuth={{ signIn: auth.signIn, signUp: auth.signUp, forgotPassword: auth.forgotPassword }} />;

  // Non-CA users: only show client chat
  const showCATab = auth.isCA;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <nav style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '0 20px', display: 'flex', alignItems: 'center', gap: 0,
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28, padding: '12px 0' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #1a56e8, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
          }}>T</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>TaxTalk</span>
        </div>

        <button onClick={() => setView('client')} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '16px 14px 14px', border: 'none', background: 'transparent',
          fontSize: 13, fontWeight: view === 'client' ? 600 : 400,
          color: view === 'client' ? '#1a56e8' : '#64748b',
          borderBottom: view === 'client' ? '2px solid #1a56e8' : '2px solid transparent',
          cursor: 'pointer', transition: 'all .15s',
        }}>
          <MessageCircle size={15} /> File my return
        </button>

        {showCATab && (
          <button onClick={() => setView('ca')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '16px 14px 14px', border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: view === 'ca' ? 600 : 400,
            color: view === 'ca' ? '#1a56e8' : '#64748b',
            borderBottom: view === 'ca' ? '2px solid #1a56e8' : '2px solid transparent',
            cursor: 'pointer', transition: 'all .15s',
          }}>
            <ClipboardCheck size={15} /> CA review
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8' }}>
            <Shield size={13} />
            <span>{auth.profile?.full_name || auth.profile?.phone || 'RB Shah & Associates'}</span>
          </div>
          <button onClick={auth.signOut} title="Sign out" style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8,
            background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer',
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, display: view === 'client' ? 'flex' : 'none', flexDirection: 'column', height: 'calc(100vh - 49px)' }}>
        <TaxChat userId={auth.user.id} profile={auth.profile} />
      </div>
      {showCATab && (
        <div style={{ flex: 1, display: view === 'ca' ? 'block' : 'none', overflowY: 'auto' }}>
          <CADashboard caUserId={auth.user.id} />
        </div>
      )}
    </div>
  );
}
