
import { PlaceholderPage } from "@/components/placeholder-page";
import { User } from "lucide-react";

// This is a placeholder page for viewing a single user's details.
// We will build this out in the next step.
export default function UserDetailPage({ params }: { params: { userId: string } }) {
  return (
    <PlaceholderPage
      title="User Profile"
      description={`Viewing details for user ID: ${params.userId}. This page is under construction.`}
      icon={User}
    />
  );
}
