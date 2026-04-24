# Security Tools Mapping Navigator

GUI-first presales tool that ingests a security tools-controls mapping CSV and produces a
framework-aligned gap analysis, redundancy audit, domain coverage summary, tool recommendations,
and a dynamic phased roadmap — all without an AI API or internet connection.

## What it produces

| Output | Description |
|---|---|
| **Executive Summary** | Auto-generated prose narrative with a one-click Copy button |
| **Domain Coverage at a Glance** | Per-domain table: tools mapped, controls covered/partial/missing, status badge |
| **Control Gaps** | Every framework control with severity, status, and specific vendor recommendations |
| **Redundancy Opportunities** | Tool pairs mapped to the same objective, classified and costed |
| **Migration Roadmap** | 3-phase plan derived from the actual gaps and redundancies found |
| **Print / Save as PDF** | Browser print view scoped to result sections only |
| **JSON / CSV export** | Full result including Executive Summary narrative |

## Documentation

- Full product spec: [Security_Tools_Mapping_Navigator_MVP_Spec.md](Security_Tools_Mapping_Navigator_MVP_Spec.md)

## Quick start

```cmd
cd security-tools-mapping-navigator
start.cmd
```

`start.cmd` installs backend Python deps to `backend/.deps` (no venv needed), then opens
backend and frontend in separate terminal windows.

- Frontend: http://localhost:5176
- Backend API: http://127.0.0.1:8010

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

## Input CSV

Download the Excel template from the **Download Sample Template** button in the app.
Fill in the *Tool Inventory* sheet and export as CSV (File → Save As → CSV).
An in-app **How to Use** guide walks through each step end-to-end.

### Required columns

| Column | Notes |
|---|---|
| `tool_name` | Name shown throughout the analysis |
| `control_domain` | `Identity`, `Endpoint`, `Data`, `Cloud`, `Network`, `AppSec`, or `SOC` |
| `control_objective` | Free-text description of what the tool does — primary matching signal |

### Recommended optional columns

| Column | Notes |
|---|---|
| `record_id` | Unique row identifier; auto-generated as `MAP-N` if blank |
| `vendor` | Improves alias-based matching |
| `product` | Improves alias-based matching |
| `current_control_id` | Direct control ID e.g. `PR.AA`, `CIS-5`, or `PR.AA;CIS-5` for dual mapping |
| `framework_alignment` | `NIST-CSF-2.0`, `CIS-v8.1`, or `NIST-CSF-2.0;CIS-v8.1`; defaults to selected mode if blank |
| `annual_cost_usd` | Enables estimated consolidation savings in the Redundancy table |
| `notes` | Additional context used in matching |

## Framework modes

| Mode | Controls evaluated |
|---|---|
| `NIST` | NIST CSF 2.0 — 6 controls across Identity, Endpoint, Data, Network, SOC |
| `CIS` | CIS Controls v8.1 — 12 controls across Identity, Endpoint, Data, Cloud, Network, AppSec, SOC |
| `BOTH` | All 18 controls, deduplicated redundancy output |

## Analysis logic

Matching runs in two passes: vendor/product names are resolved to capability tokens via `ALIAS_TOKEN_MAP`
(e.g. `"crowdstrike"` → `capability_endpoint`) before keyword matching, so product name variants
resolve consistently. Each framework control is then scored against the enriched text.

**Coverage:** `covered` = 2+ rows match · `partial` = 1 row · `missing` = 0

**Redundancy:** tools mapped to the same control objective are grouped; capability-bucket filtering
prevents cross-function tools (e.g. a WAF and a DLP both matching NIST-PR.DS) from being flagged as
redundant with each other. Savings estimate = `(overlapping tools − 1) × avg annual tool cost × 20%`.

**Roadmap:** phases derived from actual findings — Phase 1 closes missing controls or targets core
partial domains (Identity, SOC, Endpoint, Network); Phase 2 addresses specialty domains or deepens
integrations; Phase 3 consolidates likely-redundant tools with the real savings figure.

## Notes

- Fully deterministic and offline — no external API calls
- Matching confidence improves when `vendor`, `product`, and `current_control_id` columns are populated
- Domain Coverage shows *"No controls in this mode"* for domains with no dedicated control in the
  selected framework (e.g. AppSec tools in NIST-only mode)
- Results are persisted to SQLite when a project name is provided; timestamps display in the
  browser's local timezone; project IDs reset to 1 after all projects are deleted
