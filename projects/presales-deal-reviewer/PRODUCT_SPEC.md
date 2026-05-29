# Presales Deal Reviewer — Product Specification

## Overview

Presales Deal Reviewer is a laptop-runnable local web app that helps presales engineers and solution architects work more efficiently on deals — from first RFP receipt through to internal review and submission.

The app operates in two modes:

- **RFP Review** — upload the RFP as soon as it arrives. Detects solution families, flags what is ambiguous or missing, and generates targeted clarifying questions to submit to the customer during the clarification window. No score is shown; the proposal does not exist yet.
- **Deal Review** — upload the RFP, proposal draft, and discovery notes. Scores the deal across three weighted gates and surfaces specific gaps to fix before the deal goes to internal review or customer submission.

The app does not block progression automatically and does not generate missing deliverables.

## Primary Goal

**RFP Review mode:** given the customer RFP, produce a set of clarifying questions tailored to the detected solution families and flag what is missing or ambiguous before the presales engineer starts writing the proposal.

**Deal Review mode:** given the full deal package, produce a human-readable readiness review with:

- overall readiness status and weighted score
- gate scores across Requirements, Architecture, and Proposal
- findings grouped by gate and severity
- detected strengths
- clarifying questions tailored to the solution family

## User Model

Primary user: presales engineer or solution architect reviewing a deal package before proposal submission or internal deal review.

Secondary user: presales manager reviewing deals from the current session.

## Core UX

### Main Layout

A local web app with:

- left-side sticky Deal History panel
- main artifact input panel (center-left)
- right-side informational reference panel
- full-width result section below the main grid after a review runs

### Deal History

- shows prior deal reviews from the current session (most recent first, max 12)
- allows selecting a prior deal review to load its result
- highlights the currently selected deal
- provides a `+ New Deal` action to clear the workspace
- 3-dots menu per deal card: Re-run, Rename, Delete
- clicking Re-run pre-loads the prior deal's artifacts into the form for editing before re-submission

### Mode Toggle

A toggle at the top of the form selects the active mode. The form adapts immediately:

- **RFP Review:** shows only the Requirements / RFP field and its upload. Proposal, supporting context, and ZIP upload are hidden.
- **Deal Review:** shows all three artifact fields and the ZIP upload.

The selected mode is stored with each review in Deal History. Loading a prior review or triggering a re-run restores the original mode.

### Input Fields

**RFP Review mode:**
- **Requirements / RFP** — the customer RFP text or document

**Deal Review mode:**
- **Requirements / Discovery Notes** — RFP text, scope documents, customer discovery notes
- **Proposal / SOW Summary** — technical proposals, statements of work, deliverable outlines
- **Discovery Notes & Supporting Context** — meeting notes, call summaries, sizing worksheets, architecture signals
- **Deal package ZIP** — replaces all three individual uploads in a single step; ZIP contents are routed automatically to the correct artifact buckets

After the review runs, the result is saved to Deal History and input fields clear for the next deal.

### Result Flow

**RFP Review mode:**
- Selected Deal summary showing question count and requirements coverage score
- Clarifying questions for the customer — prominent, numbered, ready to copy-paste
- Requirements gate findings only
- Download exports questions (numbered) + requirements findings

**Deal Review mode:**
- Selected Deal summary with overall status and gate scores
- Re-run delta banner when submitted as a re-run (score movement since prior analysis)
- Overall readiness heading with status icon
- Gate score cards (Overall, Requirements, Architecture, Proposal)
- Findings grouped by gate, sorted by severity
- Strengths list
- Clarifying questions
- Download exports full findings, strengths, and questions

## Gating Model

### Gate Areas

Three gates are scored independently and then combined:

- **Requirements** — input quality, scope, sizing, compliance, discovery completeness
- **Architecture** — HA/DR coverage, constraint alignment, design contradictions
- **Proposal** — deliverable scope, timeline, assumptions, customer readiness

### Weights

Applies to Deal Review mode only. RFP Review mode does not produce a score.

| Gate | Weight | Rationale |
|---|---|---|
| Requirements | 25% | Discovery window is often closed by deal review time — limited ability to address gaps |
| Architecture | 25% | Structural risks matter but full redesign is not feasible at this stage |
| Proposal | 50% | Fully in the presales engineer's hands — the primary fixable artifact before submission |

