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

Each DOCX includes a styled cover page, auto-updating table of contents, headers/footers, structured BOQ tables, and inline contextual figures sourced from vendor documentation. Each run creates a dedicated output subfolder named after the opportunity.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and authenticated
- Python 3 (for Mac/Linux setup script)

---

## Setup (one-time, per machine)

**1. Clone this repo**
```bash
git clone https://github.com/ksannedhi/Technical-Sales.git
cd Technical-Sales
```

**2. Run the setup script**

Windows (PowerShell):
```powershell
.\skills\presales-skills\setup.ps1
```

Mac/Linux:
```bash
bash skills/presales-skills/setup.sh
```

The script creates the required marketplace link and registers it in Claude Code automatically.

**3. Install the plugin** — inside any Claude Code session:
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
| Opportunity name | Used for file and folder naming |
| Reseller name | Appears in cover page and document headers |
| Customer name | Appears in cover page and scope sections |
| RFP | PDF or DOCX file path |
| Vendor documentation | PDF, DOCX, PPT, images, or a folder of files |
| Gold proposal | Reference DOCX for structure and tone |
| Output folder | Root folder — a subfolder is created per opportunity |

---

## How it works

1. Detects scanned vs. text-layer PDF upfront and picks the right extraction method
2. Warns if vendor documentation is thin (< 10,000 chars) before drafting
3. Builds a requirements matrix from the RFP
4. Prompts for BOQ line-item confirmation after OCR extraction before writing to documents
5. Consolidates vendor documentation into a single working set with source attribution
6. Drafts SoW, HLD, and Technical Proposal with inline contextual figures from vendor docs
7. Runs quality gate checks (requirement traceability, BOQ fidelity, scope clarity, tone)
8. Exports Markdown and submission-ready DOCX with styled cover page, Word ToC field, and section page breaks

---

## Notes

- Always writes from a **reseller perspective** unless instructed otherwise
- Figures are inserted inline in relevant sections — never grouped in a standalone appendix
- Gold proposal is used for structure and tone only; vendor docs drive technical content
- Output is written to `<output-folder>/<opportunity-name>/` to keep multiple bids separate
