'use client';

import { useMemo, type ReactNode } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flag,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { generateAmortizationSchedule } from '@/lib/amortization';
import {
  calculateRepaymentProgress,
  type RepaymentCheckpoint,
} from '@/lib/repayment-progress';
import type { Deal, Repayment } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amount);

function ProgressRing({ value }: { value: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div
      className="relative grid h-32 w-32 shrink-0 place-items-center"
      role="progressbar"
      aria-label="Confirmed repayment progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div className="absolute inset-5 rounded-full bg-emerald-400/20 blur-2xl" />
      <svg viewBox="0 0 112 112" className="relative h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-red-200 dark:text-red-950"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-emerald-500 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-headline text-2xl font-bold tracking-tight tabular-nums">
          {value.toFixed(1)}%
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          complete
        </span>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'green' | 'red' | 'neutral' | 'amber';
}) {
  const toneClasses = {
    green: 'border-emerald-200/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    red: 'border-red-200/70 bg-red-50/80 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    neutral: 'border-slate-200/70 bg-white/70 text-slate-800 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100',
    amber: 'border-amber-200/70 bg-amber-50/80 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  };

  return (
    <div className={`rounded-2xl border p-3 shadow-sm backdrop-blur ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-current/10">{icon}</span>
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-bold tracking-tight tabular-nums sm:text-base" title={value}>
        {value}
      </p>
    </div>
  );
}

function CheckpointCard({
  checkpoint,
  index,
  total,
}: {
  checkpoint: RepaymentCheckpoint;
  index: number;
  total: number;
}) {
  const isComplete = checkpoint.progressPercent >= 100;
  const hasProgress = checkpoint.progressPercent > 0;
  const checkpointStatus = isComplete
    ? 'Completed'
    : checkpoint.pending > 0
      ? 'Awaiting approval'
      : hasProgress
        ? 'In progress'
        : 'Upcoming';

  return (
    <article className="group w-[17rem] shrink-0 snap-start">
      <div className="relative mb-3 h-8">
        <div className="absolute left-0 right-0 top-3 h-1.5 overflow-hidden bg-red-200 dark:bg-red-950">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-[width] duration-700 ease-out"
            style={{ width: `${checkpoint.progressPercent}%` }}
          />
          {checkpoint.minorCheckpoints.map((minor) => (
            <span
              key={minor.key}
              className="absolute inset-y-0 w-px bg-white/90 dark:bg-slate-950/90"
              style={{ left: `${minor.positionPercent}%` }}
              title={minor.label}
              aria-label={minor.label}
            />
          ))}
        </div>
        <div
          className={`absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-full border-4 border-background shadow-md transition-transform group-hover:scale-110 ${
            isComplete
              ? 'bg-emerald-500 text-white'
              : hasProgress
                ? 'bg-white text-emerald-600 ring-2 ring-emerald-400 dark:bg-slate-950'
                : 'bg-red-500 text-white'
          }`}
        >
          {isComplete ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : (
            <span className="text-[10px] font-bold">{index + 1}</span>
          )}
        </div>
      </div>

      <div className="h-[13.5rem] rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur-md transition-all duration-300 group-hover:-translate-y-1 group-hover:border-emerald-300 group-hover:shadow-[0_18px_40px_-18px_rgba(16,185,129,0.35)] dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Checkpoint {index + 1} of {total}
            </p>
            <h4 className="mt-1 font-headline text-base font-bold">{checkpoint.label}</h4>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
              isComplete
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : checkpoint.pending > 0
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            }`}
          >
            {checkpointStatus}
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Confirmed this period</span>
            <span className="text-sm font-bold tabular-nums">{checkpoint.progressPercent.toFixed(0)}%</span>
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-red-200 to-red-100 dark:from-red-950 dark:to-red-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-[width] duration-700"
              style={{ width: `${checkpoint.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-dashed pt-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Confirmed</span>
            <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
              {formatCurrency(checkpoint.approved)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Period target</span>
            <span className="font-semibold tabular-nums">{formatCurrency(checkpoint.scheduled)}</span>
          </div>
          {checkpoint.pending > 0 ? (
            <div className="flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300">
              <span>Pending approval</span>
              <span className="font-semibold tabular-nums">{formatCurrency(checkpoint.pending)}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Outstanding</span>
              <span className="font-semibold text-red-700 tabular-nums dark:text-red-300">
                {formatCurrency(checkpoint.remaining)}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
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
    return <Skeleton className="h-[32rem] w-full rounded-3xl" />;
  }

  if (progress.checkpoints.length === 0) {
    return null;
  }

  const completed = progress.progressPercent >= 100;
  const nextCheckpoint = progress.checkpoints.find(
    (checkpoint) => checkpoint.progressPercent < 100
  );

  return (
    <Card className="relative overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-slate-50 via-white to-emerald-50/80 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/70 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/30 dark:ring-slate-800">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-700/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-red-200/20 blur-3xl dark:bg-red-900/10" />

      <CardHeader className="relative space-y-6 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 shadow-sm backdrop-blur dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Repayment journey
            </div>
            <h3 className="mt-3 font-headline text-2xl font-bold tracking-tight sm:text-3xl">
              Every payment moves you closer.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Confirmed repayments transform the journey from red to green. Your main checkpoints are{' '}
              <span className="font-semibold text-foreground">{progress.majorUnitLabel}s</span>, with{' '}
              <span className="font-semibold text-foreground">{progress.minorUnitLabel}</span> markers along the way.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:bg-slate-950/60">
              {completed ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Repayment journey completed
                  </span>
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">Next checkpoint</span>
                  <span className="font-semibold">{nextCheckpoint?.label || 'Final settlement'}</span>
                </>
              )}
            </div>
          </div>
          <ProgressRing value={progress.progressPercent} />
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="Confirmed"
            value={formatCurrency(progress.totalApproved)}
            tone="green"
          />
          <SummaryTile
            icon={<Target className="h-4 w-4" />}
            label="Outstanding"
            value={formatCurrency(progress.totalRemaining)}
            tone="red"
          />
          <SummaryTile
            icon={<WalletCards className="h-4 w-4" />}
            label="Total target"
            value={formatCurrency(progress.totalScheduled)}
            tone="neutral"
          />
          <SummaryTile
            icon={<Clock3 className="h-4 w-4" />}
            label="Awaiting approval"
            value={formatCurrency(progress.totalPending)}
            tone="amber"
          />
        </div>
      </CardHeader>

      <CardContent className="relative border-t border-slate-200/70 bg-white/40 p-5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/20 sm:p-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-emerald-600" />
              <h4 className="font-headline text-lg font-bold">Milestone timeline</h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Scroll through each checkpoint to see confirmed, pending, and outstanding values.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border bg-white/70 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-sm dark:bg-slate-950/60">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Confirmed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Outstanding
            </span>
          </div>
        </div>

        <div className="-mx-1 snap-x snap-proximity overflow-x-auto px-1 pb-4">
          <div className="flex min-w-max gap-3 pr-3">
            {progress.checkpoints.map((checkpoint, index) => (
              <CheckpointCard
                key={checkpoint.key}
                checkpoint={checkpoint}
                index={index}
                total={progress.checkpoints.length}
              />
            ))}
          </div>
        </div>

        <div className="mt-1 flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground dark:border-slate-800 dark:bg-slate-950/50">
          <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            Checkpoint totals include principal and profit. Only administrator-approved repayments advance the green progress; lodged payments remain under awaiting approval.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
