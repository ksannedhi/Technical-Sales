import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { questions } = JSON.parse(readFileSync(join(__dirname, '../data/questions.json'), 'utf8'));
const { remediationControls } = JSON.parse(readFileSync(join(__dirname, '../data/controls.json'), 'utf8'));
const frameworksData = JSON.parse(readFileSync(join(__dirname, '../data/frameworks.json'), 'utf8'));

// Only instantiate if a real key is present — avoids MissingAPIKeyError at module load
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const client = ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_key_here'
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

// Startup diagnostic — visible in backend terminal on every server start
if (client) {
  console.log(`[ZTA] Claude client ready — model: ${process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'}`);
} else {
  console.warn('[ZTA] ANTHROPIC_API_KEY missing or placeholder — narrative generation disabled');
}

const PILLAR_ORDER = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];
const TARGET_MATURITY = 3; // Advanced — realistic ZT target for most organizations

// In-flight guard — prevents concurrent Claude calls from double-submits
let analysisInFlight = false;

// Resolve maturity labels from the first selected framework that has 4 labels;
// falls back to CISA ZTMM labels if none match.
const CISA_LABELS = ['Traditional', 'Initial', 'Advanced', 'Optimal'];
function resolveMaturityLabels(frameworkIds = []) {
  for (const id of frameworkIds) {
    const fw = frameworksData.frameworks.find(f => f.id === id);
    if (fw?.maturityLabels?.length === 4) return fw.maturityLabels;
  }
  return CISA_LABELS;
}

export const analyzeRouter = Router();

function scoreAnswers(answers) {
  const pillarScores = {};

  for (const pillar of PILLAR_ORDER) {
    const pillarQuestions = questions.filter(q => q.pillar === pillar);
    const pillarAnswers = pillarQuestions.map(q => answers[q.id] ?? 1);
    const avg = pillarAnswers.reduce((s, v) => s + v, 0) / pillarAnswers.length;
    pillarScores[pillar] = {
      current: Math.round(avg * 10) / 10,
      target: TARGET_MATURITY,
      gap: Math.max(0, TARGET_MATURITY - avg),
      questionCount: pillarQuestions.length,
      rawAnswers: pillarAnswers
    };
  }

  return pillarScores;
}

function getControls(pillarScores) {
  const roadmap = { short: [], medium: [], long: [] };

  for (const [pillar, score] of Object.entries(pillarScores)) {
    const current = Math.floor(score.current);
    const target = score.target;

    for (let from = current; from < target; from++) {
      const key = `${from}-to-${from + 1}`;
      const controls = remediationControls[pillar]?.[key] || [];
      for (const ctrl of controls) {
        roadmap[ctrl.timeline].push({ pillar, ...ctrl });
      }
    }
  }

  // Sort by priority within each timeline bucket
  for (const bucket of Object.values(roadmap)) {
    bucket.sort((a, b) => a.priority - b.priority);
  }

  return roadmap;
}

function pillarLabel(id) {
  return frameworksData.pillars.find(p => p.id === id)?.label || id;
}

function maturityLabel(score, labels = CISA_LABELS) {
  if (score < 1.5) return labels[0];
  if (score < 2.5) return labels[1];
  if (score < 3.5) return labels[2];
  return labels[3];
}

const INDUSTRY_CONTEXT = {
  'Financial Services': 'ZT gaps directly expose the organization to regulatory sanctions (PCI-DSS, SOX, DORA), fraud risk, and systemic breach liability. Threat actors prioritize financial institutions for credential theft and data exfiltration.',
  'Healthcare': 'ZT gaps create HIPAA/HL7 exposure and patient safety risk. Ransomware targeting clinical systems has caused measurable care disruptions — access control and network segmentation are life-safety issues.',
  'Government / Public Sector': 'ZT gaps conflict with executive mandates (e.g., EO 14028, CISA ZTMM) and expose sensitive citizen data and critical infrastructure to nation-state actors.',
  'Defense / DoD': 'ZT gaps create classified data spillage risk and non-compliance with DoD ZT Reference Architecture mandates. Nation-state adversaries actively target defense supply chains.',
  'Energy & Utilities': 'OT/IT convergence makes ZT gaps a critical infrastructure risk. NERC CIP compliance and ICS/SCADA protection require strict network segmentation between IT and operational environments.',
  'Retail & E-commerce': 'ZT gaps expose payment card data (PCI-DSS) and customer PII at scale. Supply chain attacks and e-commerce fraud are primary threat vectors requiring strong application and API security.',
  'Technology': 'ZT gaps in developer environments and CI/CD pipelines create intellectual property theft and supply chain compromise risk. Insider threats and compromised developer credentials are top attack vectors.',
  'Manufacturing': 'ZT gaps at the IT/OT boundary create production disruption risk. Ransomware targeting manufacturing causes significant operational losses and supply chain cascades.',
  'Education': 'ZT gaps expose student PII and research IP. Academic networks are highly permissive by design, making micro-segmentation and identity controls the most impactful ZT investments.',
  'Telecommunications': 'ZT gaps in carrier infrastructure risk subscriber data exposure and network availability. Regulatory obligations and interconnect security require strong identity and encryption controls.',
  'Legal & Professional Services': 'ZT gaps expose privileged client data and work product. Targeted attacks by adversaries seeking M&A intelligence or litigation strategy make data classification and access control critical.',
};

