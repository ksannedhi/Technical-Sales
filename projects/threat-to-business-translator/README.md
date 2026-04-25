# Threat-to-Business Translator

Threat-to-Business Translator is a local-first MVP that converts technical security evidence into executive cyber risk narratives. It supports built-in synthetic scenarios as well as optional customer-specific inputs such as CVEs, SOC alerts, and vulnerability scan reports, then translates them into quantified business impact, urgency, and recommended leadership actions.

## Why this project exists

Security evidence is usually technical, fragmented, and difficult to communicate to executives. This project is designed to bridge that gap by translating technical findings into:
- business impact narratives
- quantified loss and downtime ranges
- urgency and confidence scoring
- mitigation-oriented summaries
- board-friendly risk framing

## Current capabilities

### Scenario library

The app includes five built-in synthetic scenarios that can be explored without any customer input.

### Optional customer-specific analysis

Users can optionally tailor the output by:
- pasting a CVE description
- pasting a SOC alert or incident summary
- uploading a vulnerability scan report
- naming the affected business service (free-text field — helps map the input to the right business unit and revenue context when the CVE text alone is ambiguous)

Supported upload formats:
- `.pdf`
- `.txt`
- `.csv`
- `.json`
- `.log`

### Optional organization assumptions

Users can optionally apply assumptions such as:
- annual revenue
- employee count
- internet exposure
- security maturity
- regulatory sensitivity
- crown jewel dependency

### Executive output

Each report currently includes:
- leadership headline
- executive summary
- business context
- impact band
- risk reduction if fixed
- exposure profile bars
- scoring rationale
- recommended actions
- downloadable markdown export

### Scan report workflow

When a scan report contains multiple findings, the app now:
- parses individual findings
- maps each finding to the closest synthetic scenario pattern
- generates per-finding summaries
- generates a report-level roll-up for leadership

## Tech stack

### Frontend
- React
- Vite

### Backend
- FastAPI
- deterministic scoring and enrichment services

### Data
- synthetic enterprise graph stored as JSON

## Getting started

### Option 1: one-click launcher

Double-click `Launch Threat-to-Business Translator.cmd` from the project root.

The launcher will:
- create the backend virtual environment if needed
- install backend requirements if missing
- install frontend packages if missing
- open backend and frontend in separate PowerShell windows

### Option 2: manual run

#### Backend

```powershell
cd ./backend
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend

```powershell
cd ./frontend
npm install
npm run dev
```

### Environment configuration

The frontend reads the API base from `VITE_API_URL` and falls back to `http://127.0.0.1:8000` for local development.

To override it:

```powershell
cd ./frontend
Copy-Item .env.example .env
```

Then edit `.env` as needed:

```text
VITE_API_URL=http://127.0.0.1:8000
```

### Local URLs
- UI: `http://127.0.0.1:5178`
- API: `http://127.0.0.1:8000`

## API overview

- `GET /health`
- `GET /api/default-profile`
- `GET /api/scenarios`
- `GET /api/translate/{scenario_id}`
- `POST /api/analyze`

## Documentation

- Product specs: [SPECS.md](SPECS.md)

## Current limitations

- Ad hoc analysis still uses heuristic template matching rather than a trained classifier.
- Dollar estimates are synthetic and directional, not benchmark-calibrated.
- Scenario and matcher configuration are still data/code driven rather than editable in the UI.
- No persistence or saved project history yet.
- No PDF or slide-deck board-pack export yet.

