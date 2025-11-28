
'use client';

import { useMemo } from 'react';
import { notFound, useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { User, Landmark, History, Banknote } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AddFundForm } from './add-fund-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Naira } from '@/components/icons';

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
        />
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
                            <CardTitle className="flex items-center gap-2">
                                <Banknote className="h-5 w-5" />
                                <span>Add Funds</span>
                            </CardTitle>
                            <CardDescription>
                                Deposit capital into the investor's account. This will create a new fund batch and a deposit transaction.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <AddFundForm userId={userId} />
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
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {fundBatches?.map(batch => (
                                    <TableRow key={batch.id}>
                                        <TableCell>{formatDate(batch.createdAt)}</TableCell>
                                        <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</TableCell>
                                        <TableCell className="text-right text-green-500">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}</TableCell>
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
