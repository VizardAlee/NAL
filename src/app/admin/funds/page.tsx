
'use client';

import { PageHeader } from "@/components/page-header";
import { Banknote, History, Landmark, Wallet, PlusCircle, ArrowRightLeft, MinusCircle, HandCoins, Library, PiggyBank, FilePlus, CheckCircle, XCircle } from "lucide-react";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp, writeBatch, serverTimestamp, doc, addDoc, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore } from "@/firebase";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useIsMobile } from "@/hooks/use-mobile";
import { Investment } from "@/lib/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname } from 'next/navigation';


type PlatformFundBatch = DocumentData & {
  id: string;
  sourceId: 'platform';
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
  details?: string;
};

type DepositRequest = DocumentData & {
    id: string;
    investorId: string;
    investorName: string;
    amount: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt: Timestamp;
};

type GenericTransaction = DocumentData & {
    id: string;
    userId: string;
    type: 'PlatformEarning' | 'Investment' | 'Zakat' | 'Penalty';
    amount: number;
    createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  id:string;
  type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible';
  amount: number;
  description: string;
  createdAt: Timestamp;
};

type FundBatch = DocumentData & {
  remainingAmount: number;
}

const ITEMS_PER_PAGE = 10;

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : date;
    try {
      return format(date, 'PPP p');
    } catch {
      return 'Invalid Date';
    }
  };

  const adminTransactionSchema = z.object({
    amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
    description: z.string().min(3, { message: "Description is required." }),
  });
  
  function AdminTransactionForm({ type, onTransactionComplete }: { type: "AdminDeposit" | "Expense", onTransactionComplete: () => void }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();
  
    const form = useForm<z.infer<typeof adminTransactionSchema>>({
      resolver: zodResolver(adminTransactionSchema),
      defaultValues: { amount: 1000, description: "" },
    });
  
    async function onSubmit(values: z.infer<typeof adminTransactionSchema>) {
      setIsLoading(true);
      if (!firestore) return;
  
      try {
        const amount = type === 'Expense' ? -Math.abs(values.amount) : values.amount;
        await addDoc(collection(firestore, 'administrativeTransactions'), {
          type,
          amount,
          description: values.description,
          createdAt: serverTimestamp(),
        });
  
        toast({ title: "Success", description: `Transaction recorded: ${values.description}` });
        onTransactionComplete();
      } catch (error) {
        console.error("Admin Transaction Error:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to record transaction." });
      } finally {
        setIsLoading(false);
      }
    }
  
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {type === 'AdminDeposit' ? 'Add Funds' : 'Record Expense'}
          </Button>
        </form>
      </Form>
    );
  }

  const transferSchema = z.object({
    amount: z.coerce.number().positive(),
  });

  function TransferFundsForm({
    direction,
    maxAmount,
    onTransferComplete,
  }: {
    direction: "toInvestible" | "fromInvestible";
    maxAmount: number;
    onTransferComplete: () => void;
  }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();

    const dynamicSchema = transferSchema.extend({
        amount: z.coerce.number().positive().max(maxAmount, { message: "Amount exceeds available balance."}),
    });
  
    const form = useForm<z.infer<typeof dynamicSchema>>({
      resolver: zodResolver(dynamicSchema),
      defaultValues: { amount: Math.min(1000, maxAmount) },
    });
  
    async function onSubmit(values: z.infer<typeof dynamicSchema>) {
      setIsLoading(true);
      if (!firestore) return;
  
      const { amount } = values;
  
      try {
        const batch = writeBatch(firestore);
        const now = serverTimestamp();
  
        if (direction === 'toInvestible') {
          // Move from Admin to Investible
          // 1. Debit Admin Account
          const adminTxRef = doc(collection(firestore, "administrativeTransactions"));
          batch.set(adminTxRef, {
            type: 'TransferToInvestible',
            amount: -amount,
            description: `Transfer to Investible Capital`,
            createdAt: now,
          });
          // 2. Create a new platform fund batch
          const fundBatchRef = doc(collection(firestore, "fundBatches"));
          batch.set(fundBatchRef, {
            sourceId: 'platform',
            amount: amount,
            remainingAmount: amount,
            tenureValue: 10,
            tenureUnit: 'Years',
            createdAt: now,
          });
        } else {
          // Move from Investible to Admin
          // This is more complex as we need to consume fund batches
          let amountToWithdraw = amount;
          const fundBatchesQuery = query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform'), where('remainingAmount', '>', 0), orderBy('createdAt'));
          const batchesSnapshot = await getDocs(fundBatchesQuery);

          for (const batchDoc of batchesSnapshot.docs) {
              if (amountToWithdraw <= 0) break;
              const batchData = batchDoc.data();
              const amountToDeduct = Math.min(amountToWithdraw, batchData.remainingAmount);

              batch.update(batchDoc.ref, { remainingAmount: batchData.remainingAmount - amountToDeduct });
              amountToWithdraw -= amountToDeduct;
          }

          if (amountToWithdraw > 0) {
              throw new Error("Insufficient funds in batches to complete transfer.");
          }

          // 2. Credit Admin Account
          const adminTxRef = doc(collection(firestore, "administrativeTransactions"));
          batch.set(adminTxRef, {
            type: 'TransferFromInvestible',
            amount: amount,
            description: `Transfer from Investible Capital`,
            createdAt: now,
          });
        }
  
        await batch.commit();
        toast({ title: "Success", description: `Transfer of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)} completed.` });
        onTransferComplete();
      } catch (error) {
        console.error("Transfer Error:", error);
        toast({ variant: "destructive", title: "Transfer Failed", description: error instanceof Error ? error.message : "An unknown error occurred." });
      } finally {
        setIsLoading(false);
      }
    }
  
    const title = direction === 'toInvestible' ? "Fund Investible Account" : "Withdraw to Admin Account";
    const description = direction === 'toInvestible' ? "Move funds from Admin Account to make them available for deal funding." : "Move funds from Investible Capital to the Admin Account for operational use.";
  
    return (
      <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount to Transfer</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormDescription>Max available: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(maxAmount)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading || maxAmount <= 0}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer Funds
            </Button>
          </form>
        </Form>
      </>
    );
  }

