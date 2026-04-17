# Presales Skills — Claude Code Plugin

A Claude Code plugin for cybersecurity presales engineers. Currently includes one skill:

---

## autonomous-presales-engineer

Generates first-pass bid packs from an RFP, current-opportunity vendor documentation, and a reference (gold) proposal. Outputs submission-ready **Statement of Work**, **High-Level Design**, and **Technical Proposal** in both Markdown and DOCX.

### What it produces

| File | Format |
|---|---|
| `<Opportunity>_SoW_Draft` | `.md` + `.docx` |
| `<Opportunity>_HLD_Draft` | `.md` + `.docx` |
| `<Opportunity>_Technical_Proposal_Draft` | `.md` + `.docx` |

Each DOCX includes a cover block, table of contents, headers/footers, structured BOQ tables, and inline contextual figures sourced from vendor documentation.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and authenticated

---

## Setup (one-time, per machine)

**1. Clone this repo**
```bash
git clone https://github.com/ksannedhi/Technical-Sales.git
```

**2. Create the marketplace junction** (PowerShell)
```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.claude\plugins\marketplaces\ksannedhi-Technical-Sales" `
  -Target "<path-to-cloned-repo>"
```

**3. Register the marketplace** — add this entry to `~/.claude/plugins/known_marketplaces.json`:
```json
"ksannedhi-Technical-Sales": {
  "source": { "source": "github", "repo": "ksannedhi/Technical-Sales" },
  "installLocation": "<path-to-userprofile>\\.claude\\plugins\\marketplaces\\ksannedhi-Technical-Sales",
  "lastUpdated": "2026-01-01T00:00:00.000Z"
}
```

**4. Install the plugin** — inside any Claude Code session:
```
/plugin install presales-skills@ksannedhi-Technical-Sales
/reload-plugins
```

---

## Usage

**Option 1 — Slash command (short form):**
```
/autonomous-presales-engineer
```

**Option 2 — Slash command (namespaced, discoverable by typing `/pre`):**
```
/presales-skills:draft-bid-pack
```

Both commands prompt for any missing inputs before drafting. You can also pass all four arguments directly:
```
/autonomous-presales-engineer <rfp-path> <vendor-docs-path> <gold-proposal-path> <output-folder>
```

**Option 3 — Natural language (auto-trigger):**
> *"Draft a bid pack for Acme Corp. RFP is at `~/bids/rfp.pdf`, vendor docs in `~/bids/vendor/`, gold proposal at `~/bids/gold.docx`, output to `~/bids/output/`."*

### Inputs

| Input | Description |
|---|---|
| RFP | PDF or DOCX file path |
| Vendor documentation | PDF, DOCX, PPT, images, or a folder of files |
| Gold proposal | Reference DOCX for structure and tone |
| Output folder | Where to write the generated files |

---

## How it works

1. Detects scanned vs. text-layer PDF and picks the right extraction method
2. Builds a requirements matrix from the RFP
3. Consolidates vendor documentation into a single working set with source attribution
4. Drafts SoW, HLD, and Technical Proposal with inline contextual figures from vendor docs
5. Runs quality gate checks (requirement traceability, BOQ fidelity, scope clarity, tone)
6. Exports Markdown and submission-ready DOCX files

---

## Notes

- Always writes from a **reseller perspective** unless instructed otherwise
- Figures are inserted inline in relevant sections — never grouped in a standalone appendix
- Gold proposal is used for structure and tone only; vendor docs drive technical content
