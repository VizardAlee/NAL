
"use server";

import { analyzeFinancingProposal } from "@/ai/flows/analyze-financing-proposal";
import { z } from "zod";
import { verifyAdminWrite } from '@/lib/server/auth';

const analyzeSchema = z.object({
  proposalDetails: z.string().min(50, { message: "Proposal details must be at least 50 characters." }),
});

type State = {
  message: string;
  data: any | null;
  errors: any | null;
};

export async function getAnalysis(prevState: any, formData: FormData): Promise<State> {
  await verifyAdminWrite(String(formData.get('authToken') || ''));
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
