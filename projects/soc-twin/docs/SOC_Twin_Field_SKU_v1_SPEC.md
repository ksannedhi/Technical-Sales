# Live SOC Twin — Field SKU v1 Spec

## 1) Objective

Build a laptop-runnable, deterministic MDR (Managed Detection and Response) service simulation that demonstrates what a live MDR engagement looks like — from analyst triage through customer ticket delivery — using one-click attack scenarios, reliable reset, and three audience-specific views for presales demos.

Success criteria:
- Full demo runtime: 20–30 minutes without backend intervention.
- Reset time: under 30 seconds.
- Repeatability: 10 consecutive dry runs pass with no state contamination.
- Story value: analyst, SOC manager, and CISO views driven from the same event stream, each showing distinct stakeholder outcomes.
- Customer ticket loop: auto-ticket fires within 35 s of scenario start; ticket resolution reflects in CISO risk posture in real time.

## 2) Scope

In scope:
- Simulated enterprise entities (users, hosts, services, crown jewels).
- Synthetic telemetry and attack scenarios mapped to MITRE ATT&CK.
- MDR-style dashboard: live alert stream, incident correlation, customer ticket lifecycle.
- AI analyst copilot (ARIA) for on-demand triage summaries.
- Operator controls: trigger, stop, speed, reset, seed.
- Three audience modes with distinct KPIs and main panels.

Out of scope (v1):
- Real malware payload execution.
- Production integration with customer systems.
- Full SOAR actioning on real infrastructure.
- Multi-tenant deployment.
- Scenario pause/resume.

## 3) Core Principles

- MDR narrative first: every feature must reinforce the "managed service" story — analyst triage, auto-escalation, customer notification, risk clearance.
- Deterministic runs: no dependence on internet attack noise.
- Safe operations: simulated containment actions only.
- Fast setup/teardown: one command start, one command reset.
- Portable: runs on a single laptop, offline-capable when no API key is configured.

## 4) Reference Architecture

```text
Demo UI (SOC Console — Analyst / SOC Manager / CISO + Customer Tickets)
        |
API + WebSocket Gateway  (Express + Socket.io, port 3001)
        |
Simulation Engine
  ├── scenario-runner.js   (setTimeout playbook events + setInterval background noise)
  ├── event-generator.js   (builds alert objects from fixtures + playbook seeds)
  └── correlator.js        (groups alerts → incidents by scenario_id or tactic:host key)
        |
In-Memory State Singleton  (api/state.js)
  alerts[]  incidents[]  tickets[]  scenarioRuns Map
        |
Playbooks + Fixtures
  engine/playbooks/*.json   (three scenario definitions)
  data/*.json               (hosts, users, MITRE TTPs, CVEs, geo sources, traffic profiles)
        |
Analyst Module
  analyst/triage-agent.js      (calls Anthropic API or local fallback)
  analyst/provider-adapter.js  (SDK wrapper + model fallback chain)
  analyst/escalation.js        (risk_score >= 8 or asset_criticality == "high")
  analyst/ticket-factory.js    (builds customer tickets with response timeline + customer action)
```

## 5) Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (port 5173) |
| Backend | Node.js + Express + Socket.io (port 3001) |
| Store | In-memory singleton — no database |
| AI analyst | Anthropic API (`claude-3-5-haiku-latest`) with deterministic local fallback |
| Packaging | npm scripts; `Launch SOC Twin.cmd` for Windows one-click start |

No Tailwind. No SQLite. The `globals.css` file owns all styling.

## 6) Repository Structure

```text
soc-twin/
├── frontend/
│   ├── src/
│   │   ├── App.jsx          (single-file React SPA — all views)
│   │   └── styles/globals.css
│   └── package.json
├── api/
│   ├── server.js            (Express + Socket.io entry)
│   ├── state.js             (singleton in-memory store)
│   └── routes/
│       ├── alerts.js
│       ├── incidents.js
│       ├── control.js       (scenarios, reset, seed, health)
│       └── tickets.js
├── engine/
│   ├── scenario-runner.js
│   ├── event-generator.js
│   ├── correlator.js
│   └── playbooks/
│       ├── phishing-credential-lateral.json
│       ├── ransomware-precursor.json
│       └── cloud-identity-abuse.json
├── analyst/
│   ├── triage-agent.js
│   ├── provider-adapter.js
│   ├── escalation.js
│   └── ticket-factory.js
├── data/
│   └── *.json               (hosts, users, MITRE, CVEs, geo, traffic profiles)
├── docs/
│   └── SOC_Twin_Field_SKU_v1_SPEC.md
├── runbooks/
│   ├── demo-quickstart.md
│   ├── demo-script-talk-track-discovery.md
│   ├── operator-checklist.md
│   └── executive-10min-script-and-faq.md
├── scripts/
├── package.json
├── .env.example
└── Launch SOC Twin.cmd
```

