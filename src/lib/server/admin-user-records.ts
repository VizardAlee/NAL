import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { isValidBvn, isValidGovernmentIdNumber, isValidNigerianAccountNumber, isValidTin, normalizeGovernmentIdNumber } from '@/lib/kyc';
import { hasPersona } from '@/lib/access-control';
import { historicalDocumentType } from './historical-document-upload';

export const userRecordId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const text = z.string().trim().max(200).default('');
export const adminUserRecordSchema = z.object({
  userId: userRecordId, reason: z.string().trim().min(5, 'Explain the reason for this update.').max(500),
  name: z.string().trim().min(2).max(120), phoneNumber: z.string().trim().max(30).default(''), address: z.string().trim().max(500).default(''),
  bankName: text, bankAccountName: text, bankAccountNumber: z.string().trim().refine(value => !value || isValidNigerianAccountNumber(value), 'Account number must have 10 digits.').default(''),
  organizationRegistrationNumber: text, representativeName: text, representativeTitle: text,
  representativePhoneNumber: z.string().trim().max(30).default(''),
  governmentIdType: z.enum(['', 'NIN', 'NIGERIAN_PASSPORT', 'DRIVERS_LICENCE', 'VOTERS_CARD']).default(''),
  governmentIdNumber: z.string().trim().max(25).default(''),
  bvn: z.string().trim().refine(value => !value || isValidBvn(value), 'BVN must have 11 digits.').default(''),
  tin: z.string().trim().refine(value => !value || isValidTin(value), 'TIN must have 8 to 14 digits.').default(''),
  status: z.enum(['NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED']).default('SUBMITTED'),
  revision: z.number().int().nonnegative().default(0),
}).strict().superRefine((value, ctx) => {
  if (value.governmentIdNumber && !isValidGovernmentIdNumber(value.governmentIdType, value.governmentIdNumber)) ctx.addIssue({ code: 'custom', path: ['governmentIdNumber'], message: 'Enter a valid ID number for the selected ID type.' });
});
export type AdminUserRecordInput = z.infer<typeof adminUserRecordSchema>;

export async function saveAdminUserRecord(db: Firestore, actorId: string, input: unknown) {
  const data = adminUserRecordSchema.parse(input);
  const userRef = db.collection('users').doc(data.userId);
  const kycRef = db.collection('userKycProfiles').doc(data.userId);
  return db.runTransaction(async transaction => {
    const [user, kyc] = await Promise.all([transaction.get(userRef), transaction.get(kycRef)]);
    if (!user.exists) throw new Error('User not found.');
    const profile = user.data()!; const previous = kyc.data() || {};
    if (data.revision !== (previous.revision || 0)) throw new Error('Another update changed this record. Close and reopen the editor before saving.');
    const privateValues = {
      governmentIdType: data.governmentIdType,
      governmentIdNumber: normalizeGovernmentIdNumber(data.governmentIdNumber),
      bvn: data.bvn.replace(/\D/g, ''), tin: data.tin.replace(/\D/g, ''),
      bankName: data.bankName, bankAccountName: data.bankAccountName, bankAccountNumber: data.bankAccountNumber.replace(/\D/g, ''),
    };
    const publicValues = {
      name: data.name, phoneNumber: data.phoneNumber, address: data.address,
      bankName: privateValues.bankName, bankAccountName: privateValues.bankAccountName, bankAccountNumber: privateValues.bankAccountNumber,
      ...(profile.accountType === 'Organization' ? { organizationName: data.name, organizationAddress: data.address,
        organizationRegistrationNumber: data.organizationRegistrationNumber, representativeName: data.representativeName,
        representativeTitle: data.representativeTitle, representativePhoneNumber: data.representativePhoneNumber } : {}),
    };
    const changedFields = Object.entries({ ...publicValues, ...privateValues }).filter(([key, value]) => value !== (key in privateValues ? previous[key] ?? profile[key] ?? '' : profile[key] ?? '')).map(([key]) => key);
    const sensitiveChanged = changedFields.some(key => ['governmentIdType', 'governmentIdNumber', 'bvn', 'tin', 'bankName', 'bankAccountName', 'bankAccountNumber', 'name', 'representativeName', 'organizationRegistrationNumber'].includes(key));
    const previousStatus = previous.status || profile.kycStatus || 'NOT_SUBMITTED';
    const status = sensitiveChanged && previousStatus === 'VERIFIED' ? 'SUBMITTED' : data.status;
    if (status !== previousStatus) changedFields.push('status');
    if (status === 'VERIFIED') {
      if (!privateValues.governmentIdType || !privateValues.governmentIdNumber || !privateValues.bvn || !privateValues.bankName || !privateValues.bankAccountName || !privateValues.bankAccountNumber || (hasPersona(profile, 'INVESTOR') && !privateValues.tin)) throw new Error('Complete government ID, BVN and payment account details before verification. Investors also need a TIN.');
    }
    const eventRef = kycRef.collection('history').doc();
    transaction.set(eventRef, { actorId, reason: data.reason, changedFields, previousKyc: previous, previousProfile: Object.fromEntries(Object.keys(publicValues).map(key => [key, profile[key] ?? ''])), createdAt: FieldValue.serverTimestamp() });
    transaction.set(kycRef, { ...privateValues, userId: data.userId, accountType: profile.accountType || 'Individual', revision: data.revision + 1, status, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp(), ...(status === 'VERIFIED' ? { verifiedBy: actorId, verifiedAt: FieldValue.serverTimestamp() } : { verifiedBy: null, verifiedAt: null }) }, { merge: true });
    transaction.update(userRef, { ...publicValues, governmentIdType: privateValues.governmentIdType, governmentIdLast4: privateValues.governmentIdNumber.slice(-4), bvnLast4: privateValues.bvn.slice(-4), tinLast4: privateValues.tin.slice(-4), kycStatus: status, updatedAt: FieldValue.serverTimestamp() });
    return { status, verificationReset: sensitiveChanged && previousStatus === 'VERIFIED' };
  });
}

