'use server';

import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifyAdminWrite, verifyAnyPersonaOrAdmin } from '@/lib/server/auth';
import { canWriteAdmin, hasPersona } from '@/lib/access-control';
import {
  CONTACT_CHANNELS,
  LEGAL_STATUSES,
  RECOVERY_OUTCOMES,
  canTransitionRecoveryStatus,
  isClosedRecoveryStatus,
  isLegalStatus,
  isRecoveryStatus,
  normalizeRecoveryStatus,
  recoveryStatusLabel,
} from '@/lib/recovery';
import { notifyAdmins, notifyOperationalTeam, notifyUser } from '@/lib/server/notification-service';
import { createHash } from 'node:crypto';

const tokenSchema = z.string().min(1);
const idSchema = z.string().min(1).max(180);
const noteSchema = z.string().trim().min(1).max(4_000);

type ActorContext = {
  uid: string;
  name: string;
  actorType: 'ADMIN' | 'LEGAL' | 'RECOVERY';
};

async function getActor(authToken: string): Promise<ActorContext> {
  const decoded = await verifyAnyPersonaOrAdmin(authToken, ['RECOVERY', 'LEGAL']);
  const profileSnapshot = await adminDb.collection('users').doc(decoded.uid).get();
  if (!profileSnapshot.exists) throw new Error('User profile not found.');
  const profile = profileSnapshot.data() || {};
  const actorType = canWriteAdmin(profile) ? 'ADMIN' : hasPersona(profile, 'LEGAL') ? 'LEGAL' : hasPersona(profile, 'RECOVERY') ? 'RECOVERY' : null;
  if (!actorType) throw new Error('Insufficient operational permissions.');
  return { uid: decoded.uid, name: String(profile.name || decoded.name || decoded.email || 'NAL staff'), actorType };
}

function assertTaskAccess(task: FirebaseFirestore.DocumentData, actor: ActorContext, required?: 'RECOVERY' | 'LEGAL') {
  if (actor.actorType === 'ADMIN') return;
  if (required && actor.actorType !== required) throw new Error(`This action requires the ${required.toLowerCase()} role.`);
  if (task.assigneeId && task.assigneeId !== actor.uid) throw new Error('This case is assigned to another officer.');
  if (actor.actorType === 'RECOVERY' && !isRecoveryStatus(task.status)) throw new Error('This case is no longer in the Recovery queue.');
  if (actor.actorType === 'LEGAL' && !isLegalStatus(task.status)) throw new Error('This case is not in the Legal queue.');
  if (isClosedRecoveryStatus(task.status)) throw new Error('This case is already closed.');
}

async function addAuditLog(
  taskRef: FirebaseFirestore.DocumentReference,
  actor: ActorContext,
  input: { kind: string; text: string; [key: string]: unknown }
) {
  const logRef = taskRef.collection('logs').doc();
  await logRef.set({ ...input, authorId: actor.uid, authorName: actor.name, createdAt: FieldValue.serverTimestamp() });
}

function revalidateOperationalPages() {
  revalidatePath('/recovery/dashboard');
  revalidatePath('/legal/dashboard');
  revalidatePath('/admin/dashboard');
}

