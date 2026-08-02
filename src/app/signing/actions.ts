'use server';

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAdminOrOwner, verifyAuthToken } from '@/lib/server/auth';
import { normalizeAccessModel } from '@/lib/access-control';
import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';
import { loadInvestorAgreementAction } from '@/app/investor/agreements/actions';
import {
  loadClientAgreementAction,
  loadClientKafaalahBondAction,
} from '@/app/client/agreements/actions';
import {
  REQUIRED_SIGNER_ROLES,
  agreementEnvelopeId,
  agreementSignerRoleLabel,
  calculateSigningStatus,
  isCompanySignerRole,
  isWitnessSignerRole,
  type AgreementDocumentModel,
  type AgreementSignature,
  type AgreementSignerRole,
  type AgreementSigningState,
  type AgreementSigningType,
  type ExternalSignerRole,
  type SigningInviteSummary,
} from '@/lib/agreements/signing';
import { buildKafaalahBondPdf } from '@/lib/agreements/kafaalah-pdf';
import { buildMudarabaAgreementPdf } from '@/lib/agreements/mudaraba-pdf';
import { buildWakalahAgreementPdf } from '@/lib/agreements/wakalah-pdf';

const SIGNATURE_CONSENT_VERSION = 'NAL-ESIGN-CONSENT-1.0';
const SIGNATURE_MAX_DATA_URL_LENGTH = 350_000;
const INVITE_LIFETIME_MS = 72 * 60 * 60 * 1000;
const RECENT_AUTH_SECONDS = 10 * 60;

const signingTypeSchema = z.enum(['MUDARABA', 'WAKALAH', 'KAFAALAH']);
const signerRoleSchema = z.enum([
  'INVESTOR', 'CLIENT', 'GUARANTOR', 'WITNESS', 'WITNESS_1', 'WITNESS_2',
  'NAL_SIGNATORY_1', 'NAL_SIGNATORY_2', 'NAL_AUTHORIZED_SIGNATORY',
]);
const agreementRequestSchema = z.object({
  authToken: z.string().min(1),
  agreementType: signingTypeSchema,
  sourceId: z.string().min(1).max(180),
});
const authenticatedSignatureSchema = agreementRequestSchema.extend({
  role: signerRoleSchema,
  signatureDataUrl: z.string().min(100).max(SIGNATURE_MAX_DATA_URL_LENGTH),
  consent: z.literal(true),
});
const inviteRequestSchema = agreementRequestSchema.extend({
  role: z.enum(['GUARANTOR', 'WITNESS', 'WITNESS_1', 'WITNESS_2']),
});
const externalTokenSchema = z.object({ token: z.string().min(40).max(200) });
const externalSignatureSchema = externalTokenSchema.extend({
  pin: z.string().regex(/^\d{6}$/),
  signerName: z.string().trim().min(3).max(120),
  signerPhoneNumber: z.string().trim().min(7).max(30),
  signerAddress: z.string().trim().max(250).optional(),
  signatureDataUrl: z.string().min(100).max(SIGNATURE_MAX_DATA_URL_LENGTH),
  consent: z.literal(true),
});

type StoredEnvelope = {
  agreementType: AgreementSigningType;
  sourceId: string;
  ownerUserId: string;
  agreementReference: string;
  documentVersion: string;
  documentHash: string;
  finalDocumentHash?: string;
  finalPdfArchive?: {
    status: 'ARCHIVED' | 'FAILED';
    storagePath?: string;
    fileHash?: string;
    fileSize?: number;
    archivedAt?: Timestamp;
    failureMessage?: string;
  };
  documentModel: AgreementDocumentModel;
  requiredRoles: AgreementSignerRole[];
  signedRoles: AgreementSignerRole[];
  signatureHashes?: Partial<Record<AgreementSignerRole, string>>;
  signedByUserIds?: string[];
  status: AgreementSigningState['status'];
  inviteSummaries?: Partial<Record<ExternalSignerRole, SigningInviteSummary>>;
  inviteTokenHashes?: Partial<Record<ExternalSignerRole, string>>;
  startedAt: Timestamp;
  updatedAt: Timestamp;
  executedAt?: Timestamp;
};

type StoredInvite = {
  envelopeId: string;
  role: ExternalSignerRole;
  pinHash: string;
  expectedSignerName?: string;
  expiresAt: Timestamp;
  consumedAt?: Timestamp;
  failedAttempts?: number;
  lockedAt?: Timestamp;
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

function documentHash(model: AgreementDocumentModel): string {
  return sha256(JSON.stringify(stableValue(model)));
}

function validateSignatureDataUrl(value: string): Buffer {
  if (!value.startsWith('data:image/png;base64,')) throw new Error('The signature must be a PNG image.');
  const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length < 100 || bytes.length > 250_000) throw new Error('The signature image is invalid or too large.');
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('The signature image is invalid.');
  }
  return bytes;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NG');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function toIso(value?: Timestamp): string | undefined {
  return value?.toDate().toISOString();
}

