# Cross-Framework Regulatory Harmoniser — Project Spec

## 1. Purpose

Cross-Framework Regulatory Harmoniser is a GCC cybersecurity compliance tool that takes an organisation's profile, determines which regulatory frameworks apply, and produces a side-by-side analysis of how those frameworks address each of 24 control domains — identifying gaps, overlaps, and the most demanding requirement in each domain.

The tool is designed to compress months of manual framework comparison work into a single session. Its primary users are:

- Compliance officers and CISOs preparing multi-framework gap assessments
- Presales and solution architects building framework-aligned compliance roadmaps for GCC clients
- Consultants onboarding a client to GCC regulatory requirements for the first time

## 2. Product Goals

The system must:

- determine the most relevant cybersecurity regulatory frameworks for a given GCC organisation profile using the Claude API
- analyse 24 control domains in parallel against all selected frameworks in a single session
- produce a colour-coded coverage matrix (Full / Partial / Not-addressed) across all selected frameworks
- collect the organisation's current implementation posture before generating a roadmap
- produce a prioritised, weighted implementation roadmap that respects framework weight (mandatory, contractual, voluntary) and posture gap
- export the coverage matrix to Excel and the full analysis to PDF
- support custom framework ingestion via PDF upload for non-built-in regulations or internal policies
- assess the impact of regulatory framework version changes on a current compliance posture

The system must not:

- recommend frameworks that do not genuinely apply to the described organisation
- inflate coverage for data protection laws (PDPL-UAE, PDPL-QAT, PDPL-KSA) by inferring general governance principles across technical domains
- allow re-upload of built-in frameworks as custom documents

## 3. Control Domains

The taxonomy covers 24 domains drawn from actual GCC framework documents:

1. Governance & Strategy
2. Risk Management
3. Policy & Compliance
4. Roles & Responsibilities
5. Awareness & Training
6. Asset Management
7. Identity & Access Management
8. Network Security
9. Email Security
10. Endpoint & Mobile Security
11. Data Protection
12. Application Security
13. Vulnerability Management
14. Logging & Monitoring
15. Incident Response
16. Business Continuity
17. Physical Security
18. Third-Party & Supply Chain
19. Cloud Security
20. OT / ICS Security
21. Payment Systems
22. Change Management
23. Privacy & Rights Management
24. Information Exchange & Gateway Security

The domain taxonomy is pre-built and stored in `server/taxonomy.json` (v5.0). It is not regenerated at runtime.

## 4. Supported Frameworks

| Framework ID | Name | Jurisdiction | Mandatory for |
|---|---|---|---|
| NCA-ECC | NCA Essential Cybersecurity Controls 2024 | Saudi Arabia | All Saudi organisations |
| SAMA-CSF | SAMA Cyber Security Framework | Saudi Arabia | Banking & financial services |
| CBK | Central Bank of Kuwait Framework | Kuwait | Banking & financial services only |
| ISO-27001 | ISO/IEC 27001:2022 | International | Baseline / contractual |
| NIST-CSF | NIST Cybersecurity Framework 2.0 | International | Voluntary reference |
| UAE-NIAF | UAE National Information Assurance Framework | UAE | Government and CNI |
| PDPL-UAE | UAE Personal Data Protection Law (DL 45/2021) | UAE | Controllers/Processors in UAE |
| PDPL-QAT | Qatar Personal Data Protection Law (Law 13/2016) | Qatar | All Qatar data processing |
| PCI-DSS | PCI DSS 4.0.1 | International | Payment card handlers |
| IEC-62443 | IEC 62443 | International | OT/ICS environments |
| SOC2 | SOC 2 | International | SaaS/technology companies |
| QATAR-NIAS | Qatar National Information Assurance Standard V2.1 | Qatar | All Qatar organisations (NCSA, Amiri Decree No. 1 of 2021) |
| PDPL-KSA | Saudi Personal Data Protection Law (RD M/19 of 2021, amended M/148 of 2023) | Saudi Arabia | Any org processing Saudi residents' data (extraterritorial) |
| KUWAIT-NBCC | Kuwait National Basic Cybersecurity Controls (NCSC Decision No. 2 of 2026) | Kuwait | All Kuwait entities under NCSC mandate |

## 5. Workflow

### 5.1 Intake Form

The user provides:

