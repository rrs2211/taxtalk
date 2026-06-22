// api/doc-url.js
// Returns a short-lived (5 min) presigned GET URL for a document stored in R2.
// Only the document owner or CA staff can request a URL.
// The actual R2 object key is NEVER sent to the browser — only the signed URL.

import { createClient } from '@supabase/supabase-js';
import { getPresignedUrl } from './lib/r2.js';

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

  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ message: 'Missing documentId' });

  // Fetch the document record
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*, returns(user_id)')
    .eq('id', documentId)
    .single();

  if (docError || !doc) return res.status(404).json({ message: 'Document not found' });

  // Check access: owner OR CA staff
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isOwner = doc.returns?.user_id === user.id;
  const isCA    = ['ca_staff', 'ca_admin'].includes(profile?.role);

  if (!isOwner && !isCA) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const url = await getPresignedUrl(doc.storage_path, 300);

    // Audit: CA viewing a client's document
    if (isCA && !isOwner) {
      await supabase.from('audit_log').insert({
        return_id: doc.return_id,
        user_id: user.id,
        action: 'ca_viewed_document',
        detail: { documentId, docType: doc.doc_type },
      });
    }

    return res.status(200).json({ url, expiresIn: 300 });
  } catch (err) {
    console.error('doc-url error:', err);
    return res.status(500).json({ message: 'Could not generate document URL' });
  }
}
