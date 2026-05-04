# Phishing Analyzer Project Spec

## Overview

Phishing Analyzer is a demo-first web application that analyzes suspicious email content and produces an executive-ready phishing report. Designed for CISO and presales conversations, while remaining technically credible for analysts.

The product goal:

- paste or upload one suspicious email
- get a polished, boardroom-ready phishing assessment
- present it convincingly in a live demo

## Product Intent

Not a mailbox security platform or SOC case management tool. A focused phishing analysis demo that combines:

- raw email and `.eml` inspection with MIME multipart decoding
- deterministic pattern-based detection engine
- AI-assisted narrative (summaries, compliance explanations)
- MITRE ATT&CK context
- NCA ECC-2:2024 and ISO 27001 compliance mapping (user-selectable toggle)
- structured IOC extraction
- owner-based recommendations
- downloadable PDF reporting with analyst notes

## Primary User

- CISO / presales demo audience

Secondary viewers:

- SOC analysts
- Compliance / GRC stakeholders
- MSSP consultants

## MVP Success Criteria

1. Paste or upload one suspicious email
2. Receive a structured threat report with score, verdict, findings, IOCs, compliance gaps, and recommendations
3. Understand the risk within seconds
4. Export a presentation-quality PDF with analyst notes

Performance target: under 10 seconds end-to-end (practical result near that depending on API latency).

## Supported Inputs

- Pasted raw email text
- Uploaded `.eml` files (MIME multipart with base64/QP decoding)
- Pasted headers + body
- Forwarded email text from Outlook or Gmail

## Threat Types In Scope

- Phishing
- Business email compromise (BEC)
- Malware delivery (attachment-based)
- Credential harvesting
- Impersonation (brand, executive, lookalike domain)
- Invoice fraud / finance-related social engineering

## Functional Requirements

### Input Experience

- Large textarea for pasting email content
- `.eml` file upload
- Sample email button for quick demo flow

### Analysis Output

- `riskScore` (0–100) with labelled per-finding breakdown
- `verdict`: clean / suspicious / likely_phishing / phishing
- `confidence` score
- `executiveSummary` (AI-written)
- `analystSummary` (AI-written)
- `findings[]` — each includes severity, category, detail, excerpt, eccControls, isoControls
- `attackTactics[]` — MITRE ATT&CK tactic + technique + relevance
- `eccComplianceGaps[]` and `isoComplianceGaps[]`
- `recommendations[]` — action, owner, timeframe, rationale
- `iocs` — senderDomains, replyToDomains, returnPathDomains, embeddedUrls, uniqueDomains
- `scoreBreakdown[]` — labelled score contributions per finding and threat profile
- `metadata` — timestamps, emailFrom, subject, linkCount, attachmentDetected, analysisSource, campaignMatch

### Findings Presentation

- Ordered by severity
- Labeled by category
- Evidence excerpts with highlighted URLs and domains (link/sender/impersonation/headers findings)
- Mapped to both NCA ECC and ISO 27001 controls
- Framework toggle switches displayed controls without re-analyzing

### Compliance Gaps

Tabular display:
- Finding category
- Controls violated (NCA ECC or ISO 27001)
- What the control requires

Both frameworks computed on every analysis. Toggle switches views without re-analyzing. PDF always renders both sections.

### IOC Panel

Dedicated panel surfaces:
- Sender domain
- Reply-To domain
- Return-Path domain
- Suspicious embedded URLs (excluding legitimate tracking/asset domains)

### Score Breakdown

Show/hide collapsible list on the risk score card. Lists each contributing finding title and threat profile bonus with its point value. Replicated in the PDF verdict card sidebar.

### Campaign Cluster Signal

If the sender domain, return-path domain, and CSS obfuscation fingerprint match a previous analysis in the current session, a banner is shown with the time of the first match. Useful for demonstrating that two samples are the same threat actor campaign.

### Analyst Note

Free-text field at the bottom of results. Content is appended to the PDF as a highlighted note block. Not persisted between page loads.

## Architecture

### Frontend

- React + Vite
- Responsibilities: input, loading states, result visualization, IOC panel, framework toggle, analyst note, PDF download

### Backend

- Node.js + Express
- Responsibilities: receive requests, parse and decode MIME email, run deterministic checks, call OpenAI, validate output, generate PDF

### AI Layer

