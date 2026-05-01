# CLAUDE.md

This file provides guidance to Claude Code when working from the `Downloads` directory.

> Also read `MEMORY.md` in this directory before starting any task.

## What lives here

9 standalone cybersecurity presales tools, each in its own folder. Every standalone has a synced copy in the GitHub repo under `Technical-Sales\projects\<project-name>\`.

## Standalone projects

| Folder name                       | Backend port | Frontend port |
|-----------------------------------|--------------|---------------|
| `soc-twin`         | 3001         | 5173          |
| `network-security-diagrammer`     | 8787         | 5174          |
| `phishing-analyzer`               | 3002         | 5175          |
| `security-tools-mapping-navigator`| 8010         | 5176          |
| `threat-briefing`                 | 3003         | 5177          |
| `threat-to-business-translator`   | 8000         | 5178          |
| `presales-deal-gating`            | 8020         | —             |
| `multi-vendor-decision-copilot`   | 8501         | —             |
| `regulatory-lens`                 | 3004         | 5179          |

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

## Stack summary

| Project                           | Backend                        | Frontend             |
|-----------------------------------|--------------------------------|----------------------|
| `soc-twin`         | Node / Express                 | Vite + React         |
| `network-security-diagrammer`     | Node (Cloudflare Workers style)| Vite + React         |
| `phishing-analyzer`               | Node / Express                 | Vite + React         |
| `security-tools-mapping-navigator`| Python / FastAPI               | Vite + React         |
| `threat-briefing`                 | Node / Express + Puppeteer     | Vite + React         |
| `threat-to-business-translator`   | Python / FastAPI               | Vite + React         |
| `presales-deal-gating`            | Python / wsgiref               | Server-rendered HTML |
| `multi-vendor-decision-copilot`   | Python / Streamlit             | Streamlit            |
| `regulatory-lens`                 | Node / Express (ESM)           | Vite + React         |

## Key conventions

- **No external AI API** in `presales-deal-gating` and `multi-vendor-decision-copilot` — fully local/offline
- **PYTHONPATH=src** required for all Python projects before running or testing
- **Ports are unique** — no two services share a port; see table above before adding new servers
- **`.env` files are not committed** — each project has a `.env.example` template
- **No absolute paths in docs** — READMEs, SPECS, and CLAUDE.md files must not contain machine-specific paths or usernames
- **`PUPPETEER_EXECUTABLE_PATH`** — set in `.env` if Puppeteer can't auto-detect Chrome; never hardcode in docs
- **`cmd.exe /c "robocopy ..."`** — never bare `robocopy` in bash

## Dev server launch config

`.claude\launch.json` in this directory — all 16 server configurations (backend + frontend for each project). Used by Claude Code's preview tool.

## Per-project documentation

Each standalone has its own `CLAUDE.md` with commands, architecture, and key files. The repo's root `CLAUDE.md` is at `Technical-Sales\CLAUDE.md`.

## Session-end checklist (mandatory — do not skip)

At the end of **every** session, before closing:

1. **Update `Downloads\MEMORY.md`** — add any new rules, patterns, decisions, or corrections that would be useful in a future session. This is the cross-project memory file. It is separate from the per-project `.claude\projects\...\memory\MEMORY.md` — both must be updated.
2. **Sync and push** — confirm the repo is up to date with all changes made during the session.

`Downloads\MEMORY.md` is the most commonly skipped step. It must be updated even when the user does not ask.