- **Organisation name** — optional free-text field; displayed in step headings throughout the workflow to personalise the session
- **Geography** — primary country of operations (Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman, Other GCC)
- **Sector** — banking & financial services, government, healthcare, telecoms, energy/oil & gas, retail, technology, other
- **Stock exchange listed** — boolean flag; triggers NIST-CSF upgrade from voluntary to contractual, SOC2 upgrade to contractual (investor and auditor due diligence), and a one-tier weight upgrade for any applicable governance framework that would otherwise be voluntary
- **Applicable characteristics** — multi-select from three options that are the only discriminating factors beyond geography and sector:
  - Personal data of GCC residents — triggers PDPL-UAE, PDPL-QAT, PDPL-KSA applicability
  - Payment card data — triggers PCI-DSS applicability
  - CNI operator (central bank, utility, telecoms, government) — triggers IEC-62443 and national CNI framework obligations

Selecting a sector automatically pre-selects the most likely applicable characteristics (e.g. Banking pre-selects Personal data and Payment card data; Oil & gas, Government, and Telecoms pre-select CNI operator; Healthcare pre-selects Personal data; Technology / SaaS and Other make no pre-selection (too heterogeneous to assume); Retail pre-selects Personal data and Payment card data). The user can deselect any auto-suggested characteristic. Previously selected characteristics are never removed by a sector change.

### 5.2 Framework Recommendation

The intake profile is sent to the Claude API with a detailed system prompt encoding GCC regulatory rules. The model returns a JSON array of recommended frameworks with:

- `frameworkId` — one of the 14 built-in IDs
- `weight` — `mandatory`, `contractual`, or `voluntary`
- `rationale` — 1–2 sentences
- `regulatoryBasis` — the specific law or regulation

Key recommendation rules:

- NCA-ECC is mandatory for Saudi entities; contractual for Multiple geography with stated Saudi operations; omitted entirely for UAE/Kuwait/Qatar/Bahrain/Oman
- SAMA-CSF is mandatory for Saudi banking only — no jurisdiction outside Saudi Arabia
- CBK is mandatory for Kuwait banking only — not for Kuwait government, CNI operators, or any non-financial sector
- KUWAIT-NBCC is mandatory alongside CBK for Kuwait banking — Article 4 requires compliance with the stricter standard where they overlap; CBK does not displace KUWAIT-NBCC
- QATAR-NIAS is mandatory for all Qatar entities under Amiri Decree No. 1 of 2021
- KUWAIT-NBCC is mandatory for all Kuwait entities under NCSC mandate (Amiri Decree 37 of 2022); compliance deadline ~October 2027
- PDPL-UAE weight is calibrated by geography — mandatory for UAE private sector entities; government entities, DIFC/ADGM entities, and UAE federal/central bank institutions are exempt
- PDPL-QAT weight is calibrated by geography — mandatory if primary geography is Qatar; omitted for single-country non-Qatar organisations with no Qatar nexus
- PDPL-KSA is extraterritorial — mandatory for any organisation processing Saudi residents' data regardless of where the org is based
- Multi-PDPL applicability: PDPLs are triggered by data-subject location, not org headquarters
- PCI-DSS is mandatory if payment card data is selected; for central bank profiles it is omitted unless payment card data is explicitly selected, in which case it is downgraded to contractual
- IEC-62443 is contractual for CNI operators with OT/ICS systems — triggered by the CNI operator characteristic selection (no separate OT/ICS intake field exists)
- SOC2 is contractual for SaaS/technology companies serving international clients; also upgraded to contractual for stock-exchange-listed entities regardless of sector
- NIST-CSF upgrades from voluntary to contractual for stock-exchange-listed entities
- All applicable governance frameworks are upgraded one weight tier if they would otherwise be voluntary for a listed entity

The user can adjust weights and toggle frameworks on the Framework Selector screen before running harmonisation. A minimum of one framework is required to proceed — selecting a single framework runs a compliance breakdown against that framework alone rather than a cross-framework comparison; the UI relabels accordingly ("Compliance breakdown" instead of "Coverage matrix", "What this framework requires" instead of "What frameworks collectively require", and the "Most demanding framework" badge is hidden since there is nothing to compare against).

### 5.3 Harmonisation

