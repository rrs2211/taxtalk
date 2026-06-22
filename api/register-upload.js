import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in' });

  const { returnId, docType, key, fileName, fileSizeKb } = req.body || {};

  if (!returnId || !docType || !key || !fileName) {
    return res.status(400).json({ message: `Missing fields. Got: returnId=${!!returnId} docType=${!!docType} key=${!!key} fileName=${!!fileName}` });
  }

  // Security: key must belong to this user
  if (!key.startsWith(`tax-documents/${user.id}/`)) {
    return res.status(403).json({ message: 'Invalid storage key' });
  }

  const supabase = getSupabaseAdmin();

  // Save document record — the browser already confirmed upload succeeded
  const { data, error } = await supabase
    .from('documents')
    .insert({
      return_id:         returnId,
      user_id:           user.id,
      doc_type:          docType,
      original_name:     fileName,
      storage_path:      key,
      file_size_kb:      fileSizeKb || 0,
      extraction_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('register-upload DB error:', JSON.stringify(error));
    return res.status(500).json({ message: `Database error: ${error.message}` });
  }

  // Audit log (non-blocking)
  supabase.from('audit_log').insert({
    return_id: returnId,
    user_id:   user.id,
    action:    `${docType}_uploaded`,
    detail:    { fileName, fileSizeKb, key },
  }).catch(e => console.warn('audit log failed:', e.message));

  return res.status(200).json({ document: data });
}
