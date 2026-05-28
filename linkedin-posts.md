# LinkedIn Posts — Cybersecurity Presales Tools
# Posting sequence: Post 1 first, then Posts 2–11 in order — one post per day, 12 consecutive days

---

## Post 1 — Intro + Presales Skills (Claude Code Plugin)

I spent close to five years in cybersecurity presales waiting for someone to build tools for the job. Nobody did. So I did.

The problems were obvious: demos that don't feel real, proposals written under deadline pressure, threat reports that lose executives halfway through the first CVE, compliance assessments that take weeks when a customer needs answers in a meeting.

In March 2026, OpenAI released Codex for Windows. I started building. One tool at a time. All of it in Codex — OpenAI's AI coding agent.

The tools ran. But the output was bland — templated responses, technically correct, no real depth. So I switched to Claude Code. The difference was immediate. All 10 tools you'll see in this series were built and shaped there.

The 10 tools I built:

🔴 **SOC Twin** — live MDR simulation for detection demos
📡 **AI Threat Briefing** — daily OSINT briefings synthesised by Claude, tuned for GCC
🎣 **Phishing Analyzer** — risk scoring, MITRE mapping, and compliance gaps from a single email paste
📊 **CyberRisk Narrator** — translates CVEs and SOC alerts into executive business impact language
🏛️ **ZTA Advisor** — structured 38-question Zero Trust maturity assessment with roadmap
⚖️ **Regulatory Lens** — maps an org profile to 14 GCC frameworks simultaneously
🔍 **Security Controls Gap Analyzer** — offline gap analysis across NCA ECC, ISO 27001, NIST CSF
🗺️ **Network Security Diagrammer** — rough prompt → clean Excalidraw architecture diagram
🎯 **VendorAdvisor** — weighted, transparent vendor recommendation engine, fully offline
📋 **Presales Deal Reviewer** — offline deal gating across requirements, architecture, and proposal

Before I get to any of those — the meta-tool. **Presales Skills** is a Claude Code plugin. Give it an RFP, your vendor documentation, and a reference proposal. Run one command: `/autonomous-presales-engineer`

It reads the RFP, builds a requirements matrix, confirms BOQ line items before writing anything, then drafts a Statement of Work, High-Level Design, and Technical Proposal — Markdown and submission-ready DOCX. Styled cover page, auto-updating table of contents, BOQ tables, inline figures pulled from the vendor docs.

A bid pack that used to take 2–3 days now takes a couple of hours. I built it because I needed it, and every presales engineer I know has had the same 48-hour RFP submission experience.

One setup command in Claude Code — full instructions at the link.
🔗 github.com/ksannedhi/Technical-Sales

I'll be posting about each tool daily over the next 10 days. Follow along if you're in presales, cybersecurity, or just building things with AI.

Tomorrow: a live MDR environment that runs on a laptop — no cloud, no staging server, no recordings.

#Cybersecurity #Presales #AI #ClaudeCode #AnthropicClaude #SalesEngineering #RFP #BidManagement #GCC #OpenSource

---

## Post 2 — SOC Twin

There's a moment in every SOC demo where the room goes quiet.

You're on a slide showing an alert from six months ago, and somewhere in the audience a security analyst is thinking: "That's not what it actually looks like."

Like most of us, I've been on both sides of that table. I know what that silence means.

So I built **SOC Twin** — a live MDR environment that runs on a laptop.

It simulates a full Managed Detection and Response environment: background alert noise, structured attack scenarios, AI-powered triage — entirely locally. No cloud environment. No staging server. No "let me show you a recording."

What it does:
- Generates realistic background noise (low/medium severity alerts) at configurable rates
- Triggers structured attack scenarios on demand — ransomware, phishing, cloud identity abuse
- Sends each alert through AI-powered triage — threat assessment, MITRE mapping, risk score, and remediation guidance
- Falls back to deterministic templates if no API key is available — works in air-gapped rooms
- Auto-raises customer tickets when incidents escalate to Tier-2 — visible in a dedicated Customer Ticket Portal with live status tracking
- Three audience modes — Analyst, SOC Manager, CISO — each showing a different view of the same live data

The analyst sees the live alert feed and triage panel. The SOC Manager sees incident response and open tickets. The CISO sees active incidents, affected services, and business risk. One demo, three conversations.

