// The only Claude call in the tool: a plain-language brief for the risk committee.
// Everything it says comes from the deterministic assessment passed in — it adds no findings.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';
const KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const client = KEY && KEY !== 'your_key_here' ? new Anthropic({ apiKey: KEY }) : null;

if (client) console.log(`[agent-risk] Claude client ready — model: ${MODEL}`);
else console.warn('[agent-risk] ANTHROPIC_API_KEY missing or placeholder — risk-committee brief disabled');

export const narrativeEnabled = () => Boolean(client);

const SYSTEM = `You write risk-committee briefs about AI agent deployments for boards and risk committees in regulated Gulf organisations.
Write for non-technical senior readers who must decide whether to accept the risk, and who will skim.
Use only the facts in the assessment you are given. Do not add threats, controls, regulations, or numbers that are not in it.
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
      description: 'What must happen before go-live, in order. One action per item, imperative, one sentence each. At most five.',
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
    `Lethal trifecta (private data + untrusted content + outbound channel): ${
      result.trifecta.present ? (result.trifecta.broken ? 'present, broken by controls' : 'present and unbroken') : 'not present'
    }`,
    'Blockers:', ...result.verdict.blockers.map((b) => `- ${b}`),
    'Go-live conditions:', ...result.verdict.conditions.map((c) => `- ${c}`),
    'Top threats (residual):', ...result.threats.slice(0, 6).map((t) => `- ${t.title}: ${t.priority}`),
    'Regulatory findings:', ...result.residency.filter((r) => r.severity >= 3).map((r) => `- ${r.title} (${r.level}): ${r.finding}`),
  ];
  if (path?.steps?.length) {
    lines.push('Path forward:');
    for (const a of path.architecture ?? []) lines.push(`- Architecture change: ${a.change}`);
    for (const s of path.steps)
      lines.push(`- To reach ${s.label}: ${s.controls ? s.controls.map((c) => c.title).join('; ') : 'not reachable with controls alone'}`
        + (s.approvals?.length ? ` — plus approvals: ${s.approvals.map((a) => a.title).join('; ')}` : ''));
  }
  return lines.join('\n');
}

export async function writeBrief(profile, result, path) {
  if (!client) return null;
  const prompt = `Write the risk-committee brief for this assessment.

${summarise(profile, result, path)}

Return the decision, the reasons that drive it, and the actions required before go-live.`;

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

  if (response.stop_reason === 'refusal') {
    console.warn('[agent-risk] Brief declined:', response.stop_details?.category ?? 'no category');
    return null;
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const brief = JSON.parse(text);
    return brief?.decision ? brief : null;
  } catch {
    console.warn('[agent-risk] Brief was not valid JSON');
    return null;
  }
}
