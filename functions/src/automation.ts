import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";

const cronSecret = defineSecret("CRON_SECRET");

export const runDailyAutomation = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "Africa/Lagos",
    region: "us-central1",
    secrets: [cronSecret],
    retryCount: 3,
    maxRetrySeconds: 900,
  },
  async () => {
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
  }
);
