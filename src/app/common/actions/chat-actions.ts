'use server';

import { adminDb } from '@/firebase/admin-app';
import { Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const requestChatSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  userRole: z.enum(['Investor', 'Client']),
});

export async function requestChatWithAdmin(input: z.infer<typeof requestChatSchema>) {
  const validated = requestChatSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid data for chat request.' };
  }

  const { userId, userName, userRole } = validated.data;

  try {
    const existingRequest = await adminDb
      .collection('chatRequests')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!existingRequest.empty) {
      return { success: false, message: 'You already have a pending chat request.' };
    }

    await adminDb.collection('chatRequests').add({
      ...validated.data,
      status: 'Pending',
      requestedAt: Timestamp.now(),
    });

    await adminDb.collection('notifications').add({
      title: 'New Chat Request',
      message: `${userName} (${userRole}) has requested a chat.`,
      link: '/admin/approvals/chat-requests',
      read: false,
      createdAt: Timestamp.now(),
    });

    revalidatePath('/admin/approvals/chat-requests');

    return { success: true, message: 'Your request has been sent. An admin will start a chat with you shortly.' };
  } catch (error) {
    console.error('REQUEST CHAT ERROR:', error);
    return {
      success: false,
      message: 'An unknown error occurred while sending your request.',
    };
  }
}
