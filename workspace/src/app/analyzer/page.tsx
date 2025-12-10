
import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { AnalyzerForm } from "./analyzer-form";
import { ViewPageNav } from "@/components/view-page-nav";
import { Suspense } from 'react';
import { useUser } from '@/firebase';

function DynamicNav() {
  const { user } = useUser();
  if (!user) return null;

  if (user.role === 'Investor') {
    return <ViewPageNav homePath="/investor/dashboard" />
  }
   if (user.role === 'Client') {
    return <ViewPageNav homePath="/client/dashboard" />
  }
  return null;
}


export default function AnalyzerPage() {
  return (
    <div>
      <PageHeader
        title="Smart Deal Analyzer"
        description="Leverage AI to assess financing proposals for viability, risk, and key insights."
        icon={FlaskConical}
      >
        <Suspense fallback={null}><DynamicNav /></Suspense>
      </PageHeader>
      <AnalyzerForm />
    </div>
  );
}
