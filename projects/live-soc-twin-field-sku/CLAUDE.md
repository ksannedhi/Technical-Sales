# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the backend:**
```bash
node api/server.js
```
Run from the project root. Reads `.env` via `dotenv/config` in server.js.

**Start the frontend (Vite dev server):**
```bash
cd frontend && npm run dev  # http://localhost:5173
```

**Install dependencies:**
```bash
# Backend (root)
npm install

# Frontend
cd frontend && npm install
```

**Trigger a scenario manually (requires server running on :3001):**
```bash
node scripts/trigger-scenario.js phishing-credential-lateral
node scripts/trigger-scenario.js ransomware-precursor
node scripts/trigger-scenario.js cloud-identity-abuse
node scripts/stop-scenarios.js
```

**Health check:**
```bash
curl http://localhost:3001/
```

**Reset demo state:**
```bash
node scripts/reset.js
```

## Architecture

A **real-time SOC Twin demo** that simulates a live Security Operations Centre environment for pre-sales and field demonstrations. Events stream to the frontend via WebSocket (Socket.io).

```
frontend/src/           React SPA — receives real-time alerts via Socket.io
        ↕ Socket.io + REST
api/server.js           Express + Socket.io server — state, scenarios, event emitter
        ↓
engine/scenario-runner.js   Scenario playbook engine
        ↓
api/state.js            In-memory SOC state (alerts, incidents, scenarios)
        ↓
api/routes/
  alerts.js             GET /api/alerts
  incidents.js          GET /api/incidents
  scenarios.js          POST /api/scenarios/:id/start, /stop
  control.js            POST /api/reset, /api/prep
```

**Three audience modes (configurable via DEMO_MODE):**
- `analyst` — raw alert feed, full IOC data
- `manager` — grouped incidents, MTTR metrics
- `ciso` — executive risk summary, business impact

## Key design decisions

- **No database** — all state is in-memory (`api/state.js`). `node scripts/reset.js` to clear between demos.
- **Socket.io for real-time** — avoids polling; frontend receives events instantly as scenarios fire.
- **Background noise** — `runner.startBackgroundNoise()` emits low-severity alerts continuously to make the dashboard feel live even with no active scenario.
- **OpenAI optional** — `OPENAI_API_KEY` enriches scenario narratives with AI-generated descriptions. Falls back to static text if absent.
- **Frontend is standalone** — lives in `frontend/` with its own `package.json` and `node_modules`. Not a workspace.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Backend port |
| `DEMO_BRAND` | No | `SOC Twin Demo` | Organisation name shown in UI |
| `DEMO_MODE` | No | `true` | Enables demo-specific UX |
| `EVENT_RATE_MS` | No | `3200` | Interval between background noise events |
| `SCENARIO_NOISE_MS` | No | `1200` | Interval between scenario events |
| `MAX_EVENTS_PER_SECOND` | No | `4` | Rate limiter for event emission |
| `OPENAI_API_KEY` | No | — | Enriches scenario narratives via GPT |
| `OPENAI_MODEL` | No | `gpt-4.1-mini` | OpenAI model for narrative generation |

Copy `.env.example` → `.env` and fill in `OPENAI_API_KEY` if AI narratives are needed.

## Ports

| Service | Port |
|---------|------|
| Backend (Express + Socket.io) | `3001` |
| Frontend (Vite) | `5173` |

Frontend has no vite proxy — Socket.io and REST calls go directly to `http://localhost:3001`.

## Key project files

- `api/server.js` — Express + Socket.io server, route registration, background noise startup
- `api/state.js` — in-memory SOC state (alerts, incidents, active scenarios)
- `engine/scenario-runner.js` — playbook engine, scenario lifecycle management
- `api/routes/alerts.js` — alert list endpoint
- `api/routes/incidents.js` — incident grouping endpoint
- `api/routes/scenarios.js` — scenario start/stop endpoints
- `api/routes/control.js` — reset and prep endpoints
- `api/middleware/errorHandler.js` — centralised error handling
- `scripts/trigger-scenario.js` — CLI to trigger scenarios manually
- `scripts/reset.js` — reset all state between demos
- `scripts/demo-prep.js` — seed initial demo data
- `frontend/src/` — React SPA with Socket.io client

## Non-goals

- Persistent storage (demo resets are intentional)
- Multi-user sessions
- Production alert ingestion (this is simulation only)
- Authentication
