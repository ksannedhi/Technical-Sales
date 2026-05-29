# Presales Deal Reviewer

Local web app for reviewing presales deal readiness. Works in two modes — RFP Review when the customer is still open for clarification, and Deal Review when the proposal needs to be rock-solid before internal review or submission.

[Full specification](PRODUCT_SPEC.md)

## Two Modes

### RFP Review
Upload the RFP as soon as it arrives. The app detects solution families, flags what is ambiguous or missing, and generates targeted clarifying questions to send to the customer during the clarification window. No score — there is nothing to score yet. When the customer responds and you have a proposal draft, switch to Deal Review.

### Deal Review
Upload the RFP, proposal draft, and discovery notes. The app scores the deal across three gates and surfaces specific gaps to fix before the deal goes to internal review or customer submission. Proposal carries the highest weight (50%) because it is the only artifact still fully in the presales engineer's hands at this stage.

## What It Does

- Detects up to 5 solution families per deal and tailors findings and questions to each
- **RFP Review:** questions for customer + requirements findings only
- **Deal Review:** weighted readiness score across three gates, all findings, strengths, and clarifying questions
- Flags missing inputs, contradictions, vague assumptions, and delivery risks
- Names specific assumption sentences from the proposal rather than flagging generically
- Compares SLA response times between RFP and proposal and flags mismatches
- Identifies regulated-sector deals and names the likely applicable compliance frameworks
- Checks government procurement certifications (FIPS 140-2, TAA, Common Criteria) against the proposal
- Flags firewall subscription gaps (IPS, URL Filtering, Sandbox) and missing central management for multi-site deployments
- Warns when requirements text is too sparse or non-English to gate reliably
- Handles renewal and renewal+expansion deals differently from new deployments
- Keeps a session-level Deal History with rename, delete, and re-run actions
- Shows a score delta banner when a deal is re-run
- Exports a plain-text summary (questions + findings for RFP mode; full findings for Deal mode)

## Solution Families (17)

| Family | Key Products |
|---|---|
| siem_log_mgmt | Splunk, QRadar, Sentinel, FortiAnalyzer — SOAR gaps fire on all SIEM deals |
| firewall_network | FortiGate, Palo Alto, Check Point, TippingPoint |
| email_security | Proofpoint, Mimecast, FortiMail, Cisco Email Security |
| endpoint_xdr | CrowdStrike, SentinelOne, Cortex XDR, Vision One |
| iam_pam | General IAM (Okta, Entra ID) · PAM sub-type (CyberArk, BeyondTrust) · IGA sub-type (SailPoint, Saviynt) |
| sase_proxy | Zscaler, Prisma Access, Netskope, Cato Networks |
| app_delivery_security | F5, WAF, load balancer, ADC |
| ot_ics | Claroty, Nozomi, Dragos, SCADA |
| cloud_security | Wiz, Prisma Cloud, CSPM, CNAPP |
| vulnerability_management | Tenable, Qualys, Rapid7 |
| ndr | Darktrace, ExtraHop, Vectra |
| dlp | Purview, DLP policy |
| managed_services | MDR, MXDR, managed SOC, MSSP |
| ddos_protection | Arbor, Radware, BGP diversion, scrubbing |
| backup_resilience | Veeam, Rubrik, Cohesity, Commvault — RTO/RPO, air-gap vault |
| threat_intelligence | Recorded Future, Digital Shadows, Group-IB, Mandiant |
| dspm | Varonis, Cyera, BigID — data classification, residency, regulatory drivers |

## Deal Review Weights

| Gate | Weight | Rationale |
|---|---|---|
| Requirements | 25% | Discovery window is often closed by deal review time |
| Architecture | 25% | Structural risks still matter but can only be partially addressed |
| Proposal | 50% | Fully in the presales engineer's hands — fix it before submission |

## Supported Inputs

| Format | Notes |
|---|---|
| `.txt` `.md` `.docx` `.pptx` | Full extraction |
| `.pdf` | Text-based PDFs only; scanned PDFs produce minimal output |
| `.zip` | One ZIP can replace all three individual uploads (Deal Review mode) |

PDFs over 20 MB are rejected — they are almost always scanned. Use `.docx` for reliable results.

## Run

```cmd
start.cmd
```

Opens at `http://127.0.0.1:8020`

Or manually:

```cmd
set PYTHONPATH=src
set PDG_OPEN_BROWSER=1
python app.py
```

## Recommended Workflow

**RFP received, clarification window open:**
1. Select **RFP Review** mode
2. Enter a deal name and paste or upload the RFP
3. Click **Run RFP Review**
4. Send the generated questions to the customer; use the findings to plan discovery

**Deal in flight, heading to internal review:**
1. Select **Deal Review** mode
2. Enter a deal name; upload RFP, proposal draft, and discovery notes
3. Click **Run Gate Review**
4. Address HIGH findings; answer clarifying questions in discovery notes
5. Click **Re-run** from Deal History after updating documents to confirm the score improves

## Key Behaviors

- Mode persists in Deal History — loading a past review shows it in the mode it was run
- Re-run pre-loads the original artifacts and mode for editing before re-submission
- SIEM deals always include a SOAR scope question — automation scope is rarely defined in RFPs
- IAM deals fire sub-type questions: PAM (vault, JIT, session recording) or IGA (certification campaigns, SOD, lifecycle) based on detected keywords
- SIEM sizing questions suppressed when SIEM is a log destination for a firewall deal
- Renewal deals soften HA/DR findings to confirmation checks; expansion asks whether existing architecture covers new scope
- Re-run delta banner (green / red / neutral) shows score movement between submissions

## Current Scope

- Soft gating only — no automatic progression blocking
- Session-scoped deal history (resets on server restart)
- No document generation
- No multi-user workflow

## Verification

```cmd
set PYTHONPATH=src
python -m py_compile app.py src\presales_gate_engine.py src\file_ingest.py tests\test_engine.py
python -m unittest discover -s tests
```
