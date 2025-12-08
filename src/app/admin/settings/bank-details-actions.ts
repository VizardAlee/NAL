
'use server';

import { adminDb } from '@/firebase/admin-app';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const bankDetailsSchema = z.object({
  bankName: z.string().min(2, { message: 'Bank name is required.' }),
  accountName: z.string().min(2, { message: 'Account name is required.' }),
  accountNumber: z.string().min(10, { message: 'Account number must be at least 10 digits.' }),
});

export async function setBankDetailsAction(prevState: any, formData: FormData) {
  const validated = bankDetailsSchema.safeParse({
    bankName: formData.get('bankName'),
    accountName: formData.get('accountName'),
    accountNumber: formData.get('accountNumber'),
  });

  if (!validated.success) {
    return { success: false, message: 'Invalid form data provided.' };
  }

  try {
    const bankDetailsRef = adminDb.doc('platformSettings/bankDetails');
    await bankDetailsRef.set(validated.data, { merge: true });

    // Revalidate user dashboards where this info is shown
    revalidatePath('/investor/dashboard');
    revalidatePath('/client/dashboard');

    return { success: true, message: 'Bank details have been updated successfully.' };
  } catch (error) {
    console.error('Set Bank Details Error:', error);
    return { success: false, message: 'Failed to update bank details.' };
  }
}

    