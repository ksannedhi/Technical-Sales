import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, evaluate, deriveFlags, pathToGo, pathTarget, effectiveControls, applyDerivedFixes, normaliseAnswers, riskRegister, rmfCoverage, inputs, controlsData, threatsData, residencyData, scenariosData, aiRmf } from '../engine.js';

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

test('fully autonomous high-impact actions cap the verdict at Go with conditions without human approval', () => {
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  const design = { ...hr.answers, autonomy: 'autonomous', actions: ['read_only', 'write_records'] };
  const all = controlsData.controls.map((c) => c.id);
  const noApproval = all.filter((c) => c !== 'human_approval');
  const r = assess(design, noApproval);
  assert.equal(r.verdict.decision, 'go_with_conditions');
  assert.ok(r.verdict.conditions.some((c) => c.includes('Human approval for high-impact actions')));
  // Ticking the approval box can't clear it: approval follows the oversight answer.
  assert.equal(assess(design, all).verdict.decision, 'go_with_conditions');
  // Read-only autonomy, or a human approving high-risk actions, does not trigger it.
  assert.equal(assess({ ...design, actions: ['read_only'] }, noApproval).verdict.decision, 'go');
  assert.equal(assess({ ...design, autonomy: 'approve_high_risk' }, noApproval).verdict.decision, 'go');
});

test('every multi-select offers None, and None triggers nothing', () => {
  const multis = inputs.sections.flatMap((s) => s.inputs).filter((i) => i.type === 'multi');
  const withoutNone = ['jurisdictions', 'hosting', 'hostingCountry', 'actions', 'users', 'identity'];
  for (const i of multis.filter((i) => !withoutNone.includes(i.id)))
    assert.ok(optionValues[i.id].has('none'), `${i.id} has no "none" option`);
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  for (const field of ['dataSources', 'supplyChain']) {
    const empty = assess({ ...hr.answers, [field]: [] }, hr.controls);
    const none = assess({ ...hr.answers, [field]: ['none'] }, hr.controls);
    assert.deepEqual(none.threats.map((t) => t.id), empty.threats.map((t) => t.id), field);
    assert.deepEqual(none.residency.map((r) => r.id), empty.residency.map((r) => r.id), field);
  }
});

test('per-user permissions follow the identity answer, never the checkbox', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const shared = bank.answers; // one shared service account
  // Ticking the control on a shared account must not lower any threat.
  const unticked = assess(shared, bank.controls);
  const ticked = assess(shared, [...bank.controls, 'per_user_identity']);
  assert.deepEqual(ticked.threats.map((t) => [t.id, t.residual]), unticked.threats.map((t) => [t.id, t.residual]));
  assert.ok(!ticked.controlsInPlace.includes('per_user_identity'));
  // Answering per-user on Architecture puts it in place without the checkbox, and it is no gap.
  const perUser = assess({ ...shared, identity: ['per_user'] }, bank.controls);
  assert.ok(perUser.controlsInPlace.includes('per_user_identity'));
  assert.ok(!perUser.gaps.some((g) => g.control.id === 'per_user_identity'));
  // Mixed identities score as the worst case: not in place.
  assert.ok(!effectiveControls({ identity: ['per_user', 'shared_service'] }, ['per_user_identity']).includes('per_user_identity'));
});

test('conditions name a derived control as an architecture change, not a box to tick', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const prv = assess(bank.answers, bank.controls).verdict.conditions.find((c) => c.startsWith('T-PRV-01'));
  assert.ok(prv.includes("Switch every tool to the requesting user's own delegated permissions (architecture change)"), prv);
  assert.ok(prv.includes('add Least-privilege tool permissions'), prv);
  assert.ok(!prv.includes("add Act with the requesting user's permissions"), prv);
});

test('path to Go offers per-user permissions as an architecture change', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const p = pathToGo(bank.answers, bank.controls);
  const step = p.steps.flatMap((s) => s.controls ?? []).find((c) => c.id === 'per_user_identity');
  assert.ok(step, 'bank path should include per-user permissions');
  assert.deepEqual(step.fix, { identity: ['per_user'] });
  assert.ok(step.change);
});

