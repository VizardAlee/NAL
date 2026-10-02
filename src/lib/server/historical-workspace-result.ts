import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export class HistoricalWorkspaceError extends Error {
  constructor(public readonly code: string, message: string, public readonly matchingUserId?: string) {
    super(message);
  }
}

/** Expected errors are returned as plain data so Next.js does not redact them. */
export async function historicalWorkspaceResult<T>(work: () => Promise<T>) {
  try {
    return { success: true as const, data: await work() };
  } catch (error) {
    if (error instanceof HistoricalWorkspaceError) {
      return { success: false as const, code: error.code, message: error.message, matchingUserId: error.matchingUserId };
    }
    if (error instanceof z.ZodError) {
      const field = String(error.issues[0]?.path[0] || '');
      const messages: Record<string, string> = {
        authToken: 'Your session could not be verified. Sign in again and retry.',
        partyName: 'Enter the customer’s full name or organisation name (at least two characters).',
        existingUserId: 'Select an existing client or investor before creating the workspace.',
        asOfDate: 'Choose a valid financial snapshot date.',
        partyKind: 'Choose the customer’s business relationship: client, investor, or both.',
        partyMode: 'Choose whether to use an existing account or create an unclaimed profile.',
        accountType: 'Choose an individual or organisation account.',
      };
      return { success: false as const, code: 'INVALID_INPUT', message: messages[field] || 'Check the supplied information and try again.' };
    }
    const details = error as { status?: number; code?: string | number; name?: string } | null;
    const status = details?.status;
    if (status === 401) return { success: false as const, code: 'SESSION_EXPIRED', message: 'Your session has expired or could not be verified. Sign in again, then retry.' };
    if (status === 403) return { success: false as const, code: 'ACCESS_DENIED', message: 'This action requires an administrator account with write access. Switch to an authorised admin account.' };
    if (status === 503 || [4, 14, 'unavailable', 'deadline-exceeded'].includes(details?.code ?? '')) {
      return { success: false as const, code: 'SERVICE_UNAVAILABLE', message: 'The server could not reach Firebase. Wait a moment and retry; if this continues, contact your platform administrator.' };
    }
    const reference = randomUUID();
    // Never return SDK diagnostics, credentials, or customer data to the browser.
    console.error('Historical workspace operation failed.', { reference, code: details?.code, errorType: details?.name });
    return { success: false as const, code: 'INTERNAL_ERROR', message: `The server could not complete this operation. Please retry or contact support with reference ${reference}.` };
  }
}
