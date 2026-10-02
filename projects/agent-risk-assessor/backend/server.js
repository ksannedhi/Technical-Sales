// .env is loaded via --env-file=../.env in the launch command (Node 20+), so it is in place
// before any import reads process.env.
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  assess, pathToGo, riskRegister, rmfCoverage,
  inputs, controlsData, scenariosData, aiRmf,
} from './engine.js';
import { writeBrief, narrativeEnabled, briefStats } from './narrative.js';
import { buildReportHtml } from './report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3006;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5181' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', narrative: narrativeEnabled() }));
app.get('/api/inputs', (_req, res) => res.json(inputs));
app.get('/api/controls', (_req, res) => res.json(controlsData));
app.get('/api/scenarios', (_req, res) => res.json(scenariosData));

function run(body) {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object') return null;
  const ticked = Array.isArray(body.controls) ? body.controls : [];
  // A what-if is the design with Path-to-Go changes applied. Exports must say so, because its
  // "controls in place" are assumptions, not the organisation's actual state.
  const whatIf = Array.isArray(body.whatIf) && body.whatIf.length ? body.whatIf.map(String) : null;
  // The engine decides which ticked controls count (derived ones follow their Architecture answer,
  // not-applicable ones are dropped); exports list only those.
  const result = assess(answers, ticked);
  const controls = result.controlsInPlace;
  return {
    answers, controls, result, whatIf,
    path: pathToGo(answers, ticked),
    register: riskRegister(answers, controls, result),
    coverage: rmfCoverage(result),
  };
}

app.post('/api/assess', (req, res) => {
  const out = run(req.body);
  if (!out) return res.status(400).json({ error: 'answers object required' });
  res.json({ result: out.result, path: out.path, register: out.register, coverage: out.coverage });
});

// Separate from /assess so the results render instantly and the brief fills in after.
// writeBrief reuses a brief already written for the same assessment and merges duplicate requests.
app.post('/api/brief', async (req, res) => {
  if (!narrativeEnabled()) return res.json({ brief: null, reason: 'disabled' });
  const out = run(req.body);
  if (!out) return res.status(400).json({ error: 'answers object required' });
  try {
    const { brief, cached = false, usage = null } = await writeBrief(out.answers, out.result, out.path);
    res.json({ brief, cached, usage });
  } catch (err) {
    console.error('[agent-risk] Brief failed:', err.message);
    res.status(502).json({ error: 'Brief generation failed', detail: err.message });
  }
});

app.get('/api/brief/stats', (_req, res) => res.json(briefStats()));

app.post('/api/export/register', (req, res) => {
  const out = run(req.body);
  if (!out) return res.status(400).json({ error: 'answers object required' });
  const cell = (v) => `"${(Array.isArray(v) ? v.join('; ') : String(v ?? '')).replace(/"/g, '""')}"`;
  // `basis` on every row, so a what-if register can't be mistaken for the actual one once opened.
  const basis = out.whatIf ? `What-if: ${out.whatIf.join('; ')}` : 'Actual design as assessed';
  const cols = ['id', 'risk', 'description', 'inherent', 'residual', 'controlsInPlace', 'treatment', 'owaspLlm', 'owaspAgentic', 'atlas', 'aiRmf', 'basis'];
  const csv = [cols.join(','), ...out.register.map((r) => cols.map((c) => cell(c === 'basis' ? basis : r[c])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug(out.answers.orgName)}-${out.whatIf ? 'what-if-' : ''}ai-risk-register.csv"`);
  res.send('﻿' + csv);
});

app.post('/api/export/pdf', async (req, res) => {
  const out = run(req.body);
  if (!out) return res.status(400).json({ error: 'answers object required' });
  let browser;
  try {
    // No bundled Chromium (PUPPETEER_SKIP_DOWNLOAD): use PUPPETEER_EXECUTABLE_PATH if set, else installed Chrome.
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : { channel: 'chrome' }),
    });
    const page = await browser.newPage();
    const html = buildReportHtml({ profile: out.answers, ...out, brief: req.body.brief ?? null, aiRmf, inputs, controlsData });
    await page.setContent(html, { waitUntil: 'load' });
    // outline: headings become PDF bookmarks (side-panel navigation); needs a tagged PDF.
    const pdf = Buffer.from(await page.pdf({
      format: 'A4', margin: { top: '12mm', bottom: '12mm' }, printBackground: true, tagged: true, outline: true,
    }));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(out.answers.orgName)}-${out.whatIf ? 'what-if-' : ''}agent-risk-assessment.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[agent-risk] PDF export failed:', err.message);
    res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  } finally {
    await browser?.close();
  }
});

const slug = (s) => String(s || 'organisation').replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// Serve the built frontend when present (single-service deployment).
const dist = join(__dirname, '../frontend/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Agent Risk Assessor backend running on port ${PORT}`));
