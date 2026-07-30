
"use server";

import { analyzeFinancingProposal } from "@/ai/flows/analyze-financing-proposal";
import { z } from "zod";
import { verifyAnyPersonaOrAdmin } from '@/lib/server/auth';

const analyzeSchema = z.object({
  proposalDetails: z.string().min(50, { message: "Proposal details must be at least 50 characters." }),
});

type State = {
  message: string;
  data: any | null;
  errors: any | null;
};

export async function getAnalysis(prevState: any, formData: FormData): Promise<State> {
  try {
    await verifyAnyPersonaOrAdmin(String(formData.get('authToken') || ''), ['INVESTOR', 'CLIENT']);
  } catch {
    return { message: 'You are not authorized to use the analyzer.', data: null, errors: null };
  }
  const validatedFields = analyzeSchema.safeParse({
    proposalDetails: formData.get('proposalDetails'),
  });

  if (!validatedFields.success) {
    return {
      message: "Invalid form data.",
      errors: validatedFields.error.flatten().fieldErrors,
      data: null,
    };
  }

  try {
    const result = await analyzeFinancingProposal({ proposalDetails: validatedFields.data.proposalDetails });
    return {
      message: "Analysis complete.",
      data: result,
      errors: null,
    };
  } catch (error) {
    console.error(error);
    return {
      message: "Failed to analyze proposal. Please try again.",
      data: null,
      errors: null,
    };
  }
}
