# CLAUDE.md — Cross-Framework Harmoniser

## What this project does

Full-stack GCC regulatory compliance tool. Takes an organisation profile (geography, sector, data types), recommends applicable frameworks, runs parallel Claude analysis across 24 control domains, produces a unified coverage matrix and weighted implementation roadmap. Exports to Excel and PDF. Includes a Change Tracker tab for assessing framework version changes.

---

## Ports

| Role | Port |
|------|------|
| Backend (Express) | 3004 |
| Frontend (Vite + React) | 5179 |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+, Express, ESM (`"type": "module"`) |
| Frontend | React 18, Vite 5, plain CSS |
| AI | Anthropic Claude API — `claude-haiku-4-5` |
| PDF export | Puppeteer (landscape A4) |
| Excel export | ExcelJS |
| PDF ingestion | pdf-parse (imported as `pdf-parse/lib/pdf-parse.js` for ESM compat) |

---

## Key files

```
CLAUDE.md                              this file
Launch Cross-Framework Harmoniser.cmd  single-click launcher (no PS1)
.env.example                           copy to .env, add ANTHROPIC_API_KEY
server/
  index.js          Express app + all API routes
  prompt.js         Claude system prompts + prompt builders + taxonomy loader
  harmonise.js      parallel domain analysis, in-memory cache, roadmap generation
  changeTracker.js  framework change impact analysis
  customFramework.js PDF ingestion + custom framework store (in-memory)
  excel.js          ExcelJS matrix export
  pdf.js            Puppeteer PDF export
  reportTemplate.js HTML template for PDF
  taxonomy.json     24 domain × 14 framework control mapping (v5.0) — do not regenerate
client/src/
  App.jsx                    top-level state machine (intake → frameworks → harmonising → matrix → posture → roadmap)
  components/IntakeForm.jsx
  components/FrameworkSelector.jsx   includes custom framework PDF upload
  components/ProgressBar.jsx
  components/CoverageMatrix.jsx
  components/PostureAssessment.jsx
  components/Roadmap.jsx
  components/ExportPanel.jsx
  components/ChangeTracker.jsx
```

---

## Commands

```bash
# First run — from project root
cp .env.example .env          # then add ANTHROPIC_API_KEY

npm install                   # installs all workspace packages

# Dev (two terminals)
npm run dev --workspace server   # backend on :3004
npm run dev --workspace client   # frontend on :5179

# Or just double-click:
Launch Cross-Framework Harmoniser.cmd
```

Health check: `GET http://localhost:3004/api/health` → `{ status: "ok", domains: 24, frameworks: 14 }`

---

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness check |
| GET | `/api/taxonomy` | Full taxonomy JSON |
| POST | `/api/intake` | Framework recommendation from profile |
| GET | `/api/harmonise/stream` | SSE — parallel domain analysis (up to 24 Claude calls) |
| POST | `/api/roadmap` | Weighted roadmap from harmonisation + posture |
| POST | `/api/export/excel` | Download Excel matrix |
| POST | `/api/export/pdf` | Download PDF report |
| POST | `/api/change-tracker/documents` | Compare two framework PDFs |
| POST | `/api/change-tracker/description` | Analyse described change |
| POST | `/api/cache/clear` | Reset harmonisation cache |
| POST | `/api/frameworks/custom` | Upload and ingest custom framework PDF |
| GET | `/api/frameworks/custom` | List custom frameworks |
| DELETE | `/api/frameworks/custom/:id` | Remove custom framework |

---

## Architecture notes

- **Harmonisation cache**: `harmonise.js` caches results in a module-level `Map` keyed by `domainId + sorted framework list`. Adding/removing one framework only recomputes affected domains.
- **Custom frameworks**: stored in-memory in `customFrameworkStore` — lost on server restart (intentional for demo).
- **taxonomy.json**: pre-built from actual framework documents (v5.0). Do not regenerate. Contains 24 domains × 14 frameworks (NCA-ECC, SAMA-CSF, CBK, ISO-27001, NIST-CSF, UAE-NIAF, PCI-DSS, IEC-62443, SOC2, PDPL-UAE, PDPL-QAT, QATAR-NIAS, PDPL-KSA, KUWAIT-NBCC).
- **Concurrency**: `runWithConcurrency(domains, 2, fn)` — max 2 simultaneous Claude calls during harmonisation. 429 rate-limit responses are retried with 15s/30s/60s backoff (up to 4 attempts).
- **dotenv**: `import 'dotenv/config'` in `server/index.js` reads `.env` from `process.cwd()`. The launcher runs node from the project root so `.env` is found correctly. Do not run the server from inside `server/` directly.
- **pdf-parse ESM**: must import as `pdf-parse/lib/pdf-parse.js`, not `pdf-parse`.
- **Puppeteer PDF**: landscape A4. If Chromium auto-download fails, set `executablePath` in `server/pdf.js` to point at the system Chrome installation.
- **SSE streaming**: `/api/harmonise/stream` uses `text/event-stream`. Do not add response buffering middleware upstream of this route.

---

## Launcher convention

Single `.cmd` file — no PS1. Follows the same pattern as `threat-briefing`. Clears ports, installs on first run, bootstraps `.env`, opens backend and frontend in separate PowerShell windows with a 3-second stagger.
