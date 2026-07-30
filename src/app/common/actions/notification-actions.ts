
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

function getAdminDb() {
    return getFirestore(getAdminApp());
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
        const adminDb = getAdminDb();
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
