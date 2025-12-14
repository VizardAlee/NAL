
'use client';

import { PageHeader } from "@/components/page-header";
import { Gavel, AlertTriangle, Users, Phone } from "lucide-react";
import { useCollection, useFirestore } from "@/firebase";
import { collection, query, where, Timestamp, orderBy, type DocumentData } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";


type Repayment = DocumentData & {
  id: string;
  clientId: string;
  dealId: string;
  amount: number;
  status: 'Pending';
  dueDate: Timestamp;
};

type User = DocumentData & {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
    role: 'Client' | 'Investor';
};

type Deal = DocumentData & {
    id: string;
    dealName: string;
};

export default function LegalDashboardPage() {
    const firestore = useFirestore();
    const isMobile = useIsMobile();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');

    const overdueRepaymentsQuery = useMemo(() => {
        if (!firestore) return null;
        const thirtyDaysAgo = subDays(new Date(), 30);
        return query(
            collection(firestore, 'repayments'),
            where('status', '==', 'Pending'),
            where('dueDate', '<', Timestamp.fromDate(thirtyDaysAgo)),
            orderBy('dueDate', 'asc')
        );
    }, [firestore]);
    
    const usersQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'), where('role', 'in', ['Client', 'Investor']));
    }, [firestore]);
    
    const dealsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'deals'));
    }, [firestore]);

    const { data: overdueRepayments, loading: overdueLoading } = useCollection<Repayment>(overdueRepaymentsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);
    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);

    const isLoading = overdueLoading || usersLoading || dealsLoading;

    const enrichedOverdueRepayments = useMemo(() => {
        if (!overdueRepayments || !users || !deals) return [];
        
        const repaymentMap = new Map<string, any>();

        overdueRepayments.forEach(repayment => {
            const client = users.find(u => u.id === repayment.clientId);
            const deal = deals.find(d => d.id === repayment.dealId);

            if (repaymentMap.has(repayment.clientId)) {
                const existing = repaymentMap.get(repayment.clientId);
                existing.overdueAmount += repayment.amount;
                if (!existing.deals.has(deal?.dealName)) {
                     existing.deals.add(deal?.dealName || 'Unknown Deal');
                }
            } else {
                 repaymentMap.set(repayment.clientId, {
                    clientName: client?.name || 'Unknown Client',
                    clientId: repayment.clientId,
                    overdueAmount: repayment.amount,
                    deals: new Set([deal?.dealName || 'Unknown Deal']),
                    lastDueDate: repayment.dueDate.toDate(),
                });
            }
        });
        
        return Array.from(repaymentMap.values()).sort((a,b) => a.lastDueDate - b.lastDueDate);

    }, [overdueRepayments, users, deals]);
    
    const filteredUsers = useMemo(() => {
        if (!users) return [];
        return users.filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleUserClick = (userId: string) => {
        router.push(`/admin/users/${userId}`);
    };

    return (
        <div>
            <PageHeader
                title="Legal Dashboard"
                description="Access user information and monitor overdue accounts."
                icon={Gavel}
            />

            <Card className="mb-8 border-amber-500">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle /> Overdue Payments (30+ Days)</CardTitle>
                    <CardDescription>Clients with payments that are more than 30 days past their due date.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-24 w-full" /> : 
                     enrichedOverdueRepayments.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No clients have payments overdue by more than 30 days.</p> :
                     isMobile ? (
                        <div className="space-y-3">
                            {enrichedOverdueRepayments.map(item => (
                                <Card key={item.clientId}>
                                    <CardContent className="p-4 space-y-2">
                                        <p className="font-semibold">{item.clientName}</p>
                                        <p className="text-sm text-destructive font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.overdueAmount)}</p>
                                        <p className="text-xs text-muted-foreground">Deals: {Array.from(item.deals).join(', ')}</p>
                                        <p className="text-xs text-muted-foreground">Last Overdue Since: {format(item.lastDueDate, 'PPP')}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                     ) :
                     (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Affected Deals</TableHead>
                                    <TableHead>Last Overdue Since</TableHead>
                                    <TableHead className="text-right">Total Overdue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {enrichedOverdueRepayments.map(item => (
                                    <TableRow key={item.clientId} className="hover:bg-muted/50">
                                        <TableCell className="font-medium">{item.clientName}</TableCell>
                                        <TableCell className="text-muted-foreground">{Array.from(item.deals).join(', ')}</TableCell>
                                        <TableCell>{formatDistanceToNow(item.lastDueDate, { addSuffix: true })}</TableCell>
                                        <TableCell className="text-right font-bold text-destructive">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.overdueAmount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                     )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users /> User Directory</CardTitle>
                    <CardDescription>A directory of all clients and investors on the platform.</CardDescription>
                    <div className="pt-2">
                        <Input 
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-48 w-full" /> :
                     isMobile ? (
                        <div className="space-y-3">
                            {filteredUsers.map(user => (
                                <Card key={user.id} onClick={() => handleUserClick(user.id)} className="cursor-pointer hover:bg-muted/50">
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex items-center gap-4">
                                            <Avatar>
                                                <AvatarImage src={`https://picsum.photos/seed/${user.id}/128/128`} />
                                                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1">
                                                <p className="font-medium">{user.name}</p>
                                                <Badge variant="outline">{user.role}</Badge>
                                            </div>
                                        </div>
                                        <div className="text-sm text-muted-foreground pt-2 border-t mt-2 space-y-1">
                                            <p>{user.email}</p>
                                            {user.phoneNumber && <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{user.phoneNumber}</p>}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                     ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Phone Number</TableHead>
                                    <TableHead>Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map(user => (
                                    <TableRow key={user.id} onClick={() => handleUserClick(user.id)} className="cursor-pointer hover:bg-muted/50">
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>{user.phoneNumber || 'N/A'}</TableCell>
                                        <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                     )}
                     {filteredUsers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No users found.</p>}
                </CardContent>
            </Card>
        </div>
    );
}
