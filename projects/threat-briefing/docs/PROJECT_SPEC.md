# Threat Intel Briefing Builder — Project Spec

## 1. Purpose

Threat Intel Briefing Builder is a daily threat intelligence tool that pulls raw OSINT data from three live feeds, normalises it into a unified schema, sends it to the Claude API for AI synthesis, and returns a structured briefing tuned for enterprise security teams operating in the GCC region.

The product is designed to serve two audiences simultaneously:

- SOC and IR teams who need technical, actionable output with specific IOCs, CVE IDs, and MITRE tactics
- CISOs and board-level stakeholders who need plain English, business impact framing, and clear recommendations

## 2. Product Goals

The system must:

- pull live OSINT data from AlienVault OTX, CISA KEV, and Abuse.ch MalwareBazaar daily
- normalise all feed data into a unified schema before passing it to the model
- produce a structured JSON briefing via the Claude API with consistent, predictable fields
- display the briefing in a clean React dashboard without requiring a login or account
- export the briefing as a polished PDF report via Puppeteer
- run automatically every day at 06:00 GST via node-cron
- allow on-demand generation at any time from the dashboard

The system must not:

- store briefings persistently between restarts (in-memory cache only in V1)
- require OTX to function — the feed is optional and skips gracefully if no key is present
- fabricate data — when feeds return nothing, the model produces a realistic low-activity briefing rather than inventing threats

## 3. Primary Users

Primary users:

- SOC analysts and IR team members reviewing daily threat posture
- CISOs and security directors preparing for executive briefings
- Presales and solution architects demonstrating AI-powered threat intelligence workflows

## 4. Data Sources

### 4.1 AlienVault OTX

- API endpoint: `https://otx.alienvault.com/api/v1/pulses/subscribed`
- Pulls pulses modified in the last 24 hours, limit 50
- Requires `OTX_API_KEY` environment variable
- Gracefully skipped with a console warning if the key is absent
- Each pulse is mapped to: `source`, `title`, `description`, `tlp`, `tags`, `iocs`, `attackTactics`, `targetedCountries`, `publishedAt`

### 4.2 CISA Known Exploited Vulnerabilities

- Feed URL: `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
- Public feed — no authentication required
- Filters to vulnerabilities added in the last 24 hours
- Each entry is mapped to: `source`, `cveId`, `product`, `description`, `dueDate`, `ransomwareUse`, `publishedAt`

### 4.3 Abuse.ch MalwareBazaar

- API endpoint: `https://mb-api.abuse.ch/api/v1/`
- Queries the 100 most recent malware samples via POST
- No authentication required
- Each sample is mapped to: `source`, `sha256`, `fileName`, `fileType`, `malwareFamily`, `deliveryMethod`, `publishedAt`

## 5. Normalisation Layer

All three feed outputs are merged into a single normalised payload before being sent to the model.

The normalised schema includes:

- `generatedAt` — ISO 8601 timestamp
- `totalSignals` — combined count across all three feeds
- `feeds.otxPulses` — array of mapped OTX pulses
- `feeds.cisaKEVAdded` — array of mapped CISA entries
- `feeds.malwareSamples` — array of mapped Bazaar samples
- `stats.criticalCVEs` — count of ransomware-linked CVEs
- `stats.uniqueMalwareFamilies` — deduplicated list of malware family tags
- `stats.mostTargetedTactics` — top 5 most frequent MITRE tactics from OTX pulses
- `stats.gccTargeted` — count of OTX pulses targeting GCC countries

## 6. AI Layer

### 6.1 Model

- Provider: Anthropic Claude API
- Model: `claude-haiku-4-5-20251001`
- Chosen for cost efficiency and structured JSON generation quality at this task scale

### 6.2 System Prompt Design

The system prompt instructs the model to act as a senior threat intelligence analyst for GCC enterprise clients.

Regional prioritisation rules are embedded in the prompt:

- GCC countries: Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, Oman
- GCC-relevant sectors: financial services, oil and gas, government
- GCC-linked threat actors: APT33, APT34, Turla, Lazarus, OilRig

Severity rubric used by the model:

