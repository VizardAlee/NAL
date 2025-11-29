
import { PageHeader } from "@/components/page-header";
import { Settings } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div>
        <PageHeader
            title="Settings"
            description="Manage your account settings."
            icon={Settings}
        />
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
  );
}
