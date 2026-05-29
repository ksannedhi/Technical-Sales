# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the app (preferred — use the launcher):**
```
Double-click: start.cmd
```
The launcher sets `PYTHONPATH`, optionally uses a local Python install, and opens the browser automatically.

**Start manually:**
```bash
set PYTHONPATH=src
set PDG_OPEN_BROWSER=1
python app.py  # http://127.0.0.1:8020
```

**Run tests:**
```bash
set PYTHONPATH=src
python -m unittest discover -s tests
```

**Verify syntax:**
```bash
python -m py_compile app.py src\presales_gate_engine.py src\file_ingest.py tests\test_engine.py
```

## Architecture

A **local presales deal reviewer** built on Python's built-in `wsgiref` WSGI server — no external web framework or frontend build step. All UI is rendered server-side as HTML.

```
app.py                      WSGI server + all route handlers + HTML rendering
        ↓
src/presales_gate_engine.py Scoring engine — readiness gates across Requirements, Architecture, Proposal
src/file_ingest.py          File ingestion — .txt, .md, .docx, .pptx, .pdf, .zip extraction
        ↓
data/gate_config.json       Tunable scoring weights, thresholds, and heuristic settings
```

**Session state** is held in in-memory Python lists (`SESSION_REVIEWS`, `FLASH_MESSAGES`). It resets when the server restarts.

## Key design decisions

