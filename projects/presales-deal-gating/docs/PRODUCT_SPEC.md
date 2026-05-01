# Presales Deal Gating — Product Specification

## Overview

Presales Deal Gating is a laptop-runnable local web app for reviewing presales opportunity readiness across customer and presales artifacts.

The app is designed to help a presales engineer or solution architect:

- upload or paste presales artifacts (RFP, proposal, discovery notes)
- assess whether the deal is ready for downstream submission or internal progression
- identify missing inputs, weak assumptions, contradictions, and delivery risks
- preserve reviews in a session-level deal history
- download findings for follow-up or sharing

This is a soft-gating tool. It does not block progression automatically and does not generate missing deliverables.

## Primary Goal

Given user-provided presales artifacts, produce a human-readable readiness review with:

- overall readiness status and score
- weighted gate scores across three areas
- findings grouped by gate and severity
- detected strengths
- clarifying questions tailored to the solution family
- related seed deal examples for calibration

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

### Input Fields

The user can provide:

- **Requirements / Discovery Notes** — RFP text, scope documents, customer discovery notes
- **Proposal / SOW Summary** — technical proposals, statements of work, deliverable outlines
- **Discovery Notes & Supporting Context** — meeting notes, call summaries, sizing worksheets, architecture signals

Each field accepts pasted text and an optional file upload. A **deal package ZIP** input is also available to replace all three individual uploads in a single step. ZIP contents are routed automatically to the correct artifact buckets.

After the review runs, the result is saved to Deal History, and input fields clear for the next deal.

### Result Flow

The result area displays:

- a compact Selected Deal summary near the top with overall status and gate scores
- a re-run delta banner when the deal was submitted as a re-run (score movement since prior analysis)
- overall readiness heading with status icon
- gate score cards (Overall, Requirements, Architecture, Proposal)
- findings grouped by gate, sorted by severity
- strengths list
- clarifying questions
- a Download Findings action

## Gating Model

### Gate Areas

Three gates are scored independently and then combined:

- **Requirements** — input quality, scope, sizing, compliance, discovery completeness
- **Architecture** — HA/DR coverage, constraint alignment, design contradictions
- **Proposal** — deliverable scope, timeline, assumptions, customer readiness

### Weights

| Gate | Weight |
|---|---|
| Requirements | 45% |
| Architecture | 25% |
| Proposal | 30% |

### Score Interpretation

| Range | Gate status | Overall status |
|---|---|---|
| 80–100 | PASS | PASS |
| 60–79 | REVIEW | PASS WITH RISK |
| 0–59 | ATTENTION REQUIRED | REWORK |

Overall status can also be `ATTENTION REQUIRED` when any HIGH finding contains a conflict signal, regardless of score.

## Solution Family Detection

The engine detects which solution families are in scope from the artifact text and tailors findings and clarifying questions accordingly. Up to five families can be active on a single deal.

Supported families:

| Family | Examples |
|---|---|
| siem_log_mgmt | Splunk, QRadar, Sentinel, Elastic, FortiAnalyzer |
| firewall_network | FortiGate, Palo Alto, Check Point, TippingPoint |
| email_security | Proofpoint, Mimecast, Trend Micro Email Security |
| endpoint_xdr | CrowdStrike, SentinelOne, Vision One, Apex One |
| iam_pam | Okta, CyberArk, Entra ID, Active Directory |
| sase_proxy | SASE, ZTNA, SWG, CASB |
| app_delivery_security | F5, WAF, load balancer, ADC |
| ot_ics | SCADA, Claroty, Nozomi, OT/ICS |
| cloud_security | CSPM, CNAPP, Wiz, Prisma Cloud |
| vulnerability_management | Tenable, Qualys, Rapid7 |
| ndr | Darktrace, ExtraHop, Vectra, Deep Discovery |
| dlp | DLP, Purview, data loss prevention |
| managed_services | MDR, MXDR, managed SOC, MSSP |
| ddos_protection | Arbor, Radware, BGP diversion, scrubbing |

**Proposal-fallback detection:** When the RFP yields no family signal (bilingual PDFs, terse renewal RFPs), the engine falls back to the proposal text if it contains at least one vendor-anchor keyword and enough hits. Some families (iam_pam) are excluded from fallback to avoid false positives.

**TippingPoint handling:** When TippingPoint is detected as the primary product within the firewall family, inline-IPS-specific questions replace the standard firewall topology questions, since TippingPoint does not handle VPN or NAT routing.

**SIEM suppression for firewall deals:** When a firewall is the primary family and the SIEM appears only as a log destination (log forwarding, syslog-to, existing SIEM), SIEM sizing questions and sizing findings are suppressed — the SIEM is already deployed and not part of the delivery scope.

