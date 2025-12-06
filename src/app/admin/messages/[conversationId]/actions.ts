
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const messageSchema = z.object({
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  text: z.string().min(1),
});

export async function sendMessageAction(input: z.infer<typeof messageSchema>) {
  const validated = messageSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid message data.' };
  }

  const { conversationId, senderId, text } = validated.data;

  try {
    const firestore = adminDb;
    const batch = firestore.batch();

    // 1. Add new message to the subcollection
    const newMessageRef = firestore.collection('conversations').doc(conversationId).collection('messages').doc();
    batch.set(newMessageRef, {
      conversationId,
      senderId,
      text,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Update the parent conversation document
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    batch.update(conversationRef, {
      lastMessage: text,
      lastMessageSenderId: senderId,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      readBy: [senderId], // Reset read status, only sender has read it
    });

    await batch.commit();

    // Revalidate the path to show the new message instantly
    revalidatePath(`/admin/messages/${conversationId}`);
    revalidatePath(`/admin/messages`); // Also revalidate inbox to update last message

    return { success: true, message: 'Message sent.' };
  } catch (error: any) {
    console.error("SEND MESSAGE ERROR:", error);
    return { success: false, message: error.message || 'Failed to send message.' };
  }
}
