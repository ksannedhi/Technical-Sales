# Agent Risk Assessor — Project Specification

**Status:** Stage 1 built (Sept 2026) — engine, path to Go, API, UI, PDF, risk register export, Claude brief. Stage 2 (attack replay) not started.

## Purpose

A presales tool for running a structured risk assessment of an **AI agent deployment** with a prospect, before it goes to production. The presales engineer describes the agent's architecture — what it can read, what it can do, what it trusts, where it runs. The tool produces a threat register, a control gap list, a data-residency check against GCC rules, and a production-readiness verdict written for a risk committee.

It assesses the security of the AI agent itself, not the use of AI for security tasks.

## Target users

- Presales security engineers and solution architects (primary — drives the session)
- CISOs, risk committees, and AI programme owners (receive the report)
- Internal AI teams preparing an agent for risk sign-off

## The question it answers

> "We want to put this agent into production. What can go wrong, what's missing, and can we go live?"

The final output is one of three verdicts — **Go**, **Go with conditions**, **Not yet** — with the named conditions that change it. The verdict is what a risk committee actually needs.

## Design principles

- **Deterministic engine** — threats, gaps, and the verdict come from rules in data files, not from Claude. The same inputs always give the same report.
- **Single AI call** — Claude writes the risk-committee narrative once, at the end
- **Graceful degradation** — no API key = no narrative; everything else still works
- **Vendor-neutral** — recommends control categories, never products
- **Single-sitting** — `sessionStorage` only; nothing persists between prospects
- **Explainable** — every threat shows *which inputs triggered it*, so the PE can defend it in the room

## Flow

```
Step 1: Profile (or load one of three demo presets)
  → org name, agent name, business purpose, sector, jurisdictions
  → where the model runs: vendor API / hyperscaler-hosted / private or hybrid cloud / on-prem
  → every country where inference can happen, including failover and vendor routing (drives the residency check; any location outside the jurisdiction triggers)

Step 2: Architecture (11 questions across 5 sections)
  → Data access       — highest classification (Level 1–4), data types, sources read
  → Actions           — read / tickets / write / send externally / web requests / delete /
                        execute code / move money / change permissions
  → Untrusted inputs  — who talks to it; email, web, uploads, shared documents, tool output, other agents
  → Autonomy          — suggest / approve each / approve high-risk / autonomous; whose permissions; multi-agent
  → Supply chain      — vendor model, open weights, third-party MCP, community plugins, external RAG; memory

Step 3: Controls in place (21 controls in 6 groups; audit logging marked as required for Go)

Step 4: Results
  → verdict, blast radius, lethal trifecta check, threats by residual risk
  → path to Go, with one-click apply and re-assess
  → blockers and go-live conditions
  → risk committee brief (Claude, if API key present)
  → residency and regulatory findings with clause citations
  → threat register (expandable: triggers, OWASP / ASI / ATLAS / AI RMF)
  → NIST AI RMF coverage (Gap / Partial / Addressed per subcategory)
  → control gap table
  → exports: PDF, risk register CSV
```

## Engine

### Lethal trifecta check (headline finding)

An agent that has all three of the following can be made to leak data by a single injected instruction, whatever the model:

1. Access to private or sensitive data
2. Exposure to untrusted content
3. A way to communicate externally (email, web requests, write to a shared location)

If all three are present and no control breaks the chain, the verdict cannot be **Go**. This is the most demoable finding in the tool — it is simple, correct, and most prospects have not thought about it.

### Blast radius

`blast_radius = action_severity × autonomy_factor × data_sensitivity`, each on a 1–4 scale, normalised to 0–100. It shows the worst case if the agent is fully compromised, before controls are counted.

### Threat derivation

Stored in `threats.json`. Each threat has a `when` clause over the architecture inputs, an inherent severity, framework mappings, and the controls that mitigate it. For example:

```json
{
  "id": "T-INJ-02",
  "title": "Indirect prompt injection drives agent actions",
  "when": { "all": [{ "flag": "untrustedContent" }, { "flag": "highImpactAction" }] },
  "severity": 4,
  "owaspLlm": ["LLM01"], "owaspAgentic": ["ASI01", "ASI02"], "atlas": ["AML.T0051.001", "AML.T0053"],
  "mitigatedBy": ["untrusted_tool_restriction", "human_approval", "input_validation"]
}
```

Residual risk = inherent severity, reduced by one level per mitigating control in place (floored at 1). Priority by residual level: 4 Critical, 3 High, 2 Medium, 1 Low.

### Framework mappings

| Framework | Used for |
|---|---|
| OWASP Top 10 for LLM Applications (2025) | Primary threat taxonomy (LLM01–LLM10) |
| OWASP Top 10 for Agentic Applications (2026) | Agent-specific threats (ASI01–ASI10) |
| MITRE ATLAS | Adversary technique IDs |
| NIST AI RMF | Per-risk subcategories in the register, and per-design coverage (Gap / Partial / Addressed) |
| ISO/IEC 42001 | Not mapped — paywalled, so clause IDs can't be verified. Listed as pending. |

IDs are verified against primary sources — see `backend/data/SOURCES.md`. Do not add an ID from memory.

### Data residency and sovereignty check

Hosting country × data classification × jurisdiction → findings. Inference counts as processing: prompts and retrieved context go wherever the model runs. Clauses come from primary sources or from a compiled control taxonomy built from the framework documents (see `backend/data/SOURCES.md`); instruments not yet verified are listed as pending and produce no findings. Headline rule: Kuwait Level 3/4 or personal data processed outside Kuwait → Critical (CITRA Cloud Computing Regulatory Framework §4.2.1.1).

