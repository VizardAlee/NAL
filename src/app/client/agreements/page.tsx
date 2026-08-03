'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck2, FileWarning, ScrollText, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatAgreementCurrency, formatAgreementDate } from '@/lib/agreements/mudaraba';
import type { WakalahAgreementModel } from '@/lib/agreements/wakalah';
import type { KafaalahBondModel } from '@/lib/agreements/kafaalah';
import type { MurabahaAgreementModel } from '@/lib/agreements/murabaha';
import { listClientAgreementsAction, listClientKafaalahBondsAction, listClientMurabahaAgreementsAction } from './actions';

export default function ClientAgreementsPage() {
  const auth = useAuth();
  const [wakalahAgreements, setWakalahAgreements] = useState<WakalahAgreementModel[]>([]);
  const [kafaalahBonds, setKafaalahBonds] = useState<KafaalahBondModel[]>([]);
  const [murabahaAgreements, setMurabahaAgreements] = useState<MurabahaAgreementModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser) return;
      const authToken = await auth.currentUser.getIdToken();
      const [wakalah, kafaalah, murabaha] = await Promise.all([
        listClientAgreementsAction({ authToken }),
        listClientKafaalahBondsAction({ authToken }),
        listClientMurabahaAgreementsAction({ authToken }),
      ]);
      if (cancelled) return;
      if (wakalah.success) setWakalahAgreements(wakalah.agreements); else setError(wakalah.message);
      if (kafaalah.success) setKafaalahBonds(kafaalah.bonds); else setError(kafaalah.message);
      if (murabaha.success) setMurabahaAgreements(murabaha.agreements); else setError(murabaha.message);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [auth]);

  return (
    <div>
      <PageHeader title="My Agreements" description="Your sales contracts, guarantee bonds and procurement authorities." icon={ScrollText} />
      {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div> : error ? (
        <Alert variant="destructive"><FileWarning className="h-4 w-4" /><AlertTitle>Agreements unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-4"><h2 className="flex items-center gap-2 text-xl font-semibold"><ShoppingCart className="h-5 w-5 text-primary" /> Murabaha Sales Contracts</h2><p className="text-sm text-muted-foreground">The disclosed cost-plus-sale agreement and complete repayment schedule for every Murabaha deal.</p></div>
            {murabahaAgreements.length === 0 ? <Card className="border-dashed"><CardContent className="p-10 text-center text-sm text-muted-foreground">No Murabaha sales contracts are available yet.</CardContent></Card> : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{murabahaAgreements.map((agreement) => (
                <Card key={agreement.dealId} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{agreement.deal.name}</CardTitle><Badge>Murabaha</Badge></div><CardDescription className="font-mono text-xs">{agreement.agreementId}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Assets:</span> {agreement.deal.assetDescription}</p><p><span className="text-muted-foreground">Cost price:</span> {formatAgreementCurrency(agreement.deal.costPrice)}</p><p><span className="text-muted-foreground">Contract price:</span> {formatAgreementCurrency(agreement.deal.contractPrice)}</p><p><span className="text-muted-foreground">Date:</span> {formatAgreementDate(agreement.agreementDate)}</p></div>{agreement.missingFields.length > 0 && <p className="text-xs text-amber-700">Complete before signing: {agreement.missingFields.join(', ')}.</p>}<Button asChild className="mt-auto"><Link href={`/client/agreements/murabaha/${agreement.dealId}`}><ShoppingCart className="mr-2 h-4 w-4" /> View Contract</Link></Button></CardContent></Card>
              ))}</div>
            )}
          </section>

          <section>
            <div className="mb-4"><h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Kafaalah Guarantee Bonds</h2><p className="text-sm text-muted-foreground">Every deal requires a guarantor and a corresponding guarantee and indemnity bond.</p></div>
            {kafaalahBonds.length === 0 ? <Card className="border-dashed"><CardContent className="p-10 text-center text-sm text-muted-foreground">Your Kafaalah bonds will appear when a deal is created.</CardContent></Card> : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{kafaalahBonds.map((bond) => (
                <Card key={bond.dealId} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{bond.deal.name}</CardTitle><Badge variant="secondary">Required</Badge></div><CardDescription className="font-mono text-xs">{bond.bondId}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Guarantor:</span> {bond.guarantor.name || 'Not completed'}</p><p><span className="text-muted-foreground">Mode:</span> {bond.deal.financingMode}</p><p><span className="text-muted-foreground">Contract amount:</span> {formatAgreementCurrency(bond.deal.principal)}</p><p><span className="text-muted-foreground">Date:</span> {formatAgreementDate(bond.bondDate)}</p></div>{bond.missingFields.length > 0 && <p className="text-xs text-amber-700">Admin must complete: {bond.missingFields.join(', ')}.</p>}<Button asChild className="mt-auto"><Link href={`/client/agreements/kafaalah/${bond.dealId}`}><ShieldCheck className="mr-2 h-4 w-4" /> View Bond</Link></Button></CardContent></Card>
              ))}</div>
            )}
          </section>

          <section>
            <div className="mb-4"><h2 className="flex items-center gap-2 text-xl font-semibold"><FileCheck2 className="h-5 w-5 text-primary" /> Wakalah Procurement Agreements</h2><p className="text-sm text-muted-foreground">Shown only where NAL grants procurement authority for a Murabaha deal.</p></div>
            {wakalahAgreements.length === 0 ? <Card className="border-dashed"><CardContent className="p-10 text-center text-sm text-muted-foreground">No optional procurement authority has been granted.</CardContent></Card> : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{wakalahAgreements.map((agreement) => (
                <Card key={agreement.dealId} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{agreement.deal.name}</CardTitle><Badge>Granted</Badge></div><CardDescription className="font-mono text-xs">{agreement.agreementId}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col gap-4"><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Asset:</span> {agreement.deal.assetDescription}</p><p><span className="text-muted-foreground">Supplier:</span> {agreement.deal.supplierName}</p><p><span className="text-muted-foreground">Amount:</span> {formatAgreementCurrency(agreement.deal.principal)}</p></div><Button asChild className="mt-auto"><Link href={`/client/agreements/${agreement.dealId}`}><FileCheck2 className="mr-2 h-4 w-4" /> View Agreement</Link></Button></CardContent></Card>
              ))}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
