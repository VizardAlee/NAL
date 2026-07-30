
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileUp, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadLegalDocumentAction } from './actions';
import Image from 'next/image';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useAuth, useFirebaseApp } from '@/firebase';
import { uploadAuthenticatedFile } from '@/firebase/storage-upload';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function SubmitButton({ busy }: { busy: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || busy} className="w-full">
            {pending || busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Upload Document
        </Button>
    )
}

export function LegalDocumentUploader({ userId }: { userId: string }) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const app = useFirebaseApp();
    const auth = useAuth();

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        if (!ACCEPTED_FILE_TYPES.includes(selectedFile.type)) {
            setError('Invalid file type. Please upload a PDF, JPG, or PNG.');
            setFile(null);
            setPreview(null);
            return;
        }
        if (selectedFile.size > MAX_FILE_SIZE) {
            setError('File size exceeds 5MB. Please upload a smaller file.');
            setFile(null);
            setPreview(null);
            return;
        }

        setError(null);
        setFile(selectedFile);

        setPreview(URL.createObjectURL(selectedFile));
    };
    
    const handleSubmit = async () => {
        if (!file || !auth?.currentUser) {
            setError('No file selected to upload.');
            return;
        }
        
        startTransition(async () => {
            const uploaded = await uploadAuthenticatedFile(
                app,
                file,
                ['admin', auth.currentUser!.uid, 'legal', userId],
                ACCEPTED_FILE_TYPES
            );
            const result = await uploadLegalDocumentAction({
                authToken: await getRequiredIdToken(),
                userId,
                documentUrl: uploaded.url,
                storagePath: uploaded.fullPath,
            });
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                setFile(null);
                setPreview(null);
            } else {
                toast({ variant: 'destructive', title: 'Upload Failed', description: result.message });
            }
        });
    }

    return (
        <form action={handleSubmit}>
            <div className="space-y-4">
                <Input type="file" onChange={handleFileChange} accept={ACCEPTED_FILE_TYPES.join(',')} />
                {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{error}</span>
                    </div>
                )}
                {preview && (
                    <div className="p-4 border rounded-md">
                        <p className="text-sm font-medium mb-2">Preview:</p>
                        {file?.type.startsWith('image/') ? (
                            <Image src={preview} alt="Document Preview" width={400} height={400} className="rounded-md object-contain" />
                        ) : (
                            <embed src={preview} type="application/pdf" width="100%" height="400px" className="rounded-md" />
                        )}
                    </div>
                )}
                <SubmitButton busy={isPending} />
            </div>
        </form>
    );
}
