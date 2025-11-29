
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
import { collection, query, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateDealForm } from './create-deal-form';
import { Deal } from '@/lib/types';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

function DealsTable({ deals, loading }: { deals: Deal[] | null, loading: boolean }) {
  const router = useRouter();

  const handleRowClick = (dealId: string) => {
    router.push(`/admin/deals/${dealId}`);
  };

  const formatDate = (timestamp: Timestamp | Date | string | undefined) => {
    if (!timestamp) return 'N/A';
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PPP');
    }
    // Handle cases where it might already be a Date object or a string
    try {
      return format(new Date(timestamp as any), 'PPP');
    } catch (e) {
      return 'Invalid Date';
    }
  };
  
  return (
    <div className="rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell data-label="Deal Name"><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell data-label="Client"><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell data-label="Principal"><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell data-label="Duration"><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell data-label="Status"><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell data-label="Created At"><Skeleton className="h-5 w-24" /></TableCell>
              </TableRow>
            ))}
          {!loading && deals?.map((deal) => (
            <TableRow key={deal.id} onClick={() => handleRowClick(deal.id)} className="cursor-pointer">
              <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
              <TableCell data-label="Client">{deal.clientName}</TableCell>
              <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
              <TableCell data-label="Duration">{deal.durationValue} {deal.durationUnit}</TableCell>
              <TableCell data-label="Status">
                <Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>
                  {deal.status}
                </Badge>
              </TableCell>
               <TableCell data-label="Created At">
                {formatDate(deal.createdAt)}
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
          <DialogContent className="max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create New Deal</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[80vh] p-0">
                <div className="p-6">
                    <CreateDealForm onDealCreated={() => setCreateDealOpen(false)} />
                </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </PageHeader>
      
      <DealsTable deals={deals} loading={loading} />
    </div>
  );
}
