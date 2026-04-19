# Network Security Diagrammer

Local app for turning rough network and security prompts into clean, editable Excalidraw diagrams.

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
4. lay out the diagram locally
5. render the scene in Excalidraw

OpenAI assists with prompt analysis, follow-up editing, and structured fallback generation when an API key is available. Layout and rendering remain local to the app.

## Run

```bash
npm install
npm run dev
```

On Windows you can also double-click `Launch Network Security Diagrammer.cmd`.

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## OpenAI Setup

1. Create `.env` in the project root, or let the launcher copy it from `.env.example`.
2. Add values like:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=8787
```

Notes:

- without `OPENAI_API_KEY`, the app falls back to local prompt analysis and local follow-up edit handling
- with `OPENAI_API_KEY`, OpenAI is used for prompt analysis and follow-up editing
- the architecture model and Excalidraw layout remain deterministic and local

## Current UX

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
