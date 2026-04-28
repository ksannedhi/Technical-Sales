# SOC Twin

Laptop-first simulated MDR (Managed Detection and Response) environment for cybersecurity presales demos.

## Baseline

- Background noise rate: 3200 ms (low/medium severity only)
- Scenario noise rate: 1200 ms
- Concurrent scenarios: 1 (enforced)
- Alert store: in-memory, cap 500 (frontend displays latest 60)
- AI triage: Anthropic Claude (falls back to local template if no API key)

## Quick launch (recommended)

```bash
npm.cmd run demo:launch
```

This launcher installs missing dependencies, runs `demo:prep` (reset + seed + health), then opens backend and frontend in separate terminals.

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

Backend `.env` (copy from `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `ANTHROPIC_API_KEY` | _(empty)_ | If unset, ARIA uses local fallback |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-latest` | Model for triage |
| `EVENT_RATE_MS` | `3200` | Background noise interval (ms) |
| `SCENARIO_NOISE_MS` | `1200` | Noise interval during active scenario |

Frontend optional `.env`:

| Variable | Default |
|---|---|
| `VITE_API_URL` | `http://127.0.0.1:3001` |
| `VITE_WS_URL` | `http://127.0.0.1:3001` |

## Operator commands

```bash
npm.cmd run demo:prep           # reset + seed baseline + health check
npm.cmd run demo:health         # verify backend is up
npm.cmd run scenario:phishing   # trigger phishing-credential-lateral
npm.cmd run scenario:ransomware # trigger ransomware-precursor
npm.cmd run scenario:cloud-identity # trigger cloud-identity-abuse
npm.cmd run scenario:stop       # stop active scenario
npm.cmd run reset               # clear alerts and incidents (tickets persist)
npm.cmd run seed                # inject baseline alert history
```

## Audience modes

The dashboard has three role-specific views toggled via the **Audience Mode** buttons. Each shows a distinct KPI panel and main content area:

| Mode | KPIs | Main panel |
|---|---|---|
| **Analyst** | Alerts in Queue · Critical · High · Privileged Account Hits (all real-time counters) | Live alert table (7 cols, MITRE tooltip on hover) + ARIA investigation panel |
| **SOC Manager** | Active Threats · Open Tickets · In Progress · Resolved | Incident response table with ticket status + campaign banner |
| **CISO** | Active Incidents · Threats Contained · Services Affected · Business Risk | Active incident cards showing business service names, techniques, users, and linked ticket |

Modes can also be set via URL: `?mode=analyst`, `?mode=manager`, `?mode=ciso`.

## Operator controls

All scenario controls are in the top bar:

- **1× / 2× / 5× speed toggle** — compresses scenario event timing before starting (disabled while a scenario is running)
- **Start / Stop Scenario** — scenarios run indefinitely until manually stopped
- **Reset** — clears alerts and incidents; tickets persist
- **Health dot** — green/red indicator showing live backend connectivity
- **Scenario progress** — once a scenario starts, shows "▶ Phishing to Lateral Movement — Stage 2/3: Password Spray Detected"

## Customer Tickets tab

The **Customer Tickets** tab (next to SOC Dashboard) is the MDR service's customer-facing ticket portal.

- **Auto-tickets**: created automatically when a scenario-driven incident reaches its first high or critical alert. One ticket per incident.
- **Analyst tickets**: created manually after ARIA analysis via the "Create Ticket" button in the investigation panel.
- Ticket list shows: ID, severity, title, assignee, source (Auto/Analyst), age, status.
- Ticket detail shows: threat summary, MITRE mapping, MDR response timeline, customer action required, status controls.
- Tickets persist across `reset` — only an app restart clears them.
- Ticket statuses: `open` → `in progress` → `resolved`. A resolved ticket can be reopened.
- Resolving a ticket removes its incident from the CISO and SOC Manager views.

## ARIA analyst assistant

ARIA (Automated Response & Investigation Assistant) is available in Analyst mode:

1. Click any alert row to select it.
2. Scroll to the investigation panel at the bottom.
3. Click `Analyze Selected Alert` to run ARIA triage.
4. After analysis, click `Create Ticket` to manually raise a customer ticket.

ARIA uses Anthropic Claude when `ANTHROPIC_API_KEY` is configured, and a deterministic local fallback otherwise.

## Scenarios

Three attack chains are available, each pinned to specific hosts for a coherent narrative:

| Scenario | Chain | Hosts |
|---|---|---|
| Phishing → Lateral Movement | Initial Access → Credential Access → Lateral Movement | WS-HR-13 → DC-01 → FILE-01 |
| Ransomware Precursor | Execution → Privilege Escalation → Impact | WS-FIN-22 → WS-FIN-22 → FILE-01 |
| Cloud Identity Abuse | Defense Evasion → Persistence → Collection | APP-CRM-01 throughout |

Auto-ticket fires on the first high/critical event in each chain (~25–35 s after start).

## Stopping the demo

- UI stop (scenario only): Click `Stop Scenario`
- Full stop: `Ctrl+C` in both terminal windows

## Runbooks

| Runbook | Purpose |
|---|---|
| `runbooks/demo-script-talk-track-discovery.md` | Full 20-30 min script with SE talk track and discovery questions |
| `runbooks/executive-10min-script-and-faq.md` | 10-min executive script and common Q&A |
| `runbooks/demo-quickstart.md` | Minimal operator start procedure |
| `runbooks/operator-checklist.md` | Pre-demo checklist |

## Notes

- No destructive payloads are executed — containment actions are simulated only.
- Only one scenario can run at a time; the UI disables other scenario buttons while one is active.
- Background noise events (low/medium only) generate incidents but never auto-create tickets.

## Documentation

- Full product spec: [SOC_Twin_Field_SKU_v1_SPEC.md](docs/SOC_Twin_Field_SKU_v1_SPEC.md)
