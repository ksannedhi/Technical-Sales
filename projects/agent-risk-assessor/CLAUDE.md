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

# Browser tests (about 45 s): builds the frontend, starts a second backend on :3099 with no API key,
# drives it with Puppeteer + installed Chrome, removes the build afterwards. Run before UI changes ship.
cd backend && npm run test:ui
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
    ai-rmf.json      NIST AI RMF subcategory text + report-level evidence (a footnote; same in every report)
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
- **A control that restates an Architecture answer follows that answer, never its checkbox.** It carries `setBy` in `controls.json`; `effectiveControls()` decides whether it is in place, the Controls page shows it read-only, and Path to Go offers it as an architecture change that edits the answer (`setBy.fix`). `per_user_identity` holds only when every identity is `per_user` and no users are `public`; `human_approval` holds only when oversight is suggest-only, approve-each, or approve-high-risk. Otherwise the two can contradict, and a shared-account or fully autonomous agent gets credit it hasn't earned.
- **A fully autonomous agent with any high-impact action is capped at Go with conditions.** Because `human_approval` follows the oversight answer, only changing that answer clears it. A test enforces this.
- **Contradictory answers resolve towards the riskier reading** (`normaliseAnswers()`): a data type sets a minimum level from CITRA's Data Classification Policy examples (`LEVEL_FLOORS`: personal 2, health 3, credentials 4; financial 3 is this tool's judgement), shown as "Data scored as Level N" on the results and the PDF. Personal data reaches the Kuwait residency rule through §4.2.1.1.3, not through its level, and T-LEAK-01 fires on personal data directly, a model vendor's API counts as an outside component, a Mailbox or Public web source counts as reading content outsiders wrote, and "Suggests only" oversight with any action beyond reading and drafting is read as approve-each. The Architecture page warns on the first and third and blocks the second and fourth; the results and the PDF list every adjustment (`answerAdjustments()`). A customer- or public-facing agent with no data types gets a soft warning only, since the tool can't know.
- **Controls with `appliesWhen` count only for designs they fit** (a sandbox needs code execution, memory safeguards need persistent memory; conditions may use flags such as `untrustedContent`). "People see the source" applies to approvals and also to suggest-only agents that read outsider content, because people act on the agent's summary either way (T-TRU-01 fires for both). Ticked when they don't fit, they are listed as not applicable, count for nothing, and are never recommended as gaps.
- **"Lethal trifecta" is AI-security jargon, not a regulatory term.** Reader-facing output uses it only on the summary card (web and PDF), always with its explanation, the meaning of the status (Open — data can leak / Blocked / Not present; not "Unbroken / Broken", which non-specialists read as reassuring), and its source. All explanatory wording lives in `TRIFECTA_TEXT` in `engine.js`, so the web page and the PDF can't drift. Blockers, threat descriptions, and the brief's input say "data-leak path" in plain language.
- **No ID or clause from memory.** Every OWASP, ASI, ATLAS, AI RMF ID and every regulatory clause must be checked against the source and recorded in `SOURCES.md`. Loose fits get an empty list, not an approximate ID. Unverifiable instruments go in `residency.json` → `pending` and produce no findings. ISO/IEC 42001 is pending because its text is paywalled.
- **A what-if never overwrites the actual design.** "Try this path" layers changes in a separate `whatIf` state. Any export from it must stay labelled what-if (title, filename, page-1 banner, Appendix A, CSV `basis` column): a report claiming controls that aren't in place is the one output this tool must never produce.
- **A selected jurisdiction with no rules is never silent.** `assess()` adds NA-01 ("Not assessed", High weight) naming every selected jurisdiction that has no rules in `residency.json` (today Bahrain, Oman, and "Outside the GCC"). It caps the verdict at Go with conditions and appears in Path to Go as a review step for Go. When rules for a jurisdiction are added, it drops out automatically.
- **Residency Critical findings are architecture changes, not controls.** `pathToGo` applies a rule's `architectureFix` hypothetically; High findings are approvals (waived only for the Go target, and listed).

## Question design
Every question except the free-text profile fields is required. Where nothing may apply, give the multi-select an explicit `none` option (exclusive in the UI, matched by no rule) instead of making it optional: a skipped question silently drops the findings it drives. A test checks that `none` exists and triggers nothing.

Default a new question to multi-select; real agents mix audiences, identities, hosting, and regions. Use single only when the question is inherently one value (sector, *highest* classification, *weakest* oversight). Multi answers score as the worst case: `in` matches any selected value, `anyNotIn` fires if any value falls outside the list (residency), and `scaleOf` takes the highest scale.

