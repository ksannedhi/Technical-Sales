# Technical-Sales

Cybersecurity presales resources: a Claude Code skill for bid drafting and 9 standalone demo tools.

---

## Skill — autonomous-presales-engineer

Generates first-pass bid packs for cybersecurity opportunities from three inputs:

| Input | Role |
|---|---|
| Customer RFP | Requirements and acceptance criteria |
| Vendor documentation | Primary technical content and figures |
| Gold proposal | Structure and tone benchmark |

**Outputs** (Markdown + submission-ready DOCX for each):
- Statement of Work (SoW)
- High-Level Design (HLD)
- Technical Proposal

### Prerequisites

- [Claude Code](https://claude.ai/code) installed and authenticated

### Setup (one-time, per machine)

**1. Clone this repo**
```bash
git clone https://github.com/ksannedhi/Technical-Sales.git
```

**2. Create the marketplace junction** (PowerShell)
```powershell
New-Item -ItemType Directory -Force `
  -Path "$env:USERPROFILE\.claude\plugins\marketplaces\ksannedhi-Technical-Sales\plugins"

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

### Usage

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

### Notes
- Figures are sourced from vendor documentation first — inserted inline, never in a standalone appendix
- Gold proposal drives structure and tone only; vendor docs drive technical content
- Commercial values stay as placeholders unless pricing is provided
- Always writes from reseller perspective unless instructed otherwise

---

## Demo Projects

### Live SOC Twin
- Path: `projects/live-soc-twin-field-sku`
- Purpose: laptop-runnable, deterministic SOC simulation for cybersecurity presales demos.
- Quick launch (Windows):
```
cd projects/live-soc-twin-field-sku && npm.cmd run demo:launch
```
Docs: `projects/live-soc-twin-field-sku/README.md`

---

### Security Tools Mapping Navigator
- Path: `projects/security-tools-mapping-navigator`
- Purpose: GUI app to map security tools to controls, identify gaps and redundancies, and generate a migration roadmap.
- One-click launch (Windows):
```
cd projects/security-tools-mapping-navigator && start.cmd
```
Docs: `projects/security-tools-mapping-navigator/README.md`

---

### Multi-Vendor Decision Copilot
- Path: `projects/multi-vendor-decision-copilot`
- Purpose: conversational cybersecurity copilot for vendor lookup, product comparison, category recommendations, and transparent constraint handling.
- Quick launch (Windows):
```
cd projects/multi-vendor-decision-copilot && python -m streamlit run app.py
```
Docs: `projects/multi-vendor-decision-copilot/README.md`

---

### Threat-to-Business Translator
- Path: `projects/threat-to-business-translator`
- Purpose: converts CVEs, SOC alerts, and vulnerability findings into quantified business impact and leadership narratives.
- One-click launch (Windows):
```
cd projects/threat-to-business-translator && "Launch Threat-to-Business Translator.cmd"
```
Docs: `projects/threat-to-business-translator/README.md`

---

### Phishing Analyzer
- Path: `projects/phishing-analyzer`
- Purpose: AI-assisted phishing email analyzer with MITRE ATT&CK context, NCA ECC mapping, and PDF reporting.
- One-click launch (Windows):
```
cd projects/phishing-analyzer && "Launch Phishing Analyzer.cmd"
```
Docs: `projects/phishing-analyzer/README.md`

---

### Presales Deal Gating
- Path: `projects/presales-deal-gating`
- Purpose: local web app for reviewing deal readiness across requirements, architecture, proposal, and supporting notes.
- One-click launch (Windows):
```
cd projects/presales-deal-gating && start.cmd
```
Docs: `projects/presales-deal-gating/README.md`

---

### Network Security Diagrammer
- Path: `projects/network-security-diagrammer`
- Purpose: turns rough network and security prompts into clean, editable Excalidraw diagrams.
- One-click launch (Windows):
```
cd projects/network-security-diagrammer && "Launch Network Security Diagrammer.cmd"
```
Docs: `projects/network-security-diagrammer/README.md`

---

### Threat Intel Briefing Builder
- Path: `projects/threat-briefing`
- Purpose: daily AI-powered threat intelligence briefing tool pulling live OSINT from AlienVault OTX, CISA KEV, and MalwareBazaar, synthesised via Claude API into a GCC-tuned briefing with PDF export.
- One-click launch (Windows):
```
cd projects/threat-briefing && "Launch Threat Briefing.cmd"
```
Docs: `projects/threat-briefing/README.md`

---

### Cross-Framework Regulatory Harmoniser
- Path: `projects/regulatory-lens`
- Purpose: GCC compliance tool mapping an organisation profile across 12 regulatory frameworks, producing a unified coverage matrix and weighted implementation roadmap.
- One-click launch (Windows):
```
cd projects/regulatory-lens && "Launch Cross-Framework Harmoniser.cmd"
```
Docs: `projects/regulatory-lens/README.md`
