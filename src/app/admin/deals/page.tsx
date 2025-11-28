
'use client';

import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, PlusCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, DocumentData } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateDealForm } from './create-deal-form';
import { Deal } from '@/lib/types';
import { format } from 'date-fns';

function DealsTable({ deals, loading }: { deals: Deal[] | null, loading: boolean }) {
  return (
    <div className="rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Interest Rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
              </TableRow>
            ))}
          {!loading && deals?.map((deal) => (
            <TableRow key={deal.id}>
              <TableCell className="font-medium">{deal.dealName}</TableCell>
              <TableCell>{deal.clientName}</TableCell>
              <TableCell>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.principal)}</TableCell>
              <TableCell>{deal.interestRate}%</TableCell>
              <TableCell>
                <Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>
                  {deal.status}
                </Badge>
              </TableCell>
               <TableCell>
                {deal.createdAt ? format(new Date(deal.createdAt), 'PPP') : 'N/A'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
       {!loading && deals?.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
            No deals found. Create one to get started.
        </div>
       )}
    </div>
  );
}


export default function DealsPage() {
  const [isCreateDealOpen, setCreateDealOpen] = useState(false);
  const firestore = useFirestore();
  const { user } = useUser();

  const dealsQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'deals'));
  }, [firestore, user]);

  const { data: deals, loading } = useCollection<Deal>(dealsQuery);

  return (
    <div>
      <PageHeader
        title="Deal Management"
        description="Create, view, and manage all financing deals."
        icon={FileText}
      >
        <Dialog open={isCreateDealOpen} onOpenChange={setCreateDealOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Deal</DialogTitle>
            </DialogHeader>
            <CreateDealForm onDealCreated={() => setCreateDealOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      
      <DealsTable deals={deals} loading={loading} />
    </div>
  );
}
