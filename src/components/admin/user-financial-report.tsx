'use client';

import { format } from 'date-fns';
import { Printer, ReceiptText } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import type { Deal, Repayment } from '@/lib/types';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type ReportUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role: string;
  accessRole?: string;
  personas?: string[];
};

type ReportTransaction = {
  id: string;
  type: string;
  amount: number;
  createdAt?: Timestamp;
  dealName?: string;
  transactionReference?: string;
  reference?: string;
};

type ReportFundBatch = {
  id: string;
  amount: number;
  remainingAmount: number;
  createdAt?: Timestamp;
  tenureValue: number;
  tenureUnit: string;
  specialInvestment?: boolean;
};

const money = (value: number) => new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

function date(value?: Timestamp) {
  if (!value?.toDate) return 'Not recorded';
  return format(value.toDate(), 'dd MMM yyyy, HH:mm');
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-300 bg-slate-50 p-2.5"><p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-[11px] font-bold text-slate-950">{value}</p></div>;
}

export function UserFinancialReport({
  user,
  transactions,
  fundBatches,
  deals,
  repayments,
  portfolioValue,
  investibleBalance,
}: {
  user: ReportUser;
  transactions: ReportTransaction[];
  fundBatches: ReportFundBatch[];
  deals: Deal[];
  repayments: Repayment[];
  portfolioValue: number;
  investibleBalance: number;
}) {
  const approvedRepayments = repayments.filter((repayment) => repayment.status === 'Approved');
  const totalInflows = transactions.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const totalOutflows = transactions.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const totalPrincipal = deals.reduce((sum, deal) => sum + deal.principal, 0);
  const totalRepaid = approvedRepayments.reduce((sum, repayment) => sum + repayment.amount, 0);
  const dealRows = deals.map((deal) => {
    const scheduled = generateAmortizationSchedule(deal).reduce((sum, installment) => sum + installment.payment, 0);
    const paid = approvedRepayments.filter((repayment) => repayment.dealId === deal.id).reduce((sum, repayment) => sum + repayment.amount, 0);
    return { deal, scheduled, paid, outstanding: Math.max(0, scheduled - paid) };
  });
  const totalOutstanding = dealRows.reduce((sum, row) => sum + row.outstanding, 0);
  const categoryRows = Object.entries(transactions.reduce<Record<string, { count: number; amount: number }>>((groups, entry) => {
    const current = groups[entry.type] || { count: 0, amount: 0 };
    groups[entry.type] = { count: current.count + 1, amount: current.amount + entry.amount };
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  const sortedTransactions = [...transactions].sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0));
  const personas = user.personas?.length ? user.personas.join(', ') : user.role;

  return <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline"><ReceiptText className="mr-2 h-4 w-4" /> Financial Report</Button>
    </DialogTrigger>
    <DialogContent className="financial-report-dialog max-h-[94vh] max-w-6xl overflow-y-auto p-0">
      <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-4 border-b bg-background p-4 print:hidden">
        <div>
          <DialogTitle>Financial Report</DialogTitle>
          <DialogDescription>All recorded financial activity for {user.name}.</DialogDescription>
        </div>
        <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print Report</Button>
      </DialogHeader>

      <article id="printable-agreement" className="financial-user-report bg-white p-6 text-[9px] leading-snug text-slate-950 sm:p-8">
        <header className="mb-4 flex items-center gap-4 border-b-2 border-[#075a3c] pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/NAL%20LOGO.jpg" alt="NAL General Merchant Ltd" className="h-14 w-16 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-lg font-bold text-[#075a3c]">NAL GENERAL MERCHANT LTD</h1>
            <p className="text-[8px] text-slate-600">Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Centre Road, Kano State</p>
            <p className="mt-1 font-bold tracking-[0.18em] text-slate-800">USER FINANCIAL REPORT</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/non-interest-institution.png" alt="Non-Interest Institution" className="h-12 w-20 object-contain" />
        </header>

        <section className="mb-4 grid grid-cols-2 gap-x-8 gap-y-2 rounded border border-slate-300 bg-slate-50 p-3">
          <div><span className="font-semibold text-slate-600">Account holder:</span> <strong>{user.name}</strong></div>
          <div><span className="font-semibold text-slate-600">Account ID:</span> <span className="font-mono">{user.id.toUpperCase()}</span></div>
          <div><span className="font-semibold text-slate-600">Email:</span> {user.email}</div>
          <div><span className="font-semibold text-slate-600">Phone:</span> {user.phoneNumber || 'Not provided'}</div>
          <div><span className="font-semibold text-slate-600">Account type:</span> {personas}</div>
          <div><span className="font-semibold text-slate-600">Generated:</span> {format(new Date(), 'dd MMM yyyy, HH:mm')}</div>
          <div><span className="font-semibold text-slate-600">Report period:</span> All recorded activity</div>
          <div><span className="font-semibold text-slate-600">Currency:</span> Nigerian Naira (NGN)</div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Ledger inflows" value={money(totalInflows)} />
          <Summary label="Ledger outflows" value={money(totalOutflows)} />
          <Summary label="Net ledger movement" value={money(totalInflows - totalOutflows)} />
          <Summary label="Portfolio value" value={money(portfolioValue)} />
          <Summary label="Investible balance" value={money(investibleBalance)} />
          <Summary label="Financed principal" value={money(totalPrincipal)} />
          <Summary label="Approved repayments" value={money(totalRepaid)} />
          <Summary label="Deal balance outstanding" value={money(totalOutstanding)} />
        </section>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold text-[#075a3c]">Ledger summary by transaction type</h2>
          <table className="financial-report-table w-full border-collapse">
            <thead><tr><th>Transaction type</th><th className="w-24">Entries</th><th className="w-40 text-right">Net amount</th></tr></thead>
            <tbody>{categoryRows.length ? categoryRows.map(([type, summary]) => <tr key={type}><td>{type}</td><td>{summary.count}</td><td className="text-right font-semibold">{money(summary.amount)}</td></tr>) : <tr><td colSpan={3} className="py-5 text-center text-slate-500">No ledger transactions recorded.</td></tr>}</tbody>
          </table>
        </section>

        {dealRows.length > 0 && <section className="mb-5 break-before-auto">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold text-[#075a3c]">Client financing position</h2>
          <table className="financial-report-table w-full border-collapse">
            <thead><tr><th>Deal</th><th>Mode</th><th>Status</th><th className="text-right">Principal</th><th className="text-right">Required repayment</th><th className="text-right">Approved paid</th><th className="text-right">Outstanding</th></tr></thead>
            <tbody>{dealRows.map(({ deal, scheduled, paid, outstanding }) => <tr key={deal.id}><td><strong>{deal.dealName}</strong><br /><span className="font-mono text-[7px] text-slate-500">{deal.id.toUpperCase()}</span></td><td>{deal.financingMode || 'N/A'}</td><td><Badge variant="outline" className="text-[7px]">{deal.status}</Badge></td><td className="text-right">{money(deal.principal)}</td><td className="text-right">{money(scheduled)}</td><td className="text-right">{money(paid)}</td><td className="text-right font-semibold">{money(outstanding)}</td></tr>)}</tbody>
          </table>
        </section>}

        {fundBatches.length > 0 && <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold text-[#075a3c]">Investor fund batches</h2>
          <table className="financial-report-table w-full border-collapse">
            <thead><tr><th>Date</th><th>Batch reference</th><th>Tenure</th><th>Priority</th><th className="text-right">Original amount</th><th className="text-right">Available balance</th></tr></thead>
            <tbody>{fundBatches.map((batch) => <tr key={batch.id}><td>{date(batch.createdAt)}</td><td className="font-mono text-[7px]">{batch.id.toUpperCase()}</td><td>{batch.tenureValue} {batch.tenureUnit}</td><td>{batch.specialInvestment ? 'Special' : 'Standard'}</td><td className="text-right">{money(batch.amount)}</td><td className="text-right font-semibold">{money(batch.remainingAmount)}</td></tr>)}</tbody>
          </table>
        </section>}

        <section>
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold text-[#075a3c]">Complete transaction history</h2>
          <table className="financial-report-table w-full border-collapse">
            <thead><tr><th className="w-28">Date</th><th>Type</th><th>Deal / description</th><th>Reference</th><th className="w-36 text-right">Amount</th></tr></thead>
            <tbody>{sortedTransactions.length ? sortedTransactions.map((entry) => <tr key={entry.id}><td>{date(entry.createdAt)}</td><td>{entry.type}</td><td>{entry.dealName || '—'}</td><td className="font-mono text-[7px]">{entry.transactionReference || entry.reference || entry.id.toUpperCase()}</td><td className={`text-right font-semibold ${entry.amount < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{money(entry.amount)}</td></tr>) : <tr><td colSpan={5} className="py-5 text-center text-slate-500">No transactions recorded for this account.</td></tr>}</tbody>
          </table>
        </section>

        <footer className="mt-5 flex items-end justify-between gap-8 border-t border-slate-300 pt-2 text-[7px] text-slate-500">
          <p>This system-generated report reflects records available to NAL General Merchant Ltd at the generation time. Approved repayments are used for deal payment totals; pending or rejected lodgements do not reduce outstanding balances.</p>
          <p className="shrink-0 font-mono">User ref: {user.id.toUpperCase()}</p>
        </footer>
      </article>
    </DialogContent>
  </Dialog>;
}
