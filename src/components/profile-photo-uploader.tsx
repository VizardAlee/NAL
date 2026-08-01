'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, useFirebaseApp, useUser } from '@/firebase';
import { uploadAuthenticatedFile } from '@/firebase/storage-upload';
import { updateProfilePhotoAction } from '@/components/common-actions';
import { useToast } from '@/hooks/use-toast';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function ProfilePhotoUploader() {
  const { user } = useUser();
  const auth = useAuth();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(user?.photoURL);
  const [isPending, startTransition] = useTransition();

  const uploadPhoto = (file?: File) => {
    if (!file || !user || !auth?.currentUser) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Unsupported photo', description: 'Use a JPG or PNG image.' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast({ variant: 'destructive', title: 'Photo is too large', description: 'Choose a photo smaller than 2 MB.' });
      return;
    }

    setPreview(URL.createObjectURL(file));
    startTransition(async () => {
      try {
        const uploaded = await uploadAuthenticatedFile(
          app,
          file,
          ['users', user.uid, 'profile'],
          ACCEPTED_TYPES
        );
        const result = await updateProfilePhotoAction({
          authToken: await auth.currentUser!.getIdToken(),
          userId: user.uid,
          photoURL: uploaded.url,
          storagePath: uploaded.fullPath,
        });
        toast({
          variant: result.success ? 'default' : 'destructive',
          title: result.success ? 'Photo Updated' : 'Upload Failed',
          description: result.message,
        });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: error instanceof Error ? error.message : 'Unable to upload the photo.',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center">
      <Avatar className="h-24 w-24 border-4 border-background shadow-sm">
        <AvatarImage src={preview || user?.photoURL} alt={user?.displayName || 'Profile photo'} />
        <AvatarFallback className="text-2xl">{user?.displayName?.charAt(0) || user?.email?.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <div>
          <p className="font-medium">Profile photograph</p>
          <p className="text-sm text-muted-foreground">Used on your profile and personalized agreements. JPG or PNG, maximum 2 MB.</p>
        </div>
        <Input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => uploadPhoto(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {user?.photoURL ? 'Change Photo' : 'Upload Photo'}
        </Button>
      </div>
    </div>
  );
}