- OpenAI Responses API
- Structured JSON schema output
- Default model: `gpt-5-nano`
- `max_output_tokens: 1500`
- `reasoning: { effort: 'minimal' }`

Responsibilities (narrative layer only):
- Executive summary
- Analyst summary
- Plain-English compliance control explanations (`whyItMatters`)
- Calibrated confidence score

All structured data — verdict, risk score, findings, IOCs, score breakdown, MITRE tactics, compliance gaps, recommendations — is computed deterministically. The model narrates; it does not classify.

### PDF Layer

- Puppeteer-based HTML-to-PDF
- Renders: branded header, verdict card with score breakdown sidebar, analyst note, MITRE tags with technique IDs, findings, IOC table, NCA ECC compliance gaps, ISO 27001 compliance gaps, recommendations
- Campaign reuse warning banner when `campaignMatch` is true

## Hybrid Analysis Design

### Email Parsing

`emailParser.js` handles:
- MIME boundary detection and multipart splitting
- Base64 and quoted-printable decoding for `text/html` and `text/plain` parts
- Non-text parts (PDF, images, Office docs) are skipped before decoding
- Anchor tag extraction for link text vs. href mismatch detection
- URL deduplication across raw and decoded content
- CSS junk-blob detection (`<style>` blocks with ≥100 commas)
- Attachment detection via `Content-Disposition` and `Content-Type` headers

### Deterministic Checks

`deterministicChecks.js` runs all structural analysis:

| Finding ID | Signal |
|---|---|
| `sender-typosquat` | ASCII substitutions and Unicode/homograph/Punycode domains |
| `sender-domain-recently-registered` | RDAP domain age < 30 days |
| `headers-replyto-mismatch` | Reply-To domain ≠ From domain |
| `headers-returnpath-mismatch` | Return-Path root ≠ From root |
| `headers-authentication-failure` | SPF/DKIM/DMARC fail or absent |
| `links-domain-mismatch` | Embedded URL root ≠ sender root |
| `links-text-href-mismatch` | Link text claims brand X, href goes to non-official domain |
| `urgency-pressure-language` | Urgency terms (EN/DE/FR/AR) |
| `impersonation-brand-abuse` | Brand keywords from free-mail or lookalike domain |
| `credential-harvesting-lure` | Verify/login/sign-in language + URL |
| `financial-fraud-cue` | Invoice/payment/wire-transfer language |
| `impersonation-high-profile` | Named executive impersonation |
| `financial-fraud-prize-theme` | Prize/lottery/advance-fee language (EN/DE/FR/AR) |
| `content-reply-lure` | Reply-and-confirm social engineering |
| `content-css-obfuscation` | Oversized CSS style block (≥100 commas) |

Domain age lookups use rdap.org with a 3.5s timeout and 24h in-memory cache. Checks run async without blocking if the lookup fails.

### Risk Score

Additive model in `computeFallbackRisk`:

- Base: 22 (findings present) or 12 (no findings)
- Per finding: critical +24, high +16, medium +9, low +4
- Per threat profile: credential_harvesting +12, BEC +10, financial_fraud +10, malware_delivery +10, invoice_fraud +8, impersonation +8
- Hard cap: 100

Score breakdown is returned as a labelled array alongside the final score.

### AI Reasoning

Model receives: parsed email metadata, normalized findings, threat profiles, risk score, verdict, and ECC gap structure. Returns only the narrative layer (4 fields: executiveSummary, analystSummary, confidence, eccGapExplanations).

### Campaign Fingerprinting

`routes/analyze.js` maintains the last 20 analysis fingerprints in memory (format: `fromDomain|returnPathDomain|cssObfuscated`). On each analysis, if the fingerprint matches a stored entry, `metadata.campaignMatch: true` and `metadata.campaignMatchedAt` are added to the result.

### Source Transparency

Each result carries `analysisSource`:
- `openai_structured` — narrative from OpenAI, deterministic structure
- `deterministic_fallback` — OpenAI call failed; generic summaries used

## Compliance Mapping Model

Both frameworks computed on every analysis. Frontend toggle switches without re-analyzing. PDF renders both sections.

### NCA ECC-2:2024 Controls Used

