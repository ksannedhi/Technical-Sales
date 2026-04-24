# Security Tools Mapping Navigator — Project Specification

Version: 0.4.0
Date: 2026-04-24

---

## 1. Executive Summary

Security Tools Mapping Navigator is a GUI-based presales tool that analyses an organisation's
security tool inventory against NIST CSF 2.0 and CIS Controls v8.1, producing:

- Domain Coverage at a Glance (per-domain tool mapping and control status)
- Control gap analysis with severity ratings and vendor recommendations
- Redundancy and consolidation opportunities with estimated savings
- Dynamic phased migration roadmap derived from the actual findings
- Auto-generated Executive Summary narrative (copyable prose)
- Print / Save as PDF output scoped to result sections

Analysis is deterministic and rule-based. No external AI API or internet connection required.

---

## 2. Problem Statement

Security programmes accumulate overlapping tools and uneven control coverage over time.
Presales architects need a structured, repeatable way to:

- Validate which controls a customer's current tool stack actually covers
- Identify missing controls and under-covered domains
- Detect redundant tools and quantify consolidation savings
- Build a phased roadmap that improves both posture and cost efficiency
- Produce leave-behind artefacts (Executive Summary, PDF) from a single upload

---

## 3. Scope

### In scope
- Tool/control mapping ingestion via CSV (template provided as Excel workbook)
- Framework-aware analysis: `NIST`, `CIS`, `BOTH`
- Deterministic gap and redundancy analysis with capability-bucket filtering
- Alias-assisted normalisation for vendor and product name variance
- Domain Coverage at a Glance matrix
- Control gap findings with severity, status, and per-control vendor recommendations
- Redundancy findings with capability-filtered grouping, deduplication, and savings estimate
- Dynamic migration roadmap (3 phases derived from actual findings)
- Auto-generated Executive Summary narrative with copy-to-clipboard
- Print / Save as PDF (browser print scoped to result sections)
- Project result persistence in SQLite with local-timezone timestamps
- GUI-based project save, load, and delete with active-project indicator
- JSON and CSV export (JSON includes Executive Summary narrative)

### Out of scope
- Live connector ingestion from customer APIs
- Full CMDB or asset topology modelling
- Automated infrastructure change execution
- Multi-tenant authentication, SSO, or enterprise RBAC
- ISO 27001 / SOC 2 / PCI DSS framework support (planned)

---

## 4. Users and Use Cases

### Primary users
- Security Presales Architect
- Cybersecurity Consultant
- Solution Engineering Team

### Core use cases
1. Upload mapping CSV → receive full framework-aligned analysis
2. Download Excel template before preparing input data
3. Compare control coverage across tools and domains
4. Identify redundant tool spend and estimate consolidation savings
5. Present specific vendor recommendations for each gap or partial control
6. Copy or print the Executive Summary for use in proposals
7. Save and reload project snapshots across customer engagements
8. Export findings as JSON or CSV for report/proposal workflows

---

## 5. Functional Requirements

1. Accept CSV upload with required schema; reject with descriptive error on missing columns
2. Provide a collapsible **How to Use** panel at the top of the page covering the full 6-step
   workflow: template download, inventory fill, CSV export, framework selection, analysis run,
   and result review; panel is excluded from the print/PDF view via `.no-print` class
3. Provide a `Download Sample Template` action in the GUI (Excel workbook with Instructions,
   Discovery Questions, Tool Objectives Library, and Tool Inventory sheets)
4. Analyse against selected framework mode (`NIST`, `CIS`, or `BOTH`)
5. Produce control gap findings with severity, status, rationale, and vendor recommendations
6. Produce redundancy findings with capability-filtered grouping, deduplication, classification,
   savings estimate, and contributing framework label
7. Render Domain Coverage at a Glance: per-domain tool names, coverage breakdown, status badge;
   show "No controls in this mode" for domains not represented in the selected framework
8. Generate auto-prose Executive Summary with copy-to-clipboard
9. Generate dynamic phased roadmap from the actual gaps and redundancies found
10. Show summary banner with: tools mapped, fully covered, partial, gaps, redundancies, est. savings
11. Provide Print / Save as PDF (browser print limited to result sections)
12. Export last analysis to JSON (includes narrative) and CSV
13. Persist results to SQLite when `project_name` provided; display timestamps in local timezone;
    reset the auto-increment ID counter when all projects are deleted so the next project starts at 1
14. List, load, and delete historical projects; highlight currently loaded project in the table

---

## 6. Non-Functional Requirements

- Explainable, deterministic analysis — no black-box scoring
- Offline operation — no external API calls at runtime
- Fast local processing for datasets up to ~200 tool rows
- Windows-friendly one-click startup via `start.cmd`
- Isolated Python dependencies (`backend/.deps`) — no system-level installs required

---

## 7. System Architecture

