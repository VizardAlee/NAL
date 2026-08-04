'use server';

import { z } from 'zod';
import { verifyAdminWrite } from '@/lib/server/auth';

export async function runDailyAutomationNowAction(input: { authToken: string }) {
  const validated = z.object({ authToken: z.string().min(1) }).safeParse(input);
  if (!validated.success) return { success: false, message: 'Authentication is required.' };
  try {
    await verifyAdminWrite(validated.data.authToken);
    const secret = process.env.CRON_SECRET;
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!secret || !appUrl) throw new Error('Daily automation is not configured in this environment.');
    const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/cron`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'NAL-Admin-Manual-Automation/1.0' }, cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(body?.message || `Automation returned HTTP ${response.status}.`);
    return { success: true, message: 'Daily automation completed successfully.', summary: body };
  } catch (error) {
    console.error('MANUAL AUTOMATION ERROR:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to run daily automation.' };
  }
}
