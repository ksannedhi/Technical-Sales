# Phishing Analyzer Project Spec

## Overview

Phishing Analyzer is a demo-first web application that analyzes suspicious email content and turns it into a polished, executive-ready phishing report. The app is designed primarily for CISO and presales conversations, while still remaining technically credible for analysts.

The product goal is simple:

- paste one suspicious email
- get a polished phishing assessment
- present it in a visually convincing way
- do it fast enough to feel live in a demo

## Product Intent

This is not intended to be a mailbox security platform or SOC case management tool in V1.
It is a focused phishing analysis demo that combines:

- raw email inspection
- AI-assisted reasoning
- MITRE ATT&CK context
- NCA ECC mapping
- owner-based recommendations
- downloadable PDF reporting

## Primary User

Primary target user:

- CISO / presales demo audience

Secondary viewers:

- SOC analysts
- compliance / GRC stakeholders
- MSSP consultants

## MVP Success Criteria

The first demo should allow a user to:

1. Paste or upload one suspicious email
2. Receive a structured threat report
3. Understand the risk within seconds
4. Export a presentation-quality PDF

Performance target:

- target under 10 seconds end-to-end
- practical current result is near that target depending on API latency

## Supported Inputs

Version 1 supports:

- pasted raw email text
- uploaded `.eml` files
- pasted headers + body
- forwarded email text from Outlook or Gmail

Demo and test phishing samples are expected to live under:

- `sample-emails/`

## Threat Types In Scope

The analyzer should handle:

- phishing
- business email compromise (BEC)
- malware delivery
- credential harvesting
- impersonation
- invoice fraud / finance-related social engineering

## Functional Requirements

### Input Experience

The user can:

- paste suspicious email content into a large text area
- upload an `.eml` file
- use a sample email to demo the flow quickly

### Analysis Output

The app should return:

- risk score
- verdict
- confidence
- executive summary
- analyst summary
- structured findings
- MITRE ATT&CK tactics
- NCA ECC compliance gaps
- owner-based recommendations
- report metadata

### Findings Presentation

Findings should be:

- ordered by severity
- labeled by category
- supported by direct excerpts from the source email
- mapped to NCA ECC controls

The preferred visual style uses:

- severity pills such as `Critical`, `High`, `Medium`
- uppercase category labels such as `Sender`, `Headers`, `Links`
- evidence excerpts shown in subtle boxed blocks

### NCA ECC Compliance Gaps

NCA ECC content should be shown in tabular form with columns for:

- finding category
- NCA ECC controls violated
- what the control requires

The mapping logic is:

- fixed baseline mappings by category
- AI-written explanation in plain English

## Architecture

### Frontend

- React
- Vite

Responsibilities:

- input capture
- loading states
- result visualization
- PDF download action

### Backend

- Node.js
- Express

Responsibilities:

- receive analysis requests
- parse email content
- run deterministic checks
- call OpenAI Responses API
- validate structured output
- apply deterministic override logic when the model underweights or overcalls the evidence
- generate PDF reports

### AI Layer

- OpenAI Responses API
- structured output with JSON schema
- default low-cost model: `gpt-5-nano`

Responsibilities:

- produce balanced executive + analyst summaries
- correlate deterministic evidence into a final risk verdict
- return structured findings and recommendations
- explain NCA ECC control implications in plain English

### PDF Layer

- Puppeteer-based HTML-to-PDF rendering

Responsibilities:

- create a polished PDF layout
- mirror the app's report structure
- support findings pills and ECC tables matching the design direction
- include the analysis source in report metadata

## Hybrid Analysis Design

The analyzer is intentionally hybrid.

### Deterministic Checks

These are used to create reliable baseline evidence, including:

- sender / reply-to mismatch
- typosquatted sender domains
- suspicious link mismatch
- unfolded authentication-header parsing for SPF, DKIM, and DMARC context
- urgency language
- credential harvesting cues
- impersonation cues
- finance fraud cues
- attachment presence

### AI Reasoning

The model is responsible for:

- overall verdict
- score calibration
- executive summary
- analyst summary
- MITRE ATT&CK mapping
- ECC explanation
- role-based recommendations

This reduces hallucination risk while preserving demo value.

### Source Transparency

Each result should carry an `analysisSource` marker so the UI and PDF can indicate whether the final report came from:

- `openai_structured`
- `deterministic_fallback`
- `deterministic_override`

This keeps demo output honest and makes troubleshooting easier.

## Output Schema

The backend returns a structured object with these main fields:

- `riskScore`
- `verdict`
- `confidence`
- `executiveSummary`
- `analystSummary`
- `findings[]`
- `attackTactics[]`
- `eccComplianceGaps[]`
- `recommendations[]`
- `metadata`

## ECC Mapping Model

The ECC mapping model is intentionally more complete than a simple category lookup.
It combines:

- baseline controls by finding category
- supporting controls by likely compromise scenario

This helps:

- make reports look different depending on the incident type
- better reflect phishing vs BEC vs malware delivery vs invoice fraud
- improve risk scoring consistency

### Baseline Mapping By Finding Category

- `sender` -> `ECC-2-1-1`, `ECC-2-1-3`
- `headers` -> `ECC-2-1-1`, `ECC-2-1-3`
- `links` -> `ECC-2-3-1`, `ECC-2-3-2`
- `credential_harvesting` -> `ECC-1-5-1`, `ECC-1-5-3`
- `impersonation` -> `ECC-2-1-2`, `ECC-3-3-1`
- `urgency` -> `ECC-3-3-1`, `ECC-3-3-2`
- `financial_fraud` -> `ECC-3-3-1`, `ECC-3-3-2`
- `payload` -> `ECC-2-1-3`, `ECC-2-3-2`
- `content` -> `ECC-3-3-1`, `ECC-3-3-2`

