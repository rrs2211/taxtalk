// api/lib/helpers.js — v31 hardened
// Security: no key leakage, strict CORS, persistent rate limiting via Supabase

import { createClient } from '@supabase/supabase-js';

// ── Env validation (fail-fast at cold start) ──────────────────────────────────
function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`[TaxTalk] Missing required env var: ${name}. Check Vercel Environment Variables.`);
  return val;
}

function getSupabaseUrl()      { return requireEnv('SUPABASE_URL'); }
function getServiceRoleKey()   { return requireEnv('SUPABASE_SERVICE_ROLE_KEY'); }
function getAnonKey()          { return requireEnv('SUPABASE_ANON_KEY'); }
function getAllowedOrigin()     { return process.env.ALLOWED_ORIGIN || null; }

// ── Admin client (service role — bypasses RLS for server operations) ──────────
let _adminClient = null;
export function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _adminClient;
}

// ── Anon client (for verifying JWTs only) ────────────────────────────────────
let _anonClient = null;
function getAnonClient() {
  if (_anonClient) return _anonClient;
  _anonClient = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false },
  });
  return _anonClient;
}

// ── CORS headers (strict — no wildcard in production) ─────────────────────────
export function setCORSHeaders(req, res) {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigin();

  // In production: allow the configured origin, all *.vercel.app subdomains, and localhost
  const devOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
  const isVercelPreview = origin && /^https:\/\/[a-z0-9-]+(\.vercel\.app)$/.test(origin);
  const isAllowed = (allowed && origin === allowed)
    || isVercelPreview
    || devOrigins.includes(origin);

  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Server-to-server or same-origin — allow
    res.setHeader('Access-Control-Allow-Origin', 'null');
  } else {
    // Unknown origin — refuse CORS but let the request fail auth naturally
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // Never expose which backend/AI we use
  res.setHeader('X-Powered-By', '');
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
}

// ── JWT verification — returns user or null ───────────────────────────────────
export async function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (!token || token.length < 20) return null;

  // Use anon client to verify JWT — this never uses the service role key for auth
  const anonClient = getAnonClient();
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── Persistent rate limiting via Supabase RPC ─────────────────────────────────
// Falls back to in-memory if DB call fails (so extraction still works in dev)
const _memFallback = new Map();
export async function checkRateLimit(userId, endpoint, maxPerHour = 20) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_user_id:  userId,
      p_endpoint: endpoint,
      p_max:      maxPerHour,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    // Fallback: in-memory (dev / DB unavailable)
    const key = `${userId}:${endpoint}`;
    const now = Date.now();
    const window = 3_600_000;
    const entry = _memFallback.get(key);
    if (!entry || now - entry.t > window) {
      _memFallback.set(key, { n: 1, t: now });
      return true;
    }
    if (entry.n >= maxPerHour) return false;
    entry.n++;
    return true;
  }
}

// ── OPTIONS preflight ─────────────────────────────────────────────────────────
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}
