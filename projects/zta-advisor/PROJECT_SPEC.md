# ZTA Advisor — Project Specification

## Purpose

A presales enablement tool for security engineers to run a structured Zero Trust Architecture assessment with a prospect. The PE drives the session; the prospect answers verbally. Output is a maturity gap report and prioritized remediation roadmap suitable for a CISO or board audience.

## Target users

- Presales security engineers (primary — drives the session)
- Prospects / customers (observe output, receive PDF)

## Design principles

- **Deterministic scoring** — no AI involvement in question flow or scoring
- **Single AI call** — Claude generates the narrative once, at the end
- **Graceful degradation** — no API key = no narrative; rest of app works fully
- **Vendor-neutral** — roadmap recommends capability categories, not products
- **Single-sitting** — no session persistence required

## Architecture

### Flow

```
Step 1: Org Profile
  → org name, industry, size, geography
  → geo auto-suggests frameworks (overridable)

Step 2: Assessment (38 questions, 6 pillars)
  → pillar-by-pillar navigation via pill tabs (Identity, Devices, Networks,
    Applications & Workloads, Data, Visibility & Analytics)
  → global progress bar across the top — fills as questions are answered,
    turns green when all 38 are complete
  → answered / total count per pillar shown next to the pillar header bar
  → remaining question count shown below the navigation buttons
  → pillar tab turns green with ✓ prefix when all questions in it are answered
  → structured options (1–4 maturity mapping) per question
  → all pillars must be complete before "Generate Assessment" button enables
  → inputs and pillar position are retained when navigating back to Step 1

Step 3: Results
  → deterministic pillar scoring
  → Claude narrative (if API key present)
  → gap analysis table
  → prioritized remediation roadmap (short / medium / long)
  → PDF export via Puppeteer
```

### Scoring model

Each question has 4 options mapping directly to maturity levels 1–4. Pillar score = arithmetic mean of all question scores in that pillar. Overall score = mean of all pillar scores. Target maturity = 3 (Advanced).

Gap = TARGET_MATURITY − current_score (floored at 0).

Gap priority classification:
- gap ≥ 2 → Critical
- gap ≥ 1 → High
- gap > 0 → Medium
- gap = 0 → On Target

### Remediation controls

Stored in `controls.json` per pillar per maturity transition (`"N-to-N+1"`). Each control has: title, description, timeline (short/medium/long), priority (1–3). Controls are included for all transitions between current (floored) and target maturity.

Timeline buckets:
- **Short** — 0–90 days (immediate wins)
- **Medium** — 90–180 days
- **Long** — 180+ days (strategic / architectural)

### Framework mapping

Frameworks are metadata only — they do not change which questions are asked (unified bank) or how scoring works. They appear in the report header and inform the Claude narrative prompt.

Geo → framework auto-suggestion:

| Geo | Suggested frameworks |
|---|---|
| US | CISA ZTMM, NIST 800-207 |
| US-DoD | DoD ZT, NIST 800-207 |
| UK | NCSC ZT |
| EU | ENISA ZT, NIS2 |
| APAC | ISO 27001 |
| ME-GCC | SAMA CSF, NIST 800-207, ISO 27001 |
| Global | NIST 800-207, ISO 27001 |

## API surface

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/frameworks` | All frameworks + pillar definitions + geo options |
| GET | `/api/frameworks/suggest?geo=` | Suggested frameworks for a geo |
| GET | `/api/questions` | Full 38-question bank |
| POST | `/api/analyze` | Score answers, generate roadmap, call Claude |
| POST | `/api/export/pdf` | Render PDF from results payload |

## Data files

| File | Purpose |
|---|---|
| `backend/data/frameworks.json` | Framework definitions, geo mapping, pillar metadata |
| `backend/data/questions.json` | 38-question unified bank across 6 pillars |
| `backend/data/controls.json` | Remediation controls per pillar per maturity transition |

## Pillars (order fixed)

1. Identity — authentication, PAM, IGA, UEBA, SSO, workload identity
2. Devices — MDM/UEM, EDR, device compliance, BYOD, patching, certificates
3. Networks — micro-segmentation, ZTNA, east-west inspection, DNS, SSE/SASE
4. Applications & Workloads — app access, API security, workload identity, DevSecOps, SaaS
5. Data — classification, DLP, encryption, ABAC, audit logging, DSPM
6. Visibility & Analytics — SIEM/SOAR, compliance monitoring

## Constraints

- No session persistence
- No authentication
- No vendor product recommendations (capability categories only)
- No absolute paths in any documentation file
- `.env` never committed — `.env.example` provided
- AI-generated narrative (Executive Summary, Critical Findings, Strategic Path Forward) is not directly editable by the PE — supplementary commentary via Session Notes only
