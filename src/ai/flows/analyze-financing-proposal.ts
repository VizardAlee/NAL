'use server';

/**
 * @fileOverview AI agent to analyze financing proposals.
 *
 * - analyzeFinancingProposal - Analyzes a financing proposal and provides an assessment.
 * - AnalyzeFinancingProposalInput - The input type for the analyzeFinancingProposal function.
 * - AnalyzeFinancingProposalOutput - The return type for the analyzeFinancingProposal function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeFinancingProposalInputSchema = z.object({
  proposalDetails: z
    .string()
    .describe('The details of the financing proposal to analyze.'),
});

export type AnalyzeFinancingProposalInput = z.infer<typeof AnalyzeFinancingProposalInputSchema>;

const AnalyzeFinancingProposalOutputSchema = z.object({
  viability: z.string().describe('An assessment of the proposal viability.'),
  riskLevel: z.string().describe('An assessment of the risk level of the proposal.'),
  keyInsights: z.string().describe('Key insights and recommendations for the proposal.'),
});

export type AnalyzeFinancingProposalOutput = z.infer<typeof AnalyzeFinancingProposalOutputSchema>;

export async function analyzeFinancingProposal(
  input: AnalyzeFinancingProposalInput
): Promise<AnalyzeFinancingProposalOutput> {
  return analyzeFinancingProposalFlow(input);
}

const analyzeFinancingProposalPrompt = ai.definePrompt({
  name: 'analyzeFinancingProposalPrompt',
  input: {schema: AnalyzeFinancingProposalInputSchema},
  output: {schema: AnalyzeFinancingProposalOutputSchema},
  prompt: `You are an expert financial analyst. You will analyze the provided financing proposal details and provide an assessment of its viability, risk level, and key insights.\n\nFinancing Proposal Details: {{{proposalDetails}}}\n\nProvide your analysis in a structured format, covering viability, risk level, and key insights. Be concise and focus on actionable recommendations.`,
});

const analyzeFinancingProposalFlow = ai.defineFlow(
  {
    name: 'analyzeFinancingProposalFlow',
    inputSchema: AnalyzeFinancingProposalInputSchema,
    outputSchema: AnalyzeFinancingProposalOutputSchema,
  },
  async input => {
    const {output} = await analyzeFinancingProposalPrompt(input);
    return output!;
  }
);
