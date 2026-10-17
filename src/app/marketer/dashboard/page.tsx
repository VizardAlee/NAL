
'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from "@/components/page-header";
import { LayoutDashboard, Users, UserPlus, Banknote, Briefcase, Star } from "lucide-react";
import { useAuth, useUser } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getMarketerStats } from './actions';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import { historicalReferralCode, type MarketerStats } from '@/lib/marketer';

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
    const auth = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<MarketerStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setStats(null);
        if (user && auth?.currentUser) {
            setLoading(true);
            auth.currentUser.getIdToken().then(authToken => getMarketerStats({ authToken, marketerId: user.uid }))
                .then(result => {
                    if (!active) return;
                    if (result.success) setStats(result.data as MarketerStats);
                    else toast({ variant: 'destructive', title: 'Statistics unavailable', description: result.message });
                }).catch(error => {
                    if (active) toast({ variant: 'destructive', title: 'Statistics unavailable', description: error instanceof Error ? error.message : 'Please retry.' });
                }).finally(() => { if (active) setLoading(false); });
        } else if (!userLoading) {
            setLoading(false);
        }
        return () => { active = false; };
    }, [auth, user, userLoading, toast]);

    const isLoading = userLoading || loading;

    return (
        <div>
            <PageHeader
                title="Marketer Dashboard"
                description="Review attributed deals and historical performance."
                icon={LayoutDashboard}
            />

            <Alert className="mb-6"><AlertTitle>Referral-code signup is paused</AlertTitle><AlertDescription>Administrators can still attribute deals to marketers. Historical referral reporting is retained; referral metrics and ratings are unavailable without historical attribution.</AlertDescription></Alert>
            <div className="grid gap-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Referred Clients" value={stats?.referredClientCount != null ? stats.referredClientCount.toString() : 'Unavailable'} icon={Users} isLoading={isLoading} />
                    <StatCard title="Referred Investors" value={stats?.referredInvestorCount != null ? stats.referredInvestorCount.toString() : 'Unavailable'} icon={UserPlus} isLoading={isLoading} />
                    <StatCard title="Total Investor Capital" value={stats?.totalInvestorCapital != null ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(stats.totalInvestorCapital) : 'Unavailable'} icon={Banknote} isLoading={isLoading} />
                    <StatCard title="Total Deal Value" value={stats ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(stats.totalDealValue) : 'Unavailable'} icon={Briefcase} isLoading={isLoading} />
                </div>
                
                <div className="grid gap-6 lg:grid-cols-2">
                     <Card>
                        <CardHeader>
                            <CardTitle>Historical Referrals</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold mb-2">Investors ({stats?.referredInvestors?.length ?? 'Unavailable'})</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                                        {isLoading ? <Skeleton className="h-20 w-full" /> : 
                                            stats?.referredInvestors ? stats.referredInvestors.map((name, i) => <li key={i}>{name}</li>) : <li>Unavailable</li>
                                        }
                                    </ul>
                                </div>
                                 <div>
                                    <h4 className="font-semibold mb-2">Clients ({stats?.referredClients?.length ?? 'Unavailable'})</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                                        {isLoading ? <Skeleton className="h-20 w-full" /> : 
                                            stats?.referredClients ? stats.referredClients.map((name, i) => <li key={i}>{name}</li>) : <li>Unavailable</li>
                                        }
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>Performance Rating</CardTitle>
                             <CardDescription>Historical rating based on referred client performance.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                            <Star className="mx-auto h-16 w-16 text-yellow-400 fill-yellow-400" />
                            <p className="text-4xl font-bold mt-2">{historicalReferralCode(user) && typeof user?.rating === 'number' && Number.isFinite(user.rating) ? user.rating.toFixed(1) + ' / 5.0' : 'Not available'}</p>
                            <p className="text-sm text-muted-foreground mt-1">Accounts without historical attribution are skipped during rating updates.</p>
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
                                            {stats ? 'No deals attributed to you yet.' : 'Deal statistics unavailable.'}
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
