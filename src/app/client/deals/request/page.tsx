
import { PageHeader } from "@/components/page-header";
import { FilePlus } from "lucide-react";
import { CreateDealRequestForm } from "./create-deal-request-form";
import { Card, CardContent } from "@/components/ui/card";
import { ViewPageNav } from "@/components/view-page-nav";

export default function RequestDealPage() {
  return (
    <div>
      <PageHeader
        title="Request New Deal"
        description="Fill out the form below to submit a new financing deal for review."
        icon={FilePlus}
      >
        <ViewPageNav homePath="/client/dashboard" />
      </PageHeader>
      <Card>
        <CardContent className="p-6">
          <CreateDealRequestForm />
        </CardContent>
      </Card>
    </div>
  );
}
