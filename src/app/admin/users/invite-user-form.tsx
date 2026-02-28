'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useState, useTransition } from 'react';
import { Loader2, Copy } from 'lucide-react';

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
import { createInviteLinkAction } from './actions';
import { useUser } from '@/firebase';

const formSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address.' }),
  role: z.enum(['Investor', 'Client', 'Marketer', 'Admin', 'Legal', 'Recovery']),
});

type InviteUserFormProps = {
  onInviteCreated: () => void;
};

export function InviteUserForm({ onInviteCreated }: InviteUserFormProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [isPending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState('');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      role: 'Investor',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!user?.uid) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in as an admin.',
      });
      return;
    }

    startTransition(async () => {
      const inviterName = user.displayName || user.email || 'Admin';
      const result = await createInviteLinkAction({
        email: values.email,
        role: values.role,
        inviterId: user.uid,
        inviterName,
      });

      if (!result.success || !result.inviteLink) {
        toast({
          variant: 'destructive',
          title: 'Invite Failed',
          description: result.message,
        });
        return;
      }

      setInviteLink(result.inviteLink);
      toast({
        title: 'Invite Ready',
        description: result.message,
      });
      onInviteCreated();
    });
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast({ title: 'Copied', description: 'Invite link copied to clipboard.' });
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="invitee@example.com" {...field} />
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
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Investor">Investor</SelectItem>
                    <SelectItem value="Client">Client</SelectItem>
                    <SelectItem value="Marketer">Marketer</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                    <SelectItem value="Recovery">Recovery</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Invite Link
          </Button>
        </form>
      </Form>

      {inviteLink && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Invite link</p>
          <div className="flex gap-2">
            <Input value={inviteLink} readOnly />
            <Button type="button" variant="outline" size="icon" onClick={copyLink}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
