
import { PageHeader } from "@/components/page-header";
import { HandCoins } from "lucide-react";
import { LodgePaymentForm } from "./lodge-payment-form";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function LodgePaymentFormSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
        </div>
    )
}

export default function LodgePaymentPage() {
  return (
    <div className="max-w-xl mx-auto">
      <PageHeader
        title="Lodge Payment"
        description="Submit a repayment for one of your active deals. An admin will review and approve it."
        icon={HandCoins}
      />
      <Suspense fallback={<LodgePaymentFormSkeleton />}>
        <LodgePaymentForm />
      </Suspense>
    </div>
  );
}
