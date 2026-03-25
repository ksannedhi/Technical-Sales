# Security Tools Mapping Navigator (MVP)

GUI-first proprietary MVP that ingests a security tools-controls mapping CSV and generates:

- Current tool-control map
- Target tool-control map
- Control gap analysis
- Redundancy and consolidation opportunities
- Migration roadmap guidance

## Framework Modes

- `NIST` (NIST CSF 2.0 aligned controls)
- `CIS` (CIS Controls v8 aligned controls)
- `BOTH` (dual mapping)

## Scope (Current MVP)

- Focuses on security tools and control mappings only
- Does not require full asset inventory
- Uses deterministic rule-based mapping for explainability
- Enriches matching with vendor and product aliases before scoring controls
- Groups current-state maps by control domain instead of CSV row order

## Persistence (SQLite)

- Database file: `backend/data/navigator.db`
- Saved when `project_name` is sent during `/analyze`
- Supports list/load/delete of historical results

## Project Structure

- `backend/` FastAPI service with analysis engine + SQLite persistence
- `frontend/` React + Vite GUI
- `data/tools_controls_mapping_template.csv` CSV template
- `data/sample_tools_controls_1200.csv` large synthetic test dataset
- `start.cmd` one-click launcher (recommended)
- `start.ps1` PowerShell launcher (optional)

## Input CSV Fields

`record_id, tool_name, vendor, product, version, control_domain, control_objective, current_control_id, current_control_name, framework_alignment, deployment_scope, environment, coverage_level, effectiveness_score, operational_status, annual_cost_usd, utilization_percent, license_count, eol_date, notes`

## One-Click Start (Recommended)

```cmd
cd security-architecture-auto-mapper
start.cmd
```

This avoids PowerShell execution-policy blocking and opens backend/frontend in new terminal windows.

## If You Prefer PowerShell Launcher

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

## Manual Run Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## Manual Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## API Endpoints

- `GET /health`
- `POST /analyze` (multipart form: `framework`, `mapping_file`, optional `project_name`)
- `GET /projects`
- `GET /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `GET /export?format=json|csv`

## Notes

- MVP accepts CSV only.
- `framework_alignment` can be blank; the selected framework mode will be used as the default.
- Matching is enriched with vendor and product aliases to reduce brittle free-text misses.
- The generated current-state map groups tools by control domain for a more defensible view.
- Last run is held in-memory for API export convenience, while the UI downloads outputs directly from the loaded result.
- Saved projects/results are persisted in SQLite.
- Saved projects can be removed directly from the GUI.
- Local dependency directories such as `backend/.deps/` and `frontend/node_modules/` are runtime artifacts and should stay out of source control.
