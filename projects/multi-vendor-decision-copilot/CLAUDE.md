# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

**Start the app (Windows):**
```bash
start.cmd
```

**Or directly:**
```bash
set PYTHONPATH=src
python -m streamlit run app.py  # http://localhost:8501
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

A **Streamlit-based cybersecurity vendor recommendation copilot** — fully offline, no external AI API. Maps customer problems to tool categories, explains categories and products, compares vendors, and returns honest `insufficient_data` when the dataset can't support a reliable answer.

```
app.py                              Streamlit UI — prompt, rendering, session history
        ↓
src/mvdc/engine.py                  DecisionEngine — intent classification + all response builders
        ↓
data/products.json                  Primary product dataset (70+ products)
data/vendors.json                   Vendor profiles and category coverage
data/categories_metadata.json       Plain-English descriptions for all 34 categories
data/vendor_feature_matrix.json     Per-vendor, per-category feature summaries
data/scoring_weights.json           Weighted scoring model configuration
data/hard_exclusions.json           Hard-filtering rules
data/categories.json                Supported category list
data/problem_to_tool_mapping.json   Problem-phrase → category mapping
```

Session history is stored in a `@st.cache_resource` list — shared across browser tabs for the current process, resets on restart.

## Supported intents

| Intent | Trigger | Example |
|---|---|---|
| `category_explain` | explain/what-is + category, no vendor | `Explain IGA`, `What is SIEM?` |
| `lookup` (vendor) | vendor name, no category signal | `Tell me about Varonis`, `What Fortinet makes?` |
| `lookup` (product) | product name with what-is trigger | `What is Prisma Cloud?` |
| `comparison` | compare/vs/against + two named targets | `Compare QRadar SIEM against Splunk` |
| `single_category` | category or problem signal, no lookup trigger | `Recommend CNAPP options` |
| `vendor_category` | category exists in vendor data but no products | fallback |
| `stack` | multiple categories resolved from one query | `Recommend EDR and SIEM tools` |
| `insufficient_data` | dataset cannot support a reliable answer | explicit fallback |

## Intent resolution priority

1. `comparison` — explicit compare trigger or 2+ named targets
2. `lookup` — named vendor + no category signal, or vendor capability question
3. `category_explain` — explain/what-is trigger + known category + no vendor named
4. `recommendation` / `stack` — category or problem signal
5. `insufficient_data` — nothing resolved

## Scoring model

Seven weighted dimensions, each 0–100:

| Dimension | Weight |
|---|---|
| Deployment Fit | 25% |
| Feature Match | 20% |
| Integration Fit | 15% |
| Compliance Fit | 15% |
| Market Position | 15% |
| Cost | 5% |
| Operational Complexity | 5% |

Market position values: `leader` = 100, `strong` = 75, `challenger` = 50.

## Key design decisions

- **No external AI API** — all logic is deterministic and data-driven.
- **`category_explain` mode** — "Explain IGA"-style queries explain the category (from `categories_metadata.json`) then show top products, rather than jumping straight to a vendor table.
- **Product lookup** — "What is Prisma Cloud?" opens with a product-specific sentence built from category metadata, then lists key capabilities.
- **Vendor profile** — shows per-product market position, flags categories with vendor coverage but no product records (`category_gaps`).
- **Category brief in single_category** — an expandable "About {Category}" section appears before the vendor table so users understand what they are evaluating.
- **Score breakdown** — expander shown when the query includes hard constraints (deployment, compliance, integrations, region).
- **Data Gaps** — only shown when compliance or integration filtering is active; internal implementation messages are suppressed.
- **`@st.cache_resource` for engine** — `DecisionEngine` loads all JSON once and is reused across reruns.
- **PYTHONPATH=src** — required for `mvdc` module import. `start.cmd` sets this automatically.

## Key project files

| File | Role |
|---|---|
| `app.py` | Streamlit UI — all rendering functions, CSS injection, session history |
| `src/mvdc/engine.py` | `DecisionEngine` — parse_query, all intent handlers, scoring |
| `src/mvdc/__init__.py` | Package export |
| `data/products.json` | Primary product dataset |
| `data/vendors.json` | Vendor profiles |
| `data/categories_metadata.json` | Category descriptions (what it is, problems it solves) |
| `data/vendor_feature_matrix.json` | Per-vendor feature lists per category |
| `data/scoring_weights.json` | Scoring weight configuration |
| `data/hard_exclusions.json` | Hard-filtering rules |
| `tests/test_engine.py` | Unit tests |
| `start.cmd` | Windows one-click launcher |
| `PROJECT_SPEC.md` | Full product and behaviour spec |

## Adding a new category

1. Add the category name to `data/categories.json`
2. Add aliases to `CATEGORY_ALIASES` in `engine.py`
3. Add a metadata entry to `data/categories_metadata.json` (full_name, what_it_is, problems_it_solves)
4. Add product records to `data/products.json`
5. Add feature entries to `data/vendor_feature_matrix.json`
6. Add vendor entries to `data/vendors.json` if new vendors are involved

## Adding a new product

1. Add a record to `data/products.json` with: vendor, product, category (list), deployment, compliance, integration_support, pricing_tier, operational_complexity, market_position
2. Add the vendor to `data/vendors.json` if not already present
3. Add feature entries to `data/vendor_feature_matrix.json` for the relevant category

## Ports

| Service | Port |
|---|---|
| Streamlit app | 8501 |

## Non-goals

- External AI API integration (intentionally offline)
- Persistent conversation history across restarts
- Multi-user / SaaS deployment
- Real-time vendor data sync (data files are static)
