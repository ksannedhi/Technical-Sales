# Technical-Sales Skills and Projects

This repository hosts reusable Codex skills and presales demo projects.

## Available Skill
- `autonomous-presales-engineer`

## What It Does
Generates first-pass cybersecurity bid deliverables from:
- Customer RFP
- Current-bid vendor documentation (primary technical and image source)
- Gold proposal (structure/style benchmark)

Outputs:
- SoW (`.md` + `.docx`)
- HLD (`.md` + `.docx`)
- Technical Proposal (`.md` + `.docx`)

## Install Skill
In Codex, run:

```text
Use $skill-installer to install skill from https://github.com/ksannedhi/Technical-Sales/tree/main/autonomous-presales-engineer
```

For multi-skill repos, install the specific skill subfolder rather than the repo root.

## Use Skill
After install, invoke:

```text
Use $autonomous-presales-engineer on "<RFP path>" with vendor docs "<vendor docs path or folder>" with gold "<gold proposal path>" output to "<output folder>"
```

## Skill Notes
- Inline contextual figures are sourced from vendor documentation first.
- Gold proposal is used primarily for proposal structure, tone, and submission packaging.

## Demo Projects

### Live SOC Twin (v1)
- Path: `projects/live-soc-twin-field-sku`
- Purpose: laptop-runnable, deterministic SOC simulation for cybersecurity presales demos.
- Quick launch (Windows PowerShell):

```text
cd projects/live-soc-twin-field-sku && npm.cmd run demo:launch
```

See project docs:
- `projects/live-soc-twin-field-sku/README.md`
- `projects/live-soc-twin-field-sku/runbooks/demo-quickstart.md`
- `projects/live-soc-twin-field-sku/runbooks/executive-10min-script-and-faq.md`

### Security Tools Mapping Navigator
- Path: `projects/security-tools-mapping-navigator`
- Purpose: GUI app to map security tools to controls, identify control gaps and redundancies, and generate a migration roadmap.
- Framework modes: `NIST`, `CIS`, `BOTH`
- Current strengths: alias-assisted matching, domain-grouped current-state maps, SQLite save/load/delete workflow, and downloadable outputs.
- One-click launch (Windows):

```text
cd projects/security-tools-mapping-navigator && start.cmd
```

See project docs:
- `projects/security-tools-mapping-navigator/README.md`
- `projects/security-tools-mapping-navigator/docs/Security_Tools_Mapping_Navigator_MVP_Spec.md`

### Multi-Vendor Decision Copilot
- Path: `projects/multi-vendor-decision-copilot`
- Purpose: customer-facing cybersecurity copilot for vendor lookup, product lookup, named comparisons, category recommendations, and honest insufficient-data responses.
- Current strengths: conversational lookup, named comparison, weighted category recommendation, vendor-level fallback where product data is missing, and transparent constraint/exclusion handling.
- Quick launch (Windows PowerShell):

```text
cd projects/multi-vendor-decision-copilot
python -m streamlit run app.py
```

See project docs:
- `projects/multi-vendor-decision-copilot/README.md`
- `projects/multi-vendor-decision-copilot/docs/PROJECT_SPEC.md`

### Threat-to-Business Translator
- Path: `projects/threat-to-business-translator`
- Purpose: executive-facing cyber risk translator that converts synthetic scenarios, CVEs, SOC alerts, and vulnerability scan-style findings into quantified business impact and leadership narratives.
- Current strengths: scenario-first workflow, optional customer-specific inputs, deterministic scoring, risk-reduction output, and leadership-ready reporting.
- One-click launch (Windows):

```text
cd projects/threat-to-business-translator && Launch Threat-to-Business Translator.cmd
```

See project docs:
- `projects/threat-to-business-translator/README.md`
- `projects/threat-to-business-translator/docs/SPECS.md`

### Phishing Analyzer
- Path: `projects/phishing-analyzer`
- Purpose: demo-first AI-assisted phishing email analyzer for CISO and presales conversations, with balanced technical findings, MITRE ATT&CK context, NCA ECC mapping, and polished PDF reporting.
- Current strengths: hybrid rules + OpenAI analysis, deterministic override when model output drifts from the evidence, scenario-specific recommendations, mockup-aligned ECC table, and one-click Windows launch.
- One-click launch (Windows):

```text
cd projects/phishing-analyzer && Launch Phishing Analyzer.cmd
```

See project docs:
- `projects/phishing-analyzer/README.md`
- `projects/phishing-analyzer/docs/PROJECT_SPEC.md`

### Presales Deal Gating
- Path: `projects/presales-deal-gating`
- Purpose: local web app for reviewing presales deal readiness across requirements, architecture, proposal, and supporting notes.
- Current strengths: laptop-runnable workflow, artifact ingestion, weighted gating scores, deal history navigation, rename support, and downloadable findings.
- Quick launch (Windows):

```text
cd projects/presales-deal-gating && start.cmd
```

See project docs:
- `projects/presales-deal-gating/README.md`
- `projects/presales-deal-gating/docs/PRODUCT_SPEC.md`

### Network Security Diagrammer
- Path: `projects/network-security-diagrammer`
- Purpose: local app for turning rough network and security prompts into clean, editable Excalidraw diagrams.
- Current strengths: pattern-first architecture modeling, follow-up editing, vendor-neutral defaults, prompt-history tracking, and deterministic local layout/routing.
- One-click launch (Windows):

```text
cd projects/network-security-diagrammer && Launch Network Security Diagrammer.cmd
```

See project docs:
- `projects/network-security-diagrammer/README.md`
- `projects/network-security-diagrammer/docs/product-spec.md`

### Threat Intel Briefing Builder
- Path: `projects/threat-briefing`
- Purpose: daily AI-powered threat intelligence briefing tool for enterprise security teams in the GCC region, pulling live OSINT from AlienVault OTX, CISA KEV, and MalwareBazaar and synthesising it into a structured briefing via the Claude API.
- Current strengths: three live OSINT feed integrations, GCC-tuned AI synthesis, React dashboard with threat level, top threats, CVE highlights and recommendations, Puppeteer PDF export, daily auto-scheduling at 06:00 GST, and persistent briefing cache with startup catch-up.
- One-click launch (Windows):

```text
cd projects/threat-briefing && Launch Threat Briefing.cmd
```

See project docs:
- `projects/threat-briefing/README.md`
- `projects/threat-briefing/docs/PROJECT_SPEC.md`

### Cross-Framework Regulatory Harmoniser
- Path: `projects/regulatory-lens`
- Purpose: GCC cybersecurity compliance tool that maps an organisation profile to applicable regulatory frameworks, runs parallel Claude analysis across 23 control domains, and produces a unified coverage matrix and weighted implementation roadmap.
- Current strengths: 12 built-in GCC frameworks (NCA-ECC, SAMA-CSF, CBK, ISO-27001, NIST-CSF, UAE-NIAF, PCI-DSS, IEC-62443, SOC2, PDPL-UAE, PDPL-QAT, Qatar NIAS V2.1), parallel SSE-streamed domain analysis with concurrency limiter, posture-gated roadmap generation, Excel and PDF export, custom framework PDF ingestion, and Change Tracker for assessing regulatory version updates.
- One-click launch (Windows):

```text
cd projects/regulatory-lens && "Launch Cross-Framework Harmoniser.cmd"
```

See project docs:
- `projects/regulatory-lens/README.md`
- `projects/regulatory-lens/docs/PROJECT_SPEC.md`
