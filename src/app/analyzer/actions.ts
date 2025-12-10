
"use server";

import { analyzeFinancingProposal } from "@/ai/flows/analyze-financing-proposal";
import { z } from "zod";

const analyzeSchema = z.object({
  proposalDetails: z.string().min(50, { message: "Proposal details must be at least 50 characters." }),
});

export async function getAnalysis(prevState: any, formData: FormData) {
  const validatedFields = analyzeSchema.safeParse({
    proposalDetails: formData.get('proposalDetails'),
  });

  if (!validatedFields.success) {
    return {
      message: "Invalid form data.",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  try {
    const result = await analyzeFinancingProposal({ proposalDetails: validatedFields.data.proposalDetails });
    return {
      message: "Analysis complete.",
      data: result,
    };
  } catch (error) {
    console.error(error);
    return {
      message: "Failed to analyze proposal. Please try again.",
    };
  }
}
