
'use client';

import { useMemo, useState, useTransition, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useDoc, useCollection, useUser, useFirestore } from '@/firebase';
import { doc, collection, query, orderBy, addDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Loader2, MessageSquare, Send, Paperclip, X, Download } from 'lucide-react';
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
    attachmentUrl?: string;
    attachmentName?: string;
};

// Helper to convert file to Base64
const fileToDataUri = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

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
    const [attachment, setAttachment] = useState<File | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        if ((!text || !text.trim()) && !attachment) return;
        if (!adminUser || !conversationId) return;

        let attachmentUrl: string | undefined;
        let attachmentName: string | undefined;

        if (attachment) {
            attachmentUrl = await fileToDataUri(attachment);
            attachmentName = attachment.name;
        }

        setNewMessage('');
        setAttachment(null);
        if(fileInputRef.current) fileInputRef.current.value = '';

        await sendMessageAction({
            conversationId,
            senderId: adminUser.uid,
            text,
            attachmentUrl,
            attachmentName
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            if (e.target.files[0].type === 'application/pdf' && e.target.files[0].size < 5 * 1024 * 1024) {
                 setAttachment(e.target.files[0]);
            } else {
                alert("Please select a PDF file smaller than 5MB.");
                if(fileInputRef.current) fileInputRef.current.value = '';
            }
        }
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
                            <Avatar className="h-8 w-8 self-end">
                                <AvatarImage src={otherParticipantAvatar} />
                                <AvatarFallback>{otherParticipantName.charAt(0)}</AvatarFallback>
                            </Avatar>
                         )}
                        <div className={`rounded-lg p-3 max-w-xs md:max-w-md ${message.senderId === adminUser?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}
                            {message.attachmentUrl && message.attachmentName && (
                                <a
                                    href={message.attachmentUrl}
                                    download={message.attachmentName}
                                    className="flex items-center gap-2 mt-2 p-2 rounded-md bg-background/20 hover:bg-background/40"
                                >
                                    <Download className="h-4 w-4" />
                                    <span className="text-sm underline truncate">{message.attachmentName}</span>
                                </a>
                            )}
                            <p className="text-xs opacity-70 mt-1 text-right">{format(message.createdAt.toDate(), 'p')}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </main>
            <footer className="p-4 border-t bg-background">
                <form action={handleSendMessage} className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="application/pdf" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="h-5 w-5" />
                        <span className="sr-only">Attach file</span>
                    </Button>
                    <div className="flex-1 relative">
                        <Input
                            name="messageText"
                            placeholder="Type a message..."
                            autoComplete="off"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                        />
                         {attachment && (
                            <div className="absolute bottom-full left-0 mb-2 w-full">
                                <div className="flex items-center justify-between p-2 rounded-md bg-muted text-sm">
                                    <span className="truncate">{attachment.name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}>
                                        <X className="h-4 w-4"/>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                    <SubmitButton />
                </form>
            </footer>
        </div>
    )
}

    