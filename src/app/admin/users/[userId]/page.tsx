
'use client';

import { useMemo, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { User, Landmark, History, Banknote, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AddFundForm } from './add-fund-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Naira } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ViewPageNav } from '@/components/view-page-nav';

type UserProfile = DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client';
};

type FundBatch = DocumentData & {
  id: string;
  sourceId: string;
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
};

type Transaction = DocumentData & {
  id: string;
  type: string;
  amount: number;
  createdAt: Timestamp;
};

function UserDetailSkeleton() {
    return (
        <div>
            <PageHeader
                title="User Profile"
                description="Loading user details..."
                icon={User}
            />
             <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader className="flex-row items-center gap-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <div className='space-y-2'>
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                        </CardHeader>
                    </Card>
                </div>
             </div>
        </div>
    )
}

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, 'PPP p');
    } catch {
      return 'Invalid Date';
    }
  };


export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const firestore = useFirestore();
  const [isAddFundOpen, setAddFundOpen] = useState(false);

  const userRef = useMemo(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId);
  }, [firestore, userId]);

  const fundBatchesQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'fundBatches'), where('sourceId', '==', userId));
  }, [firestore, userId]);

  const transactionsQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', userId));
  }, [firestore, userId]);

  const { data: user, loading: userLoading } = useDoc<UserProfile>(userRef);
  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const isLoading = userLoading || fundBatchesLoading || transactionsLoading;

  const investibleBalance = useMemo(() => {
      if (!fundBatches) return 0;
      return fundBatches.reduce((sum, batch) => sum + batch.remainingAmount, 0);
  }, [fundBatches]);

  if (isLoading) {
    return <UserDetailSkeleton />;
  }

  if (!user) {
    return notFound();
  }

  return (
    <div>
        <PageHeader
            title={user.name}
            description={user.email}
            icon={User}
        >
            <ViewPageNav homePath="/admin/dashboard" />
        </PageHeader>
        <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column */}
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                         <Avatar className="h-16 w-16">
                            <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`} />
                            <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className='font-headline text-2xl'>{user.name}</CardTitle>
                            <Badge variant="secondary" className="mt-1">{user.role}</Badge>
                        </div>
                    </CardHeader>
                </Card>

                {user.role === 'Investor' && (
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Investible Balance</CardTitle>
                             <CardDescription>
                                Total capital available for new deals.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="text-3xl font-bold font-headline">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(investibleBalance)}
                            </div>
                           <Dialog open={isAddFundOpen} onOpenChange={setAddFundOpen}>
                            <DialogTrigger asChild>
                                <Button className="w-full">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add Funds
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                <DialogTitle>Add Funds to Investor Account</DialogTitle>
                                </DialogHeader>
                                <AddFundForm userId={userId} />
                            </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Right Column */}
            {user.role === 'Investor' && (
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Landmark className="h-5 w-5" />
                                <span>Fund Batches</span>
                            </CardTitle>
                             <CardDescription>
                                Capital deposited by this investor, available for deals.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Total Amount</TableHead>
                                    <TableHead className="text-right">Investible Balance</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {fundBatches?.map(batch => (
                                    <TableRow key={batch.id}>
                                        <TableCell>{formatDate(batch.createdAt)}</TableCell>
                                        <TableCell className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</TableCell>
                                        <TableCell className="text-right text-green-500 font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}</TableCell>
                                    </TableRow>
                                ))}
                                {!fundBatches?.length && (
                                     <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            No fund batches found.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-5 w-5" />
                                <span>Transaction History</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                           <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {transactions?.map(tx => (
                                    <TableRow key={tx.id}>
                                        <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                        <TableCell><Badge variant={tx.type === 'Deposit' ? 'default' : 'secondary'}>{tx.type}</Badge></TableCell>
                                        <TableCell className={`text-right font-medium ${tx.type === 'Deposit' ? 'text-green-500' : ''}`}>
                                            {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!transactions?.length && (
                                     <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            No transactions found.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    </div>
  );
}
