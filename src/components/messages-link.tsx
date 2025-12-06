
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    const { user } = useUser();
    const firestore = useFirestore();

    const conversationQuery = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'conversations'),
            where('participantIds', 'array-contains', user.uid),
            limit(1)
        );
    }, [firestore, user]);

    const { data: conversations, loading } = useCollection(conversationQuery);

    const conversationId = conversations?.[0]?.id;
    const href = conversationId ? `${basePath}/messages/${conversationId}` : '#';

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            asChild
            disabled={!conversationId || loading}
            title={!conversationId ? "No active conversations" : "Messages"}
        >
            <Link href={href}>
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
            </Link>
        </Button>
    );
}