The design principle was simple: make threat detection feel real. Not impressive — real. That's the difference. A customer who watches a ransomware scenario unfold in real time, sees the AI triage fire, and reads the remediation guidance on-screen is having a completely different conversation than one who saw a slide.

Stack: Node/Express + React + Anthropic Claude.

All open source.
🔗 github.com/ksannedhi/Technical-Sales

Tomorrow: the daily threat briefing that runs itself — live OSINT, AI synthesis, PDF export, zero manual effort.

#Cybersecurity #Presales #MDR #SOC #ThreatDetection #AI #AnthropicClaude #SalesEngineering

---

## Post 3 — AI Threat Intelligence Briefing

Most threat intelligence tools are built for analysts. They produce feeds.

What a CISO needs at 7am is a briefing — structured, regional, actionable. One page they can read before the first meeting.

I built **AI Threat Intelligence Briefing** to produce exactly that, automatically, every morning.

It pulls live OSINT from AlienVault OTX, CISA KEV, and Abuse.ch MalwareBazaar, normalises it into a unified schema with GCC-specific statistics, and sends it to Claude for synthesis into a structured JSON briefing. node-cron fires the pipeline at 06:00 AST daily.

You don't touch it. You open it.

What it does:
- Claude (Haiku) synthesises the data into a structured briefing tuned for the GCC region
- Auto-generates on startup if the saved briefing is stale or missing
- If it was offline for a day, it serves the last briefing immediately on restart and runs a fresh one in the background
- Daily 06:00 AST scheduler — export-ready without any manual trigger
- Two versions of the same briefing — plain English executive summary for the CISO, technical analyst summary with IOCs and CVEs for the SOC team
- Regional focus on Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, and Oman — including threat actors APT33, APT34, OilRig, and Lazarus
- Recommended actions tagged by owner (SOC / IT / Management) and timeframe (immediate / 24h / 1-week)
- PDF export — formatted A4 report, one click

The design constraint was: a security engineer should be able to run this on a local machine and have a credible, export-ready briefing ready every morning — without a dedicated analyst writing it.

The scheduler handles the rest.

Stack: Node/Express + React + Anthropic Claude + Puppeteer + node-cron.

All open source.
🔗 github.com/ksannedhi/Technical-Sales

Tomorrow: one suspicious email, a risk score, MITRE ATT&CK mapping, and a compliance gap report — from a single paste.

#ThreatIntelligence #OSINT #Cybersecurity #GCC #AI #AnthropicClaude #CISA #Presales

---

## Post 4 — Phishing Analyzer

A customer pastes a suspicious email and asks: "Is this phishing?"

The wrong answer is yes or no.

The right answer is: here's the risk score, here's exactly which signals triggered it, here are the MITRE ATT&CK techniques in play, and here's what this finding means for your NCA ECC or ISO 27001 posture.

**Phishing Analyzer** produces that answer — from a single email paste.

This project started in Codex like the rest, but I kept OpenAI for the AI layer here. It fits — structured output, low latency, narrative only.

What it produces:
- Risk score (0–100) with per-finding score breakdown
- Verdict: Clean / Suspicious / Likely Phishing / Phishing
- Executive and analyst summaries
- MITRE ATT&CK tactic and technique mapping
- NCA ECC-2:2024 and ISO 27001 compliance gap analysis — toggle between frameworks in the UI
- Structured IOC table: sender domains, reply-to, return-path, suspicious URLs
- Remediation recommendations with owner assignment
- Campaign cluster signal when infrastructure repeats across sessions
- Downloadable PDF with both frameworks, IOC table, score breakdown, and analyst notes

The architecture is hybrid by design: 17 deterministic checks run first — SPF/DKIM/DMARC inspection, domain age lookup, typosquat detection, CSS obfuscation, link entropy, and more. The verdict, score, MITRE mapping, and compliance gaps are all computed before AI is called. OpenAI writes the narrative on top of what the rules already found. The rules don't change between runs. The AI doesn't invent findings.

That distinction matters in a customer demo. Every finding traces back to something real in the email.

This is a presales and demo tool, not a production detection engine — and it's built to be honest about that. The analysis source field on every result tells you whether the narrative came from OpenAI or a deterministic fallback. No black box.

Stack: React + Node/Express + OpenAI (narrative layer only) + Puppeteer.

All open source.
🔗 github.com/ksannedhi/Technical-Sales

Tomorrow: making CVSS 9.8 mean something to a CFO — technical threats translated into business impact, loss ranges, and board-ready language.

