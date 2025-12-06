
'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';
import { useUser, useCollection, useFirestore } from '@/firebase';
import { useMemo } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();

    const q = useMemo(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'notifications'), 
            where('recipientId', '==', user.uid), 
            where('read', '==', false),
            limit(1)
        );
    }, [firestore, user]);

    const { data: unreadNotifications, loading: notificationsLoading } = useCollection(q);

    const hasUnread = unreadNotifications && unreadNotifications.length > 0;
    const href = `${basePath}/messages`;

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
                 {hasUnread && (
                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                )}
                <span className="sr-only">Messages</span>
            </Link>
        </Button>
    );
}
