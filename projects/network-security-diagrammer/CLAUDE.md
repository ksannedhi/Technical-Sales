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

A **local-first network security diagrammer** that converts natural language prompts into Excalidraw diagrams. Pattern-based topology inference runs entirely locally; OpenAI is optional for advanced prompt analysis and follow-up edits.

```
frontend/src/           React SPA — prompt input, Excalidraw canvas, follow-up chat
        ↕ REST (fetch via Vite proxy)
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
- **OpenAI optional** — if `OPENAI_API_KEY` is absent, the `/api/analyze` route falls back to regex-based pattern matching. The `/api/generate` and `/api/followup` routes require the key.
- **Excalidraw output** — generates native Excalidraw JSON that can be pasted directly into excalidraw.com or the desktop app.
- **Monorepo with workspaces** — `backend`, `frontend`, and `shared` are npm workspaces under the root `package.json`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8787` | Backend port |
| `OPENAI_API_KEY` | No | — | Enables AI-powered prompt analysis and generation |
| `OPENAI_MODEL` | No | `gpt-4.1-mini` | OpenAI model to use |

Copy `.env.example` → `.env` and add `OPENAI_API_KEY` for full functionality.

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
