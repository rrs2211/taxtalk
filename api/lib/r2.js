// api/lib/r2.js
// Cloudflare R2 storage — server-side only (Vercel serverless functions).
// R2 is S3-compatible, so we use AWS SDK v3 with a custom endpoint.
// The client, bucket name, and credentials NEVER reach the browser.
//
// Bucket layout:
//   tax-documents/{userId}/{returnId}/{docType}_{timestamp}.pdf
//
// All objects are PRIVATE — access only via short-lived presigned URLs (5 min).
// Objects are tagged with userId + returnId for lifecycle rules.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Client() {
  const accountId  = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKey  = process.env.R2_ACCESS_KEY_ID;
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('Missing R2 credentials: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME || 'taxtalk-documents';

// ─── Upload a file buffer to R2 ──────────────────────────────────────────────

export async function uploadToR2(key, fileBuffer, contentType, metadata = {}) {
  const client = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    Metadata: {
      // Store owner info in object metadata for audit + lifecycle
      ...Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [k, String(v)])
      ),
    },
    // Objects not accessed in 7 years can be deleted via lifecycle rule
    // (ICAI requires 6 years retention post-filing)
    Tagging: `userId=${metadata.userId || 'unknown'}&returnId=${metadata.returnId || 'unknown'}`,
  }));

  return key;
}

// ─── Generate a presigned GET URL (default 5 minutes) ────────────────────────

export async function getPresignedUrl(key, expiresInSeconds = 300) {
  const client = getR2Client();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds }
  );

  return url;
}

// ─── Generate a presigned PUT URL for direct browser upload ──────────────────
// Use this to let the browser upload directly to R2 without routing
// the file through Vercel (avoids 4.5MB Vercel body limit on free plan).

export async function getPresignedUploadUrl(key, contentType, expiresInSeconds = 300) {
  const client = getR2Client();
  const { PutObjectCommand: Put } = await import('@aws-sdk/client-s3');

  const url = await getSignedUrl(
    client,
    new Put({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds }
  );

  return url;
}

// ─── Delete an object ────────────────────────────────────────────────────────

export async function deleteFromR2(key) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ─── Check if object exists ──────────────────────────────────────────────────

export async function objectExists(key) {
  const client = getR2Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Build the standard R2 key for a tax document ────────────────────────────

export function buildDocKey(userId, returnId, docType, originalName) {
  const ext  = originalName.split('.').pop().toLowerCase();
  const ts   = Date.now();
  // Sanitise inputs — no path traversal
  const safeUser   = userId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeReturn = returnId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeType   = docType.replace(/[^a-zA-Z0-9_]/g, '');
  return `tax-documents/${safeUser}/${safeReturn}/${safeType}_${ts}.${ext}`;
}
