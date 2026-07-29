
'use server';

import { adminDb } from '@/firebase/admin-app';
import { z } from 'zod';
import { verifyAdminWrite } from '@/lib/server/auth';

const withdrawalQuarterSchema = z.object({
    label: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

const withdrawalWindowSchema = z.object({
    quarters: z.array(withdrawalQuarterSchema),
});

const nisabSchema = z.object({
    nisab: z.coerce.number().positive("Nisab must be a positive number."),
});

export async function setNisabAction(prevState: any, formData: FormData) {
    await verifyAdminWrite(String(formData.get('authToken') || ''));
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

export async function setOwnerWithdrawalWindowAction(prevState: any, formData: FormData) {
    await verifyAdminWrite(String(formData.get('authToken') || ''));
    const rawJson = formData.get('quarters');
    let parsed;
    try {
        parsed = JSON.parse(rawJson as string);
    } catch {
        return { success: false, message: 'Invalid data format.' };
    }

    const validated = withdrawalWindowSchema.safeParse({ quarters: parsed });
    if (!validated.success) {
        return { success: false, message: 'Invalid quarter data: ' + validated.error.errors[0]?.message };
    }

    try {
        const ref = adminDb.doc('platformSettings/ownerWithdrawalWindow');
        await ref.set({ quarters: validated.data.quarters }, { merge: true });
        return { success: true, message: 'Withdrawal windows updated successfully.' };
    } catch (error) {
        console.error('Set Withdrawal Window Error:', error);
        return { success: false, message: 'Failed to update withdrawal windows.' };
    }
}
