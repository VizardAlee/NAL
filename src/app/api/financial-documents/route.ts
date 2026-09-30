import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { documentActor, saveFinancialUpload } from '@/lib/server/financial-documents';
import { getAuthErrorStatus } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;
const tokenFor = (request: NextRequest) => request.headers.get('authorization')?.replace(/^Bearer /, '') || '';

export async function POST(request: NextRequest) {
  try {
    const token = tokenFor(request);
    await documentActor(token); // Authorize before consuming the multipart body.
    if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) throw new Error('Upload exceeds 5 MB.');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing upload.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 6 * 1024 * 1024) { await reader.cancel(); throw new Error('Upload exceeds 5 MB.'); }
      chunks.push(value);
    }
    const body = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
    const file = body.get('file');
    if (!(file instanceof File)) throw new Error('Select a document.');
    const result = await saveFinancialUpload(token, file, { kind: String(body.get('kind')), accountNumber: String(body.get('accountNumber') || ''), periodStart: String(body.get('periodStart') || ''), periodEnd: String(body.get('periodEnd') || '') });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: getAuthErrorStatus(error) ? 'Your session could not be verified. Sign in again.' : error instanceof Error ? error.message : 'Document upload failed.' }, { status: getAuthErrorStatus(error) || 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await documentActor(tokenFor(request));
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid document.');
    const statement = request.nextUrl.searchParams.get('kind') === 'STATEMENT';
    if (statement && !actor.admin) throw new Error('Administrator access required.');
    const doc = await adminDb.collection(statement ? 'bankStatements' : 'paymentReceipts').doc(id).get();
    const data = doc.data();
    if (!data || (!actor.admin && data.uploadedBy !== actor.uid && data.customerId !== actor.uid)) throw new Error('Document unavailable.');
    const [bytes] = await adminStorageBucket.file(data.storagePath).download();
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': data.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch {
    return NextResponse.json({ message: 'Document unavailable or session expired.' }, { status: 403 });
  }
}
