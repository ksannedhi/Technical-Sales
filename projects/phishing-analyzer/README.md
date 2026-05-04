# Phishing Analyzer

Demo-first AI-powered phishing email analyzer built for CISO and presales conversations.

## Documentation

Full product spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Stack

- React + Vite frontend
- Node + Express backend
- OpenAI Responses API — narrative layer only
- Hybrid deterministic rules + AI reasoning
- Puppeteer-based PDF export

## What it produces

- Risk score (0–100) with per-finding score breakdown
- Verdict: Clean / Suspicious / Likely Phishing / Phishing
- Calibrated confidence score
- Executive and analyst summaries (AI-written)
- Severity-ranked findings with email evidence excerpts and highlighted URLs/domains
- MITRE ATT&CK tactic and technique mapping
- NCA ECC-2:2024 and ISO 27001 compliance gaps — toggle between frameworks in the UI
- Structured IOC table: sender domains, reply-to, return-path, suspicious embedded URLs
- Owner-assigned remediation recommendations
- Campaign cluster signal when infrastructure repeats across analyses in the same session
- Analyst note field appended to the PDF export
- Downloadable PDF report — includes both compliance frameworks, IOC table, score breakdown, and analyst notes

## Getting started

1. Copy `.env.example` to `.env`
2. Add your `OPENAI_API_KEY`
3. Start the app:
   - **One-click:** double-click `Launch Phishing Analyzer.cmd`
   - **Terminal:** `npm install` then `npm run dev`
4. Open `http://localhost:5175`

## Endpoints

| Service  | URL |
|----------|-----|
| Frontend | `http://localhost:5175` |
| Backend  | `http://localhost:3002` |
| Health   | `http://localhost:3002/api/health` |

## What makes the analysis trustworthy

All structured data — verdict, risk score, MITRE tactics, compliance gaps, recommendations — is computed deterministically before the model is called. OpenAI is called only for the narrative layer: executive summary, analyst summary, and plain-English compliance explanations. The UI shows the analysis source on every result.

## Detection coverage

**Email parsing**
- MIME multipart decoding with base64 and quoted-printable support — the engine sees the actual decoded HTML body, not the raw MIME wrapper
- Attachment detection via Content-Disposition and Content-Type headers (presence and file type, not content analysis)
- CSS junk-blob obfuscation detection in `<style>` blocks

**Sender and infrastructure signals**
- Typosquatted sender domains (ASCII substitution, Unicode/homograph characters, Punycode IDN labels)
- Sender domain age via RDAP lookup — flags domains registered in the last 30 days
- Return-Path vs. From domain mismatch
- Reply-To vs. From domain mismatch

**Header and authentication signals**
- SPF, DKIM, DMARC failure and absence detection

**Link signals**
- Embedded URL domain vs. sender domain mismatch
- Link text vs. href brand mismatch — catches "Microsoft login" pointing to an unrelated host across 9 major brands

**Content signals**
- Urgency and pressure language (English, German, French, Arabic)
- Credential-harvesting lures (verify, login, sign-in, MFA)
- Brand impersonation from free-mail or lookalike domains
- Prize fraud and advance-fee language (English, German, French, Arabic)
- Invoice and financial fraud cues
- High-profile impersonation (named executives)
- Reply-based social engineering lures

## Detection limits

The engine is a deterministic rule set, not a trained model. It catches what the rules cover — and misses what they don't.

**What it may miss:**
- Phishing domains that don't mimic a known brand — clean ASCII, aged registration, no typosquatting
- Image-only emails where the body is a single embedded graphic with no inspectable text
- Obfuscated urgency language — spaced characters, zero-width insertions, or languages beyond EN/DE/FR/AR
- Redirect chains and URL shorteners — the engine sees the first hop, not the final destination
- Targeted BEC written as clean, contextual prose with no suspicious keywords or infrastructure signals

**What it may over-flag:**
- Transactional and marketing mail routed through ESPs — Return-Path and link domain mismatches are expected and normal for legitimate bulk senders
- Internal mail relayed through third-party platforms such as Salesforce or Mailchimp
- Security notifications from large vendors whose delivery infrastructure differs from their primary domain

**Intended scope:**
This tool is designed for demo and presales conversations, not production detection. It illustrates the analytical framework — findings, compliance mapping, IOC extraction, and reporting — that a production email security stack would feed with richer signals: sender reputation databases, threat intelligence feeds, trained classifiers, and behavioral context. The analysis source field on every result (`openai_structured` or `deterministic_fallback`) makes the engine's role transparent to any technical reviewer.

## Safeguards

- 5 MB request body limit for enterprise `.eml` files
- In-memory rate limit on `/api/analyze` — 10 requests per minute per IP
- RDAP domain age lookups are cached for 24 hours and time out after 3.5 seconds — analysis never blocks on a slow lookup
- Campaign fingerprinting stores the last 20 analyses in memory; no data is persisted to disk
- Attachment binary payloads are skipped before decoding — only text parts are processed