#Cybersecurity #PhishingAnalysis #MITRE #Presales #EmailSecurity #ThreatIntelligence #NCAECC #ISO27001

---

## Post 5 — CyberRisk Narrator

CVE-2024-XXXX. CVSS 9.8. Remote code execution. Unauthenticated.

Tell that to a CFO. Watch their eyes glaze over.

Security teams already know what the threat is. What they consistently struggle with is communicating it up — in terms that make a board member feel the urgency and authorise the budget.

I built **CyberRisk Narrator** to do that translation.

Paste a CVE, a SOC alert, or a vulnerability scan report — or upload one. Choose an industry sector. The engine maps the finding to a sector-specific domain — business units, revenue streams, critical services — and produces a narrative a CFO can act on.

What it produces:
- Quantified business impact: loss ranges, downtime estimates, affected revenue streams
- Urgency and confidence scoring
- Board-ready risk narrative and a one-paragraph leave-behind for the exec briefing
- CVSS vector string parsing when present — base score drives exploitability, no keyword guessing
- Organisation risk profile input — revenue, headcount, security maturity — to contextualise the output
- Built-in synthetic scenarios per sector so it works in demos without any customer data

Sectors covered: Financial Services, Healthcare, Manufacturing, Retail, Technology.

The engine is fully offline — no API key, no LLM. Every number traces back to structured domain data and deterministic scoring rules. That matters when you're running a discovery session in a restricted network or a government facility.

Because if you're sitting in an executive briefing and the numbers are wrong, the conversation is over.

Stack: Python/FastAPI + React.

All open source.
🔗 github.com/ksannedhi/Technical-Sales

Tomorrow: a 38-question Zero Trust maturity assessment — structured, scored, and exportable — run entirely on a laptop in the room.

#Cybersecurity #ExecutiveCommunication #RiskManagement #Presales #CVSS #CyberRisk #BoardReporting

---

## Post 6 — ZTA Advisor

"Are we Zero Trust?" is one of the most often asked questions in a presales conversation. And it is also one of the hardest to answer honestly in a room, on the spot, without a structured framework to stand behind.

So I built a tool to help guide that conversation: **ZTA Advisor**.

It's a 38-question assessment across 6 Zero Trust pillars — Identity, Devices, Networks, Applications, Data, Visibility — that produces a maturity score, a gap analysis table, a prioritised roadmap, and a Claude-written executive narrative. All exportable to PDF.

What it does:
- Captures org profile details and suggests relevant Zero Trust frameworks by region
- Runs a structured assessment interview across all 6 pillars
- Scores maturity deterministically (1–4) with labels in the selected framework's own language — SAMA CSF, CISA ZTMM, and ISO 27001 each use different terminology
- Generates a prioritised remediation roadmap based on actual gaps — each action tagged to the frameworks it satisfies
- Produces an executive narrative using Claude, contextualised to the org's industry and selected frameworks
- Exports everything to PDF, including presales session notes

One thing I cared about from the beginning: the platform should work even without an API key. That becomes important in government environments, restricted networks, or anywhere outbound AI access simply isn't allowed during workshops.

Frameworks relevant to GCC organisations — including SAMA CSF — are built in, with geo-aware suggestions that recommend the right framework based on the org's operating region.

Frameworks supported: CISA ZTMM v2.0, NIST SP 800-207, DoD ZT Reference Architecture, NCSC Zero Trust Principles, ENISA ZT Guidelines, NIS2, SAMA CSF, ISO/IEC 27001:2022.

Stack: Node/Express ESM + React + Anthropic Claude + Puppeteer.

All open source.
🔗 github.com/ksannedhi/Technical-Sales

Tomorrow: one org profile mapped to 14 GCC regulatory frameworks simultaneously — coverage matrix, roadmap, and PDF in one run.

#ZeroTrust #ZTA #Cybersecurity #Presales #CISA #NIST #GCC #AI #AnthropicClaude

---

## Post 7 — Regulatory Lens

GCC organizations don't typically live in one regulatory framework.
Example: a Saudi bank that processes UAE resident data, runs a payment platform, and operates OT systems is simultaneously subject to:
- NCA ECC
- SAMA CSF
- Saudi PDPL
- UAE PDPL
- IEC 62443

Most compliance scoping calls spend the first couple of hours just figuring out which frameworks apply and why. **Regulatory Lens** does that in seconds — then runs the gap analysis across all of them in parallel.

