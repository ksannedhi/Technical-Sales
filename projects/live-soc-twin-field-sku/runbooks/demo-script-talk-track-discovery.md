# Live SOC Twin - Demo Script, SE Talk Track, and Discovery Questions

## 1) Demo Script (20-30 minutes)

### 0. Pre-demo (2 min)
- Run: `npm.cmd run demo:prep`
- Confirm backend health and seeded baseline alerts.
- Open dashboard and keep terminal visible for scenario control.

SE line:
"This is a deterministic SOC twin, so what you see is repeatable and safe for live decision-making demos."

### 1. Baseline operations (3 min)
- Show Analyst mode.
- Point out normal event flow and low-severity background traffic.
- Show queue discipline: status, severity, MITRE mapping (Analyst mode shows MITRE column).

SE line:
"Before attack simulation, this is your normal SOC operating state: manageable queue, mapped telemetry, and consistent triage context."

### 2. Scenario 1: Phishing -> Credential -> Lateral (8 min)
- Click: `Start Phishing Scenario`
- Narrate sequence as alerts appear.
- Show incident correlation growth and severity shift.
- If needed, stop scenario with `Stop Scenario`.

SE line:
"We move from initial access to credential misuse to lateral movement, and the system correlates this into a single investigation storyline instead of isolated alerts."

### 3. Audience pivot (4 min)
- Switch to SOC Manager mode.
- Highlight open incidents, trend stability, and response load; note the table column changes to `Status`.
- Switch to CISO mode.
- Tie outcome to business services and risk containment; note the table column changes to `Service`.

SE line:
"Same event stream, three stakeholder outcomes: and the UI now changes by role with distinct KPIs and table columns."

### 4. Scenario 2: Ransomware precursor (6 min)
- Click: `Start Ransomware Scenario`.
- Emphasize safe simulation (behavioral precursor, no destructive payload).
- Highlight criticality and recommended escalation behavior.

SE line:
"This demonstrates earliest credible intervention points before impact, which is where response maturity creates measurable value."

### 5. Close and reset (2-3 min)
- Click `Stop Scenario` if active.
- Click `Reset`.
- Confirm clean state in KPI panel.

SE line:
"We can fully reset and rerun this flow in under five minutes for different stakeholder paths or objection testing."

## 2) SE Talk Track (modular)

### Opening
"Today I'll show a live SOC twin that simulates realistic attacks and operations without touching production systems. The goal is to validate detection-to-response outcomes in a repeatable way."

### Value framing
"We focus on three outcomes: faster triage, cleaner incident correlation, and clearer executive risk communication."

### During alerts
"Notice we're not chasing individual noisy events. We're building a coherent incident narrative mapped to ATT&CK techniques."

### During incident escalation
"At this point, the decision is not 'is this bad,' it is 'how fast can we contain while minimizing analyst fatigue.'"

### Executive framing
"For leadership, the key metric is reduced blast radius and time to containment, not just alert count."

### Objection response snippets
- Synthetic data objection:
  "Correct, this is synthetic by design so demos remain stable and comparable across sessions."
- Integration objection:
  "This demo proves operational value first; integration depth is handled in a deeper integration or POV phase."
- AI trust objection:
  "Recommendations are assistive, not autonomous. Analysts retain final control."

### Close
"If this aligns with your SOC priorities, the next step is to map your top 2 attack paths into this twin and run a joint success criteria workshop."

## 3) Discovery Questions

## A. Before demo (qualification)
1. "Which SOC KPI matters most this quarter: MTTD, MTTR, false positives, or analyst workload?"
2. "Which two attack paths are highest risk for your environment today?"
3. "Where do investigations break down most often: visibility, correlation, or response coordination?"
4. "Who signs off on SOC platform decisions: SOC leadership, CISO office, or architecture team?"

## B. During demo (calibration)
1. "Does this incident timeline match what your analysts currently see, or is your process noisier?"
2. "Would this escalation threshold fit your current policy and staffing model?"
3. "Which view is most useful for your stakeholders: analyst, manager, or executive?"
4. "Do you need this simulation to mirror on-prem, cloud, or hybrid-first risk paths?"

## C. After demo (next-step qualification)
1. "If we map your real controls into this flow, what proof would you need to move to POV?"
2. "What timeline are you targeting for a pilot decision?"
3. "Which integrations are mandatory in phase one?"
4. "What would block adoption even if detection outcomes improve?"

## 4) Operator Notes

- If queue volume climbs too quickly, use `Stop Scenario` and pivot to manager/CISO framing.
- Keep one scenario active at a time.
- Avoid deep technical detours until value story lands with stakeholders.
- End every session with `Reset` and confirm clean KPI state.
