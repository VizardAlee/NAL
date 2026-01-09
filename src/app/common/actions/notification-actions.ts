
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const adminDb = getFirestore(getAdminApp());

// Main function to create an in-app notification
async function createInAppNotification(
    firestore: FirebaseFirestore.Firestore,
    recipientId: string,
    title: string,
    message: string,
    link: string
) {
    const notificationRef = firestore.collection('notifications').doc();
    await notificationRef.set({
        recipientId,
        title,
        message,
        link,
        read: false,
        createdAt: Timestamp.now(),
    });
}

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
    
    const message = {
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

    await messaging.sendEachForMulticast(message);
  } catch (error) {
    console.error(`Failed to send push notification to ${recipientId}:`, error);
  }
}

// A helper function that creates both in-app and push notifications for a set of admins
export async function notifyAdmins(
    title: string,
    message: string,
    link: string
) {
    const adminQuery = await adminDb.collection('users').where('role', '==', 'Admin').get();
    if (adminQuery.empty) return;

    const adminIds = adminQuery.docs.map(doc => doc.id);

    const inAppPromises = adminIds.map(adminId => 
        createInAppNotification(adminDb, adminId, title, message, link)
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
    link: string
) {
    await Promise.all([
        createInAppNotification(adminDb, userId, title, message, link),
        sendPushNotification(userId, title, message, link)
    ]);
}

// Action to save a user's FCM token
export async function saveFcmToken(userId: string, token: string) {
    if (!userId || !token) {
        return { success: false, message: 'Invalid user ID or token.' };
    }
    try {
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
