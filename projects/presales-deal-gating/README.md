# Presales Deal Gating

Local web app for reviewing presales deal readiness across requirements, architecture, proposal, and supporting discovery notes.

[Full specification](docs/PRODUCT_SPEC.md)

## What It Does

- Accepts pasted text or uploaded files for requirements, proposal, and discovery notes
- Detects solution families in scope (firewall, SIEM, endpoint/XDR, email security, NDR, DDoS, OT/ICS, and more) and tailors findings and questions to each
- Reviews deal readiness across three weighted gates: Requirements (45%), Architecture (25%), Proposal (30%)
- Flags missing inputs, contradictions, vague assumptions, and delivery risks
- Names specific assumption sentences from the proposal rather than flagging generically
- Compares SLA response times between RFP and proposal and flags mismatches
- Identifies regulated-sector deals and names the likely applicable compliance frameworks
- Checks government procurement certifications (FIPS 140-2, TAA, Common Criteria) against the proposal
- Flags firewall subscription gaps (IPS, URL Filtering, Sandbox) and missing central management for multi-site deployments
- Warns when requirements text is too sparse or non-English to gate reliably
- Handles renewal and renewal+expansion deals differently from new deployments
- Keeps a session-level Deal History with rename, delete, and re-run actions
- Shows a score delta banner when a deal is re-run, so you can see whether document updates moved the needle
- Exports findings as a downloadable plain-text summary

## Supported Inputs

| Format | Notes |
|---|---|
| `.txt` `.md` `.docx` `.pptx` | Full extraction |
| `.pdf` | Text-based PDFs only; scanned PDFs produce minimal output |
| `.zip` | One ZIP can replace all three individual uploads |

When available, `.docx` is preferred over `.pdf` for reliable results. PDFs over 20 MB are rejected — they are almost always scanned.

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

1. Enter a deal name
2. Paste or upload requirements/RFP, proposal/SOW, and discovery notes
3. Use the deal package ZIP if the artifacts are already in one folder — it is the fastest path
4. Review the Selected Deal summary, then scroll down for findings and clarifying questions
5. After addressing gaps, click Re-run from the history menu to submit the updated documents and see the score delta

## Key Behaviors

- Running a review saves a new deal into Deal History and clears the input fields
- Reusing an existing deal name auto-renames the new one (`Deal Name (2)`, etc.)
- Clarifying questions are solution-family aware — firewall, SIEM, email, endpoint, NDR, OT/ICS, and other deal types receive tailored questions
- SIEM sizing questions are suppressed when the SIEM is a log destination for a firewall deal, not the solution being delivered
- Renewal deals soften HA/DR findings to confirmation checks; expansion deals (renewal + additional seats) ask whether the existing architecture covers the new scope
- A re-run delta banner (green / red / neutral) shows how the overall score moved between submissions

## Current Scope

- Soft gating only — no automatic progression blocking
- Session-scoped deal history (resets on server restart)
- Downloadable findings summary
- No document generation
- No multi-user workflow

## Verification

```cmd
set PYTHONPATH=src
python -m py_compile app.py src\presales_gate_engine.py src\file_ingest.py tests\test_engine.py
python -m unittest discover -s tests
```