- `critical` — active exploitation, ransomware-linked CVE, or confirmed nation-state actor
- `high` — strong IOCs, weaponised vulnerability, or known malware family with active C2
- `medium` — suspicious but unconfirmed, or older CVE newly added to KEV
- `low` — informational, no active exploitation evidence

### 6.3 Output Schema

The model returns a valid JSON object wrapped in `<result>` tags.

Top-level fields:

- `briefingDate` — ISO 8601 datetime
- `threatLevel` — `critical`, `high`, `medium`, or `low`
- `executiveSummary` — 3–4 sentences, plain English, business impact focused
- `analystSummary` — 3–4 sentences, technical language, references specific IOCs and CVEs
- `topThreats` — 3–5 threats sorted by severity descending
- `cisaKEVHighlights` — all CISA KEV entries from the feed
- `malwareFamiliesActive` — deduplicated malware family list from MalwareBazaar
- `recommendations` — 4–6 actionable recommendations with owner and timeframe
- `feedStats` — counts of OTX pulses processed, KEV entries added, and Bazaar samples analysed

Each `topThreats` entry includes:

- `rank`, `title`, `severity`, `source`, `description`, `businessImpact`
- `iocs`, `attackTactics`, `affectedSectors`
- `gccRelevance` — `high`, `medium`, or `low`
- `recommendedAction`

Each `recommendations` entry includes:

- `action` — plain English instruction
- `owner` — `SOC`, `IT`, or `Management`
- `timeframe` — `immediate`, `24h`, or `1-week`

## 7. Architecture

### 7.1 Backend

- Runtime: Node.js 18+
- Framework: Express
- HTTP client: node-fetch
- Scheduler: node-cron
- PDF renderer: Puppeteer (using cached Chromium)

Responsibilities:

- fetch and normalise OSINT feeds
- call the Claude API and parse the structured response
- cache the latest briefing in memory
- serve the briefing via REST endpoints
- generate PDF exports on demand
- schedule the daily pipeline at 03:00 UTC (06:00 GST)

### 7.2 Frontend

- Framework: React 18
- Build tool: Vite
- Styling: plain CSS (no Tailwind, no UI library)

Responsibilities:

- fetch the latest briefing on load
- allow on-demand generation
- render all briefing sections: threat banner, stats, executive summary, top threats, CISA KEV highlights, recommendations
- trigger PDF export and download

### 7.3 Workspace Structure

The project uses npm workspaces with a root `package.json` orchestrating the `server` and `client` packages. `concurrently` runs both dev servers together with `npm run dev`.

## 8. REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/briefing/generate` | Trigger on-demand pipeline and return briefing |
| GET | `/api/briefing/latest` | Return cached briefing, 404 if none |
| POST | `/api/briefing/export` | Accept briefing JSON, return PDF binary |
| GET | `/api/health` | Health check with `hasBriefing` flag |

## 9. PDF Export

The PDF is generated server-side via Puppeteer rendering an inline HTML template.

The template includes:

- branded header with threat level colour theming
- threat level badge and executive summary banner
- analyst summary section
- top threats table with severity pills, IOC previews, and GCC relevance tags
- CISA KEV highlights table with ransomware indicators and patch deadlines
- recommended actions table with owner and timeframe pills
- confidentiality footer

The Chromium binary is reused from the local Puppeteer cache rather than downloaded fresh.

## 10. Scheduling

The daily pipeline runs automatically at 06:00 GST, which is 03:00 UTC.

Cron expression: `0 3 * * *`

The scheduler calls the same `runPipeline()` function used by the on-demand endpoint. No separate scheduler logic is required.

## 11. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `OTX_API_KEY` | No | AlienVault OTX API key — skipped gracefully if absent |
| `PORT` | No | Server port, defaults to `3001` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if not using default cache location |

## 12. UI Components

| Component | Responsibility |
|-----------|---------------|
| `BriefingHeader` | Top bar with brand name, briefing timestamp, Refresh and Generate Now buttons |
| `ThreatBanner` | Coloured banner showing threat level badge and executive summary |
| `StatsRow` | Four stat cards: OTX pulses, CISA KEV added, malware samples, GCC high-priority signals |
| `ExecutiveSummary` | Executive and analyst summary text with active malware family tags |
| `TopThreats` | Ranked threat list with severity, GCC relevance, tactic and sector tags, IOC chips |
| `CisaKEV` | KEV highlights with CVE IDs, ransomware indicator, patch deadline, feed footer |
| `Recommendations` | Action list with owner and timeframe pills |
| `ExportButton` | Triggers PDF generation and browser download |

