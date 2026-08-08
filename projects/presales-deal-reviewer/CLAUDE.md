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

## Engine and UI patterns (May 2026)

- **Family detection threshold** — `min_hits = 1 if req_hits >= 1 else 2`. If the RFP names the family explicitly (req_hits ≥ 1), one combined hit is enough to activate the family. The ≥ 2 threshold applies only on the proposal-fallback path (req_hits = 0) to suppress noise. Terse RFPs (e.g. Check Point BOQ with 358 words) need this or the family is silently skipped.
- **`setReviewMode(mode, isInit=false)` pattern** — the init call on page load must NOT hide the result section. Only active mode switches should clear it. Add an `isInit` flag and gate the `result-section` hide behind `!isInit`.
- **Auto-scroll to result on page load** — after `setReviewMode(mode, true)`, check `_rs.children.length > 0` and call `_rs.scrollIntoView({ behavior: "smooth" })` with a 120ms setTimeout so the browser finishes rendering first.
- **`assign_text_to_bucket` returns bucket name** — changed from `None` to `str` return so ZIP routing can record `{filename: bucket}` and surface it in the upload notification message.
- **`render_findings_groups(findings, always_show=[])` pattern** — gates in `always_show` render a green "✓ No gaps detected." line even when empty so the reviewer sees the gate was evaluated, not skipped. Pass `always_show=["Requirements"]` for Deal Review.
- **Doc writing rule: behavior not mechanics** — product docs (README, PRODUCT_SPEC) must describe what the app does from the user's perspective. Remove: "fires on", "engine fires", "detected from signals", "suppressed when", "downgraded to", internal thresholds (30%, 60 words), workaround explanations (CMD Quick Edit, SQLite daemon). These belong in CLAUDE.md only.
- **RFP Review results = questions + HIGH risk flags** — findings section removed from RFP mode except HIGH severity Architecture/Requirements findings, which surface as "Risk Flags". Questions are primary deliverable; risk flags give early visibility into critical gaps. Score not shown in RFP mode.
- **Cross-doc RFP-vs-proposal architectural checks** — `_cross_document_checks()` fires MEDIUM findings when the proposal does not respond to architectural requirements (HA, DR, compliance, throughput, integrations) stated in the RFP. Gated on `proposal.strip()` — no proposal = missing-artifact finding covers it. This check only runs in Deal Review mode (requires both RFP and proposal).
- **iam_pam always requires anchor hit** — even on the primary detection path (req_hits ≥ 1), iam_pam requires at least one anchor keyword hit. Without this, SOC RFPs that reference "ad", "mfa", "identity", "iam" as log-source integrations falsely activate the family. Anchor list: cyberark, sailpoint, beyondtrust, okta, ping, active directory, ldap, privileged access, pam, iga, etc.
- **SOAR question before family loop** — SOAR fires on all SIEM deals. If added at the end of the family loop, it is displaced when 5 families × 2 questions each exhaust the 10-question cap. Fix: emit the SOAR question before the family loop so it always lands in the first slots.
- **TI HA question removed** — `threat_intelligence` removed from `HA_QUESTIONS_BY_FAMILY`. TI feeds are vendor-managed SaaS; customers don't architect HA for them. The generic HA question was confusing and irrelevant for TI deals.
- **Short keywords (≤4 chars) can be valid anchors** — "waf", "ndr", "siem" are specific enough to anchor family detection despite being short. Do not blindly require long-form phrases as anchors for all families. "waf" alone in an RFP is a strong signal for app_delivery_security.
- **Multipart binary rstrip bug** — `payload.rstrip(b"\r\n")` strips ALL trailing 0x0D/0x0A bytes from the payload, corrupting binary files (ZIP, DOCX, PDF) that happen to end with those bytes. Correct fix: exact `payload[:-2]` if `payload.endswith(b"\r\n")`. This was the root cause of BadZipFile on WAF RFP.zip.
- **BadZipFile crash** — wrap `load_artifacts_from_zip_data()` in `except zipfile.BadZipFile` and return a user-friendly error via `state["messages"]` + `state["_redirect_error"] = True`. Never let unhandled ZipFile exceptions reach the wsgiref handler.
- **Mode switch card isolation** — `selected_review_summary` renders outside `result-section` in the DOM. Hiding `result-section` on mode switch leaves the deal summary card visible. Must also hide `selected-review-summary` in `setReviewMode()`.

## Engine and UI patterns (June 2026)

- **Delayed loading overlay (400ms)** — full-screen spinner overlay only activates via `setTimeout(..., 400)` in the form submit handler. Fast DOCX/text submissions complete and navigate away before the timer fires, so the overlay never flashes. Slow PDF extractions show it correctly.
- **`PDF_EXTRACTION_TIMEOUT = 25` (seconds)** — wall-clock cap in `_extract_pdf_inprocess()` (file_ingest.py), independent of `MAX_PDF_PAGES`. Complex font/XObject-heavy PDFs can take 0.5-2s/page; the cap returns partial text with a `[Only the first N of M pages were reviewed — ... Convert to DOCX for full analysis.]` note instead of hanging.
- **`_REQUIREMENTS_CONTENT_SIGNALS` needs compound phrases, not bare words** — bare `"shall "` / `"must "` matched meeting notes too easily (2-hit threshold), misrouting them to requirements. Use compound forms: `"shall be"`, `"shall support"`, `"must include"`, etc.
- **SeedDataset multi-root name collision** — `seed_dataset/` and `messy_seed_dataset/` both have `deal_01`...`deal_06`. `_load()` has no dedup; `get(name)` returns the first match (seed_dataset, listed first). Tests needing the messy variant must read files directly from `data/messy_seed_dataset/<deal>/` rather than via `get_seed_deal()`.
- **`overall_status_from_findings` — ANY high-severity finding overrides score** (not just "conflict"-tagged ones) → forces `ATTENTION REQUIRED`. PRODUCT_SPEC score table corrected to match (REWORK label was stale, replaced with ATTENTION REQUIRED).
- **`DEFAULT_GATE_CONFIG` weights must mirror `gate_config.json`** — it's used as a fallback default parameter; drift between the two causes silent inconsistency if the JSON fails to load.
- **Code-review re-evaluation pattern** — when the user provides additional screenshots/context after an initial "skip" verdict on a review finding, re-verify against the new evidence rather than defending the original call. Three findings initially marked non-issues were all confirmed valid once concrete examples were shown.
- **robocopy for new subfolders** — `cmd /c "robocopy <src> <dst> /E"` (no extra `/XD`/`/XF` flags) reliably reports "New Dir N" and copies new subfolders like `screenshots/`. The broader exclusion-flag invocation can silently no-op on new directories too.