function getAgreementReference(model: AgreementDocumentModel): string {
  return 'bondId' in model ? model.bondId : model.agreementId;
}

function getOwnerUserId(model: AgreementDocumentModel): string {
  if ('investor' in model) return model.investor.id;
  return model.client.id;
}

function getAgreementLink(type: AgreementSigningType, sourceId: string): string {
  if (type === 'MUDARABA') return `/investor/agreements/${sourceId}`;
  if (type === 'WAKALAH') return `/client/agreements/${sourceId}`;
  return `/client/agreements/kafaalah/${sourceId}`;
}

async function requestMetadata() {
  const requestHeaders = await headers();
  return {
    ipAddress: (requestHeaders.get('x-forwarded-for') || requestHeaders.get('x-real-ip') || 'unavailable').split(',')[0].trim(),
    userAgent: requestHeaders.get('user-agent') || 'unavailable',
  };
}

async function loadTrustedModel(
  authToken: string,
  agreementType: AgreementSigningType,
  sourceId: string
): Promise<AgreementDocumentModel> {
  if (agreementType === 'MUDARABA') {
    const result = await loadInvestorAgreementAction({ authToken, batchId: sourceId });
    if (!result.success) throw new Error(result.message);
    return result.agreement;
  }
  if (agreementType === 'WAKALAH') {
    const result = await loadClientAgreementAction({ authToken, dealId: sourceId });
    if (!result.success) throw new Error(result.message);
    return result.agreement;
  }
  const result = await loadClientKafaalahBondAction({ authToken, dealId: sourceId });
  if (!result.success) throw new Error(result.message);
  return result.bond;
}

async function loadSignatures(envelopeId: string): Promise<AgreementSignature[]> {
  const snapshot = await adminDb.collection('agreementEnvelopes').doc(envelopeId).collection('signatures').get();
  return snapshot.docs.map((document) => document.data() as AgreementSignature);
}

async function serializeEnvelope(
  envelopeId: string,
  envelope: StoredEnvelope,
  includeSignatureImages = true
): Promise<AgreementSigningState> {
  const storedSignatures = await loadSignatures(envelopeId);
  const signatures = Object.fromEntries(storedSignatures.map((signature) => [
    signature.role,
    includeSignatureImages ? signature : { ...signature, signatureDataUrl: '' },
  ])) as AgreementSigningState['signatures'];
  return {
    envelopeId,
    agreementType: envelope.agreementType,
    sourceId: envelope.sourceId,
    agreementReference: envelope.agreementReference,
    documentVersion: envelope.documentVersion,
    documentHash: envelope.documentHash,
    ...(envelope.finalDocumentHash ? { finalDocumentHash: envelope.finalDocumentHash } : {}),
    ...(envelope.finalPdfArchive ? {
      finalPdfArchive: {
        status: envelope.finalPdfArchive.status,
        ...(envelope.finalPdfArchive.fileHash ? { fileHash: envelope.finalPdfArchive.fileHash } : {}),
        ...(envelope.finalPdfArchive.fileSize ? { fileSize: envelope.finalPdfArchive.fileSize } : {}),
        ...(envelope.finalPdfArchive.archivedAt ? { archivedAt: toIso(envelope.finalPdfArchive.archivedAt) } : {}),
      },
    } : {}),
    status: envelope.status,
    requiredRoles: envelope.requiredRoles,
    signedRoles: envelope.signedRoles || [],
    signatures,
    invites: Object.values(envelope.inviteSummaries || {}).filter(Boolean) as SigningInviteSummary[],
    startedAt: toIso(envelope.startedAt) || new Date().toISOString(),
    ...(envelope.executedAt ? { executedAt: toIso(envelope.executedAt) } : {}),
  };
}

async function authorizeEnvelopeRead(authToken: string, envelope: StoredEnvelope) {
  const decoded = await verifyAuthToken(authToken);
  if (decoded.uid === envelope.ownerUserId) return decoded;
  const profile = (await adminDb.collection('users').doc(decoded.uid).get()).data() || {};
  const access = normalizeAccessModel(profile);
  if (!['ADMIN', 'OWNER'].includes(access.accessRole)) throw new Error('You are not allowed to view this signing record.');
  return decoded;
}

