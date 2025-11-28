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
  const { name, email, password, role: initialRole } = validatedData.data;
  let finalRole = initialRole;

  try {
    // Check if this is the first user. If so, make them an Admin.
    const usersCollection = firestore.collection('users'); // Use Admin SDK collection method
    const snapshot = await usersCollection.count().get(); // Use Admin SDK count method
    if (snapshot.data().count === 0) {
      finalRole = 'Admin';
      console.log('First user detected. Assigning Admin role.');
    }

    console.log(`Creating user with email: ${email} and role: ${finalRole}`);
    
    // 1. Create user in Firebase Authentication
    const userCredential = await getAuth().createUser({
      email,
      password,
      displayName: name,
    });
    console.log(`Successfully created Auth user with UID: ${userCredential.uid}`);
    
    // Set custom claim for the user's role
    await getAuth().setCustomUserClaims(userCredential.uid, { role: finalRole });
    console.log(`Successfully set custom claim: { role: '${finalRole}' }`);

    // 2. Create user profile in Firestore
    const userDocRef = firestore.collection('users').doc(userCredential.uid); // Use Admin SDK doc method
    await userDocRef.set({
      name,
      email,
      role: finalRole,
    });
    console.log(`Successfully created Firestore document in /users/${userCredential.uid}`);
    
    // Revalidate the path to ensure the new user shows up in the table
    revalidatePath('/admin/users');

    return {
      uid: userCredential.uid,
      name,
      email,
      role: finalRole,
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Re-throw a more user-friendly error message
    throw new Error(error.message || 'An unexpected error occurred during user creation.');
  }
}
