import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Shield } from 'lucide-react';

const STAGE = { LOGIN: 'login', SIGNUP: 'signup', FORGOT: 'forgot', VERIFY: 'verify' };

export default function AuthScreen({ onAuth }) {
  const [stage, setStage]       = useState(STAGE.LOGIN);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onAuth.signIn(email, password);
      // auth state change handled by useAuth listener
    } catch (err) {
      setError(friendlyError(err.message));
    } finally { setLoading(false); }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onAuth.signUp(email, password);
      setStage(STAGE.VERIFY);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally { setLoading(false); }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onAuth.forgotPassword(email);
      setMessage('Password reset link sent! Check your email.');
    } catch (err) {
      setError(friendlyError(err.message));
    } finally { setLoading(false); }
  }

  function friendlyError(msg) {
    if (msg?.includes('Invalid login')) return 'Incorrect email or password. Please try again.';
    if (msg?.includes('Email not confirmed')) return 'Please verify your email first. Check your inbox.';
    if (msg?.includes('already registered')) return 'This email is already registered. Try logging in.';
    if (msg?.includes('Password should')) return 'Password must be at least 6 characters.';
    return msg || 'Something went wrong. Please try again.';
  }

  const logoBlock = (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:32 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#1a56e8,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff' }}>T</div>
      <div>
        <div style={{ fontWeight:700, fontSize:18, letterSpacing:'-0.02em' }}>TaxTalk</div>
        <div style={{ fontSize:12, color:'#64748b' }}>RB Shah & Associates</div>
      </div>
    </div>
  );

  const emailField = (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:13, fontWeight:500, color:'#475569', display:'block', marginBottom:6 }}>Email address</label>
      <div style={{ display:'flex', alignItems:'center', border:'1.5px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff' }}>
        <Mail size={15} style={{ marginLeft:14, color:'#94a3b8', flexShrink:0 }} />
        <input
          type="email" required autoComplete="email" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
          style={{ flex:1, height:46, padding:'0 14px', fontSize:14, border:'none', outline:'none', background:'transparent', color:'#0f172a' }}
        />
      </div>
    </div>
  );

  const passwordField = (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:13, fontWeight:500, color:'#475569', display:'block', marginBottom:6 }}>Password</label>
      <div style={{ display:'flex', alignItems:'center', border:'1.5px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff' }}>
        <Lock size={15} style={{ marginLeft:14, color:'#94a3b8', flexShrink:0 }} />
        <input
          type={showPass ? 'text' : 'password'} required
          autoComplete={stage === STAGE.LOGIN ? 'current-password' : 'new-password'}
          value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
          style={{ flex:1, height:46, padding:'0 14px', fontSize:14, border:'none', outline:'none', background:'transparent', color:'#0f172a' }}
        />
        <button type="button" onClick={() => setShowPass(s => !s)}
          style={{ padding:'0 14px', background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}>
          {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );

  const submitBtn = (label) => (
    <button type="submit" disabled={loading} style={{
      width:'100%', height:48, borderRadius:10,
      background: loading ? '#94a3b8' : '#1a56e8',
      color:'#fff', fontSize:15, fontWeight:600, border:'none',
      cursor: loading ? 'not-allowed' : 'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
      transition:'background .15s',
    }}>
      {loading ? 'Please wait…' : <><span>{label}</span><ArrowRight size={16}/></>}
    </button>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', padding:16 }}>
      <div style={{ width:'100%', maxWidth:400, background:'#fff', borderRadius:20, border:'1px solid #e2e8f0', padding:'40px 36px', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' }}>

        {logoBlock}

        {/* ── LOGIN ── */}
        {stage === STAGE.LOGIN && (
          <form onSubmit={handleLogin}>
            <h2 style={{ fontSize:20, fontWeight:600, marginBottom:6 }}>Welcome back</h2>
            <p style={{ fontSize:14, color:'#64748b', marginBottom:24 }}>Sign in to your TaxTalk account</p>
            {emailField}
            {passwordField}
            {error && <p style={{ fontSize:13, color:'#dc2626', marginBottom:12 }}>{error}</p>}
            {submitBtn('Sign in')}
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:16, fontSize:13 }}>
              <button type="button" onClick={() => { setStage(STAGE.FORGOT); setError(''); }}
                style={{ background:'none', border:'none', color:'#1a56e8', cursor:'pointer', padding:0 }}>
                Forgot password?
              </button>
              <button type="button" onClick={() => { setStage(STAGE.SIGNUP); setError(''); }}
                style={{ background:'none', border:'none', color:'#1a56e8', cursor:'pointer', padding:0 }}>
                Create account
              </button>
            </div>
          </form>
        )}

        {/* ── SIGNUP ── */}
        {stage === STAGE.SIGNUP && (
          <form onSubmit={handleSignup}>
            <h2 style={{ fontSize:20, fontWeight:600, marginBottom:6 }}>Create account</h2>
            <p style={{ fontSize:14, color:'#64748b', marginBottom:24 }}>Start filing your income tax return</p>
            {emailField}
            {passwordField}
            <p style={{ fontSize:12, color:'#94a3b8', marginBottom:14, marginTop:-10 }}>Minimum 6 characters</p>
            {error && <p style={{ fontSize:13, color:'#dc2626', marginBottom:12 }}>{error}</p>}
            {submitBtn('Create account')}
            <p style={{ textAlign:'center', marginTop:16, fontSize:13, color:'#64748b' }}>
              Already have an account?{' '}
              <button type="button" onClick={() => { setStage(STAGE.LOGIN); setError(''); }}
                style={{ background:'none', border:'none', color:'#1a56e8', cursor:'pointer', padding:0 }}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {stage === STAGE.FORGOT && (
          <form onSubmit={handleForgot}>
            <h2 style={{ fontSize:20, fontWeight:600, marginBottom:6 }}>Reset password</h2>
            <p style={{ fontSize:14, color:'#64748b', marginBottom:24 }}>We'll send a reset link to your email</p>
            {emailField}
            {error   && <p style={{ fontSize:13, color:'#dc2626', marginBottom:12 }}>{error}</p>}
            {message && <p style={{ fontSize:13, color:'#16a34a', marginBottom:12 }}>{message}</p>}
            {!message && submitBtn('Send reset link')}
            <p style={{ textAlign:'center', marginTop:14, fontSize:13 }}>
              <button type="button" onClick={() => { setStage(STAGE.LOGIN); setError(''); setMessage(''); }}
                style={{ background:'none', border:'none', color:'#1a56e8', cursor:'pointer', padding:0 }}>
                ← Back to sign in
              </button>
            </p>
          </form>
        )}

        {/* ── VERIFY EMAIL ── */}
        {stage === STAGE.VERIFY && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
            <h2 style={{ fontSize:20, fontWeight:600, marginBottom:8 }}>Check your email</h2>
            <p style={{ fontSize:14, color:'#64748b', lineHeight:1.6, marginBottom:24 }}>
              We sent a verification link to <strong>{email}</strong>. Click it to activate your account, then come back here to sign in.
            </p>
            <button onClick={() => setStage(STAGE.LOGIN)} style={{
              width:'100%', height:48, borderRadius:10, background:'#1a56e8',
              color:'#fff', fontSize:15, fontWeight:600, border:'none', cursor:'pointer',
            }}>
              Go to sign in
            </button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:20, padding:'10px 12px', background:'#f8fafc', borderRadius:8 }}>
          <Shield size={13} color="#94a3b8" />
          <span style={{ fontSize:12, color:'#94a3b8' }}>Your data is encrypted and stored securely</span>
        </div>
      </div>
    </div>
  );
}
