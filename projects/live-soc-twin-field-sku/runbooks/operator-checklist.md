# Operator Pre-Demo Checklist

## Environment

- [ ] Backend running on port 3001 (`npm.cmd run demo:health` returns OK)
- [ ] Frontend running on port 5173 and loading in browser
- [ ] `.env` present with `ANTHROPIC_API_KEY` set (or confirmed fallback is acceptable)
- [ ] Network isolation confirmed if running at customer site (no external dependencies needed when API key is absent)

## State

- [ ] `npm.cmd run demo:prep` completed successfully (reset + seed + health)
- [ ] KPI cards show low/medium baseline alerts only — no high or critical incidents in CISO view
- [ ] Customer Tickets tab shows 0 open tickets (or prior session tickets if demonstrating history)

## Scenario readiness

- [ ] All three scenario buttons enabled (no active scenario running)
- [ ] `npm.cmd run scenario:phishing` tested and auto-ticket fires at ~25 s
- [ ] `npm.cmd run reset` tested — alerts and incidents clear, tickets persist

## Demo controls

- [ ] Health dot is green in operator controls bar
- [ ] Speed multiplier set to intended pace (1× for full demo, 2× or 5× for compressed slot)
- [ ] ARIA analysis works: select alert → Analyze → summary appears
- [ ] Manual ticket creation works: Analyze → Create Ticket → ticket appears in Customer Tickets tab
- [ ] Ticket status transitions work: open → in progress → resolved → reopen
- [ ] Scenario progress banner appears on start and shows Stage N/3 as events fire
- [ ] Audience Mode switching confirmed: Analyst / SOC Manager / CISO each show distinct KPIs and main panel
- [ ] CISO incident cards show business service names (e.g. "CRM (APP-CRM-01)") — requires at least one scenario alert in state

## Reset and close

- [ ] Clean reset confirmed before handing over or ending session
- [ ] Browser tab closed or refreshed to clear any stale socket state between runs
