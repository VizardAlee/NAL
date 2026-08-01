'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck2, FileWarning, ScrollText } from 'lucide-react';
import { useAuth } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatAgreementCurrency, formatAgreementDate } from '@/lib/agreements/mudaraba';
import type { WakalahAgreementModel } from '@/lib/agreements/wakalah';
import { listClientAgreementsAction } from './actions';

export default function ClientAgreementsPage() {
  const auth = useAuth();
  const [agreements, setAgreements] = useState<WakalahAgreementModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser) return;
      const result = await listClientAgreementsAction({ authToken: await auth.currentUser.getIdToken() });
      if (cancelled) return;
      if (result.success) setAgreements(result.agreements);
      else setError(result.message);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [auth]);

  return (
    <div>
      <PageHeader title="My Agreements" description="View procurement authorities granted by NAL for your Murabaha deals." icon={ScrollText} />
      {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div> : error ? (
        <Alert variant="destructive"><FileWarning className="h-4 w-4" /><AlertTitle>Agreements unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : agreements.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-12 text-center"><ScrollText className="mx-auto h-12 w-12 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">No procurement authority granted</h2><p className="mt-1 text-sm text-muted-foreground">A Wakalah agreement will appear here only when an administrator grants you procurement rights for a Murabaha deal.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agreements.map((agreement) => (
            <Card key={agreement.dealId} className="flex flex-col">
              <CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{agreement.deal.name}</CardTitle><Badge>Granted</Badge></div><CardDescription className="font-mono text-xs">{agreement.agreementId}</CardDescription></CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Asset:</span> {agreement.deal.assetDescription}</p><p><span className="text-muted-foreground">Supplier:</span> {agreement.deal.supplierName}</p><p><span className="text-muted-foreground">Amount:</span> {formatAgreementCurrency(agreement.deal.principal)}</p><p><span className="text-muted-foreground">Granted:</span> {formatAgreementDate(agreement.agreementDate)}</p></div>
                {agreement.missingFields.length > 0 && <p className="text-xs text-amber-700">Complete {agreement.missingFields.join(', ')} before exporting.</p>}
                <Button asChild className="mt-auto"><Link href={`/client/agreements/${agreement.dealId}`}><FileCheck2 className="mr-2 h-4 w-4" /> View Agreement</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