- **No external framework** — `wsgiref.simple_server` keeps the stack minimal and avoids dependency conflicts. No Flask, no FastAPI, no Node.
- **No frontend build** — HTML is rendered directly in `app.py`. No Vite, no React, no npm.
- **Port via env var** — `PORT` defaults to `8020`. Override with `set PORT=<n>` before running. The `start.cmd` does not set PORT, so it always uses the default.
- **PYTHONPATH=src** — all imports from `src/` require this to be set. The launcher handles it; set it manually if running directly.
- **`PDG_OPEN_BROWSER=1`** — when set, the app opens the browser automatically after a short delay.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8020` | Server listen port |
| `PDG_OPEN_BROWSER` | unset | Set to `1` to auto-open browser on startup |
| `PYTHONPATH` | must be `src` | Required for local module imports |

## Ports

| Service | Port |
|---------|------|
| Web app (wsgiref) | `8020` |

## Key project files

- `app.py` — WSGI server, all route handlers, HTML rendering, session management
- `src/presales_gate_engine.py` — scoring engine (requirements, architecture, proposal gates)
- `src/file_ingest.py` — file extraction helpers (docx, pptx, pdf, zip, txt, md)
- `data/gate_config.json` — scoring weights, thresholds, heuristic settings
- `PRODUCT_SPEC.md` — full product and behaviour spec
- `tests/test_engine.py` — regression coverage for scoring and ingestion
- `start.cmd` — Windows launcher (sets PYTHONPATH, optionally uses local Python)

## Non-goals

- Multi-user support (single-session local tool)
- Persistent deal history across restarts
- Document generation output
- Cloud/SaaS deployment

## Two modes

- **RFP Review** — Requirements gate only; no score; questions first, requirements findings below; proposal and supporting context fields hidden. Mode stored in result dict and persists through Deal History and re-run.
- **Deal Review** — all three gates; score-first layout. Default mode.
- `review_mode` field in the result dict (`"rfp"` or `"deal"`) controls rendering in `render_page()` and download content in `build_findings_download_href()`.

## Engine patterns

- **Gate weights (Deal Review mode)** — Requirements 25%, Architecture 25%, Proposal 50% (source of truth: `data/gate_config.json`). Proposal-dominant: proposal is the only fully fixable artifact at deal review time. RFP Review mode produces no score.
- **Solution families (17)** — siem_log_mgmt, firewall_network, email_security, endpoint_xdr, iam_pam, sase_proxy, app_delivery_security, ot_ics, cloud_security, vulnerability_management, ndr, dlp, managed_services, ddos_protection, backup_resilience, threat_intelligence, dspm.
- **IAM sub-type detection** — PAM signals (cyberark, beyondtrust, vault, session recording, JIT) → `iam_pam_pam` questions. IGA signals (sailpoint, saviynt, access certification, SOD, joiner-mover-leaver) → `iam_pam_iga` questions. Falls through to general `iam_pam` questions otherwise.
- **SOAR bundled with SIEM** — SOAR scope question fires on all SIEM deals regardless of whether SOAR keywords appear. TI feed integration gap also fires on SIEM deals when TI keywords absent.
- **Solution family detection** — up to 5 families active per deal; scored by keyword hits across RFP + proposal + supporting_context. Proposal-fallback fires when RFP hits = 0 AND proposal has ≥1 anchor keyword (threshold: ≥2 for renewals, ≥4 otherwise). `iam_pam` excluded from proposal-fallback (too many false positives from integration boilerplate).
- **TippingPoint / SIEM suppression** — TippingPoint detected within `firewall_network` → swaps in IPS-specific questions. When `firewall_network` is primary AND `log_destination` signals appear, all SIEM sizing findings and questions are suppressed (SIEM is a log sink, not the solution).
- **Renewal vs. expansion** — `is_renewal` from `RENEWAL_SIGNALS`; `is_expansion = is_renewal AND seat_expansion keywords`. Renewal softens HA/DR to LOW; suppresses SIEM/retention/identity-gap findings; replaces endpoint Q1 (seat count) with OS/agent compatibility question. Expansion asks whether existing architecture extends to new scope.
- **Sector→framework mapping** — `REGULATED_SECTOR_SIGNALS` triggers; `SECTOR_COMPLIANCE_MAP` supplies hint text (e.g. healthcare → HIPAA, GDPR, ISO 27001).
- **Assumption extraction** — `_extract_assumption_sentences()` quotes up to 3 actual sentences from the proposal (assumed that / tbd / to be confirmed) instead of a generic flag.
- **Re-run delta** — `GET /?rerun=<id>` pre-fills the form; POST computes score delta vs. prior run; `render_delta_banner()` shows green ⬆ / red ⬇ / neutral ➡.
- **Key keyword lists live in `presales_gate_engine.py`** (not gate_config.json): `KEYWORDS`, `SOLUTION_FAMILY_KEYWORDS`, `SOLUTION_FAMILY_QUESTIONS`, `HA_QUESTIONS_BY_FAMILY`, `REGULATED_SECTOR_SIGNALS`, `SECTOR_COMPLIANCE_MAP`, `RENEWAL_SIGNALS`, `FAMILY_ANCHOR_KEYWORDS`, `PROPOSAL_FALLBACK_EXCLUDED`.

## wsgiref runtime patterns

- **`_QuietHandler`** — subclass `WSGIRequestHandler` and override `log_request`/`log_message` to no-ops. Prevents CMD Quick Edit Mode from pausing the server when the user clicks the terminal window.
- **Favicon fast-path** — return `204 No Content` immediately for `/favicon.ico` to avoid a full page render per browser request.
- **Daemon thread for SQLite writes** — `threading.Thread(target=..., daemon=True).start()` inside the POST handler. SQLite writes on Windows can stall 10–40 ms (Defender scan, journal flush). Never write synchronously in the request handler.
- **Lazy SeedDataset** — load data files on first property access, not in `__init__`. Server socket binds before any disk reads.
- **POST → 303 → GET** — after a POST that creates a review, redirect to `GET /?review=<id>`. Pass one-time messages via `FLASH_MESSAGES` dict (keyed by review_id, consumed on GET) to survive the redirect without re-render.
- **gitignore** — `data/analyses.db`, `data/analyses.db-journal`, `data/analyses.db-wal`, `data/analyses.db-shm`, `timing_log.txt`.
