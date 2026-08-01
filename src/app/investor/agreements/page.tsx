'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, FileCheck2, FileSignature, Landmark, UserRoundCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/firebase';
import { listInvestorAgreementsAction } from './actions';
import {
  formatAgreementCurrency,
  formatAgreementDate,
  type MudarabaAgreementModel,
} from '@/lib/agreements/mudaraba';

export default function InvestorAgreementsPage() {
  const auth = useAuth();
  const [agreements, setAgreements] = useState<MudarabaAgreementModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser) return;
      setLoading(true);
      const result = await listInvestorAgreementsAction({ authToken: await auth.currentUser.getIdToken() });
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
      <PageHeader
        title="My Agreements"
        description="Review, download, and print the agreement for each approved investment fund batch."
        icon={FileSignature}
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Agreements unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-72 rounded-xl" />)}
        </div>
      ) : agreements.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileCheck2 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No investment agreements yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">An agreement will appear after an investment deposit is approved.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {agreements.map((agreement) => (
            <Card key={agreement.batchId} className="overflow-hidden border-primary/15 shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-primary via-emerald-500 to-lime-400" />
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Mudaraba Investment Agreement</CardTitle>
                    <CardDescription className="mt-1 font-mono text-xs">{agreement.agreementId}</CardDescription>
                  </div>
                  <Badge variant={agreement.missingFields.length ? 'secondary' : 'default'}>
                    {agreement.missingFields.length ? 'Details needed' : 'Ready'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-primary/5 p-4">
                  <div className="text-2xl font-bold text-primary">{formatAgreementCurrency(agreement.amount)}</div>
                  <p className="text-sm text-muted-foreground">{agreement.termLabel}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /> Dated {formatAgreementDate(agreement.agreementDate)}</div>
                  <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-muted-foreground" /> Matures {formatAgreementDate(agreement.maturityDate)}</div>
                  <div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-muted-foreground" /> {agreement.investor.name || 'Investor profile incomplete'}</div>
                </div>
                {agreement.missingFields.length > 0 && (
                  <Alert>
                    <AlertDescription className="text-xs">
                      Complete in Settings: {agreement.missingFields.join(', ')}.
                    </AlertDescription>
                  </Alert>
                )}
                <Button asChild className="w-full">
                  <Link href={`/investor/agreements/${agreement.batchId}`}>
                    <FileSignature className="mr-2 h-4 w-4" /> Open Agreement
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
