# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start both together (preferred):**
```bash
npm run dev  # runs node scripts/dev.mjs which spawns server + client
```

**Start backend only:**
```bash
npm run dev --workspace server  # node --watch src/index.js — http://localhost:3002
```

**Start frontend only:**
```bash
npm run dev --workspace client  # Vite — http://localhost:5175
```

**Install dependencies:**
```bash
npm install  # installs all workspaces from root
```

**Health check:**
```bash
curl http://localhost:3002/api/health
```

**Trigger analysis manually (curl example):**
```bash
curl -X POST http://localhost:3002/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"rawEmail": "From: attacker@evil.com\nSubject: Urgent action required..."}'
```

## Architecture

An **AI-powered phishing email analyser** that combines deterministic pattern checks with OpenAI structured output to classify and score suspicious emails. Supports paste, `.eml` file upload, and PDF report export via Puppeteer.

```
client/src/             React SPA — email input (paste/upload), results UI, PDF export
        ↕ REST (fetch via Vite proxy → /api)
server/src/index.js     Express server — CORS, body parsing, route registration
        ↓
server/src/routes/
  analyze.js            POST /api/analyze — deterministic checks + OpenAI narrative
  report.js             POST /api/report  — Puppeteer PDF generation
        ↓
OpenAI API              Narrative layer only — summaries + compliance explanations (structured output)
        ↓
Puppeteer               Headless Chrome — HTML report → PDF
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:3002`. No CORS issues in dev.

## Key design decisions

- **Hybrid analysis** — deterministic engine computes all structured data (verdict, risk score, findings, MITRE tactics, compliance gaps, recommendations); OpenAI is called only for the narrative layer (summaries, compliance explanation text, confidence score).
- **Dual-framework compliance** — every analysis produces both NCA ECC-2:2024 and ISO 27001 gap sets; the frontend toggle switches views without re-analyzing. The PDF export reflects whichever framework was active at download time.
- **OpenAI structured output** — uses `narrativeJsonSchema` (4-field schema) with the Responses API, `reasoning: { effort: 'minimal' }`, and `max_output_tokens: 1500` for low-latency narration. Default model: `gpt-5-nano`.
- **Async deterministic checks** — `runDeterministicChecks(parsedEmail)` is async; it awaits RDAP domain age lookups. Always `await` it in `routes/analyze.js`.
- **Puppeteer for PDF** — `page.pdf()` returns `Uint8Array` in Puppeteer v22+; always wrap with `Buffer.from()` before `res.send()`.
- **5 MB request limit** — body parser set to `5mb` to accommodate `.eml` file uploads.
- **CORS locked to frontend** — `CLIENT_ORIGIN` env var controls allowed origin; defaults to `http://localhost:5175`.
- **Monorepo with workspaces** — `server` and `client` are npm workspaces; Vite and other dev tools are hoisted to root `node_modules`.
- **Campaign fingerprinting** — `routes/analyze.js` maintains last-20 fingerprints in memory (`fromDomain|returnPathDomain|cssObfuscated`). Fingerprint `"||0"` is excluded to avoid false positives on emails with no infrastructure signals.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for phishing classification |
| `OPENAI_MODEL` | No | `gpt-5-nano` | OpenAI model for analysis |
| `PORT` | No | `3002` | Backend server port |
| `CLIENT_ORIGIN` | No | `http://localhost:5175` | Allowed CORS origin |

Copy `.env.example` → `.env` and fill in `OPENAI_API_KEY`.

## Ports

| Service | Port |
|---------|------|
| Backend (Express) | `3002` |
| Frontend (Vite) | `5175` → proxies `/api` to `:3002` |

## Key project files

- `PROJECT_SPEC.md` — full feature and schema specification (always at project root, never in `docs/`)
- `server/src/index.js` — Express server, CORS config, route registration
- `server/src/routes/analyze.js` — hybrid phishing analysis (deterministic + OpenAI narrative); campaign fingerprint store
- `server/src/routes/report.js` — Puppeteer PDF generation (accepts `framework` param and `analystNote`)
- `server/src/parsing/emailParser.js` — MIME multipart decode, base64/QP, link pair extraction, CSS obfuscation detection
- `server/src/rules/deterministicChecks.js` — all 15 detection signals, IOC extraction, domain age lookup (async)
- `server/src/services/domainAge.js` — RDAP lookup with 24h in-memory cache, 3.5s timeout
- `server/src/mappings/eccMappings.js` — NCA ECC-2:2024 and ISO 27001 control libraries, framework-aware gap builder
- `server/src/services/openaiAnalysis.js` — score breakdown (`computeFallbackRisk`), IOC assembly, OpenAI narrative fetch
- `server/src/prompts/analyzeEmail.js` — narrative-only prompt (`buildNarrativeMessages`)
- `server/src/services/reportTemplate.js` — HTML report template (verdict card, score breakdown sidebar, IOC table, compliance, analyst note)
- `server/src/middleware/rateLimit.js` — in-memory rate limiter (10 req/min/IP)
- `client/src/App.jsx` — root component: state, analyst note textarea, campaign banner, download button
- `client/src/components/IocPanel.jsx` — IOC chip display (sender/reply-to/return-path/URL chips)
- `client/src/components/FindingsPanel.jsx` — findings with `HighlightedExcerpt` (URL/domain highlighting)
- `client/src/components/RiskScoreCard.jsx` — score ring + collapsible score breakdown toggle
- `client/src/components/EccPanel.jsx` — compliance gaps with NCA ECC / ISO 27001 framework toggle
- `client/vite.config.js` — Vite config with `/api` proxy to `:3002`
- `scripts/dev.mjs` — custom dev runner that spawns both server and client
- `.env.example` — environment variable template

## Session-end checklist (mandatory — do not skip)

At the end of **every** session, before closing:

1. **Update `Downloads\MEMORY.md`** — add any new rules, patterns, decisions, or corrections that would be useful in a future session. This is the cross-project memory file. It is separate from the per-project `.claude\projects\...\memory\MEMORY.md` — both must be updated.
2. **Sync and push** — confirm the repo is up to date with all changes made during the session.

`Downloads\MEMORY.md` is the most commonly skipped step. It must be updated even when the user does not ask.

## Non-goals

- Live email inbox integration
- Persistent analysis history
- Authentication or multi-user support
- Production deployment (demo/pre-sales tool)
