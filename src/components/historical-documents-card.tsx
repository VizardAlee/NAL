'use client';

import { useEffect, useState } from 'react';
import { ArchiveRestore, ExternalLink, FileImage, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getMyHistoricalDocumentUrlAction, listMyHistoricalDocumentsAction } from '@/app/common/actions/historical-document-actions';

type HistoricalDocument = Awaited<ReturnType<typeof listMyHistoricalDocumentsAction>>['documents'][number];

export function HistoricalDocumentsCard() {
  const auth = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<HistoricalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser) return;
      try { const result = await listMyHistoricalDocumentsAction(await auth.currentUser.getIdToken()); if (!cancelled) setDocuments(result.documents); }
      catch { if (!cancelled) setDocuments([]); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [auth]);
  const open = async (document: HistoricalDocument) => {
    if (!auth?.currentUser) return;
    setOpening(String(document.documentId));
    try { const result = await getMyHistoricalDocumentUrlAction({ authToken: await auth.currentUser.getIdToken(), importId: String(document.importId), documentId: String(document.documentId) }); window.open(result.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast({ variant: 'destructive', title: 'Document unavailable', description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setOpening(''); }
  };
  if (!loading && !documents.length) return null;
  return <Card className="mb-8 border-primary/15"><CardHeader><CardTitle className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5 text-primary" />Imported historical documents</CardTitle><CardDescription>Documents supplied and approved during the migration of your pre-app account.</CardDescription></CardHeader><CardContent>{loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading historical documents…</div> : <div className="grid gap-3 md:grid-cols-2">{documents.map((document) => <div key={`${document.importId}-${document.documentId}`} className="flex items-center gap-3 rounded-lg border p-3">{document.contentType === 'application/pdf' ? <FileText className="h-7 w-7 text-red-600" /> : <FileImage className="h-7 w-7 text-blue-600" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{String(document.originalName)}</p><p className="text-xs text-muted-foreground">Approved historical evidence</p></div><Button size="sm" variant="outline" onClick={() => void open(document)} disabled={opening === document.documentId}>{opening === document.documentId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}</Button></div>)}</div>}</CardContent></Card>;
}
