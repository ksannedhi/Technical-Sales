# Multi-Vendor Decision Copilot — Product Spec

## 1. Purpose

Multi-Vendor Decision Copilot is a customer-facing cybersecurity recommendation application that helps users:

- understand what a cybersecurity category or specific product is, in plain English
- compare named products or vendors side by side with transparent scoring
- get ranked vendor or product recommendations for a security problem or category
- see transparent limits when the dataset cannot support a reliable answer

The product is designed to prefer honesty over false precision. It is fully offline and deterministic — no external AI API.

## 2. Product Goals

The system must:
- translate natural-language cybersecurity questions into a supported intent
- explain cybersecurity categories and products from the dataset before recommending vendors
- provide transparent recommendations based on local structured data
- score products across seven weighted dimensions (deployment, features, integrations, compliance, market position, cost, complexity)
- infer compliance requirements from industry context (e.g. banking → PCI DSS) and surface them transparently without conflating them with explicit hard constraints
- interpret data residency and sovereignty language as an on-prem deployment requirement
- show contextual category briefs before vendor tables so users understand what they are evaluating
- support product-level comparison when explicit product records exist
- support vendor-level recommendations when category coverage exists but product coverage does not
- return `insufficient_data` when the dataset cannot support a reliable answer, with a reason code that distinguishes constraint failure from unknown category

The system must not:
- fabricate product records, vendor capabilities, or comparison outcomes
- silently fall back from a named comparison to a generic category ranking
- imply confidence beyond what the dataset supports

## 3. Primary Users

- Customer-facing buyers evaluating cybersecurity solutions
- Solution architects and presales teams guiding customers
- Security leaders exploring categories, vendors, and product fit

## 4. Core Query Intents

The application supports eight intents.

### 4.1 Category Explain
Used when the user asks what a category is, without naming a vendor.

Examples:
- `Explain IGA`
- `What is SIEM?`
- `Tell me about XDR`
- `Describe PAM`

Expected behavior:
- identify the category from the query
- display the category full name, plain-English description, and problems it solves
- show the top 3 products in an expandable table

### 4.2 Lookup — Vendor
Used when the user asks about a specific vendor.

Examples:
- `Tell me about Varonis`
- `What Fortinet makes?`
- `You know CrowdStrike?`

Expected behavior:
- show vendor name, covered categories, regions, and deployment models as headline metadata
- generate a plain-English intro sentence listing the vendor's categories
- show all known products with market position and deployment
- flag categories in vendor metadata that have no product records

### 4.3 Lookup — Product
Used when the user asks about a specific product.

Examples:
- `What is Prisma Cloud?`
- `Tell me about FortiGate NGFW`

Expected behavior:
- show the product name as headline with vendor, market position, and deployment as caption
- open with a product-specific sentence: `{Product} is a {CATEGORY} solution that {description}`
- list key capabilities as bullet points

### 4.4 Comparison
Used when the user compares named products or vendors explicitly.

Examples:
- `Compare QRadar SIEM against Splunk Enterprise Security`
- `Compare Falcon Insight XDR against Cortex XDR`

Expected behavior:
- compare only named items that exist in the dataset
- resolve shared category across compared products for consistent scoring
- return `insufficient_data` if any named item is missing or excluded by hard constraints
- never silently switch to a generic recommendation

### 4.5 Single-Category Recommendation
Used when the user asks for recommendations in a supported category.

Examples:
- `Recommend CNAPP options for a cloud security program`
- `How can I secure my manufacturing plant from OT threats?`
- `Any vendor recommendations for a firewall?`

Expected behavior:
- map the query to one primary supported category
- display an expanded category brief (plain-English description) before the vendor table
- rank matching product records by weighted score
- show top recommendation and up to five ranked products with position, score, deployment, and features
- show score breakdown expander when hard constraints are active

### 4.6 Vendor-Category Recommendation
Used when a category exists in vendor metadata but has no product records.

Expected behavior:
- return vendor-level advisory recommendations only
- confidence is capped at `low-to-medium`

### 4.7 Stack
Used when the query spans more than one solution category.

Expected behavior:
- evaluate each category independently
- return a solution stack with one recommended product per category
- flag categories with insufficient data inline

### 4.8 Insufficient Data
Used when the query cannot be supported reliably. Three distinct sub-cases with different rendering:

| `reason_code` | Cause | UI behaviour |
|---|---|---|
| `constraint_excluded` | Category found, all products eliminated by hard constraints | State the category is supported; explain constraints eliminated all options; suggest relaxing them. Do NOT show the supported-categories list. |
| `missing_products` | Named comparison targets not in dataset | State which products are missing. Do NOT show the supported-categories list. |
| `unknown_category` | Query could not be resolved to any category or vendor | Show supported categories and suggested alternative prompts. |