The selected frameworks are analysed against all 24 domains in parallel using a concurrency limiter (max 2 simultaneous Claude calls) to respect the Anthropic rate limit. 429 rate-limit responses are automatically retried with exponential backoff (15s → 30s → 60s, up to 4 attempts).

For each domain, Claude receives:

- the domain label and description
- the control references from `taxonomy.json` for each built-in framework (IDs only — Claude uses training knowledge for these)
- the extracted control text (capped at 300 characters) for any custom uploaded frameworks

Claude returns a structured JSON object per domain:

- `harmonisedSummary` — what all frameworks collectively require
- `coverageByFramework` — coverage, specificity, and key requirement per framework
- `mostDemandingFramework` — which framework is most prescriptive
- `implementationGuidance` — what to implement to satisfy the most demanding standard
- `typicalTechnologies` — 3–5 common technologies
- `estimatedEffort` — `low`, `medium`, `high`, or `very-high`

Results are streamed to the frontend via Server-Sent Events as each domain completes.

### 5.4 Coverage Matrix

Displays a grid of 24 domains × N frameworks. Each cell shows Full (green) / Partial (amber) / Not-addressed (grey). Clicking any row expands an inline detail panel showing:

- **What frameworks collectively require** — the harmonised summary across all selected frameworks
- **Most demanding framework** — badge showing the framework with the most prescriptive requirement
- **Implementation guidance** — what to implement to satisfy the most demanding standard
- **Typical technologies** — 3–5 technology chips relevant to that domain
- **Key requirement by framework** — one-line requirement for each framework with Full or Partial coverage

### 5.5 Posture Assessment

Before the roadmap can be generated, the user must rate the organisation's current implementation status for all 24 domains. The Continue button is disabled until all domains have been rated. The counter turns green when all 24 are rated.

Posture options per domain: `not-implemented`, `partial`, `full`, `not-assessed`.

### 5.6 Roadmap

The harmonisation results and posture map are sent to Claude to generate a prioritised roadmap.

**Gap type classification** — each domain gap is classified before action language is written:

| Gap type | Condition | Action language |
|---|---|---|
| Implementation gap | posture = not-implemented or not-assessed | "Implement X", "Deploy Y", "Establish Z" |
| Partial gap | posture = partial | "Extend X to cover Y", "Enhance A to include B" |
| Compliance alignment gap | posture = full + coverage partial/not-addressed | "Map existing X to [framework]", "Evidence compliance by formalising Z" |

**Prioritisation logic** (framework weight × posture):

| Condition | Priority |
|---|---|
| Mandatory + not-implemented or not-assessed | Immediate |
| Mandatory + partial | Short-term |
| Mandatory + full (compliance alignment gap) | Short-term |
| Contractual + not-implemented or not-assessed | Short-term |
| Contractual + partial | Medium-term |
| Contractual + full (compliance alignment gap) | Medium-term |
| Voluntary (any posture) | Planned |

Full-posture domains never count toward `criticalGaps`. Executive summary language switches from "critical gaps / implement" to "compliance alignment gaps / map existing controls" when all posture ratings are full.

Each roadmap item includes: rank, priority, weighted score, mandatory framework gaps, recommended actions (3–5), estimated effort, and quick wins (1–2 things achievable in under 2 weeks).

**`mandatoryFrameworkGaps` qualification rule** — a framework is only included in this list if all three conditions hold: weight = mandatory, coverage = partial (the framework partially addresses the domain), and posture = not-implemented or partial. Frameworks with `not-addressed` coverage are excluded even if mandatory — `not-addressed` means the framework has no controls in that domain, which is not an organisational gap.

### 5.7 Export

- **Excel**: two-sheet workbook
  - *Sheet 1 — Coverage matrix*: one row per domain × one column per framework, colour-coded Full / Partial / Not-addressed cells, with effort column
  - *Sheet 2 — Key requirements*: one row per domain/framework pair — weight, coverage level, key requirement text, and most-demanding-framework flag
- **PDF**: Puppeteer-rendered landscape A4 report including executive summary, full coverage matrix table, per-domain harmonisation detail (summary, most demanding framework, implementation guidance), and full implementation roadmap with priority badges and recommended actions for all domains

## 6. Architecture

### 6.1 Backend

