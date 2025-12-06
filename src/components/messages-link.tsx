
'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';
import { useUser, useCollection, useFirestore } from '@/firebase';
import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';

type Conversation = {
    id: string;
    participantIds: string[];
};

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();

    // Query for conversations where the current user is a participant.
    // This will find the conversation with the admin.
    const conversationsQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'),
            where('participantIds', 'array-contains', user.uid)
        );
    }, [firestore, user]);

    const { data: conversations, loading: conversationsLoading } = useCollection<Conversation>(conversationsQuery as any);

    const isLoading = userLoading || conversationsLoading;

    // Find the first (and likely only) conversation.
    const conversation = useMemo(() => conversations?.[0], [conversations]);
    
    const href = conversation ? `${basePath}/messages/${conversation.id}` : '#';
    const isDisabled = !conversation || isLoading;

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            asChild
            title={isDisabled ? "No active messages" : "Messages"}
            disabled={isDisabled}
            style={{ opacity: isDisabled && !isLoading ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
        >
            <Link href={href}>
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
            </Link>
        </Button>
    );
}
