import 'server-only';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export type NotificationCategory =
  | 'approval'
  | 'message'
  | 'repayment'
  | 'overdue'
  | 'system'
  | 'request-status';

function getAdminDb() {
  return getFirestore(getAdminApp());
}

async function createInAppNotification(
  firestore: FirebaseFirestore.Firestore,
  recipientId: string,
  title: string,
  message: string,
  link: string,
  category: NotificationCategory
) {
  await firestore.collection('notifications').doc().set({
    recipientId,
    title,
    message,
    link,
    category,
    read: false,
    createdAt: Timestamp.now(),
  });
}

async function sendPushNotification(recipientId: string, title: string, body: string, link: string) {
  try {
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection('users').doc(recipientId).get();
    const userData = userDoc.data();
    const tokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];
    if (tokens.length === 0) return;

    const response = await getMessaging(getAdminApp()).sendEachForMulticast({
      notification: { title, body },
      webpush: {
        fcmOptions: { link },
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
        },
      },
      tokens,
    });

    const invalidTokens = response.responses
      .map((result, index) => {
        const code = result.error?.code;
        return code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
          ? tokens[index]
          : null;
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

export async function notifyAdmins(
  title: string,
  message: string,
  link: string,
  category: NotificationCategory = 'approval'
) {
  const adminDb = getAdminDb();
  const [legacyAdmins, accessRoleAdmins, accessRoleStaff, accessRoleOwners] = await Promise.all([
    adminDb.collection('users').where('role', '==', 'Admin').get(),
    adminDb.collection('users').where('accessRole', '==', 'ADMIN').get(),
    adminDb.collection('users').where('accessRole', '==', 'STAFF').get(),
    adminDb.collection('users').where('accessRole', '==', 'OWNER').get(),
  ]);
  const adminIds = Array.from(new Set([
    ...legacyAdmins.docs.map((doc) => doc.id),
    ...accessRoleAdmins.docs.map((doc) => doc.id),
    ...accessRoleStaff.docs.map((doc) => doc.id),
    ...accessRoleOwners.docs.map((doc) => doc.id),
  ]));

  await Promise.all(adminIds.flatMap((adminId) => [
    createInAppNotification(adminDb, adminId, title, message, link, category),
    sendPushNotification(adminId, title, message, link),
  ]));
}

export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  link: string,
  category: NotificationCategory = 'system'
) {
  const adminDb = getAdminDb();
  await Promise.all([
    createInAppNotification(adminDb, userId, title, message, link, category),
    sendPushNotification(userId, title, message, link),
  ]);
}

export async function notifyOperationalTeam(
  persona: 'RECOVERY' | 'LEGAL',
  title: string,
  message: string,
  link: string,
  category: NotificationCategory = 'system'
) {
  const adminDb = getAdminDb();
  const legacyRole = persona === 'RECOVERY' ? 'Recovery' : 'Legal';
  const [currentProfiles, legacyProfiles] = await Promise.all([
    adminDb.collection('users').where('personas', 'array-contains', persona).get(),
    adminDb.collection('users').where('role', '==', legacyRole).get(),
  ]);
  const recipientIds = Array.from(new Set([
    ...currentProfiles.docs.map((document) => document.id),
    ...legacyProfiles.docs.map((document) => document.id),
  ]));
  await Promise.all(recipientIds.flatMap((recipientId) => [
    createInAppNotification(adminDb, recipientId, title, message, link, category),
    sendPushNotification(recipientId, title, message, link),
  ]));
  return recipientIds.length;
}
