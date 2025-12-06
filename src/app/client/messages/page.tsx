
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, Timestamp, type DocumentData, type Query } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { ViewPageNav } from '@/components/view-page-nav';


type ConversationData = DocumentData & {
    participantIds: string[];
    participantNames: string[];
    participantAvatars: string[];
    lastMessage: string;
    lastMessageSenderId: string;
    lastUpdatedAt: Timestamp;
    readBy: string[];
};

type Conversation = ConversationData & {
    id: string;
}

function ConversationItem({ conversation, currentUserId }: { conversation: Conversation, currentUserId: string }) {
    const router = useRouter();
    
    // Find the other participant's details (the admin)
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
                            {formatDistanceToNowStrict(conversation.lastUpdatedAt.toDate())}
                        </p>
                    </div>
                    <p className={cn("text-sm text-muted-foreground truncate", isUnread && "font-bold text-foreground")}>
                        {conversation.lastMessageSenderId === currentUserId ? "You: " : ""}{conversation.lastMessage}
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

    const conversationsQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'),
            where('participantIds', 'array-contains', user.uid),
            orderBy('lastUpdatedAt', 'desc')
        );
    }, [firestore, user]);

    const { data: conversations, loading: conversationsLoading } = useCollection<ConversationData>(conversationsQuery);
    
    const isLoading = userLoading || conversationsLoading;

    return (
        <div>
            <PageHeader title="My Conversations" description="Your conversations with the admin team." icon={MessageSquare}>
                <ViewPageNav homePath="/client/dashboard" />
            </PageHeader>

            <div className="space-y-4">
                {isLoading && (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                )}

                {!isLoading && conversations && conversations.length > 0 && user && (
                    conversations.map(convo => (
                        <ConversationItem key={convo.id} conversation={convo as Conversation} currentUserId={user.uid} />
                    ))
                )}
                
                {!isLoading && (!conversations || conversations.length === 0) && (
                    <Card className="h-48 flex items-center justify-center border-dashed">
                        <p className="text-muted-foreground">You have no conversations yet.</p>
                    </Card>
                )}
            </div>
        </div>
    );
}
