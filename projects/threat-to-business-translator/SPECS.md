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

### Industry sector selection

The application supports five industry sectors, each backed by its own synthetic enterprise graph:
- **Financial Services** (default) — banking, payments, wealth management
- **Healthcare** — EHR platforms, patient portals, clinical imaging, medical device networks
- **Manufacturing** — MES, ICS/SCADA, PLM, ERP, OT/IT boundary
- **Retail** — e-commerce, POS networks, payment processing, loyalty platforms
- **Technology** — SaaS platforms, CI/CD pipelines, cloud infrastructure, IAM

Selecting a sector loads sector-appropriate business units, services, assets, identities, controls, and scenario library. All three translation endpoints (`/api/scenarios`, `/api/translate`, `/api/analyze`) accept a `sector` parameter.

### Built-in scenario library

The application includes sector-specific visible synthetic scenarios per sector (5–7 library-visible scenarios per sector). The backend maintains 18 keyword-weighted SCENARIO_MATCHERS templates that classify ad hoc input across all sectors.

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

### FR10. CVSS-driven exploitability
- When a CVSS base score or vector string is present in the input text, the engine uses it as the authoritative exploitability signal in place of keyword inference.
- Supported formats: full v3 vector string (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`), labeled prose scores (`CVSSv3 Base Score: 9.8`, `Base Score: 7.5`), and bare scores (`CVSS: 8.7`).
- CVSS v3 severity bands map directly: Critical ≥9.0 → 5, High ≥7.0 → 4, Medium ≥4.0 → 3, Low ≥0.1 → 2.
- When only a vector string is present (no numeric score), exploitability is synthesised from AV, AC, PR, and UI components.
- Active exploitation signals (KEV, "exploited in the wild") apply a +1 boost even when CVSS is present, since KEV status is not encoded in CVSS scores.
- The scoring rationale cites the CVSS source and notes that keyword inference was overridden.
- When no CVSS data is found the engine falls back to keyword inference unchanged.

### FR11. Single-click launch
- A Windows launcher starts backend and frontend together.
- The launcher handles first-run dependency installation when possible.

### FR12. Industry sector selection
- The user selects an industry sector using a horizontal segmented control (pill tabs) showing all five options simultaneously: Financial Services, Healthcare, Manufacturing, Retail, Technology.
- Changing sector reloads the scenario library with sector-appropriate scenarios.
- The selected scenario and report always reload when sector changes, even if the first scenario ID in the new sector matches the previously selected ID.
- All backend endpoints accept a `sector` parameter; the default is `financial-services`.
- Each sector maps to a dedicated domain JSON file. The 18 SCENARIO_MATCHERS templates are shared across all sectors; `_scenario_by_id()` uses a resilient fallback chain so new matcher IDs work gracefully even if a domain file has not yet added a matching scenario stub.

### FR13. Executive report readability
- The Overall Risk value must be displayed as a color-coded badge (Critical/High/Moderate/Low).
- The Board Brief must be displayed in the report below the executive summary.
- The Technical Input section must be collapsed by default to reduce noise during demos.
- Recommended Actions must appear at the top of the detail grid, before findings and exposure bars.
- Overall Risk and Likely Loss metric cards must be visually featured (larger, accent-bordered) to draw attention to the headline numbers.
- Exposure bars must include a qualitative tone label (Critical/High/Moderate/Low) alongside the percentage.
- The report context banner must carry a left-border color accent matching the risk level.

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
- five sector-specific synthetic enterprise graphs stored in JSON (`enterprise_data*.json`)
- deterministic enrichment and scoring engine
- 18-template weighted SCENARIO_MATCHERS for ad hoc classification across all sectors
- resilient `_scenario_by_id()` lookup with edr-identity-lateral fallback
- CVSS v3 score and vector parser for authoritative exploitability
- scan-report parsing and roll-up logic
- sector parameter threaded through all translation and analysis call paths

### Data model

Each sector's synthetic graph includes:
- business units
- business services
- assets
- identities
- controls
- library-visible scenarios
- hidden classifier-only scenario stubs (used by SCENARIO_MATCHERS for ad hoc analysis)

## Current API Surface

### `GET /health`

Basic health check.

### `GET /api/default-profile`

Returns the default organization profile used for assumptions.

### `GET /api/sectors`

Returns the list of available industry sectors (id + label pairs).

### `GET /api/scenarios`

Returns the visible built-in scenario cards for the left-hand scenario library.
Optional `sector` query parameter selects the sector domain (default: `financial-services`).

### `GET /api/translate/{scenario_id}`

Returns the translated report for a selected built-in scenario.
Optional `sector` query parameter and profile customization parameters accepted.

### `POST /api/analyze`

Accepts pasted text and/or uploaded file input.
Optional `sector` form field and profile customization parameters accepted.
Returns:
- a single ad hoc report for simple input
- a scan-report roll-up with finding summaries for multi-finding uploads

## Current UX Structure

The intended reading order is:
1. hero band: what the product does
2. sector bar: industry selector (Financial Services / Healthcare / Manufacturing / Retail / Technology)
3. optional input strip: customer-specific tailoring (collapsed by default to reduce demo noise)
4. main workspace: scenario library on the left, translated outcome on the right

Report panel reading order:
1. report context banner (left-border accent matches risk level)
2. headline + executive summary + board brief
3. metric cards: Overall Risk (featured, color-coded badge) → Likely Loss (featured) → Likelihood / Impact / Urgency / Confidence
4. recommended actions (full-width, top of detail grid)
5. parsed findings
6. exposure profile / risk reduction
7. business context / impact band
8. active assumptions / control posture / scoring rationale

## Known Limitations

- Ad hoc analysis relies on heuristic keyword matching. CVEs with very sparse titles and no CVSS data may route to the generic fallback.
- Dollar estimates are synthetic and directional, not benchmark-calibrated.
- Scenario management and scoring weights are not yet editable through the UI.
- No authentication or multi-user workflow exists in the MVP.
- No persistence layer is included yet for saved analyses.
- No PDF or slide-deck export exists for board-pack output.

## Suggested Next Steps

1. Add "what if" profile sliders that update risk scores live without re-submitting, turning the tool into a real-time risk calculator.
2. Add a formatted PDF export for board-pack leave-behinds.
3. Add a session risk roll-up showing aggregate exposure across all analyses in the current session.
4. Move scoring weights and matcher configuration into editable config files or a lightweight admin UI.
5. Add a sixth sector (government / public sector) with appropriate BUs, services, and scenarios.
