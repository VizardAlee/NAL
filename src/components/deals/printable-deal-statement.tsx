'use client';

import { addYears, differenceInDays, format } from 'date-fns';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { buildRepaymentStatementRows } from '@/lib/repayment-statement';
import type { Deal, Repayment } from '@/lib/types';

type ClientStatementProfile = {
  address?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
};

const money = (value: number) => new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
}).format(value);

function Field({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[132px_1fr] gap-2"><dt className="font-semibold text-slate-700">{label}</dt><dd className="font-medium text-slate-950">{value}</dd></div>;
}

export function PrintableDealStatement({
  deal,
  repayments,
  clientProfile,
}: {
  deal: Deal;
  repayments: Repayment[] | null;
  clientProfile?: ClientStatementProfile | null;
}) {
  const schedule = generateAmortizationSchedule(deal);
  const statementRows = buildRepaymentStatementRows(schedule, repayments);
  const startDate = deal.startDate?.toDate() || deal.createdAt?.toDate();
  const totalProfit = schedule.reduce((sum, installment) => sum + installment.interest, 0);
  const totalRepayment = schedule.reduce((sum, installment) => sum + installment.payment, 0);
  const paymentValues = schedule.map((installment) => installment.payment);
  const minimumPayment = paymentValues.length ? Math.min(...paymentValues) : 0;
  const maximumPayment = paymentValues.length ? Math.max(...paymentValues) : 0;
  const periodicInstallment = Math.abs(maximumPayment - minimumPayment) < 0.01
    ? money(maximumPayment)
    : `${money(minimumPayment)} – ${money(maximumPayment)}`;
  const finalDueDate = schedule.at(-1)?.dueDate;
  const tenorDays = startDate && finalDueDate ? differenceInDays(finalDueDate, startDate) : 0;
  const installmentsInFirstYear = startDate
    ? schedule.filter((installment) => installment.dueDate <= addYears(startDate, 1)).length
    : 0;

  return (
    <article id="printable-agreement" className="deal-print-statement bg-white text-[10px] leading-tight text-slate-950">
      <header className="mb-4 flex items-center gap-4 border-b-2 border-[#075a3c] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/NAL%20LOGO.jpg" alt="NAL General Merchant Ltd" className="h-14 w-16 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-lg font-bold text-[#075a3c]">NAL GENERAL MERCHANT LTD</h1>
          <p className="text-[9px] text-slate-600">Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Centre Road, Kano State</p>
          <p className="mt-1 font-semibold tracking-wide text-slate-800">DEAL DETAILS AND REPAYMENT SCHEDULE</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/non-interest-institution.png" alt="Non-Interest Institution" className="h-12 w-20 object-contain" />
      </header>

      <section className="mb-4 rounded border border-slate-400 bg-slate-50 p-3">
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-slate-300 pb-2">
          <div><p className="text-[9px] uppercase tracking-wider text-slate-500">Client</p><p className="text-sm font-bold">{deal.clientName}</p>{clientProfile?.address && <p className="mt-0.5 max-w-[500px] text-[9px] text-slate-600">{clientProfile.address}</p>}</div>
          <div className="text-right"><p className="text-[9px] uppercase tracking-wider text-slate-500">Deal reference</p><p className="font-mono font-semibold">{deal.id.toUpperCase()}</p><p className="mt-1 text-[9px] text-slate-500">Printed {format(new Date(), 'dd MMM yyyy, HH:mm')}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-1.5">
          <dl className="space-y-1.5">
            <Field label="Facility Type" value={deal.financingMode || 'Not specified'} />
            <Field label="Approved Amount" value={money(deal.principal)} />
            <Field label="Disbursement Date" value={startDate ? format(startDate, 'dd MMMM yyyy') : 'Not recorded'} />
            <Field label="Profit Rate" value={`${deal.profitRate || 0}%`} />
            <Field label="Tenor" value={`${deal.durationValue} ${deal.durationUnit}${tenorDays ? ` (${tenorDays} days)` : ''}`} />
            <Field label="No. of Repayments" value={String(schedule.length)} />
            <Field label="Repayment Frequency" value={deal.repaymentFrequency} />
            <Field label="Repayments in Year 1" value={String(installmentsInFirstYear)} />
          </dl>
          <dl className="space-y-1.5">
            <Field label="Bank" value={clientProfile?.bankName || 'Not provided'} />
            <Field label="Account Name" value={clientProfile?.bankAccountName || deal.clientName} />
            <Field label="Account Number" value={clientProfile?.bankAccountNumber || 'Not provided'} />
            <Field label="Management Fee" value={money(deal.managementFeeAmount || 0)} />
            <Field label="Total Profit" value={money(totalProfit)} />
            <Field label="Total Repayment" value={money(totalRepayment)} />
            <Field label="Periodic Installment" value={periodicInstallment} />
            <Field label="Deal Status" value={deal.status} />
          </dl>
        </div>
      </section>

      {schedule.length > 0 ? <table className="deal-print-table w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[5%]">S/N</th>
            <th className="w-[13%]">Installment Date</th>
            <th className="w-[16%]">Opening Balance</th>
            <th className="w-[14%]">Profit Payment</th>
            <th className="w-[15%]">Principal Repayment</th>
            <th className="w-[15%]">Periodic Installment</th>
            <th className="w-[15%]">Closing Balance</th>
            <th className="w-[10%]">Status</th>
          </tr>
        </thead>
        <tbody>{statementRows.map((installment) => {
          return <tr key={installment.installment}>
            <td>{installment.installment}</td>
            <td>{format(installment.dueDate, 'dd/MM/yyyy')}</td>
            <td>{money(installment.openingBalance)}</td>
            <td>{money(installment.interest)}</td>
            <td>{money(installment.principal)}</td>
            <td className="font-semibold">{money(installment.payment)}</td>
            <td>{money(installment.closingBalance)}</td>
            <td className={installment.status === 'Paid' ? 'font-semibold text-emerald-800' : installment.status === 'Due' ? 'font-semibold text-red-700' : ''}>{installment.status}</td>
          </tr>;
        })}</tbody>
      </table> : <div className="rounded border border-dashed p-8 text-center text-slate-600">The repayment schedule will be available after the deal start date is recorded.</div>}

      <footer className="mt-4 flex justify-between border-t border-slate-300 pt-2 text-[8px] text-slate-500">
        <span>This is a system-generated deal statement from NAL General Merchant Ltd.</span>
        <span>Deal reference: {deal.id.toUpperCase()}</span>
      </footer>
    </article>
  );
}
