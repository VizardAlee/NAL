'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { generateAmortizationSchedule } from '@/lib/amortization';
import {
  calculateRepaymentProgress,
  type RepaymentCheckpoint,
} from '@/lib/repayment-progress';
import type { Deal, Repayment } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amount);

function CheckpointSegment({ checkpoint }: { checkpoint: RepaymentCheckpoint }) {
  const isComplete = checkpoint.progressPercent >= 100;

  return (
    <div className="w-44 shrink-0 first:[&_.gauge-segment]:rounded-l-full last:[&_.gauge-segment]:rounded-r-full">
      <div className="gauge-segment relative h-5 overflow-hidden border-r border-background/80 bg-red-500 last:border-r-0">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${checkpoint.progressPercent}%` }}
        />
        {checkpoint.minorCheckpoints.map((minor) => (
          <span
            key={minor.key}
            className="absolute inset-y-0 w-px bg-background/80"
            style={{ left: `${minor.positionPercent}%` }}
            title={minor.label}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="border-r px-2 pt-2 last:border-r-0">
        <div className="flex items-center gap-1.5">
          {isComplete && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          <p className="truncate text-xs font-semibold">{checkpoint.label}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatCurrency(checkpoint.approved)} / {formatCurrency(checkpoint.scheduled)}
        </p>
        {checkpoint.pending > 0 && (
          <p className="mt-0.5 text-[11px] text-amber-700">
            {formatCurrency(checkpoint.pending)} awaiting approval
          </p>
        )}
      </div>
    </div>
  );
}

export function RepaymentMilestoneGauge({
  deal,
  repayments,
  loading,
}: {
  deal: Deal;
  repayments: Repayment[] | null;
  loading: boolean;
}) {
  const progress = useMemo(() => {
    const schedule = generateAmortizationSchedule(deal);
    return calculateRepaymentProgress(
      deal.repaymentFrequency,
      schedule,
      repayments || []
    );
  }, [deal, repayments]);

  if (loading) {
    return <Skeleton className="h-44 w-full" />;
  }

  if (progress.checkpoints.length === 0) {
    return null;
  }

  const completed = progress.progressPercent >= 100;

  return (
    <Card className="overflow-hidden border-muted-foreground/20">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Repayment Milestones</CardTitle>
            <CardDescription>
              Major checkpoints are {progress.majorUnitLabel}s; smaller marks represent {progress.minorUnitLabel}s.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${completed ? 'text-emerald-600' : ''}`}>
              {progress.progressPercent.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">confirmed repaid</p>
          </div>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-red-500"
          role="progressbar"
          aria-label="Confirmed repayment progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.progressPercent)}
        >
          <div
            className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Confirmed</p>
            <p className="font-semibold text-emerald-700">{formatCurrency(progress.totalApproved)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Remaining</p>
            <p className="font-semibold text-red-700">{formatCurrency(progress.totalRemaining)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total repayment</p>
            <p className="font-semibold">{formatCurrency(progress.totalScheduled)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-muted-foreground">
              <Clock3 className="h-3 w-3" /> Awaiting approval
            </p>
            <p className="font-semibold text-amber-700">{formatCurrency(progress.totalPending)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max">
            {progress.checkpoints.map((checkpoint) => (
              <CheckpointSegment key={checkpoint.key} checkpoint={checkpoint} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Outstanding
          </span>
          <span>Checkpoint values show confirmed / scheduled payment for that period.</span>
        </div>
      </CardContent>
    </Card>
  );
}
