import QRCode from 'qrcode';
import type { AgreementSigningState } from './signing';

const PRODUCTION_ORIGIN = 'https://nalgm.com';

export function agreementVerificationUrl(code: string): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : configuredOrigin || PRODUCTION_ORIGIN;
  return `${origin}/verify/${encodeURIComponent(code)}`;
}

export async function buildAgreementVerificationQr(
  signing?: AgreementSigningState | null
): Promise<{ url: string; dataUrl: string; reference: string } | null> {
  if (signing?.status !== 'EXECUTED' || !signing.finalDocumentHash) return null;
  const url = agreementVerificationUrl(signing.finalDocumentHash);
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 320,
    color: { dark: '#062f22', light: '#ffffff' },
  });
  return { url, dataUrl, reference: signing.finalDocumentHash };
}
