# Network and Cybersecurity Diagrammer

Local app that turns rough network and security prompts into clean architecture diagrams. The full diagram — topology, zones, component placement, and arrow routing — is built by this app. Excalidraw is used only as the interactive canvas to view, edit, and export the result.

## Why Not Just Use Excalidraw's "Text to Diagram"?

Excalidraw has a built-in AI feature, but it has real limitations for security and network work:

- **10 diagrams per day** on the free tier — not enough for active design sessions
- **No domain awareness** — it draws generic boxes; it has no concept of DMZ, zero trust zones, policy enforcement points, or security control placement rules
- **No architectural guardrails** — it won't catch an identity provider sitting inside an enforcement zone, upward connections that violate flow direction, or isolated components with no connections
- **No follow-up editing** — each prompt starts from scratch; there is no way to say "add a SIEM" and have it update the existing diagram
- **Prompts leave your machine** — every request goes to Excalidraw's servers; security-sensitive architecture descriptions stay local with this app

This app is purpose-built for network and security diagrams. Common patterns (zero trust, WAF in DMZ, SIEM, email security, DDoS protection, and more) are modelled locally with no API call needed. When you do use an API key, it goes directly to Anthropic under your own account with no per-day cap.

## Use Cases

- **Presales and proposals** — drop a clean architecture diagram into an HLD, SoW, or customer deck in seconds without opening Visio or draw.io
- **Live customer sessions** — sketch an architecture on the spot during a call; export and hand it to the customer before the meeting ends
- **Design exploration** — iterate quickly through variants ("add a WAF", "separate the monitoring zone") using follow-up prompts instead of redrawing
- **Training and onboarding** — generate labelled reference diagrams for common security patterns to explain zero trust, DMZ, SIEM, and similar concepts
- **Security review prep** — produce a clear diagram of the current-state architecture to anchor a gap analysis or threat model discussion

## What It Does

The app is designed to:

- infer architectural intent from messy prompts
- choose a pattern-first architecture model for known prompt families
- use a structured model fallback for low-confidence or generic cases
- keep diagrams simple, conceptual, and presentation-friendly
- preserve explicit entities named in the prompt
- let follow-up prompts refine the current architecture

## How It Works

The current pipeline is:

1. analyze the prompt
2. classify it into a supported pattern family
3. build a deterministic architecture model for strong matches, or use a validated model fallback for weak/generic cases
4. compute all positions, dimensions, and arrow paths locally
5. convert the finished layout to Excalidraw's element format and place it on the canvas

Excalidraw contributes nothing to diagram structure — it is the display and export layer only. Claude (Anthropic) assists with prompt analysis, follow-up editing, and structured fallback generation when an API key is available.

## Run

```bash
npm install
npm run dev
```

On Windows you can also double-click `Launch Network and Cybersecurity Diagrammer.cmd`.

Default local URLs:

- Frontend: `http://localhost:5174`
- Backend: `http://localhost:8787`

## Claude Setup

1. Create `.env` in the project root, or copy from `.env.example`.
2. Add values like:

```bash
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_ANALYZE_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_GENERATE_MODEL=claude-sonnet-4-6
PORT=8787
```

Notes:

- **without `ANTHROPIC_API_KEY`**, the app runs fully offline using 16+ built-in security and network patterns. For well-known prompt families (zero trust, WAF in DMZ, SIEM, DDoS, email security, and more), output quality is identical to the API-key path — the same zone structure, layout engine, and architectural guardrails apply
- **with `ANTHROPIC_API_KEY`**, Claude extends coverage to prompts that don't match a known pattern, vendor-specific architectures (AWS, Azure, Exchange, etc.), and follow-up editing of existing diagrams
- the architecture model and diagram layout are always computed locally — Excalidraw is the canvas only

## Current UX

- quick-start chips on the homepage submit a sample prompt directly without typing
- main prompt clears on submit
- follow-up prompt clears on submit
- prompt history remains visible
- ambiguous prompts require confirmation before generation
- bad prompts offer a secure alternative
- Excalidraw handles export through its own menu

## Current Focus

The main areas still being refined are:

- benchmark-driven tuning for more prompt families
- stronger summaries and titles for edge cases
- visual polish for dense or highly connected diagrams
- broader coverage for niche or mixed-domain prompts

## Documentation

- Product spec: [product-spec.md](product-spec.md)
