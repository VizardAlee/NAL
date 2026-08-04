'use client';

import type { FirebaseApp } from 'firebase/app';
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45_000;

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadAuthenticatedFile(
  app: FirebaseApp,
  file: File,
  pathSegments: string[],
  acceptedTypes: string[],
  includeDownloadUrl = true
) {
  if (!acceptedTypes.includes(file.type)) throw new Error('Unsupported file type.');
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('File must be between 1 byte and 5 MB.');

  const filename = `${crypto.randomUUID()}-${safeSegment(file.name)}`;
  const fullPath = [...pathSegments.map(safeSegment), filename].join('/');
  const storageRef = ref(getStorage(app), fullPath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: { originalName: file.name },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      uploadTask.cancel();
      reject(new Error('The upload timed out. Check your connection and try again.'));
    }, UPLOAD_TIMEOUT_MS);
    uploadTask.on(
      'state_changed',
      undefined,
      (error) => { window.clearTimeout(timeout); reject(error); },
      () => { window.clearTimeout(timeout); resolve(); }
    );
  });
  return { url: includeDownloadUrl ? await getDownloadURL(storageRef) : '', fullPath };
}
