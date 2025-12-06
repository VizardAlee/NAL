
'use client';

import { useMemo, useState, useTransition, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useDoc, useCollection, useUser, useFirestore } from '@/firebase';
import { doc, collection, query, orderBy, addDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Loader2, MessageSquare, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { sendMessageAction } from './actions';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

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

type Message = {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    createdAt: Timestamp;
};

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" size="icon" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send</span>
        </Button>
    )
}

export default function AdminConversationPage() {
    const { conversationId } = useParams<{ conversationId: string }>();
    const { user: adminUser } = useUser();
    const firestore = useFirestore();
    const [newMessage, setNewMessage] = useState('');
    const [isSending, startTransition] = useTransition();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const conversationRef = useMemo(() => {
        if (!firestore || !conversationId) return null;
        return doc(firestore, 'conversations', conversationId);
    }, [firestore, conversationId]);

    const messagesQuery = useMemo(() => {
        if (!firestore || !conversationId) return null;
        return query(collection(firestore, `conversations/${conversationId}/messages`), orderBy('createdAt', 'asc'));
    }, [firestore, conversationId]);

    const { data: conversation, loading: conversationLoading } = useDoc<Conversation>(conversationRef as any);
    const { data: messages, loading: messagesLoading } = useCollection<Message>(messagesQuery as any);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    // Mark messages as read by the admin
    useEffect(() => {
        if (conversation && adminUser && !conversation.readBy.includes(adminUser.uid)) {
            updateDoc(conversationRef as any, {
                readBy: [...conversation.readBy, adminUser.uid]
            });
        }
    }, [conversation, adminUser, conversationRef]);

    const handleSendMessage = async (formData: FormData) => {
        const text = formData.get('messageText') as string;
        if (!text.trim() || !adminUser || !conversationId) return;

        startTransition(async () => {
            setNewMessage('');
            await sendMessageAction({
                conversationId,
                senderId: adminUser.uid,
                text,
            });
        });
    };

    const otherParticipantIndex = conversation ? conversation.participantIds.findIndex(id => id !== adminUser?.uid) : -1;
    const otherParticipantName = otherParticipantIndex !== -1 ? conversation?.participantNames[otherParticipantIndex] : 'User';
    const otherParticipantAvatar = otherParticipantIndex !== -1 ? conversation?.participantAvatars[otherParticipantIndex] : '/placeholder.svg';


    if (conversationLoading) {
        return <Skeleton className="h-screen w-full" />;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            <header className="flex items-center gap-4 p-4 border-b">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/messages"><ArrowLeft /></Link>
                </Button>
                <Avatar>
                    <AvatarImage src={otherParticipantAvatar} />
                    <AvatarFallback>{otherParticipantName.charAt(0)}</AvatarFallback>
                </Avatar>
                <h2 className="text-lg font-semibold">{otherParticipantName}</h2>
            </header>
            <main className="flex-1 overflow-auto p-4 space-y-4">
                {messagesLoading && <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />}
                {messages?.map(message => (
                    <div key={message.id} className={`flex items-end gap-2 ${message.senderId === adminUser?.uid ? 'justify-end' : ''}`}>
                         {message.senderId !== adminUser?.uid && (
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={otherParticipantAvatar} />
                                <AvatarFallback>{otherParticipantName.charAt(0)}</AvatarFallback>
                            </Avatar>
                         )}
                        <div className={`rounded-lg p-3 max-w-xs md:max-w-md ${message.senderId === adminUser?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            <p className="text-sm">{message.text}</p>
                            <p className="text-xs opacity-70 mt-1 text-right">{format(message.createdAt.toDate(), 'p')}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </main>
            <footer className="p-4 border-t">
                <form action={handleSendMessage} className="flex items-center gap-2">
                    <Input
                        name="messageText"
                        placeholder="Type a message..."
                        autoComplete="off"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={isSending}
                    />
                    <SubmitButton />
                </form>
            </footer>
        </div>
    )
}
