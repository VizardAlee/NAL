
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
  DialogClose,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, PlusCircle, ChevronRight, Edit, Trash2, Loader2 } from 'lucide-react';
import { useState, useMemo, useTransition } from 'react';
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
import { deleteDealAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { EditDealForm } from './edit-deal-form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { canWriteAdmin } from '@/lib/access-control';


const statusVariant = {
  Pending: 'secondary',
  Active: 'default',
  Completed: 'outline',
  Terminated: 'destructive',
} as const;

function DealActions({ deal, canManage, onActionStart, onActionEnd }: { deal: Deal, canManage: boolean, onActionStart: () => void, onActionEnd: () => void }) {
    const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setEditDialogOpen] = useState(false);
    const { toast } = useToast();

    const handleDelete = async () => {
        onActionStart();
        const result = await deleteDealAction(deal.id);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            setDeleteDialogOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        onActionEnd();
    };

    if (!canManage || deal.status !== 'Pending') {
        return null;
    }

    return (
        <div className="flex gap-2 justify-end">
            <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Edit className="mr-2 h-4 w-4" /> Edit</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Edit Deal: {deal.dealName}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[80vh] p-0">
                        <div className="p-6">
                            <EditDealForm deal={deal} onDealUpdated={() => setEditDialogOpen(false)} />
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the deal &quot;{deal.dealName}&quot;.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}


function DealsTable({ deals, loading, canManage }: { deals: Deal[] | null, loading: boolean, canManage: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isActionPending, startTransition] = useTransition();


  const handleRowClick = (dealId: string) => {
    router.push(`/admin/deals/${dealId}`);
  };

  const formatDate = (timestamp: Timestamp | Date | string | undefined) => {
    if (!timestamp) return 'N/A';
    if (timestamp instanceof Timestamp) {
      return format(timestamp.toDate(), 'PPP');
    }
    try {
      return format(timestamp instanceof Date ? timestamp : new Date(timestamp), 'PPP');
    } catch {
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
              <TableHead className="text-right">Actions</TableHead>
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
                <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
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
          {canManage ? 'No deals found. Create one to get started.' : 'No deals found.'}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {deals.map((deal) => (
          <Card key={deal.id}>
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-start justify-between cursor-pointer" onClick={() => handleRowClick(deal.id)}>
                    <div className="flex-1 space-y-1">
                        <p className="font-medium">{deal.dealName}</p>
                        <p className="text-sm text-muted-foreground truncate">{deal.clientName}</p>
                         <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</span>
                        </div>
                    </div>
                    <Badge variant={statusVariant[deal.status]}>{deal.status}</Badge>
                </div>
                 <div className="pt-3 border-t">
                    <DealActions 
                        deal={deal} 
                        canManage={canManage}
                        onActionStart={() => startTransition(() => {})} 
                        onActionEnd={() => {}}
                    />
                </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm">
      {isActionPending && <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"><Loader2 className="h-8 w-8 animate-spin"/></div>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id} >
              <TableCell data-label="Deal Name" className="font-medium cursor-pointer" onClick={() => handleRowClick(deal.id)}>{deal.dealName}</TableCell>
              <TableCell data-label="Client" className="cursor-pointer" onClick={() => handleRowClick(deal.id)}>{deal.clientName}</TableCell>
              <TableCell data-label="Principal" className="cursor-pointer" onClick={() => handleRowClick(deal.id)}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
              <TableCell data-label="Status" className="cursor-pointer" onClick={() => handleRowClick(deal.id)}>
                <Badge variant={statusVariant[deal.status]}>
                  {deal.status}
                </Badge>
              </TableCell>
               <TableCell data-label="Created At" className="cursor-pointer" onClick={() => handleRowClick(deal.id)}>
                {formatDate(deal.createdAt)}
              </TableCell>
              <TableCell>
                  <DealActions 
                    deal={deal} 
                    canManage={canManage}
                    onActionStart={() => startTransition(() => {})} 
                    onActionEnd={() => {}}
                  />
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Deal['status']>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'principal-desc' | 'principal-asc'>('newest');
  const firestore = useFirestore();
  const { user } = useUser();
  const canManageDeals = canWriteAdmin(user);

  const dealsQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'deals'));
  }, [firestore, user]);

  const { data: deals, loading } = useCollection<Deal>(dealsQuery);

  const visibleDeals = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...(deals || [])]
      .filter((deal) => {
        const matchesSearch =
          !normalizedSearch ||
          deal.dealName?.toLowerCase().includes(normalizedSearch) ||
          deal.clientName?.toLowerCase().includes(normalizedSearch);
        const matchesStatus = statusFilter === 'all' || deal.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'principal-desc') return (Number(b.principal) || 0) - (Number(a.principal) || 0);
        if (sortBy === 'principal-asc') return (Number(a.principal) || 0) - (Number(b.principal) || 0);

        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [deals, searchTerm, sortBy, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Deal Management"
        description="Create, view, and manage all financing deals."
        icon={FileText}
      >
        {canManageDeals && (
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
        )}
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by deal or client"
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger>
            <SelectValue placeholder="Sort deals" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="principal-desc">Highest principal</SelectItem>
            <SelectItem value="principal-asc">Lowest principal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <DealsTable deals={visibleDeals} loading={loading} canManage={canManageDeals} />
    </div>
  );
}
