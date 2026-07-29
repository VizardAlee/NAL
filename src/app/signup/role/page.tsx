
'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, User, Briefcase } from "lucide-react";
import { setRoleAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useIdToken } from '@/firebase/auth-token';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

function RoleButton({ role, children }: { role: 'Investor' | 'Client', children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" name="role" value={role} className="w-full h-24 text-lg" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : children}
        </Button>
    )
}

export default function RoleSelectionPage() {
    const [state, formAction] = useActionState(setRoleAction, { success: false, message: '' });
    const { toast } = useToast();
    const router = useRouter();
    const { user, loading } = useUser();
    const authToken = useIdToken();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    useEffect(() => {
        if (state.message) {
            if(state.success) {
                toast({ title: "Success", description: state.message });
                router.push(state.redirectUrl || '/');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: state.message });
            }
        }
    }, [state, toast, router]);

    if (loading || !user) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="w-full max-w-md space-y-4">
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="font-headline text-2xl">One Last Step!</CardTitle>
                    <CardDescription>
                        To complete your profile, please tell us who you are.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={formAction} className="space-y-4">
                        <input type="hidden" name="userId" value={user.uid} />
                        <input type="hidden" name="authToken" value={authToken} />
                        <div className="space-y-2 rounded-md border p-4">
                            <Label htmlFor="isMuslim">Investor religious classification</Label>
                            <Select name="isMuslim">
                                <SelectTrigger id="isMuslim">
                                    <SelectValue placeholder="Select Muslim or non-Muslim" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">Muslim</SelectItem>
                                    <SelectItem value="false">Non-Muslim</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">
                                Required only when registering as an investor. Zakat applies only to Muslim investors.
                            </p>
                        </div>
                        <RoleButton role="Investor">
                            <Briefcase className="mr-3 h-6 w-6" />
                            I am an Investor
                        </RoleButton>
                        <RoleButton role="Client">
                            <User className="mr-3 h-6 w-6" />
                            I am a Client
                        </RoleButton>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