function ensureRecentAuthentication(authTime?: number) {
  if (!authTime || Math.floor(Date.now() / 1000) - authTime > RECENT_AUTH_SECONDS) {
    throw new Error('Please re-enter your password before signing this agreement.');
  }
}

function finalHash(documentDigest: string, signatureHashes: Partial<Record<AgreementSignerRole, string>>): string {
  const ordered = Object.entries(signatureHashes).sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify({ documentHash: documentDigest, signatures: ordered }));
}

async function buildExecutedPdf(envelope: StoredEnvelope, state: AgreementSigningState): Promise<Uint8Array> {
  if (envelope.agreementType === 'MUDARABA') {
    return buildMudarabaAgreementPdf(envelope.documentModel as never, state);
  }
  if (envelope.agreementType === 'WAKALAH') {
    return buildWakalahAgreementPdf(envelope.documentModel as never, state);
  }
  return buildKafaalahBondPdf(envelope.documentModel as never, state);
}

async function ensureExecutedAgreementArchive(envelopeId: string, envelope: StoredEnvelope) {
  if (envelope.status !== 'EXECUTED' || !envelope.finalDocumentHash) {
    throw new Error('Only a fully executed agreement can be archived.');
  }
  if (envelope.finalPdfArchive?.status === 'ARCHIVED' && envelope.finalPdfArchive.storagePath) {
    return envelope.finalPdfArchive;
  }

  const state = await serializeEnvelope(envelopeId, envelope);
  const pdfBytes = await buildExecutedPdf(envelope, state);
  const fileBuffer = Buffer.from(pdfBytes);
  const fileHash = sha256(fileBuffer);
  const storagePath = `agreement-archives/${envelopeId}/${envelope.finalDocumentHash}.pdf`;
  const archivedAt = Timestamp.now();
  await adminStorageBucket.file(storagePath).save(fileBuffer, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      contentDisposition: `attachment; filename="${envelope.agreementReference.replace(/[^a-zA-Z0-9._-]/g, '-')}-signed.pdf"`,
      metadata: {
        agreementEnvelopeId: envelopeId,
        executedEnvelopeHash: envelope.finalDocumentHash,
        archivedPdfHash: fileHash,
      },
    },
  });
  const archive = {
    status: 'ARCHIVED' as const,
    storagePath,
    fileHash,
    fileSize: fileBuffer.byteLength,
    archivedAt,
  };
  await adminDb.collection('agreementEnvelopes').doc(envelopeId).update({
    finalPdfArchive: archive,
    updatedAt: archivedAt,
  });
  return archive;
}

async function archiveAfterExecution(envelopeId: string, envelope: StoredEnvelope): Promise<StoredEnvelope> {
  if (envelope.status !== 'EXECUTED') return envelope;
  try {
    await ensureExecutedAgreementArchive(envelopeId, envelope);
  } catch (error) {
    console.error('Unable to archive the executed agreement PDF.', error);
    await adminDb.collection('agreementEnvelopes').doc(envelopeId).update({
      finalPdfArchive: {
        status: 'FAILED',
        failureMessage: error instanceof Error ? error.message.slice(0, 500) : 'Archive creation failed.',
      },
      updatedAt: Timestamp.now(),
    }).catch((updateError) => console.error('Unable to record agreement archive failure.', updateError));
  }
  const refreshed = await adminDb.collection('agreementEnvelopes').doc(envelopeId).get();
  return refreshed.data() as StoredEnvelope;
}

async function upgradePendingMudarabaWitnesses(
  envelopeId: string,
  envelope: StoredEnvelope
): Promise<StoredEnvelope> {
  const requiredRoles = REQUIRED_SIGNER_ROLES.MUDARABA;
  if (
    envelope.agreementType !== 'MUDARABA' ||
    envelope.status === 'EXECUTED' ||
    requiredRoles.every((role) => envelope.requiredRoles.includes(role))
  ) return envelope;

  const reference = adminDb.collection('agreementEnvelopes').doc(envelopeId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const current = snapshot.data() as StoredEnvelope;
    if (current.status === 'EXECUTED' || current.agreementType !== 'MUDARABA') return;
    const status = calculateSigningStatus(requiredRoles, current.signedRoles || []);
    const now = Timestamp.now();
    transaction.update(reference, { requiredRoles, status, updatedAt: now });
    transaction.create(reference.collection('events').doc(), {
      event: 'SIGNING_REQUIREMENTS_UPDATED',
      addedRoles: requiredRoles.filter((role) => !current.requiredRoles.includes(role)),
      reason: 'Investor agreement witness execution requirement introduced.',
      createdAt: now,
    });
  });
  const refreshed = await reference.get();
  return refreshed.data() as StoredEnvelope;
}

