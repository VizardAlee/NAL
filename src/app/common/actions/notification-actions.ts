
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { z } from 'zod';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const adminDb = getFirestore(getAdminApp());

// Main function to create an in-app notification
async function createInAppNotification(
    firestore: FirebaseFirestore.Firestore,
    recipientId: string,
    title: string,
    message: string,
    link: string,
    category: NotificationCategory = 'system'
) {
    const notificationRef = firestore.collection('notifications').doc();
    await notificationRef.set({
        recipientId,
        title,
        message,
        link,
        category,
        read: false,
        createdAt: Timestamp.now(),
    });
}

type NotificationCategory =
    | 'approval'
    | 'message'
    | 'repayment'
    | 'overdue'
    | 'system'
    | 'request-status';

// Main function to send a push notification
async function sendPushNotification(
    recipientId: string,
    title: string,
    body: string,
    link: string
) {
  try {
    const userDoc = await adminDb.collection('users').doc(recipientId).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data();
    if (!userData || !userData.fcmTokens || userData.fcmTokens.length === 0) {
      return; // No tokens to send to
    }

    const messaging = getMessaging(getAdminApp());
    
    const multicastMessage = {
      notification: {
        title: title,
        body: body,
      },
      webpush: {
        fcmOptions: {
          link: link,
        },
        notification: {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
        }
      },
      tokens: userData.fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(multicastMessage);
    const invalidTokens = response.responses
      .map((result, index) => {
        const code = result.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          return userData.fcmTokens[index];
        }
        return null;
      })
      .filter((token): token is string => Boolean(token));

    if (invalidTokens.length > 0) {
      await adminDb.collection('users').doc(recipientId).update({
        fcmTokens: FieldValue.arrayRemove(...invalidTokens),
      });
    }
  } catch (error) {
    console.error(`Failed to send push notification to ${recipientId}:`, error);
  }
}

// A helper function that creates both in-app and push notifications for a set of admins
export async function notifyAdmins(
    title: string,
    message: string,
    link: string,
    category: NotificationCategory = 'approval'
) {
    const [legacyAdmins, accessRoleAdmins, accessRoleStaff, accessRoleOwners] = await Promise.all([
        adminDb.collection('users').where('role', '==', 'Admin').get(),
        adminDb.collection('users').where('accessRole', '==', 'ADMIN').get(),
        adminDb.collection('users').where('accessRole', '==', 'STAFF').get(),
        adminDb.collection('users').where('accessRole', '==', 'OWNER').get(),
    ]);

    const adminIds = Array.from(
        new Set([
            ...legacyAdmins.docs.map((doc) => doc.id),
            ...accessRoleAdmins.docs.map((doc) => doc.id),
            ...accessRoleStaff.docs.map((doc) => doc.id),
            ...accessRoleOwners.docs.map((doc) => doc.id),
        ])
    );
    if (adminIds.length === 0) return;

    const inAppPromises = adminIds.map(adminId => 
        createInAppNotification(adminDb, adminId, title, message, link, category)
    );

    const pushPromises = adminIds.map(adminId => 
        sendPushNotification(adminId, title, message, link)
    );

    await Promise.all([...inAppPromises, ...pushPromises]);
}

// A helper function that creates both in-app and push notifications for a single user
export async function notifyUser(
    userId: string,
    title: string,
    message: string,
    link: string,
    category: NotificationCategory = 'system'
) {
    await Promise.all([
        createInAppNotification(adminDb, userId, title, message, link, category),
        sendPushNotification(userId, title, message, link)
    ]);
}

const saveFcmTokenSchema = z.object({
    authToken: z.string().min(1),
    userId: z.string().min(1),
    token: z.string().min(1),
});

// Action to save a user's FCM token
export async function saveFcmToken(input: z.infer<typeof saveFcmTokenSchema>) {
    const validated = saveFcmTokenSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid notification token request.' };
    }

    try {
        const { authToken, userId, token } = validated.data;
        await verifyAuthTokenForUser(authToken, userId);

        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({
            fcmTokens: FieldValue.arrayUnion(token)
        });
        return { success: true, message: 'Token saved successfully.' };
    } catch (error) {
        console.error('Error saving FCM token:', error);
        return { success: false, message: 'Failed to save notification token.' };
    }
}
