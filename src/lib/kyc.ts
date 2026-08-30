export const GOVERNMENT_ID_TYPES = [
  'NIN',
  'NIGERIAN_PASSPORT',
  'DRIVERS_LICENCE',
  'VOTERS_CARD',
] as const;

export type GovernmentIdType = (typeof GOVERNMENT_ID_TYPES)[number];

export const GOVERNMENT_ID_LABELS: Record<GovernmentIdType, string> = {
  NIN: 'National Identification Number (NIN)',
  NIGERIAN_PASSPORT: 'Nigerian International Passport',
  DRIVERS_LICENCE: "Nigerian Driver's Licence",
  VOTERS_CARD: "Permanent Voter's Card",
};

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeGovernmentIdNumber(value: string): string {
  return value.trim().replace(/[\s-]/g, '').toUpperCase();
}

export function isGovernmentIdType(value: string): value is GovernmentIdType {
  return GOVERNMENT_ID_TYPES.includes(value as GovernmentIdType);
}

export function isValidGovernmentIdNumber(type: string, value: string): boolean {
  if (!isGovernmentIdType(type)) return false;
  const normalized = normalizeGovernmentIdNumber(value);
  if (type === 'NIN') return /^\d{11}$/.test(normalized);
  if (type === 'NIGERIAN_PASSPORT') return /^[A-Z][0-9]{8}$/.test(normalized);
  if (type === 'DRIVERS_LICENCE') return /^[A-Z0-9]{6,20}$/.test(normalized);
  return /^[A-Z0-9]{10,25}$/.test(normalized);
}

export function isValidBvn(value: string): boolean {
  return /^\d{11}$/.test(normalizeDigits(value));
}

export function isValidNigerianAccountNumber(value: string): boolean {
  return /^\d{10}$/.test(normalizeDigits(value));
}

export function isValidTin(value: string): boolean {
  return /^\d{8,14}$/.test(normalizeDigits(value));
}

export function maskIdentifier(value: string, visibleDigits = 4): string {
  const normalized = value.trim();
  if (!normalized) return '';
  const visible = normalized.slice(-visibleDigits);
  return `${'*'.repeat(Math.max(4, normalized.length - visible.length))}${visible}`;
}