// A clinic appointments agent, as entered in a real assessment: health data marked Level 2.
const clinic = {
  sector: 'healthcare', jurisdictions: ['KW'], hosting: ['vendor_api'], hostingCountry: ['KW', 'SA', 'AE'],
  dataSensitivity: '2', dataTypes: ['health'], dataSources: ['crm', 'database'],
  actions: ['read_only', 'internal_ticket', 'send_external', 'write_records'], users: ['customers'],
  untrustedInputs: ['uploaded_files'], autonomy: 'approve_high_risk', identity: ['scoped_tool'],
  multiAgent: 'no', supplyChain: ['vendor_model'], memory: ['session'],
};

test('human approval follows the oversight answer, never the checkbox', () => {
  const auto = { ...clinic, autonomy: 'autonomous' };
  assert.ok(!assess(auto, ['human_approval']).controlsInPlace.includes('human_approval'));
  assert.ok(assess(clinic, []).controlsInPlace.includes('human_approval'));
  assert.ok(assess({ ...clinic, autonomy: 'suggest' }, []).controlsInPlace.includes('human_approval'));
  assert.deepEqual(applyDerivedFixes(auto, ['human_approval']).autonomy, 'approve_high_risk');
});

test('per-user permissions never count for anonymous public users', () => {
  const perUser = { ...clinic, identity: ['per_user'] };
  assert.ok(assess(perUser, []).controlsInPlace.includes('per_user_identity'));
  assert.ok(!assess({ ...perUser, users: ['customers', 'public'] }, []).controlsInPlace.includes('per_user_identity'));
});

test('personal, health, financial or credential data scores as at least Level 3', () => {
  const r = assess(clinic, []);
  assert.equal(r.blastRadius.components.data, 3);
  assert.ok(r.threats.some((t) => t.id === 'T-LEAK-01'), 'wrong-user disclosure is assessed');
  assert.deepEqual(r.dataLevel, { stated: 2, used: 3, raisedBy: ['health'] });
  assert.equal(assess({ ...clinic, dataTypes: ['none'] }, []).dataLevel, null);
  assert.equal(assess({ ...clinic, dataSensitivity: '4' }, []).blastRadius.components.data, 4);
});

test('a model vendor API counts as an outside component even if None was picked', () => {
  const none = { ...clinic, supplyChain: ['none'] };
  assert.deepEqual(normaliseAnswers(none).supplyChain, ['vendor_model']);
  assert.deepEqual(assess(none, []).residency.map((f) => f.id), assess(clinic, []).residency.map((f) => f.id));
});

test('controls that do not apply to the design are listed as such and count for nothing', () => {
  const all = controlsData.controls.map((c) => c.id);
  const r = assess(clinic, all);
  for (const id of ['sandboxed_execution', 'memory_hardening', 'content_provenance']) {
    assert.ok(r.notApplicable.includes(id), `${id} should not apply`);
    assert.ok(!r.controlsInPlace.includes(id), `${id} should not count`);
  }
  const without = assess(clinic, all.filter((c) => !r.notApplicable.includes(c)));
  assert.deepEqual(r.threats.map((t) => [t.id, t.residual]), without.threats.map((t) => [t.id, t.residual]));
  assert.ok(assess({ ...clinic, actions: [...clinic.actions, 'execute_code'] }, all).controlsInPlace.includes('sandboxed_execution'));
  // Nor is a control that doesn't apply ever recommended as a gap.
  assert.ok(!assess(clinic, []).gaps.some((g) => g.control.id === 'sandboxed_execution'));
});

test('path to Go shows one card when the Go route adds nothing to Go with conditions', () => {
  const all = controlsData.controls.map((c) => c.id).filter((c) => c !== 'untrusted_tool_restriction');
  const p = pathToGo(clinic, all);
  assert.equal(p.steps.length, 1);
  assert.equal(p.steps[0].target, 'go');
  assert.ok(p.architecture.some((a) => a.id === 'KW-01'));
});

test('every appliesWhen and setBy condition references real fields and options', () => {
  for (const c of controlsData.controls) {
    if (c.appliesWhen) checkCondition(c.appliesWhen, `${c.id}.appliesWhen`);
    assert.equal(Boolean(c.appliesWhen), Boolean(c.appliesNote), `${c.id}: appliesWhen and appliesNote go together`);
    if (c.setBy) {
      checkCondition({ field: c.setBy.field, in: c.setBy.only }, `${c.id}.setBy`);
      if (c.setBy.unless) checkCondition(c.setBy.unless, `${c.id}.setBy.unless`);
      [c.setBy.fix].flat().forEach((v) => assert.ok(c.setBy.only.includes(v), `${c.id}.setBy.fix ${v}`));
    }
  }
});

