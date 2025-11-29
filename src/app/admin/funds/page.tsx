
'use client';

import { PageHeader } from "@/components/page-header";
import { Banknote, History, Landmark, Wallet, PlusCircle, ArrowRightLeft, MinusCircle } from "lucide-react";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp, writeBatch, serverTimestamp, doc, addDoc, getDocs, orderBy } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";


type PlatformFundBatch = DocumentData & {
  id: string;
  sourceId: 'platform';
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
  details?: string;
};

type PlatformTransaction = DocumentData & {
    id: string;
    userId: 'platform';
    type: 'PlatformEarning' | 'Investment';
    amount: number;
    createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  id: string;
  type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible';
  amount: number;
  description: string;
  createdAt: Timestamp;
};

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
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
          <FormDescription>{description}</FormDescription>
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


export default function PlatformFundsPage() {
    const firestore = useFirestore();
    const [isDepositOpen, setDepositOpen] = useState(false);
    const [isExpenseOpen, setExpenseOpen] = useState(false);
    const [isTransferToInvestibleOpen, setTransferToInvestibleOpen] = useState(false);
    const [isTransferFromInvestibleOpen, setTransferFromInvestibleOpen] = useState(false);

    const fundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform'));
    }, [firestore]);

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', 'platform'));
    }, [firestore]);
    
    const adminTransactionsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'administrativeTransactions'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const { data: fundBatches, loading: batchesLoading } = useCollection<PlatformFundBatch>(fundBatchesQuery);
    const { data: transactions, loading: transactionsLoading } = useCollection<PlatformTransaction>(transactionsQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);


    const isLoading = batchesLoading || transactionsLoading || adminTransactionsLoading;

    const metrics = useMemo(() => {
        const totalEarnings = transactions
            ?.filter(tx => tx.type === 'PlatformEarning')
            .reduce((sum, tx) => sum + tx.amount, 0) || 0;
            
        const totalInvestedByPlatform = transactions
            ?.filter(tx => tx.type === 'Investment')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

        const investibleCapital = fundBatches
            ?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;
        
        const administrativeBalance = adminTransactions
            ?.reduce((sum, tx) => sum + tx.amount, 0) || 0;

        return { totalEarnings, totalInvestedByPlatform, investibleCapital, administrativeBalance };
    }, [transactions, fundBatches, adminTransactions]);


    return (
        <div>
            <PageHeader
                title="Platform Account"
                description="An overview of the platform's internal funds, earnings, and investments."
                icon={Banknote}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Platform Earnings</CardTitle>
                        <span className="text-muted-foreground font-bold text-lg">₦</span>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalEarnings)}</div>}
                        <p className="text-xs text-muted-foreground">Sum of all 'PlatformEarning' transactions.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Capital Invested</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalInvestedByPlatform)}</div>}
                        <p className="text-xs text-muted-foreground">Total amount the platform has invested in deals.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Current Investible Capital</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.investibleCapital)}</div>}
                        <p className="text-xs text-muted-foreground">Available funds for new deals.</p>
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
            </div>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        <span>Platform Fund Batches</span>
                    </CardTitle>
                    <CardDescription>
                        Capital earned by the platform, now available for investment in new deals.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Date Created</TableHead>
                            <TableHead>Original Amount</TableHead>
                            <TableHead className="text-right">Investible Balance</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {isLoading && Array.from({length: 3}).map((_, i) => (
                           <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && fundBatches?.map(batch => (
                            <TableRow key={batch.id}>
                                <TableCell>{formatDate(batch.createdAt)}</TableCell>
                                <TableCell className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</TableCell>
                                <TableCell className="text-right text-green-500 font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}</TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && !fundBatches?.length && (
                             <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    No fund batches found for the platform.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        <span>Administrative Activity</span>
                    </CardTitle>
                    <CardDescription>
                       Manage operational funds: deposits, expenses, and transfers.
                    </CardDescription>
                    <div className="flex gap-2 pt-2">
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
                <CardContent>
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
                        {isLoading && Array.from({length: 4}).map((_, i) => (
                           <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && adminTransactions?.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                <TableCell><Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge></TableCell>
                                <TableCell>{tx.description}</TableCell>
                                <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-green-500' : ''}`}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}</TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && !adminTransactions?.length && (
                             <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No administrative activities found.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
    );
}
