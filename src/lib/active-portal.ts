import { type PrimaryPortal, canAccessPortal, isPrimaryPortal } from '@/lib/access-control';

const ACTIVE_PORTAL_STORAGE_KEY = 'nal.activePortal';

export function getStoredActivePortal(): PrimaryPortal | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(ACTIVE_PORTAL_STORAGE_KEY);
  return isPrimaryPortal(stored) ? stored : null;
}

export function setStoredActivePortal(portal: PrimaryPortal): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_PORTAL_STORAGE_KEY, portal);
}

export function resolvePreferredPortal(user: unknown): PrimaryPortal | null {
  const storedPortal = getStoredActivePortal();
  if (!storedPortal) return null;
  if (!canAccessPortal(user as any, storedPortal)) return null;
  return storedPortal;
}