export async function startAgreementSigningAction(input: {
  authToken: string;
  agreementType: AgreementSigningType;
  sourceId: string;
}): Promise<{ success: true; state: AgreementSigningState } | { success: false; message: string }> {
  const validated = agreementRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid signing request.' };
  try {
    const model = await loadTrustedModel(validated.data.authToken, validated.data.agreementType, validated.data.sourceId);
    if (model.missingFields.length) throw new Error(`Complete these agreement details first: ${model.missingFields.join(', ')}.`);
    const envelopeId = agreementEnvelopeId(validated.data.agreementType, validated.data.sourceId);
    const reference = adminDb.collection('agreementEnvelopes').doc(envelopeId);
    const metadata = await requestMetadata();
    await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists) return;
      const now = Timestamp.now();
      const requiredRoles = REQUIRED_SIGNER_ROLES[validated.data.agreementType];
      const envelope: StoredEnvelope = {
        agreementType: validated.data.agreementType,
        sourceId: validated.data.sourceId,
        ownerUserId: getOwnerUserId(model),
        agreementReference: getAgreementReference(model),
        documentVersion: model.version,
        documentHash: documentHash(model),
        documentModel: model,
        requiredRoles,
        signedRoles: [],
        signatureHashes: {},
        signedByUserIds: [],
        status: 'AWAITING_SIGNATURES',
        startedAt: now,
        updatedAt: now,
      };
      transaction.create(reference, envelope);
      transaction.create(reference.collection('events').doc(), {
        event: 'SIGNING_STARTED', actorUserId: envelope.ownerUserId,
        consentVersion: SIGNATURE_CONSENT_VERSION, ...metadata, createdAt: now,
      });
    });
    const snapshot = await reference.get();
    const envelope = await upgradePendingMudarabaWitnesses(envelopeId, snapshot.data() as StoredEnvelope);
    await notifyUser(
      envelope.ownerUserId,
      'Agreement ready for signatures',
      `${envelope.agreementReference} has entered the signing process.`,
      getAgreementLink(envelope.agreementType, envelope.sourceId),
      'system'
    ).catch((error) => console.error('Unable to send signing notification.', error));
    return { success: true, state: await serializeEnvelope(envelopeId, envelope) };
  } catch (error) {
    console.error('Unable to start agreement signing.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to start signing.' };
  }
}

export async function getAgreementSigningStateAction(input: {
  authToken: string;
  agreementType: AgreementSigningType;
  sourceId: string;
}): Promise<
  | { success: true; exists: false }
  | { success: true; exists: true; state: AgreementSigningState; documentModel: AgreementDocumentModel }
  | { success: false; message: string }
