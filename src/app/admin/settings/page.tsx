
'use client';

import { PageHeader } from "@/components/page-header";
import { Settings, Image as ImageIcon, Loader2, HandCoins } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { useRef, useState, useEffect, useActionState, useMemo } from "react";
import { useFormStatus } from 'react-dom';
import { useToast } from "@/hooks/use-toast";
import { useDoc } from "@/firebase/firestore/use-doc";
import { doc } from 'firebase/firestore';
import { useFirestore, useUser } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { setNisabAction } from "./actions";
import { setLogoAction } from "./logo-actions";
import { useCompanyLogo } from "@/components/company-logo-provider";


function NisabForm({ currentNisab, isLoading }: { currentNisab: number, isLoading: boolean }) {
    const { toast } = useToast();
    const [toastShown, setToastShown] = useState(false);
    const [state, formAction, isPending] = useActionState(setNisabAction, { success: false, message: '' });

    useEffect(() => {
        if (state.message && !toastShown) {
            toast({
                title: state.success ? "Success" : "Error",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
            setToastShown(true);
        }
    }, [state, toast, toastShown]);

    // Reset toastShown when the form is not pending anymore
    useEffect(() => {
        if (!isPending) {
            setToastShown(false);
        }
    }, [isPending]);
    
    return (
         <Card>
            <CardHeader>
                <CardTitle>Zakat Nisab Threshold</CardTitle>
                <CardDescription>Set the minimum portfolio value in Naira for an investor to be considered Zakat-eligible.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-10 w-64" />
                ) : (
                <form action={formAction} className="flex items-end gap-4">
                    <div className="relative">
                        <label htmlFor="nisab" className="block text-sm font-medium text-muted-foreground mb-1">Nisab Amount (NGN)</label>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pt-3">₦</span>
                        <Input
                            id="nisab"
                            name="nisab"
                            type="number"
                            defaultValue={currentNisab}
                            className="pl-8"
                            required
                        />
                    </div>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                        Set Nisab
                    </Button>
                </form>
                )}
            </CardContent>
        </Card>
    );
}

function CompanyLogoForm() {
    const { logoUrl, loading } = useCompanyLogo();
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const [state, formAction, isPending] = useActionState(setLogoAction, { success: false, message: '' });
    const [toastShown, setToastShown] = useState(false);

    useEffect(() => {
        if (state.message && !toastShown) {
            toast({
                title: state.success ? "Success" : "Error",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
            setToastShown(true);
            if (state.success) {
                setPreview(null);
            }
        }
    }, [state, toast, toastShown]);

     useEffect(() => {
        if (!isPending) {
            setToastShown(false);
        }
    }, [isPending]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Company Logo</CardTitle>
                <CardDescription>Upload a logo for platform-wide branding. Recommended size: 256x256px.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-32 w-32 rounded-lg" /> : (
                <form action={formAction} className="space-y-4">
                    <div className="flex items-center gap-6">
                        <Image
                            src={preview || logoUrl || '/placeholder.svg'}
                            alt="Company Logo Preview"
                            width={128}
                            height={128}
                            className="h-32 w-32 rounded-lg object-contain border bg-muted"
                        />
                        <input type="hidden" name="logoUrl" value={preview || ''} />
                        <Input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/png, image/jpeg, image/svg+xml"
                            onChange={handleFileChange}
                        />
                        <div className="flex flex-col gap-2">
                             <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <ImageIcon className="mr-2 h-4 w-4" />
                                Choose File
                            </Button>
                            <Button type="submit" disabled={isPending || !preview}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Logo
                            </Button>
                        </div>
                    </div>
                </form>
                )}
            </CardContent>
        </Card>
    )
}

export default function SettingsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  
  const zakatSettingsRef = useMemo(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'platformSettings', 'zakat');
  }, [firestore, user]);
  
  const { data: zakatSettings, loading: zakatLoading } = useDoc<{ nisab: number }>(zakatSettingsRef);

  return (
    <div>
        <PageHeader
            title="Settings"
            description="Manage your account and platform settings."
            icon={Settings}
        />
        <div className="space-y-6">
            <CompanyLogoForm />
            <NisabForm currentNisab={zakatSettings?.nisab || 0} isLoading={zakatLoading} />
            <Card>
                <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your password here. It's recommended to use a strong, unique password.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChangePasswordForm />
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
