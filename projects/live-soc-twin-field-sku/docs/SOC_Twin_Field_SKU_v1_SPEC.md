# Live SOC Twin for Demos - v1 Spec

## 1) Objective

Build a laptop-runnable, deterministic SOC simulation that looks and behaves like a live SOC, with one-click scenario control, reliable reset, and clear buyer outcomes for cybersecurity presales demos.

Success criteria:
- Full demo runtime: 20-30 minutes without backend intervention.
- Reset time: under 5 minutes.
- Repeatability: 10 consecutive dry runs pass.
- Story value: analyst, SOC manager, and CISO views from the same scenario.

## 2) Scope

In scope:
- Simulated enterprise entities (users, hosts, services, crown jewels).
- Synthetic telemetry and attack scenarios mapped to MITRE ATT&CK.
- SIEM-style dashboard with live alert stream and incident correlation.
- AI analyst copilot for triage summaries.
- Operator controls: trigger, pause, stop, speed, reset, seed.

Out of scope (v1):
- Real malware payload execution.
- Production integration with customer systems.
- Full SOAR actioning on real infrastructure.
- Multi-tenant deployment.

## 3) Core Principles

- Demo-first: reliability and story quality over maximum realism.
- Deterministic runs: no dependence on internet attack noise.
- Safe operations: simulated containment actions only.
- Fast setup/teardown: one command start, one command reset.
- Portable: runs on a single laptop (offline-capable where practical).

## 4) Reference Architecture

Layers:
1. Simulated Enterprise
2. Telemetry Fabric
3. Detection and Correlation
4. Scenario Orchestrator
5. Demo Control Plane and Dashboards

```text
Demo UI (SOC Console + KPI views)
        |
API + WebSocket Gateway
        |
Simulation Engine (scenario-runner, event-generator, correlator)
        |
Data Store (in-memory, optional SQLite)
        |
Playbooks + Fixtures (hosts/users/TTP/CVE/geo/profiles)
```

## 5) Recommended v1 Stack

Core app:
- Frontend: React + Vite + Tailwind + Recharts
- Backend: Node.js + Express + Socket.io
- Store: In-memory default, optional SQLite fallback
- Packaging: Docker Compose (optional), npm scripts first

AI analyst:
- Anthropic-backed `ARIA (Automated Response & Investigation Assistant)` with local fallback when no API key is configured.

Note:
- Keep SIEM visual style, but do not integrate full external SIEM tooling in v1.
- Simulate SIEM/SOAR workflows in-app to maximize portability and reset speed.

## 6) Repository Structure

```text
soc-twin/
|-- frontend/
|-- api/
|-- engine/
|-- data/
|-- analyst/
|-- runbooks/
|-- scripts/
|-- package.json
`-- .env.example
```

## 7) Event and Incident Data Contracts

Alert schema (required fields):
- id, timestamp, severity, status, event_type
- mitre_tactic, mitre_technique_id, mitre_technique_name
- source_ip, source_geo, dest_ip, dest_hostname, dest_user
- process_name, cve_id, raw_log
- scenario_id, incident_id
- business_service
- asset_criticality

Incident schema (minimum):
- id, title, severity, status
- first_seen, last_seen
- alert_ids[]
- primary_tactic, techniques[]
- impacted_assets[], impacted_users[]
- recommended_action

## 8) API and WebSocket Contract

REST endpoints:
- GET /api/alerts
- GET /api/alerts/:id
- PATCH /api/alerts/:id/status
- GET /api/incidents
- GET /api/incidents/:id
- POST /api/scenarios/trigger
- POST /api/scenarios/stop
- POST /api/scenarios/pause
- POST /api/scenarios/resume
- POST /api/reset
- POST /api/seed
- GET /api/health
- POST /api/analyst/triage (optional)

WebSocket events:
- alert:new
- alert:updated
- incident:new
- incident:updated
- scenario:started
- scenario:event
- scenario:paused
- scenario:resumed
- scenario:ended
- operator:reset
- analyst:token (optional)
- analyst:done (optional)

## 9) Scenario System (v1)

Initial scenario packs:
1. Phishing -> Credential Theft -> Lateral Movement
2. Ransomware precursor behavior (safe simulation)
3. Cloud identity compromise -> privilege abuse

## 10) Demo UX Requirements

Views:
- Analyst view
- SOC manager view
- CISO view

Audience mode visible behavior:
- Title changes by mode
- Last table column changes: MITRE / Status / Service
- KPI card changes by mode

Operator controls:
- Trigger scenario
- Stop scenario
- Set speed multiplier
- Pause/resume
- Reset
- Seed historical baseline alerts

Analyst interaction:
- Alerts are selectable in Analyst mode.
- After selecting an alert, the user is prompted to scroll to the bottom investigation panel.
- `Analyze Selected Alert` runs ARIA triage for the selected alert.

## 11) Security and Safety Constraints

- No real destructive payloads.
- Simulated containment only.
- No hardcoded secrets.
- Local-only by default.
- Include "Demo Data Only" banner/watermark in UI.

## 12) Non-Functional Targets

- Cold start to ready: <= 3 minutes.
- Memory target: <= 3 GB on laptop baseline.
- Event throughput: 2-20 events/sec configurable.
- UI latency for new event display: < 1 second.
- Reset command complete: <= 5 minutes.

## 13) Delivery Plan

What was built quickly:
- Repo and app skeleton
- Schemas and in-memory store
- Scenario engine and core playbooks
- Analyst, SOC Manager, and CISO audience modes
- Demo launcher, prep/reset flow, and runbooks

What remains for hardened v1:
- Richer scenario branching and decision-dependent outcomes
- Deeper health checks and operational logging
- Formal repeatability evidence across multiple dry runs
- Additional polish for executive storytelling and demo resilience

Expected hardening window:
- MVP: built in days
- Hardened v1: 2 to 4 weeks depending on polish, testing, and scenario depth

## 14) Roles

- Presales architect
- Security engineer
- Full-stack engineer
- Demo operator

## 15) Acceptance Test Checklist

- demo:start healthy
- demo:prep successful
- Scenario runs end-to-end
- Correlation and mapping correct
- Pause/resume/speed controls functional
- reset returns clean state
- Buyer views show distinct outcomes

## 16) Risks and Mitigations

- Demo instability under load -> cap rates, pre-test hardware
- LLM latency/outage -> adapter + fallback templates
- Scope creep -> lock v1 to three scenarios
- Credibility gaps -> realistic logs and ATT&CK-consistent chains

## 17) v1 Command Surface

- npm.cmd run demo:launch
- npm.cmd run demo:start
- npm.cmd run demo:prep
- npm.cmd run demo:health
- npm.cmd run scenario:phishing
- npm.cmd run scenario:ransomware
- npm.cmd run scenario:cloud-identity
- npm.cmd run scenario:stop
- npm.cmd run reset

## 18) v1 Exit Criteria

Ship v1 when:
- Acceptance checklist passes
- 10 consecutive dry runs pass
- Operator can run and reset unassisted
- Presales narrative lands for analyst, manager, and executive audiences
