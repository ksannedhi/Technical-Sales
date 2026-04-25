# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start both (preferred — use the launcher):**
```
Double-click: Launch Threat-to-Business Translator.cmd
```
The launcher creates a Python venv, installs deps, and opens backend and frontend in separate windows.

**Start backend manually:**
```bash
cd backend
.venv\Scripts\activate        # Windows
# or: source .venv/bin/activate  # macOS/Linux
uvicorn app.main:app --reload  # http://localhost:8000
```

**Start frontend manually:**
```bash
cd frontend && npm run dev  # http://localhost:5178
```

**Set up backend venv from scratch:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Install frontend dependencies:**
```bash
cd frontend && npm install
```

**Health check:**
```bash
curl http://localhost:8000/health
```

## Architecture

A **threat-to-business narrative translator** that converts raw technical security evidence (CVEs, SOC alerts, vulnerability scan reports) into executive-ready risk summaries. Built-in synthetic scenarios allow demos without customer data.

```
frontend/src/           React SPA — scenario selector, file/text input, risk narrative output
        ↕ REST (fetch via Vite proxy → /api)
backend/app/main.py     FastAPI app — CORS, route registration
        ↓
backend/app/
  routes/               /api/scenarios, /api/translate, /api/analyze
  services/
    translator.py       Core narrative generation logic
    data_loader.py      Loads built-in scenario cards
  models.py             Pydantic response models
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:8000`. No CORS issues in dev.

**File input:** Accepts `.pdf`, `.txt`, `.csv`, `.json`, `.log`. PDFs are parsed with `pypdf`.

## Key design decisions

- **Python venv (not --target)** — uses a standard `.venv` inside `backend/`. The launcher handles venv creation and activation automatically.
- **Built-in scenario library** — `data_loader.py` loads pre-written scenarios so demos run without any external API or customer data.
- **Organisation risk profile** — all translation endpoints accept profile parameters (revenue, employee count, security maturity, etc.) to contextualise output for a specific organisation.
- **pypdf for document parsing** — PDF text extraction is handled locally; no external OCR service.
- **uvicorn default port** — backend runs on uvicorn's default port `8000`. No `--port` flag used in the launcher.
- **Fully deterministic** — no LLM or external API. All scoring, narrative generation, and matching is deterministic Python.

## Engine internals (translator.py)

Key constants:
- `MINIMUM_MATCH_SCORE = 4` — keyword score threshold below which the generic fallback fires instead of binding to a specific template's BU/service context. Prevents sparse CVE titles (e.g. a single "cve-" match) from inheriting unrelated fictional context.
- `FALLBACK_SIGNAL_CAP = 3` — caps `exploitability` and `threat_activity` when the fallback template fires. Template-authored values (often 4–5) reflect confirmed incidents, not a sparse CVE title.

Key functions:
- `_infer_scenario()` — scores every `SCENARIO_MATCHERS` template against the input text, picks the best match above threshold, or fires the generic fallback.
- `_derive_signal_factors()` — adjusts `exploitability` and `threat_activity` from defaults using conditional language detection (strong: −2; moderate: −1) and confirmed severity signals (+1 each).
- `_neutralise_fallback_context()` — replaces all template-sourced BU/service/asset/identity fields with neutral placeholders when the fallback fires. Risk scores and loss figures are preserved.
- `_resolve_service()` — matches a customer-provided free-text service name against the domain using exact name, partial name, BU name, and `_SERVICE_KEYWORDS` synonym map.
- `_derive_executive_trigger()` — extracts the first clean sentence (split at `.`) up to 280 chars with word-boundary truncation.

`/api/analyze` accepts an optional `affected_service` form field. When provided it is resolved via `_resolve_service()` and used to override the template-matched BU/service context, while the CVE text continues to drive signal factor scoring.

## Environment variables

No `.env` file required. The engine is fully deterministic and offline.

## Ports

| Service | Port |
|---------|------|
| Backend (FastAPI/uvicorn) | `8000` |
| Frontend (Vite) | `5178` → proxies `/api` to `:8000` |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/default-profile` | Returns default organisation risk profile |
| GET | `/api/scenarios` | List built-in scenario cards |
| GET | `/api/translate/{scenario_id}` | Translate a built-in scenario with org profile |
| POST | `/api/analyze` | Analyze pasted text or uploaded file |

## Key project files

- `backend/app/main.py` — FastAPI app, middleware, all route handlers
- `backend/app/services/translator.py` — core translation/narrative logic
- `backend/app/services/data_loader.py` — built-in scenario card loader
- `backend/app/models.py` — Pydantic request/response models
- `backend/requirements.txt` — Python dependencies (fastapi, uvicorn, pypdf, python-multipart)
- `frontend/src/` — React SPA with scenario browser and file upload
- `frontend/vite.config.js` — Vite config with `/api` proxy to `:8000`
- `Launch Threat-to-Business Translator.cmd` — Windows entry point; handles venv creation, dependency install, and spawns backend and frontend in separate PowerShell windows inline (no separate .ps1 script)

## Non-goals

- Persistent report storage
- Authentication or multi-user support
- Live threat feed integration
- Production deployment (local pre-sales demo tool)
