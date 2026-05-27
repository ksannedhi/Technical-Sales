# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start both together (preferred):**
```bash
npm run dev  # concurrently runs backend + frontend
```

**Start backend only:**
```bash
npm run dev --workspace backend  # tsx watch — http://localhost:8787
```

**Start frontend only:**
```bash
npm run dev --workspace frontend  # Vite — http://localhost:5174
```

**Install dependencies:**
```bash
npm install  # installs all workspaces from root
```

**Health check:**
```bash
curl http://localhost:8787/api/health
```

## Architecture

A **local-first network and cybersecurity diagrammer** that converts natural language prompts into Excalidraw diagrams. Pattern-based topology inference runs entirely locally; Claude (via Anthropic API) is optional for prompt analysis, high-specificity architecture generation, and follow-up diagram edits.

```
frontend/src/           React SPA — prompt input, Excalidraw canvas, follow-up chat
        ↕ REST (fetch via Vite proxy → /api)
backend/src/index.ts    Express server — route registration
        ↓
backend/src/routes/
  analyze.ts            POST /api/analyze  — infer diagram type from prompt
  generate.ts           POST /api/generate — produce Excalidraw JSON from prompt
  followup.ts           POST /api/followup — refine existing diagram via follow-up
        ↓
shared/                 Types and schemas shared between backend and frontend
```

**Vite proxy:** All `/api` calls from the frontend are forwarded to `http://localhost:8787`. No CORS issues in dev.

## Key design decisions

