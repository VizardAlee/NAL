'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, useFirebaseApp } from '@/firebase';
import { uploadAuthenticatedFile } from '@/firebase/storage-upload';
import { useToast } from '@/hooks/use-toast';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 2 * 1024 * 1024;

export function GuarantorPhotoField({ value, guarantorName, onChange, disabled }: {
  value?: string;
  guarantorName?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const auth = useAuth();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(value);
  const [pending, startTransition] = useTransition();

  function upload(file?: File) {
    const user = auth?.currentUser;
    if (!file || !user) return;
    if (!ACCEPTED_TYPES.includes(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
      toast({ variant: 'destructive', title: 'Invalid photograph', description: 'Use a JPG or PNG image no larger than 2 MB.' });
      return;
    }
    setPreview(URL.createObjectURL(file));
    startTransition(async () => {
      try {
        const uploaded = await uploadAuthenticatedFile(app, file, ['users', user.uid, 'guarantors'], ACCEPTED_TYPES);
        onChange(uploaded.url);
        toast({ title: 'Photograph Uploaded', description: 'The guarantor photograph is ready for the bond.' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: error instanceof Error ? error.message : 'Unable to upload the photograph.' });
      }
    });
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3">
      <Avatar className="h-20 w-20 border-2 border-background"><AvatarImage src={preview || value} alt={guarantorName || 'Guarantor'} /><AvatarFallback>{guarantorName?.charAt(0) || 'G'}</AvatarFallback></Avatar>
      <div><p className="text-sm font-medium">Guarantor passport photograph</p><p className="mb-2 text-xs text-muted-foreground">JPG or PNG, maximum 2 MB.</p><Input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden" onChange={(event) => upload(event.target.files?.[0])} /><Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => inputRef.current?.click()}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}{value ? 'Change Photo' : 'Upload Photo'}</Button></div>
    </div>
  );
}
