
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
import { FileText, PlusCircle, ChevronRight } from 'lucide-react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';

const statusVariant = {
  Pending: 'secondary',
  Active: 'default',
  Completed: 'outline',
  Terminated: 'destructive',
} as const;

function DealsTable({ deals, loading }: { deals: Deal[] | null, loading: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const handleRowClick = (dealId: string) => {
    router.push(`/admin/deals/${dealId}`);
  };

  const formatDate = (timestamp: Timestamp | Date | string | undefined) => {
    if (!timestamp) return 'N/A';
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PPP');
    }
    try {
      return format(new Date(timestamp as any), 'PPP');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  if (loading) {
    if (isMobile) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      );
    }
    return (
      <div className="rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal Name</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Principal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  if (!deals || deals.length === 0) {
    return (
       <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
          No deals found. Create one to get started.
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {deals.map((deal) => (
          <Card key={deal.id} onClick={() => handleRowClick(deal.id)} className="cursor-pointer hover:bg-muted/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex-1 space-y-1">
                <p className="font-medium">{deal.dealName}</p>
                <p className="text-sm text-muted-foreground truncate">{deal.clientName}</p>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</span>
                    <Badge variant={statusVariant[deal.status]}>{deal.status}</Badge>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id} onClick={() => handleRowClick(deal.id)} className="cursor-pointer">
              <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
              <TableCell data-label="Client">{deal.clientName}</TableCell>
              <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
              <TableCell data-label="Status">
                <Badge variant={statusVariant[deal.status]}>
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
