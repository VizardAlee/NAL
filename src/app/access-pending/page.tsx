import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AccessPendingPage() {
  return <main id="main-content" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6">
    <h1 className="font-headline text-3xl font-semibold">Account access pending</h1>
    <p>Your account has no assigned workspace. Contact a NAL administrator to review your invitation and access.</p>
    <p>Requests and financial records are unavailable until the appropriate access is assigned.</p>
    <div className="flex flex-wrap gap-3"><Button asChild><Link href="/help">Get help</Link></Button><Button asChild variant="outline"><Link href="/login">Return to login</Link></Button></div>
  </main>;
}
