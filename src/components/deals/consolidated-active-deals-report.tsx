'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, CircleCheckBig, Layers3, TriangleAlert, WalletCards } from 'lucide-react';
import { buildClientConsolidatedReport } from '@/lib/client-consolidated-report';
import type { Deal, Repayment } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function ConsolidatedActiveDealsReport({
  deals,
  repayments,
  locale,
}: {
  deals: Deal[];
  repayments: Repayment[];
  locale: string;
}) {
  const report = useMemo(
    () => buildClientConsolidatedReport(deals, repayments),
    [deals, repayments]
  );
  if (report.activeDealCount < 2) return null;

  const money = (value: number) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(value);
  const date = (value: Date) => new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-primary" />
              <Badge variant="secondary">{report.activeDealCount} active deals</Badge>
            </div>
            <CardTitle className="font-headline text-2xl">Consolidated repayment report</CardTitle>
            <CardDescription className="mt-1">
              One combined financial position, with each ongoing deal kept separately traceable.
            </CardDescription>
          </div>
          <div className="min-w-32 rounded-xl border bg-background/80 px-4 py-3 text-center shadow-sm">
            <p className="text-2xl font-bold tabular-nums">{report.progressPercent.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">overall confirmed</p>
          </div>
        </div>
        <Progress value={report.progressPercent} className="mt-4 h-3 bg-red-100 [&>div]:bg-emerald-500 dark:bg-red-950" />
      </CardHeader>

      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Combined contract value" value={money(report.totalScheduled)} icon={<WalletCards className="h-4 w-4" />} />
          <Summary label="Confirmed repayments" value={money(report.confirmed)} icon={<CircleCheckBig className="h-4 w-4" />} tone="green" />
          <Summary label="Awaiting approval" value={money(report.pending)} icon={<CalendarClock className="h-4 w-4" />} tone="amber" />
          <Summary label="Outstanding balance" value={money(report.outstanding)} icon={<TriangleAlert className="h-4 w-4" />} tone="red" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overdue exposure</p>
            <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{money(report.overdueAmount)}</p>
            <p className="text-xs text-muted-foreground">{report.overdueInstallments} uncovered installment(s)</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next payment across all deals</p>
            {report.nextPayment ? (
              <>
                <p className="mt-1 text-xl font-bold">{money(report.nextPayment.amount)}</p>
                <p className="text-xs text-muted-foreground">{report.nextPayment.dealName} · {date(report.nextPayment.dueDate)}</p>
              </>
            ) : (
              <p className="mt-1 text-sm font-medium">No upcoming uncovered installment</p>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Deal-by-deal position</h3>
            <Button asChild variant="ghost" size="sm">
              <Link href="/client/deals">View all deals <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="space-y-3">
            {report.deals.map((deal) => (
              <div key={deal.dealId} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{deal.dealName}</p>
                      <Badge variant="outline">{deal.repaymentFrequency}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confirmed {money(deal.confirmed)} · Pending {money(deal.pending)} · Outstanding {money(deal.outstanding)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-28 text-right">
                      <p className="font-bold tabular-nums">{deal.progressPercent.toFixed(1)}%</p>
                      <Progress value={deal.progressPercent} className="mt-1 h-2 bg-red-100 [&>div]:bg-emerald-500 dark:bg-red-950" />
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/client/deals/${deal.dealId}`}>
                        View schedule <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Summary({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red';
}) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-75">{icon}{label}</div>
      <p className="mt-2 truncate text-lg font-bold tabular-nums" title={value}>{value}</p>
    </div>
  );
}
