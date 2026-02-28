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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { resolvePrimaryPortalFromPersonas, type Persona } from '@/lib/access-control';

const formSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address.' }),
  accessRole: z.enum(['OWNER', 'ADMIN', 'STAFF', 'USER']),
  personas: z.array(z.enum(['INVESTOR', 'CLIENT', 'LEGAL', 'RECOVERY', 'MARKETER', 'STAFF_MEMBER'])).default([]),
  primaryPortal: z.enum(['admin', 'investor', 'client', 'legal', 'recovery', 'marketer']),
});

type InviteUserFormProps = {
  onInviteCreated: () => void;
};

export function InviteUserForm({ onInviteCreated }: InviteUserFormProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [isPending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState('');
  const personaChoices: Array<{ value: Persona; label: string }> = [
    { value: 'INVESTOR', label: 'Investor' },
    { value: 'CLIENT', label: 'Client' },
    { value: 'LEGAL', label: 'Legal' },
    { value: 'RECOVERY', label: 'Recovery' },
    { value: 'MARKETER', label: 'Marketer' },
    { value: 'STAFF_MEMBER', label: 'Staff Member' },
  ];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      accessRole: 'USER',
      personas: ['INVESTOR'],
      primaryPortal: 'investor',
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
      const accessRole = values.accessRole;
      const personas = [...new Set(values.personas)];
      const primaryPortal =
        accessRole === 'OWNER' || accessRole === 'ADMIN' || accessRole === 'STAFF'
          ? 'admin'
          : values.primaryPortal || resolvePrimaryPortalFromPersonas(personas as Persona[]);

      if (accessRole === 'USER' && personas.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Invite Failed',
          description: 'At least one persona is required for USER access role.',
        });
        return;
      }

      const result = await createInviteLinkAction({
        email: values.email,
        accessRole,
        personas,
        primaryPortal,
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
            name="accessRole"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Access Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select access role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="USER">User</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="personas"
            render={() => (
              <FormItem>
                <FormLabel>Personas</FormLabel>
                <div className="space-y-2 rounded-md border p-3">
                  {personaChoices.map((choice) => (
                    <FormField
                      key={choice.value}
                      control={form.control}
                      name="personas"
                      render={({ field }) => {
                        const selected = field.value?.includes(choice.value);
                        return (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  const value = checked
                                    ? [...field.value, choice.value]
                                    : field.value.filter((item) => item !== choice.value);
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                            <Label className="font-normal">{choice.label}</Label>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="primaryPortal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Portal</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select primary portal" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="recovery">Recovery</SelectItem>
                    <SelectItem value="marketer">Marketer</SelectItem>
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
