# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start both (preferred — use the launcher):**
```
Double-click: Launch Threat-to-Business Translator.cmd
```
The launcher creates a Python venv, installs deps, and opens backend and frontend in separate windows.

**Start backend manually:**
```bash
cd backend
.venv\Scripts\activate        # Windows
# or: source .venv/bin/activate  # macOS/Linux
uvicorn app.main:app --reload  # http://localhost:8000
```

**Start frontend manually:**
```bash
cd frontend && npm run dev  # http://localhost:5178
```

**Set up backend venv from scratch:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Install frontend dependencies:**
```bash
cd frontend && npm install
```

**Health check:**
```bash
curl http://localhost:8000/health
```

## Architecture

A **threat-to-business narrative translator** that converts raw technical security evidence (CVEs, SOC alerts, vulnerability scan reports) into executive-ready risk summaries. Built-in synthetic scenarios allow demos without customer data.

```
frontend/src/           React SPA — sector selector, scenario browser, file/text input, risk narrative output
        ↕ REST (fetch via Vite proxy → /api)
backend/app/main.py     FastAPI app — CORS, route registration
        ↓
backend/app/
  routes/               /api/sectors, /api/scenarios, /api/translate, /api/analyze
  services/
    translator.py       Core narrative generation logic
    data_loader.py      Sector-aware domain and scenario card loader
  models.py             Pydantic response models
backend/data/
  enterprise_data.json               Financial services domain (default)
  enterprise_data_healthcare.json    Healthcare domain
  enterprise_data_manufacturing.json Manufacturing / OT domain
  enterprise_data_retail.json        Retail / e-commerce domain
  enterprise_data_technology.json    SaaS / technology domain
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:8000`. No CORS issues in dev.

**File input:** Accepts `.pdf`, `.txt`, `.csv`, `.json`, `.log`. PDFs are parsed with `pypdf`.

**Sector-aware domain loading:** `data_loader.py` maintains a `SECTOR_FILES` dict mapping sector IDs to domain JSON files. Every endpoint that returns scenario data or generates a report accepts a `sector` query/form parameter. The frontend sector bar drives this — changing sector reloads the scenario library and resets the selected scenario.

## Key design decisions

- **Python venv (not --target)** — uses a standard `.venv` inside `backend/`. The launcher handles venv creation and activation automatically.
- **Built-in scenario library** — `data_loader.py` loads pre-written scenarios so demos run without any external API or customer data.
- **Sector-aware domain files** — each industry sector has its own JSON domain file with appropriate BUs, services, assets, scenarios, and controls. The default sector is `financial-services`.
- **Organisation risk profile** — all translation endpoints accept profile parameters (revenue, employee count, security maturity, etc.) to contextualise output for a specific organisation.
- **pypdf for document parsing** — PDF text extraction is handled locally; no external OCR service.
- **uvicorn default port** — backend runs on uvicorn's default port `8000`. No `--port` flag used in the launcher.
- **Fully deterministic** — no LLM or external API. All scoring, narrative generation, and matching is deterministic Python.

## Engine internals (translator.py)

Key constants:
- `MINIMUM_MATCH_SCORE = 4` — keyword score threshold below which the generic fallback fires instead of binding to a specific template's BU/service context. Prevents sparse CVE titles (e.g. a single "cve-" match) from inheriting unrelated fictional context.
- `FALLBACK_SIGNAL_CAP = 3` — caps `exploitability` and `threat_activity` when the fallback template fires. Template-authored values (often 4–5) reflect confirmed incidents, not a sparse CVE title.
- `SCENARIO_MATCHERS` — 18 keyword-weighted templates covering: vpn-zero-day, edr-identity-lateral, cloud-storage-regulated-data, supplier-ransomware-chain, deepfake-fraud, ransomware-endpoint, cloud-workload-rce, identity-provider-compromise, cicd-pipeline-compromise, database-open-exposure, api-exposure, customer-portal-outdated-web, ad-admin-weak-auth, saas-account-takeover, ot-scada-attack, network-device-rce, data-exfiltration-insider, and a generic fallback. The `api-exposure` template also covers path traversal, LFI, SSRF, and arbitrary file read CVEs — these scored 0 before and hit the generic fallback.

