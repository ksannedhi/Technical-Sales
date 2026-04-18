# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Start the backend (API + WebSocket server):**
```bash
npm run demo:start          # node api/server.js on port 3001
```

**Start the frontend (Vite dev server):**
```bash
cd frontend && npm run dev  # http://localhost:5173
```

**Demo operator scripts (run against a live backend on port 3001):**
```bash
npm run demo:health         # verify backend is up
npm run demo:prep           # seed baseline + pre-warm state
npm run seed                # inject baseline alert history
npm run reset               # clear all alerts, incidents, running scenarios

npm run scenario:phishing        # trigger phishing-credential-lateral
npm run scenario:ransomware      # trigger ransomware-precursor
npm run scenario:cloud-identity  # trigger cloud-identity-abuse
npm run scenario:stop            # stop all running scenarios
```

**Frontend build:**
```bash
cd frontend && npm run build    # outputs to frontend/dist/
```

**Windows launcher (opens backend + frontend together):**
```
Double-click: Launch SOC Twin.cmd
```
Installs dependencies if needed, runs demo:prep (reset + seed + health), then opens backend and frontend in separate windows.

## Architecture

The app is a **laptop-runnable SOC simulation** for presales demos. All state is in-memory; there is no database.

```
frontend/src/App.jsx         React SPA (single file, no router)
        ↕ REST + WebSocket
api/server.js                Express + Socket.io gateway
        ↓
api/state.js                 Singleton in-memory store (alerts[], incidents[], scenarioRuns Map, playbooks)
        ↓
engine/scenario-runner.js    Orchestrates timed playbook events, background noise intervals
engine/event-generator.js    Builds individual alert objects from fixtures + playbook seeds
engine/correlator.js         Groups alerts into incidents by scenario_id or mitre_tactic:dest_hostname key
        ↓
engine/playbooks/*.json      Three scenario definitions with timed event sequences
data/*.json                  Fixtures: hosts, users, MITRE TTPs, CVEs, geo sources, traffic profiles
        ↓
analyst/triage-agent.js      Calls Anthropic API (ARIA) or falls back to local template
analyst/provider-adapter.js  Anthropic SDK wrapper with model fallback chain
analyst/escalation.js        Escalation logic: risk_score >= 8 or asset_criticality == "high"
```

### Key data flow

1. `api/state.js` is loaded once at startup — it reads all JSON fixtures and all playbooks from `engine/playbooks/` into a singleton object shared by all route handlers.
2. `scenario-runner.js` schedules `setTimeout` calls per playbook event and a `setInterval` for background noise. Each fires `emitAlert()` → `buildAlert()` → `upsertIncident()` → Socket.io broadcast.
3. The frontend connects via Socket.io and listens for `alert:new`, `incident:updated`, `operator:reset`, `scenario:*` events. It also polls `GET /api/health` every 10 s.
4. The ARIA analyst triage runs on demand via `POST /api/analyst/triage` — it calls Anthropic if `ANTHROPIC_API_KEY` is set, otherwise returns a deterministic local fallback.

### Audience modes

The frontend exposes three views (`?mode=analyst|manager|ciso`) that change the dashboard title, KPI cards, and the last alert table column — all driven from the `VIEW_COPY` / `VIEW_LABEL` constants in `App.jsx`. No backend change is needed to switch modes.

### Playbook format

Each `engine/playbooks/*.json` file must have `id`, `duration_seconds`, and an `events[]` array. Each event needs `delay_seconds`, `severity`, `event_type`, `mitre_tactic`, and `mitre_technique_id`. The scenario runner uses `delay_seconds` divided by `speedMultiplier` to schedule timeouts.

## Environment variables

Copy `.env.example` to `.env`. Key vars:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `ANTHROPIC_API_KEY` | _(empty)_ | If unset, ARIA uses local fallback |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-latest` | Model for triage; has fallback chain |
| `EVENT_RATE_MS` | `3200` | Background noise interval (ms) |
| `SCENARIO_NOISE_MS` | `1200` | Noise interval during active scenario |

Frontend uses `VITE_API_URL` and `VITE_WS_URL` (both default to `http://127.0.0.1:3001`).

## Constraints

- Only one scenario can run at a time; `runScenario` throws if another is active.
- Alert array is capped at 500 entries in memory; the frontend keeps the latest 60.
- All containment actions are simulated — no real infrastructure calls are made.
