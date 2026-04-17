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

## Installation

```bash
/plugin install presales-skills@local-technical-sales
```

> **Note:** This is a local plugin. Before installing, clone this repo and register it as a local marketplace — see [Setup](#setup) below.

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ksannedhi/Technical-Sales.git
   ```

2. Create the marketplace directory and junction:
   ```powershell
   # Windows (PowerShell)
   New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\plugins\marketplaces\local-technical-sales\plugins" -Force
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.claude\plugins\marketplaces\local-technical-sales\plugins\presales-skills" `
     -Target "<path-to-cloned-repo>\skills\presales-skills"
   ```

3. Register the marketplace by adding this entry to `~/.claude/plugins/known_marketplaces.json`:
   ```json
   "local-technical-sales": {
     "source": { "source": "local", "path": "<path-to-cloned-repo>\\skills" },
     "installLocation": "<path-to-userprofile>\\.claude\\plugins\\marketplaces\\local-technical-sales",
     "lastUpdated": "2026-01-01T00:00:00.000Z"
   }
   ```

4. Install the plugin in Claude Code:
   ```bash
   /plugin install presales-skills@local-technical-sales
   ```

---

## Usage

Once installed, the skill activates automatically when you describe an RFP or bid drafting task. You can also invoke it explicitly:

```
/autonomous-presales-engineer
```

### Inputs

When invoked, provide:

| Input | Description |
|---|---|
| RFP | PDF or DOCX file path |
| Vendor documentation | PDF, DOCX, PPT, or images for the current bid |
| Gold proposal | Reference DOCX for structure and tone |
| Output folder | Where to write the generated files |

### Example prompt

> Draft a bid pack for the Acme Corp SIEM opportunity. RFP is at `~/bids/acme/rfp.pdf`, vendor docs are in `~/bids/acme/vendor/`, gold proposal is at `~/bids/reference/gold.docx`, output to `~/bids/acme/output/`.

---

## How it works

1. Extracts text from all source files (DOCX XML preferred; Word COM fallback for PDFs on Windows)
2. Builds a requirements matrix from the RFP
3. Consolidates vendor documentation into a single working set
4. Drafts SoW, HLD, and Technical Proposal with planned figure locations
5. Inserts inline contextual images from vendor docs into each deliverable
6. Runs quality gate checks (requirement traceability, BOQ fidelity, scope clarity, tone)
7. Exports Markdown and submission-ready DOCX files

---

## Notes

- Always writes from a **reseller perspective** unless instructed otherwise
- Commercial values remain as placeholders unless pricing is provided
- Figures are inserted inline in relevant sections — never grouped in a standalone appendix
- Gold proposal is used for structure and tone only; vendor docs drive technical content
