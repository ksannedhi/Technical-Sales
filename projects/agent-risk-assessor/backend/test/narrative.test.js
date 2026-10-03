// The brief's response handling, without an API call: a refusal, bad JSON, or an incomplete brief must
// give null (the page then says the brief couldn't be written and the assessment is unaffected).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief } from '../narrative.js';

const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const good = { decision: 'Not yet.', reasons: [{ headline: 'H', detail: 'D' }], actions: ['Do X.'] };

test('a normal response gives the brief', () => {
  assert.deepEqual(parseBrief(text(JSON.stringify(good))), good);
});

test('a refusal gives null, whatever text came with it', () => {
  assert.equal(parseBrief({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [{ type: 'text', text: JSON.stringify(good) }] }), null);
});

test('invalid JSON or an incomplete brief gives null', () => {
  assert.equal(parseBrief(text('not json')), null);
  assert.equal(parseBrief(text(JSON.stringify({ reasons: [], actions: [] }))), null);
  assert.equal(parseBrief(text(JSON.stringify({ decision: 'x' }))), null);
  assert.equal(parseBrief({ stop_reason: 'end_turn', content: [] }), null);
});

test('thinking blocks are ignored; only text blocks form the brief', () => {
  const r = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(good) }] };
  assert.deepEqual(parseBrief(r), good);
});
