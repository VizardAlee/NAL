import { timingSafeEqual } from 'node:crypto';

/** Secret Manager values may include a terminal newline from a pasted value. */
export function normalizeAutomationSecret(value: string | undefined): string {
  const secret = value?.trim() || '';
  if (!secret || /\s/.test(secret)) {
    throw new Error('Daily automation credentials are missing or malformed. Ask an administrator to check the automation secret and redeploy.');
  }
  return secret;
}

export function isAutomationAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${normalizeAutomationSecret(secret)}`);
  const received = Buffer.from(header?.trim() || '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
