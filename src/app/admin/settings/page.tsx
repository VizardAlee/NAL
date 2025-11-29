
'use client';

import { PageHeader } from "@/components/page-header";
import { Settings, Image as ImageIcon, Loader2, HandCoins } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { useRef, useState, useEffect, useActionState } from "react";
import { useFormStatus } from 'react-dom';
import { useToast } from "@/hooks/use-toast";
import { useDoc } from "@/firebase/firestore/use-doc";
import { doc } from 'firebase/firestore';
import { useFirestore } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { setNisabAction } from "./actions";

function CompanyLogoForm() {
    const { logoUrl, setLogo } = useCompanyLogo();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsLoading(true);
            if (!file.type.startsWith('image/')) {
                toast({ variant: 'destructive', title: 'Invalid File', description: 'Please upload an image file.' });
                setIsLoading(false);
                return;
            }
            if (file.size > 1024 * 1024) { // 1MB limit
                 toast({ variant: 'destructive', title: 'File Too Large', description: 'Please upload an image smaller than 1MB.' });
                 setIsLoading(false);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                setLogo(result);
                setIsLoading(false);
                toast({ title: 'Logo Updated', description: 'Your company logo has been changed.' });
            };
            reader.onerror = () => {
                setIsLoading(false);
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to read the image file.' });
            }
            reader.readAsDataURL(file);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Company Logo</CardTitle>
                <CardDescription>Upload your company logo. This will be displayed in the sidebar and as the browser favicon.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
                <div className="relative h-20 w-20 rounded-md border p-2 flex items-center justify-center bg-muted/50">
                    {logoUrl ? (
                        <Image src={logoUrl} alt="Company Logo" layout="fill" objectFit="contain" />
                    ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    )}
                </div>
                <div>
                    <Input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*"
                    />
                    <Button onClick={handleUploadClick} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                        Upload Logo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Recommended size: 128x128. Max 1MB.</p>
                </div>
            </CardContent>
        </Card>
    );
}

function NisabForm({ currentNisab, isLoading }: { currentNisab: number, isLoading: boolean }) {
    const { toast } = useToast();
    const initialState = { success: false, message: '' };
    const [state, formAction] = useActionState(setNisabAction, initialState);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? "Success" : "Error",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
        }
    }, [state.message, state.success, toast]);

    function SubmitButton() {
        const { pending } = useFormStatus();
        return (
            <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                Set Nisab
            </Button>
        );
    }
    
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
                    <SubmitButton />
                </form>
                )}
            </CardContent>
        </Card>
    );
}


export default function SettingsPage() {
  const firestore = useFirestore();
  const zakatSettingsRef = firestore ? doc(firestore, 'platformSettings', 'zakat') : null;
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
