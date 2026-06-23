import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ─── Auth helpers (Email) ────────────────────────────────────

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// ─── Profile helpers ─────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Returns helpers ─────────────────────────────────────────

export async function getOrCreateReturn(userId, assessmentYear = '2026-27') {
  // Try to find an in-progress return for this AY
  const { data: existing } = await supabase
    .from('returns')
    .select('*')
    .eq('user_id', userId)
    .eq('assessment_year', assessmentYear)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing;

  // Create a new one
  const { data, error } = await supabase
    .from('returns')
    .insert({ user_id: userId, assessment_year: assessmentYear })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateReturn(returnId, updates) {
  const { data, error } = await supabase
    .from('returns')
    .update(updates)
    .eq('id', returnId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitReturn(returnId) {
  const { data, error } = await supabase
    .from('returns')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', returnId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Conversation helpers ────────────────────────────────────

export async function loadConversation(returnId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('return_id', returnId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveMessage(returnId, userId, role, content, step, metadata = {}) {
  const { error } = await supabase
    .from('conversations')
    .insert({
      return_id: returnId,
      user_id: userId,
      role,
      content,
      step,
      metadata,
    });
  if (error) console.error('saveMessage error:', error);
}

// ─── Document helpers ────────────────────────────────────────
// File uploads go through src/lib/storage.js (R2 two-step presigned flow).
// These helpers only handle the Supabase metadata side.

export async function getDocumentsByReturn(returnId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, original_name, extraction_status, confidence, created_at')
    .eq('return_id', returnId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getDocumentExtraction(documentId) {
  const { data, error } = await supabase
    .from('documents')
    .select('extracted_json, extraction_status, confidence')
    .eq('id', documentId)
    .single();
  if (error) throw error;
  return data;
}

// Poll extraction status until success/failed (used after upload)
export async function pollExtractionStatus(documentId, timeoutMs = 60000) {
  const interval = 2000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('documents')
      .select('extraction_status, extracted_json, confidence')
      .eq('id', documentId)
      .single();
    if (data?.extraction_status === 'success') return data;
    if (data?.extraction_status === 'failed')  throw new Error('Extraction failed');
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Extraction timed out');
}

// ─── CA Queue helpers ────────────────────────────────────────

export async function getCAQueue() {
  const { data, error } = await supabase
    .from('ca_queue')
    .select(`
      *,
      returns (*),
      profiles:user_id (full_name, pan, phone, email),
      flags (*)
    `)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function subscribeToCAQueue(callback) {
  return supabase
    .channel('ca_queue_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ca_queue' }, callback)
    .subscribe();
}

export async function approveReturn(returnId, caUserId) {
  const { error } = await supabase
    .from('returns')
    .update({
      status: 'approved',
      filed_by: caUserId,
    })
    .eq('id', returnId);
  if (error) throw error;

  await supabase
    .from('ca_queue')
    .update({ approved_at: new Date().toISOString(), approved_by: caUserId })
    .eq('return_id', returnId);

  await logAudit(returnId, caUserId, 'ca_approved');
}

export async function sendCAQuery(returnId, fromUserId, toUserId, message) {
  const { error } = await supabase
    .from('ca_queries')
    .insert({ return_id: returnId, from_user_id: fromUserId, to_user_id: toUserId, message });
  if (error) throw error;

  await supabase
    .from('returns')
    .update({ status: 'queried' })
    .eq('id', returnId);

  await logAudit(returnId, fromUserId, 'ca_query_sent', { to: toUserId });
}

// ─── Flags helpers ───────────────────────────────────────────

export async function insertFlags(returnId, flags) {
  if (!flags.length) return;
  const { error } = await supabase
    .from('flags')
    .insert(flags.map(f => ({ return_id: returnId, ...f })));
  if (error) throw error;
}

// ─── Audit log ───────────────────────────────────────────────

export async function logAudit(returnId, userId, action, detail = {}) {
  await supabase
    .from('audit_log')
    .insert({ return_id: returnId, user_id: userId, action, detail });
}

// ─── Client: get all returns (history) ───────────────────────

export async function getMyReturns(userId) {
  const { data, error } = await supabase
    .from('returns')
    .select('id, assessment_year, status, itr_form, profile, computation, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── CA queries for a client ─────────────────────────────────

export async function getMyCAQueries(userId) {
  const { data, error } = await supabase
    .from('ca_queries')
    .select('*, returns (id, assessment_year, profile, itr_form), from_profile:from_user_id (full_name, email)')
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function replyToCAQuery(queryId, replyText) {
  const { error } = await supabase
    .from('ca_queries')
    .update({ client_reply: replyText, replied_at: new Date().toISOString() })
    .eq('id', queryId);
  if (error) throw error;
}

// ─── KYC / Profile ────────────────────────────────────────────

export async function getKYCStatus(userId) {
  const { data } = await supabase.from('profiles').select('full_name,pan,dob,phone,aadhaar,city,state_code,pin_code,locality,email,kyc_complete').eq('id', userId).single();
  return data;
}

export async function saveKYC(userId, kyc) {
  const { data, error } = await supabase.from('profiles').update({ ...kyc, kyc_complete: true }).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ─── CA: all app users ───────────────────────────────────────

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, pan, city, role, kyc_complete, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Delete return ────────────────────────────────────────────

export async function deleteReturn(returnId, userId) {
  // Delete cascades to conversations, documents, flags, ca_queue, ca_queries via FK
  const { error } = await supabase.from('returns').delete().eq('id', returnId).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteReturnAsCA(returnId) {
  const { error } = await supabase.from('returns').delete().eq('id', returnId);
  if (error) throw error;
}

// ─── CA: queries from all clients (for CA message center) ────

export async function getAllCAQueries() {
  const { data, error } = await supabase
    .from('ca_queries')
    .select('*, returns(id, assessment_year, profile, itr_form, status), client:to_user_id(full_name, email, pan, city), sender:from_user_id(full_name, email)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function sendCAReply(queryId, fromUserId, toUserId, returnId, message) {
  const { error } = await supabase.from('ca_queries').insert({ return_id: returnId, from_user_id: fromUserId, to_user_id: toUserId, message });
  if (error) throw error;
}

// ─── Documents for a return (for CA review) ──────────────────

export async function getReturnDocuments(returnId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, original_name, extraction_status, confidence, created_at, extracted_json')
    .eq('return_id', returnId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
