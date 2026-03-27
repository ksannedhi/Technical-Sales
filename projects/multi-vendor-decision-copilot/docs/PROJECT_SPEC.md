# Multi-Vendor Decision Copilot Spec

## 1. Purpose

Multi-Vendor Decision Copilot is a customer-facing cybersecurity recommendation application that helps users:
- understand a cybersecurity category or vendor
- compare named products or vendors
- get vendor or product recommendations for a security problem or solution category
- see transparent limits when the dataset cannot support a reliable answer

The product is designed to prefer honesty over false precision.

## 2. Product Goals

The system must:
- translate natural-language cybersecurity questions into a supported intent
- provide transparent recommendations based on local structured data
- support product-level comparison when explicit product records exist
- support vendor-level recommendations when category coverage exists but product coverage does not
- support vendor and product lookup queries
- say `insufficient_data` when the dataset does not support a reliable answer

The system must not:
- fabricate product records, vendor capabilities, or comparison outcomes
- silently fall back from a named comparison to a generic category ranking
- imply confidence beyond what the dataset supports

## 3. Primary Users

Primary users:
- customer-facing buyers evaluating cybersecurity solutions
- solution architects and presales teams guiding customers
- security leaders exploring categories, vendors, and product fit

## 4. Core Query Intents

The application currently supports five intents.

### 4.1 Lookup
Used when the user asks about a specific vendor or product.

Examples:
- `Tell me about Varonis`
- `You know Cortex?`
- `What does Varonis do?`
- `What is Prisma Cloud?`

Expected behavior:
- return vendor or product profile
- include categories, known products, deployment models, regions, and known features if available
- when a vendor-specific capability question names a supported category, include a category support summary based on product and vendor metadata

### 4.2 Comparison
Used when the user compares named products or vendors.

Examples:
- `Compare QRadar SIEM against Splunk Enterprise Security`
- `Compare Falcon Insight XDR against Cortex XDR`

Expected behavior:
- compare only named products or vendors that exist in the dataset
- return `insufficient_data` if one or more named items are missing
- do not silently switch to a generic recommendation

### 4.3 Single-Category Recommendation
Used when the user asks for recommendations in a supported category with product records.

Examples:
- `Recommend CNAPP options for cloud security`
- `What about data security?`
- `Recommend OT security solutions`

Expected behavior:
- map the query to one primary supported category
- rank matching product records
- show top recommendation and ranked products

### 4.4 Vendor-Category Recommendation
Used when a category exists in vendor metadata but has no product records.

Examples:
- `What about SASE?`

Expected behavior:
- return vendor-level advisory recommendations only
- clearly state that product-level records are not yet available

### 4.5 Insufficient Data
Used when the query cannot be supported reliably.

Examples:
- `Compare FortiSIEM against QRadar SIEM` when `FortiSIEM` is missing
- unsupported or unmapped categories with no product or vendor coverage

Expected behavior:
- explain why the answer is unavailable
- show supported categories
- suggest alternative prompts

## 5. Canonical Response Modes

Every engine response must return one of these modes:
- `lookup`
- `comparison`
- `single_category`
- `vendor_category`
- `insufficient_data`

### 5.1 Shared Fields
All responses should include when applicable:
- `mode`
- `query`
- `confidence`
- `assumptions`
- `data_gaps`

### 5.2 Lookup Response
Fields:
- `mode`
- `query`
- `lookup_type` as `vendor` or `product`
- `vendor`
- `vendor_profile`
- `capability_summary`
- `assumptions`
- `data_gaps`
- `confidence`

### 5.3 Comparison Response
Fields:
- `mode`
- `query`
- `interpreted_problem`
- `solution_categories`
- `constraints`
- `comparison_results`
- `missing_vendors`
- `top_recommendation`
- `excluded_products`
- `assumptions`
- `data_gaps`
- `confidence`