## 5. Canonical Response Modes

Every engine response returns one of these modes:

| Mode | Description |
|---|---|
| `category_explain` | Category description with top products |
| `lookup` | Vendor or product profile |
| `comparison` | Side-by-side named product comparison |
| `single_category` | Ranked products for one category |
| `vendor_category` | Vendor-level advisory when no product records exist |
| `stack` | Multi-category solution stack |
| `insufficient_data` | Cannot answer reliably |

### 5.1 Shared Fields
All responses include when applicable: `mode`, `query`, `confidence`, `data_gaps`, `constraints`, `excluded_products`.

The `constraints` object always includes `inferred_compliance` (list of compliance tags derived from industry context) alongside `deployment`, `region`, `compliance`, and `integrations`. Inferred tags are displayed separately in the UI and affect scoring but do not trigger hard exclusions.

### 5.2 Category Explain Response
Fields: `mode`, `query`, `solution_categories`, `category`, `full_name`, `what_it_is`, `problems_it_solves`, `top_products`, `confidence`

### 5.3 Lookup Response
Fields: `mode`, `query`, `lookup_type` (`vendor` or `product`), `vendor`, `vendor_profile`, `capability_summary`, `confidence`

Product lookup adds: `product_name`, `market_position`, `primary_category`, `category_full_name`, `category_what_it_is`

Vendor profile includes: `categories`, `category_gaps`, `regions`, `deployment_models`, `products` (with `market_position`), `features`

### 5.4 Comparison Response
Fields: `mode`, `query`, `solution_categories`, `constraints`, `comparison_results`, `missing_vendors`, `top_recommendation`, `excluded_products`, `data_gaps`, `confidence`

### 5.5 Single-Category Response
Fields: `mode`, `query`, `solution_categories`, `category_full_name`, `category_brief`, `constraints`, `top_recommendation`, `ranked_products`, `excluded_products`, `data_gaps`, `confidence`

### 5.6 Vendor-Category Response
Fields: `mode`, `query`, `solution_categories`, `constraints`, `top_recommendation`, `ranked_vendors`, `data_gaps`, `confidence`

### 5.7 Stack Response
Fields: `mode`, `query`, `solution_categories`, `constraints`, `solution_stack`, `excluded_products`, `data_gaps`, `confidence`

### 5.8 Insufficient-Data Response
Fields: `mode`, `query`, `reason`, `reason_code`, `solution_categories`, `supported_categories`, `suggested_queries`, `excluded_products`, `confidence`

## 6. Intent Resolution Rules

Priority order:
1. `comparison` — explicit comparison trigger words or two or more named targets
2. `lookup` — named vendor with no category signal, or vendor capability question
3. `category_explain` — explain/describe/what-is trigger + known category + no vendor named
4. `recommendation` / `stack` — category or problem signal without lookup trigger
5. `insufficient_data` — no category, vendor, or product can be resolved

### 6.1 Constraint Extraction

Beyond category and vendor detection, `parse_query` extracts constraints from natural language:

| Signal | Extracted as |
|---|---|
| `on-prem`, `on prem` | `required_deployment = "On-Prem"` |
| `data residency`, `data sovereignty`, `data localisation`, `in-country data` | `required_deployment = "On-Prem"` |
| `hybrid` | `required_deployment = "Hybrid"` |
| `saas` | `required_deployment = "SaaS"` |
| `gcc`, `middle east`, `saudi`, `uae` | `required_region = "Middle East"` |
| Explicit compliance terms (FedRAMP, HIPAA, PCI DSS, SOC 2, ISO 27001) | `required_compliance` |
| Industry terms → compliance inference | `inferred_compliance` (scoring only, not hard exclusions) |

Industry → compliance inference map:

| Industry terms | Inferred tag |
|---|---|
| bank, banking, financial institution, fintech | PCI DSS |
| healthcare, hospital, clinic, medical, health system | HIPAA |
| federal government, government agency, DoD | FedRAMP |

## 7. Scoring Model

Seven weighted dimensions, each scored 0–100:

