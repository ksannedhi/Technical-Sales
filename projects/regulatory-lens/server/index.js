import 'dotenv/config';
import express        from 'express';
import cors           from 'cors';
import multer         from 'multer';
import pdfParse       from 'pdf-parse/lib/pdf-parse.js';
import fetch          from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { taxonomy }                             from './prompt.js';
import { INTAKE_SYSTEM, buildIntakePrompt }     from './prompt.js';
import { runHarmonisation, generateRoadmap, clearHarmonisationCache } from './harmonise.js';
import { analyseDocumentChange, analyseDescribedChange } from './changeTracker.js';
import { ingestCustomFramework, getCustomFrameworkSummaries, deleteCustomFramework, customFrameworkStore } from './customFramework.js';
import { generateExcel }                        from './excel.js';
import { generatePDF }                          from './pdf.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseClaudeJSON(text) {
  let match = text.match(/<r>([\s\S]*?)<\/r>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/<result>([\s\S]*?)<\/result>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return JSON.parse(match[1].trim());
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    try { return JSON.parse(text.slice(jsonStart)); } catch { /* fall through */ }
  }
  throw new Error('No parseable JSON found in Claude response');
}

async function callClaude(system, userMessage, maxTokens = 1500) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(90_000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0]?.text || '';
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', domains: taxonomy.domains.length, frameworks: Object.keys(taxonomy.frameworks).length }));

// ── Taxonomy ──────────────────────────────────────────────────────────────────
app.get('/api/taxonomy', (_, res) => res.json(taxonomy));

// ── Intake: framework recommendation ─────────────────────────────────────────
app.post('/api/intake', async (req, res) => {
  try {
    const raw    = await callClaude(INTAKE_SYSTEM, buildIntakePrompt(req.body), 2500);
    const result = parseClaudeJSON(raw);
    res.json(result);
  } catch (e) {
    console.error('[/intake]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Harmonise: run parallel domain analysis ───────────────────────────────────
// Uses SSE to stream domain completion progress to client
app.get('/api/harmonise/stream', async (req, res) => {
  const { frameworks } = req.query;
  if (!frameworks) return res.status(400).json({ error: 'frameworks query param required' });

  const allFrameworkIds    = frameworks.split(',');
  const standardFrameworks = allFrameworkIds.filter(f => taxonomy.frameworks[f]);
  const customIds          = allFrameworkIds.filter(f => f.startsWith('CUSTOM-'));
  const activeCustom       = Object.fromEntries(
    customIds.filter(id => customFrameworkStore[id]).map(id => [id, customFrameworkStore[id]])
  );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const results = await runHarmonisation(
      [...standardFrameworks, ...Object.keys(activeCustom)],
      (completed, total, domainLabel) => {
        send({ type: 'progress', completed, total, domainLabel });
      },
      activeCustom
    );
    send({ type: 'complete', results });
    res.end();
  } catch (e) {
    send({ type: 'error', message: e.message });
    res.end();
  }
});

// ── Roadmap generation ────────────────────────────────────────────────────────
app.post('/api/roadmap', async (req, res) => {
  try {
    const { harmonisationResults, postureMap, selectedFrameworks, frameworkWeights } = req.body;
    const roadmap = await generateRoadmap(harmonisationResults, postureMap, selectedFrameworks, frameworkWeights);
    res.json(roadmap);
  } catch (e) {
    console.error('[/roadmap]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Excel export ──────────────────────────────────────────────────────────────
app.post('/api/export/excel', async (req, res) => {
  try {
    const { harmonisationResults, selectedFrameworks, frameworkWeights } = req.body;
    const buffer = await generateExcel(harmonisationResults, selectedFrameworks, frameworkWeights, taxonomy);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="harmonisation-matrix-${new Date().toISOString().slice(0,10)}.xlsx"`
    });
    res.send(buffer);
  } catch (e) {
    console.error('[/export/excel]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PDF export ────────────────────────────────────────────────────────────────
app.post('/api/export/pdf', async (req, res) => {
  try {
    const { harmonisationResults, roadmap, selectedFrameworks } = req.body;
    const pdf = await generatePDF(harmonisationResults, roadmap, selectedFrameworks, taxonomy);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="harmonisation-report-${new Date().toISOString().slice(0,10)}.pdf"`
    });
    res.send(pdf);
  } catch (e) {
    console.error('[/export/pdf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Change Tracker: document upload ──────────────────────────────────────────
app.post('/api/change-tracker/documents', upload.fields([
  { name: 'oldVersion', maxCount: 1 },
  { name: 'newVersion', maxCount: 1 }
]), async (req, res) => {
  try {
    const oldBuf = req.files?.oldVersion?.[0]?.buffer;
    const newBuf = req.files?.newVersion?.[0]?.buffer;
    if (!oldBuf || !newBuf) return res.status(400).json({ error: 'Both oldVersion and newVersion PDF files are required' });

    const [oldParsed, newParsed] = await Promise.all([
      pdfParse(oldBuf),
      pdfParse(newBuf)
    ]);

    const frameworkName = req.body.frameworkName || 'Unknown Framework';
    const result = await analyseDocumentChange(oldParsed.text, newParsed.text, frameworkName);
    res.json(result);
  } catch (e) {
    console.error('[/change-tracker/documents]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Change Tracker: free text description ────────────────────────────────────
app.post('/api/change-tracker/description', async (req, res) => {
  try {
    const { description, frameworkName } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const result = await analyseDescribedChange(description, frameworkName || 'Unknown Framework');
    res.json(result);
  } catch (e) {
    console.error('[/change-tracker/description]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Cache: clear harmonisation cache (useful for demo resets) ────────────────
app.post('/api/cache/clear', (req, res) => {
  clearHarmonisationCache();
  res.json({ cleared: true });
});

// ── Custom framework: upload and ingest PDF ───────────────────────────────────
app.post('/api/frameworks/custom', upload.single('frameworkPDF'), async (req, res) => {
  try {
    const buf          = req.file?.buffer;
    const overrideName = req.body?.frameworkName?.trim() || null;
    if (!buf) return res.status(400).json({ error: 'frameworkPDF file is required' });
    const entry = await ingestCustomFramework(buf, overrideName);
    res.json(entry);
  } catch (e) {
    console.error('[/frameworks/custom]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Custom framework: list all uploaded custom frameworks ─────────────────────
app.get('/api/frameworks/custom', (req, res) => {
  res.json(getCustomFrameworkSummaries());
});

// ── Custom framework: delete by ID ────────────────────────────────────────────
app.delete('/api/frameworks/custom/:frameworkId', (req, res) => {
  const deleted = deleteCustomFramework(req.params.frameworkId);
  if (!deleted) return res.status(404).json({ error: 'Framework not found' });
  res.json({ deleted: true, frameworkId: req.params.frameworkId });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Taxonomy loaded: ${taxonomy.domains.length} domains, ${Object.keys(taxonomy.frameworks).length} frameworks`);
});
