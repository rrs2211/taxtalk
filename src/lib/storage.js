// src/lib/storage.js
// Client-side document upload using the two-step presigned URL flow:
//
//  1. GET presigned PUT URL from /api/upload-url  (authenticated)
//  2. PUT file directly to R2                     (no auth, just the presigned URL)
//  3. POST to /api/register-upload                (authenticated, verifies + saves to DB)
//
// Benefits vs routing through Vercel:
//  - No 4.5MB Vercel body limit
//  - No double-bandwidth (file goes browser → R2 directly)
//  - Upload progress available via XHR

import { supabase } from './supabase.js';

// ─── Get the current session token for authenticated API calls ────────────────

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

// ─── Main upload function ─────────────────────────────────────────────────────
//
// @param {File}     file        - The file object from <input type="file">
// @param {string}   returnId    - UUID of the active return
// @param {string}   docType     - 'form16' | 'form16a' | 'ais' | 'balance_sheet' | 'pl_statement'
// @param {function} onProgress  - Optional callback(percent: 0–100)
// @returns {object} document record from Supabase

export async function uploadDocument(file, returnId, docType, onProgress) {
  const token = await getAuthToken();

  // Detect content type — file.type can be empty on Windows for PDFs
  const ext = file.name.split('.').pop().toLowerCase();
  const contentType = file.type ||
    (ext === 'pdf'  ? 'application/pdf' :
     ext === 'png'  ? 'image/png' :
     ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
     ext === 'webp' ? 'image/webp' :
     'application/pdf');

  // Step 1: Request a presigned PUT URL
  const urlRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      returnId,
      docType,
      fileName:    file.name,
      fileSize:    file.size,
      contentType,
    }),
  });

  if (!urlRes.ok) {
    let errMsg = 'Failed to prepare upload';
    try {
      const errBody = await urlRes.json();
      errMsg = errBody.message || errMsg;
    } catch { /* ignore parse error */ }
    // Provide actionable messages for common server errors
    if (urlRes.status === 401) errMsg = 'Session expired — please sign in again.';
    if (urlRes.status === 403) errMsg = 'Return not found — please refresh and try again.';
    if (urlRes.status === 400 && errMsg.includes('contentType')) errMsg = 'File type not supported. Please upload a PDF, JPG, or PNG.';
    throw new Error(errMsg);
  }

  const { uploadUrl, key } = await urlRes.json();

  // Step 2: Upload directly to R2 via XHR (for progress events)
  await uploadToR2WithProgress(uploadUrl, file, contentType, onProgress);

  // Step 3: Register the upload in Supabase
  const regRes = await fetch('/api/register-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      returnId,
      docType,
      key,
      fileName:    file.name,
      fileSizeKb:  Math.round(file.size / 1024),
    }),
  });

  if (!regRes.ok) {
    const err = await regRes.json().catch(() => ({}));
    throw new Error(err.message || 'Upload succeeded but registration failed');
  }

  const { document } = await regRes.json();
  return document;
}

// ─── XHR upload to R2 presigned URL (with progress) ──────────────────────────

function uploadToR2WithProgress(presignedUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(file);
  });
}

// ─── Get a temporary view URL for a document ─────────────────────────────────

export async function getDocumentUrl(documentId) {
  const token = await getAuthToken();

  const res = await fetch('/api/doc-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ documentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Could not fetch document URL');
  }

  const { url } = await res.json();
  return url;
}

// ─── Allowed file types ───────────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

export function validateFile(file) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Only PDF, JPG, and PNG files are allowed';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'File must be under 10MB';
  }
  return null; // valid
}
