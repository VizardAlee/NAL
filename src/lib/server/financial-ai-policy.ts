import { HistoricalWorkspaceError } from './historical-workspace-result';

export const FINANCIAL_AI_DISABLED_MESSAGE = 'Automatic extraction is disabled until the Gemini API project’s paid-service data protection is confirmed. Your documents have not been sent to Gemini. Use manual review to continue.';

export function financialAiEnabled() {
  return process.env.FINANCIAL_DOCUMENT_AI_ENABLED === 'true';
}

export function assertFinancialAiEnabled() {
  if (!financialAiEnabled()) throw new HistoricalWorkspaceError('AI_PRIVACY_NOT_CONFIRMED', FINANCIAL_AI_DISABLED_MESSAGE);
}