Key functions:
- `_infer_scenario()` — scores every `SCENARIO_MATCHERS` template against the input text, picks the best match above threshold, or fires the generic fallback.
- `_scenario_by_id()` — resilient lookup: finds the scenario by ID in the domain, falls back to `edr-identity-lateral`, then falls back to `domain["scenarios"][0]`. Never raises KeyError — new matcher IDs work gracefully even if a sector domain file has not yet added a matching scenario stub.
- `_parse_cvss()` — extracts CVSS v3 data from free text. Handles full vector strings (`CVSS:3.1/AV:N/...`) and labeled score patterns (`CVSSv3 Base Score: 9.8`, `CVSS: 8.7`, `Base Score: 7.5`). A negative-lookahead guard prevents false-matching the version prefix inside a vector string.
- `_cvss_exploitability()` — maps parsed CVSS data to a 1–5 score. Base score is authoritative (Critical ≥9.0 → 5, High ≥7.0 → 4, Medium ≥4.0 → 3). When only a vector string is present, synthesises from AV/AC/PR/UI components.
- `_derive_signal_factors()` — when CVSS data is present, uses `_cvss_exploitability()` as the authoritative exploitability source (skipping keyword-based adjustments since CVSS already encodes them). When no CVSS is found, falls back to keyword inference with conditional language detection (strong: −2; moderate: −1). Active exploitation signals (`"known exploited"`, `"cisa kev"`) boost exploitability and threat_activity regardless of CVSS presence.
- `_neutralise_fallback_context()` — replaces all template-sourced BU/service/asset/identity fields with neutral placeholders when the fallback fires. Risk scores and loss figures are preserved.
- `_resolve_service()` — matches a customer-provided free-text service name against the domain using four steps in priority order: (1) exact service name, (2) partial name substring, (3) BU name → highest-criticality service in that BU, (4) `_SERVICE_CONCEPT_KEYWORDS` — concept terms (e.g. `"logistics"`) searched against live domain service names and IDs, making the lookup sector-agnostic. The old `_SERVICE_KEYWORDS` map was replaced because it hardcoded financial-services service IDs that didn't exist in other sector domains.
- `_derive_executive_trigger()` — extracts the first clean sentence (split at `.`) up to 280 chars with word-boundary truncation.
- `_build_report()` — accepts an optional `domain: dict | None = None` parameter. When a pre-loaded domain is passed in, it is used directly instead of calling `load_domain()` again. Eliminates redundant double-loads on the sector-aware call path.

`translate_scenario()` and `analyze_raw_input()` both accept a `sector` parameter, load the domain once, and pass it to `_build_report()`. `/api/analyze` accepts an optional `affected_service` form field — when provided it is resolved via `_resolve_service()` and used to override the template-matched BU/service context, while the CVE text continues to drive signal factor scoring.

## Environment variables

No `.env` file required. The engine is fully deterministic and offline.

## Ports

