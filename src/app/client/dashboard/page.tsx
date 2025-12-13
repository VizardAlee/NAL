
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldAlert, Loader2, ArrowRight, PlusCircle, MessageSquare, Landmark, Copy, HandCoins } from "lucide-react";
import { useMemo, useTransition, useEffect, useState } from 'react';
import { useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, Timestamp, orderBy, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal, Repayment } from '@/lib/types';
import { RepaymentHistory } from "@/components/deals/repayment-history";
import { ClientRepaymentSchedule } from "./client-repayment-schedule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestTerminationAction } from "./actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getOrCreateConversation } from "@/app/common/actions/chat-actions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";


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
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const adminsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'), where('role', '==', 'Admin'));
    }, [firestore]);

    const { data: admins, loading } = useCollection<any>(adminsQuery);

    const handleSelectAdmin = (admin: any) => {
        if (!user?.displayName) return;
        startTransition(async () => {
            const result = await getOrCreateConversation({
                adminId: admin.id,
                adminName: admin.name,
                userId: user.uid,
                userName: user.displayName
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
                    {admins?.map(admin => (
                        <Button
                            key={admin.id}
                            variant="secondary"
                            className="w-full justify-start h-14"
                            onClick={() => handleSelectAdmin(admin)}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <MessageSquare className="mr-4 h-4 w-4" />}
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
    const { user, loading: userLoading } = useUser();
    const { toast } = useToast();
    const [isPendingTermination, startTransition] = useTransition();

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid || !deal?.id) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid), where('dealId', '==', deal.id));
    }, [firestore, user?.uid, deal?.id]);

    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(
        repaymentsQuery
    );

    const lodgedRepayments = useMemo(() => {
        if (!repayments) return [];
        return repayments.filter(r => r.status === 'Pending' || r.status === 'Approved');
    }, [repayments]);

    const handleTerminationRequest = () => {
        if (!user || !user.displayName) return;
        startTransition(async () => {
            const result = await requestTerminationAction({
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
    
    if(userLoading || repaymentsLoading) {
        return <DealsSkeleton />;
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
                        <p className="text-muted-foreground">Repayment</p>
                        <p className="font-medium">{deal.repaymentType}</p>
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
                {deal.status === 'Active' && (
                    <Button variant="destructive" size="sm" onClick={handleTerminationRequest} disabled={isPendingTermination}>
                        {isPendingTermination ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                        Request Termination
                    </Button>
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
    )
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


export default function ClientDashboard() {
    const firestore = useFirestore();
    const router = useRouter();
    const { user, loading: userLoading } = useUser();
    const isMobile = useIsMobile();
    
    const userProfileRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    const { data: userProfile, loading: profileLoading } = useDoc(userProfileRef);
    
    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user?.uid]);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(
        dealsQuery
    );
    
    const isLoading = userLoading || dealsLoading || profileLoading;

    const { mainDeal, olderDeals } = useMemo(() => {
        if (!deals || deals.length === 0) {
            return { mainDeal: null, olderDeals: [] };
        }

        const activeDeal = deals.find(d => d.status === 'Active');
        if (activeDeal) {
            return {
                mainDeal: activeDeal,
                olderDeals: deals.filter(d => d.id !== activeDeal.id),
            };
        }

        // If no active deal, fall back to the most recent one
        const mainDeal = deals[0];
        const olderDeals = deals.slice(1);
        return { mainDeal, olderDeals };
    }, [deals]);

    if (isLoading) {
        return <DealsSkeleton />;
    }

    if (!user) {
        router.replace('/login');
        return <DealsSkeleton />;
    }

    return (
        <div>
            <PageHeader
                title="Client Dashboard"
                description="Here is an overview of your current and past financing deals."
                icon={FileText}
            >
                <div className="flex gap-2">
                    <ContactAdminSheet />
                    <Button asChild>
                        <Link href="/client/deals/request">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Request a Deal
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            
            {userProfile ? (
                <div className="grid gap-8">
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

                    <BankDetailsCard />

                    {mainDeal ? (
                        <>
                            <DealCard deal={mainDeal} />

                            {olderDeals.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Previous Deals</CardTitle>
                                        <CardDescription>A history of your past financing deals.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {isMobile ? (
                                            <div className="space-y-3">
                                                {olderDeals.map(deal => (
                                                    <Card key={deal.id} className="p-4">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="font-medium">{deal.dealName}</p>
                                                                 <p className="text-sm">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</p>
                                                            </div>
                                                            <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                                                        </div>
                                                        <div className="mt-2 text-right">
                                                            <Button asChild variant="outline" size="sm">
                                                                <Link href={`/client/deals/${deal.id}`}>
                                                                    View Details <ArrowRight className="ml-2 h-4 w-4" />
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Deal Name</TableHead>
                                                        <TableHead>Principal</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {olderDeals.map(deal => (
                                                        <TableRow key={deal.id}>
                                                            <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
                                                            <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                                            <TableCell data-label="Status">
                                                                <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                                                            </TableCell>
                                                            <TableCell data-label="Action" className="text-right">
                                                                <Button asChild variant="outline" size="sm">
                                                                    <Link href={`/client/deals/${deal.id}`}>
                                                                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                                                                    </Link>
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    ) : (
                         <Card className="mt-6 border-dashed">
                            <CardContent className="p-12 text-center">
                                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-medium">No Deals Found</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    You do not have any financing deals yet. You can request one now.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : (
                <Card className="mt-6 border-dashed">
                    <CardContent className="p-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No Deals Found</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            You do not have any financing deals yet. You can request one using the button above.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

    