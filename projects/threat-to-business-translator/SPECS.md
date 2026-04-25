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

Security teams usually receive technical evidence in forms that are not directly useful for executive decision-making. Threat-to-Business Translator bridges that gap by answering:
- what happened
- why it matters to the business
- what the likely impact range is
- how urgent the issue is
- what leadership should do next

## Current MVP Scope

### Built-in scenario library

The application includes five visible synthetic scenarios:
1. Internet-facing VPN zero-day threatening payroll operations
2. Privileged identity compromise with lateral movement into customer support
3. Cloud misconfiguration exposing regulated customer records
4. Supplier connectivity compromise disrupting fulfillment operations
5. Deepfake executive impersonation targeting urgent payment approval

The backend also includes additional hidden scenario patterns used to classify uploaded scan findings such as:
- weak administrator authentication
- SQL Server remote code execution
- outdated internet-facing web servers

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
- uploading a vulnerability scan report

Supported upload formats:
- `.pdf`
- `.txt`
- `.csv`
- `.json`
- `.log`

The uploaded or pasted content is matched to the closest scenario pattern using weighted keyword scoring across available templates.

### Multi-finding scan report analysis

If an uploaded scan report contains multiple findings, the backend:
- parses each `Finding N` block
- classifies each finding independently
- builds per-finding risk summaries
- builds a report-level roll-up with aggregate business context, exposure profile, and recommended actions

### Optional organization assumptions

Users may optionally tailor the report with assumptions such as:
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
- The selected scenario remains the primary entry point for the product.

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
- The application remains fully usable without customer-specific input.

### FR7. Multi-finding report roll-up
- The backend must support multi-finding scan report analysis.
- The UI must show both report-level and per-finding summaries.

### FR8. Downloadable analysis
- The current analysis can be downloaded from the UI as a markdown file.

### FR9. Affected business service override
- The user can optionally provide a free-text service name alongside a CVE or alert input.
- When provided, the engine resolves it to the closest known business service and uses that service's BU, revenue proportion, and criticality for scoring, while the CVE text continues to drive signal factors independently.
- When no match is found, the engine proceeds without override and the fallback neutralisation applies as normal.

### FR9. Single-click launch
- A Windows launcher starts backend and frontend together.
- The launcher handles first-run dependency installation when possible.

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
- scenario-first workflow
- optional input strip for customer-specific evidence
- executive report layout with metrics, bars, panels, and download action

### Backend
- FastAPI
- synthetic enterprise graph stored in JSON
- deterministic enrichment and scoring engine
- weighted scenario template matching for ad hoc analysis
- scan-report parsing and roll-up logic

### Data model

The synthetic graph currently includes:
- business units
- business services
- assets
- identities
- controls
- visible scenarios
- hidden classifier-only scenario patterns

## Current API Surface

### `GET /health`

Basic health check.

### `GET /api/default-profile`

Returns the default organization profile used for assumptions.

### `GET /api/scenarios`

Returns the visible built-in scenario cards for the left-hand scenario library.

### `GET /api/translate/{scenario_id}`

Returns the translated report for a selected built-in scenario.
Optional query parameters allow profile customization.

### `POST /api/analyze`

Accepts pasted text and/or uploaded file input.
Optional form parameters allow profile customization.
Returns:
- a single ad hoc report for simple input
- a scan-report roll-up with finding summaries for multi-finding uploads

## Current UX Structure

The intended reading order is:
1. hero band: what the product does
2. optional input strip: customer-specific tailoring
3. main workspace: scenario library on the left, translated outcome on the right

## Known Limitations

- Ad hoc analysis relies on heuristic keyword matching rather than trained classification. CVEs with sparse titles and no structured CVSS data may route to the generic fallback.
- Dollar estimates are synthetic and directional, not benchmark-calibrated.
- Scenario management and scoring weights are not yet editable through the UI.
- No authentication or multi-user workflow exists in the MVP.
- No persistence layer is included yet for saved analyses.
- No PDF or slide-deck export exists for board-pack output.
- No industry sector parameter — regulatory and crown-jewel defaults are the same for all verticals.

## Suggested Next Steps

1. Parse CVSS base scores and attack vectors directly from input text to replace keyword inference when structured data is available.
2. Add an industry sector selector (financial services, healthcare, manufacturing, retail) that pre-loads appropriate profile defaults.
3. Add "what if" profile sliders that update risk scores live without re-submitting, turning the tool into a real-time risk calculator.
4. Add a formatted PDF export for board-pack leave-behinds.
5. Add a session risk roll-up showing aggregate exposure across all analyses in the current session.
6. Move scoring weights and matcher configuration into editable config files or a lightweight admin UI.
