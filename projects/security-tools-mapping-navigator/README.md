# Security Tools Mapping Navigator

GUI-first presales tool that ingests a security tools-controls mapping CSV and produces a
framework-aligned gap analysis, redundancy audit, domain coverage summary, tool recommendations,
and a dynamic phased roadmap — all without an AI API or internet connection.

---

## What it produces

| Output | Description |
|---|---|
| **Executive Summary** | Auto-generated prose narrative with a one-click Copy button |
| **Domain Coverage at a Glance** | Per-domain table: tools active, controls covered/partial/missing, status badge |
| **Control Gaps** | Every framework control with severity, status, and specific vendor recommendations |
| **Redundancy Opportunities** | Tool pairs mapped to the same objective, classified and costed |
| **Migration Roadmap** | 3-phase plan derived from the actual gaps and redundancies found |
| **Print / Save as PDF** | Browser print view scoped to result sections only |
| **JSON / CSV export** | Full result including Executive Summary narrative |

---

## Framework modes

| Mode | Controls evaluated |
|---|---|
| `NIST` | NIST CSF 2.0 — 6 controls across Identity, Endpoint, Data, Network, SOC |
| `CIS` | CIS Controls v8.1 — 12 controls across Identity, Endpoint, Data, Cloud, Network, AppSec, SOC |
| `BOTH` | All 18 controls, deduplicated redundancy output |

---

## Quick start

```cmd
cd security-tools-mapping-navigator
start.cmd
```

`start.cmd` installs backend Python deps to `backend/.deps` (no venv needed), then opens
backend and frontend in separate terminal windows.

- Frontend: http://localhost:5176
- Backend API: http://127.0.0.1:8010

---

## Manual start

**Backend:**
```cmd
set PYTHONPATH=backend\.deps;backend
cd backend
python -m uvicorn app.main:app --reload --port 8010
```

**Frontend:**
```cmd
cd frontend
npm install
npm run dev
```

---

## Input CSV

Download the Excel template from the **Download Sample Template** button in the app.
Fill in the *Tool Inventory* sheet and export as CSV (File → Save As → CSV).

### Required columns

| Column | Notes |
|---|---|
| `record_id` | Unique identifier per row |
| `tool_name` | Name shown throughout the analysis |
| `control_domain` | e.g. `Identity`, `Endpoint`, `Data`, `Cloud`, `Network`, `AppSec`, `SOC` |
| `control_objective` | Free-text description of what the tool does — drives the matching engine |

### Recommended optional columns

| Column | Notes |
|---|---|
| `vendor` | Improves alias-based matching |
| `product` | Improves alias-based matching |
| `current_control_id` | Direct control ID e.g. `PR.AA`, `CIS-5`, or `PR.AA;CIS-5` for dual mapping |
| `framework_alignment` | `NIST-CSF-2.0`, `CIS-v8.1`, or `NIST-CSF-2.0;CIS-v8.1`; defaults to the selected mode if blank |
| `annual_cost_usd` | Enables estimated consolidation savings in the Redundancy table |
| `notes` | Additional context used in matching |

---

## Analysis logic

### Matching
1. All text fields per row are concatenated and normalised to lowercase
2. Vendor/product names are resolved to capability tokens (e.g. `"orca"` → `capability_cloud`)
   before keyword matching, so product name variants resolve consistently
3. Each framework control is scored against the enriched text

### Coverage classification
- `covered` — 2+ matching rows
- `partial` — 1 matching row
- `missing` — no match

### Redundancy
- Tools mapped to the same control objective are grouped
- Capability-bucket filtering prevents cross-function tools from being flagged as redundant
  (e.g. a WAF and a DLP tool both matching NIST-PR.DS are *not* considered redundant)
- In `BOTH` mode, duplicate tool-set/domain pairs are deduplicated
- `likely_redundant` when 3+ tools overlap; `healthy_overlap` for 2-tool pairs
- Savings estimate: `(overlapping tools − 1) × avg annual tool cost × 20%`

### Roadmap generation
Phases are derived from the actual findings — not hardcoded:
- **Phase 1**: closes missing controls (or targets core partial domains: Identity, SOC, Endpoint, Network)
- **Phase 2**: strengthens remaining partial domains or deepens tool integration
- **Phase 3**: consolidates likely-redundant tools (with real savings figure) or reviews healthy overlaps

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/analyze` | Upload CSV and run analysis (`framework`, `mapping_file`, optional `project_name`) |
| GET | `/projects` | List saved projects |
| GET | `/projects/{id}` | Load a saved project |
| DELETE | `/projects/{id}` | Delete a saved project |
| GET | `/export?format=json\|csv` | Export last in-memory analysis |

---

## Project structure

```
backend/
  app/
    main.py               FastAPI app, CORS, route registration
    models.py             Pydantic request/response models
    services/
      analyzer.py         Mapping engine, alias enrichment, gap and redundancy analysis
      csv_parser.py       CSV validation and parsing
      storage.py          SQLite persistence
  data/
    navigator.db          SQLite database (auto-created on first run)
  requirements.txt

frontend/
  public/
    Security_Tools_Mapping_Template.xlsx   Downloadable Excel template
  src/
    App.jsx               Single-page React app
    styles/globals.css    Design tokens, component styles, print CSS

start.cmd                 One-click launcher (installs deps, starts both services)
CLAUDE.md                 Developer guidance for Claude Code
```

---

## Saved projects

Results are persisted to SQLite when a **Project Name** is provided at analysis time.
Saved projects can be loaded, compared, and deleted directly from the GUI.
Timestamps are displayed in the browser's local timezone.

---

## Notes

- No external AI API required — analysis is fully deterministic and offline
- `framework_alignment` column can be left blank; the selected mode is applied as the default
- The **Domain Coverage** table shows *"No controls in this mode"* for domains in the customer's
  CSV that have no dedicated control in the selected framework (e.g. AppSec tools in NIST-only mode)
- Matching confidence improves significantly when `vendor`, `product`, and `current_control_id`
  columns are populated

---

## Full specification

[Security_Tools_Mapping_Navigator_MVP_Spec.md](Security_Tools_Mapping_Navigator_MVP_Spec.md)
