// api/register-upload.js
// Step 3 of the two-step upload flow (after the browser PUT to R2 succeeds):
//   Browser → POST /api/register-upload { returnId, docType, key, fileName, fileSize }
//   Server  → verifies the object actually exists in R2, then saves doc record to Supabase
//
// This ensures we never have orphaned DB records pointing to missing R2 objects.

import { createClient } from '@supabase/supabase-js';
import { objectExists } from './lib/r2.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorised' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) return res.status(401).json({ message: 'Invalid session' });

  const { returnId, docType, key, fileName, fileSizeKb } = req.body || {};

  if (!returnId || !docType || !key || !fileName) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Security: key must start with the user's own ID to prevent path hijacking
  if (!key.startsWith(`tax-documents/${user.id}/`)) {
    return res.status(403).json({ message: 'Invalid storage key' });
  }

  // Verify the object actually landed in R2 before recording it
  const exists = await objectExists(key);
  if (!exists) {
    return res.status(400).json({ message: 'Upload not found in storage. Please try again.' });
  }

  // Save document record to Supabase
  const { data, error } = await supabase
    .from('documents')
    .insert({
      return_id: returnId,
      user_id: user.id,
      doc_type: docType,
      original_name: fileName,
      storage_path: key,             // R2 object key (not a URL)
      file_size_kb: fileSizeKb || 0,
      extraction_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('register-upload DB error:', error);
    return res.status(500).json({ message: 'Failed to register document' });
  }

  // Audit log
  await supabase.from('audit_log').insert({
    return_id: returnId,
    user_id: user.id,
    action: `${docType}_uploaded`,
    detail: { fileName, fileSizeKb, key },
  });

  return res.status(200).json({ document: data });
}
