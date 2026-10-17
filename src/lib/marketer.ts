// Referral-code signup and sharing are paused. Stored codes remain read-only
// attribution keys for historical reporting; never invent a code or rating.
export function historicalReferralCode(profile: { referralCode?: unknown } | null | undefined): string | null {
  const code = profile?.referralCode;
  return typeof code === 'string' && code.trim() ? code : null;
}

export type MarketerStats = {
  referredClientCount: number | null;
  referredInvestorCount: number | null;
  totalInvestorCapital: number | null;
  totalDealValue: number;
  referredClients: string[] | null;
  referredInvestors: string[] | null;
  deals: { dealName: string; clientName: string; status: string; principal: number }[];
};
