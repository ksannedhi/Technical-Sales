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
  analyze.js            POST /api/analyze — deterministic checks + OpenAI classification
  report.js             POST /api/report  — Puppeteer PDF generation
        ↓
OpenAI API              Structured output for phishing classification and scoring
        ↓
Puppeteer               Headless Chrome — HTML report → PDF
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:3002`. No CORS issues in dev.

## Key design decisions

- **Hybrid analysis** — deterministic checks (SPF/DKIM headers, suspicious domains, urgency keywords) run first; OpenAI enriches with classification, confidence score, and ECC threat mapping.
- **OpenAI structured output** — uses `response_format: { type: "json_object" }` to guarantee parseable JSON from the model.
- **Puppeteer for PDF** — same approach as threat-briefing; `page.pdf()` returns `Uint8Array` in Puppeteer v22+, always wrap with `Buffer.from()` before `res.send()`.
- **5 MB request limit** — body parser is set to `5mb` to accommodate `.eml` file uploads.
- **CORS locked to frontend** — `CLIENT_ORIGIN` env var controls allowed origin; defaults to `http://localhost:5175`.
- **Monorepo with workspaces** — `server` and `client` are npm workspaces. Vite and other dev tools are hoisted to root `node_modules`.

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

- `server/src/index.js` — Express server, CORS config, route registration
- `server/src/routes/analyze.js` — hybrid phishing analysis (deterministic + OpenAI)
- `server/src/routes/report.js` — Puppeteer PDF generation
- `client/src/` — React SPA with email input, analysis results, export button
- `client/vite.config.js` — Vite config with `/api` proxy to `:3002`
- `scripts/dev.mjs` — custom dev runner that spawns both server and client
- `.env.example` — environment variable template

## Non-goals

- Live email inbox integration
- Persistent analysis history
- Authentication or multi-user support
- Production deployment (demo/pre-sales tool)
