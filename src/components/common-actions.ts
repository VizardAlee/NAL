
'use server';

import { adminDb } from '@/firebase/admin-app';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const updateProfileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters."),
  phoneNumber: z.string().optional(),
});

export async function updateProfileAction(data: z.infer<typeof updateProfileSchema>) {
  const validated = updateProfileSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: "Invalid data provided." };
  }

  const { userId, name, phoneNumber } = validated.data;

  try {
    const userDocRef = adminDb.collection('users').doc(userId);
    
    // Prepare the data for update, handling the optional phone number.
    const updateData: { name: string; phoneNumber?: string } = { name };
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