## 13. Model and Cost Strategy

- Model: `claude-haiku-4-5-20251001`
- Max tokens: 4000
- Cost rationale: Haiku is the most cost-effective Claude model for structured JSON synthesis tasks at this scale. The normalised payload is compact and the schema is well-defined, making the task well within Haiku's capability.

## 14. Startup Experience

Preferred launcher on Windows:

- Double-click `Launch Threat Briefing.cmd`

This opens backend and frontend in separate PowerShell windows, installs packages if needed, and creates `.env` from `.env.example` if missing.

Alternative terminal flow:

```bash
npm run dev
```

## 15. Non-Goals for V1

Not included in V1:

- persistent briefing storage or history
- user accounts or authentication
- email delivery of briefings
- Slack or Teams integration
- multi-region feed filtering beyond GCC context in the prompt
- white-label branding controls
- production Redis cache

## 16. Risks and Constraints

### Feed Availability

OTX, CISA, and MalwareBazaar are all public or lightly authenticated APIs. Any of them can be temporarily unavailable. Each feed is wrapped in a try-catch that logs the error and returns an empty array, so a single feed failure does not block the briefing.

### API Latency

Feed fetching and Claude API calls both have 15-second timeouts. Total pipeline time is typically 10–25 seconds depending on feed response times and Claude latency.

### Empty Feed Days

The model prompt explicitly instructs Claude to produce a realistic low-activity briefing rather than refusing when feed data is sparse. This keeps the demo usable even on days with minimal OSINT activity.

### In-Memory Cache

The briefing cache does not survive a server restart. This is acceptable for V1. A Redis layer would be the natural next step for production.

### Puppeteer on Windows

Puppeteer requires a Chromium binary. The launcher and `pdf.js` are configured to reuse the locally cached binary rather than downloading a new one. If the cache is moved or deleted, Puppeteer will fail with a clear error pointing to the binary path.

## 17. Key Project Files

- `server/index.js` — Express server, pipeline orchestration, route definitions
- `server/feeds/otx.js` — AlienVault OTX feed fetcher
- `server/feeds/cisa.js` — CISA KEV feed fetcher
- `server/feeds/abusech.js` — MalwareBazaar feed fetcher
- `server/normalise.js` — Feed normalisation into unified schema
- `server/prompt.js` — System prompt and user prompt builder
- `server/pdf.js` — Puppeteer PDF generation
- `server/reportTemplate.js` — HTML template for PDF
- `server/scheduler.js` — node-cron daily schedule
- `client/src/App.jsx` — Root app component and state management
- `client/src/App.css` — All styles
- `client/src/components/BriefingHeader.jsx`
- `client/src/components/ThreatBanner.jsx`
- `client/src/components/StatsRow.jsx`
- `client/src/components/ExecutiveSummary.jsx`
- `client/src/components/TopThreats.jsx`
- `client/src/components/CisaKEV.jsx`
- `client/src/components/Recommendations.jsx`
- `client/src/components/ExportButton.jsx`

## 18. Future Enhancements

Potential next steps:

- persistent briefing history with date-range navigation
- email delivery of daily briefing PDF
- Slack or Teams webhook for threat level alerts
- additional OSINT feeds: VirusTotal, Shodan, MISP
- NCA ECC control mapping for each CVE highlight
- IOC enrichment with WHOIS and geolocation data
- multi-language executive summary output
- Redis cache for production deployments
- user-configurable sector and country filters

## 19. Current Status

The project currently includes:

- working backend with three live OSINT feed integrations
- normalisation layer with GCC-targeted stats
- Claude API integration with structured JSON output and `<result>` tag parsing
- in-memory briefing cache
- on-demand and scheduled pipeline triggers
- React dashboard with all eight UI components
- Puppeteer PDF export using cached Chromium
- Windows single-click launcher
