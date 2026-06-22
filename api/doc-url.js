import { getPresignedUrl } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in' });

  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ message: 'Missing documentId' });

  const supabase = getSupabaseAdmin();
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*, returns(user_id)')
    .eq('id', documentId)
    .single();

  if (error || !doc) return res.status(404).json({ message: 'Document not found' });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isOwner = doc.returns?.user_id === user.id;
  const isCA    = ['ca_staff', 'ca_admin'].includes(profile?.role);
  if (!isOwner && !isCA) return res.status(403).json({ message: 'Access denied' });

  try {
    const url = await getPresignedUrl(doc.storage_path, 300);
    if (isCA && !isOwner) {
      await supabase.from('audit_log').insert({ return_id: doc.return_id, user_id: user.id, action: 'ca_viewed_document', detail: { documentId } }).catch(() => {});
    }
    return res.status(200).json({ url, expiresIn: 300 });
  } catch (err) {
    console.error('doc-url error:', err.message);
    return res.status(500).json({ message: 'Could not generate document URL' });
  }
}
