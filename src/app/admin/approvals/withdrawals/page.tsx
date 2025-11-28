import { PlaceholderPage } from "@/components/placeholder-page";
import { CheckCircle } from "lucide-react";

export default function WithdrawalsPage() {
  return (
    <PlaceholderPage
      title="Withdrawal Approvals"
      description="Review and approve/reject investor withdrawal requests."
      icon={CheckCircle}
    />
  );
}
