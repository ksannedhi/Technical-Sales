---
description: Draft a presales bid pack (SoW, HLD, Technical Proposal) from an RFP, vendor docs, and a gold proposal
argument-hint: "[rfp-path] [vendor-docs-path] [gold-proposal-path] [output-folder]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

# Draft Bid Pack

Invoke the autonomous-presales-engineer skill to generate a full bid pack.

## Arguments

The user provided: $ARGUMENTS

If arguments were supplied, parse them as:
1. RFP path
2. Vendor documentation path or folder
3. Gold proposal path
4. Output folder

If any arguments are missing, ask the user for them before proceeding.

## Instructions

Once all four inputs are collected, run the autonomous-presales-engineer skill in full:
- Extract and validate source files
- Build requirements matrix from RFP
- Draft SoW, HLD, and Technical Proposal with inline figures from vendor docs
- Run quality gate checks
- Export Markdown and submission-ready DOCX to the output folder
- Report absolute output paths and any caveats on completion