### 5.4 Single-Category Response
Fields:
- `mode`
- `query`
- `interpreted_problem`
- `solution_categories`
- `constraints`
- `top_recommendation`
- `ranked_products`
- `excluded_products`
- `assumptions`
- `data_gaps`
- `confidence`

### 5.5 Vendor-Category Response
Fields:
- `mode`
- `query`
- `interpreted_problem`
- `solution_categories`
- `constraints`
- `top_recommendation`
- `ranked_vendors`
- `excluded_products`
- `assumptions`
- `data_gaps`
- `confidence`

### 5.6 Insufficient-Data Response
Fields:
- `mode`
- `query`
- `interpreted_problem`
- `solution_categories`
- `constraints`
- `reason`
- `excluded_products`
- `supported_categories`
- `suggested_queries`
- `assumptions`
- `data_gaps`
- `confidence`

## 6. Intent Resolution Rules

Intent resolution priority:
1. comparison
2. lookup
3. recommendation
4. insufficient data

Rules:
- if the query explicitly compares two or more named items, use `comparison`
- if the query asks about a named vendor or product and no category/problem intent dominates, use `lookup`
- if the query maps to a supported category or problem, prefer recommendation over lookup
- if the dataset lacks the named items required for a comparison, return `insufficient_data`

## 7. Recommendation Rules

### 7.1 Product-Level Recommendation
Use when product records exist for the resolved category.

### 7.2 Vendor-Level Recommendation
Use when:
- the category is supported by vendor metadata
- but product records are not available for that category

### 7.3 Safety Rules
The system must:
- never invent missing products
- never compare a missing named product to an available one as if the comparison were complete
- never present a generic fallback as a valid answer to a named-product query

## 8. Data Sources

Current local files in `data/`:
- `vendors.json`
- `products.json`
- `categories.json`
- `problem_to_tool_mapping.json`
- `vendor_feature_matrix.json`
- `scoring_weights.json`
- `hard_exclusions.json`

### 8.1 Data Reality
Current strengths:
- named vendor coverage
- named product coverage for some major categories
- some category-level vendor coverage beyond product records

Current weaknesses:
- sparse feature coverage
- limited product attributes beyond name, category, and deployment
- incomplete category coverage
- inconsistent depth across categories

## 9. Known Functional Gaps

The following gaps remain:
- many categories still lack product-level depth
- some categories exist only at vendor level
- comparison quality is limited where feature matrices are sparse
- compliance, integrations, pricing, and operations metadata are still incomplete in the final dataset
- the frontend is a prototype and should be treated as such

## 10. UI Requirements

The UI should include:
- application title and short descriptor
- prompt area
- analyze button above prompt suggestions
- example prompts below the analyze button
- one-click sample prompts that trigger analysis immediately
- adaptive rendering based on response mode
- session history for the current running app session
- transparency section for assumptions, gaps, exclusions, and constraints when available

Rendering by mode:
- `lookup`: vendor/product profile
- `comparison`: side-by-side comparison table
- `single_category`: ranked products and best fit
- `vendor_category`: ranked vendor-level recommendations with explicit caveat
- `insufficient_data`: reason, supported categories, and suggested prompts

## 11. Testing Requirements

The project should include automated tests for intent resolution, lookup behavior, named comparison safety, recommendation routing, and insufficient-data fallbacks.

## 12. Recommended Next Steps

### 12.1 Data
Add product records for:
- SASE products
- IGA products
- more SIEM, XDR, CNAPP, PAM, WAF, DSPM, and OT Security products

Add richer fields for:
- compliance
- integrations
- strengths
- weaknesses
- ideal customer
- deployment notes
- evidence sources

### 12.2 Product
Move toward:
- normalized canonical schema across all datasets
- stronger explanation generation
- category-specific comparison criteria
- production-ready frontend and backend architecture

## 13. Current Implementation Location

Project root:
- `.`

Key files:
- `app.py`
- `src/mvdc/engine.py`
- `tests/test_engine.py`
- `data/*.json`