test('blast radius comes with a band and the single change that lowers it most', () => {
  const band = (id) => { const s = scenariosData.scenarios.find((x) => x.id === id); return assess(s.answers, s.controls).blastRadius; };
  assert.equal(band('hr-policy').band, 'Low');
  assert.equal(band('bank-cs').band, 'High');
  assert.equal(band('procurement').band, 'Severe');
  // Sends outside, approves high-risk only, internal data: 3 x 3 x 2 = 28.
  const tracker = { actions: ['read_only', 'send_external'], autonomy: 'approve_high_risk', dataSensitivity: '2', dataTypes: ['none'] };
  const b = assess(tracker, []).blastRadius;
  assert.equal(b.score, 28);
  assert.equal(b.band, 'Moderate');
  assert.ok(b.lever.score < b.score);
  // The biggest reduction: dropping the outbound action leaves read-only (28 -> 9), which beats
  // halving the data level (14) or approving every action (19).
  assert.equal(b.lever.score, 9);
  assert.ok(b.lever.change.includes('Send email or messages outside the organisation'));
  // With personal data the level is floored at 3, so the data lever is not "pick Level 2".
  const personal = assess({ ...tracker, dataTypes: ['personal'] }, []).blastRadius;
  assert.equal(personal.score, 42);
  assert.ok(!personal.lever.change.includes('Level'), personal.lever.change);
});

// An appointment tracker as entered in a real assessment: reads a mailbox, but "no outsider content".
const tracker = {
  sector: 'other', jurisdictions: ['KW'], hosting: ['vendor_api'], hostingCountry: ['KW'], dataSensitivity: '2',
  dataTypes: ['personal'], dataSources: ['crm', 'mailbox'], actions: ['read_only', 'internal_ticket', 'write_records', 'send_external'],
  users: ['customers'], untrustedInputs: ['none'], autonomy: 'approve_high_risk', identity: ['scoped_tool'],
  multiAgent: 'no', supplyChain: ['vendor_model'], memory: ['session'],
};

test('reading a mailbox counts as reading content outsiders wrote', () => {
  const r = assess(tracker, ['egress_restriction', 'audit_logging']);
  assert.ok(r.flags.untrustedContent);
  assert.equal(r.trifecta.status.startsWith('Blocked'), true, r.trifecta.status);
  assert.ok(r.adjustments.some((x) => x.includes('inbound email') && x.includes('Mailbox')), r.adjustments.join(' | '));
  assert.ok(r.adjustments.some((x) => x.startsWith('Data scored as Level 3')));
  assert.deepEqual(assess({ ...tracker, dataSources: ['crm'] }, []).adjustments.filter((x) => x.includes('Mailbox')), []);
});

test('a missing derived control is recommended as an architecture change everywhere', () => {
  const r = assess(tracker, []);
  const reg = riskRegister(tracker, [], r);
  const leak = reg.find((x) => x.id === 'T-LEAK-01');
  assert.ok(leak.treatment.includes("Switch every tool to the requesting user's own delegated permissions (architecture change)"), leak.treatment.join(' | '));
  assert.ok(!leak.treatment.includes("Act with the requesting user's permissions"));
});

test('the data lever reads as a limit, not a double negative', () => {
  const lever = assess({ ...tracker, dataTypes: ['none'], dataSources: ['crm'] }, []).blastRadius.lever;
  assert.equal(lever.change, 'limit the data it can reach to Level 1 or lower');
});

test('current vs target: the target is the furthest reachable path step, applied', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const t = pathTarget(bank.answers, bank.controls);
  assert.equal(t.label, 'Go');
  assert.equal(t.result.verdict.decision, 'go');
  assert.ok(t.result.trifecta.broken, 'the data-leak path is blocked in the target');
  assert.deepEqual(t.answers.hostingCountry, ['KW'], 'architecture fix applied');
  assert.deepEqual(t.answers.identity, ['per_user'], 'derived-control fix applied');
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  assert.equal(pathTarget(hr.answers, hr.controls), null, 'nothing to project for a Go design');
});