A strong proposal can yield a passing overall score even with thin requirements coverage. The score reflects what is actionable at deal review time. Requirements findings still appear regardless of their score contribution.

### Score Interpretation

| Range | Gate status | Overall status |
|---|---|---|
| 80–100 | PASS | PASS |
| 60–79 | REVIEW | PASS WITH RISK |
| 0–59 | ATTENTION REQUIRED | REWORK |

A HIGH severity conflict finding overrides the score and sets overall status to ATTENTION REQUIRED.

## Solution Family Detection

The app identifies which solution families are in scope and tailors findings and clarifying questions accordingly. Up to five families can be active on a single deal.

Supported families (17):

| Family | Key Products |
|---|---|
| siem_log_mgmt | Splunk, QRadar, Sentinel, Elastic, FortiAnalyzer |
| firewall_network | FortiGate, Palo Alto, Check Point, TippingPoint |
| email_security | Proofpoint, Mimecast, FortiMail, Cisco Email Security |
| endpoint_xdr | CrowdStrike, SentinelOne, Cortex XDR, Vision One, Apex One |
| iam_pam | Okta, Entra ID · CyberArk, BeyondTrust · SailPoint, Saviynt |
| sase_proxy | Zscaler, Prisma Access, Netskope, Cato Networks |
| app_delivery_security | F5, WAF, load balancer, ADC |
| ot_ics | Claroty, Nozomi, Dragos, SCADA |
| cloud_security | Wiz, Prisma Cloud, CSPM, CNAPP |
| vulnerability_management | Tenable, Qualys, Rapid7 |
| ndr | Darktrace, ExtraHop, Vectra, Deep Discovery |
| dlp | Purview, data loss prevention |
| managed_services | MDR, MXDR, managed SOC, MSSP |
| ddos_protection | Arbor, Radware, BGP diversion, scrubbing |
| backup_resilience | Veeam, Rubrik, Cohesity, Commvault |
| threat_intelligence | Recorded Future, Digital Shadows, Group-IB, Mandiant |
| dspm | Varonis, Cyera, BigID |

Questions and findings are tailored to the detected families. IAM deals distinguish between privileged access (PAM) and identity governance (IGA) and ask the appropriate questions for each. SIEM deals always include automation scope — playbook and orchestration coverage is a gap that surfaces late in nearly every SIEM engagement.

## What The App Evaluates

### Requirements Gate

- scope clarity for the solution in scope
- sizing and ingestion baseline for SIEM and observability deals
- retention definition for SIEM and observability deals
- identity and integration dependencies for SIEM, IAM, and endpoint deals
- compliance framework presence; when a regulated sector is named but no framework is cited, the finding names the most likely applicable frameworks (e.g. healthcare → HIPAA, GDPR, ISO 27001)
- vague or incomplete discovery language
- unresolved items and open questions in supporting context
- **low-confidence flag:** sparse or non-English requirements text triggers a LOW finding noting that the review is based on limited input

### Architecture Gate

- HA or clustering coverage; solution-family-specific HA questions
- DR or failover coverage
- alignment with air-gap and cloud constraints
- alignment with latency or integration requirements
- single-node resilience risk
- unresolved API or architecture assumptions in discovery notes
- **Renewal and expansion:** HA/DR findings are treated as confirmation checks on renewals; expansion deals additionally ask whether the existing architecture covers the new scope

### Proposal Gate

- scope and explicit deliverables
- timeline or phased delivery plan
- customer-facing business framing
- **assumption enumeration:** actual assumption sentences from the proposal are quoted in the finding so the reviewer knows exactly which lines need follow-up before submission
- Professional Services listed without defined deliverables or scope
- whether major air-gap/cloud conflicts are addressed

### Solution-Family-Specific Requirements Findings

Targeted findings are raised per detected family:

- **SIEM:** SOAR automation scope not addressed (LOW); TI feed integration absent (LOW)
- **Backup & Cyber Resilience:** RTO/RPO not defined (HIGH); air-gap or immutable storage requirement not addressed (LOW)
- **Threat Intelligence:** TI feed types not specified (MEDIUM); integration targets not confirmed (MEDIUM)
- **DSPM:** data discovery scope not captured (MEDIUM); regulatory compliance driver not identified (LOW); data residency constraint not addressed (MEDIUM)
- **IAM/PAM:** identity and integration dependencies not captured (MEDIUM) — applies to SIEM, IAM, and endpoint deals

