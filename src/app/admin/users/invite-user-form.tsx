'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useEffect, useState, useTransition } from 'react';
import { Loader2, Copy, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { createInviteLinkAction, getUnclaimedProfilesAction } from './actions';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useUser } from '@/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { resolvePrimaryPortalFromPersonas, type Persona } from '@/lib/access-control';

const formSchema = z
  .object({
    email: z.string().email({ message: 'Enter a valid email address.' }),
    accessRole: z.enum(['OWNER', 'ADMIN', 'STAFF', 'USER']),
    personas: z.array(z.enum(['INVESTOR', 'CLIENT', 'LEGAL', 'RECOVERY', 'MARKETER', 'STAFF_MEMBER'])).default([]),
    primaryPortal: z.enum(['owner', 'admin', 'investor', 'client', 'legal', 'recovery', 'marketer']),
    accountType: z.enum(['Individual', 'Organization']),
    isMuslim: z.boolean().optional(),
    existingProfileId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.personas.includes('INVESTOR') && typeof data.isMuslim !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isMuslim'],
        message: 'Select Muslim or non-Muslim for an investor.',
      });
    }
  });

type InviteUserFormProps = {
  onInviteCreated: () => void;
};

export function InviteUserForm({ onInviteCreated }: InviteUserFormProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [isPending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState('');
  const [accountSource, setAccountSource] = useState<'NEW' | 'EXISTING'>('NEW');
  const [unclaimedProfiles, setUnclaimedProfiles] = useState<Awaited<ReturnType<typeof getUnclaimedProfilesAction>>>([]);
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
      isMuslim: undefined,
      accountType: 'Individual',
      existingProfileId: undefined,
    },
  });

  useEffect(() => {
    if (!user?.uid) return;
    void getRequiredIdToken().then(getUnclaimedProfilesAction).then(setUnclaimedProfiles).catch(() => setUnclaimedProfiles([]));
  }, [user?.uid]);

  const selectHistoricalProfile = (profileId: string) => {
    form.setValue('existingProfileId', profileId);
    const profile = unclaimedProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    form.setValue('email', profile.pendingEmail || '');
    form.setValue('accessRole', profile.accessRole as 'OWNER' | 'ADMIN' | 'STAFF' | 'USER');
    form.setValue('personas', profile.personas as Persona[]);
    form.setValue('primaryPortal', (profile.primaryPortal || resolvePrimaryPortalFromPersonas(profile.personas as Persona[])) as any);
    form.setValue('accountType', profile.accountType as 'Individual' | 'Organization');
    form.setValue('isMuslim', profile.isMuslim);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!user?.uid) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in as an admin.',
      });
      return;
    }
    if (accountSource === 'EXISTING' && !values.existingProfileId) {
      toast({ variant: 'destructive', title: 'Select a historical profile', description: 'Choose the imported client or investor who should receive this invitation.' });
      return;
    }

    startTransition(async () => {
      const inviterName = user.displayName || user.email || 'Admin';
      const accessRole = values.accessRole;
      const personas = [...new Set(values.personas)];
      const primaryPortal =
        accessRole === 'OWNER'
          ? 'owner'
          : accessRole === 'ADMIN' || accessRole === 'STAFF'
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
        authToken: await getRequiredIdToken(),
        email: values.email,
        accessRole,
        personas,
        primaryPortal,
        accountType: values.accountType,
        isMuslim: personas.includes('INVESTOR') ? values.isMuslim : undefined,
        inviterId: user.uid,
        inviterName,
        existingProfileId: accountSource === 'EXISTING' ? values.existingProfileId : undefined,
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
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: 'Copied', description: 'Invite link copied to clipboard.' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Could not copy invite link.' });
    }
  };

  const shareLink = async () => {
    if (!inviteLink) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Invite Link',
          text: 'Use this invite link to create your account.',
          url: inviteLink,
        });
        return;
      } catch {
        // fall through to clipboard copy
      }
    }

    await copyLink();
    toast({ title: 'Share manually', description: 'Link copied. Paste and share it with the invited user.' });
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label>Account source</Label>
            <Select value={accountSource} onValueChange={(value: 'NEW' | 'EXISTING') => { setAccountSource(value); if (value === 'NEW') form.setValue('existingProfileId', undefined); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NEW">Invite a new customer</SelectItem><SelectItem value="EXISTING">Give an imported customer access</SelectItem></SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Imported customers keep their existing documents, deals, investments and balances.</p>
          </div>
          {accountSource === 'EXISTING' && <div className="grid gap-2">
            <Label>Historical client or investor</Label>
            <Select value={form.watch('existingProfileId')} onValueChange={selectHistoricalProfile}>
              <SelectTrigger><SelectValue placeholder="Select an unclaimed profile" /></SelectTrigger>
              <SelectContent>{unclaimedProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name} · {(profile.personas || []).join(', ')}</SelectItem>)}</SelectContent>
            </Select>
            {!unclaimedProfiles.length && <p className="text-sm text-amber-700">No unclaimed historical profiles are available.</p>}
          </div>}
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
                <FormDescription>
                  Access role controls system authority. Example: `ADMIN` can make platform changes, `OWNER` is read-only governance, `STAFF` has operational access, `USER` has no admin authority.
                </FormDescription>
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
                                  if (choice.value === 'INVESTOR' && !checked) {
                                    form.setValue('isMuslim', undefined);
                                  }
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
                <FormDescription>
                  Personas define business identity and workflows this user belongs to (Investor, Client, Legal, Recovery, Marketer, Staff Member). A user can have multiple personas.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.watch('personas').includes('INVESTOR') && (
            <FormField
              control={form.control}
              name="isMuslim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Investor religious classification</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === 'true')}
                    value={typeof field.value === 'boolean' ? String(field.value) : undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Muslim or non-Muslim" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">Muslim</SelectItem>
                      <SelectItem value="false">Non-Muslim</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Zakat is calculated only for investors registered as Muslim.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contracting party</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Individual">Individual</SelectItem>
                    <SelectItem value="Organization">Organization / Business</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Applies to Client and Investor personas. An organization remains the legal party; its representative receives access and signs on its behalf.
                </FormDescription>
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
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="recovery">Recovery</SelectItem>
                    <SelectItem value="marketer">Marketer</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Primary portal is the default first page after login. It does not change permissions; it only controls where the user lands initially.
                </FormDescription>
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
          <p className="text-xs text-muted-foreground">
            Copy this link and share it with the invited user.
          </p>
          <div className="flex gap-2">
            <Input value={inviteLink} readOnly />
            <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copy invite link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
            <Button type="button" variant="secondary" onClick={shareLink}>
              <Share2 className="mr-2 h-4 w-4" />
              Share Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
