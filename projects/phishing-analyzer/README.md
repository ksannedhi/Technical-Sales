# Phishing Analyzer

Demo-first AI-powered phishing email analyzer built for CISO and presales conversations.

## Stack

- React + Vite frontend
- Node + Express backend
- OpenAI Responses API for structured analysis
- Hybrid rule-based + AI reasoning flow
- Puppeteer-based PDF export layer

## MVP goals

- Paste raw email or upload `.eml`
- Analyze phishing, BEC, malware delivery, credential harvesting, impersonation, and invoice fraud cues
- Return a polished risk report in under 10 seconds
- Map findings to fixed NCA ECC controls with AI-written explanations
- Export a generic Phishing Analyzer PDF report

## Getting started

1. Copy `.env.example` to `.env`
2. Add your `OPENAI_API_KEY`
3. Start the app in one click:
   - Double-click `Launch Phishing Analyzer.cmd`
4. This opens separate backend and frontend windows
5. UI URL:
   - `http://localhost:5173`

Alternative terminal flow:

1. Install dependencies:
   - `npm install`
2. Start both frontend and backend together:
   - `npm run dev`

Endpoints:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## What makes the analysis trustworthy

- Deterministic checks establish baseline evidence before any model reasoning is applied
- OpenAI structured output returns schema-validated JSON for summaries, findings correlation, MITRE mapping, ECC gap text, and recommendations
- A deterministic override can replace weak or over-aggressive model output when the email evidence clearly points elsewhere
- The UI now shows the analysis source so it is clear whether a result came from:
  - `OpenAI + guardrails`
  - `Deterministic analysis`
  - `Deterministic override`

## Current safeguards

- Request body limit is `5mb` to better handle larger enterprise `.eml` files
- `/api/analyze` includes a lightweight in-memory rate limit to protect demo usage
- Attachment detection is header-based to reduce false positives from normal body text
- The PDF ECC table is sourced from `eccComplianceGaps` so the report preserves the richer compliance narrative
- The OpenAI model can be changed via `OPENAI_MODEL`

## Language support

- Technical indicators such as links, headers, reply-to mismatches, authentication failures, and attachment cues work regardless of language
- English-language social-engineering heuristics are stronger than non-English ones today
- Non-English phishing emails can still be caught, especially when technical signals are present, but multilingual deterministic coverage is a future improvement area

## Documentation

- Full product spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)