## Scoring
Residual = inherent severity − number of mitigating controls in place, floored at 1. Every control counts the same — a known simplification, stated in the README. Blast radius = max action scale × autonomy scale × data sensitivity, normalised to 100. It carries a band (`BLAST_BANDS` in `engine.js`, on the raw product: Low ≤ 8, Moderate ≤ 27, High ≤ 47, Severe above) and the single answer change that lowers it most; the verdict never uses either.

## Regulatory scope, not just clause IDs
Check a clause's **scope** in the primary text, not only its number. CORF 7.2 and CITRA 4.2.1.2 cover public, community, and hybrid cloud, not private cloud; CORF 7.2.1.3 applies only where sensitive data is involved. An earlier rule widened the CBK approval to private cloud from a compiled summary and was wrong. `hosting` keeps `private_cloud` and `hybrid_cloud` as separate options for this reason.

## Data files are read at startup
`node --watch` restarts on `.js` changes only. After editing anything in `backend/data/`, restart the backend (or touch `engine.js`) before testing in the UI.

## Backend restarts drop requests
`node --watch` restarts the backend on any change, and on Windows sometimes with no change at all; the Vite proxy turns the dropped request into a 500. `Results.jsx` retries `/api/assess` and `/api/brief` on 500 or a network error only. Keep it that way: `/api/brief` returns 502 for a real model failure, and retrying that would call Claude again.

## Adding a threat or rule
Add it to the data file, then run `npm test` — the suite checks every field, option, control, and mapping ID the rule references. If you add a preset, give it an `expectedVerdict`.

## Claude call
- Model defaults to `claude-opus-5-5` ($4 / $20 per MTok), overridable with `CLAUDE_MODEL`. Effort is set explicitly to `medium`; thinking can't be disabled on this model, and its tokens bill as output. A bank-preset brief measured 2,065 in / 605 out, about $0.02. [model-behavior · 2026-10]
- **Every brief is a paid call, so it is never repeated for the same input.** `writeBrief` caches by a hash of model + prompt and merges concurrent requests; the frontend also remembers briefs per design for the tab; a what-if gets a brief only when the user clicks for one. The backend logs tokens and approximate cost per call (`PRICES` in `narrative.js`), and `GET /api/brief/stats` returns the running totals. A 2026-10 audit found 6 calls for 2 distinct designs in one ordinary session before this.
- **Current vs target** (PDF): `pathTarget()` applies the furthest reachable Path-to-Go step (architecture fixes, derived-control answer changes, its controls, its approvals treated as granted) and the report compares it with the actual design. It is labelled a projection, and what-if exports don't get one.
- **Browser tests must fail when the behaviour breaks.** When adding one, break the feature it covers once and confirm the test goes red; an early scroll test passed vacuously because the page was never scrolled.
- **Automated UI runs must stub `/api/brief`** (Puppeteer `setRequestInterception`, respond with a fixed brief). Screenshot and UI-check scripts opening Results otherwise pay for a brief on every run.
- Uses the beta server-side fallback (`fallbacks: "default"`, header `server-side-fallback-2026-07-01`) because security content can trip safety classifiers; `stop_reason: "refusal"` still returns `null` and the UI says the brief couldn't be generated. [model-behavior · 2026-10]
- `max_tokens: 16000` is set explicitly; the SDK requires it. [model-behavior · 2026-10]
- The brief uses structured output (`output_config.format`, JSON schema): `{ decision, reasons[{headline, detail}], actions[] }`, rendered as decision → Why → Before go-live in both the UI and the PDF. Invalid JSON or a refusal returns `null`. [model-behavior · 2026-10]
- The brief input includes advisory checks and the top recommended controls. For a Go verdict the actions are the advisory checks plus recommendations, labelled "Recommended before go-live" and never described as required; the system prompt forbids governance steps the assessment doesn't contain (an earlier Go brief invented "formally accept the risks" and "assign an owner" while omitting the CITRA licence check).
- The system prompt forbids claiming an approval or basis is *missing*: regulatory findings are requirements. An earlier free-text brief said "no transfer basis is in place", which the assessment never established.

## Express 5
Express 5 rejects bare wildcard paths: `app.get('*', …)`, common in Express 4 code and examples, crashes the server at startup. The SPA fallback uses a regex that excludes `/api/` (`/^(?!\/api\/).*/`); keep it that way when adding routes.
