import { z } from 'zod';

export const platformBankAccountSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  bankName: z.string().trim().min(2).max(100),
  accountName: z.string().trim().min(2).max(150),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must contain exactly 10 digits.'),
  active: z.boolean(),
}).strict();
export type PlatformBankAccount = z.infer<typeof platformBankAccountSchema>;
export const platformBankAccountsSchema = z.object({
  accounts: z.array(platformBankAccountSchema).min(1).max(20),
  defaultAccountId: z.string(),
}).superRefine((data, context) => {
  if (!data.accounts.some(account => account.id === data.defaultAccountId && account.active)) context.addIssue({ code: 'custom', message: 'Choose an active default account.' });
  if (new Set(data.accounts.map(account => account.id)).size !== data.accounts.length) context.addIssue({ code: 'custom', message: 'Account identifiers must be unique.' });
  if (new Set(data.accounts.map(account => account.accountNumber)).size !== data.accounts.length) context.addIssue({ code: 'custom', message: 'Do not add the same account number twice.' });
});

/** Keep existing single-account settings usable without a data migration. */
export function platformBankAccounts(settings: unknown, includeInactive = false): PlatformBankAccount[] {
  if (!settings || typeof settings !== 'object') return [];
  const data = settings as Record<string, unknown>;
  const source = Array.isArray(data.accounts) ? data.accounts : [{ id: 'legacy', bankName: data.bankName, accountName: data.accountName, accountNumber: data.accountNumber, active: true }];
  return source.flatMap(value => { const parsed = platformBankAccountSchema.safeParse(value); return parsed.success && (includeInactive || parsed.data.active) ? [parsed.data] : []; });
}
export function defaultPlatformBankAccount(settings: unknown): PlatformBankAccount | undefined {
  const accounts = platformBankAccounts(settings);
  const id = (settings as {defaultAccountId?: string} | null)?.defaultAccountId;
  return accounts.find(account => account.id === id) || accounts[0];
}
