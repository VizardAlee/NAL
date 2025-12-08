
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
    const updateData: { name: string; phoneNumber?: string } = { name };
    
    if (phoneNumber) {
      updateData.phoneNumber = phoneNumber;
    } else {
      // If phone number is an empty string, remove it from the document.
      updateData.phoneNumber = ''
    }

    await userDocRef.update(updateData);
    
    revalidatePath(`/admin/users/${userId}`);

    return { success: true, message: "Profile updated successfully." };
  } catch (error: any) {
    return { success: false, message: error.message || "An unknown error occurred." };
  }
}
