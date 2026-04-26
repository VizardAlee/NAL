import { redirect } from 'next/navigation';

export default function LegacyTerminationsPage() {
  redirect('/admin/approvals/terminations');
}
