"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewAutoFundDeal = exports.autoFundDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_access_1 = require("./admin-access");
/** Keep the deployed legacy name, but use the current verified funding workflow. */
exports.autoFundDeal = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    await (0, admin_access_1.requireCallableAdmin)(request);
    const dealId = request.data?.dealId;
    if (typeof dealId !== 'string' || !dealId.trim() || dealId.length > 180 || dealId.includes('/')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid deal ID is required.');
    }
    const base = (process.env.APP_URL || 'https://nalgm.com').replace(/\/$/, '');
    const response = await fetch(`${base}/api/fund-deal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: request.rawRequest.headers.authorization },
        body: JSON.stringify({ dealId }), signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok || !result.success)
        throw new https_1.HttpsError('failed-precondition', result.message || 'Funding was not completed. Check the deal prerequisites in NAL.');
    return result;
});
/** The old preview used obsolete rules; never expose a plan from that implementation. */
exports.previewAutoFundDeal = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    await (0, admin_access_1.requireCallableAdmin)(request);
    throw new https_1.HttpsError('failed-precondition', 'Use the NAL administrator deal workspace to review current funding eligibility.');
});
//# sourceMappingURL=legacy-funding.js.map