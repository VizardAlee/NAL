

'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldAlert, Loader2, HandCoins, Gavel, Download, ScrollText } from "lucide-react";
import { useMemo, useTransition } from 'react';
import { useAuth, useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal, Repayment } from '@/lib/types';
import { ClientRepaymentSchedule } from "../../dashboard/client-repayment-schedule";
import { RepaymentHistory } from "@/components/deals/repayment-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestTerminationAction } from "../../dashboard/actions";
import { notFound, useParams } from "next/navigation";
import { ViewPageNav } from "@/components/view-page-nav";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import Image from "next/image";
import Link from "next/link";
import { RepaymentPlanChangeDialog } from '@/components/deals/repayment-plan-change-dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type UserProfile = DocumentData & {
    id: string;
    legalDocumentUrl?: string;
};

const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
} as const;

function DealDetailSkeleton() {
    return (
        <div>
            <PageHeader title="Loading Deal..." description="Please wait while we fetch the details." icon={FileText} />
             <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-12 w-full" />
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                    <Skeleton className="h-40 w-full mt-4" />
                </CardContent>
            </Card>
        </div>
    )
}

export default function ClientDealDetailPage() {
    const { dealId } = useParams<{ dealId: string }>();
    const firestore = useFirestore();
    const auth = useAuth();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPendingTermination, startTransition] = useTransition();

    const dealRef = useMemo(() => {
        if (!firestore || !dealId) return null;
        return doc(firestore, 'deals', dealId);
    }, [firestore, dealId]);

    const userProfileRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);


    const { data: deal, loading: dealLoading } = useDoc<Deal>(dealRef as any);
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(userProfileRef);

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid), where('dealId', '==', dealId));
    }, [firestore, user, dealId]);

    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery as any);

    const lodgedRepayments = useMemo(() => {
        if (!repayments) return [];
        return repayments.filter(r => r.status === 'Pending' || r.status === 'Approved');
    }, [repayments]);

    const handleTerminationRequest = () => {
        const currentUser = auth?.currentUser;
        if (!user || !user.displayName || !deal || !currentUser) return;
        startTransition(async () => {
            const authToken = await currentUser.getIdToken();
            const result = await requestTerminationAction({
              authToken,
              dealId: deal.id,
              dealName: deal.dealName,
              clientId: user.uid,
              clientName: user.displayName!
            });
            if (result.success) {
                toast({
                    title: "Request Sent",
                    description: result.message
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Request Failed",
                    description: result.message
                });
            }
        });
    }

    if (dealLoading || profileLoading) {
        return <DealDetailSkeleton />;
    }

    if (!deal) {
        return notFound();
    }

    return (
        <div>
            <PageHeader title={deal.dealName} icon={FileText}>
                <ViewPageNav homePath="/client/dashboard" />
            </PageHeader>
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="flex flex-col md:col-span-2">
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <CardTitle className="font-headline text-xl">{deal.dealName}</CardTitle>
                            <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                        </div>
                        <CardDescription>{deal.clientName}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                            <span className="text-sm text-muted-foreground">Principal Amount</span>
                            <span className="font-bold">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}
                            </span>
                    </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Profit Rate</p>
                                <p className="font-medium">{deal.profitRate}%</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Duration</p>
                                <p className="font-medium">{deal.durationValue} {deal.durationUnit}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Repayment</p>
                                <p className="font-medium">Uniform Principal &amp; Profit</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Frequency</p>
                                <p className="font-medium">{deal.repaymentFrequency}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border text-sm">
                            <div className="flex items-center gap-2">
                                <HandCoins className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Management Fee</span>
                            </div>
                            <span className="font-medium">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.managementFeeAmount || 0)}
                                <span className="text-xs text-muted-foreground"> ({deal.managementFeeRate || 0}%)</span>
                            </span>
                        </div>
                        {deal.wakalahGranted && deal.financingMode === 'Murabaha' && (
                            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div><p className="font-semibold text-primary">Procurement Authority Granted</p><p className="text-sm text-muted-foreground">You may procure {deal.wakalahAssetDescription} from {deal.wakalahSupplierName} on behalf of NAL.</p></div>
                                    <Button asChild><Link href={`/client/agreements/${deal.id}`}><ScrollText className="mr-2 h-4 w-4" /> View Wakalah Agreement</Link></Button>
                                </div>
                            </div>
                        )}
                        <div className="rounded-lg border p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div><p className="font-semibold">Kafaalah Guarantee Bond</p><p className="text-sm text-muted-foreground">Guarantor: {deal.guarantorName || 'Details awaiting completion'}</p></div>
                                <Button asChild variant="outline"><Link href={`/client/agreements/kafaalah/${deal.id}`}><ShieldAlert className="mr-2 h-4 w-4" /> View Guarantee Bond</Link></Button>
                            </div>
                        </div>
                        {deal.status === 'Active' && (
                            <div className="flex flex-wrap gap-2"><RepaymentPlanChangeDialog deal={deal} /><AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={isPendingTermination}>
                                        {isPendingTermination ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                                        Request Termination
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Request deal termination?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Termination requires payment of all unpaid principal and profit in full. The deal remains active until an administrator confirms the full settlement.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleTerminationRequest}>Submit Request</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog></div>
                        )}
                    </CardContent>
                </Card>
                {userProfile?.legalDocumentUrl && (
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Gavel /> Legal Document</CardTitle>
                            <CardDescription>Your signed legal agreement with the platform.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="outline">
                                        <Gavel className="mr-2 h-4 w-4" /> View Legal Document
                                    </Button>
                                </SheetTrigger>
                                <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex flex-col">
                                    <SheetHeader className="flex-row items-center justify-between">
                                        <SheetTitle>Signed Legal Document</SheetTitle>
                                         <Button variant="outline" asChild>
                                            <a href={userProfile.legalDocumentUrl} download={`LegalDocument-${userProfile.name}.pdf`}>
                                                <Download className="mr-2 h-4 w-4" /> Download
                                            </a>
                                        </Button>
                                    </SheetHeader>
                                    <div className="py-4 flex-1 bg-white overflow-y-auto">
                                        {userProfile.legalDocumentUrl.startsWith('data:image/') ? (
                                            <Image src={userProfile.legalDocumentUrl} alt="Legal Document" width={800} height={1100} className="rounded-md object-contain mx-auto" />
                                        ) : (
                                            <iframe src={`${userProfile.legalDocumentUrl}#toolbar=1`} className="w-full h-full rounded-md border" />
                                        )}
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </CardContent>
                    </Card>
                )}
            </div>
            <div className="mt-8">
                 <Tabs defaultValue="schedule" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="schedule">Upcoming Schedule</TabsTrigger>
                        <TabsTrigger value="history">Repayment History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="schedule">
                        <ClientRepaymentSchedule deal={deal} initialRepayments={repayments} repaymentsLoading={repaymentsLoading} />
                    </TabsContent>
                    <TabsContent value="history">
                        <RepaymentHistory repayments={lodgedRepayments} loading={repaymentsLoading} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