- Runtime: Node.js 18+, ESM (`"type": "module"`)
- Framework: Express
- HTTP client: node-fetch
- PDF renderer: Puppeteer
- Excel: ExcelJS
- PDF parsing (custom framework ingestion): pdf-parse (`pdf-parse/lib/pdf-parse.js` for ESM compatibility)

Key responsibilities:

- framework recommendation via Claude API
- parallel domain analysis (SSE stream, concurrency-limited to 2)
- in-memory harmonisation cache keyed by `domainId + sorted framework list`
- custom framework extraction and in-memory store
- roadmap generation via Claude API
- Excel and PDF export
- Change Tracker analysis

### 6.2 Frontend

- Framework: React 18
- Build tool: Vite 5
- Styling: plain CSS

Key components:

| Component | Responsibility |
|---|---|
| `IntakeForm.jsx` | Organisation profile capture — org name, geography, sector (with characteristic auto-suggestion), characteristics, stock exchange listing, CNI context box |
| `FrameworkSelector.jsx` | Recommended frameworks with weight badges, manual toggle, custom PDF upload, extraction preview |
| `ProgressBar.jsx` | Live domain-by-domain analysis progress |
| `CoverageMatrix.jsx` | Colour-coded domain × framework grid with expandable detail |
| `PostureAssessment.jsx` | Per-domain posture rating with completion gate |
| `Roadmap.jsx` | Prioritised roadmap cards with gap summary |
| `ExportPanel.jsx` | Excel and PDF download |
| `ChangeTracker.jsx` | Framework version change analysis with re-harmonisation prompt |

### 6.3 Workspace Structure

npm workspaces with a root `package.json` orchestrating `server` (port 3004) and `client` (port 5179) packages.

### 6.4 Harmonisation Cache

Results are cached in a module-level `Map` in `harmonise.js` keyed by `domainId + sorted selected framework list`. When the user adds or removes a single framework, only the affected domains are re-analysed — unchanged framework combinations are served from cache instantly.

## 7. AI Layer

### 7.1 Model

- Provider: Anthropic Claude API
- Model: `claude-haiku-4-5`
- Chosen for cost efficiency across up to 24 parallel domain calls per session

### 7.2 Concurrency Limiting

A custom `runWithConcurrency(items, 2, fn)` function limits simultaneous Claude calls to 2 during harmonisation. This prevents sustained 429 rate-limit errors on the Anthropic standard tier (10,000 TPM). 429 responses are retried automatically with exponential backoff: 15s, 30s, 60s (up to 4 attempts total).

Retry sleeps are abort-aware: if the client disconnects mid-wait (tab close, Back navigation, New analysis), the `AbortSignal` cancels the `setTimeout` immediately via an `abort` event listener rather than letting the full 15s–60s delay run to completion. This prevents orphaned retry loops from holding server resources after the client is gone.

### 7.3 Token Budget

| Call | Max tokens |
|---|---|
| Intake / framework recommendation | 2500 |
| Domain harmonisation (per domain) | 2000 |
| Roadmap | 8192 |
| Custom framework extraction | 3000 |
| Change tracker | 4000 |

### 7.4 Response Parsing

All Claude calls use a hardened `parseClaudeJSON()` function that attempts five extraction strategies in order:

1. `<r>…</r>` tags (primary format)
2. `<result>…</result>` tags
3. Fenced JSON code block (` ```json … ``` `)
4. Bare JSON starting from first `{` (complete response without tags)
5. **Truncation recovery**: if a `<r>` tag is found but no closing tag (response cut mid-string), extracts all complete `roadmapItems` up to the last valid `}` and returns a partial result with a user-visible warning rather than throwing

Strategy 5 guards against future token-limit regressions without losing the user's partially-generated roadmap.

## 8. Custom Framework Ingestion

1. User uploads a PDF on the Framework Selector screen (optional name field + file picker above the upload button)
2. Backend extracts raw text via pdf-parse
3. Text (capped at 12,000 characters) is sent to Claude with the 24 domain list
4. Claude returns a `domainControlMap` mapping each domain to extracted control IDs and text
5. The custom framework is stored in-memory as `CUSTOM-<uuid>` and made available as a selectable framework
6. An extraction preview component on the Framework Selector screen shows which domains were covered before harmonisation runs
7. Custom frameworks are lost on server restart (intentional for demo)

