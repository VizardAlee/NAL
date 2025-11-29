
'use server';

import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

type ActionState = {
  success: boolean;
  message: string;
};

export async function sendPasswordResetEmailAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const validatedFields = resetPasswordSchema.safeParse({
    email: formData.get('email'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      message: validatedFields.error.flatten().fieldErrors.email?.[0] || 'Invalid email format.',
    };
  }
  
  const { email } = validatedFields.data;

  try {
    const { auth } = initializeFirebase();
    await auth.generatePasswordResetLink(email);

    return {
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    };
  } catch (error: any) {
    console.error('Password Reset Error:', error);
    // We return a generic success message even on error to prevent email enumeration.
    return {
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    };
  }
}
