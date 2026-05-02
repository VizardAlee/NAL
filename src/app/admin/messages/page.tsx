
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canViewAdmin } from '@/lib/access-control';


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

type UserProfile = {
    id: string;
    name: string;
    role?: 'Admin' | 'Client' | 'Investor';
    accessRole?: 'OWNER' | 'ADMIN' | 'STAFF' | 'USER';
};

function ConversationList({ conversations, currentUserId }: { conversations: Conversation[] | null, currentUserId: string }) {
    if (!conversations || conversations.length === 0) {
        return (
            <Card className="h-48 flex items-center justify-center border-dashed">
                <p className="text-muted-foreground">No conversations found.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {conversations.map(convo => (
                <ConversationItem key={convo.id} conversation={convo} currentUserId={currentUserId} />
            ))}
        </div>
    )
}

function ConversationItem({ conversation, currentUserId }: { conversation: Conversation, currentUserId: string }) {
    const router = useRouter();

    const otherParticipantIndex = conversation.participantIds.findIndex(id => id !== currentUserId);
    const otherParticipantName = otherParticipantIndex !== -1 ? conversation.participantNames[otherParticipantIndex] : 'Unknown User';
    const otherParticipantAvatar = otherParticipantIndex !== -1 ? conversation.participantAvatars[otherParticipantIndex] : '/placeholder.svg';

    const isUnread = !conversation.readBy.includes(currentUserId);

    return (
        <Card
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/admin/messages/${conversation.id}`)}
        >
            <CardContent className="p-4 flex items-center gap-4">
                <Avatar className="h-12 w-12">
                    <AvatarImage src={otherParticipantAvatar} />
                    <AvatarFallback>{otherParticipantName?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold truncate">{otherParticipantName}</h3>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNowStrict(conversation.lastUpdatedAt.toDate())}
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

export default function AdminMessagesPage() {
    const { user: adminUser, loading: userLoading } = useUser();
    const firestore = useFirestore();

    const allAdminsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const allConversationsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'conversations'), orderBy('lastUpdatedAt', 'desc'));
    }, [firestore]);

    const { data: allAdmins, loading: adminsLoading } = useCollection<UserProfile>(allAdminsQuery);
    const { data: allConversations, loading: conversationsLoading } = useCollection<Conversation>(allConversationsQuery);

    const isLoading = userLoading || adminsLoading || conversationsLoading;

    const myConversations = useMemo(() => {
        if (!allConversations || !adminUser) return [];
        return allConversations.filter(c => c.participantIds.includes(adminUser.uid));
    }, [allConversations, adminUser]);

    const otherAdmins = useMemo(() => {
        if (!allAdmins || !adminUser) return [];
        return allAdmins.filter(a => a.id !== adminUser.uid && canViewAdmin(a));
    }, [allAdmins, adminUser]);

    if (isLoading || !adminUser) {
        return (
            <div>
                <PageHeader title="Messages" description="All your conversations in one place." icon={MessageSquare} />
                <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
            </div>
        )
    }

    return (
        <div>
            <PageHeader title="Messages" description="Review all conversations across the platform." icon={MessageSquare} />
            <Tabs defaultValue={adminUser.uid}>
                <TabsList>
                    <TabsTrigger value={adminUser.uid}>My Chats</TabsTrigger>
                    {otherAdmins.map(admin => (
                        <TabsTrigger key={admin.id} value={admin.id}>{admin.name}'s Chats</TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={adminUser.uid} className="mt-4">
                    <ConversationList conversations={myConversations} currentUserId={adminUser.uid} />
                </TabsContent>

                {otherAdmins.map(admin => (
                    <TabsContent key={admin.id} value={admin.id} className="mt-4">
                        <ConversationList
                            conversations={allConversations?.filter(c => c.participantIds.includes(admin.id)) || []}
                            currentUserId={adminUser.uid}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
