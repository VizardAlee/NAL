
"use client";

import { useMemo } from 'react';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { SidebarMenuButton } from './ui/sidebar';

type Conversation = {
  id: string;
  readBy: string[];
};

export function MessageGlow({ children, isActive, tooltip }: { children: React.ReactNode, isActive: boolean, tooltip?: string }) {
  const { user } = useUser();
  const firestore = useFirestore();

  const unreadQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', user.uid),
      where('lastMessageSenderId', '!=', user.uid) // We only care if someone else sent the last message
    );
  }, [firestore, user]);

  const { data: conversations } = useCollection<Conversation>(unreadQuery);

  const hasUnread = useMemo(() => {
    if (!conversations || !user) return false;
    // Check if there is any conversation where the user's ID is not in the `readBy` array.
    return conversations.some(convo => !convo.readBy.includes(user.uid));
  }, [conversations, user]);

  return (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      tooltip={tooltip}
      variant="default"
      className="w-full justify-between relative"
    >
      <div>
        {children}
        {hasUnread && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
        )}
      </div>
    </SidebarMenuButton>
  );
}
