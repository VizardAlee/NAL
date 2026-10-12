import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireCallableAdmin } from './admin-access';

/** Keep the deployed legacy name, but use the current verified funding workflow. */
export const autoFundDeal = onCall({ region: 'us-central1' }, async request => {
  await requireCallableAdmin(request);
  const dealId = request.data?.dealId;
  if (typeof dealId !== 'string' || !dealId.trim() || dealId.length > 180 || dealId.includes('/')) {
    throw new HttpsError('invalid-argument', 'A valid deal ID is required.');
  }
  const base = (process.env.APP_URL || 'https://nalgm.com').replace(/\/$/, '');
  const response = await fetch(`${base}/api/fund-deal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: request.rawRequest.headers.authorization! },
    body: JSON.stringify({ dealId }), signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json() as { success?: boolean; message?: string };
  if (!response.ok || !result.success) throw new HttpsError('failed-precondition', result.message || 'Funding was not completed. Check the deal prerequisites in NAL.');
  return result;
});

/** The old preview used obsolete rules; never expose a plan from that implementation. */
export const previewAutoFundDeal = onCall({ region: 'us-central1' }, async request => {
  await requireCallableAdmin(request);
  throw new HttpsError('failed-precondition', 'Use the NAL administrator deal workspace to review current funding eligibility.');
});