A warning listing all 14 built-in framework names is shown below the upload controls to prevent accidental re-upload of built-in frameworks. Built-in framework names and aliases are also blocked server-side via `isBuiltinFramework()` guard in `customFramework.js`.

## 9. Change Tracker

Two modes:

- **Document comparison**: upload or paste two versions of a framework document; Claude identifies every added, modified, removed, and restructured control
- **Description-based**: describe a known change in text; Claude maps it to the taxonomy and assesses impact

Each identified change includes:

- `type` — added, modified, removed, restructured
- `controlReference` — control ID or section reference
- `domainId` — closest taxonomy domain match
- `implementationImpact` — policy-change, config-change, new-technology, process-change, no-action
- `urgency` — immediate, next-review-cycle, monitor

Output also includes `staleAssessments` (domain IDs that need re-harmonisation) and recommended actions. When stale domains or new controls are detected, the UI shows a callout prompting the user to ingest the updated document via the Harmoniser.

## 10. REST API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness — returns `{ status: "ok", domains: 24, frameworks: 14 }` |
| GET | `/api/taxonomy` | Full taxonomy JSON |
| POST | `/api/intake` | Framework recommendation from profile |
| GET | `/api/harmonise/stream` | SSE — parallel domain analysis |
| POST | `/api/roadmap` | Roadmap from harmonisation results and posture map |
| POST | `/api/export/excel` | Download Excel matrix |
| POST | `/api/export/pdf` | Download PDF report |
| POST | `/api/change-tracker/documents` | Compare two framework PDFs |
| POST | `/api/change-tracker/description` | Analyse described change |
| POST | `/api/cache/clear` | Clear harmonisation cache |
| POST | `/api/frameworks/custom` | Upload custom framework PDF |
| GET | `/api/frameworks/custom` | List custom frameworks |
| DELETE | `/api/frameworks/custom/:id` | Remove custom framework |

## 11. PDF Export

Generated server-side via Puppeteer rendering an inline HTML template (`server/reportTemplate.js`).

The report includes:

- branded header with session metadata
- executive summary and overall coverage statistics
- full coverage matrix table with colour-coded cells
- per-domain harmonisation detail (summary, most demanding framework, implementation guidance)
- implementation roadmap with priority badges and recommended actions

All Claude-generated text is HTML-escaped with `esc()` before injection into the template to prevent XSS in the Puppeteer rendering context.

The Puppeteer PDF call returns a `Uint8Array` in Puppeteer v22+ — wrapped in `Buffer.from()` for Express `res.send()` compatibility.

## 12. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | From [console.anthropic.com](https://console.anthropic.com) |
| `PORT` | No | Backend port, defaults to `3004` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if Puppeteer cannot auto-detect it |

## 13. Taxonomy

`server/taxonomy.json` is the authoritative control mapping file (v5.0). It contains:

- 24 domain definitions with `domainId`, `domainLabel`, and `description`
- A `controls` map per domain with control ID arrays for each of the 14 built-in frameworks
- A `frameworks` map with metadata for each framework (name, version, jurisdiction, mandatory flag, sector, enforcer, legal basis, confidence level, notes)

The taxonomy was built from actual framework documents. It must not be regenerated from scratch — only amended with targeted migration scripts.

### 13.1 GCC-Specific Regulatory Depth

The taxonomy encodes nuances that are frequently wrong in generic compliance tools:

**KUWAIT-NBCC (Decision No. 2/2026)**
- Control references use the official NCSC classification: GOV-1 through GOV-6, PR-1 through PR-6, DE-1, RS-1, RC-1/RC-2, CLD-1 through CLD-16 — each mapped to the correct domain
- Framework `notes` field captures: the ~October 2027 compliance deadline (18 months from publication), the annual self-assessment obligation under GOV-5, and the NIST CSF 2.0 glossary as the fallback for undefined terms — all sourced from the actual Decision 2/2026 text
- Privacy-rights-management domain is intentionally empty: KUWAIT-NBCC is a cybersecurity controls framework, not a data protection law. Kuwait has no standalone PDPL; privacy obligations for Kuwait entities follow from the PDPL of the relevant data subjects' home jurisdiction

**PDPL-KSA (Royal Decree M/19/2021, amended M/148/2023)**
- Article references distinguish the three instruments of the Saudi PDPL regime:
  - `Art.X` — the Law itself (Royal Decree M/19)
  - `IR-Art.X` — the Implementing Regulation
  - `TR-Art.X` — the Transfer Regulation