> {
  const validated = agreementRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid signing request.' };
  try {
    const envelopeId = agreementEnvelopeId(validated.data.agreementType, validated.data.sourceId);
    const snapshot = await adminDb.collection('agreementEnvelopes').doc(envelopeId).get();
    if (!snapshot.exists) return { success: true, exists: false };
    let envelope = snapshot.data() as StoredEnvelope;
    await authorizeEnvelopeRead(validated.data.authToken, envelope);
    envelope = await upgradePendingMudarabaWitnesses(envelopeId, envelope);
    return {
      success: true,
      exists: true,
      state: await serializeEnvelope(envelopeId, envelope),
      documentModel: envelope.documentModel,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to load signing status.' };
  }
}

export async function submitAuthenticatedSignatureAction(input: {
  authToken: string;
  agreementType: AgreementSigningType;
  sourceId: string;
  role: AgreementSignerRole;
  signatureDataUrl: string;
  consent: true;
}): Promise<{ success: true; state: AgreementSigningState } | { success: false; message: string }> {
  const validated = authenticatedSignatureSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid signature submission.' };
  try {
    const signatureBytes = validateSignatureDataUrl(validated.data.signatureDataUrl);
    const decoded = await verifyAuthToken(validated.data.authToken);
    ensureRecentAuthentication(decoded.auth_time);
    const envelopeId = agreementEnvelopeId(validated.data.agreementType, validated.data.sourceId);
    const envelopeReference = adminDb.collection('agreementEnvelopes').doc(envelopeId);
    const profileSnapshot = await adminDb.collection('users').doc(decoded.uid).get();
    const profile = profileSnapshot.data() || {};
    const signerName = String(profile.name || decoded.name || decoded.email || '').trim();
    if (!signerName) throw new Error('Your verified profile name is required before signing.');
    const access = normalizeAccessModel(profile);
    const metadata = await requestMetadata();
    const now = Timestamp.now();
    const signatureDigest = sha256(signatureBytes);

    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(envelopeReference);
      if (!snapshot.exists) throw new Error('Start the signing process before adding signatures.');
      const envelope = snapshot.data() as StoredEnvelope;
      if (envelope.agreementType !== validated.data.agreementType || envelope.sourceId !== validated.data.sourceId) {
        throw new Error('The signing request does not match this agreement.');
      }
      if (envelope.status === 'EXECUTED') throw new Error('This agreement is already fully executed.');
      if (!envelope.requiredRoles.includes(validated.data.role)) throw new Error('This signature role is not required.');
      if ((envelope.signedRoles || []).includes(validated.data.role)) throw new Error('This signature has already been completed.');

      const isCompanyRole = isCompanySignerRole(validated.data.role);
      if (isCompanyRole) {
        if (!['ADMIN', 'OWNER'].includes(access.accessRole)) throw new Error('Only an authorised NAL account can sign for the company.');
        const partyRoles = envelope.requiredRoles.filter((role) => !isCompanySignerRole(role));
        if (!partyRoles.every((role) => envelope.signedRoles.includes(role))) {
          throw new Error('All external parties must sign before NAL executes this agreement.');
        }
        if ((envelope.signedByUserIds || []).includes(decoded.uid)) {
          throw new Error('A second authorised NAL account must provide the remaining company signature.');
        }
      } else {
        const allowedOwnerRole = envelope.agreementType === 'MUDARABA' ? 'INVESTOR' : 'CLIENT';
        if (decoded.uid !== envelope.ownerUserId || validated.data.role !== allowedOwnerRole) {
          throw new Error('You are not the required signer for this signature.');
        }
      }

      const signedRoles = [...(envelope.signedRoles || []), validated.data.role];
      const signatureHashes = { ...(envelope.signatureHashes || {}), [validated.data.role]: signatureDigest };
      const status = calculateSigningStatus(envelope.requiredRoles, signedRoles);
      const signature: AgreementSignature = {
        role: validated.data.role,
        signerName,
        signerUserId: decoded.uid,
        ...(profile.phoneNumber ? { signerPhoneNumber: String(profile.phoneNumber) } : {}),
        signatureDataUrl: validated.data.signatureDataUrl,
        signedAt: now.toDate().toISOString(),
        signatureHash: signatureDigest,
        authenticationMethod: 'firebase-reauthentication',
      };
      transaction.create(envelopeReference.collection('signatures').doc(validated.data.role), signature);
      transaction.create(envelopeReference.collection('events').doc(), {
        event: 'SIGNATURE_APPLIED', role: validated.data.role, actorUserId: decoded.uid,
        signerName, signatureHash: signatureDigest, documentHash: envelope.documentHash,
        consentVersion: SIGNATURE_CONSENT_VERSION, ...metadata, createdAt: now,
      });
      transaction.update(envelopeReference, {
        signedRoles,
        signatureHashes,
        signedByUserIds: isCompanyRole ? FieldValue.arrayUnion(decoded.uid) : envelope.signedByUserIds || [],
        status,
        updatedAt: now,
        ...(status === 'EXECUTED' ? {
          executedAt: now,
          finalDocumentHash: finalHash(envelope.documentHash, signatureHashes),
        } : {}),
      });
    });

    const updatedSnapshot = await envelopeReference.get();
    const updated = await archiveAfterExecution(envelopeId, updatedSnapshot.data() as StoredEnvelope);
    if (isCompanySignerRole(validated.data.role)) {
      await notifyUser(
        updated.ownerUserId,
        updated.status === 'EXECUTED' ? 'Agreement fully executed' : 'NAL signature added',
        updated.status === 'EXECUTED'
          ? `${updated.agreementReference} is complete and ready to download.`
          : `An authorised NAL signatory signed ${updated.agreementReference}.`,
        getAgreementLink(updated.agreementType, updated.sourceId),
        'system'
      ).catch((error) => console.error('Unable to notify agreement owner.', error));
    } else if (updated.status === 'AWAITING_COMPANY') {
      await notifyAdmins(
        'Agreement awaiting NAL signature',
        `${updated.agreementReference} has all required party signatures.`,
        '/admin/agreements',
        'approval'
      ).catch((error) => console.error('Unable to notify administrators.', error));
    }
    return { success: true, state: await serializeEnvelope(envelopeId, updated) };
  } catch (error) {
    console.error('Unable to apply authenticated signature.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to apply signature.' };
  }
}

