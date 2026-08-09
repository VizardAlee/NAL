type DashboardDeal = {
  status?: string;
  createdAt?: unknown;
};

function createdAtMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const millis = Number(toMillis.call(value));
      return Number.isFinite(millis) ? millis : 0;
    }
  }
  return 0;
}

export function selectClientDashboardDeal<T extends DashboardDeal>(deals: T[] | null | undefined): T | undefined {
  if (!deals?.length) return undefined;

  const newestFirst = [...deals].sort(
    (left, right) => createdAtMillis(right.createdAt) - createdAtMillis(left.createdAt)
  );

  return newestFirst.find((deal) => deal.status === 'Active') ?? newestFirst[0];
}
