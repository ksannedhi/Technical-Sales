// The only Claude call in the tool: a plain-language brief for the risk committee.
// Everything it says comes from the deterministic assessment passed in — it adds no findings.
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

// USD per million tokens (input, output), for the usage log only. [model-behavior · 2026-10]
const PRICES = {
  'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5': [1, 5],
};
const KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const client = KEY && KEY !== 'your_key_here' ? new Anthropic({ apiKey: KEY }) : null;

if (client) console.log(`[agent-risk] Claude client ready — model: ${MODEL}`);
else console.warn('[agent-risk] ANTHROPIC_API_KEY missing or placeholder — risk-committee brief disabled');

export const narrativeEnabled = () => Boolean(client);

const SYSTEM = `You write risk-committee briefs about AI agent deployments for boards and risk committees in regulated Gulf organisations.
Write for non-technical senior readers who must decide whether to accept the risk, and who will skim.
Use only the facts in the assessment you are given. Do not add threats, controls, regulations, numbers, or governance steps (such as formal risk acceptance or naming an owner) that are not in it.
Regulatory findings state what is required, not what is missing: write "requires" or "must", never claim an approval, basis, or assessment is absent unless the assessment says so.
Short sentences. Plain business language; name a regulation only where the assessment does, and keep its clause numbers out.`;

// Structured so the UI and PDF can lay it out for skimming: decision first, then reasons, then actions.
const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', description: 'One or two sentences: what the agent does, the verdict, and the single main reason.' },
    reasons: {
      type: 'array',
      description: 'Two to four issues that drive the verdict, most serious first.',
      items: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'The issue in at most eight words.' },
          detail: { type: 'string', description: 'One or two short sentences on the business consequence.' },
        },
        required: ['headline', 'detail'],
        additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      description: 'Actions taken only from the assessment, in order. For Not yet or Go with conditions: what must happen before go-live (blockers, conditions, approvals). For Go: the advisory checks to confirm, then the recommended controls, never described as required. One action per item, imperative, one sentence each. At most five.',
      items: { type: 'string' },
    },
  },
  required: ['decision', 'reasons', 'actions'],
  additionalProperties: false,
};

function summarise(profile, result, path) {
  const lines = [
    `Organisation: ${profile.orgName || 'not stated'} (${profile.sector || 'sector not stated'})`,
    `Agent: ${profile.agentName || 'unnamed'} — ${profile.purpose || 'purpose not stated'}`,
    `Verdict: ${result.verdict.label}`,
    `Blast radius: ${result.blastRadius.score}/100`,
    `Data-leak path (the agent reads private data and outsider-written content and can send data out): ${
      result.trifecta.present ? (result.trifecta.broken ? 'present but blocked by a control' : 'open, nothing blocks it') : 'not present'
    }`,
    'Blockers:', ...result.verdict.blockers.map((b) => `- ${b}`),
    'Go-live conditions:', ...result.verdict.conditions.map((c) => `- ${c}`),
    'Top threats (residual):', ...result.threats.slice(0, 6).map((t) => `- ${t.title}: ${t.priority}`),
    'Regulatory findings:', ...result.residency.filter((r) => r.severity >= 3).map((r) => `- ${r.title} (${r.level}): ${r.finding}`),
    'Advisory checks (confirm before go-live):', ...result.residency.filter((r) => r.severity < 3).map((r) => `- ${r.title}: ${r.remediation}`),
    'Recommended controls (reduce the remaining risks; not required for this verdict unless listed above):',
    ...result.gaps.slice(0, 3).map((g) => `- ${g.control.setBy ? `${g.control.setBy.change} (architecture change)` : g.control.title} (${g.priority})`),
  ];
  if (path?.steps?.length) {
    lines.push('Path forward:');
    for (const a of path.architecture ?? []) lines.push(`- Architecture change: ${a.change}`);
    for (const s of path.steps)
      lines.push(`- To reach ${s.label}: ${s.controls ? s.controls.map((c) => (c.change ? `${c.change} (architecture change)` : c.title)).join('; ') : 'not reachable with controls alone'}`
        + (s.approvals?.length ? ` — plus approvals: ${s.approvals.map((a) => a.title).join('; ')}` : ''));
  }
  return lines.join('\n');
}

// The same assessment always gets the same brief, so it is written once and reused: going back to
// the actual design, revisiting Results, or refreshing must not pay for it again. Keyed by the exact
// prompt and model; concurrent requests for the same key share one call.
const cache = new Map();
const pending = new Map();
const CACHE_MAX = 200;
const totals = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
export const briefStats = () => ({ ...totals, usd: Number(totals.usd.toFixed(4)) });

export async function writeBrief(profile, result, path) {
  if (!client) return { brief: null };
  const prompt = buildPrompt(profile, result, path);
  const key = createHash('sha256').update(`${MODEL}\n${prompt}`).digest('hex');
  if (cache.has(key)) {
    totals.cached++;
    return { brief: cache.get(key), cached: true };
  }
  if (!pending.has(key)) pending.set(key, callClaude(prompt).finally(() => pending.delete(key)));
  const out = await pending.get(key);
  if (out.brief) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, out.brief);
  }
  return out;
}

function buildPrompt(profile, result, path) {
  return `Write the risk-committee brief for this assessment.

${summarise(profile, result, path)}

Return the decision, the reasons that drive it, and the actions required before go-live.`;
}

async function callClaude(prompt) {
  // Server-side fallback: if the primary model declines (security topics can trip safety
  // classifiers), the API reruns the request on a fallback model inside the same call.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const usage = logUsage(response);
  return { brief: parseBrief(response), usage };
}

// The brief from a response, or null for a refusal (after any server-side fallback), invalid JSON, or
// a brief without a decision. Exported so tests can check this without an API call.
export function parseBrief(response) {
  if (response.stop_reason === 'refusal') {
    console.warn('[agent-risk] Brief declined:', response.stop_details?.category ?? 'no category');
    return null;
  }
  const text = (response.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const brief = JSON.parse(text);
    return brief?.decision && Array.isArray(brief.reasons) && Array.isArray(brief.actions) ? brief : null;
  } catch {
    console.warn('[agent-risk] Brief was not valid JSON');
    return null;
  }
}

// One line per paid call, plus a running total, so spend is visible in the backend window.
function logUsage(response) {
  const u = response.usage ?? {};
  const model = response.model ?? MODEL;
  const price = PRICES[Object.keys(PRICES).find((m) => model.startsWith(m))];
  const usd = price ? (u.input_tokens * price[0] + u.output_tokens * price[1]) / 1e6 : null;
  totals.calls++;
  totals.inputTokens += u.input_tokens ?? 0;
  totals.outputTokens += u.output_tokens ?? 0;
  totals.usd += usd ?? 0;
  console.log(`[agent-risk] Brief: ${model}, ${u.input_tokens} in / ${u.output_tokens} out (incl. thinking)`
    + `${usd != null ? `, ~$${usd.toFixed(4)}` : ''} | session: ${totals.calls} calls, ${totals.cached} reused, ~$${totals.usd.toFixed(3)}`);
  return { model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, usd };
}
