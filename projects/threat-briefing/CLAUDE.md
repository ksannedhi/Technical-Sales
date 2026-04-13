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
server/scheduler.js              node-cron — fires daily at 06:00 Kuwait Time (03:00 UTC)
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
- **Flexible response parsing** — Claude sometimes returns JSON in `<result>` tags, sometimes in ` ```json ``` ` fences. The parser handles both.
- **Puppeteer reuses cached Chromium** — `pdf.js` points to the existing cache. `page.pdf()` returns `Uint8Array` in Puppeteer v22+, always wrap with `Buffer.from()` before `res.send()`.
- **Two-audience design** — `executiveSummary` is plain English for CISOs/board; `analystSummary` is technical with IOCs/CVEs for SOC teams.
- **GCC regional focus** — the system prompt prioritises Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, Oman and threat actors APT33, APT34, OilRig, Lazarus, Turla.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `OTX_API_KEY` | No | AlienVault OTX — skipped gracefully if absent |
| `PORT` | No | Server port, defaults to `3003` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if cache is moved |

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

## Non-goals

- Persistent briefing history (only latest briefing is stored)
- User accounts or authentication
- Production Redis cache
- Email or Slack delivery
