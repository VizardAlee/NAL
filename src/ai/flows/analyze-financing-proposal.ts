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
  prompt: `You are an expert financial analyst with deep expertise in the Nigerian market. Your primary focus is on business financing within Nigeria, and all financial figures should be assumed to be in Nigerian Naira (NGN).

You will analyze the provided financing proposal details considering current Nigerian economic realities, market trends, and sector-specific challenges. Provide a concise assessment of its viability, risk level, and key insights.

Financing Proposal Details:
{{{proposalDetails}}}

Provide your analysis in a structured format, covering viability, risk level, and key insights. Be concise and focus on actionable recommendations relevant to the Nigerian context.`,
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
