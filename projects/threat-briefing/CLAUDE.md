# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the backend:**
```bash
node --watch --env-file=.env server/index.js
```
The `--env-file` flag is required — running via `npm run dev --workspace=server` changes into the `server/` directory and dotenv cannot find the root `.env`.

**Start the frontend (Vite dev server):**
```bash
cd client && npm run dev  # http://localhost:5177
```

**Start both together (preferred):**
```bash
npm run dev  # uses concurrently
```
Or double-click `Launch Threat Briefing.cmd` on Windows.

**Install dependencies:**
```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
```
Always use `PUPPETEER_SKIP_DOWNLOAD=true` if Chromium is already cached locally.
If Puppeteer can't find Chrome automatically, set `PUPPETEER_EXECUTABLE_PATH` in `.env` to point to your local Chrome executable.

**Trigger a briefing manually (requires server running):**
```bash
curl -X POST http://localhost:3003/api/briefing/generate
```

**Check health and briefing age:**
```bash
curl http://localhost:3003/api/health
```

## Architecture

The app is a **daily threat intelligence briefing tool** for GCC enterprise security teams. All briefing state is persisted to `server/briefing.json` on disk.

```
client/src/App.jsx               React SPA — state, dark mode, fetch logic
        ↕ REST (fetch)
server/index.js                  Express server — pipeline, routes, startup logic
        ↓
server/feeds/otx.js              AlienVault OTX feed (requires OTX_API_KEY)
server/feeds/cisa.js             CISA KEV feed (public)
server/feeds/abusech.js          MalwareBazaar feed (public)
        ↓
server/normalise.js              Merges all feeds into unified schema with GCC stats
        ↓
server/prompt.js                 System prompt + user prompt builder for Claude API
        ↓
Anthropic Claude API             Model: claude-haiku-4-5-20251001
        ↓
server/index.js                  Parses <result> tags or ```json fences from response
        ↓
server/briefing.json             Persisted briefing cache (excluded from git)
        ↓
