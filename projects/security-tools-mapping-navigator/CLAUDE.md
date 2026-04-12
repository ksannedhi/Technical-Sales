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

## Architecture

A **security tools-to-controls mapping navigator** that ingests a CSV of security tools and maps them to NIST CSF 2.0 and CIS Controls v8 frameworks. Analysis is deterministic (rule-based + alias enrichment) with SQLite persistence.

```
frontend/src/           React SPA — CSV upload, framework selector, gap analysis view
        ↕ REST (fetch via Vite proxy → /api)
backend/app/main.py     FastAPI app — CORS, route registration
        ↓
backend/app/
  routes/               /api/analyze, /api/projects, /api/export
  services/             Mapping engine, alias enrichment, gap analysis
  models/               Pydantic models
  db/                   SQLite persistence (projects and results)
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:8010`. No CORS issues in dev.

## Key design decisions

- **Isolated Python deps via `--target`** — no venv; launcher installs packages to `backend/.deps` and sets `PYTHONPATH`. This avoids conflicts with system Python.
- **No external AI API** — analysis is entirely rule-based using a curated tool-to-control mapping database. No API key required.
- **SQLite persistence** — projects and results are saved to a local SQLite file, surviving server restarts.
- **Deterministic mapping** — vendor/product aliases are resolved before mapping so `"CrowdStrike Falcon"` and `"Falcon EDR"` both map correctly.
- **Frontend-only `node_modules`** — backend uses `--target` dep isolation; frontend uses standard npm install in `frontend/`.

## Environment variables

No environment file required. All configuration is embedded in the launcher or defaults.

| Variable | Set by | Description |
|----------|--------|-------------|
| `PYTHONPATH` | `start.cmd` | Points to `backend/.deps` and `backend/` |

## Ports

| Service | Port |
|---------|------|
| Backend (FastAPI/uvicorn) | `8010` |
| Frontend (Vite) | `5176` → proxies `/api` to `:8010` |

> ⚠️ The launcher (`start.cmd`) uses `--port 8010`. Do not change this without updating the vite proxy target in `frontend/vite.config.js`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/analyze` | Upload CSV and run mapping analysis |
| GET | `/api/projects` | List saved projects |
| DELETE | `/api/projects/{id}` | Delete a project |
| GET | `/api/export/{id}` | Export results as CSV/JSON |

## Key project files

- `backend/app/main.py` — FastAPI app, middleware, route registration
- `backend/app/routes/` — API route handlers
- `backend/app/services/` — mapping engine, alias resolver, gap analyser
- `backend/app/models/` — Pydantic request/response models
- `backend/requirements.txt` — Python dependencies
- `frontend/src/` — React SPA
- `frontend/vite.config.js` — Vite config with `/api` proxy to `:8010`
- `start.cmd` — self-contained Windows launcher (installs deps, starts both services)

## Non-goals

- Cloud/SaaS deployment
- Live tool inventory sync (manual CSV upload only)
- AI-powered gap recommendations
- Authentication or multi-user support
