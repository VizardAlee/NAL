export type LegacyRole = 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';

export type AccessRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'USER';

export type Persona =
  | 'INVESTOR'
  | 'CLIENT'
  | 'LEGAL'
  | 'RECOVERY'
  | 'MARKETER'
  | 'STAFF_MEMBER';

export type PrimaryPortal = 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer';

export type AccessModel = {
  accessRole: AccessRole;
  personas: Persona[];
  primaryPortal: PrimaryPortal;
};

type UserLike = {
  role?: LegacyRole | null;
  accessRole?: AccessRole | null;
  personas?: Persona[] | null;
  primaryPortal?: PrimaryPortal | null;
};

const PORTAL_TO_LEGACY_ROLE: Record<PrimaryPortal, LegacyRole> = {
  admin: 'Admin',
  investor: 'Investor',
  client: 'Client',
  legal: 'Legal',
  recovery: 'Recovery',
  marketer: 'Marketer',
};

const PERSONA_TO_PORTAL: Record<Exclude<Persona, 'STAFF_MEMBER'>, PrimaryPortal> = {
  INVESTOR: 'investor',
  CLIENT: 'client',
  LEGAL: 'legal',
  RECOVERY: 'recovery',
  MARKETER: 'marketer',
};

export function deriveAccessModelFromLegacyRole(role?: LegacyRole | null): AccessModel {
  switch (role) {
    case 'Admin':
      return { accessRole: 'ADMIN', personas: [], primaryPortal: 'admin' };
    case 'Investor':
      return { accessRole: 'USER', personas: ['INVESTOR'], primaryPortal: 'investor' };
    case 'Client':
      return { accessRole: 'USER', personas: ['CLIENT'], primaryPortal: 'client' };
    case 'Legal':
      return { accessRole: 'USER', personas: ['LEGAL'], primaryPortal: 'legal' };
    case 'Recovery':
      return { accessRole: 'USER', personas: ['RECOVERY'], primaryPortal: 'recovery' };
    case 'Marketer':
      return { accessRole: 'USER', personas: ['MARKETER'], primaryPortal: 'marketer' };
    default:
      return { accessRole: 'USER', personas: [], primaryPortal: 'client' };
  }
}

export function normalizeAccessModel(user: UserLike | null | undefined): AccessModel {
  if (!user) return { accessRole: 'USER', personas: [], primaryPortal: 'client' };

  if (user.accessRole) {
    const personas = Array.isArray(user.personas) ? [...new Set(user.personas)] : [];
    const primaryPortal =
      user.primaryPortal ||
      (user.accessRole === 'OWNER' || user.accessRole === 'ADMIN' || user.accessRole === 'STAFF'
        ? 'admin'
        : resolvePrimaryPortalFromPersonas(personas));

    return {
      accessRole: user.accessRole,
      personas,
      primaryPortal,
    };
  }

  return deriveAccessModelFromLegacyRole(user.role);
}

export function resolvePrimaryPortalFromPersonas(personas: Persona[]): PrimaryPortal {
  if (personas.includes('INVESTOR')) return 'investor';
  if (personas.includes('CLIENT')) return 'client';
  if (personas.includes('LEGAL')) return 'legal';
  if (personas.includes('RECOVERY')) return 'recovery';
  if (personas.includes('MARKETER')) return 'marketer';
  return 'client';
}

export function toLegacyRoleFromAccess(model: AccessModel): LegacyRole {
  if (model.accessRole === 'OWNER' || model.accessRole === 'ADMIN' || model.accessRole === 'STAFF') {
    return 'Admin';
  }

  for (const persona of model.personas) {
    if (persona === 'STAFF_MEMBER') continue;
    const portal = PERSONA_TO_PORTAL[persona as Exclude<Persona, 'STAFF_MEMBER'>];
    return PORTAL_TO_LEGACY_ROLE[portal];
  }

  return 'Client';
}

export function canViewAdmin(user: UserLike | null | undefined): boolean {
  const model = normalizeAccessModel(user);
  return model.accessRole === 'OWNER' || model.accessRole === 'ADMIN' || model.accessRole === 'STAFF';
}

export function canWriteAdmin(user: UserLike | null | undefined): boolean {
  const model = normalizeAccessModel(user);
  return model.accessRole === 'ADMIN';
}

export function canView(user: UserLike | null | undefined, area: 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer'): boolean {
  return canAccessPortal(user, area);
}

export function canWrite(user: UserLike | null | undefined, area: 'admin'): boolean {
  if (area === 'admin') return canWriteAdmin(user);
  return false;
}

export function canManageOwners(user: UserLike | null | undefined): boolean {
  const model = normalizeAccessModel(user);
  return model.accessRole === 'OWNER' || model.accessRole === 'ADMIN';
}

export function isReadOnlyOwner(user: UserLike | null | undefined): boolean {
  return normalizeAccessModel(user).accessRole === 'OWNER';
}

export function canAccessPortal(user: UserLike | null | undefined, portal: PrimaryPortal): boolean {
  const model = normalizeAccessModel(user);

  if (portal === 'admin') {
    return canViewAdmin(model);
  }

  if (model.accessRole === 'OWNER' || model.accessRole === 'ADMIN' || model.accessRole === 'STAFF') {
    return true;
  }

  return model.personas.includes(portal.toUpperCase() as Persona);
}

export function getDefaultRouteForUser(user: UserLike | null | undefined): string {
  const model = normalizeAccessModel(user);

  if (model.accessRole === 'OWNER' || model.accessRole === 'ADMIN' || model.accessRole === 'STAFF') {
    return '/admin/dashboard';
  }

  switch (model.primaryPortal) {
    case 'investor':
      return '/investor/dashboard';
    case 'client':
      return '/client/dashboard';
    case 'legal':
      return '/legal/dashboard';
    case 'recovery':
      return '/recovery/dashboard';
    case 'marketer':
      return '/marketer/dashboard';
    case 'admin':
      return '/admin/dashboard';
    default:
      return '/';
  }
}
