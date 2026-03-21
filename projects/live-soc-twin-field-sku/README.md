# SOC Twin (v1)

Laptop-first simulated SOC environment for cybersecurity presales demos.

## Baseline

- Backend background noise rate: 3200 ms
- Scenario noise rate: 1200 ms
- Recommended concurrent scenarios: 1 (enforced)
- Store: in-memory with alert cap (500)
- Branding: generic
- AI provider preference: Claude via Anthropic

## Quick launch (recommended)

```bash
npm.cmd run demo:launch
```

This launcher:
- Installs missing dependencies (backend + frontend)
- Starts backend in one terminal
- Runs `demo:prep` (reset + seed + health)
- Starts frontend in another terminal

Open: `http://localhost:5173`

## Manual start

1. Backend:

```bash
npm.cmd install
npm.cmd run demo:start
```

2. Frontend:

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

## Configuration

Backend `.env`:
- `PORT`
- `DEMO_BRAND`
- `DEMO_MODE`
- `EVENT_RATE_MS`
- `SCENARIO_NOISE_MS`
- `MAX_EVENTS_PER_SECOND`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_API_KEY`

Frontend optional `.env`:
- `VITE_API_URL`
- `VITE_WS_URL`

## Operator commands

```bash
npm.cmd run demo:prep
npm.cmd run demo:health
npm.cmd run scenario:phishing
npm.cmd run scenario:ransomware
npm.cmd run scenario:cloud-identity
npm.cmd run scenario:stop
npm.cmd run reset
```

## Stopping the demo

- UI stop (scenario only): Click `Stop Scenario`
- Full stop from terminal:
  - Backend window: `Ctrl+C`
  - Frontend window: `Ctrl+C`
- Closing both command windows also stops services.

## Runbooks

- Main script + talk track + discovery:
  - `runbooks/demo-script-talk-track-discovery.md`
- 10-minute executive script + FAQ:
  - `runbooks/executive-10min-script-and-faq.md`
- Quick operator start:
  - `runbooks/demo-quickstart.md`

## Notes

- v1 uses deterministic synthetic alerts for repeatable demos.
- No destructive payloads are executed.
- AI triage uses Anthropic when `ANTHROPIC_API_KEY` is configured, and falls back locally if not.
- The supported analyst assistant is `ARIA (Automated Response & Investigation Assistant)`.
- In Analyst mode, alert rows are selectable. After selecting a row, the UI prompts you to scroll to the bottom to run ARIA analysis.
- Scenario start buttons are disabled while another scenario is running.
## Audience Mode behavior

Switching mode now changes visible dashboard content:
- Header title changes by mode (`Analyst Operations Console`, `SOC Manager Operations View`, `Executive Risk View`)
- Live table last column changes:
  - Analyst -> `MITRE`
  - SOC Manager -> `Status`
  - CISO -> `Service`
- KPI card content changes to role-specific metrics
## Audience Mode screenshots

Analyst mode:
![Analyst mode](runbooks/assets/audience-analyst.png)

SOC Manager mode:
![SOC Manager mode](runbooks/assets/audience-manager.png)

CISO mode:
![CISO mode](runbooks/assets/audience-ciso.png)
