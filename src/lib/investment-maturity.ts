/** Match the existing historical-import convention: capital stays committed through the recorded maturity day in Nigeria. */
export function recordedInvestmentCapitalLock(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) throw new Error('The executed investment contract has no valid maturity date.');
  const day = value.slice(0, 10);
  const parsed = new Date(value);
  const dateOnly = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(dateOnly.getTime()) || dateOnly.toISOString().slice(0, 10) !== day) throw new Error('The executed investment contract has no valid maturity date.');
  return new Date(new Date(`${day}T00:00:00+01:00`).getTime() + 86_400_000);
}
