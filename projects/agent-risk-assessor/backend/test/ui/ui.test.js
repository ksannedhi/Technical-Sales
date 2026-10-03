// Browser tests for the frontend. They build the frontend, start a separate backend on a spare port
// with no API key (so no Claude call is possible), and drive it with Puppeteer and the installed Chrome.
// /api/health is answered as narrative-enabled and /api/brief with a stub, so the brief UI is tested
// without cost. Run with `npm run test:ui` from backend/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..', '..');
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
let server;
let browser;

before(async () => {
  execSync('npm run build', { cwd: join(backend, '..', 'frontend'), stdio: 'ignore', shell: true });
  server = spawn(process.execPath, ['server.js'], {
    cwd: backend,
    env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await puppeteer.launch({ channel: 'chrome', headless: true });
});

after(async () => {
  await browser?.close();
  server?.kill();
  // Remove the build so the dev backend doesn't keep serving a stale copy of the frontend.
  rmSync(join(backend, '..', 'frontend', 'dist'), { recursive: true, force: true });
});

// A fresh page with the brief stubbed. `briefCalls` counts what the UI asks for.
async function openApp({ width = 1280, height = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.setRequestInterception(true);
  const counts = { brief: 0 };
  page.on('request', (req) => {
    const url = req.url();
    if (url.endsWith('/api/health'))
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', narrative: true }) });
    if (url.endsWith('/api/brief')) {
      counts.brief++;
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ brief: { decision: 'Stub.', reasons: [{ headline: 'Stub', detail: 'Stub.' }], actions: ['Stub.'] } }) });
    }
    return req.continue();
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  return { page, counts };
}

const click = (page, selector, text) => page.evaluate((selector, text) => {
  const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.includes(text));
  if (!el) throw new Error(`no ${selector} containing "${text}"`);
  el.click();
}, selector, text);
const settle = () => new Promise((r) => setTimeout(r, 400));
const text = (page, selector) => page.$eval(selector, (e) => e.innerText);

async function loadPreset(page, label) {
  await click(page, 'button.chip', label);
  await page.waitForSelector('.verdict');
  await settle();
}

async function setState(page, state) {
  await page.evaluate((s) => sessionStorage.setItem('agent-risk-assessor:v1', JSON.stringify(s)), state);
  await page.reload({ waitUntil: 'networkidle0' });
}

test('bank preset: verdict, blast band, and a two-step Path to Go', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  assert.equal(await text(page, '.verdict-label'), 'Not yet');
  assert.match(await text(page, '.kpis .kpi'), /56\/100\s*High/);
  assert.match(await text(page, '.kpis .kpi'), /Biggest single reduction/);
  const cards = await page.$$eval('.path h3', (h) => h.map((x) => x.textContent));
  assert.deepEqual(cards, ['To reach Go with conditions', 'To reach Go']);
  assert.match(await text(page, '.path'), /architecture change/);
  await page.close();
});

test('briefs: one call per design; a what-if asks first; going back reuses it', async () => {
  const { page, counts } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  assert.equal(counts.brief, 1);
  await click(page, 'button.action', 'Try this path');
  await page.waitForSelector('.whatif-banner');
  await settle();
  assert.equal(counts.brief, 1, 'a what-if must not write a brief by itself');
  assert.match(await text(page, '.results'), /Write brief for this what-if/);
  await click(page, 'button', 'Back to actual design');
  await settle();
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.verdict');
  await settle();
  assert.equal(counts.brief, 1, 'returning to the same design or refreshing must reuse the brief');
  await page.close();
});

test('a what-if never overwrites the actual design', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  const goCard = await page.evaluateHandle(() => [...document.querySelectorAll('.path .card.inner')].find((c) => c.querySelector('h3')?.textContent === 'To reach Go'));
  await goCard.evaluate((c) => c.querySelector('button.action').click());
  await page.waitForSelector('.whatif-banner');
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('agent-risk-assessor:v1')));
  assert.deepEqual(stored.answers.identity, ['shared_service'], 'actual design unchanged');
  assert.deepEqual(stored.whatIf.answers.identity, ['per_user'], 'the what-if carries the architecture change');
  assert.match(await text(page, '.verdict .eyebrow'), /What-if/i);
  await page.close();
});

