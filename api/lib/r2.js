// api/lib/r2.js — Cloudflare R2 via AWS SDK v3 (S3-compatible)

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error(
      `Missing R2 credentials. In Vercel → Settings → Environment Variables, ensure these are set: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. Got: accountId=${!!accountId} accessKey=${!!accessKey} secretKey=${!!secretKey}`
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    // Force path-style for R2 compatibility
    forcePathStyle: false,
  });
}

const getBucket = () => process.env.R2_BUCKET_NAME || 'taxtalk-documents';

// ── Presigned PUT URL — for direct browser upload ─────────────────────────────
export async function getPresignedUploadUrl(key, contentType, expiresInSeconds = 300) {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}

// ── Presigned GET URL — for reading a stored file ─────────────────────────────
export async function getPresignedUrl(key, expiresInSeconds = 300) {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

// ── Check object exists — returns true/false, never throws ───────────────────
export async function objectExists(key) {
  try {
    const client = getR2Client();
    await client.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    return true;
  } catch (err) {
    // 404 = not found (expected). Other errors = credential/config issue — re-throw
    const status = err?.$metadata?.httpStatusCode || err?.statusCode;
    if (status === 404 || err?.name === 'NotFound') return false;
    // Re-throw so register-upload gives a useful 500 error instead of silent 400
    throw new Error(`R2 HeadObject failed (status ${status}): ${err?.message}. Check R2 credentials in Vercel.`);
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteFromR2(key) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

// ── Build the object key for a document ──────────────────────────────────────
export function buildDocKey(userId, returnId, docType, originalName) {
  const ext        = (originalName.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeUser   = userId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeReturn = returnId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeType   = docType.replace(/[^a-zA-Z0-9_]/g, '');
  return `tax-documents/${safeUser}/${safeReturn}/${safeType}_${Date.now()}.${ext}`;
}
