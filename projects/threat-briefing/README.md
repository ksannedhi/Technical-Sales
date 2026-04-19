# Threat Intel Briefing Builder

AI-powered daily threat intelligence briefing tool for enterprise security teams in the GCC region.

## What It Does

- Pulls live OSINT data from AlienVault OTX, CISA KEV, and Abuse.ch MalwareBazaar
- Normalises all feed data into a unified schema with GCC-specific stats
- Sends it to the Claude API for AI synthesis into a structured JSON briefing
- Displays the briefing in a React dashboard with threat level, top threats, CVE highlights, and recommendations
- Exports a polished PDF report via Puppeteer
- Runs automatically every day at 06:00 AST via node-cron
- Persists briefings to disk and auto-generates on startup if the saved briefing is stale or missing

## Documentation

- Full product and architecture spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Stack

- React 18 + Vite frontend
- Node.js + Express backend
- Anthropic Claude API (`claude-haiku-4-5-20251001`) for AI synthesis
- Puppeteer for server-side PDF generation
- node-cron for daily scheduling

## Getting Started

1. Copy `.env.example` to `.env`
2. Add your `ANTHROPIC_API_KEY`
3. Optionally add your `OTX_API_KEY` — the app works without it, OTX feed is skipped gracefully
4. Start the app in one click:
   - Double-click `Launch Threat Briefing.cmd`
5. This opens separate backend and frontend windows
6. Open the dashboard at:
   - `http://localhost:5177`
7. On first launch the pipeline runs automatically — no need to click Generate latest

Alternative terminal flow:

```bash
npm install
npm run dev
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:5177` | React dashboard |
| `http://localhost:3003/api/briefing/latest` | Cached briefing JSON |
| `http://localhost:3003/api/briefing/generate` | Trigger on-demand generation (POST) |
| `http://localhost:3003/api/briefing/export` | PDF export (POST) |
| `http://localhost:3003/api/health` | Health check |

## Scheduling and Startup Behaviour

The daily pipeline runs automatically at **06:00 AST** via node-cron using the system clock. No manual action is needed once the server is running.

On every startup the server checks `server/briefing.json`:

| Condition | Behaviour |
|-----------|-----------|
| No file exists | Pipeline runs immediately |
| File exists, age < 24h | Loaded into cache and served instantly |
| File exists, age ≥ 24h | Catch-up pipeline runs immediately |
| File exists, age ≥ 24h | Stale briefing served immediately; catch-up pipeline runs in background |
| Catch-up pipeline fails | Stale briefing continues to be served until next successful run |

This means the server is always ready to serve a briefing immediately after restart, even if it was down for multiple days.

## Data Sources

- **AlienVault OTX** — threat intelligence pulses from the last 24 hours (requires `OTX_API_KEY`)
- **CISA Known Exploited Vulnerabilities** — CVEs added in the last 24 hours (public, no key needed)
- **Abuse.ch MalwareBazaar** — 100 most recent malware samples (public, no key needed)

## Regional Focus

Briefings are tuned for the GCC region. The model prioritises threats targeting Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, and Oman — including GCC-relevant threat actors such as APT33, APT34, OilRig, and Lazarus, and sectors such as financial services, oil and gas, and government.

## PDF Export

Click **Export PDF report** in the dashboard to generate and download a formatted A4 PDF. The report includes the threat level banner, analyst summary, top threats table, CISA KEV highlights, and recommended actions.

If the export fails with a connection error on the first attempt after a server restart, click the button again — it will succeed. This is a one-off Puppeteer cold-start delay: Chrome takes a few extra seconds to launch the first time, which can cause the request to time out. Subsequent exports in the same session are unaffected.

## Understanding 0 values in the dashboard

The four feed stat counters (OTX pulses, CISA KEV added, Malware samples, GCC relevance) reflect exactly what the feeds returned during the last pipeline run. Seeing 0 in one or more counters is normal and does not indicate a fault.

| Counter | Why it may show 0 |
|---------|-------------------|
| OTX pulses | No subscribed pulses were modified in the last 24 hours — a genuine quiet period |
| OTX pulses | OTX rate-limited the request after a manual generate was triggered too soon after a previous one. Wait ~15 minutes before generating again |
| CISA KEV added | CISA does not publish new KEVs every day — 0 is correct on quiet days |
| Malware samples | MalwareBazaar API returned an error (e.g. HTTP 401). Check the backend terminal for `[Abuse.ch] Feed error` |
| GCC relevance | No high-priority signals matched GCC countries in this run — reflects the actual threat landscape |

A briefing with all-zero counters is still valid. Claude generates a low-activity summary rather than failing, and the threat level accurately reflects the available data. The executive and analyst summaries remain meaningful even when feed counts are low.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | From [console.anthropic.com](https://console.anthropic.com) |
| `OTX_API_KEY` | No | From [otx.alienvault.com](https://otx.alienvault.com) |
| `PORT` | No | Server port, defaults to `3003` |
| `PUPPETEER_EXECUTABLE_PATH` | No | Override Chrome path if not using default cache location |
| `TZ` | No | Set to `Asia/Kuwait` (pre-filled in `.env.example`) — pins process clock so the daily cron fires at 06:00 AST on any host timezone |
