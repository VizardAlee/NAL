'use client';

import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { AnalyzerForm } from "./analyzer-form";
import { ViewPageNav } from "@/components/view-page-nav";
import { Suspense } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

function DynamicNav() {
  const router = useRouter();
  const { user } = useUser();
  if (!user) return null;

  // Since we can't reliably get the role on the client,
  // a simple "Back" button is more robust for this shared page.
  return (
    <Button variant="outline" size="sm" onClick={() => router.back()}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  );
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
