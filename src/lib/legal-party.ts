export type AccountType = 'Individual' | 'Organization';

export type LegalParty = {
  accountType: AccountType;
  name: string;
  address: string;
  email: string;
  phoneNumber: string;
  photoURL?: string;
  organizationRegistrationNumber?: string;
  representative?: {
    name: string;
    title: string;
    email: string;
    phoneNumber: string;
    idType?: string;
    idNumber?: string;
  };
};

type ProfileLike = Record<string, unknown>;

export function legalPartyFromProfile(profile: ProfileLike, fallbackName = ''): LegalParty {
  const accountType: AccountType = profile.accountType === 'Organization' ? 'Organization' : 'Individual';
  const email = String(profile.email || '');
  const photoURL = profile.photoURL ? String(profile.photoURL) : undefined;
  if (accountType === 'Organization') {
    return {
      accountType,
      name: String(profile.organizationName || profile.name || fallbackName),
      address: String(profile.organizationAddress || profile.address || ''),
      email,
      phoneNumber: String(profile.representativePhoneNumber || profile.phoneNumber || ''),
      ...(photoURL ? { photoURL } : {}),
      organizationRegistrationNumber: String(profile.organizationRegistrationNumber || ''),
      representative: {
        name: String(profile.representativeName || ''),
        title: String(profile.representativeTitle || 'Authorised Representative'),
        email: String(profile.representativeEmail || email),
        phoneNumber: String(profile.representativePhoneNumber || profile.phoneNumber || ''),
        idType: String(profile.representativeIdType || ''),
        idNumber: String(profile.representativeIdNumber || ''),
      },
    };
  }
  return {
    accountType,
    name: String(profile.name || fallbackName),
    address: String(profile.address || ''),
    email,
    phoneNumber: String(profile.phoneNumber || ''),
    ...(photoURL ? { photoURL } : {}),
  };
}

export function legalPartyIntroduction(party: LegalParty, definedTerm: string): string {
  if (party.accountType === 'Organization') {
    const registration = party.organizationRegistrationNumber
      ? `, registered as ${party.organizationRegistrationNumber}`
      : '';
    const representative = party.representative?.name
      ? `, acting through ${party.representative.name.toUpperCase()} in the capacity of ${party.representative.title}`
      : '';
    return `${party.name.toUpperCase()}${registration}, of ${party.address}${representative} (the “${definedTerm}”)`;
  }
  return `${party.name.toUpperCase()}, of ${party.address} (the “${definedTerm}”)`;
}

export function legalPartySignerName(party: LegalParty): string {
  return party.accountType === 'Organization' ? party.representative?.name || '' : party.name;
}

export function legalPartySignerCapacity(party: LegalParty, individualCapacity: string): string {
  return party.accountType === 'Organization'
    ? `${party.representative?.title || 'Authorised Representative'} for ${party.name}`
    : individualCapacity;
}

export function legalPartyMissingFields(profile: ProfileLike, label: 'client' | 'investor'): string[] {
  if (profile.accountType !== 'Organization') {
    return [
      ...(!profile.name ? [`${label} full name`] : []),
      ...(!profile.address ? [`${label} residential address`] : []),
      ...(!profile.photoURL ? [`${label} photograph`] : []),
    ];
  }
  return [
    ...(!profile.organizationName ? ['organization registered name'] : []),
    ...(!profile.organizationRegistrationNumber ? ['organization registration number'] : []),
    ...(!profile.organizationAddress ? ['organization registered address'] : []),
    ...(!profile.representativeName ? ['authorised representative full name'] : []),
    ...(!profile.representativeTitle ? ['authorised representative capacity'] : []),
    ...(!profile.representativePhoneNumber ? ['authorised representative phone number'] : []),
    ...(!profile.representativeIdType ? ['authorised representative identity type'] : []),
    ...(!profile.representativeIdNumber ? ['authorised representative identity number'] : []),
    ...(!profile.photoURL ? ['authorised representative photograph'] : []),
  ];
}
