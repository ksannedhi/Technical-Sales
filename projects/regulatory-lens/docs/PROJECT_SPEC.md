# Cross-Framework Regulatory Harmoniser — Project Spec

## 1. Purpose

Cross-Framework Regulatory Harmoniser is a GCC cybersecurity compliance tool that takes an organisation's profile, determines which regulatory frameworks apply, and produces a side-by-side analysis of how those frameworks address each of 23 control domains — identifying gaps, overlaps, and the most demanding requirement in each domain.

The tool is designed to compress months of manual framework comparison work into a single session. Its primary users are:

- Compliance officers and CISOs preparing multi-framework gap assessments
- Presales and solution architects building framework-aligned compliance roadmaps for GCC clients
- Consultants onboarding a client to GCC regulatory requirements for the first time

## 2. Product Goals

The system must:

- determine the most relevant cybersecurity regulatory frameworks for a given GCC organisation profile using the Claude API
- analyse 23 control domains in parallel against all selected frameworks in a single session
- produce a colour-coded coverage matrix (Full / Partial / Not-addressed) across all selected frameworks
- collect the organisation's current implementation posture before generating a roadmap
- produce a prioritised, weighted implementation roadmap that respects framework weight (mandatory, contractual, voluntary) and posture gap
- export the coverage matrix to Excel and the full analysis to PDF
- support custom framework ingestion via PDF upload for non-built-in regulations or internal policies
- assess the impact of regulatory framework version changes on a current compliance posture

The system must not:

- recommend frameworks that do not genuinely apply to the described organisation
- inflate coverage for data protection laws (PDPL-UAE, PDPL-QAT) by inferring general governance principles across technical domains
- allow re-upload of built-in frameworks as custom documents

## 3. Control Domains

The taxonomy covers 23 domains drawn from actual GCC framework documents:

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

The domain taxonomy is pre-built and stored in `server/taxonomy.json`. It is not regenerated at runtime.

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

## 5. Workflow

### 5.1 Intake Form

The user provides:

- **Geography** — primary country of operations (Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman, Other GCC)
- **Sector** — banking & financial services, government, healthcare, telecoms, energy/oil & gas, retail, technology, other
- **Employee count** — range selector
- **Stock exchange listed** — boolean flag; triggers SOC2 upgrade and governance framework weight bump
- **Applicable characteristics** — multi-select from:
  - Personal data of GCC residents
  - Payment card data
  - CNI operator (central bank, utility, telecoms, government)

### 5.2 Framework Recommendation

The intake profile is sent to the Claude API with a detailed system prompt encoding GCC regulatory rules. The model returns a JSON array of recommended frameworks with:

- `frameworkId` — one of the 12 built-in IDs
- `weight` — `mandatory`, `contractual`, or `voluntary`
- `rationale` — 1–2 sentences
- `regulatoryBasis` — the specific law or regulation

Key recommendation rules:

- NCA-ECC is mandatory for Saudi entities
- SAMA-CSF is mandatory for Saudi banking
- CBK is mandatory for Kuwait banking only — not for Kuwait government, CNI operators, or any non-financial sector
- QATAR-NIAS is mandatory for all Qatar entities under Amiri Decree No. 1 of 2021
- PDPL-UAE weight is calibrated by geography — mandatory only if primary geography is UAE
- PDPL-QAT weight is calibrated by geography — mandatory only if primary geography is Qatar
- Both PDPLs are never set to mandatory simultaneously just because "Personal data of GCC residents" was selected
- PCI-DSS is mandatory if payment card data is selected regardless of geography
- IEC-62443 is contractual if OT/ICS systems are present
- SOC2 is contractual for listed entities and SaaS companies serving international clients

The user can adjust weights and toggle frameworks on the Framework Selector screen before running harmonisation.

### 5.3 Harmonisation

The selected frameworks are analysed against all 23 domains in parallel using a concurrency limiter (max 3 simultaneous Claude calls) to respect the Anthropic rate limit.

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

Displays a grid of 23 domains × N frameworks. Each cell shows Full (green) / Partial (amber) / Not-addressed (grey). Cells are clickable to expand the full domain harmonisation detail.

### 5.5 Posture Assessment

Before the roadmap can be generated, the user must rate the organisation's current implementation status for all 23 domains. The Continue button is disabled until all domains have been rated. The counter turns green when all 23 are rated.

Posture options per domain: `not-implemented`, `partial`, `full`, `not-assessed`.

### 5.6 Roadmap

The harmonisation results and posture map are sent to Claude to generate a prioritised roadmap. Prioritisation logic:

| Condition | Priority |
|---|---|
| Mandatory framework + not-implemented | Immediate |
| Mandatory framework + partial | Short-term |
| Contractual framework + not-implemented | Short-term |
| Contractual framework + partial | Medium-term |
| Voluntary framework (any posture) | Planned |

Each roadmap item includes: rank, priority, weighted score, mandatory framework gaps, recommended actions (3–5), estimated effort, and quick wins (1–2 things achievable in under 2 weeks).

### 5.7 Export

- **Excel**: coverage matrix with one row per domain and one column per framework, colour-coded cells
- **PDF**: Puppeteer-rendered landscape A4 report including executive summary, coverage matrix, domain details, and implementation roadmap

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
- parallel domain analysis (SSE stream, concurrency-limited to 3)
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
| `IntakeForm.jsx` | Organisation profile capture with CNI context box |
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
- Chosen for cost efficiency across up to 23 parallel domain calls per session

### 7.2 Concurrency Limiting

A custom `runWithConcurrency(items, 3, fn)` function limits simultaneous Claude calls to 3. This prevents 429 rate-limit errors on the Anthropic free/standard tier (10,000 TPM) when all 23 domains are analysed at once.

### 7.3 Token Budget