### Path to Go

For any verdict below Go, the engine finds the fewest missing controls that lift it one level, and a path to Go. Exact search over combinations of up to four controls, then a greedy search with redundant controls pruned. Residency Critical findings are treated as architecture changes (each rule's `architectureFix` is applied hypothetically before searching); residency High findings are approvals, assumed done for the Go target and listed alongside it. The UI can apply a path and re-assess in one click.

### What-if view

**Try this path** applies a Path-to-Go step — its architecture fix and controls — as a what-if layered over the actual design. The actual answers and controls are never changed. The what-if shows a banner listing every assumed change, the verdict is labelled "What-if verdict", and **Back to actual design** discards it. Editing the actual design, changing controls, or leaving the results step also discards it. In a what-if, the **Change controls** button reads **Edit actual controls**: it returns to step 3 to edit the real design, and the what-if is discarded.

Blast radius does not move in a what-if that only adds controls: it is actions × autonomy × data sensitivity, the worst case before controls. Controls show up in residual threat levels, the trifecta status, and the verdict.

Exports from a what-if carry the label everywhere a reader could see it out of context: the PDF title and filename start with "What-if", page 1 has a banner listing the assumed changes, Appendix A is marked "(what-if)", and every CSV row has a `basis` column naming the assumed changes. Actual-design exports have `basis: Actual design as assessed`.

### Risk register and NIST AI RMF evidence

One row per triggered threat — inherent and residual risk, controls in place, treatment, OWASP, ATLAS, and NIST AI RMF subcategories — exported as CSV. A row's AI RMF subcategories come only from the controls that treat that threat.

**AI RMF coverage** (`rmfCoverage`) groups those mappings by subcategory: the risks that touch it, the controls in place, and the ones missing. Status is **Gap** (none in place), **Partial** (some), or **Addressed** (all), sorted Gap first. It changes with every design. The report-level evidence in `ai-rmf.json` (the verdict is MANAGE 1.1, residency findings GOVERN 1.1, and so on) is the same for every report, so it appears only as a footnote. ISO/IEC 42001 is not mapped: its text isn't freely available to verify clause IDs.

### Production-readiness verdict

| Verdict | Rule |
|---|---|
| **Not yet** | Any Critical residual threat, OR lethal trifecta unbroken, OR a Critical residency finding |
| **Go with conditions** | No Critical, but ≥1 High — each High becomes a named go-live condition |
| **Go** | Only Medium or lower, with per-action audit logging in place |

Audit logging is a hard requirement for **Go** whatever the score — you can't govern what you can't see.

## Outputs

1. **Page 1** — verdict, blast radius, trifecta status, a "What was assessed" summary (jurisdictions, hosting, inference countries, data classification, actions, users, oversight, controls count), and a linked contents strip
2. **Blockers and go-live conditions**
3. **Path to Go** — architecture changes, controls, and approvals per target verdict
4. **Risk committee brief** (Claude) — plain-language summary a non-technical committee can sign against
5. **Residency findings** — per jurisdiction, with clause citations; unverified instruments listed as not assessed
6. **Risk register** — threat, inherent → residual, treatment, OWASP / ASI / ATLAS / NIST AI RMF; also exported as CSV
7. **Control gap table** — missing control, threats it would reduce, timeline
8. **Appendix A — Design as assessed** (every answer and control) and **Appendix B — NIST AI RMF coverage** for this design
9. **PDF** — Puppeteer, with internal links and bookmarks (side-panel outline) generated from the section headings

## Stack and ports

Node / Express 5 (ESM) backend on **3006**, Vite + React frontend on **5181**. Puppeteer renders the PDF using the installed Chrome.

## Data files

| File | Purpose |
|---|---|
| `backend/data/inputs.json` | Architecture questions, options, and their scale values |
| `backend/data/threats.json` | Threat rules, severities, mappings, mitigating controls |
| `backend/data/controls.json` | Control catalogue — description, timeline, framework refs |
| `backend/data/residency.json` | Jurisdiction × data-type × hosting rules |
| `backend/data/scenarios.json` | 3 preset demo agents (see below) |

## Demo scenarios (preset)

Presales demos need a one-click start. Ship three presets:

1. **Bank customer-service agent** — reads account data, answers public chat, can raise tickets. Shows the trifecta and a CITRA residency finding (Critical).
2. **Internal HR policy assistant** — RAG over HR documents, read-only, per-user identity. Should come out **Go** — proves the tool isn't alarmist.
3. **Autonomous procurement agent** — reads inbound email, can create purchase orders. High blast radius, **Not yet**.

## Non-goals (v1)

- Not a scanner — it does not inspect real code, prompts, or cloud configs
- No live red-team testing (Phase 2 below)
- No product recommendations
- Not a legal opinion or certification — the report says so
- No authentication, no persistence

## Stage 2

- **Tool manifest import** — paste an MCP config or tool schema list to auto-fill the Actions section
- **Attack replay** — run canned prompt-injection scenarios against a toy sandbox agent, with controls toggled on and off, so the prospect *sees* the trifecta fire. Next after Stage 1.

## Open questions

1. **Name** — "Agent Risk Assessor" is a working title; rename before the first sync.
2. **Pending instruments** — NCA Cloud Cybersecurity Controls, ISO/IEC 42001, Bahrain and Oman PDPLs. Listed in `residency.json`; they produce no findings until verified.

Resolved: one-level-per-control scoring accepted for v1 (stated in the README); GCC AI guidance researched (see `backend/data/SOURCES.md`); CBK now covered via CORF CRB-7.2.1; attack replay is Stage 2.
