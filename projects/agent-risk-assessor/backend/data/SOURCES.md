# Sources for the data files

Every ID and clause in `threats.json`, `controls.json`, and `residency.json` traces to a source below. Checked September 2026. Re-check before a major data change — ATLAS publishes monthly.

## Threat taxonomies

| Source | Version | Checked against |
|---|---|---|
| OWASP Top 10 for LLM Applications | 2025 (LLM01–LLM10) | genai.owasp.org/llm-top-10 |
| OWASP Top 10 for Agentic Applications | 2026, announced 9 Dec 2025 (ASI01–ASI10) | OWASP GenAI Security Project announcement post |
| MITRE ATLAS | Data release 2026.09 (format 6.0.0) | `mitre-atlas/atlas-data` repo, `dist/v6/ATLAS-2026.09.yaml` |
| NIST AI RMF | AI 100-1 (AI RMF 1.0) | Subcategory IDs and text extracted from the NIST AI 100-1 PDF (nvlpubs.nist.gov) |

OWASP Agentic names used: ASI01 Agent Goal Hijack, ASI02 Tool Misuse, ASI03 Identity & Privilege Abuse, ASI04 Agentic Supply Chain Vulnerabilities, ASI05 Unexpected Code Execution, ASI06 Memory & Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08 Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents.

AI RMF subcategory text in `ai-rmf.json` is copied from NIST AI 100-1 (a US Government work). Which subcategories each control and report output evidences is this tool's judgement, not NIST's.

ATLAS IDs are mapped only where the technique's own description matches the threat. Threats with no clean match carry an empty `atlas` list rather than a loose one.

## Residency and governance

`verified` values in `residency.json`:

- **primary** — read in the issuing body's own document
- **compiled** — taken from a compiled GCC control taxonomy built from the framework documents; clause IDs not re-read for this tool
- **secondary** — existence and date confirmed through secondary sources only; used for advisory findings, never for Critical or High

| Instrument | Verified | Clauses used |
|---|---|---|
| CITRA Cloud Computing Regulatory Framework (Resolution 112 of 2021) | primary | §3.1.4.2, §3.2.1.2.2, §3.2.1.3.2, §4.2.1.1, §4.2.1.2 (public, hybrid, community cloud only) |
| Kuwait NBCC (NCSC) | compiled | GOV-3, CLD-12, CLD-13 |
| CBK Cyber and Operational Resilience Framework (CORF) v1.0, Dec 2025 | primary | Ch. 4 Cyber Resilience Baselines: 7.1 scope (names AI and ML as emerging technologies), 7.1.1.2 (CBK approval one month before go-live), 7.2 scope (public, community, hybrid cloud only), 7.2.1.3 (approval one month before signing cloud outsourcing involving sensitive data), 7.2.2.2(d) (location and data residency in cloud risk assessment) |
| Saudi PDPL + Transfer Regulation (2023) | compiled | Art. 29; TR Art. 2, Art. 8 |
| SDAIA AI Ethics Principles | primary | Advisory only |
| SDAIA Generative AI Guidelines for Government (Jan 2024) | secondary | Advisory only |
| UAE PDPL (Federal Decree-Law 45 of 2021) | compiled | Art. 22, Art. 23 |
| DIFC Data Protection Regulations — Regulation 10 | primary | Regulation 10 |
| Qatar PDPPL (Law 13 of 2016) | compiled | Art. 15 |
| NCSA Qatar — Guidelines for Secure Adoption and Usage of AI v1.0 (2024) | primary | Advisory only |

Pending instruments — listed in `residency.json` under `pending`, produce no findings — are NCA Cloud Cybersecurity Controls, the draft Kuwait National AI Strategy, the Bahrain and Oman PDPLs, and ISO/IEC 42001 (paywalled, so clause IDs can't be checked).
