# Cross-Framework Regulatory Harmoniser

GCC cybersecurity compliance tool that maps an organisation profile to applicable regulatory frameworks, runs parallel domain analysis across 24 control domains, and produces a unified coverage matrix and weighted implementation roadmap.

## What It Does

- Takes an organisation profile (name, geography, sector, applicable characteristics, stock exchange listing) and recommends applicable GCC regulatory frameworks with weight and rationale
- Runs parallel Claude analysis across 24 control domains against up to 14 built-in frameworks simultaneously
- Displays a unified coverage matrix showing Full / Partial / Not-addressed per domain per framework — click any row to expand implementation guidance, typical technologies, and per-framework key requirements
- Captures current implementation posture (not-implemented / partial / full / not-assessed) per domain before generating the roadmap
- Produces a prioritised implementation roadmap with weighted scores, recommended actions, and quick wins
- Exports the full analysis to Excel (two-sheet matrix with coverage and key requirements per framework) and PDF (Puppeteer-rendered landscape report)
- Includes a Change Tracker tab for assessing the impact of framework version updates on a current compliance posture
- Supports custom framework ingestion via PDF upload — extracts control text and includes it in the next harmonisation run

## Screenshots

| | |
|---|---|
| ![Intake form — organisation profile](screenshots/Screenshot%202026-05-25%20184737.png) | ![Framework selection — AI-recommended with rationale and weight](screenshots/Screenshot%202026-05-25%20185933.png) |
| ![Coverage matrix — 24 domains × 7 frameworks](screenshots/Screenshot%202026-05-25%20190306.png) | ![Posture self-assessment — rate all 24 domains](screenshots/Screenshot%202026-05-25%20190730.png) |
| ![Implementation roadmap — weighted priority with quick wins](screenshots/Screenshot%202026-05-25%20190957.png) | ![Export panel — Excel matrix and PDF report](screenshots/Screenshot%202026-05-25%20191022.png) |
| ![Change tracker — describe or upload a framework update](screenshots/Screenshot%202026-05-25%20194230.png) | ![Framework cards — PDPL-KSA and KUWAIT-NBCC with custom upload](screenshots/Screenshot%202026-05-25%20203820.png) |

## GCC Regulatory Intelligence

The control taxonomy (`server/taxonomy.json`) was built from actual GCC framework documents and encodes regulatory nuances that are easy to get wrong:

**Multi-PDPL applicability** — three GCC privacy laws are mapped at article level across the Privacy & Rights Management domain:
- PDPL-UAE (Federal Decree-Law No. 45/2021): 8 articles covering consent, portability, correction/erasure, restriction, and automated profiling
- Qatar PDPL (Law No. 13/2016): 6 articles covering individual rights, consent, data minimisation, and direct marketing
- PDPL-KSA (Royal Decree M/19/2021, amended M/148/2023): 19+ control requirements across articles 4–28 and implementation regulations — including 30-day response timelines for data access requests

**Extraterritorial scope** — PDPL-KSA is triggered by data-subject location, not org headquarters. A UAE or Kuwait company processing Saudi residents' personal data falls under PDPL-KSA. The tool recommends PDPL-KSA alongside the home-jurisdiction framework automatically.

**Kuwait privacy gap** — Kuwait has no standalone PDPL. The tool correctly routes Kuwait entities to applicable foreign PDPLs based on where their data subjects reside. KUWAIT-NBCC (a cybersecurity mandate, not a privacy law) carries no Privacy & Rights Management controls — intentional by design.

**Framework type fidelity** — cybersecurity frameworks (KUWAIT-NBCC, QATAR-NIAS) have no privacy-rights-management controls mapped; PDPL frameworks carry no OT/ICS controls. The taxonomy does not cross-contaminate framework scopes.

**Jurisdiction scoping rules** — 14 recommendation rules prevent cross-border hallucination: NCA-ECC and SAMA-CSF Saudi-only, CBK Kuwait banking only, PDPL-UAE exempt for UAE government/federal entities, PDPL-QAT omitted for non-Qatar orgs, PCI-DSS downgraded to contractual for central bank profiles.

**Control reference fidelity** — the taxonomy was built from the actual framework texts, not summaries:
- KUWAIT-NBCC control references (GOV-1–6, PR-1–6, DE-1, RS-1, RC-1/2, CLD-1–16) are correctly scoped to their domains; framework notes capture the ~October 2027 compliance deadline, annual self-assessment obligation (GOV-5), and NIST glossary fallback for undefined terms — all sourced from Decision 2/2026
- PDPL-KSA references distinguish `Art.X` (Law), `IR-Art.X` (Implementing Regulation), and `TR-Art.X` (Transfer Regulation) — the three-instrument structure of the Saudi PDPL regime
- QATAR-NIAS references follow the NIAP-NAT-DCLS classification structure used in V2.1

## Documentation

- Full product and architecture spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Supported Frameworks

