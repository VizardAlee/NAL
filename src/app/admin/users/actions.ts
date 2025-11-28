'use server';

import { z } from 'zod';
// import { initializeFirebase } from '@/firebase/server';
// import { doc, setDoc } from 'firebase/firestore';

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
  
  // const { auth, firestore } = initializeFirebase();
  const { name, email, password, role } = validatedData.data;

  // Temporarily bypass Firebase Admin SDK for local development
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log("Simulating user creation for:", email);
    // Return a mock success response
    return {
      uid: `mock-uid-${Date.now()}`,
      ...validatedData.data,
    };
  }

  // The original code will run if FIREBASE_SERVICE_ACCOUNT_KEY is set.
  // This part of the code is currently unreachable and is left here for when
  // the service account is configured.
  const { initializeFirebase } = await import('@/firebase/server');
  const { doc, setDoc } = await import('firebase/firestore');
  const { auth, firestore } = initializeFirebase();

  try {
    // 1. Create user in Firebase Authentication
    const userCredential = await auth.createUser({
      email,
      password,
      displayName: name,
    });
    
    // Disable the user by default, admin can enable them later.
    await auth.updateUser(userCredential.uid, { disabled: false });

    // 2. Create user profile in Firestore
    const userDocRef = doc(firestore, 'users', userCredential.uid);
    await setDoc(userDocRef, {
      name,
      email,
      role,
    });

    return {
      uid: userCredential.uid,
      ...validatedData.data,
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Re-throw the error to be caught by the client-side form handler
    throw new Error(error.message || 'An unexpected error occurred during user creation.');
  }
}
