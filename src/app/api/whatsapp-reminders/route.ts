import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { prepareWhatsAppReminders, previewWhatsAppReminder, setWhatsAppConsent } from '@/lib/server/whatsapp-reminder-outbox';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    await verifyAdminWrite((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    const [settings, health, queue] = await Promise.all([adminDb.doc('reminderSettings/whatsapp').get(), adminDb.doc('reminderSettings/whatsappHealth').get(), adminDb.collection('whatsappReminderOutbox').orderBy('createdAt', 'desc').limit(25).get()]);
    return NextResponse.json({ success: true, enabled: settings.data()?.enabled === true, sendingConnected: false,
      health: { prepared: health.data()?.prepared || 0, errors: health.data()?.errors || 0, skipped: health.data()?.skipped || 0, lastRunAt: health.data()?.lastRunAt?.toDate?.().toISOString() || null },
      outbox: queue.docs.map(document => { const data = document.data(); return { id: document.id, clientId: data.clientId, asOf: data.asOf, status: data.status, createdAt: data.createdAt.toDate().toISOString(), expiresAt: data.expiresAt.toDate().toISOString() }; }),
    });
  } catch (error: any) { return NextResponse.json({ success: false, message: 'Administrator access and an available reminder backend are required.' }, { status: [401, 403].includes(error?.status) ? error.status : 503 }); }
}
const command = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('preview'), clientId: z.string() }).strict(),
  z.object({ operation: z.literal('consent'), clientId: z.string(), optedIn: z.boolean(), phone: z.string().optional(), evidence: z.string() }).strict(),
  z.object({ operation: z.literal('configure'), enabled: z.boolean(), reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ operation: z.literal('prepare') }).strict(),
]);
export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminWrite((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    const input = command.parse(await request.json());
    if (input.operation === 'preview') return NextResponse.json({ success: true, report: await previewWhatsAppReminder(adminDb, input.clientId) });
    if (input.operation === 'consent') return NextResponse.json({ success: true, data: await setWhatsAppConsent(adminDb, actor.uid, { clientId: input.clientId, optedIn: input.optedIn, phone: input.phone, evidence: input.evidence }) });
    if (input.operation === 'prepare') return NextResponse.json({ success: true, data: await prepareWhatsAppReminders(adminDb) });
    const batch = adminDb.batch();
    batch.set(adminDb.doc('reminderSettings/whatsapp'), { enabled: input.enabled, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(adminDb.collection('whatsappConsentAudit').doc(), { operation: 'CONFIGURATION', enabled: input.enabled, reason: input.reason, actorId: actor.uid, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ success: true, enabled: input.enabled, sendingConnected: false });
  } catch (error: any) {
    const status = [401, 403, 503].includes(error?.status) ? error.status : 400;
    return NextResponse.json({ success: false, message: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join('; ') : error instanceof Error && !('code' in error) ? error.message : 'Reminder operation unavailable. Retry or check backend configuration.' }, { status });
  }
}
