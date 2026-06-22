import { objectExists } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in' });

  const { returnId, docType, key, fileName, fileSizeKb } = req.body || {};

  if (!returnId || !docType || !key || !fileName) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Prevent path traversal — key must start with user's own ID
  if (!key.startsWith(`tax-documents/${user.id}/`)) {
    return res.status(403).json({ message: 'Invalid storage key' });
  }

  // Verify file actually landed in R2 before recording
  const exists = await objectExists(key).catch(() => false);
  if (!exists) {
    return res.status(400).json({ message: 'File not found in storage. Please try uploading again.' });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('documents')
    .insert({
      return_id: returnId,
      user_id: user.id,
      doc_type: docType,
      original_name: fileName,
      storage_path: key,
      file_size_kb: fileSizeKb || 0,
      extraction_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('register-upload DB error:', error.message);
    return res.status(500).json({ message: 'Failed to save document record' });
  }

  // Audit log
  await supabase.from('audit_log').insert({
    return_id: returnId, user_id: user.id,
    action: `${docType}_uploaded`,
    detail: { fileName, fileSizeKb, key },
  }).catch(() => {});

  return res.status(200).json({ document: data });
}
