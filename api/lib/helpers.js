// api/lib/helpers.js
// Shared utilities for all Vercel API functions

import { createClient } from '@supabase/supabase-js';

// ── Env vars: server-side names with VITE_ fallbacks ─────────────────────────
// In Vercel, set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as server-only vars.
// If you only set the VITE_ versions, these fallbacks kick in automatically.

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
}

// ── Supabase admin client (uses service role — server only) ──────────────────

export function getSupabaseAdmin() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey() || getAnonKey(); // fallback to anon if no service role
  if (!url || !key) throw new Error('Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── CORS headers ─────────────────────────────────────────────────────────────
// Allows your Vercel domain, localhost for dev, and any custom domain.

export function setCORSHeaders(req, res) {
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || process.env.ALLOWED_ORIGIN === '*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // In dev or if no ALLOWED_ORIGIN set, allow all
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ── Verify Supabase JWT and return user ──────────────────────────────────────

export async function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── Standard OPTIONS handler ─────────────────────────────────────────────────

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}
