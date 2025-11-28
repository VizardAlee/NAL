'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { getAuth } from 'firebase-admin/auth';
import { revalidatePath } from 'next/cache';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Investor', 'Client']),
});

export async function createUser(values: z.infer<typeof userSchema>) {
  const validatedData = userSchema.safeParse(values);
  if (!validatedData.success) {
    throw new Error('Invalid user data provided.');
  }

  const { firestore } = initializeFirebase();
  const { name, email, password, role } = validatedData.data;
  
  try {
    console.log(`Creating user with email: ${email} and role: ${role}`);
    
    // 1. Create user in Firebase Authentication
    const userCredential = await getAuth().createUser({
      email,
      password,
      displayName: name,
    });
    console.log(`Successfully created Auth user with UID: ${userCredential.uid}`);
    
    // Set custom claim for the user's role
    await getAuth().setCustomUserClaims(userCredential.uid, { role });
    console.log(`Successfully set custom claim: { role: '${role}' }`);

    // 2. Create user profile in Firestore
    const userDocRef = firestore.collection('users').doc(userCredential.uid);
    await userDocRef.set({
      name,
      email,
      role,
    });
    console.log(`Successfully created Firestore document in /users/${userCredential.uid}`);
    
    // Revalidate the path to ensure the new user shows up in the table
    revalidatePath('/admin/users');

    return {
      uid: userCredential.uid,
      name,
      email,
      role,
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Re-throw a more user-friendly error message
    throw new Error(error.message || 'An unexpected error occurred during user creation.');
  }
}