What it does:
- Takes an org profile (geography, sector, data types, characteristics) and recommends applicable frameworks with rationale
- Runs parallel Claude analysis across 24 control domains against up to 14 frameworks simultaneously
- Displays a unified coverage matrix: Full / Partial / Not-addressed per domain per framework
- Click any cell to expand — implementation guidance, typical technologies, per-framework requirements
- Captures current implementation posture before generating a prioritized roadmap
- Exports to Excel and PDF
- Change Tracker tab for assessing the impact of framework version updates
- Accepts custom framework PDFs — extracts control text and includes it in the next run

Frameworks built in: NCA ECC 2024, SAMA CSF, CBK, ISO 27001:2022, NIST CSF 2.0, UAE NIAF, UAE PDPL, Qatar PDPL, Saudi PDPL, Kuwait NBCC, PCI DSS 4.0.1, IEC 62443, SOC 2, Qatar NIAS V2.1

Bringing the wrong framework into a scoping call wastes everyone's time and can damage credibility. This tool helps to get it right before the call.

Stack: Node/Express ESM + React + Anthropic Claude + Puppeteer
License: Open source

🔗 https://lnkd.in/dgnbPTvQ → projects/regulatory-lens

Tomorrow: finding the gaps an auditor will find — before the auditor does. No internet, no AI API required.

#Compliance #GCC #NCAECC #SAMA #ISO27001 #NIST #Cybersecurity #Presales #RegulatoryCompliance

---

## Post 8 — Security Controls Gap Analyzer

Every customer has a spreadsheet of security tools.

Firewall, SIEM, EDR, email gateway, PAM — column after column. Almost none of them know which framework controls those tools actually cover, which controls are partially addressed, and where the gaps are that an auditor will find before they do.

**Security Controls Gap Analyzer** answers that question — with no internet connection and no AI API.

Upload a tools-to-controls mapping CSV. Get back:
- Executive summary with one-click copy
- Domain coverage table: tools mapped, controls covered / partial / missing, status badge per domain
- Every framework control gap with severity, status, and specific vendor recommendations
- Redundancy audit: tool pairs mapped to the same objective, classified as likely-redundant or healthy overlap, with estimated USD savings
- 3-phase migration roadmap derived from the actual gaps and redundancies found — not a generic template
- JSON/CSV export of the full result
- Browser print-to-PDF

The engine is fully deterministic. Same inputs, same analysis, every time. No AI call. No external dependency.

That matters in a demo. When you're showing a prospect their own tools mapped to a framework they're being audited against — NIST CSF 2.0 or CIS Controls v8.1, or both simultaneously — you want the output to be reproducible and explainable. Not a black box that gave different numbers last Tuesday.

Built to run in a customer briefing room with no Wi-Fi and no apologies.

Stack: Python/FastAPI + Vite/React. Fully offline.
License: Open source

🔗 github.com/ksannedhi/Technical-Sales → projects/security-controls-gap-analyzer

Tomorrow: rough prompt to clean Excalidraw architecture diagram — zero-trust, SASE, OT segmentation — in seconds.

#Cybersecurity #GapAnalysis #Compliance #Presales #NCAECC #ISO27001 #NISTCSF #SecurityControls

---

## Post 9 — Network Security Diagrammer

I've been using Excalidraw for a while. The hand-drawn aesthetic is what got me — diagrams that look like thinking rather than finished product. Loose enough to invite feedback, clean enough to communicate structure.

The problem is Excalidraw is a blank canvas. You still have to place every box, every arrow, every zone by hand. And for network and security architectures — zero trust, SASE, OT segmentation, DMZ layouts — that takes time nobody has in a customer meeting.

So I built **Network and Cybersecurity Diagrammer** — a tool purpose-built for this domain that turns a plain-language prompt into a structured architecture diagram, rendered live in Excalidraw.

Type a prompt. The backend classifies it, selects an architecture pattern, and builds a full model: zones, components, connections, coordinates, arrow paths — all computed before Excalidraw sees a single element. Excalidraw's role is the canvas: pan, zoom, in-canvas editing, and export. The diagram structure is entirely the app's work.

What it does:
- Classifies the prompt and matches it to a known security architecture pattern — zero trust, SASE, DMZ, OT/IT convergence, segmented data center, and more
- Falls back to Claude Sonnet for novel or complex prompts that don't match a static pattern
- Follow-up prompts refine the current diagram — "add a SIEM", "remove the WAF", "show the jump server"
- Exports to PNG, SVG, or .excalidraw file — editable and presentation-ready
- Works without an API key — pattern matching runs entirely locally

