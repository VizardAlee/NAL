import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { storeAdminUserUpload } from '@/lib/server/admin-user-records';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminWrite((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) return NextResponse.json({ success: false, message: 'Upload must be smaller than 5 MB.' }, { status: 413 });
    const body = await request.formData(); const file = body.get('file');
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, message: 'Choose a JPG, PNG, WEBP or PDF file, maximum 5 MB.' }, { status: 400 });
    const data = await storeAdminUserUpload(adminDb, adminStorageBucket, actor.uid, { userId: body.get('userId'), kind: body.get('kind'), reason: body.get('reason'), ...(body.get('replaceDocumentId') ? { replaceDocumentId: body.get('replaceDocumentId') } : {}) }, Buffer.from(await file.arrayBuffer()), file.name);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    const status = error?.status === 401 || error?.status === 403 ? error.status : 400;
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: error.issues.map(issue => issue.message).join('; ') }, { status: 400 });
    if (status === 401 || status === 403) return NextResponse.json({ success: false, message: 'Administrator write access is required.' }, { status });
    if (error instanceof Error && !('code' in error)) return NextResponse.json({ success: false, message: error.message }, { status });
    const reference = randomUUID(); console.error('Admin user upload failed', { reference, code: error?.code || 'UNKNOWN' });
    return NextResponse.json({ success: false, message: `Upload could not be completed. Retry or contact support with reference ${reference}.` }, { status: 503 });
  }
}
