import 'dotenv/config';
import express from 'express';
import fetch   from 'node-fetch';
import cors    from 'cors';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';

import { fetchOTX }     from './feeds/otx.js';
import { fetchCISAKEV } from './feeds/cisa.js';
import { fetchAbusech } from './feeds/abusech.js';
import { normalise }    from './normalise.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { generatePDF }  from './pdf.js';
import { registerRunner } from './scheduler.js';
import './scheduler.js'; // activate cron

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIEFING_PATH = path.join(__dirname, 'briefing.json');
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Pre-flight checks ─────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Startup] ANTHROPIC_API_KEY is not set. Add it to .env and restart.');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Persistent cache ─────────────────────────────────────────────────────────
let cachedBriefing = null;

function saveBriefing(briefing) {
  try {
    fs.writeFileSync(BRIEFING_PATH, JSON.stringify(briefing, null, 2), 'utf8');
  } catch (e) {
    console.error('[Cache] Failed to persist briefing to disk:', e.message);
  }
}

function loadBriefing() {
  try {
    if (!fs.existsSync(BRIEFING_PATH)) return null;
    const raw = fs.readFileSync(BRIEFING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Cache] Failed to load briefing from disk:', e.message);
    return null;
  }
}

function briefingAgeMs(briefing) {
  const date = new Date(briefing?.briefingDate);
  if (isNaN(date)) return Infinity;
  return Date.now() - date.getTime();
}

// ── Core pipeline ─────────────────────────────────────────────────────────────
async function runPipeline() {
  console.log('[Pipeline] Fetching OSINT feeds…');
  const [otx, cisa, abusech] = await Promise.all([
    fetchOTX(),
    fetchCISAKEV(),
    fetchAbusech()
  ]);
  console.log(`[Pipeline] OTX: ${otx.length} | CISA: ${cisa.length} | Bazaar: ${abusech.length}`);

  const normalisedData = normalise({ otx, cisa, abusech });

  console.log('[Pipeline] Calling Claude API…');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildUserPrompt(normalisedData) }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw  = data.content[0]?.text || '';

  // Accept <result>...</result> tags, ```json ... ``` fences, or bare JSON.
  // Also handle truncated responses where </result> was cut off by max_tokens.
  let jsonStr =
    (raw.match(/<result>([\s\S]*?)<\/result>/)  || [])[1] ||
    (raw.match(/```(?:json)?\s*([\s\S]*?)```/)  || [])[1] ||
    (raw.includes('<result>') ? raw.slice(raw.indexOf('<result>') + 8) : null) ||
    raw.trim();

  if (raw.includes('<result>') && !raw.includes('</result>')) {
    console.warn('[Pipeline] Response appears truncated (no </result> closing tag) — consider raising max_tokens.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[Pipeline] Failed to parse Claude response:', raw.slice(0, 500));
    throw new Error(`Claude response was not valid JSON: ${e.message}`);
  }

  // Override feedStats with ground-truth counts from the actual feed arrays
  // so the UI always reflects reality regardless of what Claude counted
  parsed.feedStats = {
    otxPulsesProcessed:    otx.length,
    cisaKEVAdded:          cisa.length,
    malwareSamplesAnalysed: abusech.length
  };

  // Surface feed issues as dismissible warnings in the UI
  const feedWarnings = [];
  if (!process.env.OTX_API_KEY) {
    feedWarnings.push('OTX feed skipped — OTX_API_KEY is not set in .env. Add your key to include OTX pulse data.');
  } else if (otx.length === 0) {
    feedWarnings.push('OTX returned 0 pulses — this may be a rate limit. Wait ~15 minutes before regenerating.');
  }
  if (abusech.length === 0) {
    feedWarnings.push('MalwareBazaar feed returned no data — likely HTTP 401. Check backend logs for [Abuse.ch] Feed error.');
  }
  parsed.feedWarnings = feedWarnings;

  cachedBriefing = parsed;
  saveBriefing(cachedBriefing);
  console.log('[Pipeline] Briefing cached and persisted to disk.');
  return cachedBriefing;
}

// Register for scheduler
registerRunner(runPipeline);

// ── Startup: load persisted briefing, catch up if stale ──────────────────────
(async () => {
  const saved = loadBriefing();

  if (saved) {
    const ageHours = Math.round(briefingAgeMs(saved) / 3_600_000);
    if (briefingAgeMs(saved) < STALE_MS) {
      cachedBriefing = saved;
      console.log(`[Startup] Loaded briefing from disk (${ageHours}h old) — still fresh.`);
    } else {
      // Serve the stale briefing immediately so the UI isn't blank while catching up
      cachedBriefing = saved;
      console.log(`[Startup] Briefing on disk is ${ageHours}h old — serving stale while catching up…`);
      try {
        await runPipeline();
        console.log('[Startup] Catch-up briefing generated successfully.');
      } catch (e) {
        console.error('[Startup] Catch-up pipeline failed:', e.message);
        console.warn('[Startup] Continuing to serve stale briefing until next successful run.');
      }
    }
  } else {
    console.log('[Startup] No briefing on disk — running initial pipeline…');
    try {
      await runPipeline();
      console.log('[Startup] Initial briefing generated successfully.');
    } catch (e) {
      console.error('[Startup] Initial pipeline failed:', e.message);
    }
  }
})();

// ── Routes ────────────────────────────────────────────────────────────────────

// On-demand generate
app.post('/api/briefing/generate', async (req, res) => {
  try {
    const result = await runPipeline();
    res.json(result);
  } catch (e) {
    console.error('[/generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Serve cached briefing
app.get('/api/briefing/latest', (req, res) => {
  if (!cachedBriefing) {
    return res.status(404).json({ error: 'No briefing available yet.' });
  }
  res.json(cachedBriefing);
});

// PDF export
app.post('/api/briefing/export', async (req, res) => {
  try {
    const { briefing } = req.body;
    if (!briefing) return res.status(400).json({ error: 'No briefing data provided.' });
    const pdf = await generatePDF(briefing);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="threat-briefing-${new Date().toISOString().slice(0,10)}.pdf"`
    });
    res.send(pdf);
  } catch (e) {
    console.error('[/export]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({
  status:      'ok',
  hasBriefing: !!cachedBriefing,
  briefingAge: cachedBriefing ? `${Math.round(briefingAgeMs(cachedBriefing) / 3_600_000)}h` : null
}));

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log('[Server] Daily cron scheduled for 06:00 AST (system clock)');
});
