"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyAutomation = void 0;
const params_1 = require("firebase-functions/params");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const cronSecret = (0, params_1.defineSecret)("CRON_SECRET");
exports.runDailyAutomation = (0, scheduler_1.onSchedule)({
    schedule: "5 0 * * *",
    timeZone: "Africa/Lagos",
    region: "us-central1",
    secrets: [cronSecret],
    retryCount: 3,
    maxRetrySeconds: 900,
    timeoutSeconds: 540,
}, async () => {
    const response = await fetch("https://nalgm.com/api/cron", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${cronSecret.value()}`,
            "User-Agent": "NAL-Daily-Automation/1.0",
        },
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Daily automation failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
});
//# sourceMappingURL=automation.js.map