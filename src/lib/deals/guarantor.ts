export type GuarantorRecord = {
  guarantorName?: unknown;
  guarantorAddress?: unknown;
  guarantorPhoneNumber?: unknown;
  guarantorOccupation?: unknown;
  guarantorPhotoURL?: unknown;
};

export function hasCompleteGuarantor(record: GuarantorRecord): boolean {
  return [record.guarantorName, record.guarantorAddress, record.guarantorPhoneNumber, record.guarantorOccupation, record.guarantorPhotoURL]
    .every((value) => typeof value === 'string' && value.trim().length > 0);
}
