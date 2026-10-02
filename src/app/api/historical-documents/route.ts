import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { historicalWorkspaceResult, HistoricalWorkspaceError } from '@/lib/server/historical-workspace-result';
import { storeHistoricalDocument } from '@/lib/server/historical-document-upload';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const result = await historicalWorkspaceResult(async () => {
    const actor = await verifyAdminWrite(request.headers.get('authorization')?.replace(/^Bearer /, '') || '');
    const limit = 6 * 1024 * 1024; // Allow multipart overhead, but bound streamed bodies too.
    if (Number(request.headers.get('content-length') || 0) > limit) throw new HistoricalWorkspaceError('INVALID_FILE', 'Upload a document no larger than 5 MB.');
    const reader = request.body?.getReader();
    if (!reader) throw new HistoricalWorkspaceError('INVALID_FILE', 'Select a document to upload.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HistoricalWorkspaceError('INVALID_FILE', 'Upload a document no larger than 5 MB.'); }
      chunks.push(value);
    }
    let body: FormData;
    try { body = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData(); }
    catch { throw new HistoricalWorkspaceError('INVALID_FILE', 'The upload could not be read. Select the document again and retry.'); }
    const file = body.get('file');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) throw new HistoricalWorkspaceError('INVALID_FILE', 'Select a JPG, PNG, WEBP or PDF no larger than 5 MB.');
    return storeHistoricalDocument(adminDb, adminStorageBucket, { importId: String(body.get('importId') || ''), adminId: actor.uid, originalName: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  });
  const statuses: Record<string, number> = { SESSION_EXPIRED: 401, ACCESS_DENIED: 403, SERVICE_UNAVAILABLE: 503, INTERNAL_ERROR: 500 };
  return NextResponse.json(result, { status: result.success ? 200 : statuses[result.code] || 400 });
}
