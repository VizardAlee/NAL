import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { AnalyzerForm } from "./analyzer-form";

export default function AnalyzerPage() {
  return (
    <div>
      <PageHeader
        title="Smart Deal Analyzer"
        description="Leverage AI to assess financing proposals for viability, risk, and key insights."
        icon={FlaskConical}
      />
      <AnalyzerForm />
    </div>
  );
}