```
frontend/src/App.jsx          React SPA — all UI, local state, fetch calls to backend
        ↕  HTTP (direct to http://127.0.0.1:8010)
backend/app/main.py           FastAPI — CORS, route registration, last-analysis cache
backend/app/services/
  csv_parser.py               Schema validation, row parsing
  analyzer.py                 Mapping engine, alias enrichment, gap/redundancy/roadmap logic
  storage.py                  SQLite read/write
backend/data/navigator.db     SQLite — project_results table
```

### Frontend port: 5176
### Backend port: 8010

No Vite proxy — the frontend calls `http://127.0.0.1:8010` directly; FastAPI CORS allows `*`.

---

## 8. Technology Stack

| Component | Technology |
|---|---|
| Backend | Python 3.13+, FastAPI 0.116+, Uvicorn 0.35+ |
| Frontend | React 18, Vite 5, plain CSS (no UI framework) |
| Persistence | SQLite via Python built-in `sqlite3` |
| Deps isolation | `pip install --target backend/.deps` (no venv) |

---

## 9. Input CSV Schema

### Required columns
| Column | Notes |
|---|---|
| `tool_name` | Tool name displayed throughout the analysis |
| `control_domain` | Domain bucket: Identity / Endpoint / Data / Cloud / Network / AppSec / SOC |
| `control_objective` | Free-text objective — primary matching signal |

### Optional columns (improve analysis quality)
| Column | Notes |
|---|---|
| `record_id` | Unique row identifier; auto-generated as `MAP-N` if blank |
| `vendor` | Vendor name; feeds alias-token enrichment |
| `product` | Product name; feeds alias-token enrichment |
| `current_control_id` | Direct control reference: `PR.AA`, `CIS-5`, or `PR.AA;CIS-5` |
| `framework_alignment` | `NIST-CSF-2.0`, `CIS-v8.1`, or `NIST-CSF-2.0;CIS-v8.1`; blank = inherits selected mode |
| `annual_cost_usd` | Enables savings estimates in Redundancy Opportunities |
| `notes` | Additional context fed into the matching engine |

---

## 10. Analysis Logic

### Alias-token enrichment
Before keyword matching, each row's concatenated text is scanned against `ALIAS_TOKEN_MAP`
(18 vendor/product aliases per capability bucket). Matched tokens (`capability_identity`,
`capability_endpoint`, `capability_cloud`, etc.) are appended to the normalised text, so
"CrowdStrike Falcon" and "Falcon EDR" both resolve to `capability_endpoint` and match
endpoint controls identically.

### Coverage classification (per control)
| Match count | Status | Severity |
|---|---|---|
| 0 | `missing` | high |
| 1 | `partial` | medium |
| 2+ | `covered` | low |

### Redundancy analysis
1. Group matched rows by `(domain, control_name)`
2. Filter each group to tools whose capability bucket aligns with the domain's expected bucket
   (`_DOMAIN_EXPECTED_CAPS`) — prevents WAF tools (capability_appsec) from being grouped as
   redundant with DLP tools (capability_data) even though both match NIST-PR.DS
3. Require 2+ unique tool names after filtering to qualify as a redundancy
4. Deduplicate by `(frozenset(tools), domain)` — prevents the same tool pair appearing twice
   in `BOTH` mode when it satisfies one NIST and one CIS control in the same domain
5. Classify: `likely_redundant` (3+ tools), `healthy_overlap` (2 tools)
6. Savings = `(n_tools − 1) × avg_annual_cost × 0.20` (based on CSV cost data)
7. `framework` field indicates which framework(s) identified the overlap

### Tool gap recommendations
- Each framework control has a curated `_CONTROL_RECOMMENDATIONS` entry with 2–4 specific
  vendor names and function labels (e.g. "CrowdStrike Falcon, SentinelOne (EDR) · Wiz, Orca (CSPM)")
- Populated on `GapFinding` for `missing` and `partial` controls only
- Shown in the Control Gaps table: prefix "Consider:" for missing, "Strengthen:" for partial

### Dynamic roadmap generation (`_build_roadmap`)
Phase content is derived from the actual `gaps` and `redundancies` lists:

- **Phase 1 (0–3 months)**: If missing controls exist → name the missing domains.
  If no missing controls → prioritise second-layer coverage for core domains
  (Identity, SOC, Endpoint, Network).
- **Phase 2 (3–6 months)**: If missing controls were addressed in Phase 1 → clean up partial
  controls. If no missing controls → extend coverage to specialty domains
  (AppSec, Cloud, Data) and deepen tool integrations.
- **Phase 3 (6–12 months)**: If `likely_redundant` groups exist → consolidate with real savings
  figure. If only `healthy_overlap` → review for selective consolidation. Otherwise → governance
  and continuous monitoring.

---

## 11. API Specification

### `GET /health`
Returns `{"status": "ok"}`.

### `POST /analyze`
Multipart form:
- `framework` — `NIST` | `CIS` | `BOTH`
- `mapping_file` — CSV file
- `project_name` (optional) — triggers SQLite persistence