test('suggest-only oversight with actions beyond reading and drafting is read as approve-each', () => {
  const resume = { ...tracker, actions: ['read_only', 'internal_ticket', 'write_records'], autonomy: 'suggest' };
  assert.equal(normaliseAnswers(resume).autonomy, 'approve_each');
  assert.ok(assess(resume, []).adjustments.some((x) => x.startsWith('Oversight scored as')));
  const drafts = { ...resume, actions: ['read_only', 'internal_ticket'] };
  assert.equal(normaliseAnswers(drafts).autonomy, 'suggest');
  assert.deepEqual(assess(drafts, []).adjustments.filter((x) => x.startsWith('Oversight')), []);
});

test('a suggest-only agent that reads outsider content: people may act on its summary', () => {
  const cv = { ...tracker, autonomy: 'suggest', actions: ['read_only', 'internal_ticket'], untrustedInputs: ['uploaded_files'] };
  const r = assess(cv, ['approval_transparency']);
  assert.ok(r.threats.some((t) => t.id === 'T-TRU-01'), 'approval-fatigue threat applies');
  assert.ok(!r.notApplicable.includes('approval_transparency'), 'seeing the source counts');
  assert.ok(r.controlsInPlace.includes('approval_transparency'));
  // Suggest-only with nothing outsiders wrote: no summary to be manipulated, so neither applies.
  const internal = { ...cv, untrustedInputs: ['none'], dataSources: ['crm'] };
  const q = assess(internal, ['approval_transparency']);
  assert.ok(!q.threats.some((t) => t.id === 'T-TRU-01'));
  assert.ok(q.notApplicable.includes('approval_transparency'));
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
      const all = [...s.controls, ...step.controls.map((c) => c.id)];
      const r = assess(applyDerivedFixes(fixed, all), all, { waiveResidency: step.approvals.map((a) => a.id) });
      const rank = { not_yet: 0, go_with_conditions: 1, go: 2 };
      assert.ok(rank[r.verdict.decision] >= rank[step.target], `${s.id} -> ${step.target}`);
    }
  }
});

test('path to Go: bank needs in-country inference and CBK approval', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const p = pathToGo(bank.answers, bank.controls);
  assert.deepEqual(p.architecture.map((a) => a.id), ['KW-01']);
  assert.deepEqual(p.approvals.map((a) => a.id).sort(), ['KW-05', 'KW-06']);
});

test('risk register: one row per threat, AI RMF refs come only from the threat controls', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const result = assess(bank.answers, bank.controls);
  const rows = riskRegister(bank.answers, bank.controls, result);
  assert.equal(rows.length, result.threats.length);
  const byId = Object.fromEntries(controlsData.controls.map((c) => [c.id, c]));
  for (const t of result.threats) {
    const expected = new Set([...t.controlsPresent, ...t.controlsMissing].flatMap((c) => byId[c].aiRmf));
    assert.deepEqual(new Set(rows.find((r) => r.id === t.id).aiRmf), expected, t.id);
  }
});