| Control ID | Description |
|---|---|
| `2.4.3.1` | Email phishing and spam filtering |
| `2.4.3.2` | MFA for email remote and webmail access |
| `2.4.3.4` | Email APT and zero-day malware protection |
| `2.4.3.5` | Email domain validation (SPF, DKIM, DMARC) |
| `2.2.3.2` | Multi-factor authentication for remote and privileged access |
| `2.2.3.4` | Privileged access management |
| `2.5.3.3` | Secure internet browsing and restriction of suspicious websites |
| `1.10.3.1` | Cybersecurity awareness — secure handling of email and phishing |
| `2.13.3.1` | Cybersecurity incident response plans and escalation procedures |
| `2.13.3.3` | Reporting cybersecurity incidents to the NCA |

### ISO 27002:2022 Controls Used

| Control | Description |
|---|---|
| `8.7` | Protection against malware |
| `8.23` | Web filtering |
| `8.5` | Secure authentication |
| `8.2` | Privileged access rights |
| `5.17` | Authentication information |
| `6.3` | Information security awareness, education and training |
| `5.26` | Response to information security incidents |

## Operational Safeguards

| Safeguard | Detail |
|---|---|
| Request body limit | 5 MB |
| Rate limiting | 10 requests/min per IP, in-memory |
| RDAP timeout | 3.5 s per lookup; analysis never blocks on failure |
| RDAP cache | 24 h in-memory per root domain |
| Campaign fingerprint store | Last 20 analyses in memory, not persisted |
| Attachment decoding | Binary MIME parts skipped before decoding |
| Model token ceiling | 1500 output tokens |

## Startup

**One-click (Windows):** `Launch Phishing Analyzer.cmd`
- Kills any existing process on ports 3002 / 5175
- Runs `npm install` if `node_modules` is absent
- Creates `.env` from `.env.example` if `.env` is absent
- Opens backend and frontend in separate PowerShell windows

**Terminal:**
```
npm install
npm run dev
```

## Key Project Files

| File | Purpose |
|---|---|
| `server/src/parsing/emailParser.js` | MIME decode, link pair extraction, CSS obfuscation |
| `server/src/rules/deterministicChecks.js` | All detection logic, IOC extraction, domain age |
| `server/src/services/domainAge.js` | RDAP lookup with cache |
| `server/src/mappings/eccMappings.js` | NCA ECC and ISO 27001 control libraries |
| `server/src/schemas/analysisResultSchema.js` | Zod schema for result validation |
| `server/src/services/openaiAnalysis.js` | Score breakdown, IOC assembly, narrative fetch |
| `server/src/prompts/analyzeEmail.js` | OpenAI narrative-only prompt |
| `server/src/services/reportTemplate.js` | HTML report template (all sections) |
| `server/src/services/pdfReport.js` | Puppeteer HTML-to-PDF |
| `server/src/routes/analyze.js` | Analysis route + campaign fingerprint tracking |
| `server/src/routes/report.js` | PDF export route |
| `server/src/middleware/rateLimit.js` | In-memory rate limiter |
| `client/src/App.jsx` | Root: state, analyst note, download |
| `client/src/components/IocPanel.jsx` | IOC chip display |
| `client/src/components/FindingsPanel.jsx` | Findings with highlighted excerpts |
| `client/src/components/RiskScoreCard.jsx` | Score ring + breakdown toggle |
| `client/src/components/EccPanel.jsx` | Compliance gaps with framework toggle |
| `client/src/styles/global.css` | All UI styles |

## Non-Goals

- Mailbox integration
- Persistent analysis history
- User accounts or authentication
- Attachment content analysis (PDF URLs, Office macros)
- Multilingual reporting output
- White-label branding controls
- Production SOC ticketing integrations

## Current Status

Fully functional demo tool. Capabilities:

- MIME multipart decoding — engine sees actual decoded HTML body from real `.eml` files
- 15 deterministic detection signals across sender, headers, links, content, and payload categories
- Multilingual detection: English, German, French, and Arabic urgency and prize-fraud terms
- Homograph and Punycode domain detection
- RDAP domain age lookup with cache
- Link text vs. href brand mismatch across 9 major brands
- CSS content obfuscation detection (T1027)
- Structured IOC extraction surfaced in UI and PDF
- Score breakdown with per-finding and per-profile contributions
- Campaign cluster fingerprinting across session analyses
- Analyst note field appended to PDF export
- Dual-framework compliance: NCA ECC-2:2024 and ISO 27001 with real sub-control IDs
- PDF includes both compliance frameworks, IOC table, score breakdown sidebar, MITRE technique IDs, analyst note, and campaign reuse banner
- Windows one-click launcher
- In-memory rate limiting
