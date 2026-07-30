
'use server';

import { z } from 'zod';
import { firebaseConfig } from '@/firebase/config';

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
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
        cache: 'no-store',
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload?.error?.message;
      if (code !== 'EMAIL_NOT_FOUND') {
        throw new Error(`Firebase password reset delivery failed: ${code || response.status}`);
      }
    }

    return {
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    };
  } catch (error) {
    console.error('Password Reset Error:', error);
    // We return a generic success message even on error to prevent email enumeration.
    return {
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    };
  }
}
