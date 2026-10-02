import test from 'node:test';
import assert from 'node:assert/strict';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { historicalExtractionSchema, historicalExtractionOutput, historicalExtractionForStorage } from '../src/lib/server/historical-extraction-schema';

test('historical extraction uses JSON mode without compiling the nested schema at Gemini', async context => {
  let request: any;
  context.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    request = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ party: { name: 'Synthetic Investor' }, confidence: 0.8 }) }] }, finishReason: 'STOP' }] }), { headers: { 'content-type': 'application/json' } });
  });
  const ai = genkit({ plugins: [googleAI({ apiKey: 'synthetic-test-key' })], model: 'googleai/gemini-2.5-flash' });
  const response = await ai.generate({ prompt: 'Extract the synthetic investor.', output: historicalExtractionOutput });
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal(request.generationConfig.responseSchema, undefined);
  assert.equal(request.generationConfig.responseJsonSchema, undefined);
  assert.match(JSON.stringify(request.contents), /paymentEvidence/);
  assert.match(JSON.stringify(request.contents), /maxItems/);
  assert.equal(response.output?.party.name, 'Synthetic Investor');
});

test('server validation retains confidence, receipt amount/date and row limits', () => {
  const base = { party: { name: 'Synthetic Investor' } };
  assert.throws(() => historicalExtractionSchema.parse({ ...base, confidence: 2 }));
  const payment = { amount: 100, date: '2026-10-02' };
  for (const evidence of [[{ ...payment, amount: -1 }], [{ ...payment, date: 'not-a-date' }], Array.from({ length: 201 }, () => payment)]) {
    assert.throws(() => historicalExtractionSchema.parse({ ...base, deals: [{ paymentEvidence: evidence }] }));
  }
  assert.equal(historicalExtractionSchema.parse({ ...base, deals: [{ paymentEvidence: [payment] }] }).deals[0].paymentEvidence[0].amount, 100);
});

test('storage normalization removes absent optional account links without altering amounts', () => {
  const result = historicalExtractionForStorage({ party: { name: 'Synthetic Investor' }, deals: [{ clientId: undefined, principal: 12345.67 }], fundPositions: [{ investorId: undefined, availableCapital: 50 }] });
  assert.equal(Object.hasOwn(result.deals[0], 'clientId'), false);
  assert.equal(Object.hasOwn(result.fundPositions[0], 'investorId'), false);
  assert.equal(result.deals[0].principal, 12345.67);
});
