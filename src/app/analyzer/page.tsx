
'use client';

import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { AnalyzerForm } from "./analyzer-form";
import { ViewPageNav } from "@/components/view-page-nav";
import { Suspense } from 'react';
import { useUser } from '@/firebase';

function DynamicNav() {
  const { user } = useUser();
  if (!user) return null;

  // Since this is the public analyzer, we determine the correct home path based on role.
  let homePath = '/';
  if (user) {
    switch ((user as any).role) {
      case 'Admin':
        homePath = '/admin/dashboard';
        break;
      case 'Investor':
        homePath = '/investor/dashboard';
        break;
      case 'Client':
        homePath = '/client/dashboard';
        break;
    }
  }
  
  return <ViewPageNav homePath={homePath} />;
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
