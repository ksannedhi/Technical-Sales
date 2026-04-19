# Multi-Vendor Decision Copilot

Customer-facing cybersecurity recommendation app with transparent filtering, weighted scoring, and explicit data-gap handling.

## What It Does

- Maps customer problems to supported cybersecurity tool categories
- Supports vendor lookup, product lookup, named comparison, product recommendations, and vendor-level category recommendations
- Recognizes supported categories even when only vendor metadata exists, such as `SASE` and `Firewall`
- Handles vendor capability questions such as `Can Varonis provide DSPM?` with a category-aware lookup summary
- Falls back to honest `insufficient_data` responses when the dataset cannot support a reliable answer
- Uses transparent assumptions, confidence labels, and data-gap messaging

## Documentation

- Product and behavior spec: [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Supported Intents

- `lookup`: vendor and product profile questions such as `Tell me about Varonis` or `You know Cortex?`
- `comparison`: named product comparisons such as `Compare QRadar SIEM against Splunk Enterprise Security`
- `single_category`: product recommendations in supported categories such as `Recommend CNAPP options`
- `vendor_category`: vendor-level category guidance when vendors exist but product records do not, such as `What about SASE?`
- `insufficient_data`: explicit fallback when the current dataset is not enough to answer honestly

## Dataset Assumptions

- The app reads the local JSON files in `data/`
- `products.json` is the main product recommendation dataset
- `vendors.json` supports vendor lookup and vendor-level category fallback
- `vendor_feature_matrix.json` enriches selected categories with feature summaries
- `scoring_weights.json` controls the weighted scoring model
- `hard_exclusions.json` controls which hard-filtering rules are active
- Product and category coverage are still uneven, so outputs should be treated as advisory

## UI Notes

- Clicking a sample prompt runs analysis immediately without requiring a second click on `Analyze`
- Session history is shared across tabs for the current running app process and clears when the app restarts

## Run

```powershell
python -m streamlit run app.py
```

## Verify

```powershell
$env:PYTHONPATH="src"
python -m unittest discover -s tests
```
