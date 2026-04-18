# 10-Minute Executive Demo Script + Common Questions and Responses

## 1) 10-Minute Executive Script

### 0. Setup (1 min)

- Run: `npm.cmd run demo:prep`
- Open dashboard in **CISO mode**.

Talk track:
"This is a live MDR service twin — safe, repeatable simulation of real SOC outcomes without production risk. You'll see exactly what your team and our team would see during an active threat."

---

### 1. Baseline and risk posture (1 min)

- Show Executive Risk Summary KPI cards: Active Incidents (0), Threats Contained, Services Affected, Business Risk (Normal — green).

Talk track:
"This is the baseline state — no active threats, risk at Normal. You can see how this changes the moment an attack chain starts."

---

### 2. High-impact scenario (4 min)

- Start `Phishing Scenario`.
- Narrate: phishing link clicked on HR workstation → password spray against domain controller → lateral movement to file server.
- At ~25 s, auto-ticket fires. Point to the Customer Tickets count incrementing.
- Show CISO Active Incident card: techniques, impacted assets, linked ticket.
- Show Business Risk escalating (colour shift to Elevated or Critical).

Talk track:
"The moment the threat escalates, we auto-raise a customer ticket — no analyst action required. Your team sees what we're doing and what you need to do in real time."

Talk track:
"Notice the Business Risk card — it reflects actual impacted services and incident severity, not just alert volume."

---

### 3. Business framing (2 min)

- Stay in CISO mode — point to Services Affected and Threats Contained KPIs.
- Switch to **SOC Manager** mode briefly — show Active Threats, Open Tickets, In Progress, Resolved cards and the incident response table.

Talk track:
"Same event stream, two more stakeholder outcomes. The manager sees operational pipeline and ticket status. The CISO sees business risk and containment progress."

---

### 4. Containment and close the loop (1 min)

- Navigate to **Customer Tickets** tab — show ticket with response actions our team is taking and customer action required.
- Mark ticket Resolved — return to CISO view and show incident card disappears, Business Risk returns to Normal.

Talk track:
"Resolving the containment action closes the loop. The risk posture updates immediately — this is what contained looks like from the executive seat."

---

### 5. Credibility and next step (1 min)

- Note: deterministic replay, ATT&CK-mapped, safe simulation, offline-capable.

Talk track:
"This is deterministic — each run is identical and measurable. If useful, our next step is mapping your top two attack paths and agreeing proof criteria for a focused POV."

---

## 2) Common Questions and Recommended Responses

1. **"Is this real data or synthetic?"**
   "Synthetic and deterministic for demo stability. The purpose is to prove operating model and response outcomes. In POV, we map to your real telemetry and controls."

2. **"How is this different from a normal SIEM dashboard demo?"**
   "This is scenario-driven and outcome-based. We show complete attack progression, incident correlation, response decisions, and customer notification — not isolated dashboard clicks."

3. **"Can this integrate with our existing tools?"**
   "Yes. This demo proves workflow value first. Integration depth is scoped in the next phase based on your required sources and control points."

4. **"How accurate is ATT&CK mapping here?"**
   "Mappings are explicit and visible at the event level. We can tune techniques and thresholds to your threat model in a custom scenario pack."

5. **"What about false positives?"**
   "We include baseline noise to demonstrate triage discipline and correlation quality under realistic MDR conditions."

6. **"Does AI make autonomous decisions?"**
   "No. ARIA, the Automated Response & Investigation Assistant, provides triage guidance only. Analyst approval remains the control gate for any action or ticket."

7. **"How quickly can we stand this up for our team?"**
   "The current version is laptop-runnable and can be operational immediately. We then tune scenarios to your environment and KPIs."

8. **"Can this support executive workshops?"**
   "Yes. The CISO mode is designed for risk and business impact storytelling while retaining full technical traceability in the analyst and manager views."

9. **"What ROI should we expect?"**
   "Primary ROI comes from reduced triage friction, faster containment decisions, and lower analyst overload. We quantify this against your target KPIs during POV."

10. **"How safe is this demo environment?"**
    "No destructive payloads are used. All containment actions are simulated. The environment is isolated and designed for safe behaviour simulation only."

11. **"What are the limitations of this setup?"**
    "This version prioritises repeatability and speed over production-grade integration depth — intentional for field demos. Depth comes in the POV phase."

12. **"Can we test our own top attack paths?"**
    "Yes. We build custom scenario packs matched to your highest-risk attack chains."

13. **"How do you prevent demo failure live?"**
    "One-scenario-at-a-time guardrails, deterministic event generation, prep/reset commands, and operator runbooks keep the flow predictable and repeatable."

14. **"Can this run offline at customer sites?"**
    "Yes — offline-capable is a core design goal. No internet dependency when running without the AI API key."

15. **"What does a good next step look like?"**
    "A scoped POV with agreed success metrics: two attack paths, target detection/response KPIs, and a decision timeline."

16. **"What changes when you switch Audience Mode?"**
    "The entire dashboard changes by role — distinct KPI cards and a distinct main panel. Analyst sees the alert queue and investigation tools. SOC Manager sees incident pipeline and ticket status. CISO sees business risk and active incident cards."

17. **"How does ARIA work?"**
    "In Analyst mode, the analyst selects a live alert and clicks Analyze. ARIA returns a triage summary and recommended action. The analyst can then raise a customer ticket with one click — or the system auto-raises one for scenario-driven high/critical events."

18. **"Who gets notified when a ticket is created?"**
    "In this demo, the Customer Tickets tab represents the portal your team would access. In production, this integrates with your preferred notification channel — email, Slack, ITSM, or API."

19. **"What happens when we resolve a ticket?"**
    "Resolving a ticket removes the incident from the CISO and SOC Manager active views and updates the Business Risk posture immediately — closing the loop on that threat."

---

## 3) Objection Handling Shortcuts

| Objection | Response |
|---|---|
| "Too synthetic" | "Correct for demo reliability — we switch to your telemetry in POV." |
| "Too basic" | "Fast demo version; depth unlocked in the integration phase." |
| "AI is risky" | "Human-in-the-loop is mandatory — ARIA assists, analysts decide." |
| "Not our environment" | "We build custom scenario packs matched to your threat model." |
| "We already have a SIEM" | "This shows the MDR service layer on top — correlation, triage, and customer communication that a SIEM alone doesn't provide." |

---

## 4) Closing Ask Template

"If this aligns with your priorities, let's schedule a 60-minute design workshop to map your top two attack paths, define success criteria, and agree a POV plan."
