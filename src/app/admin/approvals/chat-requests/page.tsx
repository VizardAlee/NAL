
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
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, DocumentData, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


type ChatRequest = DocumentData & {
  id: string;
  userId: string;
  userName: string;
  userRole: 'Investor' | 'Client';
  requestedAt: Timestamp;
};

export default function ChatRequestsPage() {
    const firestore = useFirestore();
    const { user: adminUser } = useUser();
    const { toast } = useToast();
    const router = useRouter();
    const isMobile = useIsMobile();
    const [processingId, setProcessingId] = useState<string | null>(null);

    const requestsQuery = useMemo(() => firestore ? query(collection(firestore, 'chatRequests')) : null, [firestore]);
    const { data: requests, loading } = useCollection<ChatRequest>(requestsQuery);
    
    const handleInitiateChat = async (request: ChatRequest) => {
        if (!firestore || !adminUser || !adminUser.displayName) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in as an admin to perform this action.'});
            return;
        };

        setProcessingId(request.id);
        
        try {
            const batch = writeBatch(firestore);

            // 1. Create a new conversation document
            const newConversationRef = doc(collection(firestore, 'conversations'));
            batch.set(newConversationRef, {
                participantIds: [adminUser.uid, request.userId],
                participantNames: [adminUser.displayName, request.userName],
                // Placeholder avatars, you might get these from user profiles
                participantAvatars: [`https://picsum.photos/seed/${adminUser.uid}/128/128`, `https://picsum.photos/seed/${request.userId}/128/128`],
                lastMessage: `Conversation started by ${adminUser.displayName}.`,
                lastMessageSenderId: adminUser.uid,
                lastUpdatedAt: Timestamp.now(),
                readBy: [adminUser.uid],
            });

            // 2. Delete the chat request
            const requestRef = doc(firestore, 'chatRequests', request.id);
            batch.delete(requestRef);

            await batch.commit();

            toast({
                title: 'Chat Initiated',
                description: `A conversation with ${request.userName} has been created.`,
            });
            
            // Redirect to the new conversation page (we'll build this next)
            // For now, let's just log it. A full implementation would redirect.
            // router.push(`/admin/messages/${newConversationRef.id}`);

        } catch (error) {
            console.error("Chat Initiation Error: ", error);
            toast({
                variant: 'destructive',
                title: "Failed to Initiate Chat",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
        } finally {
            setProcessingId(null);
        }
    };


    const renderContent = () => {
        if (loading) {
            if (isMobile) {
                return (
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                    </div>
                );
            }
            return (
                <Table>
                    <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Requested</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-8 w-32 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            );
        }

        if (!requests || requests.length === 0) {
            return (
                <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
                    No pending chat requests.
                </div>
            );
        }
        
        if (isMobile) {
            return (
                 <div className="space-y-3">
                    {requests.map(req => (
                        <Card key={req.id}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-4">
                                     <Avatar>
                                        <AvatarImage src={`https://picsum.photos/seed/${req.userId}/128/128`} />
                                        <AvatarFallback>{req.userName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="font-medium">{req.userName}</p>
                                        <p className="text-sm text-muted-foreground">{req.userRole}</p>
                                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(req.requestedAt.toDate(), { addSuffix: true })}</p>
                                    </div>
                                </div>
                                <div className="pt-3 border-t">
                                    <Button className="w-full" size="sm" onClick={() => handleInitiateChat(req)} disabled={processingId === req.id}>
                                        {processingId === req.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                                        Initiate Chat
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.map(req => (
                        <TableRow key={req.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarImage src={`https://picsum.photos/seed/${req.userId}/128/128`} />
                                        <AvatarFallback>{req.userName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span>{req.userName}</span>
                                </div>
                            </TableCell>
                            <TableCell>{req.userRole}</TableCell>
                            <TableCell>{formatDistanceToNow(req.requestedAt.toDate(), { addSuffix: true })}</TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" onClick={() => handleInitiateChat(req)} disabled={processingId === req.id}>
                                    {processingId === req.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                                    Initiate Chat
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    return (
        <div>
            <PageHeader
                title="Chat Requests"
                description="Review user requests to start a new conversation."
                icon={MessageSquarePlus}
            />
            <Card>
                <CardContent className="p-0">
                    {renderContent()}
                </CardContent>
            </Card>
        </div>
    );
}
