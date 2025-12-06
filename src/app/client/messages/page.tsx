
'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { PageHeader } from "@/components/page-header";
import { MessageSquare, Loader2 } from "lucide-react";
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { requestChatWithAdmin } from '@/app/common/actions/chat-actions';
import { useToast } from '@/hooks/use-toast';

type Conversation = {
    id: string;
    participantIds: string[];
    participantNames: string[];
    participantAvatars: string[];
    lastMessage: string;
    lastMessageSenderId: string;
    lastUpdatedAt: Timestamp;
    readBy: string[];
};

function ConversationItem({ conversation, currentUserId }: { conversation: Conversation, currentUserId: string }) {
    const router = useRouter();
    
    const otherParticipantIndex = conversation.participantIds.findIndex(id => id !== currentUserId);
    const otherParticipantName = otherParticipantIndex !== -1 ? conversation.participantNames[otherParticipantIndex] : 'Admin';
    const otherParticipantAvatar = otherParticipantIndex !== -1 ? conversation.participantAvatars[otherParticipantIndex] : '/placeholder.svg';

    const isUnread = !conversation.readBy.includes(currentUserId);

    return (
        <Card
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/client/messages/${conversation.id}`)}
        >
            <CardContent className="p-4 flex items-center gap-4">
                <Avatar className="h-12 w-12">
                    <AvatarImage src={otherParticipantAvatar} />
                    <AvatarFallback>{otherParticipantName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold truncate">{otherParticipantName}</h3>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNowStrict(conversation.lastUpdatedAt.toDate())} ago
                        </p>
                    </div>
                    <p className={cn("text-sm text-muted-foreground truncate", isUnread && "font-bold text-foreground")}>
                        {conversation.lastMessageSenderId === currentUserId && "You: "}{conversation.lastMessage}
                    </p>
                </div>
                {isUnread && <div className="h-3 w-3 rounded-full bg-primary shrink-0" />}
            </CardContent>
        </Card>
    )
}

export default function ClientMessagesPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isChatPending, startChatTransition] = useTransition();

    const conversationsQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'),
            where('participantIds', 'array-contains', user.uid),
            orderBy('lastUpdatedAt', 'desc')
        );
    }, [firestore, user]);

    const { data: conversations, loading: conversationsLoading } = useCollection<Conversation>(conversationsQuery as any);
    
    const isLoading = userLoading || conversationsLoading;

    const handleRequestChat = () => {
        if (!user || !user.displayName) return;
        startChatTransition(async () => {
            const result = await requestChatWithAdmin({
                userId: user.uid,
                userName: user.displayName,
                userRole: 'Client'
            });
            toast({
                title: result.success ? 'Request Sent' : 'Request Failed',
                description: result.message,
                variant: result.success ? 'default' : 'destructive'
            });
        });
    }

    return (
        <div>
            <PageHeader title="Messages" description="All your conversations in one place." icon={MessageSquare} />

            <div className="space-y-4">
                {isLoading && (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                )}

                {!isLoading && conversations && conversations.length > 0 && user && (
                    conversations.map(convo => (
                        <ConversationItem key={convo.id} conversation={convo} currentUserId={user.uid} />
                    ))
                )}
                
                {!isLoading && (!conversations || conversations.length === 0) && (
                    <Card className="h-48 flex flex-col items-center justify-center border-dashed">
                        <p className="text-muted-foreground">No conversations yet.</p>
                        <Button variant="outline" onClick={handleRequestChat} disabled={isChatPending} className="mt-4">
                            {isChatPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <MessageSquare className="mr-2 h-4 w-4" />}
                            Contact Admin to Start a Chat
                        </Button>
                    </Card>
                )}
            </div>
        </div>
    );
}