Returns `AnalysisResponse`.

### `GET /projects`
Returns list of saved project summaries.

### `GET /projects/{project_id}`
Returns full saved analysis payload including result JSON.

### `DELETE /projects/{project_id}`
Deletes a saved project.

### `GET /export?format=json|csv`
Exports the last in-memory analysis (not persisted).

---

## 12. Data Models (key fields)

### GapFinding
```
control_id, framework, control_name, domain,
status, severity, coverage_score, rationale,
recommended_tools   ← populated for missing/partial only
```

### RedundancyFinding
```
framework,          ← NIST | CIS | BOTH
domain, objective, tools, vendors, products,
overlap_score, classification, estimated_savings_usd
```

### AnalysisResponse
```
project_id, framework_selected, rows_processed,
controls_total, controls_covered, controls_partial, controls_missing,
warnings, gaps, redundancies, roadmap,
current_state_diagram, target_state_diagram
```

---

## 13. Persistence

- **Path**: `backend/data/navigator.db` (auto-created on first run)
- **Table**: `project_results`
  - `id` INTEGER PK AUTOINCREMENT
  - `project_name` TEXT
  - `framework` TEXT
  - `rows_processed` INTEGER
  - `created_at` TEXT (SQLite `CURRENT_TIMESTAMP`, UTC; converted to local timezone in UI)
  - `result_json` TEXT

---

## 14. Project Structure

```
backend/
  app/
    main.py               FastAPI app, CORS, framework-alignment defaulting
    models.py             Pydantic models (ToolControlRow, GapFinding, RedundancyFinding, …)
    services/
      analyzer.py         ALIAS_TOKEN_MAP, CONTROL_LIBRARY, _CONTROL_RECOMMENDATIONS,
                          _DOMAIN_EXPECTED_CAPS, _build_roadmap, analyze_mappings
      csv_parser.py       Schema validation, CSV → ToolControlRow list
      storage.py          SQLite CRUD
  data/
    navigator.db          SQLite (gitignored)
  requirements.txt

frontend/
  public/
    Security_Tools_Mapping_Template.xlsx   Excel template (Instructions + 3 helper sheets + Tool Inventory)
  src/
    App.jsx               Full SPA: upload, analysis display, all result sections
    styles/globals.css    Design tokens, layout, print CSS (@media print)

start.cmd                 One-click launcher
CLAUDE.md                 Developer guidance for Claude Code
README.md                 This file
Security_Tools_Mapping_Navigator_MVP_Spec.md   Full specification (this document)
```

---

## 15. Startup

```cmd
cd security-tools-mapping-navigator
start.cmd
```

`start.cmd` installs backend deps to `backend/.deps`, sets `PYTHONPATH`, and starts both
services in separate terminal windows. No venv, no admin rights, no system-level installs.

---

## 16. Known Constraints

- Rule-based matching depends on alias dictionary coverage; uncommon product names may not
  resolve unless `vendor`/`product` columns are populated
- Local AV or firewall policies may block Node.js/esbuild subprocess spawning on first run
- Savings estimates require `annual_cost_usd` to be populated in the CSV; without cost data
  the savings column shows `—`

---

## 17. Suggested Next Enhancements

1. **Additional frameworks** — ISO 27001 Annex A, PCI DSS v4.0, NCA ECC (purely additive
   `ControlDef` entries, no architectural change)
2. **What-if scenario** — select a tool from a dropdown and instantly see which controls
   lose coverage; requires `matched_tools` list on `GapFinding`
3. **Coverage trend** — compare two saved projects side-by-side to show posture improvement
   over time; `/api/projects/compare?ids=A,B` endpoint
4. **Multi-file comparison** — upload current-state and proposed-state CSVs; show delta
   in coverage, gaps closed, savings delta
5. **Mapping dictionary editor** — GUI admin view for tuning alias tokens and control keywords
   without editing Python source

---

## 18. Acceptance Criteria

- How to Use panel is collapsed by default; expands and collapses on click; hidden from print/PDF
- Upload valid CSV → analysis returns without errors across all three framework modes
- Framework selection changes the control set and roadmap content
- Domain Coverage at a Glance shows tool names per domain; shows "No controls in this mode"
  for domains absent from the selected framework
- Control Gaps table shows vendor recommendations for missing and partial controls
- Redundancy Opportunities shows no false cross-function groupings (capability filtering active)
- BOTH mode shows no duplicate redundancy rows for the same tool pair
- Roadmap phases reflect actual missing/partial domains, not hardcoded text
- Executive Summary narrative updates correctly on each analysis
- Print / Save as PDF hides form and project sections; badge colours print correctly
- Project save and reload work via SQLite; timestamps display in local timezone
- Loaded project row is highlighted in the Saved Projects table
- JSON export includes `narrative` field; CSV export includes gap findings
- Deleting all saved projects resets the ID counter; the next saved project gets ID 1
