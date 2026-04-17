---
name: autonomous-presales-engineer
description: Build reusable presales bid drafts from customer RFPs, current-opportunity vendor documentation, and prior gold proposals. Use when the user needs SoW, HLD, and Technical Proposal deliverables in Markdown and DOCX, plus requirement extraction, BOQ alignment, inline figure insertion, and reseller-tone packaging for cybersecurity opportunities.
version: 1.0.0
---

# Autonomous Presales Engineer

## Overview
Generate first-pass or revision bid packs for cybersecurity opportunities using: (1) the customer RFP for requirements, (2) current-opportunity vendor documentation for technical content and figures, and (3) a gold proposal for structure and submission style. Produce SoW, HLD, and Technical Proposal drafts in both Markdown and DOCX.

## Inputs
Collect these before drafting:
1. RFP file path (PDF or DOCX).
2. Vendor documentation paths for the current bid (PDF/DOCX/PPT/images as available).
3. Gold proposal file path (DOCX preferred).
4. Output folder path.
5. Required deliverables (default: SoW, HLD, Technical Proposal).
6. Tone target (default: standard reseller submission tone).

## Workflow
1. Extract source text from RFP, vendor documentation, and gold proposal.
2. Validate extraction quality before drafting.
3. Build requirements matrix from RFP.
4. If vendor documentation includes multiple files or a folder, extract each file, retain source attribution, and merge the useful technical content into one working set.
5. Identify candidate figures from vendor documentation for each deliverable and section.
6. Draft SoW, HLD, and Technical Proposal with planned figure locations.
7. Insert inline contextual images into Markdown and DOCX drafts.
8. Run quality gate checks.
9. Export Markdown and DOCX outputs.

## Extraction Rules
1. Prefer direct DOCX XML body extraction for DOCX files.
2. For PDF in Windows environments, use Word COM conversion (PDF -> DOCX) when Python PDF libraries are unavailable.
3. Never assume extraction succeeded; verify with sample lines and character count.
4. If extracted text is blank or mostly line breaks, retry using alternate path (Word conversion first, then XML extraction).
5. Treat vendor documentation as the primary technical-content and figure source for the current bid.
6. Use the gold proposal primarily as a structure, tone, and packaging benchmark.
7. When vendor documentation is supplied as multiple files, process every relevant file rather than stopping at the first successful extraction.
8. When a vendor documentation folder is supplied, enumerate supported files first, then extract and consolidate them into a single working set with file-level traceability.

## Drafting Rules
1. Keep structure practical and submission-ready.
2. Always write from reseller perspective unless the user asks otherwise.
3. Reflect RFP language for scope, requirements, and acceptance criteria.
4. Include explicit BOQ mapping and scope boundaries.
5. Keep commercial placeholders as placeholders unless pricing is provided.
6. Use concise, formal reseller language.
7. Place figures directly inside the section where they add technical clarity (architecture, flow, performance, support model, or implementation method).
8. Do not create a standalone `Contextual Figures`, `Figures`, or similar catch-all section unless the user explicitly asks for one.

## Inline Image Insertion Rules
1. Prefer figures extracted from current-opportunity vendor documentation before using any external source.
2. Use gold proposal visuals only when they are directly relevant and no better current-opportunity vendor figure is available.
3. Insert images inline near the relevant text section, not as a detached appendix.
4. Place each figure immediately after the paragraph or subsection it supports whenever practical.
5. Do not group otherwise unrelated figures under a dedicated figure-only section.
6. In Markdown drafts, use relative image paths (for example: `![caption](figures/vendor/diagram.png)`).
7. In DOCX outputs, embed images as inline objects (not broken links or placeholders).
8. Add a short caption below each figure using `Figure N: ...`.
9. When vendor documentation is provided, actively search it for at least one usable figure per deliverable before concluding none are relevant.
10. Include at least one contextual inline figure in each deliverable when relevant material exists.
11. State that no relevant figure exists for a deliverable only after vendor documentation has been checked and no technically suitable figure was found.
12. If a deliverable genuinely has no suitable figure, keep the statement brief and place it in the relevant section rather than in a standalone figure section.
13. Avoid decorative logos/certificates unless they support a stated requirement.

Use [references/section-outlines.md](references/section-outlines.md) for required sections.
Use [references/quality-gates.md](references/quality-gates.md) before finalizing.
Use [references/docx-submission-format.md](references/docx-submission-format.md) for submission-ready DOCX formatting standards.

## Submission-Ready DOCX Requirements
1. Convert Markdown drafts into DOCX only after technical content is stable.
2. Remove Markdown artifacts from DOCX (`#`, `##`, table pipes if rendered poorly).
3. Apply cover block: title, customer, prepared-by, date, confidentiality line.
4. Add table of contents and update it before delivery.
5. Add header/footer with proposal identity and page numbers.
6. Apply heading styles (`Heading 1-3`) and consistent body style.
7. Ensure tables are readable and aligned for BOQ and SLA sections.
8. Insert relevant figures inline contextually in all deliverables where relevant.
9. Prefer figures extracted from current-opportunity vendor documentation.
10. Do not create a standalone figure gallery or `Contextual Figures` section unless the user explicitly requests it.
11. If user asks for online figures, include only relevant product architecture visuals and cite source links in the response.

## Output Contract
Generate all of the following unless user narrows scope:
1. <Opportunity>_SoW_Draft.md
2. <Opportunity>_SoW_Draft.docx
3. <Opportunity>_HLD_Draft.md
4. <Opportunity>_HLD_Draft.docx
5. <Opportunity>_Technical_Proposal_Draft.md
6. <Opportunity>_Technical_Proposal_Draft.docx

## Completion Checklist
1. Confirm source files and extraction method used.
2. Confirm BOQ references captured.
3. Confirm all requested formats are created.
4. Confirm inline contextual images are inserted and visible in Markdown and DOCX outputs.
5. Confirm vendor documentation was actively reviewed for usable figures per deliverable.
6. Confirm figure provenance is primarily from current-opportunity vendor documentation.
7. Confirm gold proposal was used primarily for structure/style guidance.
8. Confirm all relevant vendor files were processed when multiple vendor documents were provided.
9. Provide absolute output paths.
10. State caveats (for example OCR quality or scanned PDF limitations).
