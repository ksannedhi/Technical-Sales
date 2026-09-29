import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, evaluate, deriveFlags, pathToGo, riskRegister, inputs, controlsData, threatsData, residencyData, scenariosData, aiRmf } from '../engine.js';

const inputIds = new Set(inputs.sections.flatMap((s) => s.inputs).map((i) => i.id));
const optionValues = Object.fromEntries(
  inputs.sections.flatMap((s) => s.inputs).map((i) => [i.id, new Set((i.options ?? []).map((o) => o.value))])
);
const controlIds = new Set(controlsData.controls.map((c) => c.id));
const flags = new Set(['untrustedContent', 'externalChannel', 'sensitiveData', 'personalData', 'highImpactAction', 'trifecta']);

function checkCondition(cond, where) {
  if (cond.all || cond.any) return (cond.all ?? cond.any).forEach((c) => checkCondition(c, where));
  if (cond.flag) return assert.ok(flags.has(cond.flag), `${where}: unknown flag ${cond.flag}`);
  assert.ok(inputIds.has(cond.field), `${where}: unknown field ${cond.field}`);
  for (const v of cond.in ?? cond.notIn ?? cond.anyNotIn ?? [])
    assert.ok(optionValues[cond.field].has(v), `${where}: ${cond.field} has no option "${v}"`);
}

test('every threat and residency rule references real fields, options, and controls', () => {
  for (const t of threatsData.threats) {
    checkCondition(t.when, t.id);
    for (const c of t.mitigatedBy) assert.ok(controlIds.has(c), `${t.id}: unknown control ${c}`);
  }
  for (const r of residencyData.rules) checkCondition(r.when, r.id);
});

test('ids are unique', () => {
  const ids = threatsData.threats.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(controlIds.size, controlsData.controls.length);
});

test('mapping IDs are well-formed', () => {
  for (const t of threatsData.threats) {
    t.owaspLlm.forEach((id) => assert.match(id, /^LLM(0[1-9]|10)$/, t.id));
    t.owaspAgentic.forEach((id) => assert.match(id, /^ASI(0[1-9]|10)$/, t.id));
    t.atlas.forEach((id) => assert.match(id, /^AML\.T\d{4}(\.\d{3})?$/, t.id));
  }
  for (const c of controlsData.controls) c.atlas.forEach((id) => assert.match(id, /^AML\.M\d{4}$/, c.id));
});

for (const s of scenariosData.scenarios) {
  test(`preset "${s.label}" gives ${s.expectedVerdict}`, () => {
    const r = assess(s.answers, s.controls);
    assert.equal(r.verdict.decision, s.expectedVerdict, JSON.stringify(r.verdict, null, 2));
  });
}

test('trifecta: egress allowlist breaks the chain', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  assert.equal(assess(bank.answers, bank.controls).trifecta.broken, false);
  assert.equal(assess(bank.answers, [...bank.controls, 'egress_restriction']).trifecta.broken, true);
});

test('trifecta: guardrails alone never break it', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const r = assess(bank.answers, ['guardrails']);
  assert.equal(r.trifecta.present, true);
  assert.equal(r.trifecta.broken, false);
});

test('missing audit logging blocks a clean Go', () => {
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  const r = assess(hr.answers, hr.controls.filter((c) => c !== 'audit_logging'));
  assert.equal(r.verdict.decision, 'go_with_conditions');
});

test('Kuwait personal data outside Kuwait is Critical; in-country is not', () => {
  const base = { jurisdictions: ['KW'], dataSensitivity: '3', dataTypes: ['personal'], hostingCountry: ['EU'] };
  assert.ok(assess(base, []).residency.some((f) => f.id === 'KW-01' && f.severity === 4));
  assert.ok(!assess({ ...base, hostingCountry: ['KW'] }, []).residency.some((f) => f.id === 'KW-01'));
});

test('notIn on an empty answer does not fire', () => {
  assert.equal(evaluate({ field: 'hostingCountry', notIn: ['KW'] }, {}, deriveFlags({})), false);
});

test('every AI RMF reference exists in ai-rmf.json', () => {
  const ids = new Set(Object.keys(aiRmf.subcategories));
  for (const c of controlsData.controls) {
    assert.ok(c.aiRmf.length > 0, `${c.id}: no AI RMF mapping`);
    c.aiRmf.forEach((id) => assert.ok(ids.has(id), `${c.id}: unknown ${id}`));
  }
  aiRmf.reportEvidence.flatMap((e) => e.subcategories).forEach((id) => assert.ok(ids.has(id), id));
});

test('path to Go: applying the suggested controls actually lifts the verdict', () => {
  for (const s of scenariosData.scenarios) {
    const p = pathToGo(s.answers, s.controls);
    for (const step of p.steps.filter((x) => x.reachable)) {
      const fixed = { ...s.answers };
      for (const a of p.architecture) Object.assign(fixed, residencyData.rules.find((r) => r.id === a.id).architectureFix);
      const r = assess(fixed, [...s.controls, ...step.controls.map((c) => c.id)], { waiveResidency: step.approvals.map((a) => a.id) });
      const rank = { not_yet: 0, go_with_conditions: 1, go: 2 };
      assert.ok(rank[r.verdict.decision] >= rank[step.target], `${s.id} -> ${step.target}`);
    }
  }
});

test('path to Go: bank needs in-country inference and CBK approval', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const p = pathToGo(bank.answers, bank.controls);
  assert.deepEqual(p.architecture.map((a) => a.id), ['KW-01']);
  assert.deepEqual(p.approvals.map((a) => a.id), ['KW-05']);
});

test('risk register has one row per threat with AI RMF references', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const rows = riskRegister(bank.answers, bank.controls);
  assert.equal(rows.length, assess(bank.answers, bank.controls).threats.length);
  rows.forEach((r) => assert.ok(r.aiRmf.includes('MANAGE 1.2')));
});

test('any inference location outside Kuwait triggers KW-01, even alongside Kuwait', () => {
  const base = { jurisdictions: ['KW'], dataSensitivity: '3', dataTypes: ['personal'] };
  const fired = (countries) => assess({ ...base, hostingCountry: countries }, []).residency.some((f) => f.id === 'KW-01');
  assert.equal(fired(['KW']), false);
  assert.equal(fired(['KW', 'EU']), true);
  assert.equal(fired(['KW', 'other']), true);
});

test('mixed audiences and identities score as the worst case', () => {
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  const staffOnly = assess(hr.answers, hr.controls);
  const withPublic = assess({ ...hr.answers, users: ['internal', 'public'] }, hr.controls);
  assert.ok(!staffOnly.threats.some((t) => t.id === 'T-SPL-01'));
  assert.ok(withPublic.threats.some((t) => t.id === 'T-SPL-01'), 'public users should trigger system prompt extraction');
  const mixedId = assess({ ...hr.answers, identity: ['per_user', 'shared_service'], dataSensitivity: '3' }, hr.controls);
  assert.ok(mixedId.threats.some((t) => t.id === 'T-LEAK-01'), 'one shared account is enough for cross-user leakage');
});

test('CBK cloud outsourcing: private cloud counts, own on-prem does not', () => {
  const bank = { sector: 'banking', jurisdictions: ['KW'], hostingCountry: ['KW'], dataSensitivity: '2' };
  const fired = (hosting) => assess({ ...bank, hosting }, []).residency.some((f) => f.id === 'KW-05');
  assert.equal(fired(['private_cloud']), true);
  assert.equal(fired(['on_prem']), false);
});
