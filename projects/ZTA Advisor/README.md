# ZTA Advisor

A presales tool that guides engineers through a structured Zero Trust Architecture assessment with a prospect, producing a maturity gap analysis, prioritized remediation roadmap, and AI-generated executive narrative.

[Project Specification](PROJECT_SPEC.md)

## What it does

1. **Profile** — Captures org name, industry, size, and geography; auto-suggests ZTA frameworks by region with override
2. **Assess** — 35-question structured interview across 6 ZTA pillars (Identity, Devices, Networks, Applications, Data, Visibility)
3. **Report** — Deterministic maturity scoring (1–4 per pillar), gap analysis table, prioritized roadmap, Claude-generated executive summary, and PDF export

## Supported frameworks

| Region | Frameworks |
|---|---|
| US Commercial | CISA ZTMM v2.0, NIST SP 800-207 |
| US Defense | DoD ZT Reference Architecture, NIST SP 800-207 |
| UK | NCSC Zero Trust Principles |
| EU | ENISA ZT Guidelines, NIS2 Directive |
| APAC | ISO/IEC 27001:2022 |
| Global | NIST SP 800-207, ISO 27001 |

## Stack

- **Backend** — Node.js / Express (ESM), port 3005
- **Frontend** — Vite + React, port 5180
- **AI** — Anthropic Claude (one call per session for narrative; app fully functional without it)
- **PDF** — Puppeteer

## Quick start

```bash
# 1. Backend
cd backend
cp ../.env.example .env        # add ANTHROPIC_API_KEY
npm install
npm run dev

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5180

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | — | Enables executive narrative generation |
| `CLAUDE_MODEL` | No | `claude-haiku-4-5-20251001` | Model for narrative generation |
| `PUPPETEER_EXECUTABLE_PATH` | No | auto | Override Chrome path for PDF export |
| `PORT` | No | `3005` | Backend port |
| `CORS_ORIGIN` | No | `http://localhost:5180` | Allowed frontend origin |

## Scoring

Answers map to maturity levels 1–4:

| Score | CISA ZTMM Label | Meaning |
|---|---|---|
| 1 | Traditional | Perimeter-based, no ZT controls |
| 2 | Initial | Some ZT elements, inconsistently applied |
| 3 | Advanced | ZT controls broadly deployed — **target** |
| 4 | Optimal | Continuous, automated ZT enforcement |

Target maturity is hardcoded to **3 (Advanced)**. Change `TARGET_MATURITY` in `backend/routes/analyze.js` to adjust.

## Adding content

- **Questions** — edit `backend/data/questions.json` (id, pillar, sequence, text, rationale, options[])
- **Controls** — edit `backend/data/controls.json` (pillar → "N-to-N+1" → controls[])
- **Frameworks** — edit `backend/data/frameworks.json` (frameworks[] and geoMapping{})