| Framework | Jurisdiction | Sector |
|-----------|-------------|--------|
| NCA ECC 2024 | Saudi Arabia | All |
| SAMA CSF | Saudi Arabia | Banking |
| CBK Framework | Kuwait | Banking & Financial Services |
| ISO 27001:2022 | International | All |
| NIST CSF 2.0 | International | All |
| UAE NIAF | UAE | All |
| UAE PDPL (DL 45/2021) | UAE | Personal data |
| Qatar PDPL (Law 13/2016) | Qatar | Personal data |
| Saudi PDPL (RD M/19, M/148) | Saudi Arabia | Personal data (extraterritorial) |
| Kuwait NBCC (Decision 2/2026) | Kuwait | All (NCSC mandate) |
| PCI DSS 4.0.1 | International | Payments |
| IEC 62443 | International | OT/ICS |
| SOC 2 | International | SaaS / Technology |
| Qatar NIAS V2.1 | Qatar | All |

## Stack

- React 18 + Vite frontend
- Node.js + Express backend (ESM)
- Anthropic Claude API (`claude-haiku-4-5`) for framework recommendation, domain analysis, and roadmap generation
- ExcelJS for matrix export
- Puppeteer for server-side PDF generation

## Getting Started

1. Copy `.env.example` to `.env`
2. Add your `ANTHROPIC_API_KEY`
3. Start the app in one click:
   - Double-click `Launch Cross-Framework Harmoniser.cmd`
4. This opens separate backend and frontend windows
5. Open the app at:
   - `http://localhost:5179`

Alternative terminal flow (two terminals):

```bash
npm install
npm run dev --workspace server   # backend on :3004
npm run dev --workspace client   # frontend on :5179
```

Health check:

```
GET http://localhost:3004/api/health
→ { "status": "ok", "domains": 24, "frameworks": 14 }
```

## Workflow

| Step | Screen | Description |
|------|--------|-------------|
| 1 | Intake Form | Enter organisation profile — name (optional), geography, sector, applicable characteristics (auto-suggested by sector), stock exchange listing |
| 2 | Framework Selector | Review AI-recommended frameworks with weights; adjust manually; optionally upload a custom framework PDF |
| 3 | Harmonisation | Parallel Claude analysis across 24 domains — live progress bar with per-domain status |
| 4 | Coverage Matrix | Colour-coded matrix — Full (green) / Partial (amber) / Not-addressed (grey) per domain and framework. Click any row to expand harmonised summary, implementation guidance, typical technologies, and per-framework key requirements |
| 5 | Posture Assessment | Rate current implementation status for all 24 domains before proceeding — options: fully implemented, partially implemented, not implemented, not assessed |
| 6 | Roadmap | Weighted implementation roadmap with priority, gap analysis, recommended actions, and quick wins |
| 7 | Export | Download Excel matrix or full PDF report |

Steps 2, 4, 5, and 6 each have a back button to return to the previous screen (the harmonising progress step has no back button). A **New analysis** button appears in the topbar from step 2 onward — hidden during harmonising — and resets all state including the intake profile, returning to step 1, while also clearing the server-side cache.

The Change Tracker tab is independent of the Harmoniser workflow and can be used at any time.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/taxonomy` | Full taxonomy JSON |
| POST | `/api/intake` | Framework recommendation from profile |
| GET | `/api/harmonise/stream` | SSE — parallel domain analysis (up to 24 Claude calls) |
| POST | `/api/roadmap` | Weighted roadmap from harmonisation and posture |
| POST | `/api/export/excel` | Download Excel coverage matrix |
| POST | `/api/export/pdf` | Download PDF report |
| POST | `/api/change-tracker/documents` | Compare two framework version PDFs |
| POST | `/api/change-tracker/description` | Analyse a described regulatory change |
| POST | `/api/cache/clear` | Reset harmonisation cache |
| POST | `/api/frameworks/custom` | Upload and ingest custom framework PDF |
| GET | `/api/frameworks/custom` | List uploaded custom frameworks |
| DELETE | `/api/frameworks/custom/:id` | Remove a custom framework |

## Custom Framework Upload

Upload any regulatory or internal policy PDF. The backend extracts control text, maps it to the 24 taxonomy domains, and makes it available as a selectable framework on the Framework Selector screen. An extraction preview shows which domains were covered before harmonisation runs.

Built-in frameworks are blocked from re-upload — the tool detects common names and aliases and returns a clear error.

## Change Tracker

Paste or upload two versions of a regulatory document and the Change Tracker identifies every added, modified, removed, or restructured control. Each change is mapped to a taxonomy domain and assigned an implementation impact type (policy change, config change, new technology, process change) and urgency level. When stale domains are detected or new controls are added, the UI prompts the user to re-run harmonisation or ingest the updated document.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | From [console.anthropic.com](https://console.anthropic.com) |
| `PORT` | No | Backend port, defaults to `3004` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if Puppeteer cannot auto-detect it |

## PDF Export Notes

The PDF is generated server-side via Puppeteer. Chromium is downloaded automatically on first launch via the launcher script. If Chrome cannot be found, set `PUPPETEER_EXECUTABLE_PATH` in `.env` to the full path of your Chrome installation (e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe`).
