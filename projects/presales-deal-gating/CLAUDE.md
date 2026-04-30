# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the app (preferred — use the launcher):**
```
Double-click: start.cmd
```
The launcher sets `PYTHONPATH`, optionally uses a local Python install, and opens the browser automatically.

**Start manually:**
```bash
set PYTHONPATH=src
set PDG_OPEN_BROWSER=1
python app.py  # http://127.0.0.1:8020
```

**Run tests:**
```bash
set PYTHONPATH=src
python -m unittest discover -s tests
```

**Verify syntax:**
```bash
python -m py_compile app.py src\presales_gate_engine.py src\file_ingest.py tests\test_engine.py
```

## Architecture

A **local presales deal gating tool** built on Python's built-in `wsgiref` WSGI server — no external web framework or frontend build step. All UI is rendered server-side as HTML.

```
app.py                      WSGI server + all route handlers + HTML rendering
        ↓
src/presales_gate_engine.py Scoring engine — readiness gates across Requirements, Architecture, Proposal
src/file_ingest.py          File ingestion — .txt, .md, .docx, .pptx, .pdf, .zip extraction
        ↓
data/gate_config.json       Tunable scoring weights, thresholds, and heuristic settings
```

**Session state** is held in in-memory Python lists (`SESSION_REVIEWS`, `FLASH_MESSAGES`). It resets when the server restarts.

## Key design decisions

- **No external framework** — `wsgiref.simple_server` keeps the stack minimal and avoids dependency conflicts. No Flask, no FastAPI, no Node.
- **No frontend build** — HTML is rendered directly in `app.py`. No Vite, no React, no npm.
- **Port via env var** — `PORT` defaults to `8020`. Override with `set PORT=<n>` before running. The `start.cmd` does not set PORT, so it always uses the default.
- **PYTHONPATH=src** — all imports from `src/` require this to be set. The launcher handles it; set it manually if running directly.
- **`PDG_OPEN_BROWSER=1`** — when set, the app opens the browser automatically after a short delay.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8020` | Server listen port |
| `PDG_OPEN_BROWSER` | unset | Set to `1` to auto-open browser on startup |
| `PYTHONPATH` | must be `src` | Required for local module imports |

## Ports

| Service | Port |
|---------|------|
| Web app (wsgiref) | `8020` |

## Key project files

- `app.py` — WSGI server, all route handlers, HTML rendering, session management
- `src/presales_gate_engine.py` — scoring engine (requirements, architecture, proposal gates)
- `src/file_ingest.py` — file extraction helpers (docx, pptx, pdf, zip, txt, md)
- `data/gate_config.json` — scoring weights, thresholds, heuristic settings
- `docs/PRODUCT_SPEC.md` — full product and behaviour spec
- `tests/test_engine.py` — regression coverage for scoring and ingestion
- `start.cmd` — Windows launcher (sets PYTHONPATH, optionally uses local Python)

## Non-goals

- Multi-user support (single-session local tool)
- Persistent deal history across restarts
- Document generation output
- Cloud/SaaS deployment
