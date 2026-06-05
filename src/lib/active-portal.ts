import { type PrimaryPortal, canAccessPortal, isPrimaryPortal } from '@/lib/access-control';

const ACTIVE_PORTAL_STORAGE_KEY = 'nal.activePortal';

type PortalUser = {
  uid?: string | null;
  id?: string | null;
};

function getPortalStorageKey(userId?: string | null): string {
  return userId ? `${ACTIVE_PORTAL_STORAGE_KEY}.${userId}` : ACTIVE_PORTAL_STORAGE_KEY;
}

function resolveUserId(user: PortalUser | null | undefined, userId?: string | null): string | null {
  return userId || user?.uid || user?.id || null;
}

function clearLegacyActivePortal(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_PORTAL_STORAGE_KEY);
}

export function getStoredActivePortal(userId?: string | null): PrimaryPortal | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(getPortalStorageKey(userId));
  return isPrimaryPortal(stored) ? stored : null;
}

export function setStoredActivePortal(portal: PrimaryPortal, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getPortalStorageKey(userId), portal);
  clearLegacyActivePortal();
}

export function resolvePreferredPortal(user: unknown, userId?: string | null): PrimaryPortal | null {
  const resolvedUserId = resolveUserId(user as PortalUser | null | undefined, userId);
  clearLegacyActivePortal();

  if (!resolvedUserId) return null;

  const storedPortal = getStoredActivePortal(resolvedUserId);
  if (!storedPortal) return null;
  if (!canAccessPortal(user as any, storedPortal)) return null;
  return storedPortal;
}

export function clearStoredActivePortal(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getPortalStorageKey(userId));
  clearLegacyActivePortal();
}