| Call | Max tokens |
|---|---|
| Intake / framework recommendation | 1200 |
| Domain harmonisation (per domain) | 2000 |
| Roadmap | 6000 |
| Custom framework extraction | 3000 |
| Change tracker | 4000 |

### 7.4 Response Parsing

All Claude calls use a hardened `parseClaudeJSON()` function that attempts four extraction strategies in order: `<r>` tags, `<result>` tags, fenced JSON code block, bare JSON from first `{`. This prevents failures when the model omits the opening tag on long responses.

## 8. Custom Framework Ingestion

1. User uploads a PDF on the Framework Selector screen
2. Backend extracts raw text via pdf-parse
3. Text (capped at 12,000 characters) is sent to Claude with the 23 domain list
4. Claude returns a `domainControlMap` mapping each domain to extracted control IDs and text
5. The custom framework is stored in-memory as `CUSTOM-<uuid>` and made available as a selectable framework
6. An extraction preview component on the Framework Selector screen shows which domains were covered before harmonisation runs
7. Custom frameworks are lost on server restart (intentional for demo)

Built-in framework names and aliases are blocked from re-upload via `isBuiltinFramework()` guard in `customFramework.js`.

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
| GET | `/api/health` | Liveness — returns domain count and framework list |
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

`server/taxonomy.json` is the authoritative control mapping file. It contains:

- 23 domain definitions with `domainId`, `domainLabel`, and `description`
- A `controls` map per domain with control ID arrays for each of the 12 built-in frameworks
- A `frameworks` map with metadata for each framework (name, version, jurisdiction, mandatory flag, sector, enforcer, legal basis, confidence level, notes)

The taxonomy was built from actual framework documents. It is versioned (`1.1` as of the QATAR-NIAS addition) and must not be regenerated from scratch — only amended with targeted migration scripts.

## 14. Launcher

`Launch Cross-Framework Harmoniser.cmd` is a single Windows `.cmd` file that:

1. Clears ports 3004 and 5179
2. Runs `npm install` at the workspace root if `node_modules` is missing
3. Bootstraps `.env` from `.env.example` if `.env` does not exist
4. Downloads Puppeteer Chromium if the cache directory does not exist
5. Opens the backend and frontend in separate PowerShell windows with a 3-second stagger

## 15. Key Project Files

- `server/index.js` — Express app, all route handlers, Claude intake call
- `server/harmonise.js` — parallel domain analysis, concurrency limiter, cache, roadmap call
- `server/prompt.js` — all Claude system prompts, prompt builder functions, taxonomy loader
- `server/customFramework.js` — PDF extraction, custom framework store, duplicate guard
- `server/changeTracker.js` — Change Tracker Claude calls and route handler
- `server/excel.js` — ExcelJS matrix export
- `server/pdf.js` — Puppeteer PDF generation
- `server/reportTemplate.js` — HTML template for PDF with `esc()` escaping
- `server/taxonomy.json` — 23 domains × 12 frameworks control mapping
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

The Anthropic API enforces a tokens-per-minute limit on standard tiers. Running all 23 domains simultaneously triggers 429 errors. The concurrency limiter (max 3) resolves this at the cost of slightly longer total analysis time (~60–90 seconds for 23 domains at max 3 concurrent).

### Roadmap Token Budget

The roadmap prompt covers 23 domains × N frameworks worth of coverage data. The prompt has been slimmed to a compact one-line-per-domain format and max_tokens set to 6000 to avoid truncation. If additional frameworks are added in future, this budget may need revisiting.

### Custom Framework Quality

Control extraction quality depends on the PDF structure. Scanned PDFs or heavily formatted tables may yield incomplete extraction. The extraction preview allows the user to verify coverage before running harmonisation.

### Puppeteer on Windows

Puppeteer requires Chromium. The launcher downloads it on first run. If the download fails or Chrome cannot be located, set `PUPPETEER_EXECUTABLE_PATH` in `.env` to the full path of an installed Chrome binary.

### In-Memory State

All harmonisation results, custom frameworks, and the roadmap are held in server memory. A server restart resets all state. This is intentional for the demo use case — a production deployment would require persistent storage.

## 18. Current Status

The project currently includes:

- working intake form with geography, sector, stock exchange listing, and CNI characteristic detection
- Claude-powered framework recommendation with GCC-tuned rules for all 12 built-in frameworks
- parallel domain harmonisation via SSE stream with concurrency limiter
- in-memory harmonisation cache with per-domain invalidation on framework selection change
- posture assessment gate requiring all 23 domains to be rated before roadmap generation
- weighted roadmap generation with mandatory/contractual/voluntary priority logic
- Excel export via ExcelJS
- PDF export via Puppeteer with HTML escaping and Buffer compatibility
- custom framework ingestion via PDF upload with extraction preview
- Change Tracker for document comparison and description-based change analysis
- built-in framework duplicate upload guard
- QATAR-NIAS V2.1 as the 12th built-in framework (all 23 domains mapped, NCSA enforcer, Amiri Decree No. 1 of 2021)
- hardened Claude JSON parser with 4-fallback extraction strategy
- Windows single-click launcher with automatic Chromium download

## 19. Future Enhancements

Potential next steps:

- persistent session storage (IndexedDB client-side or SQLite server-side)
- additional GCC frameworks: Bahrain PDO, Oman NCSI, Kuwait NCSC (when published)
- control-level gap export — CSV listing each missing control per framework
- evidence upload per domain — attach screenshots or policy documents to a posture rating
- AI-assisted posture assessment — upload existing policies and let Claude rate the posture
- multi-language support for Arabic executive summaries
- integration with SIEM or GRC platforms for automated posture updates
- regulatory change alert feed — monitor official sources and surface new Change Tracker inputs automatically
