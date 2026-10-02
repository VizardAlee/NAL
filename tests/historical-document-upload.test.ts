import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalDocumentType, MAX_HISTORICAL_DOCUMENT_BYTES } from '../src/lib/server/historical-document-upload';

test('historical evidence detects PDF and supported image contents rather than trusting a filename', () => {
  assert.equal(historicalDocumentType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(historicalDocumentType(Buffer.from([255,216,255])), 'image/jpeg');
  assert.equal(historicalDocumentType(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(historicalDocumentType(Buffer.from('RIFF0000WEBP')), 'image/webp');
});

test('empty, oversized and unsupported evidence is rejected before Storage writes', () => {
  assert.throws(() => historicalDocumentType(Buffer.alloc(0)), /1 byte and 5 MB/);
  assert.throws(() => historicalDocumentType(Buffer.alloc(MAX_HISTORICAL_DOCUMENT_BYTES + 1)), /1 byte and 5 MB/);
  assert.throws(() => historicalDocumentType(Buffer.from('<script>not a PDF</script>')), /genuine JPG/);
});
