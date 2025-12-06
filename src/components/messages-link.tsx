
'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';
import { useUser, useCollection, useFirestore } from '@/firebase';
import { useMemo } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';

type Conversation = {
    id: string;
};

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();

    const conversationsQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'), 
            where('participantIds', 'array-contains', user.uid),
            limit(1)
        );
    }, [firestore, user]);

    const { data: conversations, loading: conversationsLoading } = useCollection<Conversation>(conversationsQuery);
    
    const conversation = conversations?.[0];
    const hasConversation = !!conversation;
    const isLoading = userLoading || conversationsLoading;

    if (isLoading || !hasConversation) {
        return (
            <Button
                variant="ghost"
                size="icon"
                className="rounded-full relative"
                disabled
                title="No active messages"
            >
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
            </Button>
        );
    }
    
    const href = `${basePath}/messages/${conversation.id}`;

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full relative"
            asChild
            title="Messages"
        >
            <Link href={href}>
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
            </Link>
        </Button>
    );
}
