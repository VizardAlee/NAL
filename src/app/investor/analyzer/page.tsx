
import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { AnalyzerForm } from "@/components/analyzer-form";
import { ViewPageNav } from "@/components/view-page-nav";

export default function InvestorAnalyzerPage() {
  return (
    <div>
      <PageHeader
        title="Smart Deal Analyzer"
        description="Leverage AI to assess financing proposals for viability, risk, and key insights."
        icon={FlaskConical}
      >
        <ViewPageNav homePath="/investor/dashboard" />
      </PageHeader>
      <AnalyzerForm />
    </div>
  );
}
