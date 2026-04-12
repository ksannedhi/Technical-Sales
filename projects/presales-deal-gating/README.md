# Presales Deal Gating

Local web app for reviewing presales deal readiness across requirements, architecture, proposal, and supporting notes.

## What It Does

- Accepts pasted text, uploaded files, and local file or folder paths
- Reviews deal readiness across `Requirements`, `Architecture`, and `Proposal`
- Flags missing inputs, contradictions, weak assumptions, and delivery risks
- Keeps a session-level `Deal History`
- Lets users rename or delete deals from the history menu
- Exports findings as a downloadable text summary

## Supported Inputs

- `.txt`
- `.md`
- `.docx`
- `.pptx`
- `.pdf`
- `.zip`

Notes:

- `.pdf` support is best-effort for text-based PDFs
- scanned or image-heavy PDFs are not fully supported
- when available, `.docx` is preferred over `.pdf`
- for large local or Box-synced files, pasting a local path is usually faster than browser upload

## Recommended Workflow

- Enter a deal name first
- For large files already on this laptop, paste local file paths instead of uploading through the browser
- Use a local folder or local `.zip` path when the deal artifacts already live together
- Review the `Selected Deal` summary first, then scroll down for the detailed findings and questions

## Run

```cmd
start.cmd
```

The app opens locally at:

`http://127.0.0.1:8020`

## Project Structure

- `app.py`
  Local web server and UI rendering
- `src/presales_gate_engine.py`
  Gating engine and scoring logic
- `src/file_ingest.py`
  File ingestion and extraction helpers
- `data/gate_config.json`
  Tunable scoring weights, thresholds, and heuristic settings
- `docs/PRODUCT_SPEC.md`
  Product and behavior spec
- `tests/test_engine.py`
  Basic regression coverage for scoring and ingestion

## Key Behaviors

- Running a review saves a new deal into `Deal History`
- Reusing an existing deal name auto-renames the new one
- Selecting a deal from history shows a selected-deal summary and auto-scrolls to the active review
- Clicking `+ New Deal` clears the current workspace
- Detailed findings are grouped by area instead of mixed into one flat list
- Clarifying questions can become solution-family aware for areas like firewall, SIEM, email security, IAM, and WAF/load balancer deals

## Current Scope

- Soft gating only
- Local session history
- Downloadable findings summary
- No document generation
- No multi-user workflow

## Verification

```powershell
python -m py_compile app.py src\presales_gate_engine.py src\file_ingest.py tests\test_engine.py
python -m unittest discover -s tests
```