test('AI RMF coverage differs by design and tracks controls in place', () => {
  const [bank, hr] = ['bank-cs', 'hr-policy'].map((id) => scenariosData.scenarios.find((s) => s.id === id));
  const covBank = rmfCoverage(assess(bank.answers, bank.controls));
  const covHr = rmfCoverage(assess(hr.answers, hr.controls));
  assert.notDeepEqual(covBank.map((r) => r.id), covHr.map((r) => r.id));
  // Adding a control moves its subcategories toward Addressed, never away.
  const before = Object.fromEntries(covBank.map((r) => [r.id, r.status]));
  const after = rmfCoverage(assess(bank.answers, [...bank.controls, 'egress_restriction']));
  const rank = { Gap: 0, Partial: 1, Addressed: 2 };
  for (const r of after) if (before[r.id]) assert.ok(rank[r.status] >= rank[before[r.id]], r.id);
  assert.ok(covBank.every((r) => r.status !== 'Addressed' || r.missing.length === 0));
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

test('CBK cloud outsourcing (CORF 7.2.1.3): public/hybrid cloud with sensitive data only', () => {
  const bank = { sector: 'banking', jurisdictions: ['KW'], hostingCountry: ['KW'], dataSensitivity: '3', dataTypes: ['financial'] };
  const fired = (over) => assess({ ...bank, ...over }, []).residency.some((f) => f.id === 'KW-05');
  assert.equal(fired({ hosting: ['vendor_api'] }), true);
  assert.equal(fired({ hosting: ['hybrid_cloud'] }), true);
  assert.equal(fired({ hosting: ['private_cloud'] }), false, 'CORF 7.2 scope excludes private cloud');
  assert.equal(fired({ hosting: ['on_prem'] }), false);
  assert.equal(fired({ hosting: ['vendor_api'], dataSensitivity: '2', dataTypes: ['none'] }), false, 'no sensitive data');
});

test('CBK AI approval (CORF 7.1.1.2) applies to every Kuwaiti bank deployment, wherever hosted', () => {
  for (const hosting of [['on_prem'], ['private_cloud'], ['vendor_api']]) {
    const r = assess({ sector: 'banking', jurisdictions: ['KW'], hosting, hostingCountry: ['KW'], dataSensitivity: '1' }, []);
    assert.ok(r.residency.some((f) => f.id === 'KW-06' && f.severity === 3), hosting[0]);
  }
  const nonBank = assess({ sector: 'retail', jurisdictions: ['KW'], hosting: ['on_prem'], hostingCountry: ['KW'] }, []);
  assert.ok(!nonBank.residency.some((f) => f.id === 'KW-06'));
});

test('trifecta names what breaks it in plain words', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const t = assess(bank.answers, [...bank.controls, 'untrusted_tool_restriction']).trifecta;
  assert.deepEqual(t.breakerLabels, ['Restrict tool use after reading untrusted content']);
  assert.ok(t.breakerLabels.every((l) => !l.includes('_')), 'no raw ids');
});

test('path to Go is cumulative: the Go route contains the Go-with-conditions route', () => {
  for (const s of scenariosData.scenarios) {
    const steps = pathToGo(s.answers, s.controls).steps.filter((x) => x.controls);
    if (steps.length < 2) continue;
    const [first, second] = steps.map((x) => x.controls.map((c) => c.id));
    assert.ok(first.every((c) => second.includes(c)), `${s.id}: Go route drops ${first.filter((c) => !second.includes(c))}`);
    assert.deepEqual(second.slice(0, first.length), first, `${s.id}: stage-1 controls come first`);
  }
});

test('every trifecta status comes with its explanation, definition and source', () => {
  const bank = scenariosData.scenarios.find((s) => s.id === 'bank-cs');
  const hr = scenariosData.scenarios.find((s) => s.id === 'hr-policy');
  const seen = [
    assess(bank.answers, bank.controls).trifecta,
    assess(bank.answers, [...bank.controls, 'egress_restriction']).trifecta,
    assess(hr.answers, hr.controls).trifecta,
  ];
  assert.deepEqual(seen.map((t) => t.status), ['Open — data can leak', 'Blocked', 'Not present']);
  for (const t of seen) {
    assert.match(t.explanation, /^[A-Z]/, t.status);
    assert.match(t.definition, /private data/);
    assert.match(t.reference, /Willison/);
  }
});

test('code execution is a way out (DNS); a no-network sandbox closes only that route', () => {
  const base = { dataSensitivity: '3', dataTypes: ['personal'], untrustedInputs: ['inbound_email'], autonomy: 'autonomous' };
  const tri = (actions, controls = []) => assess({ ...base, actions }, controls).trifecta;
  assert.equal(tri(['read_only']).present, false, 'no way out');
  assert.equal(tri(['execute_code']).status, 'Open — data can leak');
  assert.equal(tri(['execute_code'], ['sandboxed_execution']).status, 'Blocked');
  assert.deepEqual(tri(['execute_code'], ['sandboxed_execution']).breakerLabels, ['Sandboxed code execution']);
  assert.equal(tri(['execute_code', 'send_external'], ['sandboxed_execution']).status, 'Open — data can leak', 'email still open');
  assert.equal(tri(['network_other']).status, 'Open — data can leak', 'DNS / other network access');
  assert.equal(tri(['network_other'], ['egress_restriction']).status, 'Blocked');
});

test('a blocked leak path is not contradicted by a Critical exfiltration threat', () => {
  const a = { dataSensitivity: '3', dataTypes: ['personal'], untrustedInputs: ['inbound_email'], autonomy: 'autonomous', actions: ['execute_code'] };
  const r = assess(a, ['sandboxed_execution']);
  assert.equal(r.trifecta.status, 'Blocked');
  assert.notEqual(r.threats.find((t) => t.id === 'T-EXF-01').priority, 'Critical');
});
