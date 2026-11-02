'use server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { verifyPersonaForUser, verifyAdminOrOwner, verifyPersonaOrAdmin } from '@/lib/server/auth';
import { hasPersona } from '@/lib/access-control';

async function assignedDeals(marketerId: string) {
  return (await adminDb.collection('deals').where('marketerId', '==', marketerId).get()).docs;
}

/** Compatibility endpoint: attribution codes never grant client access. */
export async function getMarketerStats(input: { authToken: string; marketerId: string }) {
  try {
    const value = z.object({ authToken: z.string().min(1), marketerId: z.string().min(1) }).parse(input);
    await verifyPersonaForUser(value.authToken, value.marketerId, 'MARKETER').catch(async () => { await verifyAdminOrOwner(value.authToken); });
    if (!hasPersona((await adminDb.doc(`users/${value.marketerId}`).get()).data(), 'MARKETER')) throw new Error('Marketer profile not found.');
    const deals = await assignedDeals(value.marketerId);
    return { success: true, data: {
      referredClientCount: null, referredInvestorCount: null, totalInvestorCapital: null, referredClients: null, referredInvestors: null,
      totalDealValue: deals.reduce((sum,d) => sum + Number(d.data().principal || 0), 0),
      deals: deals.map(d => ({ dealName: String(d.data().dealName || ''), clientName: String(d.data().clientName || ''), status: String(d.data().status || ''), principal: Number(d.data().principal || 0) })),
    } };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to load assigned deals.' }; }
}

export async function loadMarketerWorkspaceAction(authToken: string) {
  const actor = await verifyPersonaOrAdmin(authToken, 'MARKETER');
  // UID is derived solely from the verified token. Admin access here is to self.
  const [deals, obligations] = await Promise.all([assignedDeals(actor.uid), adminDb.collection('marketingCommissions').where('marketerId', '==', actor.uid).get()]);
  const assigned = new Set(deals.map(d => d.id));
  const clients = await Promise.all(deals.map(async d => {
    const data = d.data();
    const [profile, tasks] = await Promise.all([
      adminDb.doc(`users/${data.clientId}`).get(), adminDb.collection('recoveryTasks').where('dealId', '==', d.id).get(),
    ]);
    return {
      dealId: d.id, dealName: String(data.dealName || ''), clientName: String(data.clientName || ''),
      phoneNumber: String(profile.data()?.phoneNumber || ''), status: String(data.status || ''),
      tasks: tasks.docs.filter(t => t.data().clientId === data.clientId).map(t => ({ id: t.id, status: String(t.data().status || ''), amountOutstanding: Number(t.data().amountOutstanding || 0), installmentNumber: Number(t.data().installmentNumber || 0),
        nextActionAt: t.data().marketerNextActionAt?.toDate?.().toISOString() || '', promiseAmount: Number(t.data().marketerPromiseAmount || 0), promiseDueAt: t.data().marketerPromiseDueAt?.toDate?.().toISOString() || '' })),
    };
  }));
  // Recheck assignment after gathering dependent data, to reject a stale in-flight load.
  const current = await Promise.all(deals.map(d => d.ref.get()));
  if (current.some(d => d.data()?.marketerId !== actor.uid)) throw new Error('Assignments changed. Reload your workspace.');
  return {
    clients,
    commissions: obligations.docs.map(d => ({ id: d.id, dealName: assigned.has(d.id) ? clients.find(c => c.dealId === d.id)?.dealName || '' : 'Previous assignment', earnedKobo: Number(d.data().earnedKobo), paidKobo: Number(d.data().fundedKobo), outstandingKobo: Number(d.data().earnedKobo) - Number(d.data().fundedKobo) })),
  };
}

export async function recordMarketerFollowUpAction(input: unknown) {
  const value = z.object({ authToken: z.string().min(1), taskId: z.string().regex(/^[a-zA-Z0-9_-]{1,180}$/),
    operationId: z.string().uuid(), notes: z.string().trim().min(3).max(4000),
    outcome: z.enum(['CONTACTED','NO_ANSWER','PROMISE_TO_PAY','FOLLOW_UP_REQUIRED']),
    nextActionAt: z.string().datetime(), promiseAmount: z.number().finite().positive().optional(), promiseDueAt: z.string().datetime().optional(),
  }).refine(v => v.outcome !== 'PROMISE_TO_PAY' || (!!v.promiseAmount && !!v.promiseDueAt), 'A promise requires its amount and due date.').parse(input);
  const actor = await verifyPersonaOrAdmin(value.authToken, 'MARKETER');
  await adminDb.runTransaction(async trx => {
    const ref = adminDb.doc(`recoveryTasks/${value.taskId}`), logRef = ref.collection('logs').doc(`marketer-${value.operationId}`);
    const [task, log, profile] = await Promise.all([trx.get(ref), trx.get(logRef), trx.get(adminDb.doc(`users/${actor.uid}`))]);
    if (!hasPersona(profile.data(), 'MARKETER')) throw new Error('Marketer access was removed.');
    if (!task.exists) throw new Error('Task unavailable.');
    const deal = await trx.get(adminDb.doc(`deals/${task.data()!.dealId}`));
    if (deal.data()?.marketerId !== actor.uid || deal.data()?.clientId !== task.data()?.clientId) throw new Error('This client is not assigned to you.');
    if (log.exists) {
      if (log.data()?.authorId !== actor.uid || log.data()?.text !== value.notes || log.data()?.outcome !== value.outcome || log.data()?.nextActionAt !== value.nextActionAt || log.data()?.promiseAmount !== (value.promiseAmount || null) || log.data()?.promiseDueAt !== (value.promiseDueAt || null)) throw new Error('Follow-up retry data changed.');
      return;
    }
    const now = Timestamp.now();
    trx.create(logRef, { kind: 'MARKETER_CONTACT', authorId: actor.uid, authorName: String(profile.data()?.name || 'Assigned marketer'), text: value.notes, outcome: value.outcome,
      nextActionAt: value.nextActionAt, promiseAmount: value.promiseAmount || null, promiseDueAt: value.promiseDueAt || null, createdAt: now, paymentConfirmed: false });
    trx.update(ref, { marketerLastContactAt: now, marketerLastContactBy: actor.uid, marketerNextActionAt: Timestamp.fromDate(new Date(value.nextActionAt)),
      ...(value.outcome === 'PROMISE_TO_PAY' ? { marketerPromiseAmount: value.promiseAmount, marketerPromiseDueAt: Timestamp.fromDate(new Date(value.promiseDueAt!)) } : {}),
    });
  });
  return { success: true as const };
}
