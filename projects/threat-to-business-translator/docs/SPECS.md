# Threat-to-Business Translator Specs

## Product Summary

Threat-to-Business Translator is an executive-facing cyber risk translation engine. It converts technical security signals such as CVEs, SOC alerts, synthetic incidents, and vulnerability scan findings into quantified business impact, leadership narratives, and board-ready risk framing.

The current implementation is an MVP focused on:
- synthetic enterprise scenarios
- optional customer-specific tailoring inputs
- deterministic enrichment and scoring
- leadership-oriented output rather than analyst-only triage

## Primary Audience

- CISO
- senior leadership
- security leaders preparing executive or board communications

## Core Problem

Security teams typically receive technical evidence in forms that are not directly useful for executive decision-making. Threat-to-Business Translator bridges that gap by answering:
- what happened
- why it matters to the business
- what the likely impact range is
- how urgent the issue is
- what leadership should do next

## Current MVP Scope

### Built-in scenario library

The application includes five synthetic scenarios:
1. Internet-facing VPN zero-day threatening payroll operations
2. Privileged identity compromise with lateral movement into customer support
3. Cloud misconfiguration exposing regulated customer records
4. Supplier connectivity compromise disrupting fulfillment operations
5. Deepfake executive impersonation targeting urgent payment approval

Each scenario is tied to a synthetic enterprise graph made up of:
- business units
- business services
- assets
- identities
- controls
- recommended actions

### Optional ad hoc analysis

Users can optionally submit customer-specific input by:
- pasting a CVE description
- pasting a SOC alert or incident summary
- uploading a vulnerability scan style report

The current upload-friendly file types are:
- `.txt`
- `.csv`
- `.json`
- `.xml`
- `.log`

The uploaded or pasted content is matched heuristically to the closest scenario pattern and translated into a leadership report.

### Optional organization assumptions

Users may optionally tailor the report with customer assumptions such as:
- annual revenue
- employee count
- internet exposure
- security maturity
- regulatory sensitivity
- crown jewel dependency

If the user does not apply custom assumptions, the app uses built-in defaults.

## Functional Requirements

### FR1. Scenario exploration
- The user can select a built-in scenario from the scenario library.
- The app generates a default leadership report for the selected scenario.
- The selected scenario should remain the primary entry point for the product.

### FR2. Technical-to-business translation
- The backend must resolve technical context into business context.
- The output must include business service, business unit, asset, identities, control posture, and risk narrative.

### FR3. Quantified impact
- The report must include:
  - low / likely / high impact band
  - downtime estimate
  - people affected estimate
  - overall risk level
  - likelihood / impact / urgency scores

### FR4. Risk reduction if fixed
- The report must include a mitigation-oriented section that estimates:
  - residual likelihood
  - residual impact
  - residual risk level
  - likely loss avoided
  - downtime avoided

### FR5. Exposure profile visualization
- The frontend must show color-coded exposure bars for the main risk drivers.
- These bars are outputs, not user inputs.

### FR6. Optional customer-specific analysis
- The user can provide customer-specific technical evidence.
- The user can choose whether or not customer-specific organization assumptions are applied.
- The application should still be fully usable without customer-specific input.

### FR7. Single-click launch
- A Windows launcher must start backend and frontend together.
- The launcher should handle first-run dependency installation when possible.

## Non-Functional Requirements

### NFR1. Explainability
The scoring model should remain deterministic and inspectable. The narrative should explain the score, not invent it.

### NFR2. Executive readability
The UI should prioritize clarity, hierarchy, and concise business framing over dense security detail.

### NFR3. Local-first setup
The MVP should run locally using FastAPI and React/Vite without requiring cloud infrastructure.

### NFR4. Extensibility
The current synthetic graph should be replaceable later with real-world sources such as:
- CMDB data
- scan platforms
- SIEM exports
- EDR alerts
- ticketing systems

## System Architecture

### Frontend
- React + Vite
- Scenario-first workflow
- Optional input strip for customer-specific evidence
- Executive report layout with metrics, bars, and panels

### Backend
- FastAPI
- Synthetic enterprise graph stored in JSON
- Deterministic enrichment and scoring engine
- Ad hoc text/report classification logic

### Data model
The synthetic graph currently includes:
- business units
- business services
- assets
- identities
- controls
- scenarios

## Current API Surface

### `GET /health`
Basic health check.

### `GET /api/default-profile`
Returns the default organization profile used for assumptions.

### `GET /api/scenarios`
Returns the built-in scenario cards for the left-hand scenario library.

### `GET /api/translate/{scenario_id}`
Returns the translated report for a selected built-in scenario.
Optional query parameters allow profile customization.

### `POST /api/analyze`
Accepts pasted text and/or uploaded file input.
Optional form parameters allow profile customization.
Returns a translated leadership report.

## Current UX Structure

The intended reading order is:
1. hero band: what the product does
2. optional input strip: customer-specific tailoring
3. main workspace: scenario library on the left, translated outcome on the right

## Known Limitations

- Ad hoc analysis currently uses heuristic matching, not a full parser or ML classifier.
- File upload support is text-first and does not yet handle PDF or XLSX natively.
- No authentication or multi-user workflow exists in the MVP.
- No persistence layer is included yet for saved analyses.
- No PDF export or board-pack generation is included yet.

## Suggested Next Steps

1. Add first-class PDF/XLSX ingestion for scan reports and customer documents.
2. Add saved analyses and scenario history.
3. Add export options such as PDF, DOCX, or executive summary slide output.
4. Separate scoring configuration from code into editable config files.
5. Add source traceability in the UI so every narrative is tied back to evidence.