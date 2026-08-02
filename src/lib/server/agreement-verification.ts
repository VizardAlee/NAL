import { createHash, timingSafeEqual } from 'node:crypto';
import type { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { agreementSignerRoleLabel, type AgreementDocumentModel, type AgreementSignerRole } from '@/lib/agreements/signing';

type PublicVerification = {
  genuine: true;
  agreementReference: string;
  agreementType: string;
  executedAt: string;
  primaryParty: string;
  secondaryParty?: string;
  amount: number;
  fingerprint: string;
  signatures: Array<{ role: string; signerName: string; signedAt: string; verificationReference: string }>;
};

type StoredVerificationEnvelope = {
  agreementReference: string;
  agreementType: string;
  documentHash: string;
  finalDocumentHash: string;
  documentModel: AgreementDocumentModel;
  requiredRoles: AgreementSignerRole[];
  signedRoles: AgreementSignerRole[];
  signatureHashes: Partial<Record<AgreementSignerRole, string>>;
  status: string;
  executedAt?: Timestamp;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function recomputeEnvelopeHash(envelope: StoredVerificationEnvelope): string {
  const signatures = Object.entries(envelope.signatureHashes || {}).sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify({ documentHash: envelope.documentHash, signatures }));
}

function publicParties(model: AgreementDocumentModel) {
  if ('investor' in model) return { primaryParty: model.investor.name, amount: model.amount };
  if ('guarantor' in model) return {
    primaryParty: model.client.name,
    secondaryParty: model.guarantor.name,
    amount: model.deal.principal,
  };
  return { primaryParty: model.client.name, amount: model.deal.principal };
}

export async function verifyExecutedAgreement(code: string): Promise<PublicVerification | null> {
  const normalizedCode = code.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedCode)) return null;

  const snapshot = await adminDb.collection('agreementEnvelopes')
    .where('finalDocumentHash', '==', normalizedCode)
    .limit(2)
    .get();
  if (snapshot.size !== 1) return null;

  const document = snapshot.docs[0];
  const envelope = document.data() as StoredVerificationEnvelope;
  if (
    envelope.status !== 'EXECUTED' ||
    !envelope.executedAt ||
    !safeEqual(envelope.finalDocumentHash, normalizedCode) ||
    !safeEqual(recomputeEnvelopeHash(envelope), normalizedCode) ||
    !envelope.requiredRoles.every((role) => envelope.signedRoles.includes(role))
  ) return null;

  const signatureSnapshot = await document.ref.collection('signatures').get();
  const signatures = signatureSnapshot.docs.map((signatureDocument) => signatureDocument.data() as {
    role: AgreementSignerRole;
    signerName: string;
    signedAt: string;
    signatureHash: string;
  });
  if (signatures.length !== envelope.requiredRoles.length) return null;
  if (signatures.some((signature) => envelope.signatureHashes[signature.role] !== signature.signatureHash)) return null;

  return {
    genuine: true,
    agreementReference: envelope.agreementReference,
    agreementType: envelope.agreementType,
    executedAt: envelope.executedAt.toDate().toISOString(),
    ...publicParties(envelope.documentModel),
    fingerprint: normalizedCode,
    signatures: signatures
      .sort((left, right) => envelope.requiredRoles.indexOf(left.role) - envelope.requiredRoles.indexOf(right.role))
      .map((signature) => ({
        role: agreementSignerRoleLabel(signature.role),
        signerName: signature.signerName,
        signedAt: signature.signedAt,
        verificationReference: signature.signatureHash.slice(0, 16).toUpperCase(),
      })),
  };
}
