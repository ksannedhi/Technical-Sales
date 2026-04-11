# Threat Intel Briefing Builder

AI-powered daily threat intelligence briefing tool for enterprise security teams in the GCC region.

## What It Does

- Pulls live OSINT data from AlienVault OTX, CISA KEV, and Abuse.ch MalwareBazaar
- Normalises all feed data into a unified schema with GCC-specific stats
- Sends it to the Claude API for AI synthesis into a structured JSON briefing
- Displays the briefing in a React dashboard with threat level, top threats, CVE highlights, and recommendations
- Exports a polished PDF report via Puppeteer
- Runs automatically every day at 06:00 GST via node-cron

## Documentation

- Full product and architecture spec: [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md)

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
   - `http://localhost:5173`
7. Click **Generate now** to run the pipeline on demand

Alternative terminal flow:

```bash
npm install
npm run dev
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:5173` | React dashboard |
| `http://localhost:3001/api/briefing/latest` | Cached briefing JSON |
| `http://localhost:3001/api/briefing/generate` | Trigger on-demand generation (POST) |
| `http://localhost:3001/api/briefing/export` | PDF export (POST) |
| `http://localhost:3001/api/health` | Health check |

## Scheduling

The daily pipeline runs automatically at **06:00 GST (03:00 UTC)**. No manual action is needed once the server is running.

## Data Sources

- **AlienVault OTX** — threat intelligence pulses from the last 24 hours (requires `OTX_API_KEY`)
- **CISA Known Exploited Vulnerabilities** — CVEs added in the last 24 hours (public, no key needed)
- **Abuse.ch MalwareBazaar** — 100 most recent malware samples (public, no key needed)

## Regional Focus

Briefings are tuned for the GCC region. The model prioritises threats targeting Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, and Oman — including GCC-relevant threat actors such as APT33, APT34, OilRig, and Lazarus, and sectors such as financial services, oil and gas, and government.

## PDF Export

Click **Export PDF report** in the dashboard to generate and download a formatted A4 PDF. The report includes the threat level banner, analyst summary, top threats table, CISA KEV highlights, and recommended actions.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | From [console.anthropic.com](https://console.anthropic.com) |
| `OTX_API_KEY` | No | From [otx.alienvault.com](https://otx.alienvault.com) |
| `PORT` | No | Server port, defaults to `3001` |