export async function createExternalSigningInviteAction(input: {
  authToken: string;
  agreementType: AgreementSigningType;
  sourceId: string;
  role: ExternalSignerRole;
}): Promise<
  | { success: true; signingUrl: string; pin: string; expiresAt: string; state: AgreementSigningState }
  | { success: false; message: string }
> {
  const validated = inviteRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid external signing request.' };
  try {
    const envelopeId = agreementEnvelopeId(validated.data.agreementType, validated.data.sourceId);
    const envelopeReference = adminDb.collection('agreementEnvelopes').doc(envelopeId);
    const envelopeSnapshot = await envelopeReference.get();
    if (!envelopeSnapshot.exists) throw new Error('Start the signing process first.');
    let envelope = envelopeSnapshot.data() as StoredEnvelope;
    const decoded = await authorizeEnvelopeRead(validated.data.authToken, envelope);
    envelope = await upgradePendingMudarabaWitnesses(envelopeId, envelope);
    if (decoded.uid !== envelope.ownerUserId) await verifyAdminOrOwner(validated.data.authToken);
    if (!envelope.requiredRoles.includes(validated.data.role)) throw new Error('This external signature is not required.');
    if (envelope.signedRoles.includes(validated.data.role)) throw new Error('This signer has already completed the agreement.');

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const pin = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_LIFETIME_MS);
    const previousTokenHash = envelope.inviteTokenHashes?.[validated.data.role];
    const expectedSignerName = validated.data.role === 'GUARANTOR' && 'guarantor' in envelope.documentModel
      ? envelope.documentModel.guarantor.name
      : undefined;
    const invite: StoredInvite = {
      envelopeId,
      role: validated.data.role,
      pinHash: sha256(`${tokenHash}:${pin}`),
      ...(expectedSignerName ? { expectedSignerName } : {}),
      expiresAt,
    };
    const summary: SigningInviteSummary = {
      role: validated.data.role,
      status: 'ACTIVE',
      expiresAt: expiresAt.toDate().toISOString(),
    };
    const batch = adminDb.batch();
    if (previousTokenHash) batch.delete(adminDb.collection('agreementSigningInvites').doc(previousTokenHash));
    batch.set(adminDb.collection('agreementSigningInvites').doc(tokenHash), invite);
    batch.update(envelopeReference, {
      [`inviteSummaries.${validated.data.role}`]: summary,
      [`inviteTokenHashes.${validated.data.role}`]: tokenHash,
      updatedAt: Timestamp.now(),
    });
    batch.set(envelopeReference.collection('events').doc(), {
      event: 'EXTERNAL_INVITE_CREATED', role: validated.data.role,
      actorUserId: decoded.uid, expiresAt, ...(await requestMetadata()), createdAt: Timestamp.now(),
    });
    await batch.commit();
    const requestHeaders = await headers();
    const origin = requestHeaders.get('origin') || `${requestHeaders.get('x-forwarded-proto') || 'https'}://${requestHeaders.get('host') || 'nalgm.com'}`;
    const refreshed = (await envelopeReference.get()).data() as StoredEnvelope;
    return {
      success: true,
      signingUrl: `${origin}/sign/${token}`,
      pin,
      expiresAt: expiresAt.toDate().toISOString(),
      state: await serializeEnvelope(envelopeId, refreshed),
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to create the signing link.' };
  }
}

async function loadValidInvite(token: string) {
  const tokenHash = sha256(token);
  const inviteReference = adminDb.collection('agreementSigningInvites').doc(tokenHash);
  const inviteSnapshot = await inviteReference.get();
  if (!inviteSnapshot.exists) throw new Error('This signing link is invalid or has been revoked.');
  const invite = inviteSnapshot.data() as StoredInvite;
  if (invite.consumedAt) throw new Error('This signing link has already been used.');
  if (invite.lockedAt || (invite.failedAttempts || 0) >= 5) throw new Error('This signing link has been locked. Request a new link.');
  if (invite.expiresAt.toMillis() <= Date.now()) throw new Error('This signing link has expired. Request a new link.');
  const envelopeReference = adminDb.collection('agreementEnvelopes').doc(invite.envelopeId);
  const envelopeSnapshot = await envelopeReference.get();
  if (!envelopeSnapshot.exists) throw new Error('The agreement is no longer available.');
  return { tokenHash, inviteReference, invite, envelopeReference, envelope: envelopeSnapshot.data() as StoredEnvelope };
}

export async function loadExternalSigningAction(input: { token: string }): Promise<
  | {
      success: true;
      role: ExternalSignerRole;
      roleLabel: string;
      agreementReference: string;
      documentHash: string;
      documentModel: AgreementDocumentModel;
      state: AgreementSigningState;
      expiresAt: string;
      expectedSignerName?: string;
    }
  | { success: false; message: string }
