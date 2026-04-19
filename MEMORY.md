# MEMORY.md

Cross-session learnings about working with this user. Updated at the end of sessions.
Read alongside `CLAUDE.md` — this covers *how to work*, CLAUDE.md covers *what to build*.

---

## Workflow rules

- **Always edit standalone first**, then robocopy to `Technical-Sales\projects\`, then commit and push. Never edit the repo copy directly.
- **Robocopy in bash fails silently** — bash interprets `/E` as drive path `E:`. Always use `cmd.exe /c "robocopy ..."` or plain `cp` for individual files.
- **`cp` is simpler for small syncs** — when only a few files changed, `cp` in bash is more reliable than robocopy.
- **Commit only what was asked** — never commit speculatively or add unrelated files.

## Documentation rules

- **No absolute paths in any doc** — READMEs, SPECS, and CLAUDE.md files must never contain machine-specific paths or usernames (e.g. `C:\Users\ksann\...`).
- **No hardcoded paths in source files** — use env vars instead (e.g. `PUPPETEER_EXECUTABLE_PATH`).
- **Keep README and PROJECT_SPEC in sync** — when one is updated, the other needs the same change. Always sync both.
- **Sync standalone docs to Technical-Sales after every change** — docs in `Downloads\<project>\` and `Technical-Sales\projects\<project>\` must match.

## Windows-specific patterns

- **`--env-file=.env`** over dotenv workspace — npm workspace scripts `cd` into the package dir, so dotenv can't find the root `.env`. Always run the server from the project root with `--env-file=.env`.
- **`TZ=Asia/Kuwait` in `.env.example`** — pins Node.js process clock to Kuwait time so cron expressions fire correctly on any host. Node reads `TZ` before executing code, so `--env-file` delivers it in time.
- **node-cron `{ timezone }` option is broken on Windows** — it uses `Intl.DateTimeFormat.format()` which produces a locale string that `new Date()` can't parse on Windows → Invalid Date → cron never fires. Use `TZ` env var instead.
- **Puppeteer Chrome path** — never hardcode. Use `PUPPETEER_EXECUTABLE_PATH || undefined`. Set in `.env` if auto-detection fails.
- **`page.pdf()` returns `Uint8Array` in Puppeteer v22+** — always wrap with `Buffer.from()` before `res.send()`.

## Communication preferences

- **Flag uncertainty explicitly** — if a shortcut, feature, or behaviour can't be verified against the actual tool, say so clearly. Do not repeat agent output as confirmed fact.
- **Don't over-recommend** — the user will ask if they want more. Don't pad responses with suggestions they didn't ask for.
- **Be direct about what I don't know** — "I don't know" is better than a confident wrong answer. This came up twice: Shift+Tab for plan mode in the desktop app, and `?` for showing shortcuts — both stated confidently without verification.

## Things I got wrong (corrections received)

| What I said | What was wrong | Correct approach |
|---|---|---|
| "Press Shift+Tab twice for plan mode in the desktop app" | Not verified for desktop app — only confirmed for CLI | Flag as CLI-confirmed, desktop unknown |
| "Press `?` to see shortcuts in the desktop app" | Not verified for desktop app | Same — don't generalise CLI behaviour to desktop without confirmation |
| Stated GST is UTC+3 | GST is UTC+4 (Gulf Standard Time, UAE). Kuwait uses AST (Arabia Standard Time, UTC+3) | Verify timezone offsets before stating them |

## Project structure reminders

- 9 standalone tools under `Downloads\` — each mirrored in `Technical-Sales\projects\`
- Standalone folder names match repo folder names **except** `soc-twin` (standalone) = `soc-twin` (repo) — both are now `soc-twin`; the old repo name was `live-soc-twin-field-sku`
- Ports are unique across all projects — check the table in `Downloads\CLAUDE.md` before assigning a new one
- `.env` files are never committed — `.env.example` is committed with placeholders
- Spec files live at the **project root** alongside `README.md` — not under `docs/`. The `docs/` folder has been deleted from all 9 projects.
- Spec filenames vary across projects (PROJECT_SPEC.md, SPECS.md, PRODUCT_SPEC.md, product-spec.md, SOC_Twin_Field_SKU_v1_SPEC.md, Security_Tools_Mapping_Navigator_MVP_Spec.md). Do not rename without being asked.
- Each README must have a Documentation section (or equivalent) with a clickable link to the spec file at root level.

## regulatory-lens — intake recommendation rules

Key jurisdiction scoping rules baked into `server/prompt.js` — do not weaken these:

- **NCA-ECC and SAMA-CSF**: Saudi-only. Explicitly omitted for UAE, Kuwait, Qatar, Bahrain, Oman. Do not recommend for non-Saudi orgs even if "Multiple" geography is selected without stated Saudi operations.
- **CBK**: Kuwait banking only. Not for Kuwait government, CNI, or non-financial sector.
- **PDPL-UAE**: Omitted for UAE central bank / federal government entities (exempt under Article 3(1) of Federal Decree-Law No. 45/2021). Mandatory only for private-sector UAE orgs.
- **PDPL-QAT**: Omitted for single-country non-Qatar orgs. Requires an actual Qatar branch/presence for contractual weight — "plausibly processes Qatar data" is not sufficient.
- **PCI-DSS**: Contractual (not mandatory) for central bank profiles even if payment card data is selected — central banks regulate card schemes but don't typically process card transactions.
- **NIST-CSF**: Upgraded from voluntary to contractual for stock-exchange-listed entities.
- **QATAR-NIAS**: Added to the governance-heavy frameworks list eligible for weight-tier upgrade on listing.

---

## How to update this file

Claude Code updates `.claude\projects\...\memory\MEMORY.md` automatically. This file (`Downloads\MEMORY.md`) is the **manual index** — updated explicitly at the end of a session when something is worth persisting across all projects. You don't need to ask; Claude should offer to update it at session end when meaningful decisions were made.
