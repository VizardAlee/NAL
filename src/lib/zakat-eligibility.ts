import { hasPersona } from '@/lib/access-control';

type ZakatUser = {
  role?: 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer' | null;
  roles?: Array<'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer'> | null;
  accessRole?: 'OWNER' | 'ADMIN' | 'STAFF' | 'USER' | null;
  personas?: Array<'INVESTOR' | 'CLIENT' | 'LEGAL' | 'RECOVERY' | 'MARKETER' | 'STAFF_MEMBER'> | null;
  primaryPortal?: 'owner' | 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer' | null;
  isMuslim?: boolean | null;
};

/**
 * Zakat applies only when both conditions are explicit:
 * the user is an investor and the user is registered as Muslim.
 *
 * Treating a missing classification as ineligible prevents legacy accounts from
 * being charged until an administrator classifies them.
 */
export function isZakatApplicable(user: ZakatUser | null | undefined): boolean {
  return Boolean(user && user.isMuslim === true && hasPersona(user, 'INVESTOR'));
}
