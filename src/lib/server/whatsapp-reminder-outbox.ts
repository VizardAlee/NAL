import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateAmortizationSchedule } from '@/lib/amortization';
import type { Deal } from '@/lib/types';
import { buildRepaymentProgressNotice, lagosDateKey, normalizeWhatsAppPhone, repaymentProgress } from '@/lib/repayment-progress-notice';
import { hasPersona } from '@/lib/access-control';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const whatsappConsentSchema = z.object({ clientId: id, optedIn: z.boolean(), phone: z.string().max(30).optional(), evidence: z.string().trim().min(10).max(1000) }).strict();
export async function setWhatsAppConsent(db: Firestore, actorId: string, input: unknown) {
  const data = whatsappConsentSchema.parse(input);
  return db.runTransaction(async transaction => {
    const profile = await transaction.get(db.collection('users').doc(data.clientId));
    if (!profile.exists || !hasPersona(profile.data(), 'CLIENT')) throw new Error('Select an existing client account.');
    const phone = data.optedIn ? normalizeWhatsAppPhone(data.phone || String(profile.data()?.phoneNumber || '')) : '';
    const value = { optedIn: data.optedIn, phone, evidence: data.evidence, recordedBy: actorId, profilePhoneAtConsent: String(profile.data()?.phoneNumber || ''), updatedAt: FieldValue.serverTimestamp(), revision: randomUUID() };
    transaction.set(db.collection('whatsappConsents').doc(data.clientId), value);
    transaction.set(db.collection('whatsappConsentAudit').doc(), { ...value, clientId: data.clientId });
    return { optedIn: data.optedIn };
  });
}

/** Administrator preview only. Does not send, enqueue, or modify the ledger. */
export async function previewWhatsAppReminder(db: Firestore, clientId: string, now = new Date()) {
  id.parse(clientId);
  const [user, deals, payments, bank, previous] = await Promise.all([
    db.collection('users').doc(clientId).get(), db.collection('deals').where('clientId', '==', clientId).get(),
    db.collection('repayments').where('clientId', '==', clientId).get(),
    db.doc('platformSettings/bankDetails').get(), db.collection('whatsappDeliveryState').doc(clientId).get(),
  ]);
  if (!user.exists || !hasPersona(user.data(), 'CLIENT')) throw new Error('Client not found.');
  const account = bank.data();
  if (!account?.accountName || !account?.bankName || !/^\d{10}$/.test(account?.accountNumber || '')) throw new Error('Set and verify NAL receiving-bank details in admin settings before preparing notices.');
  const active = deals.docs.filter(doc => doc.data().status === 'Active').sort((a, b) => a.id.localeCompare(b.id));
  const progress = [];
  for (const document of active) {
    const deal = document.data();
    // Legacy repayment rows may have dealId but no clientId: fetch by deal to avoid losing them.
    const byDeal = await db.collection('repayments').where('dealId', '==', document.id).get();
    const rows = new Map([...payments.docs, ...byDeal.docs].filter(doc => doc.data().dealId === document.id).map(doc => [doc.id, doc.data()]));
    const repaymentRows = [...rows.values()].filter(row => row.status === 'Approved' && (!row.approvedAt?.toDate || row.approvedAt.toDate().getTime() <= now.getTime()));
    const startDate = deal.startDate?.toDate?.() || deal.createdAt?.toDate?.();
    if (!startDate) throw new Error('An active deal is missing its contractual start date.');
    progress.push(repaymentProgress({ id: document.id, name: deal.dealName || document.id, financingMode: deal.financingMode || 'Murabaha', frequency: deal.repaymentFrequency, startDate, schedule: generateAmortizationSchedule({ ...deal, id: document.id } as Deal), repayments: repaymentRows, now }));
  }
  const fingerprint = createHash('sha256').update(active.map(doc => doc.id).join('|')).digest('hex');
  const previousData = previous.data();
  const report = buildRepaymentProgressNotice({ clientName: user.data()?.name || 'Client', asOf: lagosDateKey(now), deals: progress,
    account: { accountName: account.accountName, accountNumber: account.accountNumber, bankName: account.bankName },
    ...(previousData?.dealFingerprint === fingerprint ? { previousAmountPaid: previousData.amountPaid } : {}),
  });
  return { ...report, clientId, asOf: lagosDateKey(now), deals: progress, dealFingerprint: fingerprint, preferredLanguage: user.data()?.preferredLanguage || 'en', due: progress.some(deal => deal.due) };
}

