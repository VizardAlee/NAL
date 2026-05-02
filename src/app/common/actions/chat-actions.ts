
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore, Timestamp, FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins, notifyUser } from './notification-actions';
import { verifyAuthToken, verifyAuthTokenForUser } from '@/lib/server/auth';
import { canViewAdmin, normalizeAccessModel } from '@/lib/access-control';


const requestChatSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  userRole: z.enum(['Investor', 'Client']),
});

const listContactAdminsSchema = z.object({
  authToken: z.string().min(1),
});

export async function listContactAdmins(input: z.infer<typeof listContactAdminsSchema>) {
  const validated = listContactAdminsSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid admin list request.', admins: [] };
  }

  const adminDb = getFirestore(getAdminApp());

  try {
    await verifyAuthToken(validated.data.authToken);

    const [legacyAdmins, accessRoleAdmins, accessRoleStaff, accessRoleOwners] = await Promise.all([
      adminDb.collection('users').where('role', '==', 'Admin').get(),
      adminDb.collection('users').where('accessRole', '==', 'ADMIN').get(),
      adminDb.collection('users').where('accessRole', '==', 'STAFF').get(),
      adminDb.collection('users').where('accessRole', '==', 'OWNER').get(),
    ]);

    const adminDocs = new Map<string, QueryDocumentSnapshot>();
    [...legacyAdmins.docs, ...accessRoleAdmins.docs, ...accessRoleStaff.docs, ...accessRoleOwners.docs].forEach((doc) => {
      if (canViewAdmin(doc.data() as any)) {
        adminDocs.set(doc.id, doc);
      }
    });

    const admins = Array.from(adminDocs.values())
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.email || 'Administrator',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, admins };
  } catch (error) {
    console.error('LIST CONTACT ADMINS ERROR:', error);
    return { success: false, message: 'Failed to load administrators.', admins: [] };
  }
}

export async function requestChatWithAdmin(input: z.infer<typeof requestChatSchema>) {
  const validated = requestChatSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid data for chat request.' };
  }

  const { authToken, userId, userName, userRole } = validated.data;
  const adminDb = getFirestore(getAdminApp());

  try {
    await verifyAuthTokenForUser(authToken, userId);

    const requestRef = adminDb.collection('chatRequests').doc(userId);
    await adminDb.runTransaction(async (trx) => {
      const snap = await trx.get(requestRef);
      if (snap.exists && snap.data()?.status === 'Pending') {
        throw new Error('You already have a pending chat request.');
      }
      trx.set(requestRef, {
        userId,
        userName,
        userRole,
        status: 'Pending',
        requestedAt: Timestamp.now(),
      });
    });

    await notifyAdmins(
        'New Chat Request',
        `${userName} (${userRole}) has requested a chat.`,
        '/admin/approvals/chat-requests',
        'message'
    );

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
  authToken: z.string().min(1),
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

  const { authToken, conversationId, senderId, text, attachmentUrl, attachmentName } = validated.data;
  
  if (!text && !attachmentUrl) {
    return { success: false, message: 'Message must have either text or an attachment.' };
  }

  const adminDb = getFirestore(getAdminApp());

  try {
    await verifyAuthTokenForUser(authToken, senderId);

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

    await batch.commit();

    // 3. Create a notification for the recipient(s) - This runs after the batch commit
    const senderDoc = await firestore.collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.name || 'A user';
    
    const recipients = conversationData.participantIds.filter((id: string) => id !== senderId);
    
    for (const recipientId of recipients) {
        const recipientDoc = await firestore.collection('users').doc(recipientId).get();
        const recipientData = recipientDoc.data();
        const recipientAccess = normalizeAccessModel(recipientData as any);

        let link = '/';
        if (canViewAdmin(recipientData as any)) {
            link = `/admin/messages/${conversationId}`;
        } else if (recipientAccess.personas.includes('INVESTOR') || recipientAccess.primaryPortal === 'investor') {
            link = `/investor/messages/${conversationId}`;
        } else if (recipientAccess.personas.includes('CLIENT') || recipientAccess.primaryPortal === 'client') {
            link = `/client/messages/${conversationId}`;
        }

        await notifyUser(
            recipientId,
            `New Message from ${senderName}`,
            lastMessage,
            link,
            'message'
        );
    }

    return { success: true, message: 'Message sent.' };
  } catch (error: any) {
    console.error("SEND MESSAGE ERROR:", error);
    return { success: false, message: error.message || 'Failed to send message.' };
  }
}

const getOrCreateConvoSchema = z.object({
  authToken: z.string().min(1),
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
    const { authToken, adminId, adminName, userId, userName } = validated.data;
    const adminDb = getFirestore(getAdminApp());
    
    try {
        const decoded = await verifyAuthToken(authToken);
        if (decoded.uid !== adminId && decoded.uid !== userId) {
            return { success: false, message: 'Forbidden: invalid user context.' };
        }

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

        const conversationId = [adminId, userId].sort().join('_');
        const newConversationRef = adminDb.collection('conversations').doc(conversationId);
        const initialMessage = `Hi ${userName}, this is ${adminName}. How can I assist you?`;
        await adminDb.runTransaction(async (trx) => {
            const conversationDoc = await trx.get(newConversationRef);
            if (conversationDoc.exists) {
                return;
            }
            const now = FieldValue.serverTimestamp();
            trx.set(newConversationRef, {
                participantIds: [adminId, userId],
                participantNames: [adminName, userName],
                participantAvatars: [`https://picsum.photos/seed/${adminId}/128/128`, `https://picsum.photos/seed/${userId}/128/128`],
                lastMessage: initialMessage,
                lastMessageSenderId: adminId,
                lastUpdatedAt: now,
                readBy: [adminId],
            });

            const firstMessageRef = newConversationRef.collection('messages').doc();
            trx.set(firstMessageRef, {
                conversationId: newConversationRef.id,
                senderId: adminId,
                text: initialMessage,
                createdAt: now,
            });
        });

        return { success: true, conversationId };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}
