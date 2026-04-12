# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the app:**
```bash
python -m streamlit run app.py  # http://localhost:8501
```

**With PYTHONPATH explicitly set (if imports fail):**
```bash
set PYTHONPATH=src
python -m streamlit run app.py
```

**Run tests:**
```bash
set PYTHONPATH=src
python -m unittest discover -s tests
```

**Install dependencies:**
```bash
pip install -r requirements.txt  # streamlit only
```

## Architecture

A **Streamlit-based cybersecurity vendor recommendation copilot** that maps customer problems to tool categories, compares products, and handles honest `insufficient_data` responses when the local dataset can't support a reliable answer. Entirely local — no external AI API.

```
app.py                          Streamlit UI — prompt input, response rendering, session history
        ↓
src/mvdc.py                     DecisionEngine — intent classification + response generation
        ↓
data/products.json              Primary product recommendation dataset
data/vendors.json               Vendor lookup and vendor-level category fallback
data/vendor_feature_matrix.json Feature summaries for selected categories
data/scoring_weights.json       Weighted scoring model configuration
data/hard_exclusions.json       Hard-filtering rules
```

**Session history** is stored in a `@st.cache_resource` list — shared across browser tabs for the current process and resets when the app restarts.

## Key design decisions

- **No external AI API** — all recommendation and comparison logic is deterministic, rule-based, and data-driven. No OpenAI, no Anthropic. Fully offline.
- **Streamlit for UI** — chosen for rapid iteration; no separate frontend build step.
- **`@st.cache_resource` for engine** — `DecisionEngine` is instantiated once and reused across reruns to avoid reloading all JSON data files on every interaction.
- **Transparent constraint handling** — when data is insufficient, the engine explicitly returns `insufficient_data` rather than hallucinating an answer.
- **PYTHONPATH=src** — all `src/` imports require this. Streamlit's working directory is the project root, so `src/` must be on the path.

## Supported intents

| Intent | Example |
|--------|---------|
| `lookup` | `Tell me about Varonis` / `You know Cortex?` |
| `comparison` | `Compare QRadar SIEM against Splunk Enterprise Security` |
| `single_category` | `Recommend CNAPP options` |
| `vendor_category` | `What about SASE from Palo Alto?` |
| `insufficient_data` | Explicit fallback when dataset can't support a reliable answer |

## Environment variables

No `.env` file required — fully local, data-driven.

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHONPATH` | must be `src` | Required for `mvdc` module import |

## Ports

| Service | Port |
|---------|------|
| Streamlit app | `8501` (Streamlit default) |

## Key project files

- `app.py` — Streamlit UI, session history, prompt handling
- `src/mvdc.py` — `DecisionEngine`: intent classification, scoring, response generation
- `data/products.json` — product recommendation dataset
- `data/vendors.json` — vendor profiles and category mappings
- `data/vendor_feature_matrix.json` — per-category feature summaries
- `data/scoring_weights.json` — weighted scoring configuration
- `data/hard_exclusions.json` — hard-filtering rules
- `docs/PROJECT_SPEC.md` — full product and behaviour spec
- `tests/` — unit tests for engine logic
- `requirements.txt` — `streamlit` only

## Non-goals

- External AI API integration (intentionally offline)
- Persistent conversation history across restarts
- Multi-user / SaaS deployment
- Real-time vendor data sync (data files are static)
