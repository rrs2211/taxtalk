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
  // Get all messages in returns belonging to this user
  const { data, error } = await supabase
    .from('ca_queries')
    .select('*, returns(id, assessment_year, profile, itr_form), from_profile:from_user_id(id, full_name, email)')
    .or(`to_user_id.eq.${userId},from_user_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function replyToCAQuery(queryId, replyText, fromUserId, toUserId, returnId) {
  // New model: create a new row instead of updating client_reply field
  const { error } = await supabase
    .from('ca_queries')
    .insert({ return_id: returnId, from_user_id: fromUserId, to_user_id: toUserId, message: replyText, reply_to_id: queryId });
  if (error) throw error;
}

// ─── KYC / Profile ────────────────────────────────────────────

export async function getKYCStatus(userId) {
  // Uses profiles_safe view — never returns full aadhaar
  const { data } = await supabase.from('profiles').select('full_name,pan,dob,phone,aadhaar_last4,city,state_code,pin_code,locality,email,kyc_complete').eq('id', userId).single();
  return data;
}

export async function saveKYC(userId, kyc) {
  // Security: never store full Aadhaar — keep only last 4 digits
  const safeKyc = { ...kyc, kyc_complete: true };
  if (safeKyc.aadhaar && safeKyc.aadhaar.length > 4) {
    safeKyc.aadhaar_last4 = safeKyc.aadhaar.replace(/\D/g,'').slice(-4);
    delete safeKyc.aadhaar; // never persist full Aadhaar
  }
  const { data, error } = await supabase.from('profiles').update(safeKyc).eq('id', userId).select().single();
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
  // Fetch all messages — both CA-sent and client-replies (new rows)
  const { data, error } = await supabase
    .from('ca_queries')
    .select(`
      *,
      returns(id, assessment_year, profile, itr_form, status),
      to_profile:to_user_id(id, full_name, email, pan, city),
      from_profile:from_user_id(id, full_name, email)
    `)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getReturnMessages(returnId) {
  const { data, error } = await supabase
    .from('ca_queries')
    .select('*, from_profile:from_user_id(id, full_name, email, role)')
    .eq('return_id', returnId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sendMessage(returnId, fromUserId, toUserId, message, replyToId = null) {
  const { data, error } = await supabase
    .from('ca_queries')
    .insert({ return_id: returnId, from_user_id: fromUserId, to_user_id: toUserId, message, reply_to_id: replyToId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markMessagesRead(returnId, userId) {
  await supabase
    .from('ca_queries')
    .update({ is_read: true })
    .eq('return_id', returnId)
    .eq('to_user_id', userId)
    .eq('is_read', false);
}

// CA: edit return computation
export async function caUpdateReturn(returnId, updates) {
  const { data, error } = await supabase
    .from('returns')
    .update(updates)
    .eq('id', returnId)
    .select()
    .single();
  if (error) throw error;
  return data;
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

// ─── Document management ─────────────────────────────────────

export async function deleteDocument(documentId) {
  // soft-delete by marking inactive; hard delete if needed
  const { error } = await supabase
    .from('documents')
    .update({ extraction_status: 'deleted' })
    .eq('id', documentId);
  if (error) throw error;
}

export async function getMyDocuments(returnId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, original_name, extraction_status, confidence, created_at, storage_path')
    .eq('return_id', returnId)
    .neq('extraction_status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Client computation updates ─────────────────────────────

export async function clientUpdateComputation(returnId, userId, computation, changeNote) {
  // Guard: block updates on approved or filed returns
  const { data: currentRet } = await supabase
    .from('returns')
    .select('status, user_id')
    .eq('id', returnId)
    .single();

  if (!currentRet || currentRet.user_id !== userId) throw new Error('Return not found or access denied.');
  if (['approved', 'filed'].includes(currentRet.status)) {
    throw new Error(`Return is already ${currentRet.status}. Contact your CA to make changes.`);
  }

  // Save updated computation
  const { determineITRForm } = await import('./itrJson.js');
  const itrForm = determineITRForm(computation.profile, computation);
  const { data, error } = await supabase
    .from('returns')
    .update({
      computation,
      old_regime_tax: computation.oldTax,
      new_regime_tax: computation.newTax,
      chosen_regime:  computation.betterRegime,
      refund_amount:  computation.refund     || 0,
      balance_due:    computation.balanceDue || 0,
      itr_form:       itrForm,
      status:         'submitted',          // keep as submitted, not revert to in_progress
    })
    .eq('id', returnId)
    .select()
    .single();
  if (error) throw error;

  // Notify CA via message
  if (changeNote) {
    const caQueueEntry = await supabase
      .from('ca_queue')
      .select('user_id')
      .eq('return_id', returnId)
      .single();
    // Get a CA user to notify (first available CA)
    const { data: caProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'ca_admin')
      .limit(1)
      .single();
    if (caProfile?.id) {
      await supabase.from('ca_queries').insert({
        return_id: returnId,
        from_user_id: userId,
        to_user_id: caProfile.id,
        message: `📝 Client updated computation: ${changeNote}`,
      });
    }
  }
  await logAudit(returnId, userId, 'client_updated_computation', { note: changeNote });
  return data;
}

// ─── Challan / additional tax payment entry ──────────────────

export async function getChallans(returnId) {
  const { data, error } = await supabase
    .from('challans')
    .select('*')
    .eq('return_id', returnId)
    .order('payment_date', { ascending: true });
  if (error) {
    // Table might not exist yet — return empty gracefully
    console.warn('challans table not found, returning empty:', error.message);
    return [];
  }
  return data || [];
}

export async function addChallan(returnId, userId, challan) {
  const { data, error } = await supabase
    .from('challans')
    .insert({ return_id: returnId, user_id: userId, ...challan })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChallan(challanId) {
  const { error } = await supabase.from('challans').delete().eq('id', challanId);
  if (error) throw error;
}

// ─── Get return with documents (for client view) ─────────────

export async function getMyReturnsWithDocs(userId) {
  const { data, error } = await supabase
    .from('returns')
    .select('id, assessment_year, status, itr_form, profile, computation, created_at, updated_at, acknowledgement_no, filed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Lock identity — PAN, name, DOB once set cannot be changed ───────────────

export async function lockIdentity(userId, { full_name, pan, dob }) {
  // Only sets these fields; once identity_locked=true, these are immutable via RLS
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name, pan: pan.toUpperCase(), dob, identity_locked: true })
    .eq('id', userId)
    .eq('identity_locked', false)  // RLS: only update if not already locked
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileForFiling(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, pan, dob, phone, aadhaar, email, city, state_code, pin_code, locality, kyc_complete, identity_locked, role')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Consent recording ─────────────────────────────────────────────────────

export async function recordConsent(userId, { termsVersion = 'v1.0', privacyVersion = 'v1.0', cookieConsent = true } = {}) {
  const { error } = await supabase
    .from('consent_records')
    .insert({
      user_id:          userId,
      terms_version:    termsVersion,
      privacy_version:  privacyVersion,
      cookie_consent:   cookieConsent,
    });
  if (error) console.error('recordConsent error:', error);
  // Also mark on profile
  await supabase.from('profiles').update({
    terms_accepted:    true,
    terms_accepted_at: new Date().toISOString(),
  }).eq('id', userId);
}

export async function hasAcceptedTerms(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('terms_accepted')
    .eq('id', userId)
    .single();
  return data?.terms_accepted === true;
}


// ─── Challans (advance tax / self-assessment) ─────────────────────────────────
export async function getChallansForReturn(returnId) {
  const { data, error } = await supabase.from('challans')
    .select('*').eq('return_id', returnId).order('payment_date', { ascending: true });
  if (error) { console.warn('challans fetch error:', error.message); return []; }
  return data || [];
}

export async function addChallanEntry(returnId, userId, challan) {
  const { data, error } = await supabase.from('challans')
    .insert({ return_id: returnId, user_id: userId, ...challan }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteChallanEntry(challanId) {
  const { error } = await supabase.from('challans').delete().eq('id', challanId);
  if (error) throw error;
}

// ─── TDS2 entries (non-salary TDS) ───────────────────────────────────────────
export async function getTDS2Entries(returnId) {
  const { data, error } = await supabase.from('tds2_entries')
    .select('*').eq('return_id', returnId).order('created_at', { ascending: true });
  if (error) { console.warn('tds2 fetch error:', error.message); return []; }
  return data || [];
}

export async function saveTDS2Entry(returnId, userId, entry) {
  const { data, error } = await supabase.from('tds2_entries')
    .insert({ return_id: returnId, user_id: userId, ...entry }).select().single();
  if (error) throw error;
  return data;
}

// ─── Schedule 80G donees ──────────────────────────────────────────────────────
export async function get80GDonees(returnId) {
  const { data, error } = await supabase.from('schedule_80g')
    .select('*').eq('return_id', returnId).order('created_at', { ascending: true });
  if (error) { console.warn('80G fetch error:', error.message); return []; }
  return data || [];
}

export async function save80GDonee(returnId, userId, donee) {
  const { data, error } = await supabase.from('schedule_80g')
    .insert({ return_id: returnId, user_id: userId, ...donee }).select().single();
  if (error) throw error;
  return data;
}

export async function delete80GDonee(id) {
  const { error } = await supabase.from('schedule_80g').delete().eq('id', id);
  if (error) throw error;
}

// ─── Schedule 80D insurers ────────────────────────────────────────────────────
export async function get80DEntries(returnId) {
  const { data, error } = await supabase.from('schedule_80d')
    .select('*').eq('return_id', returnId).order('created_at', { ascending: true });
  if (error) { console.warn('80D fetch error:', error.message); return []; }
  return data || [];
}

export async function save80DEntry(returnId, userId, entry) {
  const { data, error } = await supabase.from('schedule_80d')
    .insert({ return_id: returnId, user_id: userId, ...entry }).select().single();
  if (error) throw error;
  return data;
}
