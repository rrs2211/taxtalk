import { buildDocKey, getPresignedUploadUrl } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Please sign in to upload documents' });

  const { returnId, docType, fileName, fileSize, contentType } = req.body || {};

  if (!returnId || !docType || !fileName || !contentType) {
    return res.status(400).json({ message: 'Missing fields: returnId, docType, fileName, contentType' });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ message: 'Only PDF, JPG, and PNG files are allowed' });
  }
  if (fileSize && fileSize > MAX_SIZE_BYTES) {
    return res.status(400).json({ message: 'File too large — maximum 10MB' });
  }

  // Verify return belongs to this user
  const supabase = getSupabaseAdmin();
  const { data: ret, error: retError } = await supabase
    .from('returns')
    .select('id, user_id, status')
    .eq('id', returnId)
    .eq('user_id', user.id)
    .single();

  if (retError || !ret) {
    return res.status(403).json({ message: 'Return not found or access denied' });
  }

  try {
    const key = buildDocKey(user.id, returnId, docType, fileName);
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 300);
    return res.status(200).json({ uploadUrl, key, expiresIn: 300 });
  } catch (err) {
    console.error('upload-url error:', err.message);
    return res.status(500).json({ message: 'Could not generate upload URL. Check R2 credentials in Vercel environment variables.' });
  }
}
