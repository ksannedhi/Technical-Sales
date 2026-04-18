# Demo Quickstart

## Start

1. Terminal 1 — backend:
   ```
   npm.cmd run demo:start
   ```

2. Terminal 2 — prep:
   ```
   npm.cmd run demo:prep
   ```

3. Terminal 3 — frontend:
   ```
   cd frontend && npm.cmd run dev
   ```

4. Open `http://localhost:5173`

## Flow

1. **Analyst mode** — show KPI cards (all real-time) and live alert table. Hover a MITRE ID to see the technique name.
2. Click any alert row → scroll to investigation panel → click `Analyze Selected Alert` to show ARIA triage.
3. After ARIA analysis, click `Create Ticket` to manually raise a customer ticket.
4. **Start Phishing Scenario** — watch the scenario progress banner ("Stage 1/3 → 2/3 → 3/3"). Auto-ticket fires at ~25 s.
5. **Customer Tickets tab** — show the auto-raised ticket: assignee, age, response timeline, customer action.
6. **SOC Manager mode** — show Active Threats KPI, incident response table, campaign banner.
7. **CISO mode** — show Active Incidents cards with business service names ("CRM (APP-CRM-01)") and linked ticket.
8. Resolve ticket in Customer Tickets → confirm incident drops from CISO and Manager views.
9. **Stop Scenario** → **Reset** → confirm clean state before next run.

## Tips

- Run `demo:prep` before every customer session — it resets alerts/incidents and seeds clean baseline.
- Use **2× or 5× speed** for a compressed demo — set before clicking Start.
- Scenarios run until **Stop Scenario** is clicked — they do not auto-end.
- Tickets persist across reset; only an app restart clears them (useful for demonstrating historical context).
- The health dot in the top bar shows live backend connectivity — check it goes green before starting.
