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
  → where the model runs: vendor API / hyperscaler-hosted / private cloud / hybrid cloud / on-prem (private and hybrid are separate because CORF 7.2 and CITRA 4.2.1.2 cover hybrid but not private cloud)
  → every country where inference can happen, including failover and vendor routing (drives the residency check; any location outside the jurisdiction triggers)

Step 2: Architecture (11 questions across 5 sections)
  → Data access       — highest classification (Level 1–4), data types, sources read
  → Actions           — read / tickets / write / send externally / web requests / delete /
                        execute code / move money / change permissions
  → Untrusted inputs  — who talks to it; email, web, uploads, shared documents, tool output, other agents
  → Autonomy          — suggest / approve each / approve high-risk / autonomous; whose permissions; multi-agent
  → Supply chain      — vendor model, open weights, third-party MCP, community plugins, external RAG; memory

Step 3: Controls in place (21 controls in 6 groups; audit logging marked as required for Go). Two controls are read-only here because they restate a step 2 answer: "Act with the requesting user's permissions" (in place only when every identity is the requesting user's own and there are no anonymous public users) and "Human approval for high-impact actions" (in place unless oversight is fully autonomous). Path to Go offers them as architecture changes, so the answers can never contradict each other. Controls that don't fit the design (a code sandbox with no code execution, memory safeguards with no persistent memory, knowledge-base controls with no knowledge base, supply-chain vetting with no outside components, approval display with no approvals) are flagged as not applicable, count for nothing, and are never recommended.

Contradictory answers resolve towards the riskier reading: personal, health, financial, or credential data is scored as at least Level 3 (the Architecture page warns, and the results say "Scored as Level 3"), a model vendor's API counts as an outside component (the Architecture page blocks "None" for it), and a Mailbox or Public web source counts as reading inbound email or web content. The results page and the PDF list each adjustment. Recommended changes that are architecture changes (per-user permissions, oversight) are named as such in the control gaps and the risk register.

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

### What counts as "untrusted content"

Untrusted content is text written by someone **other than the person the agent is serving**: inbound email, web pages, uploaded files, documents others can edit, third-party tool output, messages from other agents. Anonymous public users also count, because anyone can type anything.

**Authenticated staff or customers talking to their own agent do not count on their own.** A customer instructing their own banking agent is not injecting into someone else's session: at worst they reach their own data. The risk from a malicious authenticated user is real but different, and it is assessed separately: direct prompt injection (T-INJ-01), and, where the agent uses a shared or privileged identity, disclosure of other users' data (T-LEAK-01) and privilege abuse (T-PRV-01). This follows the original framing of the lethal trifecta, which is about content from outside the conversation.

In practice most customer-facing agents do read outsider-written content (uploads, email, shared documents), and then all three parts are present.

### What counts as a way out

Sending email or messages outside the organisation, web requests, web browsing, **other network access (including DNS lookups)**, and **code execution**. Code execution counts because running code can reach the network, and DNS lookups alone can carry data out. The tool can only flag the routes the assessor declares, so the Actions question asks for every way data could leave, not only the intended ones.

An egress allowlist (which covers DNS) or restricting tools after untrusted content blocks every route at once. A no-network sandbox closes only the code-execution route: the path counts as blocked only when every declared route is closed.

### Blast radius

`blast_radius = action_severity × autonomy_factor × data_sensitivity`, each on a 1–4 scale, normalised to 0–100. It shows the worst case if the agent is fully compromised, before controls are counted.

Each score carries a band on the raw product (max 64): **Low** ≤ 8 (score ≤ 13), **Moderate** ≤ 27 (≤ 42), **High** ≤ 47 (≤ 73), **Severe** above that (75 and 100). The bands are this tool's judgement: the HR preset is Low, the bank preset High, the procurement preset Severe. The card also names the biggest single reduction: the one answer change (stricter oversight, dropping the highest-impact actions, or keeping the top data level out of reach) that lowers the score most, with the new score. Where personal, health, financial, or credential data floors the level at 3, the data change offered is never "pick a lower level". The band is information only; the verdict never uses it.

### Threat IDs

Threat IDs follow `T-<category>-<number>` and are **this tool's own labels**, not a standard. They cross-reference a threat across blockers, the control gap table, and the CSV. The standard references carried on every threat are OWASP Top 10 for LLM Applications (LLM01–LLM10), OWASP Top 10 for Agentic Applications (ASI01–ASI10), and MITRE ATLAS technique IDs; those are the ones to quote to a regulator or auditor. The report says so under the risk register.

| Prefix | Category | Prefix | Category |
|---|---|---|---|
| INJ | Prompt injection | MEM | Memory poisoning |
| EXF | Data exfiltration | RAG | Knowledge-base poisoning |
| LEAK | Data shown to the wrong user | SPL | System prompt leakage |
| PRV | Privilege abuse | DOS | Runaway cost / denial of service |
| AGY | Excessive agency | MIS | Wrong answers acted on |
| CRD | Credential harvesting | TRU | Approval fatigue / misplaced trust |
| SUP | Supply chain (tools, models) | A2A | Agent-to-agent communication |
| RCE | Unexpected code execution | ROG | Agent drifting out of scope |
| OUT | Unsafe output handling | | |

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


**Finding IDs** follow `<jurisdiction>-<number>` (KW Kuwait, SA Saudi Arabia, AE UAE mainland, DIFC Dubai International Financial Centre, QA Qatar). They are **this tool's own labels**, not regulators' clause numbers; the regulation and clause each finding rests on is in its source line, and that is what to cite. The report says so under the findings.

| ID | Level | What it checks | Source |
|---|---|---|---|
| KW-01 | Critical | Level 3/4 or personal data processed outside Kuwait | CITRA cloud framework §4.2.1.1; NBCC GOV-3 |
| KW-02 | Medium | Level 2 data on a foreign public cloud (customer-held keys don't protect inference) | CITRA §3.1.4.2 |
| KW-03 | Advisory | Cloud provider must be CITRA-licensed | CITRA §4.2.1.2 |
| KW-04 | Advisory | Vendor telemetry and logs may carry prompts out of Kuwait | NBCC CLD-12, CLD-13 |
| KW-05 | High | Bank: CBK approval before signing cloud outsourcing involving sensitive data | CBK CORF 7.2.1.3 |
| KW-06 | High | Bank: CBK approval before an AI system goes live | CBK CORF 7.1.1.2 |
| SA-01 | High | Saudi personal data transferred outside the Kingdom | PDPL Art. 29; Transfer Regulation Art. 2, 8 |
| SA-02 | Advisory | SDAIA AI Ethics Principles apply | SDAIA AI Ethics Principles |
| SA-03 | Advisory | Government use of generative AI | SDAIA Generative AI Guidelines for Government |
| AE-01 | High | UAE personal data transferred outside the UAE | UAE PDPL Art. 22, 23 |
| DIFC-01 | High | Personal data processed by AI systems in the DIFC | DIFC Data Protection Regulations, Regulation 10 |
| QA-01 | High | Qatar personal data processed outside Qatar | PDPPL Art. 15 |
| QA-02 | Advisory | NCSA guidelines for secure AI adoption | NCSA Guidelines v1.0 (2024) |
### Path to Go

For any verdict below Go, the engine finds the fewest missing controls that lift it one level, and a path to Go. Exact search over combinations of up to four controls, then a greedy search with redundant controls pruned. Residency Critical findings are treated as architecture changes (each rule's `architectureFix` is applied hypothetically before searching); residency High findings are approvals, assumed done for the Go target and listed alongside it. The UI can apply a path and re-assess in one click.

The steps are **cumulative**: the Go route starts from the Go-with-conditions route and adds to it, so the plan reads as stage 1 then stage 2. Searching each target separately can return two unrelated sets (both valid, since several controls can break the same chain), which reads as a contradiction. On the presets, building on stage 1 costs no extra controls. The UI and PDF show the Go column as "everything under Go with conditions, plus" the additions, numbered on from stage 1.

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
| **Not yet** | Any Critical residual threat, OR lethal trifecta open (nothing blocks the data-leak path), OR a Critical residency finding |
| **Go with conditions** | No Critical, but ≥1 High — each High becomes a named go-live condition |
| **Go** | Only Medium or lower, with per-action audit logging in place, and not fully autonomous if it can take a high-impact action |

Audit logging is a hard requirement for **Go** whatever the score — you can't govern what you can't see.

A fully autonomous agent that can take a high-impact action (write records, send externally, make network requests, delete, run code, move money, change permissions) needs **Human approval for high-impact actions** to reach **Go**. Per-threat scoring alone could otherwise clear an agent with no human in the loop once each threat is mitigated. "Human approval for high-impact actions" follows the oversight answer (a person approves high-risk actions, every action, or takes every action), so only changing that answer satisfies it; ticking the box cannot.

## Outputs

1. **Page 1** — verdict, blast radius, trifecta status, a "What was assessed" summary (jurisdictions, hosting, inference countries, data classification, actions, users, oversight, controls in place by name), and a linked contents strip
2. **Blockers and go-live conditions**
3. **Path to Go** — architecture changes, controls, and approvals per target verdict
   **Current vs target** — the actual design beside the design once the Path to Go is complete (verdict, blast radius, trifecta, threat counts, control gaps, and each threat whose residual risk changes), labelled as a projection; not included in what-if exports
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

Resolved: one-level-per-control scoring accepted for v1 (stated in the README); GCC AI guidance researched (see `backend/data/SOURCES.md`); CBK CORF verified against CBK's own text (7.1.1.2 AI approval, 7.2.1.3 cloud outsourcing approval); attack replay is Stage 2.
