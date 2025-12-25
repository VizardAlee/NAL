
'use server';

import { adminDb } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phoneNumber: z.string().optional(),
  role: z.enum(['Investor', 'Client', 'Marketer', 'Admin', 'Legal', 'Recovery']),
});

// Helper function to generate a unique referral code
function generateReferralCode(name: string): string {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}

export async function createUserAction(data: z.infer<typeof createUserSchema>) {
  const validated = createUserSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided.' };
  }

  const { name, email, password, role, phoneNumber } = validated.data;

  try {
    const auth = getAuth(adminDb.app);
    
    // 1. Create user in Firebase Auth (Admin SDK = no sign-in)
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true, // It's good practice to mark email as verified
    });

    // 2. Set custom claim for the role
    await auth.setCustomUserClaims(userRecord.uid, { role });

    // 3. Create user document in Firestore
    const userData: any = {
      name,
      email,
      role,
    };

    if (phoneNumber) {
      userData.phoneNumber = phoneNumber;
    }
    
    // 4. Generate and add referral code if the user is a Marketer
    if (role === 'Marketer') {
        userData.referralCode = generateReferralCode(name);
        userData.rating = 0; // Initialize rating
    }

    await adminDb.collection('users').doc(userRecord.uid).set(userData);

    return { success: true, message: `User ${name} created successfully as ${role}.` };
  } catch (error: any) {
    console.error('Create user error:', error);
    if (error.code === 'auth/email-already-exists') {
        return { success: false, message: 'This email address is already in use by another account.' };
    }
    return { success: false, message: error.message || 'An unknown error occurred while creating the user.' };
  }
}
