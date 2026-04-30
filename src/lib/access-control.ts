export type LegacyRole = 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';

export type AccessRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'USER';

export type Persona =
  | 'INVESTOR'
  | 'CLIENT'
  | 'LEGAL'
  | 'RECOVERY'
  | 'MARKETER'
  | 'STAFF_MEMBER';

export type PrimaryPortal = 'owner' | 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer';

export type AccessModel = {
  accessRole: AccessRole;
  personas: Persona[];
  primaryPortal: PrimaryPortal;
};

type UserLike = {
  role?: LegacyRole | null;
  roles?: LegacyRole[] | null;
  accessRole?: AccessRole | null;
  personas?: Persona[] | null;
  primaryPortal?: PrimaryPortal | null;
};

const PORTAL_TO_LEGACY_ROLE: Record<Exclude<PrimaryPortal, 'owner'>, LegacyRole> = {
  admin: 'Admin',
  investor: 'Investor',
  client: 'Client',
  legal: 'Legal',
  recovery: 'Recovery',
  marketer: 'Marketer',
};

const PERSONA_TO_PORTAL: Record<Exclude<Persona, 'STAFF_MEMBER'>, Exclude<PrimaryPortal, 'owner'>> = {
  INVESTOR: 'investor',
  CLIENT: 'client',
  LEGAL: 'legal',
  RECOVERY: 'recovery',
  MARKETER: 'marketer',
};

const PORTAL_ROUTES: Record<PrimaryPortal, string> = {
  owner: '/owner/dashboard',
  admin: '/admin/dashboard',
  investor: '/investor/dashboard',
  client: '/client/dashboard',
  legal: '/legal/dashboard',
  recovery: '/recovery/dashboard',
  marketer: '/marketer/dashboard',
};

function uniquePersonas(personas: Persona[]): Persona[] {
  return [...new Set(personas)];
}

function toPersona(role: LegacyRole): Persona | null {
  switch (role) {
    case 'Investor':
      return 'INVESTOR';
    case 'Client':
      return 'CLIENT';
    case 'Legal':
      return 'LEGAL';
    case 'Recovery':
      return 'RECOVERY';
    case 'Marketer':
      return 'MARKETER';
    default:
      return null;
  }
}

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
    const personas = Array.isArray(user.personas) ? uniquePersonas(user.personas) : [];
    const primaryPortal =
      user.primaryPortal ||
      (user.accessRole === 'OWNER'
        ? 'owner'
        : user.accessRole === 'ADMIN' || user.accessRole === 'STAFF'
        ? 'admin'
        : resolvePrimaryPortalFromPersonas(personas));

    return {
      accessRole: user.accessRole,
      personas,
      primaryPortal,
    };
  }

  const legacyRoles = (
    Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : user.role
      ? [user.role]
      : []
  ).filter(Boolean) as LegacyRole[];

  if (legacyRoles.length === 0) {
    return { accessRole: 'USER', personas: [], primaryPortal: 'client' };
  }

  const hasAdminRole = legacyRoles.includes('Admin');
  const personas = uniquePersonas(
    legacyRoles
      .map((role) => toPersona(role))
      .filter((value): value is Persona => value !== null)
  );

  const accessRole: AccessRole = hasAdminRole ? 'ADMIN' : 'USER';
  const primaryPortal =
    user.primaryPortal ||
    (hasAdminRole ? 'admin' : resolvePrimaryPortalFromPersonas(personas));

  return {
    accessRole,
    personas,
    primaryPortal,
  };
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

export function canView(user: UserLike | null | undefined, area: 'owner' | 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer'): boolean {
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

  if (portal === 'owner') {
    return model.accessRole === 'OWNER';
  }

  if (model.accessRole === 'OWNER' || model.accessRole === 'ADMIN' || model.accessRole === 'STAFF') {
    return true;
  }

  return model.personas.includes(portal.toUpperCase() as Persona);
}

export function hasPersona(user: UserLike | null | undefined, persona: Persona): boolean {
  return normalizeAccessModel(user).personas.includes(persona);
}

export function getRouteForPortal(portal: PrimaryPortal): string {
  return PORTAL_ROUTES[portal];
}

export function isPrimaryPortal(value: unknown): value is PrimaryPortal {
  return typeof value === 'string' && value in PORTAL_ROUTES;
}

export function getAccessiblePortals(user: UserLike | null | undefined): PrimaryPortal[] {
  const model = normalizeAccessModel(user);
  const explicitPortals: PrimaryPortal[] = model.personas
    .filter((persona): persona is Exclude<Persona, 'STAFF_MEMBER'> => persona !== 'STAFF_MEMBER')
    .map((persona) => PERSONA_TO_PORTAL[persona]);

  if (model.accessRole === 'OWNER') {
    explicitPortals.push('owner');
    explicitPortals.push('admin');
  }

  if (model.accessRole === 'ADMIN' || model.accessRole === 'STAFF') {
    explicitPortals.push('admin');
  }

  if (explicitPortals.length > 0) {
    return [...new Set(explicitPortals)];
  }

  return [model.primaryPortal];
}

export function getDefaultRouteForUser(user: UserLike | null | undefined, preferredPortal?: PrimaryPortal | null): string {
  if (preferredPortal && canAccessPortal(user, preferredPortal)) {
    return getRouteForPortal(preferredPortal);
  }

  const model = normalizeAccessModel(user);

  switch (model.accessRole) {
    case 'OWNER':
      return getRouteForPortal('owner');
    case 'ADMIN':
    case 'STAFF':
      return getRouteForPortal('admin');
    default:
      break;
  }

  if (canAccessPortal(user, model.primaryPortal)) {
    return getRouteForPortal(model.primaryPortal);
  }

  const firstAccessiblePortal = getAccessiblePortals(user)[0];
  return firstAccessiblePortal ? getRouteForPortal(firstAccessiblePortal) : '/';
}
