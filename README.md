# Technical-Sales Skills

This repository hosts reusable Codex skills for technical sales and presales workflows.

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

## Install
In Codex, run:

```text
Use $skill-installer to install skill from https://github.com/ksannedhi/Technical-Sales
```

## Use
After install, invoke:

```text
Use $autonomous-presales-engineer on "<RFP path>" with vendor docs "<vendor docs path or folder>" with gold "<gold proposal path>" output to "<output folder>"
```

## Notes
- Inline contextual figures are sourced from vendor documentation first.
- Gold proposal is used primarily for proposal structure, tone, and submission packaging.
