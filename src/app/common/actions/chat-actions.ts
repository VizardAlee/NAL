
'use server';

import { adminDb } from '@/firebase/admin-app';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
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

    const adminQuery = await adminDb.collection('users').where('role', '==', 'Admin').get();
    const adminIds = adminQuery.docs.map(doc => doc.id);
    const batch = adminDb.batch();

    for (const adminId of adminIds) {
        const notificationRef = adminDb.collection('notifications').doc();
        batch.set(notificationRef, {
            recipientId: adminId,
            title: 'New Chat Request',
            message: `${userName} (${userRole}) has requested a chat.`,
            link: '/admin/approvals/chat-requests',
            read: false,
            createdAt: Timestamp.now(),
        });
    }
    await batch.commit();


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


const messageSchema = z.object({
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  text: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentName: z.string().optional(),
});

export async function sendMessageAction(input: z.infer<typeof messageSchema>) {
  const validated = messageSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid message data.' };
  }

  const { conversationId, senderId, text, attachmentUrl, attachmentName } = validated.data;
  
  if (!text && !attachmentUrl) {
    return { success: false, message: 'Message must have either text or an attachment.' };
  }

  try {
    const firestore = adminDb;
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    
    const conversationDoc = await conversationRef.get();
    if (!conversationDoc.exists) {
      return { success: false, message: 'Conversation not found.' };
    }
    const conversationData = conversationDoc.data();
    if (!conversationData?.participantIds?.includes(senderId)) {
      return { success: false, message: 'You are not authorized to send messages in this conversation.' };
    }

    const batch = firestore.batch();

    const messageData: any = {
      conversationId,
      senderId,
      text: text || '',
      createdAt: FieldValue.serverTimestamp(),
    };

    if (attachmentUrl && attachmentName) {
        messageData.attachmentUrl = attachmentUrl;
        messageData.attachmentName = attachmentName;
    }

    // 1. Add new message to the subcollection
    const newMessageRef = conversationRef.collection('messages').doc();
    batch.set(newMessageRef, messageData);

    // 2. Update the parent conversation document
    const lastMessage = text ? (text.length > 30 ? text.substring(0, 27) + '...' : text) : `Attachment: ${attachmentName}`;
    batch.update(conversationRef, {
      lastMessage,
      lastMessageSenderId: senderId,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      readBy: [senderId],
    });

    // 3. Create a notification for the recipient(s)
    const senderDoc = await firestore.collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.name || 'A user';
    
    const participantIds = Array.isArray(conversationData.participantIds) 
      ? conversationData.participantIds 
      : [];
    
    const recipients = [...new Set(participantIds.filter(id => id !== senderId))];
    
    for (const recipientId of recipients) {
        const recipientDoc = await firestore.collection('users').doc(recipientId).get();
        const recipientRole = recipientDoc.data()?.role || 'Unknown';

        let link = '/';
        if (recipientRole === 'Admin') {
            link = `/admin/messages/${conversationId}`;
        } else if (recipientRole === 'Investor') {
            link = `/investor/messages/${conversationId}`;
        } else if (recipientRole === 'Client') {
            link = `/client/messages/${conversationId}`;
        }

        const notificationRef = firestore.collection('notifications').doc();
        batch.set(notificationRef, {
            title: `New Message from ${senderName}`,
            message: lastMessage,
            link,
            recipientId, 
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    await batch.commit();

    return { success: true, message: 'Message sent.' };
  } catch (error: any) {
    console.error("SEND MESSAGE ERROR:", error);
    return { success: false, message: error.message || 'Failed to send message.' };
  }
}

const getOrCreateConvoSchema = z.object({
  adminId: z.string().min(1),
  adminName: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
});

export async function getOrCreateConversation(input: z.infer<typeof getOrCreateConvoSchema>) {
    const validated = getOrCreateConvoSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid data for conversation.' };
    }
    const { adminId, adminName, userId, userName } = validated.data;
    
    try {
        const existingConvoQuery = adminDb.collection('conversations')
            .where('participantIds', 'array-contains', adminId);

        const querySnapshot = await existingConvoQuery.get();
        const existingConvo = querySnapshot.docs.find(doc => {
            const data = doc.data();
            return data.participantIds.includes(userId) && data.participantIds.length === 2;
        });

        if (existingConvo) {
            return { success: true, conversationId: existingConvo.id };
        }

        const newConversationRef = adminDb.collection('conversations').doc();
        const batch = adminDb.batch();
        const now = FieldValue.serverTimestamp();
        const initialMessage = `Hi ${userName}, this is ${adminName}. How can I assist you?`;

        batch.set(newConversationRef, {
            participantIds: [adminId, userId],
            participantNames: [adminName, userName],
            participantAvatars: [`https://picsum.photos/seed/${adminId}/128/128`, `https://picsum.photos/seed/${userId}/128/128`],
            lastMessage: initialMessage,
            lastMessageSenderId: adminId,
            lastUpdatedAt: now,
            readBy: [adminId],
        });

        const firstMessageRef = newConversationRef.collection('messages').doc();
        batch.set(firstMessageRef, {
            conversationId: newConversationRef.id,
            senderId: adminId,
            text: initialMessage,
            createdAt: now,
        });

        await batch.commit();

        return { success: true, conversationId: newConversationRef.id };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}
