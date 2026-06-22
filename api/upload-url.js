// api/upload-url.js
// Step 1 of the two-step upload flow:
//   Browser → POST /api/upload-url → gets a presigned R2 PUT URL
//   Browser → PUT {presignedUrl} (directly to R2, no Vercel limit)
//   Browser → POST /api/register-upload → saves doc record to Supabase
//
// This avoids Vercel's 4.5MB request body limit on the free/pro plan.
// The presigned URL is scoped to exactly one object key and expires in 5 min.

import { createClient } from '@supabase/supabase-js';
import { buildDocKey, getPresignedUploadUrl } from './lib/r2.js';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  // Verify Supabase session — only authenticated users can get upload URLs
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorised' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // service role to verify JWT
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) return res.status(401).json({ message: 'Invalid session' });

  const { returnId, docType, fileName, fileSize, contentType } = req.body || {};

  // Validate inputs
  if (!returnId || !docType || !fileName || !contentType) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ message: 'File type not allowed. Upload PDF, JPG, or PNG.' });
  }
  if (fileSize && fileSize > MAX_SIZE_BYTES) {
    return res.status(400).json({ message: 'File too large. Maximum 10MB.' });
  }

  // Verify this return belongs to the authenticated user (RLS equivalent)
  const { data: ret, error: retError } = await supabase
    .from('returns')
    .select('id, user_id, status')
    .eq('id', returnId)
    .eq('user_id', user.id)
    .single();

  if (retError || !ret) {
    return res.status(403).json({ message: 'Return not found or access denied' });
  }
  if (!['in_progress', 'queried'].includes(ret.status)) {
    return res.status(400).json({ message: 'Cannot upload to a submitted or filed return' });
  }

  try {
    const key = buildDocKey(user.id, returnId, docType, fileName);
    const presignedUrl = await getPresignedUploadUrl(key, contentType, 300);

    return res.status(200).json({
      uploadUrl: presignedUrl,
      key,                       // client echoes this back to /api/register-upload
      expiresIn: 300,
    });
  } catch (err) {
    console.error('upload-url error:', err);
    return res.status(500).json({ message: 'Could not generate upload URL' });
  }
}