server/pdf.js                    Puppeteer HTML-to-PDF using cached Chromium
server/reportTemplate.js         Inline HTML template for PDF
server/scheduler.js              node-cron — fires daily at 06:00 AST (system clock)
```

## Startup behaviour

On every server start, `server/index.js` runs this logic before accepting requests:

| Condition | Behaviour |
|-----------|-----------|
| No `briefing.json` | Pipeline runs immediately |
| File age < 24h | Loaded into cache, served instantly |
| File age ≥ 24h | Catch-up pipeline runs immediately |
| Catch-up fails | Stale briefing served as fallback |

## Key design decisions

- **`--env-file` over dotenv workspace** — npm workspace scripts `cd` into the package dir before running Node, so `dotenv` cannot resolve the root `.env`. Always run the server from the project root with `--env-file=.env`.
- **`TZ=Asia/Kuwait` in .env** — node-cron's `{ timezone }` option produces `Invalid Date` on Windows. Instead, `TZ` pins the Node.js process clock to Kuwait time so `'0 6 * * *'` fires at 06:00 AST on any host regardless of system locale. Node.js reads `TZ` before executing code, so `--env-file` delivers it in time.
- **Flexible response parsing** — Claude sometimes returns JSON in `<result>` tags, sometimes in ` ```json ``` ` fences. The parser handles both.
- **Puppeteer reuses cached Chromium** — `pdf.js` points to the existing cache. `page.pdf()` returns `Uint8Array` in Puppeteer v22+, always wrap with `Buffer.from()` before `res.send()`.
- **Two-audience design** — `executiveSummary` is plain English for CISOs/board; `analystSummary` is technical with IOCs/CVEs for SOC teams.
- **GCC regional focus** — the system prompt prioritises Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, Oman and threat actors APT33, APT34, OilRig, Lazarus, Turla.
- **HTML escaping in PDF template** — `reportTemplate.js` uses `esc()` on all Claude-generated text fields before interpolating into HTML, preventing special characters (`&`, `<`, `>`) from breaking the PDF layout.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `OTX_API_KEY` | No | AlienVault OTX — skipped gracefully if absent |
| `PORT` | No | Server port, defaults to `3003` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if cache is moved |
| `TZ` | No | Set to `Asia/Kuwait` to pin process clock to AST — makes `'0 6 * * *'` fire at 06:00 AST on any host timezone |

## Dark mode

Dark mode preference is stored in `localStorage` (`darkMode: true/false`) and applied via `data-theme="dark"` on `document.body`. Toggle with the 🌙/☀️ button in the top bar.

## Key project files

- `server/index.js` — pipeline, startup catch-up, all route definitions
- `server/feeds/otx.js` — OTX feed fetcher
- `server/feeds/cisa.js` — CISA KEV feed fetcher
- `server/feeds/abusech.js` — MalwareBazaar feed fetcher
- `server/normalise.js` — unified feed schema + GCC stats
- `server/prompt.js` — system prompt and user prompt builder
- `server/pdf.js` — Puppeteer PDF generation (Buffer.from wrapping required)
- `server/reportTemplate.js` — HTML template for PDF export
- `server/scheduler.js` — node-cron daily schedule
- `server/briefing.json` — persisted briefing cache (gitignored)
- `client/src/App.jsx` — root component, dark mode state, fetch logic
- `client/src/App.css` — all styles including dark mode overrides
- `client/src/components/BriefingHeader.jsx` — topbar with dark mode toggle
- `client/src/components/ThreatBanner.jsx`
- `client/src/components/StatsRow.jsx`
- `client/src/components/ExecutiveSummary.jsx`
- `client/src/components/TopThreats.jsx`
- `client/src/components/CisaKEV.jsx`
- `client/src/components/Recommendations.jsx`
- `client/src/components/ExportButton.jsx`

## Known issues and limitations

| Issue | Cause | Status |
|-------|-------|--------|
| Feed stats show 0 after a second manual generate in quick succession | OTX rate-limits repeated API calls on the same key; returns empty result silently instead of an HTTP error | Known — wait ~15 min between manual generates |
| Abuse.ch returning HTTP 401 | MalwareBazaar API auth requirements changed | Known — feed silently returns 0; check Abuse.ch API docs if Bazaar data is needed |
| All feed counts show 0 on a quiet day | OTX and CISA KEV filter to the last 24 hours; if no new pulses or KEVs were published, 0 is correct | Expected behaviour — not a bug |
| CISA KEV always 0 | CISA does not add new KEVs every day; some days are genuinely empty | Expected behaviour |
| Generation fails with JSON parse error on large OTX feeds | Claude response exceeded `max_tokens` and was truncated before the closing `</result>` tag | Mitigated — `max_tokens` raised to 8000 and parser hardened to handle missing closing tag; may recur if feeds grow very large |
| Cron did not fire with `{ timezone }` option | node-cron v3 timezone option uses `Intl.DateTimeFormat.format()` then feeds the result to `new Date()`, which returns `Invalid Date` on Windows, silently preventing all matches | Fixed — timezone option removed; `TZ=Asia/Kuwait` in `.env` pins process clock so cron fires at 06:00 AST on any host |
| PDF export ECONNRESET (persistent) | Puppeteer failed to launch Chrome (stale hardcoded executable path in `pdf.js`) | Fixed — removed hardcoded path; now uses `PUPPETEER_EXECUTABLE_PATH` env var or Puppeteer auto-detection |
| PDF export ECONNRESET (first export after restart) | Puppeteer cold-start latency — Chrome takes several seconds to launch on first use; Vite proxy times out before the PDF comes back | Expected intermittent behaviour — retry once and it succeeds. Not worth fixing for a presales tool; would require a persistent browser instance to eliminate |
| Blank UI during startup catch-up pipeline | `cachedBriefing` was null while the pipeline ran; frontend had nothing to show | Fixed — stale briefing is now served immediately while catch-up runs in background |

## Non-goals

- Persistent briefing history (only latest briefing is stored)
- User accounts or authentication
- Production Redis cache
- Email or Slack delivery
