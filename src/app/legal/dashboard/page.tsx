
'use client';

import { PageHeader } from "@/components/page-header";
import { Gavel, AlertTriangle, Users, Phone, Loader2, FileText, Send, MessageCircle } from "lucide-react";
import { useCollection, useFirestore, useUser } from "@/firebase";
import { collection, query, where, Timestamp, orderBy, type DocumentData, doc } from "firebase/firestore";
import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addRecoveryLogAction } from '@/app/recovery/dashboard/actions';
import { hasPersona, type LegacyRole, type Persona } from "@/lib/access-control";


type RecoveryTask = DocumentData & {
    id: string;
    clientId: string;
    clientName: string;
    clientEmail: string;
    clientPhoneNumber: string;
    dealId: string;
    dealName: string;
    repaymentId: string;
    amountDue: number;
    dueDate: Timestamp;
    status: 'Due_Recovery' | 'Escalated_Legal' | 'Resolved';
    lastLog?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
};

type User = DocumentData & {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
    role?: LegacyRole;
    personas?: Persona[];
};

type Log = DocumentData & {
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    createdAt: Timestamp;
};


function LogEntryForm({ taskId, authorId, authorName }: { taskId: string, authorId: string, authorName: string }) {
    const [text, setText] = useState('');
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;

        startTransition(async () => {
            const result = await addRecoveryLogAction({
                taskId,
                logText: text,
                authorId,
                authorName
            });
            if (result.success) {
                toast({ title: "Success", description: result.message });
                setText('');
            } else {
                toast({ variant: 'destructive', title: "Error", description: result.message });
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} className="flex items-start gap-2 pt-4">
            <Textarea
                placeholder="Add a note about contact attempts, conversations, etc..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                disabled={isPending}
            />
            <Button type="submit" size="icon" disabled={isPending || !text.trim()}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
        </form>
    )
}

function TaskDetailsSheet({ task, user }: { task: RecoveryTask, user: any }) {
    const firestore = useFirestore();

    const logsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, `recoveryTasks/${task.id}/logs`), orderBy('createdAt', 'desc'));
    }, [firestore, task.id]);

    const { data: logs, loading: logsLoading } = useCollection<Log>(logsQuery);

    return (
        <SheetContent className="w-full sm:max-w-md flex flex-col">
            <SheetHeader>
                <SheetTitle>{task.clientName}</SheetTitle>
                <SheetDescription>
                    Legal Escalation for: <span className="font-medium text-foreground">{task.dealName}</span>
                </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4 flex-1 overflow-y-auto pr-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><Users /> Client Details</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <p><strong>Email:</strong> {task.clientEmail}</p>
                        <p><strong>Phone:</strong> {task.clientPhoneNumber}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><FileText /> Payment Details</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <p><strong>Amount Due:</strong> {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(task.amountDue)}</p>
                        <p><strong>Due Date:</strong> {format(task.dueDate.toDate(), 'PPP')}</p>
                    </CardContent>
                </Card>
                <div>
                    <h4 className="font-medium text-lg mb-2">Contact History</h4>
                    <div className="space-y-4">
                        {logsLoading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
                        {logs && logs.length > 0 ? logs.map(log => (
                            <div key={log.id} className="flex items-start gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={`https://picsum.photos/seed/${log.authorId}/128/128`} />
                                    <AvatarFallback>{log.authorName?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-medium">{log.authorName}</span>
                                        <span className="text-muted-foreground">{formatDistanceToNow(log.createdAt.toDate(), { addSuffix: true })}</span>
                                    </div>
                                    <p className="text-sm bg-muted p-2 rounded-md">{log.text}</p>
                                </div>
                            </div>
                        )) : <p className="text-sm text-muted-foreground text-center py-4">No logs yet.</p>}
                    </div>
                </div>
            </div>
            <div className="mt-auto border-t pt-4">
                <LogEntryForm taskId={task.id} authorId={user.uid} authorName={user.displayName} />
            </div>
        </SheetContent>
    )
}

export default function LegalDashboardPage() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    const isMobile = useIsMobile();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTask, setSelectedTask] = useState<RecoveryTask | null>(null);

    const legalTasksQuery = useMemo(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'recoveryTasks'),
            where('status', '==', 'Escalated_Legal'),
            orderBy('dueDate', 'asc')
        );
    }, [firestore]);

    const usersQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const { data: legalTasks, loading: tasksLoading } = useCollection<RecoveryTask>(legalTasksQuery);
    const { data: users, loading: usersLoadingDB } = useCollection<User>(usersQuery);

    const isLoading = tasksLoading || usersLoadingDB || userLoading;

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        const normalizedSearch = searchTerm.toLowerCase();
        return users.filter(user => {
            const isRelevantPersona = hasPersona(user, 'CLIENT') || hasPersona(user, 'INVESTOR');
            if (!isRelevantPersona) return false;
            return (
                user.name.toLowerCase().includes(normalizedSearch) ||
                user.email.toLowerCase().includes(normalizedSearch)
            );
        });
    }, [users, searchTerm]);

    const handleUserClick = (userId: string) => {
        router.push(`/admin/users/${userId}`);
    };

    return (
        <Sheet open={!!selectedTask} onOpenChange={(isOpen) => !isOpen && setSelectedTask(null)}>
            <PageHeader
                title="Legal Dashboard"
                description="Access user information and monitor escalated accounts."
                icon={Gavel}
            />

            <Card className="mb-8 border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle /> Red Alert: Escalated Accounts</CardTitle>
                    <CardDescription>Clients with payments that are more than 7 days past due and require legal action.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-24 w-full" /> :
                        !legalTasks || legalTasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No accounts have been escalated for legal action.</p> :
                            isMobile ? (
                                <div className="space-y-3">
                                    {legalTasks.map(task => (
                                        <SheetTrigger key={task.id} asChild>
                                            <Card onClick={() => setSelectedTask(task)}>
                                                <CardContent className="p-4 space-y-2">
                                                    <p className="font-semibold">{task.clientName}</p>
                                                    <p className="text-sm text-destructive font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(task.amountDue)}</p>
                                                    <p className="text-xs text-muted-foreground">Due since: {format(task.dueDate.toDate(), 'PPP')}</p>
                                                    {task.lastLog && <p className="text-xs text-muted-foreground italic truncate pt-1 border-t">Last Log: {task.lastLog}</p>}
                                                </CardContent>
                                            </Card>
                                        </SheetTrigger>
                                    ))}
                                </div>
                            ) :
                                (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Client</TableHead>
                                                <TableHead>Deal</TableHead>
                                                <TableHead>Due Since</TableHead>
                                                <TableHead>Last Log</TableHead>
                                                <TableHead className="text-right">Total Overdue</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {legalTasks.map(task => (
                                                <SheetTrigger key={task.id} asChild>
                                                    <TableRow onClick={() => setSelectedTask(task)} className="cursor-pointer hover:bg-muted/50">
                                                        <TableCell className="font-medium flex items-center gap-2">
                                                            <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                                            {task.clientName}
                                                        </TableCell>
                                                        <TableCell>{task.dealName}</TableCell>
                                                        <TableCell>{formatDistanceToNow(task.dueDate.toDate(), { addSuffix: true })}</TableCell>
                                                        <TableCell className="text-muted-foreground italic max-w-xs truncate">{task.lastLog || 'No logs yet'}</TableCell>
                                                        <TableCell className="text-right font-bold text-destructive">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(task.amountDue)}</TableCell>
                                                    </TableRow>
                                                </SheetTrigger>
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
                                                    <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
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
            {selectedTask && user && <TaskDetailsSheet task={selectedTask} user={user} />}
        </Sheet>
    );
}
