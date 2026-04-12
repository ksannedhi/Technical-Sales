# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What this repo is

A collection of 8 local cybersecurity presales tools. Each lives as both:
- A **standalone project** under `C:\Users\ksann\Downloads\<project-name>\`
- A **synced copy** under `projects/<project-name>\` in this repo

The repo is the deployable/shareable mirror. All edits go to the standalone first.

## Editing workflow (critical)

**Always follow this order — never edit the repo copy directly:**

1. Make changes in the standalone under `C:\Users\ksann\Downloads\<project-name>\`
2. Robocopy the standalone into this repo
3. Commit and push

**Robocopy syntax (must use `cmd.exe /c` — bash interprets `/E` as a path):**
```bash
cmd.exe /c "robocopy \"C:\Users\ksann\Downloads\<standalone>\" \"C:\Users\ksann\Downloads\Technical-Sales\projects\<project>\" /E /XD __pycache__ .git node_modules /XF *.pyc *.pyo"
```

## Projects and ports

| Project (repo `projects/`)        | Standalone (`Downloads/`)              | Backend port | Frontend port |
|-----------------------------------|----------------------------------------|--------------|---------------|
| `live-soc-twin-field-sku`         | `live-soc-twin-field-sku`              | 3001         | 5173          |
| `network-security-diagrammer`     | `network-security-diagrammer`          | 8787         | 5174          |
| `phishing-analyzer`               | `phishing-analyzer`                    | 3002         | 5175          |
| `security-tools-mapping-navigator`| `security-tools-mapping-navigator`     | 8010         | 5176          |
| `threat-briefing`                 | `threat-briefing`                      | 3003         | 5177          |
| `threat-to-business-translator`   | `Threat-to-Business Translator`        | 8000         | 5178          |
| `presales-deal-gating`            | `presales-deal-gating`                 | 8020         | —             |
| `multi-vendor-decision-copilot`   | `multi-vendor-decision-copilot`        | 8501         | —             |

Note: `Threat-to-Business Translator` has spaces in the standalone folder name — all other standalones match their repo folder names exactly.

## Dev server launch config

Stored locally at `C:\Users\ksann\Downloads\.claude\launch.json` — **not tracked in this repo** (machine-specific absolute paths). Gitignored under `.claude/`.

## Stack summary

| Project                         | Backend              | Frontend       |
|---------------------------------|----------------------|----------------|
| live-soc-twin-field-sku         | Node / Express       | Vite + React   |
| network-security-diagrammer     | Node (Cloudflare Workers style) | Vite + React |
| phishing-analyzer               | Node / Express       | Vite + React   |
| security-tools-mapping-navigator| Python / FastAPI     | Vite + React   |
| threat-briefing                 | Node / Express + Puppeteer | Vite + React |
| threat-to-business-translator   | Python / FastAPI     | Vite + React   |
| presales-deal-gating            | Python / wsgiref     | Server-rendered HTML |
| multi-vendor-decision-copilot   | Python / Streamlit   | Streamlit      |

## Key conventions

- **No external AI API** in presales-deal-gating and multi-vendor-decision-copilot — fully local/offline
- **PYTHONPATH=src** required for all Python projects before running or testing
- **`cmd.exe /c "robocopy ..."`** — never bare `robocopy` in bash; `/E` gets misinterpreted as drive `E:`
- **Ports are unique** — no two services share a port; see table above before adding new servers
- **`.env` files are gitignored** — each project has a `.env.example` template that is committed
- **No absolute paths in docs** — READMEs, SPECS, and CLAUDE.md files must not contain machine-specific paths (usernames, cache paths, etc.)
- **`PUPPETEER_EXECUTABLE_PATH`** — set in `.env` if Puppeteer can't auto-detect Chrome; never hardcode the path in docs

## Per-project documentation

Each project has its own `CLAUDE.md` with commands, architecture, ports, and key files. Start there for project-specific work.
