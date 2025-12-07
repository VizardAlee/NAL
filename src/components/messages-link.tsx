
'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';
import { useUser, useCollection, useFirestore } from '@/firebase';
import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';

type Conversation = {
    id: string;
    participantIds: string[];
    lastMessageSenderId: string;
    readBy: string[];
};

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();

    const conversationsQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'), 
            where('participantIds', 'array-contains', user.uid)
        );
    }, [firestore, user]);

    const { data: conversations, loading: conversationsLoading } = useCollection<Conversation>(conversationsQuery);
    
    const hasUnread = useMemo(() => {
        if (!conversations || !user) return false;
        return conversations.some(convo => 
          convo.lastMessageSenderId !== user.uid && 
          !convo.readBy.includes(user.uid)
        );
    }, [conversations, user]);
    
    const firstConversationId = conversations?.[0]?.id;
    const isLoading = userLoading || conversationsLoading;

    if (isLoading) {
        return (
            <Button
                variant="ghost"
                size="icon"
                className="rounded-full relative"
                disabled
            >
                <MessageSquare className="h-5 w-5" />
            </Button>
        );
    }
    
    if (!firstConversationId) {
         return (
            <Button
                variant="ghost"
                size="icon"
                className="rounded-full relative"
                disabled
                title="No messages yet"
            >
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
            </Button>
        );
    }
    
    const href = `${basePath}/messages/${firstConversationId}`;

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full relative"
            asChild
        >
            <Link href={href} title="Messages">
                <MessageSquare className="h-5 w-5" />
                 {hasUnread && (
                    <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                )}
                <span className="sr-only">Messages</span>
            </Link>
        </Button>
    );
}
