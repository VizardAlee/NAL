
'use server';

import { adminDb } from '@/firebase/admin-app';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const logoSchema = z.object({
  logoUrl: z.string().startsWith('data:image/'),
});

export async function setLogoAction(prevState: any, formData: FormData) {
    const validated = logoSchema.safeParse({
        logoUrl: formData.get('logoUrl'),
    });

    if (!validated.success) {
        return { success: false, message: 'Invalid logo data provided. Must be a data URI.' };
    }

    try {
        const brandingSettingsRef = adminDb.doc('platformSettings/branding');
        await brandingSettingsRef.set({ logoUrl: validated.data.logoUrl }, { merge: true });
        
        // Revalidate all paths to ensure the new logo shows up everywhere
        revalidatePath('/', 'layout');

        return { success: true, message: 'Logo has been updated successfully.' };
    } catch (error) {
        console.error("Set Logo Error:", error);
        return { success: false, message: 'Failed to update the logo.' };
    }
}
