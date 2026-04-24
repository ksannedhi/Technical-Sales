# Technical-Sales

Cybersecurity presales resources: a Claude Code skill for bid drafting and 9 standalone demo tools.

---

## Skill — autonomous-presales-engineer

- Path: `skills/presales-skills`
- Purpose: generates first-pass SoW, HLD, and Technical Proposal (Markdown + DOCX) from a customer RFP, vendor documentation, and a gold proposal.
- Invoke via `/autonomous-presales-engineer`, `/presales-skills:draft-bid-pack`, or natural language.

See `skills/presales-skills/README.md` for full setup and usage instructions.

---

## Demo Projects

### Live SOC Twin
- Path: `projects/soc-twin`
- Purpose: laptop-runnable, deterministic SOC simulation for cybersecurity presales demos.
- Quick launch (Windows):
```
cd projects/soc-twin && npm.cmd run demo:launch
```
Docs: `projects/soc-twin/README.md`

---

### Security Tools Mapping Navigator
- Path: `projects/security-tools-mapping-navigator`
- Purpose: Upload a security tools inventory CSV and get a framework-aligned gap analysis (NIST CSF 2.0 / CIS Controls v8.1 / both), capability-filtered redundancy audit with consolidation savings, domain coverage summary, per-control vendor recommendations, dynamic phased roadmap, copyable Executive Summary, and Print/PDF export. No AI API required — fully deterministic and offline.
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
