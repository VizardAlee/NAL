
'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from "@/components/page-header";
import { LayoutDashboard, Users, UserPlus, Banknote, Briefcase, Copy, Star } from "lucide-react";
import { useUser } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getMarketerStats } from './actions';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type MarketerStats = {
    referredClientCount: number;
    referredInvestorCount: number;
    totalInvestorCapital: number;
    totalDealValue: number;
    referredClients: string[];
    referredInvestors: string[];
    deals: { dealName: string, clientName: string, status: string, principal: number }[];
}

function StatCard({ title, value, icon: Icon, isLoading }: { title: string, value: string, icon: React.ElementType, isLoading: boolean }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{value}</div>}
            </CardContent>
        </Card>
    );
}

export default function MarketerDashboardPage() {
    const { user, loading: userLoading } = useUser();
    const { toast } = useToast();
    const [stats, setStats] = useState<MarketerStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user && user.referralCode) {
            getMarketerStats(user.uid, user.referralCode).then(result => {
                if (result.success) {
                    setStats(result.data as MarketerStats);
                } else {
                    toast({
                        variant: 'destructive',
                        title: "Error fetching stats",
                        description: result.message
                    });
                }
                setLoading(false);
            });
        } else if (!userLoading) {
            setLoading(false);
        }
    }, [user, userLoading, toast]);

    const handleCopyCode = () => {
        if (!user?.referralCode) return;
        navigator.clipboard.writeText(user.referralCode);
        toast({ title: "Copied!", description: "Your referral code has been copied to the clipboard." });
    };

    const isLoading = userLoading || loading;

    return (
        <div>
            <PageHeader
                title="Marketer Dashboard"
                description="Track your referrals and performance."
                icon={LayoutDashboard}
            />

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Your Referral Code</CardTitle>
                        <CardDescription>Share this code with potential clients and investors. They will enter it during sign-up.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        {isLoading ? <Skeleton className="h-10 w-64" /> : (
                             <p className="text-2xl font-mono font-bold p-3 bg-muted rounded-md tracking-widest">{user?.referralCode || 'N/A'}</p>
                        )}
                        <Button onClick={handleCopyCode} disabled={isLoading || !user?.referralCode}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Code
                        </Button>
                    </CardContent>
                </Card>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Referred Clients" value={stats?.referredClientCount?.toString() || '0'} icon={Users} isLoading={isLoading} />
                    <StatCard title="Referred Investors" value={stats?.referredInvestorCount?.toString() || '0'} icon={UserPlus} isLoading={isLoading} />
                    <StatCard title="Total Investor Capital" value={new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(stats?.totalInvestorCapital || 0)} icon={Banknote} isLoading={isLoading} />
                    <StatCard title="Total Deal Value" value={new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(stats?.totalDealValue || 0)} icon={Briefcase} isLoading={isLoading} />
                </div>
                
                <div className="grid gap-6 lg:grid-cols-2">
                     <Card>
                        <CardHeader>
                            <CardTitle>Referred Users</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold mb-2">Investors ({stats?.referredInvestors?.length || 0})</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                                        {isLoading ? <Skeleton className="h-20 w-full" /> : 
                                            stats?.referredInvestors?.map((name, i) => <li key={i}>{name}</li>)
                                        }
                                    </ul>
                                </div>
                                 <div>
                                    <h4 className="font-semibold mb-2">Clients ({stats?.referredClients?.length || 0})</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                                        {isLoading ? <Skeleton className="h-20 w-full" /> : 
                                            stats?.referredClients?.map((name, i) => <li key={i}>{name}</li>)
                                        }
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>Performance Rating</CardTitle>
                             <CardDescription>Your automated rating based on client performance.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                            <Star className="mx-auto h-16 w-16 text-yellow-400 fill-yellow-400" />
                            <p className="text-4xl font-bold mt-2">{(user?.rating || 0).toFixed(1)} / 5.0</p>
                            <p className="text-sm text-muted-foreground mt-1">Rating updates periodically</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Attributed Deals</CardTitle>
                        <CardDescription>Deals from your referred clients or those manually attributed to you by an admin.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Deal Name</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({length: 3}).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-5 w-28 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : stats && stats.deals.length > 0 ? (
                                    stats.deals.map((deal, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{deal.dealName}</TableCell>
                                            <TableCell>{deal.clientName}</TableCell>
                                            <TableCell><Badge>{deal.status}</Badge></TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            No deals attributed to you yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
