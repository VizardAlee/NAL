
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldAlert, Loader2, ArrowRight, PlusCircle, MessageSquare, Landmark, Copy, HandCoins, Gavel, Download, BookOpen, History } from "lucide-react";
import { useMemo, useTransition, useEffect, useState } from 'react';
import { useAuth, useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, Timestamp, orderBy, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal, Repayment } from '@/lib/types';
import { ClientRepaymentSchedule } from "./client-repayment-schedule";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestTerminationAction } from "./actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getOrCreateConversation, listContactAdmins } from '@/app/common/actions/chat-actions';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import Image from "next/image";
import { RepaymentHistory } from "@/components/deals/repayment-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { generateAmortizationSchedule } from "@/lib/amortization";
import { RepaymentMilestoneGauge } from "@/components/deals/repayment-milestone-gauge";
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


const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
} as const;

function BankDetailsCard() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const bankDetailsRef = useMemo(() => firestore ? doc(firestore, 'platformSettings', 'bankDetails') : null, [firestore]);
    const { data: bankDetails, loading } = useDoc(bankDetailsRef);

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied!', description: `${field} copied to clipboard.` });
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                    <CardDescription>For making deposits and manual repayments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-6 w-2/3" />
                </CardContent>
            </Card>
        );
    }

    if (!bankDetails) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                <CardDescription>For making deposits and manual repayments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Bank Name</p>
                        <p className="font-medium">{bankDetails.bankName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Name</p>
                        <p className="font-medium">{bankDetails.accountName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Number</p>
                        <p className="font-medium">{bankDetails.accountNumber}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(bankDetails.accountNumber, 'Account Number')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function ContactAdminSheet() {
    const auth = useAuth();
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();
    const [admins, setAdmins] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;

        async function loadAdmins() {
            const currentUser = auth?.currentUser;
            if (!currentUser || !user) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const authToken = await currentUser.getIdToken();
            const result = await listContactAdmins({ authToken });

            if (cancelled) return;
            if (result.success) {
                setAdmins(result.admins);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Unable to load admins',
                    description: result.message,
                });
            }
            setLoading(false);
        }

        loadAdmins();
        return () => {
            cancelled = true;
        };
    }, [auth, toast, user]);

    const handleSelectAdmin = (admin: { id: string; name: string }) => {
        const currentUser = auth?.currentUser;
        if (!user?.displayName || !currentUser) return;
        startTransition(async () => {
            const authToken = await currentUser.getIdToken();
            const result = await getOrCreateConversation({
                authToken,
                adminId: admin.id,
                adminName: admin.name,
                userId: user.uid,
                userName: user.displayName || 'User'
            });

            if (result.success && result.conversationId) {
                router.push(`/client/messages/${result.conversationId}`);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message || "Could not start conversation.",
                });
            }
        });
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Contact Admin
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Contact an Administrator</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-3">
                    {loading && <p>Loading admins...</p>}
                    {!loading && admins.length === 0 && <p className="text-sm text-muted-foreground">No administrators are available right now.</p>}
                    {admins?.map(admin => (
                        <Button
                            key={admin.id}
                            variant="secondary"
                            className="w-full justify-start h-14"
                            onClick={() => handleSelectAdmin(admin)}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-4 h-4 w-4" />}
                            Chat with {admin.name}
                        </Button>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function DealCard({ deal }: { deal: Deal }) {
    const firestore = useFirestore();
    const auth = useAuth();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPendingTermination, startTransition] = useTransition();

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid || !deal?.id) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid), where('dealId', '==', deal.id));
    }, [firestore, user?.uid, deal?.id]);

    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(
        repaymentsQuery as any
    );

    const lodgedRepayments = useMemo(() => {
        if (!repayments) return [];
        return repayments.filter(r => r.status === 'Pending' || r.status === 'Approved');
    }, [repayments]);

    const handleTerminationRequest = () => {
        const currentUser = auth?.currentUser;
        if (!user || !user.displayName || !currentUser) return;
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

    return (
        <Card className="flex flex-col">
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
                        <p className="font-medium">{deal.profitRate || 0}%</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-medium">{deal.durationValue} {deal.durationUnit}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Financing Mode</p>
                        <div className="font-medium">
                            <Badge variant="outline">{deal.financingMode || 'Murabaha'}</Badge>
                        </div>
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
                {(deal.status === 'Active' || deal.status === 'Completed') && (
                    <RepaymentMilestoneGauge
                        deal={deal}
                        repayments={repayments}
                        loading={repaymentsLoading}
                    />
                )}
                {deal.status === 'Active' && (
                    <AlertDialog>
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
                    </AlertDialog>
                )}
            </CardContent>
            <div className="mt-auto flex-grow">
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
        </Card>
    );
}

