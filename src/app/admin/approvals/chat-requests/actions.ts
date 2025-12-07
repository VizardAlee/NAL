'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';

export async function initiateChat(
    requestId: string, 
    userId: string, 
    userName: string, 
    adminId: string, 
    adminName: string
) {
  try {
    // Check for existing conversation to avoid duplicates
    const existingConvoQuery = adminDb.collection('conversations')
      .where('participantIds', 'array-contains', adminId);
    const existingConvoSnapshot = await existingConvoQuery.get();

    const exactMatch = existingConvoSnapshot.docs.find(doc => {
      const participantIds = doc.data().participantIds;
      return participantIds.includes(userId) && participantIds.length === 2;
    });

    if (exactMatch) {
      // If a conversation already exists, just delete the request and return the ID.
      await adminDb.doc(`chatRequests/${requestId}`).delete();
      revalidatePath('/admin/approvals/chat-requests');
      return { success: true, conversationId: exactMatch.id };
    }

    // If no conversation exists, create a new one in a batch.
    const newConversationRef = adminDb.collection('conversations').doc();
    const batch = adminDb.batch();
    const now = FieldValue.serverTimestamp();
    const initialMessage = `Hi ${userName}, this is ${adminName}. How can I help you today?`;

    // 1. Create the new conversation document
    batch.set(newConversationRef, {
      participantIds: [adminId, userId],
      participantNames: [adminName, userName],
      participantAvatars: [`https://picsum.photos/seed/${adminId}/128/128`, `https://picsum.photos/seed/${userId}/128/128`],
      lastMessage: initialMessage,
      lastMessageSenderId: adminId,
      lastUpdatedAt: now,
      readBy: [adminId],
    });

    // 2. Create the first message in the subcollection
    const firstMessageRef = newConversationRef.collection('messages').doc();
    batch.set(firstMessageRef, {
      conversationId: newConversationRef.id,
      senderId: adminId,
      text: initialMessage,
      createdAt: now,
    });
    
    // 3. Create a notification for the user
    const notificationRef = adminDb.collection('notifications').doc();
    batch.set(notificationRef, {
        title: `New message from ${adminName}`,
        message: initialMessage,
        link: `/client/messages/${newConversationRef.id}`, // Assuming clients have this path structure
        recipientId: userId,
        read: false,
        createdAt: now,
    });


    // 4. Delete the original chat request
    batch.delete(adminDb.doc(`chatRequests/${requestId}`));

    // Commit all operations atomically
    await batch.commit();

    revalidatePath('/admin/approvals/chat-requests');

    return { success: true, conversationId: newConversationRef.id };
  } catch (error) {
    console.error("Chat Initiation Server Action Error:", error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, message };
  }
}
