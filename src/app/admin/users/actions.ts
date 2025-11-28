'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { doc, setDoc, getCountFromServer, collection } from 'firebase/firestore';
import { getAuth } from 'firebase-admin/auth';

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

  const { auth, firestore } = initializeFirebase();
  const { name, email, password } = validatedData.data;
  let { role } = validatedData.data;

  // Check if this is the first user. If so, make them an Admin.
  const usersCollection = collection(firestore, 'users');
  const snapshot = await getCountFromServer(usersCollection);
  if (snapshot.data().count === 0) {
    role = 'Admin';
  }

  try {
    // 1. Create user in Firebase Authentication
    const userCredential = await getAuth().createUser({
      email,
      password,
      displayName: name,
    });
    
    // Set custom claim for the user's role
    await getAuth().setCustomUserClaims(userCredential.uid, { role });
    
    // 2. Create user profile in Firestore
    const userDocRef = doc(firestore, 'users', userCredential.uid);
    await setDoc(userDocRef, {
      name,
      email,
      role,
    });

    return {
      uid: userCredential.uid,
      name,
      email,
      role,
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Re-throw the error to be caught by the client-side form handler
    throw new Error(error.message || 'An unexpected error occurred during user creation.');
  }
}
