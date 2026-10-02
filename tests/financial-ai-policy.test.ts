import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFinancialAiEnabled, financialAiEnabled } from '../src/lib/server/financial-ai-policy';
import { historicalWorkspaceResult } from '../src/lib/server/historical-workspace-result';

test('disabled AI produces a plain privacy message before any provider call', async () => {
  const previous = process.env.FINANCIAL_DOCUMENT_AI_ENABLED;
  try {
    delete process.env.FINANCIAL_DOCUMENT_AI_ENABLED;
    let providerCalled = false;
    const result = await historicalWorkspaceResult(async () => {
      assertFinancialAiEnabled();
      providerCalled = true;
    });
    assert.equal(financialAiEnabled(), false);
    assert.equal(providerCalled, false);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, 'AI_PRIVACY_NOT_CONFIRMED');
      assert.match(result.message, /documents have not been sent/);
      assert.match(result.message, /manual review/);
    }
    process.env.FINANCIAL_DOCUMENT_AI_ENABLED = 'true';
    assert.equal(financialAiEnabled(), true);
    assert.doesNotThrow(assertFinancialAiEnabled);
  } finally {
    if (previous === undefined) delete process.env.FINANCIAL_DOCUMENT_AI_ENABLED;
    else process.env.FINANCIAL_DOCUMENT_AI_ENABLED = previous;
  }
});
