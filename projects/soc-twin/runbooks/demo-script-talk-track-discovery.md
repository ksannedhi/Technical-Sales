# Live SOC Twin — Demo Script, SE Talk Track, and Discovery Questions

## 1) Demo Script (20-30 minutes)

### 0. Pre-demo (2 min)

- Run: `npm.cmd run demo:prep`
- Confirm backend health and seeded baseline alerts.
- Open dashboard in Analyst mode; keep terminal accessible for scenario commands.

SE line:
"This is a deterministic SOC twin — a safe, repeatable simulation of a live MDR service. What you see here reflects how our analysts and systems respond on your behalf."

---

### 1. Baseline operations (3 min)

- Show Analyst mode KPI cards: Alerts in Queue, Critical, High, Privileged Account Hits.
- Point out background traffic — low and medium severity only, no false escalations.
- Click a live alert row and call out that alerts are selectable.
- Scroll to the investigation panel and run `Analyze Selected Alert` to show ARIA triage.
- After analysis, show the `Create Ticket` button — explain this is the analyst manually raising a customer ticket.

SE line:
"Before any attack simulation, this is normal MDR operating state: managed queue, ATT&CK-mapped telemetry, and consistent triage context available on demand."

SE line:
"ARIA is our analyst copilot. It summarises what matters and recommends an action — but the analyst stays in control of the decision."

---

### 2. Scenario 1: Phishing → Credential Access → Lateral Movement (8 min)

- Click `Start Phishing Scenario`.
- Narrate the chain as events appear: WS-HR-13 (initial access) → DC-01 (password spray) → FILE-01 (SMB lateral movement).
- At ~25 s, a customer ticket is auto-raised. Point out the banner notification.
- Navigate to **Customer Tickets** tab — show the auto-ticket with:
  - Response actions our team is taking (isolate host, block IP, suspend user)
  - Customer action guidance (reset credentials, verify MFA)

SE line:
"The moment the threat crosses a severity threshold, we auto-raise a customer ticket — no analyst prompt needed. Your team sees exactly what we're doing and what you need to do."

SE line:
"We correlated three events across three hosts into a single incident narrative, mapped to ATT&CK Initial Access through Lateral Movement."

---

### 3. Audience pivot (4 min)

- Switch to **SOC Manager** mode.
- Show KPI cards: Active Threats, Open Tickets, In Progress, Resolved.
- Show Incident Response Overview table: incident name, severity, alert count, impacted assets, ticket ID, status.
- Note the campaign banner: "Active threat campaign: phishing credential lateral."
- Switch to **CISO** mode.
- Show Executive Risk Summary cards: Active Incidents, Threats Contained, Services Affected, Business Risk (colour-coded).
- Show Active Incident cards — each card shows techniques, impacted assets/users, and linked ticket.

SE line:
"Same event stream, three stakeholder outcomes. The analyst sees the alert queue and triage tools. The manager sees operational load and ticket pipeline. The CISO sees business risk and containment progress."

---

### 4. Ticket resolution and risk clearance (2 min)

- Go to Customer Tickets tab, mark the ticket as Resolved.
- Switch back to CISO mode — show that the incident card disappears and Business Risk drops.
- Switch to SOC Manager — show Active Threats count decrements.

SE line:
"Resolving the ticket closes the loop — the CISO view clears and risk posture updates in real time. This is what contained looks like."

---

### 5. Scenario 2: Ransomware Precursor (6 min)

- Click `Start Ransomware Scenario`.
- Narrate: WS-FIN-22 (macro execution) → WS-FIN-22 (privilege escalation) → FILE-01 (mass file encryption behaviour).
- Emphasise: safe simulation, no destructive payload. Auto-ticket fires at ~35 s.
- Show CISO view escalating to Critical risk.

SE line:
"This is the earliest credible intervention point before ransomware impact. Detecting and responding here — not at encryption — is where MDR maturity creates measurable business value."

