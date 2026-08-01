import type { KafaalahBondModel } from './kafaalah';
import type { MudarabaAgreementModel } from './mudaraba';
import type { WakalahAgreementModel } from './wakalah';

export type AgreementSigningType = 'MUDARABA' | 'WAKALAH' | 'KAFAALAH';

export type AgreementSignerRole =
  | 'INVESTOR'
  | 'CLIENT'
  | 'GUARANTOR'
  | 'WITNESS'
  | 'NAL_SIGNATORY_1'
  | 'NAL_SIGNATORY_2'
  | 'NAL_AUTHORIZED_SIGNATORY';

export type AgreementSigningStatus =
  | 'NOT_STARTED'
  | 'AWAITING_SIGNATURES'
  | 'AWAITING_COMPANY'
  | 'EXECUTED';

export type AgreementDocumentModel =
  | MudarabaAgreementModel
  | WakalahAgreementModel
  | KafaalahBondModel;

export type AgreementSignature = {
  role: AgreementSignerRole;
  signerName: string;
  signerUserId?: string;
  signerPhoneNumber?: string;
  signatureDataUrl: string;
  signedAt: string;
  signatureHash: string;
  authenticationMethod: 'firebase-reauthentication' | 'secure-link-and-pin';
};

export type SigningInviteSummary = {
  role: 'GUARANTOR' | 'WITNESS';
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  expiresAt: string;
};

export type AgreementSigningState = {
  envelopeId: string;
  agreementType: AgreementSigningType;
  sourceId: string;
  agreementReference: string;
  documentVersion: string;
  documentHash: string;
  finalDocumentHash?: string;
  status: AgreementSigningStatus;
  requiredRoles: AgreementSignerRole[];
  signedRoles: AgreementSignerRole[];
  signatures: Partial<Record<AgreementSignerRole, AgreementSignature>>;
  invites: SigningInviteSummary[];
  startedAt: string;
  executedAt?: string;
};

export const REQUIRED_SIGNER_ROLES: Record<AgreementSigningType, AgreementSignerRole[]> = {
  MUDARABA: ['INVESTOR', 'NAL_SIGNATORY_1', 'NAL_SIGNATORY_2'],
  WAKALAH: ['CLIENT', 'WITNESS', 'NAL_SIGNATORY_1', 'NAL_SIGNATORY_2'],
  KAFAALAH: ['GUARANTOR', 'WITNESS', 'NAL_AUTHORIZED_SIGNATORY'],
};

export const EXTERNAL_SIGNER_ROLES: AgreementSignerRole[] = ['GUARANTOR', 'WITNESS'];
export const COMPANY_SIGNER_ROLES: AgreementSignerRole[] = [
  'NAL_SIGNATORY_1',
  'NAL_SIGNATORY_2',
  'NAL_AUTHORIZED_SIGNATORY',
];

export function isCompanySignerRole(role: AgreementSignerRole): boolean {
  return COMPANY_SIGNER_ROLES.includes(role);
}

export function isExternalSignerRole(role: AgreementSignerRole): role is 'GUARANTOR' | 'WITNESS' {
  return EXTERNAL_SIGNER_ROLES.includes(role);
}

export function agreementEnvelopeId(type: AgreementSigningType, sourceId: string): string {
  return `${type.toLowerCase()}_${sourceId}`;
}

export function agreementSignerRoleLabel(role: AgreementSignerRole): string {
  const labels: Record<AgreementSignerRole, string> = {
    INVESTOR: 'Investor',
    CLIENT: 'Client',
    GUARANTOR: 'Guarantor / Kafeel',
    WITNESS: 'Witness',
    NAL_SIGNATORY_1: 'NAL Authorised Signatory 1',
    NAL_SIGNATORY_2: 'NAL Authorised Signatory 2',
    NAL_AUTHORIZED_SIGNATORY: 'NAL Authorised Signatory',
  };
  return labels[role];
}

export function calculateSigningStatus(
  requiredRoles: AgreementSignerRole[],
  signedRoles: AgreementSignerRole[]
): AgreementSigningStatus {
  if (requiredRoles.every((role) => signedRoles.includes(role))) return 'EXECUTED';
  const partyRoles = requiredRoles.filter((role) => !isCompanySignerRole(role));
  if (partyRoles.every((role) => signedRoles.includes(role))) return 'AWAITING_COMPANY';
  return 'AWAITING_SIGNATURES';
}

export function agreementSigningStatusLabel(status: AgreementSigningStatus): string {
  const labels: Record<AgreementSigningStatus, string> = {
    NOT_STARTED: 'Not started',
    AWAITING_SIGNATURES: 'Awaiting party signatures',
    AWAITING_COMPANY: 'Awaiting NAL approval',
    EXECUTED: 'Fully executed',
  };
  return labels[status];
}