### Threat Profile Overlays

The analyzer should infer the likely compromise scenario and overlay additional supporting controls:

- `phishing`
  - `ECC-2-1-1`, `ECC-2-1-3`, `ECC-2-3-1`, `ECC-2-3-2`, `ECC-3-3-1`, `ECC-3-3-2`
- `business_email_compromise`
  - `ECC-2-1-1`, `ECC-2-1-2`, `ECC-2-1-3`, `ECC-1-5-1`, `ECC-3-3-1`, `ECC-3-3-2`
- `malware_delivery`
  - `ECC-2-1-3`, `ECC-2-3-1`, `ECC-2-3-2`, `ECC-3-3-1`, `ECC-3-3-2`
- `credential_harvesting`
  - `ECC-2-1-1`, `ECC-2-1-3`, `ECC-2-3-1`, `ECC-2-3-2`, `ECC-1-5-1`, `ECC-1-5-3`, `ECC-3-3-1`
- `impersonation`
  - `ECC-2-1-1`, `ECC-2-1-2`, `ECC-2-1-3`, `ECC-3-3-1`, `ECC-3-3-2`
- `invoice_fraud`
  - `ECC-2-1-1`, `ECC-2-1-2`, `ECC-2-1-3`, `ECC-1-5-1`, `ECC-3-3-1`, `ECC-3-3-2`

### Intended Outcome

Examples:

- a credential-harvesting email should emphasize email security, URL inspection, MFA, and privileged credential protection
- a BEC or invoice-fraud email should emphasize impersonation, email controls, MFA, awareness, and reporting
- a malware-delivery email should emphasize email filtering, malicious URL blocking, and response readiness

## UI Direction

The UI should feel:

- clean
- premium
- business-ready
- visually persuasive
- restrained rather than flashy

Important visual priorities:

1. risk score and verdict should be obvious immediately
2. executive summary should be easy to quote
3. findings should be easy to scan by severity
4. ECC table should be easy to discuss during a customer meeting
5. recommendations should feel actionable

### Inspiration Alignment

The current design direction should align with the provided mockups by using:

- compact branded header
- large score / verdict area
- findings section with pills and evidence rows
- ECC table matching the reference structure
- generic `Phishing Analyzer` branding

## PDF Direction

The PDF should mirror the mockup style as closely as practical.

Required elements:

- branded header with metadata
- verdict card with score and executive summary
- analyst summary section
- MITRE ATT&CK tags
- findings section with severity pills and excerpt blocks
- ECC compliance gaps table
- recommendations table

## Model and Cost Strategy

Default model:

- `gpt-5-nano`

Reasoning settings:

- minimal reasoning effort
- low verbosity
- compact evidence payload
- structured output token ceiling sized for richer findings, ECC text, and recommendations

Why:

- lowest practical cost
- better latency for demo usage
- structured outputs still supported

## Startup Experience

The project supports Windows launcher flows.

Preferred launcher:

- `Launch Phishing Analyzer.cmd`

Supporting scripts:

- `launch.ps1`

The launcher should:

- install packages if needed
- create `.env` from `.env.example` if missing
- open backend and frontend in separate windows
- print the local URLs clearly

## Operational Safeguards

- request body limit raised to `5mb` for larger enterprise `.eml` files
- lightweight in-memory rate limiting on `/api/analyze`
- attachment detection limited to MIME and attachment-header evidence to reduce false positives
- deterministic override when the model overcalls an email with strong legitimate authentication evidence

## Key Project Files

- `client/src/App.jsx`
- `client/src/components/*`
- `client/src/styles/global.css`
- `server/src/routes/analyze.js`
- `server/src/routes/report.js`
- `server/src/parsing/emailParser.js`
- `server/src/rules/deterministicChecks.js`
- `server/src/mappings/eccMappings.js`
- `server/src/prompts/analyzeEmail.js`
- `server/src/schemas/analysisResultSchema.js`
- `server/src/services/openaiAnalysis.js`
- `server/src/services/reportTemplate.js`
- `server/src/services/pdfReport.js`

## Non-Goals For V1

Not included in V1:

- mailbox integration
- user accounts
- persistent case storage
- workflow orchestration
- multilingual reporting
- white-label customer branding controls
- production-grade SOC ticketing integrations

## Risks and Constraints

### Model Latency

Even with `gpt-5-nano`, latency may occasionally exceed the ideal demo target.

Mitigations:

- keep prompt compact
- trim evidence payloads
- keep schema concise
- show deterministic findings quickly in the UI if needed later

### Hallucination Risk

Mitigations:

- deterministic evidence first
- structured schema validation
- fixed ECC mapping baseline
- restrained prompt instructions

### PDF Rendering

Puppeteer is required for high-fidelity PDF generation.
If the app is running during PDF service updates, it should be restarted.

### Language Coverage

The current version handles multilingual infrastructure signals better than multilingual social-engineering language.

In practice:

- non-English phishing emails with suspicious links, headers, reply routing, or attachment patterns can still be detected well
- English-language scam phrasing is covered more deeply than non-English deterministic wording today
- broader multilingual heuristic coverage remains a future enhancement

## Future Enhancements

Potential next steps:

- faster perceived analysis with progressive rendering
- even closer UI alignment to the mockups
- stronger PDF typography and spacing polish
- broader multilingual deterministic cue coverage
- export options beyond PDF

## Current Status

The project currently includes:

- working frontend scaffold
- working backend scaffold
- hybrid deterministic + AI analysis path
- OpenAI structured output integration
- Windows launcher flow
- Puppeteer-based PDF generation
- mockup-style PDF template foundation
- analysis source indicator in the UI and PDF
- grounded MITRE normalization and scenario-specific recommendations
