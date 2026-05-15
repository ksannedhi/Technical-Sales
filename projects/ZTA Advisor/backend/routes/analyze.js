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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const client = ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_key_here'
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

const PILLAR_ORDER = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];
const TARGET_MATURITY = 3; // Advanced — realistic ZT target for most organizations

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

function maturityLabel(score) {
  if (score < 1.5) return 'Traditional';
  if (score < 2.5) return 'Initial';
  if (score < 3.5) return 'Advanced';
  return 'Optimal';
}

async function generateNarrative(orgProfile, pillarScores, roadmap, frameworkIds) {
  const frameworkNames = frameworkIds
    .map(id => frameworksData.frameworks.find(f => f.id === id)?.shortName)
    .filter(Boolean)
    .join(', ');

  const pillarSummary = PILLAR_ORDER.map(p => {
    const s = pillarScores[p];
    return `${pillarLabel(p)}: ${maturityLabel(s.current)} (${s.current.toFixed(1)}/4.0) → target ${maturityLabel(s.target)}`;
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

  const userPrompt = `Prepare a Zero Trust maturity assessment narrative for the following organization:

Organization: ${orgProfile.orgName || 'the organization'}
Industry: ${orgProfile.industry || 'not specified'}
Size: ${orgProfile.orgSize || 'not specified'}
Frameworks: ${frameworkNames}

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
  try {
    const { orgProfile, answers, frameworkIds } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object required' });
    }

    const pillarScores = scoreAnswers(answers);
    const roadmap = getControls(pillarScores);

    const overallScore = PILLAR_ORDER.reduce((s, p) => s + pillarScores[p].current, 0) / PILLAR_ORDER.length;

    let narrative = null;
    if (client) {
      try {
        narrative = await generateNarrative(orgProfile, pillarScores, roadmap, frameworkIds || []);
      } catch (narrativeErr) {
        console.warn('Narrative generation skipped:', narrativeErr.message);
        // Non-fatal — scoring and roadmap are returned regardless
      }
    }

    res.json({
      pillarScores,
      roadmap,
      overallScore: Math.round(overallScore * 10) / 10,
      narrative,
      meta: {
        orgProfile,
        frameworkIds,
        assessedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});