/** Invoked by the existing Lagos 16:00 scheduler. No provider call occurs here. */
export async function prepareWhatsAppReminders(db: Firestore, now = new Date()) {
  const settings = await db.doc('reminderSettings/whatsapp').get();
  if (settings.data()?.enabled !== true) return { enabled: false, prepared: 0, skipped: 0, errors: 0 };
  const consents = await db.collection('whatsappConsents').where('optedIn', '==', true).get();
  let prepared = 0, skipped = 0, errors = 0;
  for (const consent of consents.docs) {
    try {
      const outboxId = createHash('sha256').update(`repayment-progress-v1:${consent.id}:${lagosDateKey(now)}`).digest('hex');
      const ref = db.collection('whatsappReminderOutbox').doc(outboxId);
      if ((await ref.get()).exists) { skipped++; continue; }
      const facilities = await db.collection('deals').where('clientId', '==', consent.id).get();
      if (!facilities.docs.some(document => document.data().status === 'Active')) { skipped++; continue; }
      const report = await previewWhatsAppReminder(db, consent.id, now);
      if (!report.due) { skipped++; continue; }
      const created = await db.runTransaction(async transaction => {
        const [existing, currentConsent, currentUser, currentSettings] = await Promise.all([
          transaction.get(ref), transaction.get(consent.ref), transaction.get(db.collection('users').doc(consent.id)), transaction.get(db.doc('reminderSettings/whatsapp')),
        ]);
        if (existing.exists || currentSettings.data()?.enabled !== true || currentConsent.data()?.optedIn !== true || currentConsent.data()?.revision !== consent.data().revision || String(currentUser.data()?.phoneNumber || '') !== currentConsent.data()?.profilePhoneAtConsent) return false;
        const phone = normalizeWhatsAppPhone(currentConsent.data()?.phone || '');
        // Expire at the next Lagos midnight. Historical queues must not flood clients after activation.
        const expiresAt = Timestamp.fromDate(new Date(Date.parse(`${report.asOf}T00:00:00+01:00`) + 86400000));
        transaction.create(ref, { ...report, phone, consentRevision: currentConsent.data()?.revision, status: 'PREPARED', channel: 'WHATSAPP', provider: null, createdAt: Timestamp.fromDate(now), expiresAt, templateVersion: 1 });
        return true;
      });
      if (created) prepared++; else skipped++;
    } catch {
      // Keep actionable errors in a restricted collection, never log customer financial data.
      errors++;
      await db.collection('whatsappReminderErrors').doc(createHash('sha256').update(`${consent.id}:${lagosDateKey(now)}`).digest('hex')).set({ clientId: consent.id, asOf: lagosDateKey(now), code: 'PREPARATION_REQUIRES_REVIEW', updatedAt: FieldValue.serverTimestamp() });
    }
  }
  await db.doc('reminderSettings/whatsappHealth').set({ lastRunAt: Timestamp.fromDate(now), prepared, skipped, errors });
  return { enabled: true, prepared, skipped, errors };
}

/** Future provider worker must use this claim, not read a queue and send blindly. */
export async function claimWhatsAppReminder(db: Firestore, outboxId: string, transportReady: boolean, now = new Date()) {
  if (!transportReady) return null;
  z.string().regex(/^[a-f0-9]{64}$/).parse(outboxId);
  const initial = await db.collection('whatsappReminderOutbox').doc(outboxId).get();
  if (!initial.exists || initial.data()?.status !== 'PREPARED') return null;
  // Never send yesterday's calculations or figures prepared before a new payment.
  let freshReport: Awaited<ReturnType<typeof previewWhatsAppReminder>>;
  try { freshReport = await previewWhatsAppReminder(db, initial.data()!.clientId, now); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'No active facilities to report.') throw error;
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(initial.ref);
      if (latest.data()?.status === 'PREPARED') transaction.update(initial.ref, { status: 'CANCELLED', cancelledAt: Timestamp.fromDate(now) });
    });
    return null;
  }
  return db.runTransaction(async transaction => {
    const ref = db.collection('whatsappReminderOutbox').doc(outboxId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    const [consent, user, settings] = await Promise.all([transaction.get(db.collection('whatsappConsents').doc(data.clientId)), transaction.get(db.collection('users').doc(data.clientId)), transaction.get(db.doc('reminderSettings/whatsapp'))]);
    if (data.status !== 'PREPARED' || settings.data()?.enabled !== true) return null;
    if (!freshReport.due || freshReport.asOf !== data.asOf || data.expiresAt.toMillis() <= now.getTime() || consent.data()?.optedIn !== true || consent.data()?.revision !== data.consentRevision || consent.data()?.phone !== data.phone || String(user.data()?.phoneNumber || '') !== consent.data()?.profilePhoneAtConsent) {
      transaction.update(ref, { status: 'CANCELLED', cancelledAt: Timestamp.fromDate(now) }); return null;
    }
    const attemptId = randomUUID();
    // No automatic reclaim: a timed-out/crashed send may already have reached Meta.
    transaction.update(ref, { ...freshReport, status: 'SENDING', attemptId, sendingAt: Timestamp.fromDate(now) });
    return { ...data, ...freshReport, outboxId, attemptId };
  });
}

export async function recordWhatsAppSendResult(db: Firestore, outboxId: string, attemptId: string, result: { status: 'SENT' | 'FAILED' | 'UNKNOWN'; providerMessageId?: string }) {
  z.string().regex(/^[a-f0-9]{64}$/).parse(outboxId); z.string().uuid().parse(attemptId);
  if (!['SENT', 'FAILED', 'UNKNOWN'].includes(result.status) || (result.status === 'SENT' && !result.providerMessageId)) throw new Error('Provider acknowledgement is required before recording sent delivery.');
  await db.runTransaction(async transaction => {
    const ref = db.collection('whatsappReminderOutbox').doc(outboxId);
    const snapshot = await transaction.get(ref); const data = snapshot.data();
    if (!data || data.status !== 'SENDING' || data.attemptId !== attemptId) throw new Error('Invalid or already completed delivery attempt.');
    const stateRef = db.collection('whatsappDeliveryState').doc(data.clientId);
    const state = await transaction.get(stateRef);
    transaction.update(ref, { status: result.status, providerMessageId: result.providerMessageId || null, completedAt: FieldValue.serverTimestamp() });
    if (result.status === 'SENT' && (!state.exists || state.data()!.asOf <= data.asOf)) transaction.set(stateRef, { asOf: data.asOf, dealFingerprint: data.dealFingerprint, amountPaid: data.amountPaid, outboxId, updatedAt: FieldValue.serverTimestamp() });
  });
}
