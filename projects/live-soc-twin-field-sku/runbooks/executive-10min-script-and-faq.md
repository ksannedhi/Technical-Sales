# 10-Minute Executive Demo Script + Common Questions and Responses

## 1) 10-Minute Executive Script

## 0. Setup (1 min)
- Ensure backend/frontend are running.
- Run: `npm.cmd run demo:prep`
- Open dashboard in CISO mode first.

Talk track:
"This is a live SOC twin: safe, repeatable simulation of real SOC outcomes without production risk."

## 1. Baseline and objective (1 min)
- Show KPI panel in normal state.

Talk track:
"We are establishing baseline operations so you can see how risk posture changes once an attack chain starts."

## 2. High-impact scenario (4 min)
- Start `Phishing` scenario.
- Narrate progression: initial access -> credential abuse -> lateral movement.
- Show incident growth and severity movement.

Talk track:
"The key value is not raw alert volume. It is compressed time-to-understanding and cleaner incident decisions."

## 3. Business framing (2 min)
- Stay in CISO mode and connect to business services and blast radius (table shows `Service`).
- Switch briefly to SOC Manager mode to show operational load implications (table shows `Status`).

Talk track:
"Same telemetry, different stakeholder outcomes: executive risk, operational control, and analyst actionability."

## 4. Credibility and control (1 min)
- Highlight deterministic replay + ATT&CK mapping + safe simulation.

Talk track:
"This is deterministic by design, so each run is comparable and measurable for decision-making."

## 5. Close and next step (1 min)
- Stop scenario if running.
- Reset and show clean state.

Talk track:
"If useful, next step is mapping your top two attack paths and agreeing proof criteria for a focused POV."

## 2) Common Questions and Recommended Responses

1. "Is this real data or synthetic?"
- Response: "Synthetic and deterministic for demo stability. The purpose here is to prove operating model and response outcomes. In POV, we map to your real telemetry and controls."

2. "How is this different from a normal SIEM dashboard demo?"
- Response: "This is scenario-driven and outcome-based. We show complete attack progression, correlation, and response decisions, not isolated dashboard clicks."

3. "Can this integrate with our existing tools?"
- Response: "Yes. Field SKU proves workflow value first. Integration depth is done in the next phase based on your required sources and control points."

4. "How accurate is ATT&CK mapping here?"
- Response: "Mappings are explicit and visible at event level. We can tune techniques and thresholds to your threat model in a custom pack."

5. "What about false positives?"
- Response: "We intentionally include baseline noise to demonstrate triage discipline and correlation quality under realistic SOC conditions."

6. "Does AI make autonomous decisions?"
- Response: "No. Recommendations are assistive. Analyst approval remains the control gate for any action."

7. "How quickly can we stand this up for our team?"
- Response: "The Field SKU is laptop-runnable and can be operational quickly. Then we tune scenarios to your environment and KPIs."

8. "Can this support executive workshops?"
- Response: "Yes. The CISO mode is designed for risk and business impact storytelling, while retaining technical traceability in analyst/manager views."

9. "What ROI should we expect?"
- Response: "Primary ROI comes from reduced triage friction, faster containment decisions, and lower analyst overload. We quantify this with your target KPIs during POV."

10. "How safe is this demo environment?"
- Response: "No destructive payloads are used. It is isolated and designed for safe behavior simulation only."

11. "What are the limitations of this v1 setup?"
- Response: "This version prioritizes repeatability and speed over production-grade integration depth. That is intentional for field demos."

12. "Can we test our own top attack paths?"
- Response: "Yes. We can build custom scenario packs for your top business-critical attack chains."

13. "How do you prevent demo failure live?"
- Response: "One-scenario-at-a-time guardrails, deterministic event generation, prep/reset commands, and operator runbooks keep the flow predictable."

14. "Can this run offline in customer sites?"
- Response: "Yes, that is one of the core design goals for Field SKU."

15. "What does a good next step look like?"
- Response: "A scoped POV with agreed success metrics: two attack paths, target detection/response KPIs, and decision timeline."

16. "What changes when you switch Audience Mode?"
- Response: "The dashboard visibly changes: role-specific title, role-specific KPI card, and different last table column (`MITRE`, `Status`, or `Service`)."

## 3) Objection Handling Shortcuts

- "Too synthetic": "Correct for demo reliability; we switch to your telemetry in POV."
- "Too basic": "This is Field SKU for speed; depth is unlocked in integration phase."
- "Too risky with AI": "Human-in-the-loop stays mandatory."
- "Not our environment": "We can mirror your environment with custom scenario packs."

## 4) Closing Ask Template

"If this aligns, let’s schedule a 60-minute design workshop to map your top two attack paths, define success criteria, and agree a POV plan."