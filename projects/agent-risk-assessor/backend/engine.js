// Deterministic assessment engine. Same answers + controls always give the same report.
// No AI here — Claude only writes the narrative, after this has run.
import { readFileSync } from 'node:fs';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./data/${name}.json`, import.meta.url), 'utf8'));

export const inputs = load('inputs');
export const controlsData = load('controls');
export const threatsData = load('threats');
export const residencyData = load('residency');
export const scenariosData = load('scenarios');
export const aiRmf = load('ai-rmf');

const inputIndex = Object.fromEntries(
  inputs.sections.flatMap((s) => s.inputs).map((i) => [i.id, i])
);
const controlIndex = Object.fromEntries(controlsData.controls.map((c) => [c.id, c]));

const HIGH_IMPACT = ['write_records', 'send_external', 'http_requests', 'network_other', 'delete', 'execute_code', 'financial', 'modify_permissions'];
// Ways data can leave. Code execution counts: running code can reach the network, and DNS lookups
// alone can carry data out, unless the code runs in a sandbox with no network.
const EXTERNAL_ACTIONS = ['send_external', 'http_requests', 'network_other', 'execute_code'];
const SENSITIVE_TYPES = ['personal', 'financial', 'health', 'government', 'credentials', 'source_code'];
const PERSONAL_TYPES = ['personal', 'financial', 'health'];

export const PRIORITY = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low' };

const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const intersects = (a, b) => asList(a).some((x) => b.includes(x));

// Answers that contradict each other are resolved towards the riskier reading before scoring:
// - personal, health, financial, or credential data is at least Level 3, whatever level was picked;
// - a model vendor's API is a component from outside the organisation, even if "None" was picked.
const LEVEL_FLOOR_TYPES = ['personal', 'health', 'financial', 'credentials'];
export function normaliseAnswers(answers) {
  const a = { ...(answers ?? {}) };
  const raisedBy = asList(a.dataTypes).filter((t) => LEVEL_FLOOR_TYPES.includes(t));
  const stated = Number(a.dataSensitivity) || 0;
  if (raisedBy.length && stated > 0 && stated < 3) a.dataSensitivity = '3';
  if (asList(a.hosting).includes('vendor_api') && !asList(a.supplyChain).includes('vendor_model'))
    a.supplyChain = [...asList(a.supplyChain).filter((v) => v !== 'none'), 'vendor_model'];
  return a;
}
export function dataLevelNote(answers) {
  const raisedBy = asList(answers?.dataTypes).filter((t) => LEVEL_FLOOR_TYPES.includes(t));
  const stated = Number(answers?.dataSensitivity) || 0;
  return raisedBy.length && stated > 0 && stated < 3 ? { stated, used: 3, raisedBy } : null;
}

// Some controls restate an Architecture answer (a control with `setBy`). Their state comes only
// from that answer, never from the checkbox, so the two can't contradict each other: "act with the
// requesting user's permissions" is in place only when every identity the agent uses is per-user.
const DERIVED = controlsData.controls.filter((c) => c.setBy);
const derivedHolds = (c, a) => {
  const v = asList(a[c.setBy.field]);
  if (c.setBy.unless && evaluate(c.setBy.unless, a, {})) return false;
  return v.length > 0 && v.every((x) => c.setBy.only.includes(x));
};
// Controls with `appliesWhen` only make sense for some designs (a code sandbox needs code
// execution). Ticked when they don't apply, they are listed as not applicable and count for nothing.
const appliesTo = (c, a) => !c.appliesWhen || evaluate(c.appliesWhen, a, {});
export function notApplicableControls(answers, controls = []) {
  const a = normaliseAnswers(answers);
  return controls.filter((id) => controlIndex[id] && !controlIndex[id].setBy && !appliesTo(controlIndex[id], a));
}
export function effectiveControls(answers, controls = []) {
  const a = normaliseAnswers(answers);
  const na = new Set(notApplicableControls(a, controls));
  const kept = controls.filter((id) => !DERIVED.some((c) => c.id === id) && !na.has(id));
  return [...new Set([...kept, ...DERIVED.filter((c) => derivedHolds(c, a)).map((c) => c.id)])];
}
// Adding a derived control in a Path-to-Go combo means changing the answer it is derived from.
export function applyDerivedFixes(answers, controls = []) {
  const out = { ...answers };
  for (const c of DERIVED) if (controls.includes(c.id)) out[c.setBy.field] = c.setBy.fix;
  return out;
}

// Highest scale among the selected values, so a multi-select answer scores as its worst case.
function scaleOf(fieldId, value) {
  const opts = inputIndex[fieldId]?.options ?? [];
  return Math.max(0, ...asList(value).map((v) => opts.find((o) => o.value === v)?.scale ?? 0));
}

export function deriveFlags(a) {
  const untrusted = asList(a.untrustedInputs).filter((v) => v !== 'none');
  const untrustedContent = untrusted.length > 0;
  const sensitiveData =
    scaleOf('dataSensitivity', a.dataSensitivity) >= 3 || intersects(a.dataTypes, SENSITIVE_TYPES);
  const personalData = intersects(a.dataTypes, PERSONAL_TYPES);
  // Browsing counts as an outbound channel: fetching an attacker's URL can carry data in it.
  const externalChannel =
    intersects(a.actions, EXTERNAL_ACTIONS) ||
    untrusted.includes('web_browsing') ||
    asList(a.dataSources).includes('web');
  const highImpactAction = intersects(a.actions, HIGH_IMPACT);
  const attackerInput = untrustedContent || asList(a.users).includes('public');
  return {
    untrustedContent,
    sensitiveData,
    personalData,
    externalChannel,
    highImpactAction,
    trifecta: sensitiveData && attackerInput && externalChannel,
  };
}

export function evaluate(cond, a, flags) {
  if (cond.all) return cond.all.every((c) => evaluate(c, a, flags));
  if (cond.any) return cond.any.some((c) => evaluate(c, a, flags));
  if (cond.flag) return Boolean(flags[cond.flag]);
  const v = a[cond.field];
  if (cond.in) return intersects(v, cond.in);
  if (cond.notIn) return asList(v).length > 0 && !intersects(v, cond.notIn);
  // True if any selected value falls outside the list — e.g. any inference country outside the jurisdiction.
  if (cond.anyNotIn) return asList(v).some((x) => !cond.anyNotIn.includes(x));
  if (cond.gte != null) return scaleOf(cond.field, v) >= cond.gte;
  throw new Error(`Unknown condition: ${JSON.stringify(cond)}`);
}

// Which inputs made a condition true — shown next to each threat so the PE can defend it.
function triggers(cond, a, flags, out = []) {
  if (cond.all || cond.any) {
    for (const c of cond.all ?? cond.any) if (evaluate(c, a, flags)) triggers(c, a, flags, out);
    return out;
  }
  if (cond.flag) out.push({ flag: cond.flag });
  else {
    const hits = cond.in ? asList(a[cond.field]).filter((x) => cond.in.includes(x))
      : cond.anyNotIn ? asList(a[cond.field]).filter((x) => !cond.anyNotIn.includes(x))
      : asList(a[cond.field]);
    out.push({ field: cond.field, label: inputIndex[cond.field]?.label, values: hits });
  }
  return out;
}

function trifectaStatus(a, flags, has) {
  const legs = {
    privateData: flags.sensitiveData,
    untrustedContent: flags.untrustedContent || asList(a.users).includes('public'),
    externalChannel: flags.externalChannel,
  };
  // Controls that block every way out at once.
  const breakers = [];
  if (has('egress_restriction')) breakers.push('egress_restriction');
  if (has('untrusted_tool_restriction')) breakers.push('untrusted_tool_restriction');
  if (a.autonomy === 'suggest') breakers.push('autonomy:suggest');
  if (a.autonomy === 'approve_each' && has('approval_transparency')) breakers.push('autonomy:approve_each+approval_transparency');
  // Otherwise the path is blocked only if every open way out is individually closed. A no-network
  // sandbox closes the code-execution route, but not email or web requests.
  const actions = asList(a.actions);
  const routes = [
    ...actions.filter((x) => EXTERNAL_ACTIONS.includes(x)),
    ...(asList(a.untrustedInputs).includes('web_browsing') || asList(a.dataSources).includes('web') ? ['web'] : []),
  ];
  const ROUTE_BLOCKERS = { execute_code: 'sandboxed_execution' };
  const openRoutes = routes.filter((r) => !(ROUTE_BLOCKERS[r] && has(ROUTE_BLOCKERS[r])));
  if (!breakers.length && routes.length && !openRoutes.length)
    routes.forEach((r) => breakers.push(ROUTE_BLOCKERS[r]));
  const BREAKER_LABELS = {
    'autonomy:suggest': 'Suggest-only autonomy (a human takes every action)',
    'autonomy:approve_each+approval_transparency': 'Human approval of every action, showing the raw action',
  };
  const breakerLabels = breakers.map((b) => BREAKER_LABELS[b] ?? controlIndex[b]?.title ?? b);
  const broken = flags.trifecta && breakers.length > 0;
  // Named for what the reader should conclude: "Unbroken" read as reassuring to non-specialists.
  const status = !flags.trifecta ? 'Not present' : broken ? 'Blocked' : 'Open — data can leak';
  return {
    present: flags.trifecta, legs, broken, breakers, breakerLabels, status,
    explanation: TRIFECTA_TEXT.status[status], definition: TRIFECTA_TEXT.definition, reference: TRIFECTA_TEXT.reference,
  };
}

// Single source for how the web page and the PDF explain the term. "Lethal trifecta" is an AI
// security term, not a regulatory one, so it is always shown with this explanation beside it.
export const TRIFECTA_TEXT = {
  definition: 'Lethal trifecta: an agent that can read private data, reads content outsiders can write, and can send data out. With all three, one instruction hidden in that content can make it leak the data.',
  status: {
    'Open — data can leak': 'All three are present and nothing blocks the path, so the agent can be made to leak data.',
    Blocked: 'All three are present, but a control blocks the path from untrusted content to sending data out.',
    'Not present': 'The agent lacks at least one of the three, so this leak path does not exist.',
  },
  reference: "Term coined by Simon Willison (2025); Meta's “Agents Rule of Two” states the same rule. Maps to OWASP LLM01, LLM02, ASI01 and MITRE ATLAS AML.T0086.",
};

// Bands on the product of the three 1–4 scales (max 64). This tool's judgement: Low when no factor is
// above 2 on average, Severe only when two factors are at their maximum and the third at 3 or more.
const BLAST_BANDS = [[8, 'Low'], [27, 'Moderate'], [47, 'High'], [64, 'Severe']];
const toScore = (p) => Math.round((p / 64) * 100);
const optionLabel = (fieldId, v) => inputIndex[fieldId]?.options?.find((o) => o.value === v)?.label ?? v;

function blastRadius(a) {
  const action = Math.max(1, ...asList(a.actions).map((v) => scaleOf('actions', v)));
  const autonomy = scaleOf('autonomy', a.autonomy) || 1;
  const data = scaleOf('dataSensitivity', a.dataSensitivity) || 1;
  const product = action * autonomy * data;
  const band = BLAST_BANDS.find(([max]) => product <= max)[1];

  // The one answer change that lowers the score most, so the number comes with a next step.
  const levers = [];
  if (autonomy > 1) {
    const stricter = inputIndex.autonomy.options.find((o) => o.scale === autonomy - 1);
    levers.push({ change: `change oversight to "${stricter.label}"`, score: toScore(action * (autonomy - 1) * data) });
  }
  if (action > 1) {
    const top = asList(a.actions).filter((v) => scaleOf('actions', v) === action);
    const rest = Math.max(1, ...asList(a.actions).filter((v) => !top.includes(v)).map((v) => scaleOf('actions', v)));
    levers.push({ change: `remove ${top.map((v) => `"${optionLabel('actions', v)}"`).join(' and ')}`, score: toScore(rest * autonomy * data) });
  }
  // Personal, health, financial, or credential data is floored at Level 3, so below that the data
  // lever is keeping those data types out of reach rather than picking a lower level.
  const floored = intersects(a.dataTypes, LEVEL_FLOOR_TYPES);
  if (data > 1 && !(floored && data === 3)) {
    const lower = inputIndex.dataSensitivity.options.find((o) => o.scale === data - 1);
    levers.push({ change: `keep data above "${lower.label}" out of its reach`, score: toScore(action * autonomy * (data - 1)) });
  }
  const lever = levers.sort((x, y) => x.score - y.score)[0] ?? null;

  return {
    score: toScore(product),
    band,
    components: { action, autonomy, data },
    lever,
  };
}

// opts.waiveResidency: residency finding ids treated as already satisfied (used by pathToGo
// for approval-type findings that no control can close).
export function assess(answers, controlsInPlace = [], opts = {}) {
  const a = normaliseAnswers(answers);
  const effective = effectiveControls(a, controlsInPlace);
  const inPlace = new Set(effective);
  const has = (id) => inPlace.has(id);
  const flags = deriveFlags(a);

  const threats = threatsData.threats
    .filter((t) => evaluate(t.when, a, flags))
    .map((t) => {
      // A control that doesn't fit this design (no code execution, so no sandbox) is neither in
      // place nor recommended for it.
      const applicable = t.mitigatedBy.filter((c) => appliesTo(controlIndex[c], a));
      const present = applicable.filter(has);
      const missing = applicable.filter((c) => !has(c));
      const residual = Math.max(1, t.severity - present.length);
      return {
        id: t.id, title: t.title, description: t.description,
        severity: t.severity, residual, priority: PRIORITY[residual],
        owaspLlm: t.owaspLlm, owaspAgentic: t.owaspAgentic, atlas: t.atlas,
        triggeredBy: triggers(t.when, a, flags),
        controlsPresent: present, controlsMissing: missing,
      };
    })
    .sort((x, y) => y.residual - x.residual || y.severity - x.severity);

  // A missing control's priority is the highest residual risk it would reduce.
  const gapMap = new Map();
  for (const t of threats) {
    if (t.residual <= 1) continue;
    for (const c of t.controlsMissing) {
      const g = gapMap.get(c) ?? { control: controlIndex[c], threats: [], priorityScore: 0 };
      g.threats.push(t.id);
      g.priorityScore = Math.max(g.priorityScore, t.residual);
      gapMap.set(c, g);
    }
  }
  const gaps = [...gapMap.values()]
    .map((g) => ({ ...g, priority: PRIORITY[g.priorityScore] }))
    .sort((x, y) => y.priorityScore - x.priorityScore || y.threats.length - x.threats.length);

  const residency = residencyData.rules
    .filter((r) => evaluate(r.when, a, flags))
    .map((r) => ({
      id: r.id, jurisdiction: r.jurisdiction, title: r.title,
      severity: r.severity, level: residencyData.severityScale[r.severity],
      finding: r.finding, remediation: r.remediation, sources: r.sources,
    }))
    .sort((x, y) => y.severity - x.severity);

  const trifecta = trifectaStatus(a, flags, has);
  const waived = new Set(opts.waiveResidency ?? []);
  const verdict = decideVerdict({ threats, residency: residency.filter((r) => !waived.has(r.id)), trifecta, has, a });

  return {
    verdict, trifecta, blastRadius: blastRadius(a), flags,
    threats, gaps, residency, controlsInPlace: effective,
    notApplicable: notApplicableControls(a, controlsInPlace),
    dataLevel: dataLevelNote(answers),
    pendingInstruments: residencyData.pending.filter(
      (p) => p.jurisdiction === '*' || asList(a.jurisdictions).includes(p.jurisdiction)
    ),
  };
}

const RANK = { not_yet: 0, go_with_conditions: 1, go: 2 };
const EXACT_SEARCH_SIZE = 4;

// Fewest missing controls that lift the verdict one level, and a path to Go.
// Exact search over small combinations first; a greedy search takes over for longer paths.
export function pathToGo(answers, controlsGiven = []) {
  const controlsInPlace = effectiveControls(answers, controlsGiven);
  const base = assess(answers, controlsInPlace);
  const current = base.verdict.decision;
  if (current === 'go') return { current, architecture: [], approvals: [], steps: [] };

  const rules = Object.fromEntries(residencyData.rules.map((r) => [r.id, r]));

  // Residency Criticals are architecture decisions, not controls. Apply each rule's fix
  // hypothetically, then search controls against the changed design.
  const criticals = base.residency.filter((r) => r.severity === 4);
  const architecture = criticals.map((r) => ({
    id: r.id, title: r.title, change: rules[r.id].architectureFix?.label ?? r.remediation,
    fixable: Boolean(rules[r.id].architectureFix),
    fix: (({ label, ...fields }) => fields)(rules[r.id].architectureFix ?? {}),
  }));
  const fixes = criticals
    .map((r) => rules[r.id].architectureFix ?? {})
    .reduce((acc, { label, ...fields }) => ({ ...acc, ...fields }), {});
  const design = { ...answers, ...fixes };

  // High residency findings are closed by approvals or paperwork. They cap the verdict at
  // "Go with conditions" until done; for the Go target they're assumed done and listed.
  const approvals = assess(design, controlsInPlace).residency
    .filter((r) => r.severity === 3)
    .map((r) => ({ id: r.id, title: r.title, action: r.remediation }));
  const waiveFor = { go_with_conditions: [], go: approvals.map((a) => a.id) };

  // human_approval is always a candidate: a fully autonomous agent needs it for Go even when no
  // triggered threat lists it.
  const candidates = new Set(['audit_logging', 'egress_restriction', 'untrusted_tool_restriction', 'human_approval']);
  for (const t of assess(design, controlsInPlace).threats) t.controlsMissing.forEach((c) => candidates.add(c));
  const pool = [...candidates].filter((c) => !controlsInPlace.includes(c));

  const reaches = (base, combo, target) => {
    const all = [...base, ...combo];
    return RANK[assess(applyDerivedFixes(design, all), all, { waiveResidency: waiveFor[target] }).verdict.decision] >= RANK[target];
  };
  // A derived control is reached by changing its Architecture answer, so it carries that change.
  const describe = (id, fromPrevious) => ({
    id, title: controlIndex[id].title, timeline: controlIndex[id].timeline, fromPrevious,
    ...(controlIndex[id].setBy && { change: controlIndex[id].setBy.change, fix: applyDerivedFixes({}, [id]) }),
  });

  // The steps are cumulative: the Go route starts from the Go-with-conditions route and adds to it,
  // so the plan reads as stage 1 then stage 2 rather than two unrelated control sets.
  const targets = ['go_with_conditions', 'go'].filter((t) => RANK[t] > RANK[current]);
  let carried = [];
  const steps = targets.map((target) => {
    const base = [...controlsInPlace, ...carried];
    const rest = pool.filter((c) => !carried.includes(c));
    const extra = exactSearch(rest, (c) => reaches(base, c, target))
      ?? greedySearch(rest, design, base, waiveFor[target], (c) => reaches(base, c, target));
    const combo = extra ? [...carried, ...extra] : null;
    const step = {
      target,
      label: target === 'go' ? 'Go' : 'Go with conditions',
      controls: combo?.map((id) => describe(id, carried.includes(id))) ?? null,
      approvals: target === 'go' ? approvals : [],
      reachable: Boolean(combo) && architecture.every((a) => a.fixable),
    };
    if (combo) carried = combo;
    return step;
  });
  // If the Go route adds nothing to the Go-with-conditions route (no controls, no approvals),
  // the two cards would be identical: show only Go, with its controls as its own.
  const [cond, go] = steps;
  if (steps.length === 2 && cond.controls && go.controls && !go.approvals.length
      && go.controls.every((c) => c.fromPrevious)) {
    return { current, architecture, approvals, steps: [{ ...go, controls: go.controls.map((c) => ({ ...c, fromPrevious: false })) }] };
  }
  return { current, architecture, approvals, steps };
}

function exactSearch(pool, ok) {
  if (ok([])) return [];
  for (let size = 1; size <= Math.min(EXACT_SEARCH_SIZE, pool.length); size++)
    for (const combo of combinations(pool, size)) if (ok(combo)) return combo;
  return null;
}

// Add whichever control most improves the result, then drop any that turn out redundant.
function greedySearch(pool, design, inPlace, waive, ok) {
  const score = (combo) => {
    const all = [...inPlace, ...combo];
    const r = assess(applyDerivedFixes(design, all), all, { waiveResidency: waive });
    const residual = r.threats.reduce((n, t) => n + t.residual, 0);
    return RANK[r.verdict.decision] * 1000 - residual + (r.trifecta.present && !r.trifecta.broken ? -500 : 0);
  };
  const chosen = [];
  const remaining = [...pool];
  while (!ok(chosen) && remaining.length) {
    let best = 0;
    remaining.forEach((c, i) => { if (score([...chosen, c]) > score([...chosen, remaining[best]])) best = i; });
    chosen.push(remaining.splice(best, 1)[0]);
  }
  if (!ok(chosen)) return null;
  for (const c of [...chosen]) {
    const without = chosen.filter((x) => x !== c);
    if (ok(without)) chosen.splice(chosen.indexOf(c), 1);
  }
  return chosen;
}

function* combinations(items, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < items.length; i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

// Governance-ready risk register: one row per triggered threat, with NIST AI RMF references.
export function riskRegister(answers, controlsInPlace = [], result = assess(answers, controlsInPlace)) {
  const rmf = (ids) => [...new Set(ids.flatMap((id) => controlIndex[id]?.aiRmf ?? []))];
  return result.threats.map((t) => ({
    id: t.id,
    risk: t.title,
    description: t.description,
    inherent: PRIORITY[t.severity],
    residual: t.priority,
    controlsInPlace: t.controlsPresent.map((c) => controlIndex[c].title),
    treatment: t.controlsMissing.map((c) => controlIndex[c].title),
    owaspLlm: t.owaspLlm,
    owaspAgentic: t.owaspAgentic,
    atlas: t.atlas,
    aiRmf: rmf([...t.controlsPresent, ...t.controlsMissing]),
  }));
}

// NIST AI RMF coverage for this assessment: for every subcategory the triggered threats' controls
// map to, which controls are in place and which are missing. Changes with every design.
export function rmfCoverage(result) {
  const bySub = new Map();
  for (const t of result.threats) {
    for (const [ids, present] of [[t.controlsPresent, true], [t.controlsMissing, false]]) {
      for (const c of ids) {
        for (const sub of controlIndex[c]?.aiRmf ?? []) {
          const row = bySub.get(sub) ?? { id: sub, text: aiRmf.subcategories[sub], risks: new Set(), inPlace: new Set(), missing: new Set() };
          row.risks.add(t.id);
          (present ? row.inPlace : row.missing).add(c);
          bySub.set(sub, row);
        }
      }
    }
  }
  const ORDER = { Gap: 0, Partial: 1, Addressed: 2 };
  return [...bySub.values()]
    .map((r) => ({
      id: r.id, text: r.text, risks: [...r.risks],
      inPlace: [...r.inPlace].map((c) => controlIndex[c].title),
      missing: [...r.missing].filter((c) => !r.inPlace.has(c)).map((c) => controlIndex[c].title),
      status: r.inPlace.size === 0 ? 'Gap' : [...r.missing].some((c) => !r.inPlace.has(c)) ? 'Partial' : 'Addressed',
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.risks.length - a.risks.length || a.id.localeCompare(b.id));
}


// A control derived from an Architecture answer is reached by changing the answer, so name the change.
const fixLabel = (id) => {
  const c = controlIndex[id];
  return c.setBy ? `${c.setBy.change} (architecture change)` : `add ${c.title}`;
};

function decideVerdict({ threats, residency, trifecta, has, a }) {
  const blockers = [];
  const conditions = [];

  if (trifecta.present && !trifecta.broken)
    blockers.push('Open data-leak path: the agent reads private data and outsider-written content and can send data out, and nothing blocks the path.');
  for (const t of threats.filter((t) => t.residual === 4))
    blockers.push(`${t.id} ${t.title} — residual Critical.`);
  for (const r of residency.filter((r) => r.severity === 4))
    blockers.push(`${r.id} ${r.title}.`);

  for (const t of threats.filter((t) => t.residual === 3))
    conditions.push(`${t.id} ${t.title}: do one of — ${t.controlsMissing.map(fixLabel).join('; ')}.`);
  for (const r of residency.filter((r) => r.severity === 3))
    conditions.push(`${r.id} ${r.title}: ${r.remediation}`);
  if (!has('audit_logging'))
    conditions.push('Per-action audit logging is required before any agent goes live.');
  // Per-threat scoring can let a fully autonomous agent reach Go once each threat is mitigated;
  // a risk committee still expects a human in the loop for high-impact actions.
  // human_approval follows the oversight answer, so for a fully autonomous agent it is never in place.
  if (a.autonomy === 'autonomous' && intersects(a.actions, HIGH_IMPACT))
    conditions.push('Fully autonomous with high-impact actions: require a person to approve high-risk actions (Human approval for high-impact actions).');

  const decision = blockers.length ? 'not_yet' : conditions.length ? 'go_with_conditions' : 'go';
  const label = { not_yet: 'Not yet', go_with_conditions: 'Go with conditions', go: 'Go' }[decision];
  return { decision, label, blockers, conditions };
}
