
'use client';

import { PageHeader } from "@/components/page-header";
import { Gavel, AlertTriangle, Users, Phone, Loader2, FileText, Send, MessageCircle, UserCheck } from "lucide-react";
import { useCollection, useFirestore, useUser } from "@/firebase";
import { collection, query, where, Timestamp, orderBy, type DocumentData } from "firebase/firestore";
import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { addRecoveryLogAction } from './actions';
import { useToast } from "@/hooks/use-toast";


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
    assigneeId?: string;
    assigneeName?: string;
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
                setText(''); // Clear textarea
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
                    Recovery task for deal: <span className="font-medium text-foreground">{task.dealName}</span>
                </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4 flex-1 overflow-y-auto pr-4">
                {task.assigneeName && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2"><UserCheck /> Assigned To</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-medium">{task.assigneeName}</p>
                        </CardContent>
                    </Card>
                )}
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

export default function RecoveryDashboardPage() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    const isMobile = useIsMobile();
    const [selectedTask, setSelectedTask] = useState<RecoveryTask | null>(null);

    const recoveryTasksQuery = useMemo(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'recoveryTasks'),
            where('status', '==', 'Due_Recovery'),
            orderBy('dueDate', 'asc')
        );
    }, [firestore]);

    const { data: recoveryTasks, loading: tasksLoading } = useCollection<RecoveryTask>(recoveryTasksQuery);

    const isLoading = tasksLoading || userLoading;

    return (
        <Sheet open={!!selectedTask} onOpenChange={(isOpen) => !isOpen && setSelectedTask(null)}>
            <PageHeader
                title="Recovery Dashboard"
                description="Manage clients with upcoming payments."
                icon={Gavel}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">Upcoming Payments</CardTitle>
                    <CardDescription>Clients with payments due in the next 3 days.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-48 w-full" /> :
                        !recoveryTasks || recoveryTasks.length === 0 ? <p className="text-center text-sm text-muted-foreground py-10">No upcoming recovery tasks.</p> :
                            isMobile ? (
                                <div className="space-y-3">
                                    {recoveryTasks.map(task => (
                                        <SheetTrigger key={task.id} asChild>
                                            <Card onClick={() => setSelectedTask(task)}>
                                                <CardContent className="p-4 space-y-2">
                                                    <p className="font-semibold">{task.clientName}</p>
                                                    <p className="text-sm text-primary font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(task.amountDue)}</p>
                                                    <p className="text-xs text-muted-foreground">Due: {format(task.dueDate.toDate(), 'PPP')}</p>
                                                    {task.assigneeName ? (
                                                        <p className="text-xs text-muted-foreground italic pt-1 border-t">Assigned to: {task.assigneeName}</p>
                                                    ) : task.lastLog && (
                                                        <p className="text-xs text-muted-foreground italic truncate pt-1 border-t">Last Log: {task.lastLog}</p>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </SheetTrigger>
                                    ))}
                                </div>
                            ) : (
                                <div className="relative overflow-auto">
                                    <table className="w-full caption-bottom text-sm">
                                        <thead className="[&_tr]:border-b">
                                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Client</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Deal</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Due Date</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Assigned To</th>
                                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount Due</th>
                                            </tr>
                                        </thead>
                                        <tbody className="[&_tr:last-child]:border-0">
                                            {recoveryTasks.map(task => (
                                                <SheetTrigger key={task.id} asChild>
                                                    <tr onClick={() => setSelectedTask(task)} className="cursor-pointer border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                        <td className="p-4 align-middle font-medium flex items-center gap-2">
                                                            <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                                            {task.clientName}
                                                        </td>
                                                        <td className="p-4 align-middle">{task.dealName}</td>
                                                        <td className="p-4 align-middle">{format(task.dueDate.toDate(), 'PPP')}</td>
                                                        <td className="p-4 align-middle text-muted-foreground">{task.assigneeName || 'Unassigned'}</td>
                                                        <td className="p-4 align-middle text-right font-bold text-primary">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(task.amountDue)}</td>
                                                    </tr>
                                                </SheetTrigger>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                </CardContent>
            </Card>
            {selectedTask && user && <TaskDetailsSheet task={selectedTask} user={user} />}
        </Sheet>
    );
}