| Service | Port |
|---------|------|
| Backend (FastAPI/uvicorn) | `8000` |
| Frontend (Vite) | `5178` → proxies `/api` to `:8000` |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/default-profile` | Returns default organisation risk profile |
| GET | `/api/sectors` | Returns the list of available industry sectors |
| GET | `/api/scenarios` | List built-in scenario cards (accepts `?sector=`) |
| GET | `/api/translate/{scenario_id}` | Translate a built-in scenario with org profile (accepts `?sector=`) |
| POST | `/api/analyze` | Analyze pasted text or uploaded file (accepts `sector` form field) |

## Key project files

- `backend/app/main.py` — FastAPI app, middleware, all route handlers
- `backend/app/services/translator.py` — core translation/narrative logic
- `backend/app/services/data_loader.py` — built-in scenario card loader
- `backend/app/models.py` — Pydantic request/response models
- `backend/requirements.txt` — Python dependencies (fastapi, uvicorn, pypdf, python-multipart)
- `frontend/src/` — React SPA with scenario browser and file upload
- `frontend/vite.config.js` — Vite config with `/api` proxy to `:8000`
- `Launch Threat-to-Business Translator.cmd` — Windows entry point; handles venv creation, dependency install, and spawns backend and frontend in separate PowerShell windows inline (no separate .ps1 script)

## Non-goals

- Persistent report storage
- Authentication or multi-user support
- Live threat feed integration
- Production deployment (local pre-sales demo tool)

## Engine patterns

- **Minimum match threshold** — gate template binding behind `MINIMUM_MATCH_SCORE = 4`. Without it a single generic token silently binds the wrong template.
- **Generic token weights** — keep catch-all tokens (CVE prefix, file extensions, "vulnerable") at weight 1 (tiebreakers only). Decisive signals (product names, technique IDs) should be 4–5.
- **Fallback signal cap** — when no template matches, cap inherited exploitability/threat_activity at a conservative ceiling. Template values reflect confirmed incidents.
- **Never hardcode service IDs in cross-sector lookup** — use `_SERVICE_CONCEPT_KEYWORDS` to search dynamically against the live domain's services. Hardcoded IDs from one sector don't exist in others.
- **Resilient scenario lookup** — `_scenario_by_id()` must not raise `KeyError`. Use fallback chain: exact ID → known-safe fallback ID → `domain["scenarios"][0]`.
- **CVSS base score is authoritative, not additive** — use it to replace keyword-inferred exploitability entirely. Active exploitation (KEV) is the only additive boost. Store `cvss_base_score` and `cvss_attack_vector` in `signal_factors`.
- **CVSS vector false-positive guard** — score regex must not match the version prefix in a full vector string (`CVSS:3.1/AV:N/...` → score must not be 3.1). Use negative lookahead `(?!\d+\.\d*/)`.
- **Sector-aware domain loading** — `load_domain(sector)` is the single entry point. Never call it internally when the caller already has the domain object.
- **Conditional language detection** — always test new CVE classes for hedging phrases ("under specific configuration", "may allow"). These lower real-world exploitability and must reduce the score.
- **Executive trigger generation** — use a sentence-aware extractor (split at `.`, truncate at word boundary) not a raw `[:N]` slice.
- **Test with real CVEs across vendors and classes** — auth bypass, injection, path traversal, DoS, cryptographic. Check matched template, signal scores, and business context for each.
- **CVE analysis — use code, not manual tracing** — when assessing template coverage for multiple CVEs, use `ctx_execute` to run `_infer_scenario()` programmatically against each input. Manual keyword-by-keyword tracing across 20 templates is O(n²) and takes 10+ minutes.

## GUI readability patterns

Apply to any executive-facing report panel where the primary audience is leadership, not security analysts.

- **Risk badge** — never display Overall Risk as plain text. Use `<strong className={`risk-badge risk-badge-${tone}`}>`. CSS: `risk-badge-critical` (#ef4444), `risk-badge-high` (#f97316), `risk-badge-moderate` (#eab308), `risk-badge-low` (#22c55e).
- **Report banner accent** — apply `risk-${overall_risk}` class on the context banner; CSS adds `border-left: 4px solid <color>`.
- **Featured metric cards** — Overall Risk and Likely Loss use `metric-card-featured` modifier (darker bg, accent border, 1.4rem value font). Pass `featured={true}` and `tone={tone}` as props.
- **Board Brief** — always display the `board_brief` field below the executive summary, separated by a top-border divider. Never omit — it is the primary boardroom leave-behind.
- **Collapsed technical input** — wrap in `<details className="technical-summary-toggle">`, closed by default. Summary label includes a `.toggle-hint` span that fades when open.
- **Panel ordering** — top to bottom: Recommended Actions (full-width) → Parsed Findings (full-width) → Exposure Profile / Risk Reduction → Business Context / Impact Band → Active Assumptions / Control Posture → Scoring Rationale.
- **Exposure bar tone labels** — each bar shows a qualitative label (`Critical / High / Moderate / Low`) beside the percentage. Use `.exposure-tone-label.tone-{level}` for color; group label + percentage in `.exposure-value-group` for right-aligned alignment.
- **Recommended Actions** — render as plain `<p>` tags matching all other report panels. No ordered list, no grid, no bullets. One `<p>` per action inside `<Panel className="panel-actions">`.
