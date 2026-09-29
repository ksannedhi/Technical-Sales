# Agent Risk Assessor — CLAUDE.md

Presales tool: describe an AI agent deployment, get a threat register, GCC residency findings, a path to Go, and a production-readiness verdict (Go / Go with conditions / Not yet).

## Ports
- Backend: 3006 (Node / Express 5, ESM)
- Frontend: 5181 (Vite + React)

## Commands
```bash
# Backend (PUPPETEER_SKIP_DOWNLOAD=true on first install — PDF uses installed Chrome)
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev

# Engine tests — must pass before any data-file change is committed
cd backend && npm test
```
Or double-click `Launch Agent Risk Assessor.cmd`. `.env` lives at the project root and is optional (`--env-file-if-exists`); without `ANTHROPIC_API_KEY` only the brief is disabled.

## Architecture
```
backend/
  engine.js        assess(), pathToGo(), riskRegister() — all deterministic, no AI
  narrative.js     the only Claude call: risk-committee brief from the assessment
  report.js        HTML for the PDF export
  server.js        /api/inputs, /controls, /scenarios, /assess, /brief, /export/pdf, /export/register
  data/
    inputs.json      questions and option scale values
    threats.json     threat rules (when-clause DSL), severity, OWASP/ASI/ATLAS, mitigating controls
    controls.json    control catalogue with ATLAS mitigation and NIST AI RMF mappings
    residency.json   GCC jurisdiction rules with verified clause citations; `pending` = unverified
    ai-rmf.json      NIST AI RMF subcategory text + which report outputs evidence which subcategory
    scenarios.json   three fictional presets with expected verdicts (tested)
    SOURCES.md       where every ID and clause was checked
  test/engine.test.js
frontend/src/
  App.jsx          steps: Profile → Architecture → Controls → Results; sessionStorage state
  components/      Field (renders any inputs.json question), ControlsStep, Results
```

## Rules that must not be weakened
- **The verdict never comes from Claude.** Claude writes the brief from the finished assessment and is told not to add findings. If the brief and the engine disagree, the engine is right.
- **Guardrails alone never break the lethal trifecta.** Only `egress_restriction`, `untrusted_tool_restriction`, suggest-only autonomy, or approve-each with `approval_transparency` do. A test enforces this.
- **Audit logging is required for Go**, whatever the scores.
- **No ID or clause from memory.** Every OWASP, ASI, ATLAS, AI RMF ID and every regulatory clause must be checked against the source and recorded in `SOURCES.md`. Loose fits get an empty list, not an approximate ID. Unverifiable instruments go in `residency.json` → `pending` and produce no findings. ISO/IEC 42001 is pending because its text is paywalled.
- **Residency Critical findings are architecture changes, not controls.** `pathToGo` applies a rule's `architectureFix` hypothetically; High findings are approvals (waived only for the Go target, and listed).

## Question design
Default a new question to multi-select; real agents mix audiences, identities, hosting, and regions. Use single only when the question is inherently one value (sector, *highest* classification, *weakest* oversight). Multi answers score as the worst case: `in` matches any selected value, `anyNotIn` fires if any value falls outside the list (residency), and `scaleOf` takes the highest scale.

## Scoring
Residual = inherent severity − number of mitigating controls in place, floored at 1. Every control counts the same — a known simplification, stated in the README. Blast radius = max action scale × autonomy scale × data sensitivity, normalised to 100.

## Adding a threat or rule
Add it to the data file, then run `npm test` — the suite checks every field, option, control, and mapping ID the rule references. If you add a preset, give it an `expectedVerdict`.

## Claude call
- Model defaults to `claude-opus-5`, overridable with `CLAUDE_MODEL`. [model-behavior · 2026-09]
- Uses the beta server-side fallback (`fallbacks: "default"`, header `server-side-fallback-2026-07-01`) because security content can trip safety classifiers; `stop_reason: "refusal"` still returns `null` and the UI says the brief couldn't be generated. [model-behavior · 2026-09]
- `max_tokens: 16000` is set explicitly; the SDK requires it. [model-behavior · 2026-09]
- The brief uses structured output (`output_config.format`, JSON schema): `{ decision, reasons[{headline, detail}], actions[] }`, rendered as decision → Why → Before go-live in both the UI and the PDF. Invalid JSON or a refusal returns `null`. [model-behavior · 2026-09]
- The system prompt forbids claiming an approval or basis is *missing*: regulatory findings are requirements. An earlier free-text brief said "no transfer basis is in place", which the assessment never established.

## Express 5
Express 5 rejects bare wildcard paths: `app.get('*', …)`, common in Express 4 code and examples, crashes the server at startup. The SPA fallback uses a regex that excludes `/api/` (`/^(?!\/api\/).*/`); keep it that way when adding routes.