| Dimension | Weight | Scoring basis |
|---|---|---|
| Deployment Fit | 25% | Exact match=100, partial=85 (Hybrid for On-Prem request), mismatch=25, unconstrained=60 |
| Feature Match | 20% | 50 base + 10 per feature in matrix, capped at 100; 45 if no matrix entry; 40 if no category |
| Integration Fit | 15% | Fraction of required integrations found on the product |
| Compliance Fit | 15% | Fraction of required + inferred compliance tags found on the product; inferred tags score the same as explicit for ranking but do not trigger hard exclusions |
| Market Position | 15% | Leader=100, Strong=75, Challenger=50, unknown=60 |
| Cost | 5% | Low=90, Medium=70, High=45, unknown=50 |
| Operational Complexity | 5% | Low=90, Medium=70, High=45, unknown=50 |

Confidence levels:
- `high`: top product is Leader, two or more ranked products, no hard constraints
- `medium`: top product is Leader or Strong, two or more ranked products
- `low-to-medium`: otherwise

## 8. Data Sources

Local files in `data/`:

| File | Purpose |
|---|---|
| `products.json` | 85+ product records with categories, deployment, compliance, integrations, pricing, complexity, market position |
| `vendors.json` | Vendor category coverage and regional availability |
| `categories.json` | Supported category list |
| `categories_metadata.json` | Plain-English descriptions for 36 categories including full name, what it is, and problems it solves |
| `vendor_feature_matrix.json` | Per-vendor, per-category feature summaries |
| `scoring_weights.json` | Weighted scoring model configuration |
| `hard_exclusions.json` | Hard-filtering rules applied before scoring |
| `problem_to_tool_mapping.json` | Problem-phrase to category mapping |

## 9. Hard Exclusion Rules

Rules in `hard_exclusions.json` that, when active, eliminate a product before scoring:

| Rule | Condition |
|---|---|
| `exclude_if_required_onprem_and_product_saas_only` | On-Prem required, product is SaaS-only |
| `exclude_if_required_compliance_missing` | Product lacks one or more required compliance tags |
| `exclude_if_product_not_available_in_region` | Vendor not tagged for required region |
| `exclude_if_required_integration_missing` | Product lacks one or more required integrations |

## 10. UI Requirements

### 10.1 Page Structure
- Custom HTML header with bottom border separating title from input area
- Text area with border, shadow, and focus ring
- Analyze button (primary, full width)
- Example prompt buttons below Analyze; active button shown in primary color
- Results section rendered below a divider
- Session history with expandable items that re-render full results

### 10.2 Rendering by Mode

| Mode | Rendering |
|---|---|
| `category_explain` | Category full name as heading → plain-English description → problems list → top products table (expandable) |
| `lookup` (vendor) | Vendor name as heading → categories intro sentence → products table with Position column → category gaps footnote |
| `lookup` (product) | Product name as heading → vendor/position/deployment caption → `Product is a CATEGORY solution that...` sentence → key capabilities list |
| `single_category` | Category brief expander (open by default) → Best Fit headline → Weighted Comparison table → Score Breakdown when constraints active |
| `comparison` | Vendor Comparison table → top match or tied callout → missing vendor warning |
| `vendor_category` | Vendor-Level Recommendations table |
| `stack` | Per-category product recommendation with inline insufficient-data warnings |
| `insufficient_data` | Branches on `reason_code`: `constraint_excluded` → category name + constraint relaxation suggestion (no category list); `missing_products` → missing names only; `unknown_category` → supported categories + suggested prompts |

### 10.3 Transparency Section
Shown after every result when applicable:
- Detected Constraints (deployment, region, compliance, integrations, and inferred compliance labelled separately as "Compliance — inferred from industry context")
- Data Gaps (only when compliance, integration, or inferred compliance is active)
- Excluded Products expander

## 11. Testing Requirements

Automated tests in `tests/test_engine.py` cover:
- intent resolution for all modes
- lookup behavior for vendors and products
- named comparison safety (missing products return `reason_code = missing_products`)
- recommendation routing by category
- hard exclusion filtering
- constraint-excluded path returns `reason_code = constraint_excluded`
- confidence level assignment
- score breakdown correctness
- region-constraint routing

## 12. Known Gaps and Next Steps

### Data
- Integration metadata is missing for one product: Stellar (TXOne Networks / OT Security)
- 25 vendor-category pairs across 15 vendors have no product records (e.g. Cisco SIEM, CrowdStrike Cloud Security, Varonis Data Security, Zscaler DLP, Yubico Passwordless); these fall back to `vendor_category` advisory mode

### Product
- No persistent history across app restarts

## 13. Key Files

| File | Role |
|---|---|
| `app.py` | Streamlit UI — prompt handling, result rendering, session history |
| `src/mvdc/engine.py` | `DecisionEngine` — intent parsing, scoring, all response builders |
| `data/*.json` | All structured data |
| `tests/test_engine.py` | Unit tests |
| `start.cmd` | Windows one-click launcher |