### Cross-Document Checks

- **Log volume consistency** — flags when volume estimates are inconsistent across artifacts
- **Retention period consistency** — flags when retention periods are stated differently across artifacts
- **EPS consistency** — flags when EPS estimates are inconsistent across artifacts
- **Endpoint count consistency** — flags when device counts are materially inconsistent across artifacts
- **SLA numeric comparison** — HIGH finding when RFP and proposal state different response/resolution hours
- **Air-gap / cloud conflict** — HIGH when proposal or discovery notes reference cloud for an air-gapped deal
- **Government certification gaps** — MEDIUM finding when FIPS 140-2, TAA compliance, or Common Criteria is required in the RFP but not confirmed in the proposal
- **Firewall subscription completeness** — LOW finding when IPS, URL Filtering, or Sandbox/Advanced Threat is required but not confirmed in the proposal BOQ
- **Central management gap** — MEDIUM finding when a multi-site firewall deployment is indicated but no Panorama/FortiManager/SmartConsole is named
- **XDR credit allocation** — clarifying question when XDR credits appear in the BOQ without allocation detail
- **RFP architectural requirements vs proposal response** — MEDIUM findings when HA, DR, compliance, throughput, or integration requirements stated in the RFP are not addressed in the proposal

### Renewal and Expansion

Renewal deals are identified from the deal artifacts.

- Renewal deals: SIEM sizing, retention, and identity findings are not raised; HA/DR findings become confirmation checks
- Expansion deals (renewal + additional seats): architecture gate asks whether the existing design covers the new scope and OS/agent builds

## Ingestion Coverage

### Supported File Formats

| Format | Notes |
|---|---|
| `.txt` | Full text |
| `.md` | Full text |
| `.docx` | Full document extraction |
| `.pptx` | Slide text extraction |
| `.pdf` | Text-based PDFs only; scanned PDFs are detected and flagged — no misleading output |
| `.zip` | Contents routed automatically to requirements, proposal, or supporting context |

PDFs over 20 MB are not accepted. Use `.docx` for reliable results. Scanned PDFs inside a ZIP are detected individually and reported — they are not silently merged into the analysis.

### ZIP Routing

Each file in the ZIP is routed by filename and content. Files with names containing `rfp`, `requirement`, `scope`, or `discovery` go to the requirements field. Files containing `proposal`, `sow`, or `technical response` go to the proposal field. Everything else is routed by content — the app reads the document and places it in the most appropriate field automatically. The routing decision for each file is shown in the upload notification.

## Session Behavior

### Deal Creation

Each completed review creates a new session entry in Deal History (max 12, oldest dropped).

If the user reuses an existing deal name, the new review auto-renames:
`Deal Name` → `Deal Name (2)` → `Deal Name (3)`

### Re-run

Clicking Re-run from a deal card pre-loads that deal's artifacts into the form. When the re-run is submitted, the score delta (new minus old overall score) is stored and displayed as a coloured banner on the results page: green for improvement, red for regression, neutral for no change.

### Rename / Delete

Available from the 3-dots menu on each deal card. Blank rename attempts are ignored.

## Output Download

The download action exports a plain-text summary. Content varies by mode:

**RFP Review mode:**
- deal name
- questions for customer (numbered)
- requirements findings (severity, message)

**Deal Review mode:**
- deal name
- overall readiness and score
- gate scores
- findings (severity, gate, message)
- strengths
- clarifying questions

## Current Non-Goals

- Autonomous multi-agent orchestration
- Document generation
- Role-based authentication
- Persistent history across server restarts
- Vendor-specific EoL/EoS product databases
- OCR for scanned PDFs
- Multi-user deployment

## Technical Shape

- Python 3.x, standard-library `wsgiref` WSGI server — no external web framework
- Server-rendered HTML — no frontend build step, no npm, no React
- In-memory session state (`SESSION_REVIEWS`) — resets on server restart
- SQLite-backed analysis persistence (`data/analyses.db`)
- JSON-backed gate configuration (`data/gate_config.json`) — scoring weights and thresholds externalised
- File extraction via `python-docx`, `python-pptx`, and `pypdf`

## Known Constraints

- Session history resets on server restart
- PDF text extraction requires a text-based PDF — scanned documents are flagged, not analysed
