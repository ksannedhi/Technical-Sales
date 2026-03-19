# Presales Deal Gating

Local web app for reviewing presales deal readiness across requirements, architecture, proposal, and supporting notes.

## What It Does

- Accepts pasted text and uploaded deal artifacts
- Reviews deal readiness across `Requirements`, `Architecture`, and `Proposal`
- Flags missing inputs, contradictions, weak assumptions, and delivery risks
- Keeps a session-level `Deal History`
- Lets users rename deals from the history menu
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

## Run

```cmd
start.cmd
```

The app opens locally at:

`http://127.0.0.1:8010`

## Project Structure

- `app.py`
  Local web server and UI rendering
- `src/presales_gate_engine.py`
  Gating engine and scoring logic
- `src/file_ingest.py`
  File ingestion and extraction helpers
- `docs/PRODUCT_SPEC.md`
  Product and behavior spec
- `tests/test_engine.py`
  Basic regression coverage for scoring and ingestion

## Key Behaviors

- Running a review saves a new deal into `Deal History`
- Reusing an existing deal name auto-renames the new one
- Selecting a deal from history reloads its saved review
- Clicking `+ New Deal` clears the current workspace

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
