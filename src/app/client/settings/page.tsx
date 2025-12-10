

import { PageHeader } from "@/components/page-header";
import { Settings } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { UpdateProfileForm } from "@/components/update-profile-form";
import { NotificationSettingsCard } from "@/components/notification-provider";

export default function SettingsPage() {
  return (
    <div>
        <PageHeader
            title="Settings"
            description="Manage your account settings."
            icon={Settings}
        />
        <div className="space-y-6">
            <UpdateProfileForm />
            <NotificationSettingsCard />
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
