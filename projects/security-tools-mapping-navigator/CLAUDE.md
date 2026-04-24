# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start both (preferred — use the launcher):**
```
Double-click: start.cmd
```
The launcher installs backend deps to `backend/.deps` and starts both services.

**Start backend manually:**
```bash
# From project root — must set PYTHONPATH to include .deps
set PYTHONPATH=backend\.deps;backend
cd backend
python -m uvicorn app.main:app --reload --port 8010
```

**Start frontend manually:**
```bash
cd frontend && npm run dev  # http://localhost:5176
```

**Install frontend dependencies:**
```bash
cd frontend && npm install
```

**Install backend dependencies (isolated, no venv):**
```bash
python -m pip install -r backend/requirements.txt --target backend/.deps
```

**Health check:**
```bash
curl http://localhost:8010/health
```

**AI enrichment status:**
```bash
curl http://localhost:8010/ai-status
```

## Architecture

A **security tools-to-controls mapping navigator** that ingests a CSV of security tools and
maps them to NIST CSF 2.0 and CIS Controls v8.1 frameworks.  Analysis is deterministic
(rule-based + alias enrichment) with SQLite persistence.  An optional AI enrichment mode
sends vague rows to the Claude API for control ID suggestions before analysis runs.

```
frontend/src/App.jsx         React SPA — CSV upload, AI toggle, framework selector, results
        ↕  HTTP (direct to http://127.0.0.1:8010)
backend/app/main.py          FastAPI app — CORS, dotenv load, route registration
backend/app/services/
  csv_parser.py              Schema validation, CSV → ToolControlRow list
  enricher.py                Optional AI enrichment (batch Claude API call)
  analyzer.py                Mapping engine, alias enrichment, gap/redundancy/roadmap logic
  storage.py                 SQLite CRUD
backend/data/navigator.db    SQLite (auto-created, gitignored)
backend/.env                 Optional — ANTHROPIC_API_KEY (gitignored)
```

**No Vite proxy** — the frontend calls `http://127.0.0.1:8010` directly; FastAPI CORS allows `*`.

## Key design decisions

- **Isolated Python deps via `--target`** — no venv; launcher installs packages to `backend/.deps`
  and sets `PYTHONPATH`. Avoids conflicts with system Python.
- **Deterministic analysis by default** — no API key required for standard use.
- **Optional AI enrichment** — `enricher.py` resolves two failure modes: vague `control_objective`
  text and niche vendors not in `ALIAS_TOKEN_MAP`.  Enabled only when `ANTHROPIC_API_KEY` is set.
  The frontend checks `/ai-status` on mount and shows the toggle only if enabled.
- **SQLite persistence** — projects and results survive server restarts.
- **Deterministic mapping** — vendor/product aliases resolved before mapping so
  `"CrowdStrike Falcon"` and `"Falcon EDR"` both map correctly.

## Environment variables

| Variable | Set by | Description |
|----------|--------|-------------|
| `PYTHONPATH` | `start.cmd` | Points to `backend/.deps` and `backend/` |
| `ANTHROPIC_API_KEY` | `backend/.env` | Optional — enables AI enrichment toggle in the UI |

Copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY` to enable AI enrichment.

## Ports

| Service | Port |
|---------|------|
| Backend (FastAPI/uvicorn) | `8010` |
| Frontend (Vite) | `5176` |

> The launcher (`start.cmd`) uses `--port 8010`. Do not change without also checking
> that the frontend `API_BASE` constant in `frontend/src/App.jsx` stays in sync.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ai-status` | Returns `{"enabled": true/false}` for AI enrichment availability |
| POST | `/analyze` | Upload CSV and run analysis (`framework`, `mapping_file`, `project_name`, `use_ai_enrichment`) |
| GET | `/projects` | List saved projects |
| GET | `/projects/{id}` | Load saved project |
| DELETE | `/projects/{id}` | Delete a project |
| GET | `/export?format=json\|csv` | Export last in-memory analysis |

## Key project files

- `backend/app/main.py` — FastAPI app, dotenv load, `/ai-status` endpoint
- `backend/app/models.py` — Pydantic models (`ToolControlRow.ai_enriched`, `AnalysisResponse.enriched_count`)
- `backend/app/services/enricher.py` — AI enrichment batch call and response parsing
- `backend/app/services/analyzer.py` — ALIAS_TOKEN_MAP, CONTROL_LIBRARY, gap/redundancy/roadmap
- `backend/app/services/csv_parser.py` — CSV schema validation
- `backend/app/services/storage.py` — SQLite persistence
- `backend/requirements.txt` — Python deps (includes anthropic, python-dotenv)
- `backend/.env.example` — template for the optional API key
- `frontend/src/App.jsx` — full SPA including AI toggle
- `frontend/src/styles/globals.css` — design tokens, print CSS

## Non-goals

- Cloud/SaaS deployment
- Live tool inventory sync (manual CSV upload only)
- Authentication or multi-user support
