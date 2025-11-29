
'use client';

import { PageHeader } from "@/components/page-header";
import { Settings, Image as ImageIcon, Loader2 } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

function CompanyLogoForm() {
    const { logoUrl, setLogo } = useCompanyLogo();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsLoading(true);
            // Check file type and size
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

export default function SettingsPage() {
  return (
    <div>
        <PageHeader
            title="Settings"
            description="Manage your account and platform settings."
            icon={Settings}
        />
        <div className="space-y-6">
            <CompanyLogoForm />
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