## 7) Event and Incident Data Contracts

### Alert schema (required fields)

| Field | Type | Notes |
|---|---|---|
| id | string | UUID |
| timestamp | ISO string | |
| severity | string | low / medium / high / critical |
| status | string | open / acknowledged / closed |
| event_type | string | Human-readable label |
| mitre_tactic | string | ATT&CK tactic name |
| mitre_technique_id | string | e.g. T1566.001 |
| mitre_technique_name | string | Displayed in MITRE tooltip |
| source_ip | string | |
| source_geo | string | |
| dest_ip | string | |
| dest_hostname | string | |
| dest_user | string | |
| process_name | string | |
| cve_id | string or null | |
| raw_log | string | |
| scenario_id | string or null | null for background noise |
| incident_id | string or null | set after correlation |
| business_service | string | |
| asset_criticality | string | low / medium / high |
| risk_score | number | 1–10; drives auto-escalation at >= 8 |

**Background noise rule**: background and seed events are strictly `low` or `medium` severity. High/critical alerts only originate from scenario playbooks. This enforces the MDR narrative: only scenario chains trigger auto-tickets.

### Incident schema

| Field | Type |
|---|---|
| id | string |
| title | string |
| severity | string |
| status | string |
| first_seen | ISO string |
| last_seen | ISO string |
| alert_ids | string[] |
| scenario_id | string or null |
| primary_tactic | string |
| techniques | string[] |
| impacted_assets | string[] |
| impacted_users | string[] |
| recommended_action | string |

### Ticket schema

| Field | Type | Notes |
|---|---|---|
| id | string | TKT-0001 format |
| source | string | "auto" or "manual" |
| assignee | string | "MDR Operations" (auto) / "MDR Analyst" (manual) |
| incident_id | string or null | links to incident |
| alert_id | string | triggering alert |
| created_at | ISO string | |
| severity | string | |
| status | string | open / in progress / resolved / reopened |
| title | string | `${mitre_tactic}: ${event_type} on ${dest_hostname}` |
| threat_summary | string | from ARIA triage |
| mitre_mapping | string | |
| response_actions | object[] | `{ ts, action, actor }` — timeline of MDR actions |
| customer_action | string | specific next step for the customer |

**Auto-ticket guard**: a ticket is auto-created only when `alert.scenario_id` is set, severity is high/critical, and no non-resolved ticket already exists for the incident. Background events never auto-ticket.

## 8) API and WebSocket Contract

### REST endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /api/alerts | All alerts (latest 500) |
| GET | /api/alerts/:id | Single alert |
| PATCH | /api/alerts/:id/status | Update alert status |
| GET | /api/incidents | All incidents |
| GET | /api/incidents/:id | Single incident |
| GET | /api/tickets | All tickets |
| POST | /api/tickets | Create manual ticket (requires `alert_id`, `summary`) |
| PATCH | /api/tickets/:id/status | Update ticket status |
| POST | /api/scenarios/trigger | Start a scenario (`{ scenario_id, speed_multiplier }`) |
| POST | /api/scenarios/stop | Stop all running scenarios |
| POST | /api/reset | Clear alerts and incidents (tickets persist) |
| POST | /api/seed | Inject baseline low/medium alert history |
| GET | /api/health | Backend liveness check |
| POST | /api/analyst/triage | ARIA triage for a given alert |

Pause and resume are not implemented in v1.

### WebSocket events (server → client)

| Event | Payload | Notes |
|---|---|---|
| alert:new | alert object | Fires on every new alert |
| incident:updated | incident object | Fires whenever an incident is created or updated |
| ticket:created | ticket object | Fires when auto-ticket is raised by escalation logic |
| scenario:started | `{ scenario_id, speedMultiplier, total_events, name }` | |
| scenario:event | `{ scenario_id, step, total, event_type }` | Per-event progress |
| scenario:ended | `{ scenario_id }` | Fires on manual stop only — no auto-end |
| operator:reset | `{}` | Triggers frontend state clear |

## 9) Scenario System

### Scenario packs