function DealsSkeleton() {
    return (
        <div>
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

type UserProfile = DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client';
    legalDocumentUrl?: string;
};

type ClientRequest = DocumentData & {
    id: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: Timestamp;
    dealName?: string;
    amount?: number;
};

export default function ClientDashboard() {
    const firestore = useFirestore();
    const router = useRouter();
    const { user, loading: userLoading } = useUser();

    const userProfileRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    const { data: userProfile, loading: profileLoading, error: profileError } = useDoc<UserProfile>(userProfileRef);

    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user?.uid]);

    const { data: deals, loading: dealsLoading, error: dealsError } = useCollection<Deal>(
        dealsQuery as any
    );

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid));
    }, [firestore, user?.uid]);

    const dealRequestsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'dealRequests'), where('clientId', '==', user.uid), orderBy('requestedAt', 'desc'));
    }, [firestore, user?.uid]);

    const terminationRequestsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'terminationRequests'), where('clientId', '==', user.uid), orderBy('requestedAt', 'desc'));
    }, [firestore, user?.uid]);

    const { data: repayments, loading: repaymentsLoading, error: repaymentsError } = useCollection<Repayment>(repaymentsQuery as any);
    const { data: dealRequests, loading: dealRequestsLoading, error: dealRequestsError } = useCollection<ClientRequest>(dealRequestsQuery as any);
    const { data: terminationRequests, loading: terminationRequestsLoading, error: terminationRequestsError } = useCollection<ClientRequest>(terminationRequestsQuery as any);

    const isLoading = userLoading || dealsLoading || profileLoading || repaymentsLoading || dealRequestsLoading || terminationRequestsLoading;
    const dataLoadError = profileError || dealsError || repaymentsError || dealRequestsError || terminationRequestsError;

    const mostRecentDeal = useMemo(() => deals?.[0], [deals]);

    const dashboardMetrics = useMemo<{
        activePrincipal: number;
        nextPayment: { amount: number; dueDate: Date; dealName: string } | null;
        overdueAmount: number;
        overdueCount: number;
        pendingRepaymentCount: number;
        pendingDealRequestCount: number;
        pendingTerminationCount: number;
    }>(() => {
        const activeDeals = deals?.filter((deal) => deal.status === 'Active') || [];
        const activePrincipal = activeDeals.reduce((sum, deal) => sum + Number(deal.principal || 0), 0);
        const pendingRepayments = repayments?.filter((repayment) => repayment.status === 'Pending') || [];
        const approvedOrPendingRepayments = repayments?.filter((repayment) => repayment.status === 'Approved' || repayment.status === 'Pending') || [];
        const today = new Date();

        let nextPayment: { amount: number; dueDate: Date; dealName: string } | null = null;
        let overdueAmount = 0;
        let overdueCount = 0;

        activeDeals.forEach((deal) => {
            const schedule = generateAmortizationSchedule(deal);
            schedule.forEach((installment) => {
                const paid = approvedOrPendingRepayments
                    .filter((repayment) => repayment.dealId === deal.id && repayment.installmentNumber === installment.installment)
                    .reduce((sum, repayment) => sum + Number(repayment.amount || 0), 0);
                const remaining = Math.max(0, installment.payment - paid);
                if (remaining <= 0.01) return;

                if (installment.dueDate < today) {
                    overdueAmount += remaining;
                    overdueCount += 1;
                    return;
                }

                if (!nextPayment || installment.dueDate < nextPayment.dueDate) {
                    nextPayment = { amount: remaining, dueDate: installment.dueDate, dealName: deal.dealName };
                }
            });
        });

        return {
            activePrincipal,
            nextPayment,
            overdueAmount,
            overdueCount,
            pendingRepaymentCount: pendingRepayments.length,
            pendingDealRequestCount: dealRequests?.filter((request) => request.status === 'Pending').length || 0,
            pendingTerminationCount: terminationRequests?.filter((request) => request.status === 'Pending').length || 0,
        };
    }, [dealRequests, deals, repayments, terminationRequests]);

    const pendingRequests = useMemo(() => {
        return [
            ...(dealRequests || []).map((request) => ({
                id: request.id,
                label: 'Deal Request',
                title: request.dealName || 'New financing request',
                status: request.status,
                requestedAt: request.requestedAt,
            })),
            ...(terminationRequests || []).map((request) => ({
                id: request.id,
                label: 'Termination',
                title: request.dealName || 'Termination request',
                status: request.status,
                requestedAt: request.requestedAt,
            })),
        ]
            .filter((request) => request.status === 'Pending')
            .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0))
            .slice(0, 5);
    }, [dealRequests, terminationRequests]);

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

    if (isLoading) {
        return <DealsSkeleton />;
    }

    if (!user) {
        router.replace('/login');
        return <DealsSkeleton />;
    }

    if (dataLoadError) {
        return (
            <div>
                <PageHeader
                    title="Client Dashboard"
                    description="Here is an overview of your most recent financing deal."
                    icon={FileText}
                />
                <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>We could not load your records</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>
                            Your records have not been deleted. The dashboard could not reach Firestore or verify this session.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                            Retry loading records
                        </Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="Client Dashboard"
                description="Here is an overview of your most recent financing deal."
                icon={FileText}
            >
                <div className="flex gap-2">
                    {user && <ContactAdminSheet />}
                    <Button asChild>
                        <Link href="/client/deals/request">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Request a Deal
                        </Link>
                    </Button>
                </div>
            </PageHeader>

            <div className="grid gap-8">
                {userProfile && (
                    <Card>
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/128/128`} />
                                <AvatarFallback>{(userProfile.name as string).charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle className="font-headline text-2xl">{userProfile.name}</CardTitle>
                                <p className="text-muted-foreground">{userProfile.email}</p>
                                <Badge variant="secondary" className="mt-1">{userProfile.role}</Badge>
                            </div>
                        </CardHeader>
                    </Card>
                )}

                <BankDetailsCard />

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Active Principal</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(dashboardMetrics.activePrincipal)}</div>
                            <p className="text-xs text-muted-foreground">Across active deals</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Next Payment</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {dashboardMetrics.nextPayment ? formatCurrency(dashboardMetrics.nextPayment.amount) : 'None'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {dashboardMetrics.nextPayment ? `${dashboardMetrics.nextPayment.dealName} due ${dashboardMetrics.nextPayment.dueDate.toLocaleDateString()}` : 'No upcoming active installment'}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(dashboardMetrics.overdueAmount)}</div>
                            <p className="text-xs text-muted-foreground">{dashboardMetrics.overdueCount} installment(s) past due</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Pending Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {dashboardMetrics.pendingRepaymentCount + dashboardMetrics.pendingDealRequestCount + dashboardMetrics.pendingTerminationCount}
                            </div>
                            <p className="text-xs text-muted-foreground">Repayments, deal requests, and terminations</p>
                        </CardContent>
                    </Card>
                </div>

                {pendingRequests.length > 0 && (
                    <Alert>
                        <History className="h-4 w-4" />
                        <AlertTitle>Pending Requests</AlertTitle>
                        <AlertDescription>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {pendingRequests.map((request) => (
                                    <div key={`${request.label}-${request.id}`} className="rounded-md border bg-background p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{request.label}</span>
                                            <Badge variant="secondary">{request.status}</Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">{request.title}</p>
                                    </div>
                                ))}
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

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

                {mostRecentDeal ? (
                    <DealCard deal={mostRecentDeal} />
                ) : (
                    <Card className="mt-6 border-dashed">
                        <CardContent className="p-12 text-center">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-medium">No Deals Found</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                You do not have any financing deals yet. You can request one now.
                            </p>
                            <Button asChild className="mt-4">
                                <Link href="/client/deals/request">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Request Your First Deal
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {deals && deals.length > 0 && (
                    <div className="text-center">
                        <Button asChild variant="outline">
                            <Link href="/client/deals">
                                View All Deals ({deals.length}) <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