// New hook to clear notifications when a page is visited
function useClearNotificationsByPath() {
    const firestore = useFirestore();
    const pathname = usePathname();

    useEffect(() => {
        if (!firestore || !pathname) return;

        const clearNotifications = async () => {
            const notificationsToClearQuery = query(
                collection(firestore, 'notifications'),
                where('link', '==', pathname),
                where('read', '==', false)
            );
            
            const snapshot = await getDocs(notificationsToClearQuery);
            if (snapshot.empty) return;

            const batch = writeBatch(firestore);
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            
            await batch.commit();
        };

        const timer = setTimeout(clearNotifications, 500);
        return () => clearTimeout(timer);

    }, [firestore, pathname]);
}


export default function PlatformFundsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [isDepositOpen, setDepositOpen] = useState(false);
    const [isExpenseOpen, setExpenseOpen] = useState(false);
    const [isTransferToInvestibleOpen, setTransferToInvestibleOpen] = useState(false);
    const [isTransferFromInvestibleOpen, setTransferFromInvestibleOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useClearNotificationsByPath();

    const platformFundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform'));
    }, [firestore]);
    
    const adminTransactionsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'administrativeTransactions'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const zakatTransactionsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(collection(firestore, 'transactions'), where('type', 'in', ['Zakat', 'Penalty']));
    }, [firestore]);

    const allInvestmentsQuery = useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'investments');
    }, [firestore]);

    const allFundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'fundBatches');
    }, [firestore]);
    
    const depositRequestsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'depositRequests'), where('status', '==', 'Pending'));
    }, [firestore]);

    const { data: platformFundBatches, loading: platformBatchesLoading } = useCollection<PlatformFundBatch>(platformFundBatchesQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    const { data: zakatTransactions, loading: zakatLoading } = useCollection<GenericTransaction>(zakatTransactionsQuery);
    const { data: allInvestments, loading: allInvestmentsLoading } = useCollection<Investment>(allInvestmentsQuery);
    const { data: allFundBatches, loading: allFundBatchesLoading } = useCollection<FundBatch>(allFundBatchesQuery);
    const { data: depositRequests, loading: depositRequestsLoading } = useCollection<DepositRequest>(depositRequestsQuery);


    const isLoading = platformBatchesLoading || adminTransactionsLoading || zakatLoading || allInvestmentsLoading || allFundBatchesLoading || depositRequestsLoading;

    const metrics = useMemo(() => {
        const investibleCapital = platformFundBatches
            ?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;
        
        const administrativeBalance = adminTransactions
            ?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        
        const zakatPool = zakatTransactions
            ?.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;
        
        const totalInvested = allInvestments
            ?.reduce((sum, inv) => sum + inv.amount, 0) || 0;
            
        const totalInvestiblePool = allFundBatches
            ?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;


        return { investibleCapital, administrativeBalance, zakatPool, totalInvested, totalInvestiblePool };
    }, [platformFundBatches, adminTransactions, zakatTransactions, allInvestments, allFundBatches]);

    const paginatedAdminTransactions = useMemo(() => {
        if (!adminTransactions) return [];
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return adminTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [adminTransactions, currentPage]);

    const totalPages = useMemo(() => {
        if (!adminTransactions) return 0;
        return Math.ceil(adminTransactions.length / ITEMS_PER_PAGE);
    }, [adminTransactions]);

    const handleProcessRequest = async (request: DepositRequest, newStatus: 'Approved' | 'Rejected') => {
        if (!firestore) return;
        setProcessingId(request.id);

        try {
            const batch = writeBatch(firestore);
            const requestRef = doc(firestore, 'depositRequests', request.id);

            batch.update(requestRef, {
                status: newStatus,
                processedAt: Timestamp.now()
            });

            if (newStatus === 'Approved') {
                const now = Timestamp.now();
                // Create a fund batch for the investor
                const fundBatchRef = doc(collection(firestore, 'fundBatches'));
                batch.set(fundBatchRef, {
                    sourceId: request.investorId,
                    amount: request.amount,
                    remainingAmount: request.amount,
                    createdAt: now,
                    // Default tenure for new deposits, could be made configurable later
                    tenureValue: 10,
                    tenureUnit: 'Years'
                });

                // Create a 'Deposit' transaction
                const transactionRef = doc(collection(firestore, 'transactions'));
                batch.set(transactionRef, {
                    userId: request.investorId,
                    type: 'Deposit',
                    amount: request.amount,
                    createdAt: now,
                    details: 'Investor Deposit'
                });
            }

            await batch.commit();
            toast({
                title: `Request ${newStatus}`,
                description: `${request.investorName}'s deposit request has been ${newStatus.toLowerCase()}.`
            });

        } catch (error) {
            console.error("Error processing deposit request: ", error);
            toast({
                variant: 'destructive',
                title: "Processing Failed",
                description: "An unexpected error occurred."
            })
        } finally {
            setProcessingId(null);
        }
    };


    return (
        <div>
            <PageHeader
                title="Platform Funds"
                description="An overview of the platform's internal funds, earnings, and investments."
                icon={Banknote}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Investible Pool</CardTitle>
                        <Library className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalInvestiblePool)}</div>}
                        <p className="text-xs text-muted-foreground">Total capital from all sources available for deals.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Capital Invested</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalInvested)}</div>}
                        <p className="text-xs text-muted-foreground">Total amount from all sources invested in deals.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Platform Investible Capital</CardTitle>
                        <PiggyBank className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.investibleCapital)}</div>}
                        <p className="text-xs text-muted-foreground">Platform-owned funds available for deals.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Administrative Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.administrativeBalance)}</div>}
                        <p className="text-xs text-muted-foreground">Operational funds for expenses.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Zakat Pool</CardTitle>
                        <HandCoins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.zakatPool)}</div>}
                        <p className="text-xs text-muted-foreground">Collected Zakat and penalty fees.</p>
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8">
                <Tabs defaultValue="requests">
                    <TabsList>
                        <TabsTrigger value="requests">
                            <FilePlus className="mr-2 h-4 w-4" />
                            Deposit Requests
                            {depositRequests && depositRequests.length > 0 && <Badge className="ml-2">{depositRequests.length}</Badge>}
                        </TabsTrigger>
                        <TabsTrigger value="activity"><History className="mr-2 h-4 w-4" />Admin Activity</TabsTrigger>
                    </TabsList>
                    <TabsContent value="requests" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Pending Deposit Requests</CardTitle>
                                <CardDescription>Investors waiting for payment confirmation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isMobile ? (
                                    <div className="space-y-3">
                                        {isLoading ? Array.from({length: 2}).map((_, i) => <Skeleton key={i} className="h-24" />) : null}
                                        {depositRequests && depositRequests.length > 0 ? depositRequests.map(req => (
                                            <Card key={req.id}>
                                                <CardContent className="p-4 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-medium">{req.investorName}</p>
                                                        <p className="font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(req.amount)}</p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{formatDate(req.requestedAt)}</p>
                                                    <div className="flex justify-end gap-2 pt-2 border-t">
                                                        <Button size="sm" variant="outline" onClick={() => handleProcessRequest(req, 'Rejected')} disabled={processingId === req.id}>
                                                            {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <XCircle className="h-4 w-4" />}
                                                        </Button>
                                                        <Button size="sm" onClick={() => handleProcessRequest(req, 'Approved')} disabled={processingId === req.id}>
                                                            {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4" />}
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )) : !isLoading && <p className="text-center text-sm text-muted-foreground py-10">No pending deposit requests.</p>}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Investor</TableHead>
                                                <TableHead>Amount</TableHead>
                                                <TableHead>Date Requested</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading && Array.from({length: 3}).map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                                    <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                                                </TableRow>
                                            ))}
                                            {depositRequests && depositRequests.length > 0 ? depositRequests.map(req => (
                                                <TableRow key={req.id}>
                                                    <TableCell>{req.investorName}</TableCell>
                                                    <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(req.amount)}</TableCell>
                                                    <TableCell>{formatDate(req.requestedAt)}</TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        <Button size="sm" variant="outline" onClick={() => handleProcessRequest(req, 'Rejected')} disabled={processingId === req.id}>
                                                            {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <XCircle className="h-4 w-4 mr-2" />}
                                                            Reject
                                                        </Button>
                                                        <Button size="sm" onClick={() => handleProcessRequest(req, 'Approved')} disabled={processingId === req.id}>
                                                            {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4 mr-2" />}
                                                            Approve
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )) : !isLoading && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center h-24">No pending deposit requests.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="activity" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Administrative Activity</CardTitle>
                                <CardDescription>
                                Manage operational funds: deposits, expenses, and transfers.
                                </CardDescription>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <Dialog open={isDepositOpen} onOpenChange={setDepositOpen}>
                                        <DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Add Funds</Button></DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader><DialogTitle>Add Funds to Admin Account</DialogTitle></DialogHeader>
                                            <AdminTransactionForm type="AdminDeposit" onTransactionComplete={() => setDepositOpen(false)} />
                                        </DialogContent>
                                    </Dialog>
                                    <Dialog open={isExpenseOpen} onOpenChange={setExpenseOpen}>
                                        <DialogTrigger asChild><Button size="sm" variant="outline"><MinusCircle className="mr-2 h-4 w-4" />Record Expense</Button></DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader><DialogTitle>Record an Expense</DialogTitle></DialogHeader>
                                            <AdminTransactionForm type="Expense" onTransactionComplete={() => setExpenseOpen(false)} />
                                        </DialogContent>
                                    </Dialog>
                                    <Dialog open={isTransferToInvestibleOpen} onOpenChange={setTransferToInvestibleOpen}>
                                        <DialogTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Fund Investible</Button></DialogTrigger>
                                        <DialogContent>
                                            <TransferFundsForm direction="toInvestible" maxAmount={metrics.administrativeBalance} onTransferComplete={() => setTransferToInvestibleOpen(false)} />
                                        </DialogContent>
                                    </Dialog>
                                    <Dialog open={isTransferFromInvestibleOpen} onOpenChange={setTransferFromInvestibleOpen}>
                                        <DialogTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Withdraw to Admin</Button></DialogTrigger>
                                        <DialogContent>
                                            <TransferFundsForm direction="fromInvestible" maxAmount={metrics.investibleCapital} onTransferComplete={() => setTransferFromInvestibleOpen(false)} />
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {isLoading && (
                                    isMobile ? (
                                        <div className="space-y-3 p-4">
                                            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {Array.from({length: 4}).map((_, i) => (
                                                <TableRow key={i}>
                                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                                        <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )
                                )}
                                {!isLoading && paginatedAdminTransactions && paginatedAdminTransactions.length > 0 ? (
                                    isMobile ? (
                                        <div className="space-y-3 p-4">
                                            {paginatedAdminTransactions.map(tx => (
                                                <Card key={tx.id} className="p-4">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="font-medium">{tx.description}</p>
                                                            <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'} className="mt-1">{tx.type}</Badge>
                                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</p>
                                                        </div>
                                                        <p className={`font-medium ${tx.amount > 0 ? 'text-primary' : ''}`}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}</p>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                            {paginatedAdminTransactions?.map(tx => (
                                                <TableRow key={tx.id}>
                                                    <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                                    <TableCell><Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge></TableCell>
                                                    <TableCell>{tx.description}</TableCell>
                                                    <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : ''}`}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                            </TableBody>
                                        </Table>
                                    )
                                ) : (
                                    !isLoading && <div className="p-4 py-12 text-center text-sm text-muted-foreground border-t">No administrative activities found.</div>
                                )}
                            </CardContent>
                            {totalPages > 1 && (
                                <div className="p-4 border-t">
                                    <Pagination>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)) }} aria-disabled={currentPage === 1} />
                                            </PaginationItem>
                                            {[...Array(totalPages)].map((_, i) => (
                                                <PaginationItem key={i}>
                                                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1); }} isActive={currentPage === i + 1}>
                                                        {i + 1}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            ))}
                                            <PaginationItem>
                                                <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)) }} aria-disabled={currentPage === totalPages} />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                </div>
                            )}
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>


        </div>
    );
}
