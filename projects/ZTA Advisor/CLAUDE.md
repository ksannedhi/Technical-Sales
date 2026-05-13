# ZTA Advisor — CLAUDE.md

## Ports
- Backend: 3005 (Node / Express ESM)
- Frontend: 5180 (Vite + React)

## Dev commands
```bash
# Backend
cd backend && npm install && node --watch server.js

# Frontend
cd frontend && npm install && npm run dev
```

## Environment
Copy `.env.example` → `backend/.env` and fill in `ANTHROPIC_API_KEY`.

PYTHONPATH is not needed (Node project).

## Architecture

```
frontend/src/
  App.jsx                   — step router (Profile → Assessment → Results)
  components/
    OrgProfile.jsx          — Step 1: org name, industry, size, geo → framework suggest
    QuestionnaireWizard.jsx — Step 2: 35-question unified bank, pillar-by-pillar
    ResultsPanel.jsx        — Step 3: gap table, roadmap, narrative, PDF export

backend/
  server.js                 — Express entry point (port 3005)
  routes/
    frameworks.js           — GET /api/frameworks, GET /api/frameworks/suggest?geo=
    questions.js            — GET /api/questions
    analyze.js              — POST /api/analyze  (scoring + Claude narrative)
    export.js               — POST /api/export/pdf (Puppeteer)
  data/
    frameworks.json         — framework definitions + geo mapping
    questions.json          — 35-question unified bank (6 pillars)
    controls.json           — gap-to-remediation control mapping
```

## Key conventions
- Scoring is fully deterministic — answers map to maturity 1–4 per pillar
- Claude API called **once** at the end of analysis (not per question)
- ANTHROPIC_API_KEY missing → narrative section omitted, rest of app still works
- Target maturity hardcoded to 3 (Advanced) — adjust `TARGET_MATURITY` in `analyze.js`
- Framework selection: geo → auto-suggest, always overridable by user
- No authentication, no session persistence — single-sitting PE tool

## Pillar order
identity → devices → networks → applications → data → visibility

## Adding questions
Edit `backend/data/questions.json`. Each question needs: id, pillar, sequence, text, rationale, options (array with value 1–4).

## Adding controls
Edit `backend/data/controls.json`. Keys are `"pillarId": { "N-to-N+1": [...] }`.
Each control: title, description, timeline (short/medium/long), priority (1–3).
