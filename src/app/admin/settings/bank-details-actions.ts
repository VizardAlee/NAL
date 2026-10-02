
'use server';

import { adminDb } from '@/firebase/admin-app';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifyAdminWrite } from '@/lib/server/auth';
import { platformBankAccountsSchema } from '@/lib/platform-bank-accounts';
import { FieldValue } from 'firebase-admin/firestore';

export async function setPlatformBankAccountsAction(token: string, raw: unknown) {
  try {
    const actor = await verifyAdminWrite(token);
    const input = platformBankAccountsSchema.and(z.object({revision:z.number().int().nonnegative()})).parse(raw);
    const revision = await adminDb.runTransaction(async transaction => {
      const ref = adminDb.doc('platformSettings/bankDetails');
      const existing = await transaction.get(ref);
      const current = Number(existing.data()?.revision || 0);
      if (current !== input.revision) throw new Error('Payment accounts were changed by another administrator. Discard changes and reload before saving.');
      const primary = input.accounts.find(account => account.id === input.defaultAccountId)!;
      transaction.set(ref, {accounts:input.accounts,defaultAccountId:input.defaultAccountId,bankName:primary.bankName,accountName:primary.accountName,accountNumber:primary.accountNumber,revision:current+1,updatedBy:actor.uid,updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.create(adminDb.collection('platformBankAccountAudit').doc(), {accounts:input.accounts,defaultAccountId:input.defaultAccountId,previous:existing.data() || null,actorId:actor.uid,createdAt:FieldValue.serverTimestamp()});
      return current+1;
    });
    revalidatePath('/client/dashboard'); revalidatePath('/investor/dashboard');
    return {success:true,message:'Payment accounts saved.',revision};
  } catch(error) {return {success:false,message:error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Payment accounts could not be saved.'};}
}