I use it both ways: to prep a reference architecture before a meeting, and live when a customer says "can you show me what that looks like?"

The hand-drawn look still helps in that second scenario. It signals the diagram is a starting point, not a commitment — exactly the right tone for a scoping conversation.

Stack: Node/Express + TypeScript + React + Anthropic Claude (optional)
License: Open source

🔗 github.com/ksannedhi/Technical-Sales → projects/network-security-diagrammer

Tomorrow: which vendor, for which customer, and exactly why — transparently scored, fully offline, no black box.

#Cybersecurity #NetworkSecurity #ZeroTrust #SASE #Presales #Excalidraw #Architecture #AI

---

## Post 10 — VendorAdvisor

Cybersecurity moves fast. New categories, new vendors, new product names — keeping track of what solves what is a full-time job on its own.

**VendorAdvisor** is a conversational chatbot built to help with exactly that — offline, no AI API, no data leaving your machine.

Ask it anything:
- "Explain what IGA is" — it explains the problem the category solves, then shows the top products
- "What does Palo Alto Networks make?" — structured vendor portfolio view
- "Compare Falcon Insight XDR against Cortex XDR" — scored side-by-side comparison
- "Recommend SIEM for a bank with FedRAMP and on-prem deployment" — filtered and scored against your constraints
- "How can I secure my manufacturing plant from OT threats?" — maps the problem to the right solution category

Every recommendation is scored across seven weighted dimensions: deployment fit, feature match, integration fit, compliance fit, market position, cost, and operational complexity. The reasoning is visible — not a score that came from somewhere unexplained.

Say "bank" or "fintech" and it infers PCI DSS. Mention data residency or data sovereignty and it treats that as an on-prem constraint, filtering out SaaS-only products automatically. If nothing in the dataset fits your constraints, it tells you that — rather than recommending something that doesn't qualify.

90+ products. 36 categories. Fully offline.

Stack: Python/Streamlit
License: Open source

🔗 github.com/ksannedhi/Technical-Sales → projects/vendor-advisor

Tomorrow: the last tool — the one that reads your proposal before the customer does.

#Cybersecurity #VendorSelection #Presales #SIEM #XDR #GCC #Compliance #SalesEngineering

---

## Post 11 — Presales Deal Reviewer

How many deals have slipped because the proposal addressed something the RFP didn't ask for — and missed something it required?

It happens more than anyone admits. Not because the presales engineer wasn't thorough. Because there's no systematic way to cross-reference a 40-page RFP against a 30-page proposal at 11pm the night before submission.

**Presales Deal Reviewer** does that cross-reference — offline, in under a minute.

What it does:
- Detects solution families in scope — firewall, SIEM, XDR, email security, NDR, DDoS, OT/ICS — and tailors the review to each
- Reviews deal readiness across 3 weighted gates: Requirements (45%), Architecture (25%), Proposal (30%)
- Names specific assumption sentences from the proposal, not generic flags
- Compares SLA response times between RFP and proposal and flags mismatches
- Identifies regulated-sector deals and names the applicable compliance frameworks
- Checks government procurement certifications: FIPS 140-2, TAA, Common Criteria
- Flags firewall subscription gaps and missing central management for multi-site deployments
- Shows a score delta banner on re-run — so you can see whether edits actually moved the needle

Accepts .txt, .md, .docx, .pptx, .pdf, and .zip. Fully offline. No AI API.

Stack: Python/wsgiref, server-rendered HTML.

Every finding traces back to something in the input text. No hallucinated concerns. Because if you're going to tell a presales engineer their deal has a gap, you need to be able to show them exactly where.

That's the last of the 10 tools. All built this year. All open source.
🔗 github.com/ksannedhi/Technical-Sales

I'm a presales engineer, not a software developer. I didn't have a team, a budget, or a product roadmap. I had a problem list I'd been carrying for years and an AI coding agent that could finally keep up.

10 tools in two months. Every one of them solving something real.

If you're in presales, security consulting, or any field where you've been waiting for someone else to build the tool you actually need — you don't have to wait anymore. The barrier isn't what it was.

Build the thing.

#Presales #Cybersecurity #DealReview #SIEM #XDR #SalesEngineering #ProposalReview #OpenSource #BuildInPublic
