'use client';

import type { FirebaseApp } from 'firebase/app';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadAuthenticatedFile(
  app: FirebaseApp,
  file: File,
  pathSegments: string[],
  acceptedTypes: string[]
) {
  if (!acceptedTypes.includes(file.type)) throw new Error('Unsupported file type.');
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('File must be between 1 byte and 5 MB.');

  const filename = `${crypto.randomUUID()}-${safeSegment(file.name)}`;
  const fullPath = [...pathSegments.map(safeSegment), filename].join('/');
  const storageRef = ref(getStorage(app), fullPath);
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { originalName: file.name },
  });
  return { url: await getDownloadURL(storageRef), fullPath };
}
