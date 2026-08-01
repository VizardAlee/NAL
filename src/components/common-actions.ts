
'use server';

import { adminDb } from '@/firebase/admin-app';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const updateProfileSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters."),
  phoneNumber: z.string().optional(),
  address: z.string().trim().refine((value) => !value || value.length >= 5, 'Enter a complete residential address.'),
  bankName: z.string().trim().refine((value) => !value || value.length >= 2, 'Enter a valid bank name.'),
  bankAccountName: z.string().trim().refine((value) => !value || value.length >= 2, 'Enter a valid account name.'),
  bankAccountNumber: z.string().trim().refine((value) => !value || /^\d{10}$/.test(value), 'Account number must contain exactly 10 digits.'),
});

export async function updateProfileAction(data: z.infer<typeof updateProfileSchema>) {
  const validated = updateProfileSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: "Invalid data provided." };
  }

  const {
    authToken,
    userId,
    name,
    phoneNumber,
    address,
    bankName,
    bankAccountName,
    bankAccountNumber,
  } = validated.data;

  try {
    await verifyAuthTokenForUser(authToken, userId);
    const userDocRef = adminDb.collection('users').doc(userId);
    
    // Prepare the data for update, handling the optional phone number.
    const updateData: {
      name: string;
      phoneNumber?: string;
      address: string;
      bankName: string;
      bankAccountName: string;
      bankAccountNumber: string;
    } = {
      name,
      address,
      bankName,
      bankAccountName,
      bankAccountNumber,
    };
    if (phoneNumber) {
      updateData.phoneNumber = phoneNumber;
    } else {
      // If the phone number is an empty string, we remove it from the document.
      // In Firestore, you can do this by setting the field to `undefined` in an update,
      // but the server action will handle this by not including the field if it's empty.
      // For clarity, we can use FieldValue.delete() but this is more complex to handle with optional fields.
      // A simple approach is to just not include it if it's falsey.
      const docData = (await userDocRef.get()).data();
      if (docData && 'phoneNumber' in docData) {
        // To remove a field, you would typically use FieldValue.delete()
        // but for simplicity, we'll just update with the provided values.
        // An empty string will be saved if provided, which is acceptable.
        updateData.phoneNumber = phoneNumber;
      }
    }

    await userDocRef.update(updateData);
    
    // Revalidate paths where user info might be displayed
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/settings');
    revalidatePath('/investor/settings');
    revalidatePath('/client/settings');

    return { success: true, message: "Profile updated successfully." };
  } catch (error: any) {
    return { success: false, message: error.message || "An unknown error occurred." };
  }
}

const updateProfilePhotoSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  photoURL: z.string().url().refine(
    (url) => url.startsWith('https://firebasestorage.googleapis.com/'),
    'Profile photo must be stored in Firebase Storage.'
  ),
  storagePath: z.string().min(1),
});

export async function updateProfilePhotoAction(data: z.infer<typeof updateProfilePhotoSchema>) {
  const validated = updateProfilePhotoSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: 'Invalid profile photo data.' };
  }

  const { authToken, userId, photoURL, storagePath } = validated.data;
  if (!storagePath.startsWith(`users/${userId}/profile/`)) {
    return { success: false, message: 'Invalid profile photo location.' };
  }

  try {
    await verifyAuthTokenForUser(authToken, userId);
    await adminDb.collection('users').doc(userId).update({
      photoURL,
      photoStoragePath: storagePath,
    });
    revalidatePath('/investor/settings');
    revalidatePath('/client/settings');
    revalidatePath('/investor/dashboard');
    revalidatePath('/client/dashboard');
    revalidatePath('/investor/agreements');
    return { success: true, message: 'Profile photo updated successfully.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unable to update profile photo.',
    };
  }
}
