
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useTransition } from 'react';
import { Loader2, User } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { ProfilePhotoUploader } from './profile-photo-uploader';

const profileSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  address: z.string().trim().refine((value) => !value || value.length >= 5, { message: 'Enter a complete residential address.' }),
  bankName: z.string().trim().refine((value) => !value || value.length >= 2, { message: 'Enter a valid bank name.' }),
  bankAccountName: z.string().trim().refine((value) => !value || value.length >= 2, { message: 'Enter a valid account name.' }),
  bankAccountNumber: z.string().trim().refine((value) => !value || /^\d{10}$/.test(value), { message: 'Account number must contain exactly 10 digits.' }),
});

type ProfileData = z.infer<typeof profileSchema>;

export function UpdateProfileForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(true);
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const form = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      address: '',
      bankName: '',
      bankAccountName: '',
      bankAccountNumber: '',
    },
  });

  useEffect(() => {
    function loadUserData() {
      if (user) {
        setIsFetching(true);
        form.reset({
          name: user.name || user.displayName || '',
          email: user.email || '',
          phoneNumber: user.phoneNumber || '',
          address: user.address || '',
          bankName: user.bankName || '',
          bankAccountName: user.bankAccountName || '',
          bankAccountNumber: user.bankAccountNumber || '',
        });
        setIsFetching(false);
      }
    }
    loadUserData();
  }, [user, form]);

  async function onSubmit(values: ProfileData) {
    if (!user || !auth?.currentUser || !firestore) {
      toast({ variant: 'destructive', title: 'Error', description: 'User not available.' });
      return;
    }
    
    startTransition(async () => {
      try {
        await updateDoc(doc(firestore, 'users', user.uid), {
          name: values.name,
          phoneNumber: values.phoneNumber || '',
          address: values.address,
          bankName: values.bankName,
          bankAccountName: values.bankAccountName,
          bankAccountNumber: values.bankAccountNumber,
        });
        await updateProfile(auth.currentUser!, { displayName: values.name });
            toast({
              title: 'Profile Updated',
              description: 'Your personal information was saved successfully.',
            });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: error instanceof Error ? error.message : 'Unable to update your profile.',
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>Keep your identity and verified payment account current for agreements and withdrawals.</CardDescription>
      </CardHeader>
      <CardContent>
        {isFetching ? (
            <div className="space-y-4 max-w-md">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-24" />
            </div>
        ) : (
            <div className="space-y-6">
            <ProfilePhotoUploader />
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
                <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                        <Input {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Residential Address</FormLabel>
                    <FormControl><Input placeholder="Your full residential address" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl><Input placeholder="e.g. Taj Bank" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="bankAccountNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl><Input inputMode="numeric" maxLength={10} placeholder="0123456789" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                </div>
                <FormField
                control={form.control}
                name="bankAccountName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Verified Account Name</FormLabel>
                    <FormControl><Input placeholder="Name shown on your bank account" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                        <Input disabled {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g. +2348012345678" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <Button type="submit" disabled={isPending}>
                {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <User className="mr-2 h-4 w-4" />
                )}
                Save Changes
                </Button>
            </form>
            </Form>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
