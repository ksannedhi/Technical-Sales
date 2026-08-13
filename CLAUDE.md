# CLAUDE.md

Repo-level conventions for `Technical-Sales`. Read this before adding a project, changing
documentation, or committing.

## What this repo is

A portfolio of cybersecurity presales tooling: ten standalone demo applications and one
Claude Code skill for bid drafting. Each project is self-contained and runs locally with no
shared runtime — the intended mode is a laptop demo. `threat-briefing` also ships Railway
deployment config; hosted instances are not maintained. See `README.md` for the project
index and per-project launch commands.

## Layout

```
projects/<name>/          One standalone tool per folder, self-contained
skills/presales-skills/   autonomous-presales-engineer — SoW / HLD / Technical Proposal drafting
.claude-plugin/           marketplace.json — makes the skill installable as a Claude Code plugin
```

`skills/presales-skills/` is authored here directly; it has no upstream copy. The ten
projects under `projects/` are mirrors — their source of truth is a working folder outside
this repo, so changes flow inward. Edit a project here only when you intend the repo to be
the origin for that change.

## Per-project documentation set

Every project carries four files. All four ship in the same commit as the project itself —
never as a follow-up.

| File | Purpose |
|---|---|
| `README.md` | Operator-facing: what it does, stack, quick start, env vars, runtime notes |
| `PROJECT_SPEC.md` | Architecture: data model, AI layer, API routes, non-goals, constraints |
| `CLAUDE.md` | Agent-facing: commands, architecture, known issues, deliberate decisions |
| entry in root `README.md` | Path, one-line purpose, launch snippet, links to the two docs above |

Spec filenames vary across projects (`PROJECT_SPEC.md`, `PRODUCT_SPEC.md`, `SPECS.md`) but
the location is always the project root — never a `docs/` subfolder. Do not rename them.

## Documentation conventions

- **READMEs run ~80–120 lines.** Past ~150, move material into the spec.
- **No project-structure section in a README** — that belongs in `CLAUDE.md` or the spec.
- **No `---` dividers between README sections.**
- **No absolute paths or usernames** in any committed file. This repo is public.
- **Keep README and spec in sync** — when a template column or required field changes,
  update both in the same commit, and check them against the parser's actual required set.

## Code conventions

- **Ports are unique across the suite** — no two projects bind the same port, so the whole
  set can run simultaneously. Each project's README documents its own.
- **`PYTHONPATH=src`** is required for the Python projects before running or testing.
- **`presales-deal-reviewer` and `vendor-advisor` use no external AI API** — they are fully
  local and offline by design. Keep them that way.
- **`.env` is never committed.** Each project ships a `.env.example` with placeholders.
- **`PUPPETEER_EXECUTABLE_PATH`** — set via `.env` where Chrome isn't auto-detected. Never
  hardcode a browser path.

## Not in this repo

`.claude/` and `MEMORY.md` are gitignored: they hold machine-specific paths and local
session context, and are not repo artefacts. Don't add references to them in committed
documentation.