const addLogSchema = z.object({
  authToken: tokenSchema,
  taskId: idSchema,
  logText: noteSchema,
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export async function addRecoveryLogAction(input: z.input<typeof addLogSchema>) {
  const validated = addLogSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Enter a note between 1 and 4,000 characters.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Recovery case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor);
    await Promise.all([
      addAuditLog(taskRef, actor, { kind: 'NOTE', text: validated.data.logText }),
      taskRef.set({ lastLog: validated.data.logText, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    revalidateOperationalPages();
    return { success: true, message: 'Case note recorded.' };
  } catch (error) {
    console.error('ADD RECOVERY LOG ERROR:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to add the case note.' };
  }
}

const claimSchema = z.object({ authToken: tokenSchema, taskId: idSchema });

export async function claimRecoveryCaseAction(input: z.input<typeof claimSchema>) {
  const validated = claimSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid case request.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(taskRef);
      if (!snapshot.exists) throw new Error('Recovery case not found.');
      const task = snapshot.data()!;
      assertTaskAccess(task, actor);
      if (task.assigneeId && task.assigneeId !== actor.uid) throw new Error('This case has already been claimed.');
      transaction.set(taskRef, { assigneeId: actor.uid, assigneeName: actor.name, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(taskRef.collection('logs').doc(), { kind: 'ASSIGNMENT', text: `Case assigned to ${actor.name}.`, authorId: actor.uid, authorName: actor.name, createdAt: FieldValue.serverTimestamp() });
    });
    revalidateOperationalPages();
    return { success: true, message: 'The case is now assigned to you.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to claim this case.' };
  }
}

export async function listOperationalOfficersAction(input: { authToken: string; portal: 'recovery' | 'legal' }) {
  const validated = z.object({ authToken: tokenSchema, portal: z.enum(['recovery', 'legal']) }).safeParse(input);
  if (!validated.success) return { success: false as const, message: 'Invalid officer request.' };
  try {
    await verifyAdminWrite(validated.data.authToken);
    const persona = validated.data.portal === 'legal' ? 'LEGAL' : 'RECOVERY';
    const snapshot = await adminDb.collection('users').get();
    const officers = snapshot.docs
      .map((document): FirebaseFirestore.DocumentData & { id: string } => ({ id: document.id, ...document.data() }))
      .filter((profile) => Array.isArray(profile.personas)
        ? profile.personas.includes(persona)
        : profile.role === (persona === 'LEGAL' ? 'Legal' : 'Recovery'))
      .map((profile) => ({ id: profile.id, name: String(profile.name || profile.email || 'NAL officer') }))
      .sort((left, right) => left.name.localeCompare(right.name));
    return { success: true as const, message: 'Operational officers loaded.', officers };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Unable to list operational officers.' };
  }
}

const assignmentSchema = z.object({ authToken: tokenSchema, taskId: idSchema, assigneeId: z.string().max(180).nullable() });

export async function assignRecoveryCaseAction(input: z.input<typeof assignmentSchema>) {
  const validated = assignmentSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid assignment request.' };
  try {
    const decoded = await verifyAdminWrite(validated.data.authToken);
    const adminProfile = (await adminDb.collection('users').doc(decoded.uid).get()).data() || {};
    const adminName = String(adminProfile.name || decoded.name || decoded.email || 'NAL administrator');
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Case not found.');
    const task = taskSnapshot.data()!;
    if (isClosedRecoveryStatus(task.status)) throw new Error('Closed cases cannot be reassigned.');
    let assigneeName: string | null = null;
    if (validated.data.assigneeId) {
      const profileSnapshot = await adminDb.collection('users').doc(validated.data.assigneeId).get();
      if (!profileSnapshot.exists) throw new Error('The selected officer no longer exists.');
      const profile = profileSnapshot.data()!;
      const requiredPersona = isLegalStatus(task.status) ? 'LEGAL' : 'RECOVERY';
      if (!hasPersona(profile, requiredPersona)) throw new Error(`The selected officer does not have the ${requiredPersona.toLowerCase()} role.`);
      assigneeName = String(profile.name || profile.email || 'NAL officer');
    }
    const text = assigneeName ? `Case assigned to ${assigneeName} by ${adminName}.` : `Case returned to the unassigned queue by ${adminName}.`;
    await Promise.all([
      taskRef.set({ assigneeId: validated.data.assigneeId, assigneeName, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      taskRef.collection('logs').add({ kind: 'ASSIGNMENT', text, authorId: decoded.uid, authorName: adminName, createdAt: FieldValue.serverTimestamp() }),
    ]);
    revalidateOperationalPages();
    return { success: true, message: text };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to assign the case.' };
  }
}

const contactSchema = z.object({
  authToken: tokenSchema,
  taskId: idSchema,
  channel: z.enum(CONTACT_CHANNELS),
  outcome: z.enum(RECOVERY_OUTCOMES),
  notes: noteSchema,
  nextActionAt: z.string().datetime().optional(),
  promiseAmount: z.coerce.number().positive().optional(),
  promiseDueAt: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (value.outcome === 'PROMISE_TO_PAY' && (!value.promiseAmount || !value.promiseDueAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A promise amount and due date are required.' });
  }
});

export async function recordRecoveryContactAction(input: z.input<typeof contactSchema>) {
  const validated = contactSchema.safeParse(input);
  if (!validated.success) return { success: false, message: validated.error.issues[0]?.message || 'Invalid contact outcome.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Recovery case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'RECOVERY');
    const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      assigneeId: task.assigneeId || actor.uid,
      assigneeName: task.assigneeName || actor.name,
      lastContactAt: FieldValue.serverTimestamp(),
      lastContactChannel: validated.data.channel,
      lastOutcome: validated.data.outcome,
      lastLog: validated.data.notes,
      nextActionAt: validated.data.nextActionAt ? Timestamp.fromDate(new Date(validated.data.nextActionAt)) : null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (validated.data.outcome === 'PROMISE_TO_PAY') {
      update.status = 'PROMISE_TO_PAY';
      update.promiseAmount = validated.data.promiseAmount;
      update.promiseDueAt = Timestamp.fromDate(new Date(validated.data.promiseDueAt!));
    }
    await Promise.all([
      taskRef.set(update, { merge: true }),
      addAuditLog(taskRef, actor, {
        kind: 'CONTACT', text: validated.data.notes, channel: validated.data.channel,
        outcome: validated.data.outcome, nextActionAt: validated.data.nextActionAt || null,
        promiseAmount: validated.data.promiseAmount || null, promiseDueAt: validated.data.promiseDueAt || null,
      }),
    ]);
    revalidateOperationalPages();
    return { success: true, message: 'Contact outcome and follow-up recorded.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to record contact outcome.' };
  }
}

const escalationSchema = z.object({ authToken: tokenSchema, taskId: idSchema, reason: noteSchema });

export async function escalateRecoveryCaseAction(input: z.input<typeof escalationSchema>) {
  const validated = escalationSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Provide a valid escalation reason.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Recovery case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'RECOVERY');
    if (!canTransitionRecoveryStatus(task.status, 'ESCALATED_LEGAL', actor.actorType)) throw new Error('This case cannot be escalated from its current status.');
    await Promise.all([
      taskRef.set({ status: 'ESCALATED_LEGAL', recoveryAssigneeId: task.assigneeId || actor.uid, recoveryAssigneeName: task.assigneeName || actor.name, assigneeId: null, assigneeName: null, escalatedAt: FieldValue.serverTimestamp(), escalationReason: validated.data.reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      addAuditLog(taskRef, actor, { kind: 'STATUS_CHANGE', text: validated.data.reason, fromStatus: task.status, toStatus: 'ESCALATED_LEGAL' }),
      notifyOperationalTeam('LEGAL', 'Recovery case escalated', `${task.clientName} — ${task.dealName}. ${validated.data.reason}`, '/legal/dashboard', 'overdue'),
      notifyAdmins('Recovery case escalated to Legal', `${task.clientName} — ${task.dealName}.`, '/legal/dashboard', 'overdue'),
    ]);
    revalidateOperationalPages();
    return { success: true, message: 'The complete recovery case has been escalated to Legal.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to escalate this case.' };
  }
}

const legalUpdateSchema = z.object({
  authToken: tokenSchema,
  taskId: idSchema,
  nextStatus: z.enum(LEGAL_STATUSES),
  notes: noteSchema,
  nextActionAt: z.string().datetime().optional(),
  externalCounsel: z.string().trim().max(160).optional(),
  courtReference: z.string().trim().max(160).optional(),
  hearingAt: z.string().datetime().optional(),
  settlementAmount: z.coerce.number().nonnegative().optional(),
  settlementTerms: z.string().trim().max(4_000).optional(),
  legalExpense: z.coerce.number().nonnegative().optional(),
});

export async function updateLegalCaseAction(input: z.input<typeof legalUpdateSchema>) {
  const validated = legalUpdateSchema.safeParse(input);
  if (!validated.success) return { success: false, message: validated.error.issues[0]?.message || 'Invalid Legal case update.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Legal case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    if (!canTransitionRecoveryStatus(task.status, validated.data.nextStatus, actor.actorType)) throw new Error(`The case cannot move from ${recoveryStatusLabel(task.status)} to ${recoveryStatusLabel(validated.data.nextStatus)}.`);
    const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      status: validated.data.nextStatus,
      assigneeId: task.assigneeId || actor.uid,
      assigneeName: task.assigneeName || actor.name,
      legalNotes: validated.data.notes,
      nextActionAt: validated.data.nextActionAt ? Timestamp.fromDate(new Date(validated.data.nextActionAt)) : null,
      externalCounsel: validated.data.externalCounsel || task.externalCounsel || null,
      courtReference: validated.data.courtReference || task.courtReference || null,
      hearingAt: validated.data.hearingAt ? Timestamp.fromDate(new Date(validated.data.hearingAt)) : task.hearingAt || null,
      settlementAmount: validated.data.settlementAmount ?? task.settlementAmount ?? null,
      settlementTerms: validated.data.settlementTerms || task.settlementTerms || null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await taskRef.set(update, { merge: true });
    await addAuditLog(taskRef, actor, { kind: 'LEGAL_ACTION', text: validated.data.notes, fromStatus: task.status, toStatus: validated.data.nextStatus, courtReference: validated.data.courtReference || null, settlementAmount: validated.data.settlementAmount ?? null });
    if ((validated.data.legalExpense || 0) > 0) {
      await taskRef.collection('expenses').add({ amount: validated.data.legalExpense, description: validated.data.notes, recordedBy: actor.uid, recordedByName: actor.name, createdAt: FieldValue.serverTimestamp() });
      await taskRef.set({ totalLegalExpenses: FieldValue.increment(validated.data.legalExpense!) }, { merge: true });
    }
    if (validated.data.nextStatus === 'DEMAND_ISSUED') {
      await notifyUser(task.clientId, 'Formal payment demand issued', `A formal demand has been recorded for ${task.dealName}. Sign in to review your account and contact NAL.`, '/client/dashboard', 'overdue');
    }
    revalidateOperationalPages();
    return { success: true, message: `Legal case moved to ${recoveryStatusLabel(validated.data.nextStatus)}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to update the Legal case.' };
  }
}

const resolveSchema = z.object({
  authToken: tokenSchema,
  taskId: idSchema,
  resolutionReason: z.enum(['PAYMENT_COMPLETED', 'SETTLEMENT_COMPLETED', 'ADMINISTRATIVE_CLOSURE']),
  notes: noteSchema,
});

export async function resolveLegalCaseAction(input: z.input<typeof resolveSchema>) {
  const validated = resolveSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Enter a valid closure reason and note.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Legal case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    if (validated.data.resolutionReason === 'PAYMENT_COMPLETED' && Number(task.amountOutstanding || 0) > 0) throw new Error('The recorded outstanding balance must be zero before payment closure.');
    await Promise.all([
      taskRef.set({ status: 'RESOLVED', resolutionReason: validated.data.resolutionReason, resolutionNotes: validated.data.notes, resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      addAuditLog(taskRef, actor, { kind: 'RESOLUTION', text: validated.data.notes, fromStatus: task.status, toStatus: 'RESOLVED', resolutionReason: validated.data.resolutionReason }),
      notifyUser(task.clientId, 'Account recovery case resolved', `The recovery case for ${task.dealName} has been resolved.`, '/client/dashboard', 'system'),
    ]);
    revalidateOperationalPages();
    return { success: true, message: 'The case has been resolved and archived.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to resolve this case.' };
  }
}

const evidenceSchema = z.object({
  authToken: tokenSchema,
  taskId: idSchema,
  fileName: z.string().trim().min(1).max(180),
  storagePath: z.string().min(1).max(500),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  size: z.number().positive().max(5 * 1024 * 1024),
  category: z.enum(['CONTACT_EVIDENCE', 'SERVICE_EVIDENCE', 'COURT_DOCUMENT', 'SETTLEMENT', 'OTHER']),
});

export async function registerCaseEvidenceAction(input: z.input<typeof evidenceSchema>) {
  const validated = evidenceSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid evidence file.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const expectedPrefix = `case-evidence/${validated.data.taskId}/${actor.uid}/`;
    if (!validated.data.storagePath.startsWith(expectedPrefix)) throw new Error('Invalid evidence storage path.');
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Case not found.');
    assertTaskAccess(taskSnapshot.data()!, actor);
    const evidenceRef = taskRef.collection('evidence').doc();
    const evidence = evidenceSchema.omit({ authToken: true }).parse(validated.data);
    await evidenceRef.set({ ...evidence, uploadedBy: actor.uid, uploadedByName: actor.name, createdAt: FieldValue.serverTimestamp() });
    await addAuditLog(taskRef, actor, { kind: 'EVIDENCE', text: `Uploaded ${validated.data.category.toLowerCase().replaceAll('_', ' ')}: ${validated.data.fileName}.`, evidenceId: evidenceRef.id });
    revalidateOperationalPages();
    return { success: true, message: 'Evidence added to the case file.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to register case evidence.' };
  }
}

const noticeSchema = z.object({ authToken: tokenSchema, taskId: idSchema, responseDeadline: z.string().datetime(), additionalTerms: z.string().trim().max(2_000).optional() });

export async function createDemandNoticeAction(input: z.input<typeof noticeSchema>) {
  const validated = noticeSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Enter a valid response deadline.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) throw new Error('Legal case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    const currentStatus = normalizeRecoveryStatus(task.status);
    if (!['ESCALATED_LEGAL', 'NOTICE_PREPARATION'].includes(currentStatus)) throw new Error('A demand draft can only be prepared at the notice-preparation stage.');
    const noticeRef = taskRef.collection('notices').doc();
    const reference = `NAL-DMD-${new Date().getFullYear()}-${noticeRef.id.slice(0, 8).toUpperCase()}`;
    const content = [
      `FORMAL DEMAND FOR PAYMENT — ${reference}`,
      `To: ${task.clientName}`,
      `Deal: ${task.dealName}`,
      `Outstanding amount recorded by NAL: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(task.amountOutstanding || 0))}`,
      `You are requested to pay the outstanding balance or contact NAL no later than ${new Date(validated.data.responseDeadline).toLocaleDateString('en-NG')}.`,
      validated.data.additionalTerms || '',
      'This notice is generated from NAL records and must be reviewed and approved by an authorised Legal officer before service.',
    ].filter(Boolean).join('\n\n');
    await Promise.all([
      noticeRef.set({ reference, taskId: taskRef.id, clientId: task.clientId, dealId: task.dealId, content, responseDeadline: Timestamp.fromDate(new Date(validated.data.responseDeadline)), status: 'DRAFT', templateVersion: '1.0', preparedBy: actor.uid, preparedByName: actor.name, createdAt: FieldValue.serverTimestamp() }),
      taskRef.set({ status: 'NOTICE_PREPARATION', updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      addAuditLog(taskRef, actor, { kind: 'NOTICE', text: `Prepared demand notice ${reference}; awaiting review before issue.`, noticeId: noticeRef.id, fromStatus: task.status, toStatus: 'NOTICE_PREPARATION' }),
    ]);
    revalidateOperationalPages();
    return { success: true, message: 'Draft demand notice prepared for review.', notice: { id: noticeRef.id, reference, content } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to prepare the demand notice.' };
  }
}

const issueNoticeSchema = z.object({ authToken: tokenSchema, taskId: idSchema, noticeId: idSchema, confirmedReviewed: z.literal(true) });

export async function issueDemandNoticeAction(input: z.input<typeof issueNoticeSchema>) {
  const validated = issueNoticeSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'The notice must be reviewed before issue.' };
  try {
    const actor = await getActor(validated.data.authToken);
    const taskRef = adminDb.collection('recoveryTasks').doc(validated.data.taskId);
    const noticeRef = taskRef.collection('notices').doc(validated.data.noticeId);
    const [taskSnapshot, noticeSnapshot] = await Promise.all([taskRef.get(), noticeRef.get()]);
    if (!taskSnapshot.exists || !noticeSnapshot.exists) throw new Error('The case or notice could not be found.');
    const task = taskSnapshot.data()!;
    const notice = noticeSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    if (notice.status !== 'DRAFT') throw new Error('Only a draft notice can be issued.');
    if (!canTransitionRecoveryStatus(task.status, 'DEMAND_ISSUED', actor.actorType)) throw new Error('The case is not at a stage where a demand may be issued.');
    await Promise.all([
      noticeRef.set({ status: 'ISSUED', reviewedBy: actor.uid, reviewedByName: actor.name, reviewedAt: FieldValue.serverTimestamp(), issuedAt: FieldValue.serverTimestamp() }, { merge: true }),
      taskRef.set({ status: 'DEMAND_ISSUED', lastDemandNoticeId: noticeRef.id, lastDemandReference: notice.reference, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      addAuditLog(taskRef, actor, { kind: 'NOTICE_ISSUED', text: `Reviewed and issued demand notice ${notice.reference}.`, noticeId: noticeRef.id, fromStatus: task.status, toStatus: 'DEMAND_ISSUED' }),
      notifyUser(task.clientId, 'Formal payment demand issued', `Demand ${notice.reference} has been issued for ${task.dealName}. Sign in to review your account and contact NAL.`, '/client/dashboard', 'overdue'),
      notifyAdmins('Formal demand issued', `${notice.reference} — ${task.clientName}, ${task.dealName}.`, '/legal/dashboard', 'overdue'),
    ]);
    revalidateOperationalPages();
    return { success: true, message: `Demand notice ${notice.reference} has been issued and recorded.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to issue the demand notice.' };
  }
}

export async function listCaseAgreementsAction(input: { authToken: string; taskId: string }) {
  const validated = claimSchema.safeParse(input);
  if (!validated.success) return { success: false as const, message: 'Invalid case request.' };
  try {
    const actor = await getActor(validated.data.authToken);
    if (actor.actorType === 'RECOVERY') throw new Error('Signed agreements are available to Legal and administrators only.');
    const taskSnapshot = await adminDb.collection('recoveryTasks').doc(validated.data.taskId).get();
    if (!taskSnapshot.exists) throw new Error('Legal case not found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    const snapshot = await adminDb.collection('agreementEnvelopes').where('sourceId', '==', task.dealId).get();
    return {
      success: true as const,
      agreements: snapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          agreementType: data.agreementType,
          agreementReference: data.agreementReference,
          status: data.status,
          startedAt: data.startedAt?.toDate?.()?.toISOString?.() || null,
          executedAt: data.executedAt?.toDate?.()?.toISOString?.() || null,
          archived: data.finalPdfArchive?.status === 'ARCHIVED',
        };
      }),
    };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Unable to list case agreements.' };
  }
}

export async function downloadCaseAgreementAction(input: { authToken: string; taskId: string; envelopeId: string }) {
  const validated = z.object({ authToken: tokenSchema, taskId: idSchema, envelopeId: idSchema }).safeParse(input);
  if (!validated.success) return { success: false as const, message: 'Invalid agreement request.' };
  try {
    const actor = await getActor(validated.data.authToken);
    if (actor.actorType === 'RECOVERY') throw new Error('Signed agreements are available to Legal and administrators only.');
    const [taskSnapshot, envelopeSnapshot] = await Promise.all([
      adminDb.collection('recoveryTasks').doc(validated.data.taskId).get(),
      adminDb.collection('agreementEnvelopes').doc(validated.data.envelopeId).get(),
    ]);
    if (!taskSnapshot.exists || !envelopeSnapshot.exists) throw new Error('The case agreement could not be found.');
    const task = taskSnapshot.data()!;
    assertTaskAccess(task, actor, 'LEGAL');
    const envelope = envelopeSnapshot.data()!;
    if (envelope.sourceId !== task.dealId) throw new Error('This agreement does not belong to the selected case.');
    if (envelope.status !== 'EXECUTED' || envelope.finalPdfArchive?.status !== 'ARCHIVED' || !envelope.finalPdfArchive.storagePath) throw new Error('The final signed agreement has not been archived yet.');
    const [buffer] = await adminStorageBucket.file(envelope.finalPdfArchive.storagePath).download();
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hash !== envelope.finalPdfArchive.fileHash) throw new Error('The agreement archive failed its integrity check.');
    return { success: true as const, message: 'Signed agreement downloaded and integrity-checked.', fileName: `${String(envelope.agreementReference).replace(/[^a-zA-Z0-9._-]/g, '-')}-signed.pdf`, pdfBase64: buffer.toString('base64'), fileHash: hash };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Unable to download the case agreement.' };
  }
}
