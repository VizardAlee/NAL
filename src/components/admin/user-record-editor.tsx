'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useToast } from '@/hooks/use-toast';
import { GOVERNMENT_ID_LABELS, GOVERNMENT_ID_TYPES } from '@/lib/kyc';
import { getAdminUserRecordAction, saveAdminUserRecordAction, previewAdminUserUploadAction } from '@/app/admin/users/[userId]/record-actions';

const fields = [ ['name', 'Name / organization name'], ['phoneNumber', 'Phone'], ['address', 'Residential / organization address'], ['bankName', 'Bank name'], ['bankAccountName', 'Account holder name'], ['bankAccountNumber', 'Account number'], ['governmentIdNumber', 'Government ID number'], ['bvn', 'BVN'], ['tin', 'TIN (investors)'], ['organizationRegistrationNumber', 'Organization registration number'], ['representativeName', 'Representative name'], ['representativeTitle', 'Representative capacity'], ['representativePhoneNumber', 'Representative phone'] ];
export function UserRecordEditor({ userId, accountType, isInvestor }: { userId: string; accountType: string; isInvestor: boolean }) {
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [values, setValues] = useState<Record<string, any> | null>(null);
  const [documents, setDocuments] = useState<Array<{id: string; kind: string; originalName: string}>>([]);
  const [kind, setKind] = useState('GOVERNMENT_ID'); const [replaceId, setReplaceId] = useState('');
  const { toast } = useToast();
  const update = (key: string, value: string) => { if (key !== 'reason') setDirty(true); setValues(current => ({ ...current, [key]: value })); };
  const load = async () => {
    const result = await getAdminUserRecordAction(await getRequiredIdToken(), userId);
    if (!result.success) throw new Error(result.message);
    setValues(result.values); setDocuments(result.documents); setDirty(false);
  };
  const run = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { toast({ variant: 'destructive', title: 'User record not updated', description: error instanceof Error ? error.message : 'Try again.' }); } finally { setBusy(false); } };
  const preview = (documentId: string) => {
    // Open on the click itself so browsers do not block the authenticated preview.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    void run(async () => {
      try {
        if (!tab) throw new Error('Allow pop-ups for this site, then try viewing the document again.');
        const result = await previewAdminUserUploadAction(await getRequiredIdToken(), userId, documentId);
        if (!result.success) throw new Error(result.message);
        tab.location.href = result.url;
      } catch (error) { tab?.close(); throw error; }
    });
  };
  const upload = async (file: File) => run(async () => {
    if (!values?.reason?.trim() || values.reason.trim().length < 5) throw new Error('Enter the reason for this upload first.');
    const body = new FormData(); body.set('file', file); body.set('userId', userId); body.set('kind', kind); body.set('reason', values.reason); if (replaceId) body.set('replaceDocumentId', replaceId);
    const response = await fetch('/api/admin-user-records', { method: 'POST', headers: { Authorization: `Bearer ${await getRequiredIdToken()}` }, body, signal: AbortSignal.timeout(120000) });
    const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || 'Upload failed.');
    toast({ title: 'Upload saved', description: 'Previous uploads remain in private audit history. KYC uploads require verification again.' }); setReplaceId(''); await load();
  });
  return <><Button variant="outline" size="sm" onClick={() => { setOpen(true); void run(load); }}>Edit user records & uploads</Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (!next) setValues(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Edit user records</DialogTitle><DialogDescription>Administrator only. Identity and payment-account changes reset verified KYC for review. Signed agreements and posted financial records are not changed.</DialogDescription></DialogHeader>
      {!values ? <p>{busy ? 'Loading restricted user details…' : 'Could not load details. Close and try again.'}</p> : <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">{fields.filter(([key]) => (key !== 'tin' || isInvestor) && (accountType === 'Organization' || (!key.startsWith('representative') && !key.startsWith('organization')))).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`record-${key}`}>{label}</Label><Input id={`record-${key}`} disabled={busy} autoComplete="off" value={values[key] || ''} onChange={event => update(key, event.target.value)} /></div>)}
          <div><Label htmlFor="record-id-type">Government ID type</Label><select id="record-id-type" disabled={busy} className="h-10 w-full rounded-md border bg-background px-3" value={values.governmentIdType} onChange={event => update('governmentIdType', event.target.value)}><option value="">Not supplied</option>{GOVERNMENT_ID_TYPES.map(type => <option key={type} value={type}>{GOVERNMENT_ID_LABELS[type]}</option>)}</select></div>
          <div><Label htmlFor="record-status">KYC review status</Label><select id="record-status" disabled={busy} className="h-10 w-full rounded-md border bg-background px-3" value={values.status} onChange={event => update('status', event.target.value)}>{['NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></div>
        </div>
        <div><Label htmlFor="record-reason">Reason for change / upload</Label><Textarea id="record-reason" disabled={busy} value={values.reason} onChange={event => update('reason', event.target.value)} placeholder="Explain the correction and supporting evidence." /></div>
        <Button disabled={busy} onClick={() => void run(async () => { const result = await saveAdminUserRecordAction(await getRequiredIdToken(), values); if (!result.success) throw new Error(result.message); toast({ title: 'User record saved', description: result.verificationReset ? 'KYC was reset to submitted. Review the corrected details before verifying again.' : 'Changes have been audited.' }); await load(); })}>{busy ? 'Working…' : 'Save user details'}</Button>
        <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Uploads</h3><p className="text-sm text-muted-foreground">KYC documents remain private. Only profile photographs use the existing avatar-sharing mechanism. Save edited details before uploading; uploading reloads this form.</p>
          <Label htmlFor="record-upload-kind">Upload type</Label><select id="record-upload-kind" disabled={busy} className="h-10 w-full rounded-md border bg-background px-3" value={kind} onChange={event => { setKind(event.target.value); setReplaceId(''); }}><option value="GOVERNMENT_ID">Government ID</option><option value="KYC_SUPPORTING">Supporting KYC document</option><option value="PROFILE_PHOTO">Profile photograph</option></select>
          <Label htmlFor="record-replacement">Replace an upload (optional)</Label><select id="record-replacement" disabled={busy} className="h-10 w-full rounded-md border bg-background px-3" value={replaceId} onChange={event => setReplaceId(event.target.value)}><option value="">Add a new upload</option>{documents.filter(document => document.kind === kind).map(document => <option key={document.id} value={document.id}>{document.originalName}</option>)}</select>
          {dirty && <p className="text-sm text-amber-700">Save your changes before uploading a document.</p>}
          <Input aria-label="Upload user document" disabled={busy || dirty} type="file" accept={kind === 'PROFILE_PHOTO' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,image/webp,application/pdf'} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
          {documents.map(document => <div key={document.id} className="flex items-center justify-between gap-2 rounded border p-2"><span className="min-w-0 truncate text-sm">{document.originalName}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => preview(document.id)}>View / download</Button></div>)}
        </section>
      </div>}
    </DialogContent></Dialog></>;
}