| ID | Name | Chain |
|---|---|---|
| phishing-credential-lateral | Phishing → Credential Access → Lateral Movement | WS-HR-13 → DC-01 → FILE-01 |
| ransomware-precursor | Ransomware Precursor | WS-FIN-22 → WS-FIN-22 → FILE-01 |
| cloud-identity-abuse | Cloud Identity Abuse | Cloud identity pivot chain |

Scenarios run until `Stop Scenario` is clicked — there is no auto-end timer. This prevents premature banner dismissal and ensures the operator controls the narrative pace.

### Playbook format

Each `engine/playbooks/*.json` requires:
```json
{
  "id": "scenario-id",
  "name": "Human-readable name",
  "events": [
    {
      "delay_seconds": 10,
      "severity": "high",
      "event_type": "Spearphishing Attachment",
      "mitre_tactic": "Initial Access",
      "mitre_technique_id": "T1566.001"
    }
  ]
}
```

`delay_seconds` is divided by `speedMultiplier` at runtime. `duration_seconds` is not used.

## 10) Demo UX

### Audience modes

Switching modes changes the dashboard title, all KPI cards, and the entire main panel content.

**Analyst mode**
- KPIs: Alerts in Queue, Critical Alerts, High Severity, Privileged Account Hits
- Main panel: live alert table with MITRE tooltip, selectable rows, ARIA investigation panel
- Investigation panel: `Analyze Selected Alert` → ARIA summary → `Create Ticket` button

**SOC Manager mode**
- KPIs: Active Threats, Open Tickets, In Progress, Resolved
- Main panel: Incident Response Overview table (incident name, severity, alert count, impacted assets, ticket ID, status) + active campaign banner

**CISO mode**
- KPIs: Active Incidents, Threats Contained, Services Affected, Business Risk (colour-coded)
- Main panel: Active Incident cards showing techniques, impacted assets with business service names (format: `Service Name (HOSTNAME)`), linked ticket ID

**Business Risk calculation**

Derived from active high/critical incidents and open orphaned tickets (tickets whose incident was cleared by reset):

| Score | Label | Colour |
|---|---|---|
| 0–6 | Normal | Green |
| 7–14 | Elevated | Amber |
| ≥ 15 | Critical | Red |

Weights: critical incident or ticket = 15 pts, high = 7 pts. Resolving a ticket removes it from the score immediately. After reset, open tickets retain their score contribution so Business Risk stays consistent with what the CISO view is displaying.

### Customer Tickets tab

Available in all modes. Shows:
- Ticket list: ID, title, severity badge, assignee, age ("Xm ago"), status badge
- Ticket detail on click: assignee + age in header, vertical response timeline (`{ ts, action, actor }`), customer action guidance

### Operator controls

| Control | Behaviour |
|---|---|
| Health dot | Green = backend connected; Red = unreachable. Polls `GET /api/health` every 10 s via Socket.io connect/disconnect events |
| Speed toggle | 1× / 2× / 5×. Set before clicking Start. Disabled while a scenario is running |
| Start [Scenario] | Triggers playbook; shows scenario progress banner |
| Stop Scenario | Stops active scenario; clears progress banner |
| Reset | Clears alerts and incidents; tickets persist; CISO/Manager retain orphaned ticket context |
| Seed | Injects low/medium baseline history |

Scenario progress banner: `▶ {Scenario Name} — Stage N/Total: {last event type}`. Persists until Stop Scenario is clicked.

### Orphaned ticket handling

After reset, tickets whose incident has been cleared are shown as "orphaned" in CISO and Manager views with a note: *Incident cleared by reset — ticket open*. This correctly models MDR continuity: the alert stream resets for the next scenario but customer-facing tickets remain visible until resolved.

### ARIA interaction flow

1. Select alert in Analyst view.
2. Scroll to investigation panel → `Analyze Selected Alert`.
3. ARIA returns threat assessment and MITRE mapping.
4. `Create Ticket` button appears — analyst manually raises a customer ticket (assignee: MDR Analyst).
5. Auto-tickets are raised independently by escalation logic (assignee: MDR Operations) when scenario severity threshold is met.

## 11) Security and Safety Constraints

- No real destructive payloads.
- Simulated containment only — no infrastructure calls.
- No hardcoded secrets; `.env` file excluded from version control.
- Local-only by default; no external dependencies when API key is absent.
- "DEMO DATA ONLY" banner displayed in UI.

## 12) Non-Functional Targets