> {
  const validated = externalTokenSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid signing link.' };
  try {
    const loaded = await loadValidInvite(validated.data.token);
    return {
      success: true,
      role: loaded.invite.role,
      roleLabel: agreementSignerRoleLabel(loaded.invite.role),
      agreementReference: loaded.envelope.agreementReference,
      documentHash: loaded.envelope.documentHash,
      documentModel: loaded.envelope.documentModel,
      state: await serializeEnvelope(loaded.invite.envelopeId, loaded.envelope),
      expiresAt: loaded.invite.expiresAt.toDate().toISOString(),
      ...(loaded.invite.expectedSignerName ? { expectedSignerName: loaded.invite.expectedSignerName } : {}),
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to open this signing request.' };
  }
}

export async function submitExternalSignatureAction(input: {
  token: string;
  pin: string;
  signerName: string;
  signerPhoneNumber: string;
  signerAddress?: string;
  signatureDataUrl: string;
  consent: true;
}): Promise<{ success: true; state: AgreementSigningState } | { success: false; message: string }> {
  const validated = externalSignatureSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Complete all signing and verification fields.' };
  try {
    const signatureBytes = validateSignatureDataUrl(validated.data.signatureDataUrl);
    const loaded = await loadValidInvite(validated.data.token);
    const suppliedPinHash = sha256(`${loaded.tokenHash}:${validated.data.pin}`);
    if (!safeEqual(suppliedPinHash, loaded.invite.pinHash)) {
      const failedAttempts = (loaded.invite.failedAttempts || 0) + 1;
      await loaded.inviteReference.update({
        failedAttempts,
        ...(failedAttempts >= 5 ? { lockedAt: Timestamp.now() } : {}),
      });
      throw new Error(failedAttempts >= 5
        ? 'This signing link has been locked after too many incorrect PIN attempts.'
        : `The six-digit signing PIN is incorrect. ${5 - failedAttempts} attempt(s) remaining.`);
    }
    if (loaded.invite.expectedSignerName && normalizeName(validated.data.signerName) !== normalizeName(loaded.invite.expectedSignerName)) {
      throw new Error('The signer name must match the guarantor named in the agreement.');
    }
    if (isWitnessSignerRole(loaded.invite.role) && (!validated.data.signerAddress || validated.data.signerAddress.length < 5)) {
      throw new Error('The witness residential address is required.');
    }
    const metadata = await requestMetadata();
    const now = Timestamp.now();
    const signatureDigest = sha256(signatureBytes);

    await adminDb.runTransaction(async (transaction) => {
      const [inviteSnapshot, envelopeSnapshot] = await Promise.all([
        transaction.get(loaded.inviteReference),
        transaction.get(loaded.envelopeReference),
      ]);
      if (!inviteSnapshot.exists || !envelopeSnapshot.exists) throw new Error('This signing request is no longer available.');
      const invite = inviteSnapshot.data() as StoredInvite;
      const envelope = envelopeSnapshot.data() as StoredEnvelope;
      if (invite.consumedAt || invite.expiresAt.toMillis() <= Date.now()) throw new Error('This signing link is no longer active.');
      if (envelope.signedRoles.includes(invite.role)) throw new Error('This signature has already been completed.');
      if (isWitnessSignerRole(invite.role)) {
        const priorRoles = envelope.requiredRoles.filter((role) => !isCompanySignerRole(role) && !isWitnessSignerRole(role));
        if (!priorRoles.every((role) => envelope.signedRoles.includes(role))) {
          throw new Error('The principal party must sign before the witness can attest the agreement.');
        }
      }
      const signedRoles = [...envelope.signedRoles, invite.role];
      const signatureHashes = { ...(envelope.signatureHashes || {}), [invite.role]: signatureDigest };
      const status = calculateSigningStatus(envelope.requiredRoles, signedRoles);
      const signature: AgreementSignature = {
        role: invite.role,
        signerName: validated.data.signerName.trim(),
        signerPhoneNumber: validated.data.signerPhoneNumber.trim(),
        ...(validated.data.signerAddress ? { signerAddress: validated.data.signerAddress.trim() } : {}),
        signatureDataUrl: validated.data.signatureDataUrl,
        signedAt: now.toDate().toISOString(),
        signatureHash: signatureDigest,
        authenticationMethod: 'secure-link-and-pin',
      };
      transaction.create(loaded.envelopeReference.collection('signatures').doc(invite.role), signature);
      transaction.create(loaded.envelopeReference.collection('events').doc(), {
        event: 'SIGNATURE_APPLIED', role: invite.role,
        signerName: signature.signerName, signerPhoneNumber: signature.signerPhoneNumber,
        signatureHash: signatureDigest, documentHash: envelope.documentHash,
        consentVersion: SIGNATURE_CONSENT_VERSION, ...metadata, createdAt: now,
      });
      transaction.update(loaded.inviteReference, { consumedAt: now });
      transaction.update(loaded.envelopeReference, {
        signedRoles,
        signatureHashes,
        status,
        [`inviteSummaries.${invite.role}.status`]: 'USED',
        updatedAt: now,
        ...(status === 'EXECUTED' ? {
          executedAt: now,
          finalDocumentHash: finalHash(envelope.documentHash, signatureHashes),
        } : {}),
      });
    });

    const updated = await archiveAfterExecution(
      loaded.invite.envelopeId,
      (await loaded.envelopeReference.get()).data() as StoredEnvelope
    );
    await notifyUser(
      updated.ownerUserId,
      `${agreementSignerRoleLabel(loaded.invite.role)} signature received`,
      `${validated.data.signerName.trim()} signed ${updated.agreementReference}.`,
      getAgreementLink(updated.agreementType, updated.sourceId),
      'system'
    ).catch((error) => console.error('Unable to notify agreement owner.', error));
    if (updated.status === 'AWAITING_COMPANY') {
      await notifyAdmins(
        'Agreement awaiting NAL signature',
        `${updated.agreementReference} has all required external signatures.`,
        '/admin/agreements',
        'approval'
      ).catch((error) => console.error('Unable to notify administrators.', error));
    }
    return { success: true, state: await serializeEnvelope(loaded.invite.envelopeId, updated) };
  } catch (error) {
    console.error('Unable to apply external signature.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to apply signature.' };
  }
}

export async function listAdminAgreementEnvelopesAction(input: { authToken: string }): Promise<
  | { success: true; envelopes: Array<AgreementSigningState & { documentModel: AgreementDocumentModel }> }
  | { success: false; message: string }
> {
  try {
    await verifyAdminOrOwner(input.authToken);
    const snapshot = await adminDb.collection('agreementEnvelopes').orderBy('startedAt', 'desc').limit(100).get();
    const envelopes = await Promise.all(snapshot.docs.map(async (document) => {
      const envelope = await upgradePendingMudarabaWitnesses(document.id, document.data() as StoredEnvelope);
      return { ...(await serializeEnvelope(document.id, envelope, false)), documentModel: envelope.documentModel };
    }));
    return { success: true, envelopes };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to load agreement signatures.' };
  }
}

export async function downloadExecutedAgreementArchiveAction(input: {
  authToken: string;
  agreementType: AgreementSigningType;
  sourceId: string;
}): Promise<
  | { success: true; fileName: string; pdfBase64: string; fileHash: string }
  | { success: false; message: string }
> {
  const validated = agreementRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid agreement download request.' };
  try {
    await verifyAdminOrOwner(validated.data.authToken);
    const envelopeId = agreementEnvelopeId(validated.data.agreementType, validated.data.sourceId);
    const reference = adminDb.collection('agreementEnvelopes').doc(envelopeId);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new Error('The signed agreement could not be found.');
    let envelope = snapshot.data() as StoredEnvelope;
    if (envelope.agreementType !== validated.data.agreementType || envelope.sourceId !== validated.data.sourceId) {
      throw new Error('The agreement reference does not match this signing envelope.');
    }
    if (envelope.status !== 'EXECUTED') throw new Error('This agreement has not been fully signed yet.');

    if (envelope.finalPdfArchive?.status !== 'ARCHIVED' || !envelope.finalPdfArchive.storagePath) {
      await ensureExecutedAgreementArchive(envelopeId, envelope);
      envelope = (await reference.get()).data() as StoredEnvelope;
    }
    const archive = envelope.finalPdfArchive;
    if (!archive?.storagePath || !archive.fileHash) throw new Error('The permanent signed copy is not available yet.');
    const [fileBuffer] = await adminStorageBucket.file(archive.storagePath).download();
    const actualHash = sha256(fileBuffer);
    if (!safeEqual(actualHash, archive.fileHash)) {
      throw new Error('The archived PDF failed its integrity check. Please contact the system administrator.');
    }
    return {
      success: true,
      fileName: `${envelope.agreementReference.replace(/[^a-zA-Z0-9._-]/g, '-')}-signed.pdf`,
      pdfBase64: fileBuffer.toString('base64'),
      fileHash: actualHash,
    };
  } catch (error) {
    console.error('Unable to download executed agreement archive.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to download the signed agreement.' };
  }
}