export const adminUploadKinds = ['PROFILE_PHOTO', 'GOVERNMENT_ID', 'KYC_SUPPORTING'] as const;
export const adminUserUploadSchema = z.object({ userId: userRecordId, kind: z.enum(adminUploadKinds), reason: z.string().trim().min(5).max(500), replaceDocumentId: z.string().uuid().optional() });
type Bucket = { name: string; file(path: string): { save(bytes: Buffer, options: any): Promise<unknown>; delete(): Promise<unknown> } };

export async function storeAdminUserUpload(db: Firestore, bucket: Bucket, actorId: string, input: unknown, bytes: Buffer, originalName: string) {
  const data = adminUserUploadSchema.parse(input);
  const contentType = historicalDocumentType(bytes);
  if (data.kind === 'PROFILE_PHOTO' && (!['image/jpeg', 'image/png'].includes(contentType) || bytes.length > 2 * 1024 * 1024)) throw new Error('Profile photographs must be JPG or PNG, maximum 2 MB.');
  const id = randomUUID(); const token = randomUUID();
  const path = data.kind === 'PROFILE_PHOTO' ? `users/${data.userId}/profile/${id}` : `user-records/${data.userId}/${id}`;
  const file = bucket.file(path);
  const userRef = db.collection('users').doc(data.userId); const kycRef = db.collection('userKycProfiles').doc(data.userId);
  if (!(await userRef.get()).exists) throw new Error('User not found.');
  await file.save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'private, no-store', ...(data.kind === 'PROFILE_PHOTO' ? { metadata: { firebaseStorageDownloadTokens: token } } : {}) } });
  try {
    await db.runTransaction(async transaction => {
      const [user, kyc] = await Promise.all([transaction.get(userRef), transaction.get(kycRef)]);
      if (!user.exists) throw new Error('User no longer exists.');
      const previous = kyc.data() || {}; const documents: Array<Record<string, any>> = previous.documents || [];
      if (data.replaceDocumentId && !documents.some(document => document.id === data.replaceDocumentId && document.kind === data.kind)) throw new Error('The selected upload cannot be replaced. Reload the user profile.');
      if (!data.replaceDocumentId && documents.length >= 30) throw new Error('This user already has 30 documents. Replace an existing document instead.');
      const document = { id, kind: data.kind, storagePath: path, originalName: originalName.slice(0, 180), contentType, size: bytes.length, uploadedBy: actorId, uploadedAt: new Date().toISOString() };
      transaction.set(kycRef.collection('history').doc(), { actorId, reason: data.reason, changedFields: [data.kind], previousDocuments: documents, previousPhotoURL: user.data()?.photoURL || '', createdAt: FieldValue.serverTimestamp() });
      transaction.set(kycRef, { userId: data.userId, revision: (previous.revision || 0) + 1, documents: [...documents.filter(document => document.id !== data.replaceDocumentId), document], ...(data.kind !== 'PROFILE_PHOTO' ? { status: 'SUBMITTED', verifiedBy: null, verifiedAt: null } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId }, { merge: true });
      transaction.update(userRef, data.kind === 'PROFILE_PHOTO' ? { photoStoragePath: path, photoURL: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`, updatedAt: FieldValue.serverTimestamp() } : { kycStatus: 'SUBMITTED', updatedAt: FieldValue.serverTimestamp() });
    });
    return { documentId: id };
  } catch (error) { await file.delete().catch(() => undefined); throw error; }
}