test('changing step starts the new page at the top', async () => {
  const { page } = await openApp({ height: 700 });
  await loadPreset(page, 'Bank customer-service agent');
  // The button is at the bottom of Results: scroll there first, as a user would.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle();
  assert.ok(await page.evaluate(() => scrollY) > 500, 'test setup: page scrolled down');
  await click(page, 'button.action', 'Change controls');
  await page.waitForSelector('label.control');
  await settle();
  assert.equal(await page.evaluate(() => Math.round(scrollY)), 0);
  await page.close();
});

test('controls page: derived controls are read-only, ill-fitting ones are flagged', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  await click(page, 'button.action', 'Change controls');
  await page.waitForSelector('label.control');
  const perUser = await page.evaluate(() => {
    const l = [...document.querySelectorAll('label.control')].find((x) => x.textContent.includes("requesting user's permissions"));
    return { disabled: l.querySelector('input').disabled, checked: l.querySelector('input').checked };
  });
  assert.deepEqual(perUser, { disabled: true, checked: false });
  // The bank agent can't run code, so a ticked sandbox is not applicable, with the reason.
  await page.evaluate(() => [...document.querySelectorAll('label.control')].find((x) => x.textContent.includes('Sandboxed code execution')).querySelector('input').click());
  await page.waitForFunction(() => document.querySelector('.tag.warn'));
  assert.match(await text(page, 'main, body'), /applies only when the agent can run code/);
  await page.close();
});

test('architecture page: a blocking contradiction disables Next; a soft one only warns', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('agent-risk-assessor:v1')));
  state.step = 1;
  state.answers = { ...state.answers, supplyChain: ['none'], dataSources: ['crm', 'mailbox'], untrustedInputs: ['none'] };
  await setState(page, state);
  await page.waitForSelector('[data-field="supplyChain"]');
  const warnings = await page.$$eval('p.warn', (w) => w.map((x) => x.textContent));
  assert.ok(warnings.some((w) => w.includes('Commercial model API')), 'vendor API with None is flagged');
  assert.ok(warnings.some((w) => w.includes('Mailbox')), 'mailbox with no outsider content is flagged');
  assert.equal(await page.$eval('.footer button.primary', (b) => b.disabled), true);
  assert.match(await text(page, '.footer'), /answer to fix/);
  await page.close();
});

test('architecture page: suggest-only oversight with record writes is blocked', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Internal HR policy assistant');
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('agent-risk-assessor:v1')));
  state.step = 1;
  state.answers = { ...state.answers, autonomy: 'suggest', actions: ['read_only', 'write_records'] };
  await setState(page, state);
  await page.waitForSelector('[data-field="autonomy"]');
  const warnings = await page.$$eval('p.warn', (w) => w.map((x) => x.textContent));
  assert.ok(warnings.some((w) => w.includes('Suggests only') && w.includes('create or update records')), warnings.join(' | '));
  assert.equal(await page.$eval('.footer button.primary', (b) => b.disabled), true);
  await page.close();
});

test('results fit a phone screen without sideways scrolling', async () => {
  const { page } = await openApp({ width: 375, height: 812 });
  await loadPreset(page, 'Bank customer-service agent');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `page is ${overflow}px wider than the screen`);
  await page.close();
});

test('PDF export returns a PDF', async () => {
  const { page } = await openApp();
  await loadPreset(page, 'Bank customer-service agent');
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/export/pdf'), { timeout: 60000 }),
    click(page, '.exports button', 'Export PDF'),
  ]);
  assert.equal(res.status(), 200);
  assert.equal(res.headers()['content-type'], 'application/pdf');
  await page.close();
});