| Target | Value |
|---|---|
| Cold start to ready | ≤ 3 minutes |
| Reset time | ≤ 30 seconds |
| Memory | ≤ 3 GB on laptop baseline |
| Alert array cap | 500 in-memory; frontend keeps latest 60 |
| Background noise rate | configurable via `EVENT_RATE_MS` env var (default 3200 ms) |
| Scenario noise rate | `SCENARIO_NOISE_MS` (default 1200 ms during active scenario) |
| UI latency for new event | < 1 second |

## 13) Delivery Status

### Complete

- Repo structure, npm scripts, Windows launcher (`Launch SOC Twin.cmd`)
- In-memory state singleton (`api/state.js`)
- Scenario engine: playbooks, runner, event generator, correlator
- Three scenario packs: phishing, ransomware precursor, cloud identity abuse
- ARIA triage agent with Anthropic API + deterministic local fallback
- Customer ticket lifecycle: auto-raise, manual raise, status transitions
- Ticket factory: response action timeline, customer action guidance, assignee logic
- Three audience modes with distinct KPI panels and main panels
- Customer Tickets tab with vertical timeline and age display
- Operator controls: health dot, speed multiplier (1×/2×/5×), scenario progress banner
- Background noise strictly low/medium — no high/critical outside scenario chains
- Scenario no-auto-end: runs until `Stop Scenario`
- Orphaned ticket display in CISO and Manager after reset
- Runbooks: demo quickstart, operator checklist, full SE talk track + discovery, executive 10-min script

### Not yet built (future iterations)

- Scenario branching and decision-dependent outcomes
- Deeper health checks and operational logging
- Formal repeatability evidence (automated dry-run harness)
- Additional scenario packs matched to specific customer threat models

## 14) Roles

- Presales architect / Demo operator
- Security engineer (scenario and TTP design)
- Full-stack engineer (app build and maintenance)

## 15) Acceptance Test Checklist

- [ ] `npm run demo:start` — backend healthy on port 3001
- [ ] `npm run demo:prep` — reset + seed + health all pass
- [ ] `npm run scenario:phishing` — 3-stage chain fires; auto-ticket created within 35 s
- [ ] `npm run scenario:ransomware` — fires and auto-tickets correctly
- [ ] `npm run scenario:cloud-identity` — fires and auto-tickets correctly
- [ ] Scenario progress banner appears and persists until Stop Scenario
- [ ] Speed multiplier (1×/2×/5×) compresses event timing correctly
- [ ] ARIA triage runs and returns summary (API key present and absent)
- [ ] Manual ticket creation from ARIA panel — ticket appears in Customer Tickets tab
- [ ] Ticket status transitions: open → in progress → resolved → reopened
- [ ] Ticket resolution clears incident from CISO and Manager views
- [ ] Reset clears alerts and incidents; tickets persist; orphaned tickets shown in CISO/Manager
- [ ] Health dot goes red when backend is stopped; green when restored
- [ ] All three audience modes show distinct KPIs and distinct main panels
- [ ] CISO incident cards show business service names (format: `Service (HOSTNAME)`)
- [ ] Background events are low/medium only — no auto-tickets from background noise
- [ ] 10 consecutive dry runs pass with clean state after each reset

## 16) Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Demo instability under load | Alert cap (500), rate throttling via env vars, pre-test hardware |
| LLM latency or outage | Deterministic local fallback in `provider-adapter.js` |
| Scope creep | v1 locked to three scenarios; future packs are additive |
| Credibility gaps | Realistic log payloads, ATT&CK-consistent chains, MITRE technique tooltips |
| Re-ticket on repeated scenario | Guard checks for non-resolved existing ticket before auto-raising |

## 17) Command Surface

```bash
npm run demo:start           # Start backend (port 3001)
npm run demo:prep            # Reset + seed + health check
npm run demo:health          # Verify backend liveness
npm run seed                 # Inject baseline low/medium alerts
npm run reset                # Clear alerts and incidents

npm run scenario:phishing        # Trigger phishing-credential-lateral
npm run scenario:ransomware      # Trigger ransomware-precursor
npm run scenario:cloud-identity  # Trigger cloud-identity-abuse
npm run scenario:stop            # Stop all running scenarios
```

Frontend:
```bash
cd frontend && npm run dev   # Vite dev server on port 5173
cd frontend && npm run build # Production build to frontend/dist/
```

## 18) v1 Exit Criteria

Ship v1 when:
- All acceptance checklist items pass.
- 10 consecutive dry runs pass without manual intervention.
- Operator can run and reset unassisted following the quickstart guide.
- Presales narrative lands clearly for analyst, SOC manager, and executive audiences.
- Customer ticket loop is demonstrable end-to-end (auto-raise → detail view → resolve → risk clearance).
