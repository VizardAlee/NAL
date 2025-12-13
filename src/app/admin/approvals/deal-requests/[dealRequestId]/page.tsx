
'use client';

import { useParams, notFound } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FilePlus, FileText, Download } from 'lucide-react';
import { ViewPageNav } from '@/components/view-page-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { DealRequestForm } from './deal-request-form';

type DealRequest = {
  id: string;
  clientId: string;
  clientName: string;
  dealName: string;
  principal: number;
  profitRate: number;
  durationValue: number;
  durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  repaymentType: 'Equal Installments' | 'Balloon Payment';
  repaymentFrequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly';
  proposalDetails?: string;
  proposalPdf?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
};

function DealRequestDetailSkeleton() {
    return (
        <div>
            <PageHeader title="Loading Request..." description="Please wait while we load the deal proposal." icon={FilePlus} />
             <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    <Skeleton className="h-96 w-full" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        </div>
    );
}

export default function DealRequestDetailPage() {
  const { dealRequestId } = useParams<{ dealRequestId: string }>();
  const firestore = useFirestore();

  const dealRequestRef = useMemo(() => {
    if (!firestore || !dealRequestId) return null;
    return doc(firestore, 'dealRequests', dealRequestId);
  }, [firestore, dealRequestId]);

  const { data: dealRequest, loading } = useDoc<DealRequest>(dealRequestRef as any);

  if (loading) {
    return <DealRequestDetailSkeleton />;
  }

  if (!dealRequest) {
    return notFound();
  }

  return (
    <div>
        <PageHeader title={dealRequest.dealName} description={`Request from ${dealRequest.clientName}`} icon={FilePlus}>
            <ViewPageNav homePath="/admin/approvals/deal-requests" />
        </PageHeader>
        <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
                <DealRequestForm dealRequest={dealRequest} />
            </div>
            {(dealRequest.proposalDetails || dealRequest.proposalPdf) && (
                <div className="space-y-6">
                    {dealRequest.proposalDetails && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/> Proposal Summary</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-64">
                                    <p className="whitespace-pre-wrap text-sm text-muted-foreground p-1">{dealRequest.proposalDetails}</p>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                     {dealRequest.proposalPdf && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5"/> Proposal Document</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <a href={dealRequest.proposalPdf} target="_blank" rel="noopener noreferrer" download={`${dealRequest.dealName}-proposal.pdf`} className="text-sm text-primary hover:underline">
                                    View or Download PDF
                                </a>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}
