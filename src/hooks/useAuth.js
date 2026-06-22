import { useState, useEffect, useCallback } from 'react';
import {
  supabase, signInWithEmail, signUpWithEmail, resetPassword,
  signOut as sbSignOut, getProfile, logAudit,
} from '../lib/supabase.js';

export function useAuth() {
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    try {
      const p = await getProfile(userId);
      setProfile(p);
    } catch (e) {
      console.error('loadProfile error:', e);
    } finally {
      setLoading(false);
    }
  }

  const signIn = useCallback(async (email, password) => {
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signUp = useCallback(async (email, password) => {
    setError(null);
    try {
      await signUpWithEmail(email, password);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const forgotPassword = useCallback(async (email) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (profile?.id) await logAudit(null, profile.id, 'sign_out').catch(() => {});
    await sbSignOut();
    setProfile(null);
    setSession(null);
  }, [profile]);

  return {
    session,
    user:    session?.user ?? null,
    profile,
    loading,
    error,
    isCA:    profile?.role === 'ca_staff' || profile?.role === 'ca_admin',
    isAdmin: profile?.role === 'ca_admin',
    signIn,
    signUp,
    forgotPassword,
    signOut,
    refreshProfile: () => session?.user && loadProfile(session.user.id),
  };
}
