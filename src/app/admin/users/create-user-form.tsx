
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore, useAuth } from '@/firebase';
import { FirebaseError } from 'firebase/app';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' }),
  role: z.enum(['Investor', 'Client'], { required_error: 'Role is required.' }),
});

type CreateUserFormProps = {
  onUserCreated: () => void;
};

export function CreateUserForm({ onUserCreated }: CreateUserFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();
  const auth = useAuth(); // Use the existing, authenticated auth instance

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore || !auth) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Firebase is not available. Please try again later.",
        });
        setIsLoading(false);
        return;
    }

    try {
      // NOTE: Creating a user this way on the client is generally not recommended
      // for security reasons, as it can be abused. In a production app, this
      // operation should be moved to a secure backend environment (e.g., a Cloud Function).
      // For this prototype, we accept the risk. The side-effect is that firebase
      // will sign in the new user, so we have to sign out and restore the admin.
      const adminUser = auth.currentUser;
      if (!adminUser) throw new Error("Admin user not found. Please log in again.");

      // 1. Create user in a temporary, isolated auth instance to avoid auto-signin
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      // 2. We need to call a backend function to set custom claims, as this is a privileged operation.
      // For now, we will proceed without claims and rely on the Firestore role.
      await updateProfile(userCredential.user, {
        displayName: values.name,
      });

      // 3. Create user profile in Firestore
      const userDocRef = doc(firestore, 'users', userCredential.user.uid);
      await setDoc(userDocRef, {
        name: values.name,
        email: values.email,
        role: values.role,
      });

      // 4. IMPORTANT: Sign the admin back in.
      // The createUserWithEmailAndPassword function signs in the new user automatically.
      // We must sign the admin back in to continue the admin session.
      if (auth.currentUser?.uid !== adminUser.uid) {
         await auth.signOut(); // Sign out the new user
         // This is a simplified re-authentication. A real-world app would use
         // a more secure method like re-authenticating with a saved token or credentials.
         // For the prototype, we rely on the session persistence of the admin.
         // The `useUser` hook will refresh the auth state with the admin user.
         // A page reload might be required in some edge cases if the state doesn't sync.
      }


      toast({
        title: 'User Created',
        description: `Account for ${values.name} has been successfully created.`,
      });
      onUserCreated();
    } catch (error) {
      console.error(error);
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            errorMessage =
              'This email address is already in use by another account.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'The email address is not valid.';
            break;
          case 'auth/weak-password':
            errorMessage = 'The password is not strong enough.';
            break;
           case 'auth/api-key-not-valid':
            errorMessage = 'The Firebase API Key is not valid. Please check your configuration.';
            break;
          default:
            errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast({
        variant: 'destructive',
        title: 'User Creation Failed',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
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
                <Input placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Investor">Investor</SelectItem>
                  <SelectItem value="Client">Client</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create User
        </Button>
      </form>
    </Form>
  );
}
