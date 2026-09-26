// Tests for enforceIntakeRules() — the deterministic backstop for the intake
// recommendation rules in INTAKE_SYSTEM. Run with `npm test` from the project root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceIntakeRules } from './prompt.js';

const BANKING = 'Banking & financial services';
const GCC     = 'Personal data of GCC residents';
const CARDS   = 'Payment card data';

const profile = (overrides = {}) => ({
  geography: 'Kuwait', sector: BANKING, dataTypes: [], stockExchangeListed: false, ...overrides
});
const model = (...pairs) => ({
  recommendedFrameworks: pairs.map(([frameworkId, weight]) => ({ frameworkId, weight, rationale: 'r', regulatoryBasis: 'b' }))
});
const run = (p, r) => {
  const { result, adjustments } = enforceIntakeRules(p, r);
  return { weights: Object.fromEntries(result.recommendedFrameworks.map(f => [f.frameworkId, f.weight])), adjustments };
};

test('CBK is kept for Kuwait banking', () => {
  const { weights } = run(profile(), model(['CBK', 'mandatory']));
  assert.equal(weights.CBK, 'mandatory');
});

test('CBK is removed outside Kuwait, even as contractual', () => {
  for (const geography of ['UAE', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Oman', 'Multiple']) {
    const { weights } = run(profile({ geography }), model(['CBK', 'contractual']));
    assert.equal(weights.CBK, undefined, geography);
  }
});

test('CBK is removed for non-banking Kuwait sectors', () => {
  for (const sector of ['Government', 'Telecoms', 'Oil & gas', 'Healthcare']) {
    const { weights } = run(profile({ sector }), model(['CBK', 'contractual']));
    assert.equal(weights.CBK, undefined, sector);
  }
});

test('UAE central bank regression: CBK and SAMA-CSF are stripped', () => {
  const p = profile({ geography: 'UAE', dataTypes: [GCC, 'CNI operator (central bank, utility, telecoms, government)'] });
  const { weights, adjustments } = run(p, model(['UAE-NIAF', 'mandatory'], ['CBK', 'contractual'], ['SAMA-CSF', 'contractual']));
  assert.deepEqual(Object.keys(weights).sort(), ['NIST-CSF', 'UAE-NIAF']);
  assert.ok(adjustments.includes('removed CBK'));
  assert.ok(adjustments.includes('removed SAMA-CSF'));
});

test('SAMA-CSF is Saudi-only', () => {
  assert.equal(run(profile({ geography: 'Saudi Arabia' }), model(['SAMA-CSF', 'mandatory'])).weights['SAMA-CSF'], 'mandatory');
  assert.equal(run(profile({ geography: 'Multiple' }), model(['SAMA-CSF', 'contractual'])).weights['SAMA-CSF'], undefined);
});

test('NCA-ECC is removed for single non-Saudi GCC countries but allowed for Multiple', () => {
  for (const geography of ['UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman']) {
    assert.equal(run(profile({ geography }), model(['NCA-ECC', 'contractual'])).weights['NCA-ECC'], undefined, geography);
  }
  assert.equal(run(profile({ geography: 'Multiple' }), model(['NCA-ECC', 'contractual'])).weights['NCA-ECC'], 'contractual');
});

test('national frameworks stay in their own jurisdiction', () => {
  assert.equal(run(profile({ geography: 'Qatar' }), model(['UAE-NIAF', 'contractual'])).weights['UAE-NIAF'], undefined);
  assert.equal(run(profile({ geography: 'UAE' }), model(['KUWAIT-NBCC', 'contractual'])).weights['KUWAIT-NBCC'], undefined);
  assert.equal(run(profile({ geography: 'Bahrain' }), model(['QATAR-NIAS', 'contractual'])).weights['QATAR-NIAS'], undefined);
  assert.equal(run(profile({ geography: 'Multiple' }), model(['QATAR-NIAS', 'contractual'])).weights['QATAR-NIAS'], 'contractual');
});

test('PCI-DSS requires the payment card checkbox', () => {
  assert.equal(run(profile({ dataTypes: [GCC] }), model(['PCI-DSS', 'mandatory'])).weights['PCI-DSS'], undefined);
  assert.equal(run(profile({ dataTypes: [CARDS] }), model(['PCI-DSS', 'mandatory'])).weights['PCI-DSS'], 'mandatory');
});

test('PDPL-UAE and PDPL-QAT are capped at contractual outside their home country', () => {
  const { weights, adjustments } = run(profile({ dataTypes: [GCC] }),
    model(['PDPL-KSA', 'mandatory'], ['PDPL-UAE', 'mandatory'], ['PDPL-QAT', 'mandatory']));
  assert.equal(weights['PDPL-KSA'], 'mandatory');   // extraterritorial — may be mandatory anywhere
  assert.equal(weights['PDPL-UAE'], 'contractual');
  assert.equal(weights['PDPL-QAT'], 'contractual');
  assert.ok(adjustments.includes('PDPL-UAE mandatory → contractual'));
});

test('PDPL caps do not apply in the home country', () => {
  assert.equal(run(profile({ geography: 'UAE' }), model(['PDPL-UAE', 'mandatory'])).weights['PDPL-UAE'], 'mandatory');
  assert.equal(run(profile({ geography: 'Qatar' }), model(['PDPL-QAT', 'mandatory'])).weights['PDPL-QAT'], 'mandatory');
});

test('NIST-CSF is added as voluntary when the model omits it', () => {
  const { result, adjustments } = enforceIntakeRules(profile(), model(['CBK', 'mandatory']));
  const nist = result.recommendedFrameworks.find(f => f.frameworkId === 'NIST-CSF');
  assert.equal(nist.weight, 'voluntary');
  assert.ok(nist.rationale && nist.regulatoryBasis);
  assert.ok(adjustments.includes('added NIST-CSF (voluntary)'));
});

test('NIST-CSF is contractual for listed entities, whether added or upgraded', () => {
  const listed = profile({ stockExchangeListed: true });
  assert.equal(run(listed, model(['CBK', 'mandatory'])).weights['NIST-CSF'], 'contractual');
  assert.equal(run(listed, model(['NIST-CSF', 'voluntary'])).weights['NIST-CSF'], 'contractual');
});

test('NIST-CSF is not duplicated when the model includes it', () => {
  const { result, adjustments } = enforceIntakeRules(profile(), model(['NIST-CSF', 'voluntary']));
  assert.equal(result.recommendedFrameworks.filter(f => f.frameworkId === 'NIST-CSF').length, 1);
  assert.deepEqual(adjustments, []);
});

test('a compliant Kuwait bank recommendation passes through unchanged', () => {
  const input = model(['CBK', 'mandatory'], ['KUWAIT-NBCC', 'mandatory'], ['PCI-DSS', 'mandatory'],
    ['PDPL-KSA', 'mandatory'], ['PDPL-UAE', 'contractual'], ['ISO-27001', 'contractual'], ['NIST-CSF', 'voluntary']);
  const { result, adjustments } = enforceIntakeRules(profile({ dataTypes: [GCC, CARDS] }), input);
  assert.deepEqual(adjustments, []);
  assert.deepEqual(result.recommendedFrameworks, input.recommendedFrameworks);
});

test('a missing recommendedFrameworks array does not throw', () => {
  const { result } = enforceIntakeRules(profile(), {});
  assert.deepEqual(result.recommendedFrameworks.map(f => f.frameworkId), ['NIST-CSF']);
});
