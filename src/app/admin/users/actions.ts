'use server';

import { adminDb } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { doc, setDoc, getDocs, collection } from 'firebase-admin/firestore';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Investor', 'Client']),
});

export async function createUserAction(data: z.infer<typeof createUserSchema>) {
  const validated = createUserSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided.' };
  }

  const { name, email, password, role } = validated.data;

  try {
    const auth = getAuth(adminDb.app);
    
    // 1. Create user in Firebase Auth (Admin SDK = no sign-in)
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true, // It's good practice to mark email as verified
    });

    // 2. Make first user an Admin
    const usersCollection = collection(adminDb, 'users');
    const snapshot = await getDocs(usersCollection);
    const finalRole = snapshot.empty ? 'Admin' : role;

    // 3. Set custom claim for the role
    await auth.setCustomUserClaims(userRecord.uid, { role: finalRole });

    // 4. Create user document in Firestore
    await setDoc(doc(adminDb, 'users', userRecord.uid), {
      name,
      email,
      role: finalRole,
    });

    return { success: true, message: `User ${name} created successfully as ${finalRole}.` };
  } catch (error: any) {
    console.error('Create user error:', error);
    if (error.code === 'auth/email-already-exists') {
        return { success: false, message: 'This email address is already in use by another account.' };
    }
    return { success: false, message: error.message || 'An unknown error occurred while creating the user.' };
  }
}
