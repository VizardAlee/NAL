import assert from 'node:assert/strict';
import test from 'node:test';
import { translateUiText } from '../src/lib/ui-translations';

test('application UI phrases switch to every supported Nigerian language', () => {
  assert.equal(translateUiText('ha', 'Client Dashboard'), 'Shafin Abokin Ciniki');
  assert.equal(translateUiText('ig', 'Client Dashboard'), 'Ogwe Onye Ahịa');
  assert.equal(translateUiText('yo', 'Client Dashboard'), 'Pátákó Oníbàárà');
});

test('dynamic UI labels preserve deal counts and user names', () => {
  assert.equal(translateUiText('ha', 'View All Deals (4)'), 'Duba Duk Yarjejeniyoyi (4)');
  assert.equal(translateUiText('ig', 'Chat with Amina'), 'Kparịta ụka na Amina');
  assert.equal(translateUiText('yo', '3 installment(s) past due'), 'Ìsanwó 3 ti pẹ́');
});

test('business data and untranslated legal wording remain unchanged', () => {
  assert.equal(translateUiText('ha', 'NAL-REF-29481'), 'NAL-REF-29481');
  assert.equal(translateUiText('yo', 'Custom customer deal name'), 'Custom customer deal name');
  assert.equal(translateUiText('en', 'Client Dashboard'), 'Client Dashboard');
});
