
"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { getAnalysis } from "@/app/admin/analyzer/actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Loader2, BarChart, Shield, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const initialState = {
  message: "",
  data: null,
  errors: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} size="lg">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
      Analyze Proposal
    </Button>
  );
}

export function AnalyzerForm() {
  const [state, formAction] = useActionState(getAnalysis, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.message && state.message !== "Analysis complete." && state.message !== "Invalid form data.") {
      toast({
        variant: "destructive",
        title: "Error",
        description: state.message,
      });
    }
  }, [state, toast]);


  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form action={formAction} className="space-y-4">
        <Textarea
          name="proposalDetails"
          placeholder="Paste the full details of the financing proposal here. Include information about the business, funding amount, use of funds, repayment terms, and any other relevant data..."
          rows={15}
          className="text-base"
        />
        {state.errors?.proposalDetails && (
          <p className="text-sm font-medium text-destructive">
            {state.errors.proposalDetails[0]}
          </p>
        )}
        <SubmitButton />
      </form>

      <div className="space-y-6">
        {state.data ? (
          <>
            <AnalysisCard icon={BarChart} title="Viability Assessment" content={state.data.viability} />
            <AnalysisCard icon={Shield} title="Risk Level" content={state.data.riskLevel} />
            <AnalysisCard icon={Sparkles} title="Key Insights & Recommendations" content={state.data.keyInsights} />
          </>
        ) : (
          <Card className="flex h-full items-center justify-center border-dashed">
            <CardContent className="p-6 text-center">
              <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Awaiting Analysis</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your AI-powered analysis will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AnalysisCard({ icon: Icon, title, content }: { icon: React.ElementType, title: string, content: string }) {
    return (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <Icon className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline text-xl">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{content}</p>
          </CardContent>
        </Card>
    );
}
