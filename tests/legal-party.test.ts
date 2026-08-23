import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legalPartyFromProfile,
  legalPartyIntroduction,
  legalPartyMissingFields,
  legalPartySignerCapacity,
  legalPartySignerName,
} from '../src/lib/legal-party';

test('an organization remains the contracting party while its representative signs', () => {
  const party = legalPartyFromProfile({
    accountType: 'Organization',
    organizationName: 'Kamal Babbangari General Enterprise',
    organizationRegistrationNumber: 'BN 1234567',
    organizationAddress: '36 Kofar Ruwa Market, Kano',
    representativeName: 'Kamalu Ibrahim',
    representativeTitle: 'Proprietor',
    representativeEmail: 'kamalu@example.com',
    representativePhoneNumber: '+2348000000000',
    representativeIdType: 'NIN',
    representativeIdNumber: '12345678901',
    photoURL: 'https://example.com/photo.jpg',
  });

  assert.equal(party.name, 'Kamal Babbangari General Enterprise');
  assert.equal(legalPartySignerName(party), 'Kamalu Ibrahim');
  assert.equal(legalPartySignerCapacity(party, 'Customer'), 'Proprietor for Kamal Babbangari General Enterprise');
  assert.match(legalPartyIntroduction(party, 'Customer'), /KAMAL BABBANGARI GENERAL ENTERPRISE/);
  assert.match(legalPartyIntroduction(party, 'Customer'), /acting through KAMALU IBRAHIM in the capacity of Proprietor/);
  assert.deepEqual(legalPartyMissingFields({ ...party, organizationName: party.name, organizationAddress: party.address, representativeName: party.representative?.name, representativeTitle: party.representative?.title, representativePhoneNumber: party.phoneNumber, representativeIdType: 'NIN', representativeIdNumber: '12345678901' }, 'client'), []);
});

test('legacy profiles remain individual legal parties', () => {
  const party = legalPartyFromProfile({ name: 'Amina Yusuf', address: 'Kano', email: 'amina@example.com' });
  assert.equal(party.accountType, 'Individual');
  assert.equal(legalPartySignerName(party), 'Amina Yusuf');
  assert.equal(legalPartySignerCapacity(party, 'Investor / Rabb al-Mal'), 'Investor / Rabb al-Mal');
});
