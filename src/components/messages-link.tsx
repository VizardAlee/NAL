
'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { MessageSquare } from 'lucide-react';

export function MessagesLink({ basePath }: { basePath: '/client' | '/investor' }) {
    // The link now directly goes to the messages inbox page.
    const href = `${basePath}/messages`;

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
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
