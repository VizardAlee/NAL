
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
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { updateProfileAction } from './common-actions';

const profileSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
});

type ProfileData = z.infer<typeof profileSchema>;

export function UpdateProfileForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(true);
  const firestore = useFirestore();
  const { user } = useUser();

  const form = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
    },
  });

  useEffect(() => {
    async function fetchUserData() {
      if (user && firestore) {
        setIsFetching(true);
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          form.reset({
            name: userData.name || '',
            email: userData.email || '',
            phoneNumber: userData.phoneNumber || '',
          });
        }
        setIsFetching(false);
      }
    }
    fetchUserData();
  }, [user, firestore, form]);

  async function onSubmit(values: ProfileData) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'User not available.' });
      return;
    }
    
    startTransition(async () => {
        const authToken = await user.getIdToken();
        const result = await updateProfileAction({
            authToken,
            userId: user.uid,
            name: values.name,
            phoneNumber: values.phoneNumber,
        });

        if (result.success) {
            toast({
                title: 'Profile Updated',
                description: result.message,
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: result.message,
            });
        }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>Update your name and phone number.</CardDescription>
      </CardHeader>
      <CardContent>
        {isFetching ? (
            <div className="space-y-4 max-w-md">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-24" />
            </div>
        ) : (
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
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
        )}
      </CardContent>
    </Card>
  );
}
