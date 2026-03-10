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
Use $skill-installer to install skill from https://github.com/ksannedhi/Technical-Sales
```

## Use Skill
After install, invoke:

```text
Use $autonomous-presales-engineer on "<RFP path>" with vendor docs "<vendor docs path or folder>" with gold "<gold proposal path>" output to "<output folder>"
```

## Demo Projects

### Live SOC Twin (Field SKU v1)
- Path: `projects/live-soc-twin-field-sku`
- Purpose: laptop-runnable, deterministic SOC simulation for cybersecurity presales demos.
- Quick launch (Windows PowerShell):

```text
cd C:\Users\ksann\Downloads\Technical-Sales\projects\live-soc-twin-field-sku && npm.cmd run demo:launch
```

See project docs:
- `projects/live-soc-twin-field-sku/README.md`
- `projects/live-soc-twin-field-sku/runbooks/demo-quickstart.md`
- `projects/live-soc-twin-field-sku/runbooks/executive-10min-script-and-faq.md`

### Security Tools Mapping Navigator (MVP)
- Path: `projects/security-tools-mapping-navigator`
- Purpose: GUI app to map security tools to controls, identify control gaps and redundancies, and generate a migration roadmap.
- Framework modes: `NIST`, `CIS`, `BOTH`
- One-click launch (Windows):

```text
cd C:\Users\ksann\Downloads\Technical-Sales\projects\security-tools-mapping-navigator && start.cmd
```

See project docs:
- `projects/security-tools-mapping-navigator/README.md`
- `projects/security-tools-mapping-navigator/docs/Security_Tools_Mapping_Navigator_MVP_Spec.md`

## Notes
- Inline contextual figures are sourced from vendor documentation first.
- Gold proposal is used primarily for proposal structure, tone, and submission packaging.
