'use server';

import { z } from 'zod';
import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { adminUserRecordSchema, saveAdminUserRecord, userRecordId } from '@/lib/server/admin-user-records';

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return error instanceof Error && !('code' in error) ? error.message : 'The user record could not be updated. Check your permissions and try again.';
}

export async function getAdminUserRecordAction(authToken: string, userId: string) {
  try {
    await verifyAdminWrite(authToken); userRecordId.parse(userId);
    const [user, kyc] = await Promise.all([adminDb.collection('users').doc(userId).get(), adminDb.collection('userKycProfiles').doc(userId).get()]);
    if (!user.exists) throw new Error('User not found.');
    const profile = user.data()!; const record = kyc.data() || {};
    const keys = Object.keys(adminUserRecordSchema.innerType().shape).filter(key => !['reason', 'userId', 'status'].includes(key));
    const values = Object.fromEntries(keys.map(key => [key, key === 'revision' ? record.revision || 0 : record[key] ?? profile[key] ?? '']));
    return { success: true as const, values: { ...values, userId, reason: '', status: record.status || profile.kycStatus || 'NOT_SUBMITTED' }, documents: (record.documents || []).map((document: any) => ({ id: document.id, kind: document.kind, originalName: document.originalName, uploadedAt: document.uploadedAt })) as Array<{id: string; kind: string; originalName: string; uploadedAt: string}> };
  } catch (error) { return { success: false as const, message: message(error) }; }
}

export async function saveAdminUserRecordAction(authToken: string, input: unknown) {
  try { const actor = await verifyAdminWrite(authToken); const result = await saveAdminUserRecord(adminDb, actor.uid, input); return { success: true as const, ...result }; }
  catch (error) { return { success: false as const, message: message(error) }; }
}

export async function previewAdminUserUploadAction(authToken: string, userId: string, documentId: string) {
  try {
    await verifyAdminWrite(authToken); userRecordId.parse(userId); z.string().uuid().parse(documentId);
    const kyc = await adminDb.collection('userKycProfiles').doc(userId).get();
    const document = (kyc.data()?.documents || []).find((item: any) => item.id === documentId);
    if (!document) throw new Error('Document not found.');
    if (!document.storagePath.startsWith(`user-records/${userId}/`) && !document.storagePath.startsWith(`users/${userId}/profile/`)) throw new Error('Invalid document path.');
    const [url] = await adminStorageBucket.file(document.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000, responseDisposition: 'attachment' });
    return { success: true as const, url };
  } catch (error) { return { success: false as const, message: message(error) }; }
}