async function generateNarrative(orgProfile, pillarScores, roadmap, frameworkIds, maturityLabels) {
  const frameworkNames = frameworkIds
    .map(id => frameworksData.frameworks.find(f => f.id === id)?.shortName)
    .filter(Boolean)
    .join(', ');

  const pillarSummary = PILLAR_ORDER.map(p => {
    const s = pillarScores[p];
    return `${pillarLabel(p)}: ${maturityLabel(s.current, maturityLabels)} (${s.current.toFixed(1)}/4.0) → target ${maturityLabel(s.target, maturityLabels)}`;
  }).join('\n');

  const topGaps = PILLAR_ORDER
    .map(p => ({ pillar: p, gap: pillarScores[p].gap }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map(g => `${pillarLabel(g.pillar)} (gap: ${g.gap.toFixed(1)})`)
    .join(', ');

  const shortCount = roadmap.short.length;
  const medCount = roadmap.medium.length;
  const longCount = roadmap.long.length;

  const systemPrompt = `You are a senior Zero Trust Architecture advisor preparing an executive assessment briefing.
Write in a clear, authoritative, and concise tone suitable for a CISO or CTO audience.
Be specific and data-driven. Avoid vague filler phrases. Do not use bullet points in the narrative — write in paragraphs.`;

  const industryContext = INDUSTRY_CONTEXT[orgProfile.industry] || '';

  const userPrompt = `Prepare a Zero Trust maturity assessment narrative for the following organization:

Organization: ${orgProfile.orgName || 'the organization'}
Industry: ${orgProfile.industry || 'not specified'}
Size: ${orgProfile.orgSize || 'not specified'}
Frameworks: ${frameworkNames}
${industryContext ? `Industry risk context: ${industryContext}` : ''}

Current ZT maturity by pillar (scale 1-4):
${pillarSummary}

Priority gaps: ${topGaps}

Remediation roadmap: ${shortCount} immediate actions (0-90 days), ${medCount} medium-term (90-180 days), ${longCount} strategic (180+ days).

Write three paragraphs:
1. Executive summary: Where the organization stands today across all ZT pillars and what the assessment reveals about overall posture.
2. Critical findings: The two or three most significant gaps and their business risk implications if left unaddressed.
3. Strategic path forward: High-level guidance on the remediation approach and what achieving the target maturity will enable for the business.

Keep the total under 350 words.`;

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

analyzeRouter.post('/', async (req, res) => {
  // In-flight guard — reject concurrent submissions
  if (analysisInFlight) {
    return res.status(429).json({ error: 'Analysis already in progress. Please wait.' });
  }

  analysisInFlight = true;
  try {
    const { orgProfile, answers, frameworkIds } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object required' });
    }

    // Input validation — warn if answer count doesn't match question bank
    const expectedCount = questions.length;
    const receivedCount = Object.keys(answers).length;
    if (receivedCount !== expectedCount) {
      console.warn(`Incomplete answers: ${receivedCount}/${expectedCount} — defaulting missing to maturity 1`);
    }

    const maturityLabels = resolveMaturityLabels(frameworkIds || []);
    const pillarScores = scoreAnswers(answers);
    const roadmap = getControls(pillarScores);

    const overallScore = PILLAR_ORDER.reduce((s, p) => s + pillarScores[p].current, 0) / PILLAR_ORDER.length;

    let narrative = null;
    if (client) {
      try {
        console.log('[ZTA] Generating narrative…');
        narrative = await generateNarrative(orgProfile, pillarScores, roadmap, frameworkIds || [], maturityLabels);
        console.log('[ZTA] Narrative generated successfully');
      } catch (narrativeErr) {
        console.error('[ZTA] Narrative generation failed:', narrativeErr.message);
        // Non-fatal — scoring and roadmap are returned regardless
      }
    } else {
      console.warn('[ZTA] Skipping narrative — no Claude client');
    }

    res.json({
      pillarScores,
      roadmap,
      overallScore: Math.round(overallScore * 10) / 10,
      narrative,
      maturityLabels,
      meta: {
        orgProfile,
        frameworkIds,
        assessedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  } finally {
    analysisInFlight = false;
  }
});
