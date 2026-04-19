# Presales Deal Gating Specification

## Overview

Presales Deal Gating is a laptop-runnable local web app for reviewing presales opportunity readiness across multiple customer and presales artifacts.

The app is designed to help a user:

- upload or paste presales artifacts
- point the app at local files or folders already present on the laptop
- assess whether the deal is ready for downstream submission or internal progression
- identify missing inputs, weak assumptions, contradictions, and delivery risks
- preserve reviews in a session-level left-side deal history
- download findings for follow-up or sharing

The app is intentionally `soft-gating`. It does not block progression automatically and does not generate missing deliverables.

## Primary Goal

Given user-provided presales artifacts, the app should produce a human-readable readiness review with:

- overall readiness status
- weighted gate scores
- findings
- strengths
- clarifying questions

## User Model

The expected primary user is a presales engineer or solution architect reviewing a deal package before proposal submission or internal deal review.

Secondary users may include presales managers who want to inspect the readiness of deals reviewed in the current session.

## Core UX

### Main Layout

The app is a local web app with:

- a left-side `Deal History`
- a main artifact input panel
- a right-side informational panel
- a result section below the main input area once a review is run

### Deal History

The left rail should behave like lightweight chat/history navigation:

- show prior deal reviews from the current session
- allow selecting a prior deal review
- highlight the currently selected deal
- provide a `+ New Deal` action
- provide deal rename through a 3-dots menu on each deal card

### Input Flow

The user can:

- enter a deal name
- paste requirements or discovery notes
- paste architecture notes
- paste proposal or SOW summary
- paste supporting notes or diagrams
- upload files into each artifact area
- upload a deal ZIP package
- paste local file paths for each artifact area
- paste a local folder path or local ZIP path for the whole deal package

After the review runs:

- the review is saved to `Deal History`
- the current result remains visible
- the input fields are cleared for the next deal

### Result Flow

The result area should display:

- a compact `Selected Deal` summary near the top of the main area
- `Overall Readiness for <Deal Name>: <Status>`
- visual readiness indicator
- gate scores
- grouped findings
- strengths
- clarifying questions
- explanation for how to interpret the scores
- raw payload in a collapsed details block
- `Download Findings` action

## Gating Model

### Gate Areas

The app scores three gates:

- `Requirements`
- `Architecture`
- `Proposal`

### Overall Score

Overall readiness is a weighted roll-up:

- Requirements: 35%
- Architecture: 40%
- Proposal: 25%

### Score Interpretation

- `80-100`: strong signal for the gate
- `60-79`: usable but needs review or cleanup
- `0-59`: major gaps or blockers were found

### Status Mapping

The app can return:

- `PASS`
- `PASS WITH RISK`
- `REWORK`
- `ATTENTION REQUIRED`

## What The App Evaluates

### Requirements Gate

Checks include:

- scope clarity
- sizing cues such as ingestion or log volume where relevant to the solution family
- retention definition
- identity and integration dependencies
- compliance cues
- vague or incomplete discovery

### Architecture Gate

Checks include:

- HA or clustering
- DR or failover
- alignment with air-gap and cloud constraints
- alignment with latency or integration requirements
- single-node resilience risk
- unresolved API or architecture assumptions

### Proposal Gate

Checks include:

- scope and deliverables
- timeline or phased delivery
- customer-facing business framing
- unresolved assumptions
- whether major conflicts are addressed

### Cross-Document Checks

Checks include:

- requirement-to-architecture contradictions
- proposal language that conflicts with hard constraints
- inconsistent log-volume assumptions
- source inventory incompleteness from supporting notes

## Ingestion Coverage

### Supported Inputs

The app currently supports:

- `.txt`
- `.md`
- `.docx`
- `.pptx`
- `.pdf`
- `.zip`

The app also supports:

- local file paths for individual artifacts
- local folder paths for deal-package ingestion
- local ZIP paths for deal-package ingestion

### PDF Caveat

PDF support is best-effort:

- text-based PDFs are supported
- scanned or image-heavy PDFs are not fully supported
- large PDFs may be rejected for fast local review
- only a limited number of pages may be processed for speed
- when possible, `.docx` is preferred over `.pdf`

### ZIP Behavior

ZIP packages may contain supported files. The app routes extracted content into:

- requirements
- architecture
- proposal
- supporting context

### Local Path Behavior

For laptop-hosted files, the app can read artifacts directly from local paths instead of uploading them through the browser.

This is recommended when:

- files are already stored on the local machine
- files are in Box-synced folders
- large PDFs or DOCX files make browser upload feel slow

## Session Behavior

### Deal Creation

Each completed review creates a new session entry in `Deal History`.

If the user reuses an existing deal name, the app should auto-rename the new review:

- `Deal Name`
- `Deal Name (2)`
- `Deal Name (3)`

### Renaming

The user can rename a session deal through the 3-dots menu on a deal card.

Blank rename attempts should be ignored.

### Deleting

The user can delete a session deal through the 3-dots menu on a deal card.

## Output Download

The `Download Findings` action should export a plain-text summary containing:

- deal name
- overall readiness and score
- gate scores
- findings
- strengths
- clarifying questions

## Current Non-Goals

The app does not currently include:

- autonomous multi-agent orchestration
- document generation
- role-based authentication
- persistent multi-user history
- vendor-specific capability databases
- robust OCR for scanned PDFs
- full enterprise-scale document parsing

## Technical Shape

The current implementation is:

- local Python web app
- standard-library WSGI server
- browser-based UI
- local in-memory session history
- SQLite-backed analysis persistence in backend logic
- JSON-backed gate configuration for scoring weights, thresholds, and heuristic tuning

## Known Constraints

- Browser refresh or stale server instances can make UI changes appear inconsistent until the local app is restarted.
- Session history is scoped to the current running process.
- PDF ingestion is intentionally bounded for speed and reliability on a laptop.
- Browser upload can still feel slower than local-path ingestion for large locally available files.

## Next Recommended Improvements

- add richer PDF/DOCX structure extraction
- improve PPT and diagram semantics
- surface parsing confidence more explicitly in the result
- add architecture and proposal quality calibration from more real-world deals
