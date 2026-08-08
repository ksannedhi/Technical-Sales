# CLAUDE.md

This file provides guidance to Claude Code when working from the `Downloads` directory.

> Also read `MEMORY.md` in this directory before starting any task.

## What lives here

A Claude Code skill for presales bid drafting and 10 standalone cybersecurity presales tools, each in its own folder. Every standalone has a synced copy in the GitHub repo under `Technical-Sales\projects\<project-name>\`.

## Skill

| Skill | Path | Invoke |
|---|---|---|
| `autonomous-presales-engineer` | `skills/presales-skills` | `/autonomous-presales-engineer` or `/presales-skills:draft-bid-pack` |

Generates first-pass SoW, HLD, and Technical Proposal (Markdown + DOCX) from a customer RFP, vendor documentation, and a gold proposal. See `skills/presales-skills/README.md` for setup.

## Standalone projects

| Folder name | Backend | Port | Frontend | Port |
|---|---|---|---|---|
| `soc-twin` | Node / Express | 3001 | Vite + React | 5173 |
| `network-security-diagrammer` | Node (Cloudflare Workers style) | 8787 | Vite + React | 5174 |
| `phishing-analyzer` | Node / Express | 3002 | Vite + React | 5175 |
| `security-controls-gap-analyzer` | Python / FastAPI | 8010 | Vite + React | 5176 |
| `threat-briefing` | Node / Express + Puppeteer | 3003 | Vite + React | 5177 |
| `threat-to-business-translator` | Python / FastAPI | 8000 | Vite + React | 5178 |
| `presales-deal-reviewer` | Python / wsgiref | 8020 | Server-rendered HTML | — |
| `vendor-advisor` | Python / Streamlit | 8501 | Streamlit | — |
| `regulatory-lens` | Node / Express (ESM) | 3004 | Vite + React | 5179 |
| `zta-advisor` | Node / Express (ESM) | 3005 | Vite + React | 5180 |

All standalone folder names match their `projects/` counterparts in the repo exactly.

## Editing workflow (critical)

**Always edit the standalone first, then sync to the repo — never the other way around.**

1. Make changes in the standalone folder here under `Downloads\`
2. Robocopy to the repo
3. Commit and push from the repo

**Robocopy syntax (must use `cmd.exe /c` — bash interprets `/E` as a path):**
```bash
cmd.exe /c "robocopy \"<Downloads>\<project>\" \"<Downloads>\Technical-Sales\projects\<project>\" /E /XD __pycache__ .git node_modules /XF *.pyc *.pyo .env"
```

## Key conventions

- **No external AI API** in `presales-deal-reviewer` and `vendor-advisor` — fully local/offline
- **PYTHONPATH=src** required for all Python projects before running or testing
- **Ports are unique** — no two services share a port; see table above before adding new servers
- **`.env` files are not committed** — each project has a `.env.example` template
- **No absolute paths in docs** — READMEs, SPECS, and CLAUDE.md files must not contain machine-specific paths or usernames
- **`PUPPETEER_EXECUTABLE_PATH`** — set in `.env` if Puppeteer can't auto-detect Chrome; never hardcode in docs
- **`cmd.exe /c "robocopy ..."`** — never bare `robocopy` in bash

## Dev server launch config

`.claude\launch.json` in this directory — all 18 server configurations (backend + frontend for each project). Used by Claude Code's preview tool.

## Per-project documentation

Each standalone has its own `CLAUDE.md` with commands, architecture, and key files. The repo's root `CLAUDE.md` is at `Technical-Sales\CLAUDE.md`.

## Session-end checklist (mandatory — do not skip)

At the end of **every** session, before closing:

1. **Update `Downloads\MEMORY.md`** — add any new rules, patterns, decisions, or corrections that would be useful in a future session. This is the cross-project memory file. It is separate from the per-project `.claude\projects\...\memory\MEMORY.md` — both must be updated.
2. **Put each learning in the right store** — see "Where knowledge goes" at the top of `Downloads\MEMORY.md` before writing anything down. Project-specific patterns go in that project's `CLAUDE.md`, never in `MEMORY.md`; never restate a CLAUDE.md rule in `MEMORY.md`.
3. **Sync and push** — confirm the repo is up to date with all changes made during the session.

`Downloads\MEMORY.md` is the most commonly skipped step. It must be updated even when the user does not ask.