- **TypeScript throughout** — backend uses `tsx watch` for hot-reload during dev; `tsc` for production builds.
- **Pattern-first inference** — base topology (star, mesh, hybrid, DMZ) is determined locally without AI, making the tool usable offline.
- **Claude optional** — if `ANTHROPIC_API_KEY` is absent, `/api/analyze` falls back to regex-based pattern matching and `/api/generate` falls back to local deterministic patterns. Claude Haiku is used for `/api/analyze`; Claude Sonnet for `/api/generate` (high-specificity prompts only) and `/api/followup`.
- **Excalidraw output** — generates native Excalidraw JSON that can be pasted directly into excalidraw.com or the desktop app.
- **Monorepo with workspaces** — `backend`, `frontend`, and `shared` are npm workspaces under the root `package.json`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8787` | Backend port |
| `ANTHROPIC_API_KEY` | No | — | Enables AI-powered prompt analysis and generation |
| `ANTHROPIC_ANALYZE_MODEL` | No | `claude-haiku-4-5-20251001` | Model for `/api/analyze` |
| `ANTHROPIC_GENERATE_MODEL` | No | `claude-sonnet-4-6` | Model for `/api/generate` and `/api/followup` |

Copy `.env.example` → `.env` and add `ANTHROPIC_API_KEY` for full functionality.

## Ports

| Service | Port |
|---------|------|
| Backend (Express/TypeScript) | `8787` |
| Frontend (Vite) | `5174` → proxies `/api` to `:8787` |

## Key project files

- `backend/src/index.ts` — Express server entry, route registration, CORS, port config
- `backend/src/routes/analyze.ts` — prompt classification (local pattern + optional AI)
- `backend/src/routes/generate.ts` — Excalidraw JSON generation from prompt
- `backend/src/routes/followup.ts` — diagram refinement via follow-up prompt
- `frontend/src/` — React SPA with Excalidraw integration and chat interface
- `frontend/vite.config.ts` — Vite config with `/api` proxy to `:8787` and shared alias
- `shared/` — shared TypeScript types and Zod schemas
- `.env.example` — environment variable template

## Non-goals

- Diagram persistence (no database — diagrams are exported by the user)
- Multi-user collaboration
- Production deployment (local-first tool)
- Vendor-specific diagram rendering (output is generic Excalidraw JSON)

## Diagram quality patterns

Accumulated learnings — apply when modifying generator, layout, or follow-up logic.

### Cache
- **Cache key is auto-hashed** — `generate-${GENERATION_HASH}-${LAYOUT_VERSION}` in `generate.ts`. `GENERATION_HASH` is a sha256 prefix of `GENERATION_SYSTEM_PROMPT_LINES`; it changes automatically whenever the system prompt is edited. Increment `LAYOUT_VERSION` (in `layoutArchitecture.ts`) for layout algorithm changes. Never manually bump a version string again.

### Pattern routing (`patternLibrary.ts` + `architectureGenerator.ts`)
- **`shouldUseModelFallback` is 5 clean conditions** — generic pattern / confidence < 0.8 / borderline (< 0.88 && analysis < 0.75) / `isComplexOrSpecific(prompt)` / arrow-chain with weak match. `VENDOR_AWARE_STATIC_PATTERNS` is gone — cloud platform names are inside `isComplexOrSpecific` and always route to Claude.
- **`minScore` per pattern** — unambiguous single-keyword patterns (ddos, siem, ndr, waf, sandbox, cloud-workload) have `minScore: 4` so score=4 reaches 0.88. Default is 5.
- **Pattern test regexes must use word boundaries** — broad alternates like `workload` or `visibility` create false positives against unrelated prompts. Every non-compound term needs `\b` guards or explicit phrase context.
- **Avoid duplicate terms in techCount regex** — each match inflates the tech count. Duplicate `siem` caused "SIEM + WAF + IPS" to reach the 4-tech threshold and route to Claude incorrectly.

### Static patterns (`buildScenarioArchitecture`)
- **Never place identity or monitoring components in a security-zone that also contains security-controls** — `enforceArchitecturalConstraints` Rules 1 & 2 will silently evict them to new auto-created zones, bloating the diagram. Give each a dedicated zone in the static template directly.
- **`"Allowed Traffic"` label is a quality red flag** — replace with specific protocol names (HTTPS, IPSec) or omit. System prompt already forbids it for Claude output; enforce the same in static patterns.
- **Bidirectional arrows between zones look cluttered** — model auth round-trips as one directional arrow (identity→app) rather than two. The response is implicit from the flow direction.

### Titles and summaries (`deriveTitle` / `deriveSummary`)
- **`deriveTitle` overwrites the static pattern title before `layoutArchitecture` runs** — Every new pattern needs entries in both `deriveTitle` and `deriveSummary`. The `preferredZoneOrders` table is now legacy; prefer setting `zone.order` directly in the static pattern.

### Layout (`layoutArchitecture.ts`)
- **`zone.order` drives sort — no more title matching** — All static patterns set `createZone(..., order)` (0, 1, 2…). `sortZones` checks `zones.some(z => z.order !== undefined)` and uses that directly. `preferredZoneOrders` is kept as legacy fallback for Claude-generated output only.
- **`zone.sortPriority`** — tie-break within the same `order` bucket. Set to 10 on monitoring zones (via system prompt instruction) so they render after enforcement zones of the same type. The `/monitor/i` label heuristic is the fallback for zones without `sortPriority`.
- **`arrowLabelPosition` uses exact zone geometry** — `destZoneTop` is passed from the connection renderer; label anchors at `destZoneTop + ZONE_PADDING_Y - TEXT_LINE_HEIGHT - 4`. No guessing from component Y.
- **`LAYOUT_VERSION` in `layoutArchitecture.ts`** — increment this string whenever layout algorithm changes. It is baked into the cache key automatically.
- **`routeArrow` upward path starts at `from.y` (top of box)** — correct for genuine upward connections but a visual surprise when it happens due to wrong zone ordering. Prevent wrong zone ordering rather than patching the arrow.
- **Same-row adjacent connections cannot carry labels** — COMPONENT_GAP_X is 42 px; a label needs ~150 px. `shouldRenderConnectionLabel` suppresses labels when gap < 80 px.
- **Arrow label width must be explicit in the layout seed** — formula: `Math.max(160, labelText.length * 12 + 24)`.

### Normalizer (`enforceArchitecturalConstraints`)
- **Rules 1 & 2 check `c.type`, not label regex** — `c.type === "security-control"` catches "Workload Protection", "CASB", "NDR Sensor" that label regexes would miss.
- **Rule 3 uses `zone.order` (or array index fallback)** — `zoneOrderIndex` is built from `z.order ?? i`. Do not use a separate semantic level map.
- **`enforceArchitecturalConstraints` must run in the followup route** — the followup route calls Claude directly without the generator. Without calling the normalizer on Claude's output, zone violations accumulate across edits.
- **`validateStaticPatterns()` runs at startup** — logs warnings for any monitoring+security-control zone mixing or isolated components across all 20 static patterns. Add this call to `index.ts` whenever a new static pattern is added.

### Follow-up (`applyFollowupInstruction`)
- **Handle removal instructions first and return early** — keyword-based add-blocks (waf, siem, log) run unconditionally. If removal detection runs after them and `changed=true`, the `!changed` gate blocks the removal. "Remove the WAF" was adding WAF instead of removing it.
- **Zone lookup must use `type`, not `id`** — `zones.find(z => z.id === "internal")` returns undefined for most patterns (partner-api, sandbox, zero-trust, etc.). Use `zone.type === "internal"` with a `"security-zone"` fallback, then `zones[zones.length - 1]`.

### Excalidraw rendering (`frontend/src/lib/excalidraw.ts`)
- **`convertToExcalidrawElements` ignores input width** — it re-measures with internal font metrics (5–15 px narrower than browser canvas). Post-process: override text element widths with layout-computed values after conversion.
- **`strokeStyle` must be passed explicitly for rectangles** — omitting it causes dashed-border components (logical constructs like VPN tunnels) to render solid.

## Model split and caching

- **Model split** — `ANTHROPIC_ANALYZE_MODEL` (default: haiku) for the lightweight `analyze` step; `ANTHROPIC_GENERATE_MODEL` (default: sonnet) for `generate` and `followup`. Sonnet is meaningfully more reliable for generating deeply nested Excalidraw JSON with cross-referenced IDs.
- **JSON fence stripping** — Claude ignores `response_format: json_object`. Strip defensively before `JSON.parse` in all three services: `content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim()`.
- **Cache key is fully automatic** — edit `GENERATION_SYSTEM_PROMPT_LINES` → `GENERATION_HASH` changes → cache busts. Increment `LAYOUT_VERSION` in `layoutArchitecture.ts` for layout changes. Model identity comes from `getModelCacheIdentity()`. Never manually edit a version string in `generate.ts`.
- **followup cache key includes full architecture object** — key = SHA-256 of `{ type, architecture, instruction, model }`. Different architecture + same instruction = different entry. Correct behaviour; slightly expensive on large objects, acceptable for a local demo tool.
