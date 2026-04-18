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
npm run demo:prep           # reset + seed baseline + health check
npm run seed                # inject baseline alert history (low/medium only)
npm run reset               # clear alerts and incidents (tickets persist)

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

The app is a **laptop-runnable MDR service simulation** for presales demos. All state is in-memory; there is no database.

```
frontend/src/App.jsx         React SPA (single file, no router)
        ↕ REST + WebSocket
api/server.js                Express + Socket.io gateway
        ↓
api/state.js                 Singleton in-memory store (alerts[], incidents[], tickets[], scenarioRuns Map, playbooks)
        ↓
api/routes/analyst.js        POST /api/analyst/triage — runs ARIA, applies escalation logic
api/routes/tickets.js        GET/POST /api/tickets, PATCH /:id/status
api/routes/control.js        /reset, /seed, /health
        ↓
engine/scenario-runner.js    Orchestrates timed playbook events, background noise intervals, auto-ticket logic
engine/event-generator.js    Builds individual alert objects from fixtures + playbook seeds; computes risk_score
engine/correlator.js         Groups alerts into incidents by scenario:${scenario_id} or mitre_tactic:dest_hostname key
        ↓
engine/playbooks/*.json      Three scenario definitions with timed event sequences and pinned dest_hostname
data/*.json                  Fixtures: hosts, users, MITRE TTPs, CVEs, geo sources, traffic profiles
        ↓
analyst/triage-agent.js      Calls Anthropic API (ARIA) or falls back to local summarizeAlert()
analyst/provider-adapter.js  Anthropic SDK wrapper with model fallback chain
analyst/escalation.js        shouldEscalate(): risk_score >= 8 or asset_criticality === "high"
analyst/ticket-factory.js    buildTicket(): shared ticket creation logic for auto and manual tickets
```

### Key data flow

1. `api/state.js` is loaded once at startup — reads all JSON fixtures and playbooks into a singleton shared by all route handlers.
2. `scenario-runner.js` schedules `setTimeout` per playbook event and `setInterval` for background noise. Each fires `emitAlert()` → `buildAlert()` → `upsertIncident()` → Socket.io broadcast (`alert:new`, `incident:updated`).
3. Auto-ticket logic in `emitAlert()`: fires `buildTicket()` and emits `ticket:created` only when `alert.scenario_id` is set, severity is high/critical, and the incident has no existing non-resolved ticket. Re-ticketing is allowed when the existing ticket is resolved.
4. Background noise events (low/medium only) create incidents but never auto-create tickets.
5. The frontend connects via Socket.io and listens for `alert:new`, `incident:updated`, `ticket:created`, `operator:reset`, `scenario:*` events.
6. ARIA triage runs on demand via `POST /api/analyst/triage` — calls Anthropic if `ANTHROPIC_API_KEY` is set, otherwise returns deterministic local fallback. Applies `shouldEscalate()` to override `recommended_action`.
7. Manual ticket creation via `POST /api/tickets` with `alert_id` + `summary`; returns 409 if ticket already exists for that alert.
8. `PATCH /api/tickets/:id/status` accepts `open | in_progress | resolved`.

### Audience modes

Three views toggled via `?mode=analyst|manager|ciso` or the in-app buttons. Each changes both the KPI panel and the main content area:

| Mode | KPI cards | Main panel |
|---|---|---|
| `analyst` | Alerts in Queue · Critical · High · Privileged Account Hits | Live alert table + ARIA investigation panel |
| `manager` | Active Threats · Open Tickets · In Progress · Resolved | Incident response table + campaign banner |
| `ciso` | Active Incidents · Threats Contained · Services Affected · Business Risk | Active incident cards (high/critical or ticketed, non-resolved) |

### CISO / Manager incident filter

Both views apply the same filter: show an incident if `(severity is high/critical OR has a non-resolved ticket) AND ticket is not resolved`. Resolving a ticket removes the incident from both views.

### Ticket lifecycle

- **Auto-ticket**: fires in `emitAlert()` when `alert.scenario_id` is set + severity high/critical + incident has no non-resolved ticket.
- **Manual ticket**: `POST /api/tickets` from the frontend after ARIA analysis.
- **Persistence**: tickets survive `reset` (which clears only alerts and incidents). Only an app restart clears tickets.
- **Re-ticketing**: if a ticket is resolved and the same scenario runs again, `alreadyTicketed` excludes resolved tickets so a fresh ticket is created.

Ticket fields: `id`, `source` (auto/analyst), `assignee` ("MDR Operations" for auto-tickets, "MDR Analyst" for manual), `incident_id`, `alert_id`, `created_at`, `severity`, `status`, `title`, `threat_summary`, `mitre_mapping`, `response_actions[]` (shown as timeline), `customer_action`.

### Scenario lifecycle

Scenarios run indefinitely once started — there is no `duration_seconds` auto-end timer. The only way to end a scenario is `stopAllScenarios()` (triggered by the Stop Scenario button or `npm run scenario:stop`). `scenario:started` now includes `{ total_events, name }` so the frontend can display a progress indicator.

### Speed multiplier

The frontend sends `speed_multiplier` (1, 2, or 5) in the `POST /api/scenarios/trigger` body. The scenario route passes it to `runScenario()`, which divides all `delay_seconds` values by `speedMultiplier`. Useful for compressed demos in short time slots.

### Playbook format

Each `engine/playbooks/*.json` must have `id`, `duration_seconds` (kept for reference but no longer used as an auto-end timer), and `events[]`. Each event needs `delay_seconds`, `severity`, `event_type`, `mitre_tactic`, `mitre_technique_id`, and `dest_hostname` (pins the event to a specific host for coherent attack chain narrative).

### Background noise

`BACKGROUND_EVENTS` in `scenario-runner.js` contains only low and medium severity events. High severity is excluded to keep the CISO/Manager views meaningful — high/critical incidents should only appear from scenario-driven chains.

Seed events (`POST /api/seed`) follow the same constraint.

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
- Server is localhost-only (middleware blocks non-127.0.0.1/::1 requests).
