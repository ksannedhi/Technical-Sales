# Security Tools Mapping Navigator - Project Specification

Version: 0.3.0
Date: 2026-03-25

## 1. Executive Summary
Security Tools Mapping Navigator is a GUI-based proprietary application that analyzes an organization's security tool-to-control mapping data and generates:

- Current control map
- Target control map
- Control gap analysis
- Redundancy and consolidation opportunities
- Migration roadmap guidance

The solution is framework-aware and supports NIST CSF 2.0, CIS Controls v8, or dual mapping.

## 2. Problem Statement
Security programs often accumulate overlapping tools and uneven control coverage over time. Teams need a structured way to:

- Validate what controls are currently covered
- Identify missing controls and weak coverage
- Detect redundant tools and consolidation opportunities
- Build a phased roadmap that improves both control posture and architecture outcomes

## 3. Scope Definition
### In Scope
- Tool/control mapping ingestion via CSV
- Framework-aware analysis (`NIST`, `CIS`, `BOTH`)
- Deterministic gap and redundancy analysis
- Alias-assisted normalization for vendor and product naming variance
- Generated current/target control maps
- Migration roadmap recommendations
- Project result persistence in SQLite
- GUI-based review and exports

### Out of Scope
- Live connector ingestion from customer APIs
- Full CMDB/asset topology modeling
- Automated infra change execution
- Multi-tenant auth/SSO and enterprise RBAC

## 4. Users and Use Cases
### Primary Users
- Security Presales Architect
- Cybersecurity Consultant
- Solution Engineering Team

### Core Use Cases
- Upload mapping dataset and run framework-aligned analysis
- Compare control coverage across tools
- Identify overlap and estimate consolidation savings
- Save and reload project analysis snapshots
- Delete saved project snapshots when they are no longer needed
- Export findings for proposal/report workflows

## 5. Functional Requirements
1. Accept mapping CSV upload with required schema
2. Analyze against selected framework mode
3. Produce control gap findings with severity and rationale
4. Produce redundancy findings with overlap score and estimated savings
5. Generate current-state and target-state control maps
6. Generate phased migration roadmap
7. Export last analysis to JSON/CSV
8. Save project results to SQLite when `project_name` provided
9. List and load historical projects from SQLite
10. Delete saved projects from SQLite

## 6. Non-Functional Requirements
- Explainable analysis (rule-based, deterministic)
- Fast local processing for medium datasets (1k+ rows)
- Offline-friendly operation (local file + local DB)
- Low operational footprint
- Windows-friendly one-click startup

## 7. System Architecture
### Frontend
- React 18 + Vite
- Main view includes upload, framework selector, project save/load, KPIs, tables, and map sections

### Backend
- FastAPI
- CSV parser service
- Analyzer service (framework mapping, alias-assisted normalization, and scoring)
- Storage service (SQLite)

### Persistence
- SQLite database at `backend/data/navigator.db`
- Table: `project_results`

### Runtime
- Frontend: `http://localhost:5173`
- Backend API: `http://127.0.0.1:8010`

## 8. Technology Stack
- Python 3.13+
- FastAPI 0.116.1
- Uvicorn 0.35.0
- React 18.3.1
- Vite 5.4.2
- Node.js 22+
- SQLite (built-in Python `sqlite3`)

## 9. Data Contract - Input CSV
Required columns:
- `record_id`
- `tool_name`
- `control_domain`
- `control_objective`

Optional but recommended:
- `framework_alignment`

Full schema:
- `record_id, tool_name, vendor, product, version, control_domain, control_objective, current_control_id, current_control_name, framework_alignment, deployment_scope, environment, coverage_level, effectiveness_score, operational_status, annual_cost_usd, utilization_percent, license_count, eol_date, notes`

Reference template:
- `data/tools_controls_mapping_template.csv`

## 10. Analysis Logic
### Coverage Classification
For each framework control objective:
- `covered` if 2+ matching tool/control mappings
- `partial` if 1 matching mapping
- `missing` if no mapping

### Matching
- Normalize free-text row content to lowercase
- Enrich normalized text with vendor and product alias tokens
- Score controls against the enriched text instead of raw keywords alone

### Gap Severity
- `high` for missing
- `medium` for partial
- `low` for covered

### Redundancy
For each objective/domain:
- detect multiple tools mapping to same objective
- compute overlap score
- classify as `healthy_overlap` or `likely_redundant`
- estimate savings based on average cost heuristic

### Roadmap
Generated in 3 phases:
- Phase 1 (0-3 months): close high-severity gaps
- Phase 2 (3-6 months): consolidate overlapping controls/tools
- Phase 3 (6-12 months): optimize effectiveness and align target architecture

### Current-State Diagram
- Group tools by `control_domain`
- Render domain nodes and mapped tool nodes
- Avoid implying tool-to-tool dependencies based only on CSV row order

## 11. API Specification
### `GET /health`
Returns service health status.

### `POST /analyze`
Multipart form fields:
- `framework` (`NIST` | `CIS` | `BOTH`)
- `mapping_file` (CSV)
- `project_name` (optional)

Returns `AnalysisResponse` (includes `project_id` if persisted).

### `GET /projects`
Returns saved project summaries.

### `GET /projects/{project_id}`
Returns full saved analysis payload.

### `DELETE /projects/{project_id}`
Deletes a saved project record from SQLite.

## 12. Persistence Model
### Database
- Path: `backend/data/navigator.db`

### Table: `project_results`
- `id` INTEGER PK AUTOINCREMENT
- `project_name` TEXT
- `framework` TEXT
- `rows_processed` INTEGER
- `created_at` TEXT (default current timestamp)
- `result_json` TEXT

## 13. Project Structure
- `backend/app/main.py` - API entrypoint
- `backend/app/models.py` - Pydantic models
- `backend/app/services/csv_parser.py` - CSV validation/parser
- `backend/app/services/analyzer.py` - analysis engine
- `backend/app/services/storage.py` - SQLite persistence
- `frontend/src/App.jsx` - GUI flow
- `frontend/public/tools_controls_mapping_template.csv` - downloadable sample template
- `data/tools_controls_mapping_template.csv` - input template
- `data/sample_tools_controls_1200.csv` - large synthetic dataset
- `start.cmd` - recommended one-click launcher
- `start.ps1` - optional PowerShell launcher

## 14. Startup and Operations
### Recommended one-click start
```cmd
cd security-architecture-auto-mapper
start.cmd
```

### PowerShell alternative
```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

## 15. Known Constraints and Risks
- Rule-based matching still depends on the quality of the alias dictionary and control taxonomy
- Local environment permissions or AV policies may affect Node/esbuild process spawning

## 16. Suggested Next Enhancements
1. Mapping dictionary editor in UI (admin tuning)
2. XLSX input ingestion and field mapper
3. PDF/PPTX report generation
4. Role-based access and audit log
5. Multi-project comparison dashboards
6. Architecture impact scoring tied to roadmap actions

## 17. Acceptance Criteria
- Upload valid CSV and receive analysis without errors
- Framework selection changes returned control set
- Gaps, redundancies, roadmap, and diagrams all populate
- Project save and reload work via SQLite endpoints
- Exports return JSON/CSV successfully