---

### 6. Close and reset (2-3 min)

- Click `Stop Scenario` if active.
- Click `Reset` — confirm alerts and incidents clear; tickets remain in history.
- Show clean baseline KPIs.

SE line:
"Full reset in under 30 seconds. We can rerun any scenario for any audience, or swap in the Cloud Identity Abuse chain if that better matches your threat model."

---

## 2) SE Talk Track (modular)

### Opening
"Today I'll show a live MDR service twin — realistic attack simulations without touching production systems. The goal is to validate detection-to-response outcomes and show what your team sees, at every level."

### Value framing
"Three outcomes: faster analyst triage, cleaner incident correlation, and clearer executive risk communication — all from the same live event stream."

### During alerts
"We're not chasing individual noisy events. We're building a coherent incident narrative mapped to ATT&CK techniques — the way a mature MDR team thinks."

### During incident escalation
"The decision at this point is not 'is this bad' — it's 'how fast can we contain it while minimising analyst fatigue and keeping your team informed.'"

### During ticket creation
"This is the customer portal view. Every time we act, you see it. Every time you need to act, we tell you exactly what to do."

### Executive framing
"For leadership, the metric that matters is reduced blast radius and time to containment — not alert count. The CISO view shows risk in those terms."

### Objection responses
- **"This is synthetic data"**: "Correct — deterministic by design so demos are stable and comparable across sessions. In POV, we map your real telemetry and controls."
- **"Can you integrate with our tools?"**: "This demo proves operational value first. Integration depth is scoped in the next phase based on your required sources."
- **"AI makes autonomous decisions?"**: "No. ARIA is a triage assistant only. Analyst approval remains the control gate for every action."
- **"Too basic for our environment?"**: "This is the field demo version. We build custom scenario packs matched to your actual threat model in the POV phase."

### Close
"If this aligns with your SOC priorities, the next step is mapping your top two attack paths into this twin and running a joint success criteria workshop."

---

## 3) Discovery Questions

### A. Before demo (qualification)
1. "Which SOC KPI matters most this quarter: MTTD, MTTR, false positives, or analyst workload?"
2. "Which two attack paths are highest risk for your environment today?"
3. "Where do investigations break down most often: visibility, correlation, or response coordination?"
4. "Who signs off on MDR platform decisions: SOC leadership, CISO office, or architecture team?"

### B. During demo (calibration)
1. "Does this incident timeline match what your analysts currently see, or is your process noisier?"
2. "Would this escalation threshold fit your current policy and staffing model?"
3. "Which view resonates most with your stakeholders: analyst, manager, or executive?"
4. "When an incident is raised, who in your organisation currently gets notified and how?"

### C. After demo (next-step qualification)
1. "If we map your real controls into this flow, what proof would you need to move to POV?"
2. "What timeline are you targeting for a pilot decision?"
3. "Which integrations are mandatory in phase one?"
4. "What would block adoption even if detection and response outcomes improve?"

---

## 4) Operator Notes

- Run `demo:prep` before every session — do not skip even if the backend is already running.
- Check the **health dot** is green before starting — a red dot means the backend is unreachable.
- **Speed multiplier**: set before clicking Start. 1× for a full-length demo, 2× for a 15-minute slot, 5× for a rapid boardroom walk-through. The button is disabled while a scenario is running.
- Scenarios **do not auto-end** — they run until `Stop Scenario` is clicked. Use this to hold the narrative at any stage.
- If queue volume climbs too quickly, use `Stop Scenario` and pivot to Manager or CISO framing.
- Only one scenario runs at a time — the UI enforces this; do not attempt to run two in parallel.
- Tickets persist across `reset` — use this intentionally to show historical ticket context if relevant.
- The Cloud Identity Abuse scenario is a good alternative opener for cloud-heavy audiences.
- End every session with `Stop Scenario` → `Reset` and confirm clean KPI state before the next run.