- Privacy-rights-management maps 19+ specific requirements including 30-day response timelines for data access requests, identity verification requirements, and restrictions on copying official documents

**QATAR-NIAS (V2.1)**
- Control references follow the official NIAP-NAT-DCLS hierarchical classification structure used in V2.1
- Privacy-rights-management domain is intentionally empty: QATAR-NIAS is a national information assurance standard, not a data protection law. Qatar data protection obligations are covered by PDPL-QAT (Law No. 13/2016)

**Multi-PDPL applicability**
- PDPL-UAE, PDPL-QAT, and PDPL-KSA are triggered by data-subject location, not org headquarters
- All three are mapped at article level across the Privacy & Rights Management domain with jurisdiction-correct controls
- PDPL-KSA has extraterritorial reach: any organisation anywhere processing Saudi residents' personal data is in scope

**Framework scope integrity**
- Cybersecurity frameworks (KUWAIT-NBCC, QATAR-NIAS) carry no privacy-rights-management controls
- PDPL frameworks carry no OT/ICS or payment-systems controls
- The taxonomy does not infer or interpolate controls across framework types

## 14. Launcher

`Launch Cross-Framework Harmoniser.cmd` is a single Windows `.cmd` file that:

1. Clears ports 3004 and 5179
2. Runs `npm install` at the workspace root if `node_modules` is missing
3. Bootstraps `.env` from `.env.example` if `.env` does not exist
4. Downloads Puppeteer Chromium if the cache directory does not exist
5. Opens the backend and frontend in separate PowerShell windows with a 3-second stagger

## 15. Key Project Files

- `server/index.js` — Express app, all route handlers, Claude intake call
- `server/harmonise.js` — parallel domain analysis, concurrency limiter (max 2), 429 retry logic, cache, roadmap call
- `server/prompt.js` — all Claude system prompts, prompt builder functions, taxonomy loader
- `server/customFramework.js` — PDF extraction, custom framework store, duplicate guard
- `server/changeTracker.js` — Change Tracker Claude calls and route handler
- `server/excel.js` — ExcelJS matrix export
- `server/pdf.js` — Puppeteer PDF generation
- `server/reportTemplate.js` — HTML template for PDF with `esc()` escaping
- `server/taxonomy.json` — 24 domains × 14 frameworks control mapping (v5.0)
- `client/src/App.jsx` — top-level state machine (intake → frameworks → harmonising → matrix → posture → roadmap)
- `client/src/components/` — all UI components
- `client/vite.config.js` — Vite dev server with proxy to `:3004`, 120-second timeout

## 16. Non-Goals for V1

- User authentication or multi-tenancy
- Persistent storage (harmonisation results and custom frameworks are in-memory only)
- Scheduled compliance monitoring or drift detection
- Direct regulatory document ingestion for built-in frameworks (control mappings are pre-authored in taxonomy.json)
- Integration with GRC platforms (ServiceNow, Archer)
- Arabic language output

## 17. Risks and Constraints

### Rate Limiting

The Anthropic API enforces a tokens-per-minute limit on standard tiers. The concurrency limiter (max 2 simultaneous calls) reduces burst pressure, and 429 responses are retried with 15s/30s/60s exponential backoff rather than failing immediately. Total harmonisation time is approximately 90–120 seconds for 24 domains at concurrency 2.

### Roadmap Token Budget

The roadmap prompt covers 24 domains × N frameworks of coverage data in compact one-line-per-domain format. Each roadmap item averages ~300 output tokens; a full 24-item roadmap with executive summary requires ~7,400 tokens. `max_tokens` is set to **8192** (the model maximum for `claude-haiku-4-5`). The previous value of 6000 caused truncation mid-response, stranding the closing `</r>` tag outside the token window and failing every parse fallback. If new frameworks or significantly longer action descriptions increase output size, consider splitting the roadmap into two calls (immediate/short-term in call 1, medium-term/planned in call 2).

### Custom Framework Quality

Control extraction quality depends on the PDF structure. Scanned PDFs or heavily formatted tables may yield incomplete extraction. The extraction preview allows the user to verify coverage before running harmonisation.

### Puppeteer on Windows

