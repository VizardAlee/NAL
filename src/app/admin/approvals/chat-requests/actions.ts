'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

export async function initiateChat(
    authToken: string,
    requestId: string, 
    userId: string, 
    userName: string, 
    userRole: 'Investor' | 'Client',
    adminId: string, 
    adminName: string
) {
  try {
    await verifyAuthTokenForUser(authToken, adminId);

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

    // If no conversation exists, create a deterministic conversation to avoid duplicates on concurrent clicks.
    const conversationId = [adminId, userId].sort().join('_');
    const newConversationRef = adminDb.collection('conversations').doc(conversationId);
    const initialMessage = `Hi ${userName}, this is ${adminName}. How can I help you today?`;
    const userLink = userRole === 'Investor'
      ? `/investor/messages/${conversationId}`
      : `/client/messages/${conversationId}`;

    await adminDb.runTransaction(async (trx) => {
      const existingConvo = await trx.get(newConversationRef);
      if (existingConvo.exists) {
        trx.delete(adminDb.doc(`chatRequests/${requestId}`));
        return;
      }
      const now = FieldValue.serverTimestamp();

      // 1. Create the new conversation document
      trx.set(newConversationRef, {
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
      trx.set(firstMessageRef, {
        conversationId: newConversationRef.id,
        senderId: adminId,
        text: initialMessage,
        createdAt: now,
      });
    
      // 3. Create a notification for the user
      const notificationRef = adminDb.collection('notifications').doc();
      trx.set(notificationRef, {
          title: `New message from ${adminName}`,
          message: initialMessage,
          link: userLink,
          category: 'message',
          recipientId: userId,
          read: false,
          createdAt: now,
      });


      // 4. Delete the original chat request
      trx.delete(adminDb.doc(`chatRequests/${requestId}`));
    });

    revalidatePath('/admin/approvals/chat-requests');

    return { success: true, conversationId };
  } catch (error) {
    console.error("Chat Initiation Server Action Error:", error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, message };
  }
}
