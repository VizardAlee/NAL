
'use server';

import { adminDb } from '@/firebase/admin-app';
import { z } from 'zod';

const nisabSchema = z.object({
  nisab: z.coerce.number().positive("Nisab must be a positive number."),
});

export async function setNisabAction(prevState: any, formData: FormData) {
    const validated = nisabSchema.safeParse({
        nisab: formData.get('nisab'),
    });

    if (!validated.success) {
        return { success: false, message: 'Invalid Nisab value provided.' };
    }

    try {
        const zakatSettingsRef = adminDb.doc('platformSettings/zakat');
        await zakatSettingsRef.set({ nisab: validated.data.nisab }, { merge: true });
        
        return { success: true, message: 'Zakat Nisab has been updated successfully.' };
    } catch (error) {
        console.error("Set Nisab Error:", error);
        return { success: false, message: 'Failed to update Zakat Nisab.' };
    }
}