## What The App Evaluates

### Requirements Gate

- scope clarity against detected solution family terms
- sizing cues (log volume, EPS) for SIEM/observability deals
- retention definition for SIEM/observability deals
- identity and integration dependencies for SIEM, IAM, and endpoint families
- compliance framework presence; when a regulated sector is named but no framework is cited, the finding names the most likely applicable frameworks (e.g. healthcare → HIPAA, GDPR, ISO 27001)
- vague or incomplete discovery language
- uncertainty markers in supporting context (tbd, not confirmed, unclear)
- **confidence band:** when requirements text is fewer than 60 words or contains more than 30% non-ASCII characters, a LOW finding warns that scoring confidence is reduced

### Architecture Gate

- HA or clustering coverage; solution-family-specific HA questions
- DR or failover coverage
- alignment with air-gap and cloud constraints
- alignment with latency or integration requirements
- single-node resilience risk
- unresolved API or architecture assumptions in discovery notes
- **Renewal handling:** HA/DR findings are downgraded to LOW on pure renewals; expansion deals (renewal + additional seats) still ask whether the existing architecture covers the new scope

### Proposal Gate

- scope and explicit deliverables
- timeline or phased delivery plan
- customer-facing business framing
- **assumption enumeration:** up to three actual assumption sentences from the proposal are quoted in the finding (rather than a generic flag) so the reviewer knows exactly what needs resolving
- Professional Services listed without defined deliverables or scope
- whether major air-gap/cloud conflicts are addressed

### Cross-Document Checks

- **Log volume consistency** — flags when volume estimates differ by more than 30% across artifacts
- **Retention period consistency** — flags when retention differs by more than 10% across artifacts
- **EPS consistency** — flags when EPS estimates differ by more than 30% across artifacts
- **Endpoint count consistency** — flags when device counts differ by more than 20% and 100+ devices
- **SLA numeric comparison** — HIGH finding when RFP and proposal state different response/resolution hours
- **Air-gap / cloud conflict** — HIGH when proposal or discovery notes reference cloud for an air-gapped deal
- **Government certification gaps** — MEDIUM finding when FIPS 140-2, TAA compliance, or Common Criteria is required in the RFP but not confirmed in the proposal
- **Firewall subscription completeness** — LOW finding when IPS, URL Filtering, or Sandbox/Advanced Threat is required but not confirmed in the proposal BOQ
- **Central management gap** — MEDIUM finding when a multi-site firewall deployment is indicated but no Panorama/FortiManager/SmartConsole is named
- **XDR credit allocation** — clarifying question when XDR credits appear in the BOQ without allocation detail

### Renewal and Expansion

Renewal is detected from signals in any artifact (renewal, license renewal, subscription renewal, etc.).

- Renewal deals: SIEM sizing/retention findings and identity-gap findings are suppressed; HA/DR findings are downgraded to confirmation checks
- Expansion deals (renewal + additional seats): architecture gate asks whether the existing design covers the new scope and OS/agent builds

## Ingestion Coverage

### Supported File Formats

| Format | Notes |
|---|---|
| `.txt` | Full text |
| `.md` | Full text |
| `.docx` | Full document extraction |
| `.pptx` | Slide text extraction |
| `.pdf` | Text-based PDFs only; scanned PDFs produce minimal output |
| `.zip` | Contents routed to requirements, proposal, or supporting context |

PDFs over 20 MB are rejected with a clear message — they are almost always scanned and contain no extractable text. `.docx` is preferred over `.pdf` for reliable results.

### ZIP Routing

ZIP contents are classified by filename stem:
- `requirements` → requirements field
- `proposal` → proposal field
- `architecture`, `meeting_notes`, and other files → supporting context

### LRU Extraction Cache

File extraction results are cached (max 64 entries) so uploading the same file twice in a session does not re-parse it.

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

The Download Findings action exports a plain-text summary:

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
- SQLite-backed analysis persistence (`data/analyses.db`) — written in a daemon thread to avoid blocking responses
- JSON-backed gate configuration (`data/gate_config.json`) — scoring weights, thresholds, and heuristic tuning all externalised
- File extraction via `python-docx`, `python-pptx`, and `pypdf` from a local wheelhouse; graceful fallback when wheels are absent
- Lazy-loading seed dataset and history store — server binds before any disk reads occur

## Known Constraints

- Session history resets on server restart
- PDF ingestion is intentionally bounded for speed on a laptop
- CMD Quick Edit Mode on Windows pauses stdout/stderr when the terminal is clicked — `_QuietHandler` suppresses wsgiref per-request logs to prevent this from stalling responses
- SQLite write is offloaded to a daemon thread; under heavy rapid re-submission the write may lag the UI by a few seconds
