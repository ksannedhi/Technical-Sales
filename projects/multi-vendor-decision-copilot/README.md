# Multi-Vendor Decision Copilot

Customer-facing cybersecurity recommendation app with transparent filtering, weighted scoring, and category-aware explanations. Fully offline — no external AI API.

## What It Does

- Explains what a cybersecurity category is before recommending vendors (`Explain IGA`, `What is SASE?`)
- Explains specific products in plain English (`What is Prisma Cloud?`)
- Maps customer problems to supported cybersecurity tool categories
- Supports vendor lookup, product lookup, named comparison, category recommendations, and solution stacks
- Scores products across seven weighted dimensions: deployment fit, feature match, integration fit, compliance fit, market position, cost, and operational complexity
- Shows a contextual brief about the category before vendor recommendations
- Displays vendor profiles with per-product market position and flags categories with no product records
- Recognizes supported categories even when only vendor metadata exists
- Handles vendor capability questions such as `Can Varonis provide DSPM?` with a category-aware summary
- Infers compliance requirements from industry context (bank → PCI DSS, hospital → HIPAA) and surfaces them transparently without hard-excluding on inference
- Interprets data residency and sovereignty language as an on-prem deployment constraint, correctly excluding SaaS-only products
- Falls back to honest `insufficient_data` responses when the dataset cannot support a reliable answer, with distinct messaging for constraint failures vs unknown categories

## Documentation

- Product and behavior spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Supported Intents

| Intent | Example |
|---|---|
| `category_explain` | `Explain IGA`, `What is SIEM?`, `Tell me about XDR` |
| `lookup` — vendor | `Tell me about Varonis`, `What Fortinet makes?` |
| `lookup` — product | `What is Prisma Cloud?` |
| `comparison` | `Compare QRadar SIEM against Splunk Enterprise Security` |
| `single_category` | `Recommend CNAPP options for a cloud security program` |
| `vendor_category` | Vendor-level advisory when product records are absent |
| `stack` | Multi-category queries that span more than one solution area |
| `insufficient_data` | Explicit fallback when the dataset cannot answer reliably |

## Dataset

| File | Purpose |
|---|---|
| `data/products.json` | Primary product recommendation dataset (70+ products) |
| `data/vendors.json` | Vendor profiles and category mappings |
| `data/categories.json` | Supported category list |
| `data/categories_metadata.json` | Plain-English descriptions for all 34 categories |
| `data/vendor_feature_matrix.json` | Per-vendor, per-category feature summaries |
| `data/scoring_weights.json` | Weighted scoring model configuration |
| `data/hard_exclusions.json` | Hard-filtering rules (deployment, compliance, region, integration) |
| `data/problem_to_tool_mapping.json` | Problem-phrase to category mapping |

## Scoring Model

Seven weighted dimensions scored 0–100, producing a total score out of 100:

| Dimension | Weight |
|---|---|
| Deployment Fit | 25% |
| Feature Match | 20% |
| Integration Fit | 15% |
| Compliance Fit | 15% |
| Market Position | 15% |
| Cost | 5% |
| Operational Complexity | 5% |

## UI Notes

- Clicking a sample prompt runs analysis immediately without a second click on `Analyze`
- Active example button is highlighted in the primary color
- Session history is shared across tabs for the current process and clears when the app restarts
- Expanding a session history entry re-renders the full result, not a JSON dump
- Data Gaps section appears when compliance, integration, or inferred compliance is active
- `insufficient_data` responses distinguish constraint failures (all products excluded) from unknown categories — only unknown categories show the supported-categories list

## Run

```bash
python -m streamlit run app.py
```

Or use `start.cmd` on Windows.

## Test

```bash
set PYTHONPATH=src
python -m unittest discover -s tests
```