Puppeteer requires Chromium. The launcher downloads it on first run. If the download fails or Chrome cannot be located, set `PUPPETEER_EXECUTABLE_PATH` in `.env` to the full path of an installed Chrome binary.

### In-Memory State

All harmonisation results, custom frameworks, and the roadmap are held in server memory. A server restart resets all state. This is intentional for the demo use case — a production deployment would require persistent storage.

## 18. Current Status

The project currently includes:

- working intake form with optional organisation name (personalises all step headings), geography, sector, stock exchange listing, CNI characteristic detection, and geography-aware CNI tooltip
- sector selection auto-suggests applicable characteristics (sector → characteristic mapping covers all 8 sectors; additive only — never removes user selections)
- abort-aware retry sleeps in harmonise.js — client disconnect cancels in-flight 429 backoff waits immediately rather than after the full delay
- clickable domain expansion in coverage matrix surfacing harmonised summary, implementation guidance, typical technologies, most demanding framework, and per-framework key requirements
- inline error banners replacing alert() for intake, harmonisation, and roadmap failures
- back navigation on steps 2, 4, 5, 6 (frameworks → intake, matrix → frameworks, posture → matrix, roadmap → posture); no back button during harmonising progress step
- "New analysis" button in topbar (visible on steps 2, 4, 5, 6; hidden during harmonising) — resets all client state including intake profile back to step 1 and clears the server-side harmonisation cache
- Claude-powered framework recommendation with GCC-tuned jurisdiction scoping rules for all 14 built-in frameworks
- jurisdiction OMIT rules preventing cross-border hallucination (NCA-ECC/SAMA-CSF Saudi-only, CBK Kuwait-banking-only, government entity PDPL-UAE exemption, central bank PCI-DSS downgrade)
- multi-PDPL applicability logic: PDPL-KSA extraterritorial scope, data-subject-location trigger for multi-PDPL recommendations
- parallel domain harmonisation via SSE stream with concurrency limiter (max 2) and 429 retry backoff
- in-memory harmonisation cache with per-domain invalidation on framework selection change
- posture assessment gate requiring all 24 domains to be rated before roadmap generation — four options: not-implemented, partial, full, not-assessed
- posture selections persisted to parent state in real-time via `onPostureChange` callback, surviving Back navigation and component unmount/remount
- weighted roadmap generation with mandatory/contractual/voluntary × posture priority matrix
- gap type classification in roadmap: IMPLEMENTATION GAP / PARTIAL GAP / COMPLIANCE ALIGNMENT GAP — action language and priority differ per type
- full-posture executive summary uses "compliance alignment gaps / map existing controls" language, never "critical gaps / implement"
- `criticalGaps` counter excludes full-posture domains
- Excel export via ExcelJS — two sheets: coverage matrix (all domains × frameworks, colour-coded, with effort) and key requirements (one row per domain/framework pair with weight, coverage, key requirement text)
- PDF export via Puppeteer with HTML escaping and Buffer compatibility — landscape A4, full detail for all roadmap items
- custom framework ingestion via PDF upload with extraction preview
- Change Tracker for document comparison and description-based change analysis
- built-in framework duplicate upload guard
- PDPL-KSA (Saudi PDPL, Royal Decree M/19/2021) as the 13th built-in framework
- KUWAIT-NBCC (NCSC Decision No. 2 of 2026) as the 14th built-in framework
- Information Exchange & Gateway Security as the 24th control domain
- hardened Claude JSON parser with 5-fallback extraction strategy including truncation recovery
- roadmap `max_tokens` raised to 8192 (model max) — fixes truncation on 24-domain runs
- progress bar timer updated to "30–90 seconds" reflecting concurrency-2 design
- Windows single-click launcher with automatic Chromium download

## 19. Future Enhancements

Potential next steps:

- persistent session storage (IndexedDB client-side or SQLite server-side)
- additional GCC frameworks: Bahrain PDO, Oman NCSI
- control-level gap export — CSV listing each missing control per framework
- evidence upload per domain — attach screenshots or policy documents to a posture rating
- AI-assisted posture assessment — upload existing policies and let Claude rate the posture
- multi-language support for Arabic executive summaries
- integration with SIEM or GRC platforms for automated posture updates
- regulatory change alert feed — monitor official sources and surface new Change Tracker inputs automatically
