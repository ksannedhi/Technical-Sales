# Threat-to-Business Translator

Threat-to-Business Translator is a local-first MVP for converting technical security evidence into executive cyber risk narratives. It takes synthetic scenarios or optional customer-specific inputs such as CVEs, SOC alerts, and vulnerability scan-style reports, then translates them into quantified business impact, urgency, and recommended leadership actions.

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
- uploading a vulnerability scan style report

### Optional organization assumptions
Users can optionally apply assumptions such as revenue, employee count, security maturity, internet exposure, regulatory sensitivity, and crown jewel dependency.

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

## Tech stack

### Frontend
- React
- Vite

### Backend
- FastAPI
- deterministic scoring and enrichment services

### Data
- synthetic enterprise graph stored as JSON

## Project structure

```text
Threat-to-Business Translator/
|- backend/
|  |- app/
|  |- data/
|  \- requirements.txt
|- docs/
|  \- SPECS.md
|- frontend/
|- Launch Threat-to-Business Translator.cmd
|- launch.ps1
\- README.md
```

## Getting started

### Option 1: one-click launcher
Double-click `Launch Threat-to-Business Translator.cmd` from the project root.

The launcher will:
- create the backend virtual environment if needed
- install backend requirements if missing
- install frontend packages if missing
- open backend and frontend windows

### Option 2: manual run

#### Backend

```powershell
cd "C:\Users\ksann\Downloads\Threat-to-Business Translator\backend"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend

```powershell
cd "C:\Users\ksann\Downloads\Threat-to-Business Translator\frontend"
npm install
npm run dev
```

### Local URLs
- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000`

## API overview

- `GET /health`
- `GET /api/default-profile`
- `GET /api/scenarios`
- `GET /api/translate/{scenario_id}`
- `POST /api/analyze`

## Documentation

- Product specs: [docs/SPECS.md](docs/SPECS.md)

## Current limitations

- Ad hoc analysis uses heuristic classification.
- Upload support is currently text-first and best suited for `.txt`, `.csv`, `.json`, `.xml`, and `.log` files.
- No PDF/XLSX ingestion yet.
- No persistence or saved project history yet.
- No export to PDF or slide format yet.

## GitHub readiness notes

Before publishing, consider adding:
- screenshots or GIFs of the UI
- a license
- a `.gitignore` if not already present
- example inputs under a safe sample-data folder
- issue templates or contribution guidance if the repo will be collaborative