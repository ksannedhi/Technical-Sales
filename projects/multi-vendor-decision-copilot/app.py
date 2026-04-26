from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mvdc import DecisionEngine

st.set_page_config(page_title="Multi-Vendor Decision Copilot", page_icon="shield", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

/* Page padding */
section[data-testid="stMain"] .block-container {
    padding-top: 2rem !important;
    padding-bottom: 2rem !important;
}

/* Headings */
h2 { font-size: 1.1rem !important; margin-top: 0.7rem !important; margin-bottom: 0.15rem !important; font-weight: 600 !important; }
h3 { font-size: 0.97rem !important; margin-top: 0.4rem !important; margin-bottom: 0.1rem !important; font-weight: 500 !important; }

/* Paragraph / list spacing */
div[data-testid="stMarkdownContainer"] p { margin-bottom: 0.2rem !important; line-height: 1.55 !important; }
div[data-testid="stMarkdownContainer"] ul { margin-top: 0.1rem !important; margin-bottom: 0.2rem !important; }

/* Caption */
div[data-testid="stCaptionContainer"] p { font-size: 0.77rem !important; margin-bottom: 0.05rem !important; color: #6b7280 !important; }

/* Stacked element gap */
div[data-testid="stVerticalBlock"] > div { gap: 0.2rem !important; }

/* Text area — card style */
textarea {
    border-radius: 8px !important;
    border: 1.5px solid #e5e7eb !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
    font-size: 0.9rem !important;
    line-height: 1.5 !important;
    padding: 0.65rem 0.75rem !important;
}
textarea:focus {
    border-color: #ff4b4b !important;
    box-shadow: 0 0 0 3px rgba(255,75,75,0.12) !important;
}

/* Alert / info box */
div[data-testid="stAlert"] { padding: 0.5rem 0.75rem !important; margin-bottom: 0.3rem !important; border-radius: 6px !important; }

/* Expander */
details summary { font-size: 0.87rem !important; }
div[data-testid="stExpander"] { margin-bottom: 0.25rem !important; }

/* Divider */
hr { margin: 0.75rem 0 !important; border-color: #e5e7eb !important; }

/* Dataframe */
div[data-testid="stDataFrame"] { margin-bottom: 0.3rem !important; }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def get_engine() -> DecisionEngine:
    return DecisionEngine(ROOT / "data")


@st.cache_resource
def get_shared_history() -> list[dict[str, object]]:
    return []


engine = get_engine()
history_store = get_shared_history()


def render_constraints(constraints: dict[str, object]) -> None:
    active = {key: value for key, value in constraints.items() if value}
    for key, value in active.items():
        if isinstance(value, list):
            value = ", ".join(str(item) for item in value)
        st.write(f"**{key.replace('_', ' ').title()}:** {value}")


def render_assumptions(items: list[str]) -> None:
    for item in items:
        st.write(f"- {item}")


def render_insufficient(result: dict[str, object]) -> None:
    st.warning(result["reason"])
    if result["solution_categories"]:
        st.write(f"Detected categories: {', '.join(result['solution_categories'])}")
    st.write(f"**Currently supported categories:** {', '.join(result['supported_categories'])}")
    st.write("**Try one of these instead:**")
    for sample in result["suggested_queries"][:3]:
        st.write(f"- {sample}")


def _position_label(product: dict[str, object]) -> str:
    return {"leader": "Leader", "strong": "Strong", "challenger": "Challenger"}.get(
        str(product.get("market_position") or "").lower(), "—"
    )


def _cap_first(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


def _fmt_features(features: list[str], limit: int = 3) -> str:
    return ", ".join(_cap_first(f) for f in features[:limit]) if features else "—"


_DIMENSION_MAX = {
    "Deployment Fit": 25.0,
    "Feature Match": 20.0,
    "Integration Fit": 15.0,
    "Compliance Fit": 15.0,
    "Market Position": 15.0,
    "Cost": 5.0,
    "Complexity": 5.0,
}


def render_single(result: dict[str, object]) -> None:
    top = result["top_recommendation"]
    st.subheader("Best Fit")
    position = _position_label(top)
    st.markdown(f"**{top['product_name']}** from **{top['vendor']}** &nbsp;·&nbsp; Market position: **{position}** &nbsp;·&nbsp; Score: **{top['score']} / 100**")
    st.caption(f"Confidence: {result['confidence'].capitalize()}")
    rows = []
    for product in result["ranked_products"]:
        rows.append({
            "Product": product["product_name"],
            "Vendor": product["vendor"],
            "Position": _position_label(product),
            "Score": f"{product['score']}",
            "Deployment": ", ".join(product.get("deployment_models", [])),
            "Features": _fmt_features(product.get("features", [])),
        })
    st.subheader("Weighted Comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)
    constraints = result.get("constraints", {})
    has_constraints = any(constraints.get(k) for k in ("deployment", "compliance", "integrations", "region"))
    if has_constraints:
        category = result.get("solution_categories", [None])[0]
        breakdown = engine.score_breakdown(top, category)
        with st.expander(f"Score Breakdown — {top['vendor']} · {top['product_name']}"):
            st.caption("Each bar shows the dimension's weighted contribution out of the 100-point total.")
            for name, score in breakdown.items():
                col_label, col_bar, col_val = st.columns([2, 5, 1])
                col_label.write(name)
                col_bar.progress(min(1.0, score / 100.0))
                col_val.markdown(f"<p style='margin:0; padding-top:6px'>{score}</p>", unsafe_allow_html=True)


def render_lookup(result: dict[str, object]) -> None:
    profile = result["vendor_profile"]
    if result.get("lookup_type") == "product":
        product_name = result.get("product_name", "")
        vendor = profile["vendor"]
        position = _position_label({"market_position": result.get("market_position")})
        cat_full = result.get("category_full_name") or result.get("primary_category") or ""
        cat_what = result.get("category_what_it_is", "")
        deployment = ", ".join(profile.get("deployment_models", [])) or "Not specified"
        st.subheader(product_name)
        st.caption(f"By **{vendor}** · {cat_full} · {position} · {deployment} · Confidence: {result['confidence'].capitalize()}")
        if cat_what:
            st.markdown(f"*{cat_what}*")
        features = profile.get("features", [])
        if features:
            st.markdown("**Key capabilities**")
            for f in features:
                st.write(f"- {_cap_first(f)}")
        return

    st.subheader("Vendor Profile")
    st.markdown(f"**{profile['vendor']}**")
    st.caption(f"Confidence: {result['confidence'].capitalize()}")
    capability_summary = result.get("capability_summary")
    if capability_summary:
        st.subheader("Requested Capability Check")
        for item in capability_summary.get("assessments", []):
            st.write(f"**{item['category']}:** {item['message']}")
            if item.get("products"):
                st.write(f"Known products: {', '.join(item['products'])}")
    st.write(f"**Categories:** {', '.join(profile.get('categories', [])) or 'Not specified'}")
    st.write(f"**Regions:** {', '.join(profile.get('regions', [])) or 'Not specified'}")
    st.write(f"**Deployment Models:** {', '.join(profile.get('deployment_models', [])) or 'Not specified'}")
    if profile.get('features'):
        st.write(f"**Known Features:** {_fmt_features(profile['features'], limit=6)}")
    rows = []
    for product in profile.get('products', []):
        rows.append({
            "Product": product["product_name"],
            "Categories": ", ".join(product.get("categories", [])),
            "Deployment": ", ".join(product.get("deployment_models", [])),
        })
    if rows:
        st.subheader("Known Products")
        st.dataframe(rows, use_container_width=True, hide_index=True)


def render_comparison(result: dict[str, object]) -> None:
    rows = []
    for item in result["comparison_results"]:
        rows.append({
            "Vendor": item["vendor"],
            "Product": item["product_name"],
            "Position": _position_label(item),
            "Category": item["category"],
            "Score": f"{item['score']}",
            "Deployment": ", ".join(item["deployment_models"]),
            "Features": _fmt_features(item.get("features", [])),
        })
    st.subheader("Vendor Comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)
    comparison_results = result["comparison_results"]
    if len(comparison_results) >= 2 and comparison_results[0]["score"] == comparison_results[1]["score"]:
        tied = [f"{r['vendor']} ({r['product_name']})" for r in comparison_results if r["score"] == comparison_results[0]["score"]]
        st.info(f"These options are equally matched at {comparison_results[0]['score']} / 100: {', '.join(tied)}. Review the features above to differentiate based on your specific requirements.")
    else:
        top = result["top_recommendation"]
        st.info(f"Top match: **{top['vendor']}** — {top['product_name']} ({top['score']} / 100)")
    if result["missing_vendors"]:
        st.warning(f"Could not fully compare: {', '.join(result['missing_vendors'])}")


def render_vendor_category(result: dict[str, object]) -> None:
    top = result["top_recommendation"]
    st.subheader("Vendor-Level Recommendations")
    st.info(f"Best available vendor-level signal: {top['vendor']} for {top['category']}. Confidence: {result['confidence']}.")
    rows = []
    for item in result["ranked_vendors"]:
        rows.append({
            "Vendor": item["vendor"],
            "Category": item["category"],
            "Regions": ", ".join(item.get("regions", [])) or "Not specified",
            "Score": f"{item['score']}",
            "Notes": item["score_reason"],
        })
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_stack(result: dict[str, object]) -> None:
    st.subheader("Recommended Solution Stack")
    st.caption(f"Confidence: {result['confidence'].capitalize()}")
    for item in result["solution_stack"]:
        if item["status"] == "insufficient_data":
            st.warning(f"{item['category']}: {item['message']}")
            continue
        product = item["recommended_product"]
        st.markdown(f"**{item['category']}**: {product['product_name']} from {product['vendor']} ({product['score']} / 100)")
        st.caption(product["score_reason"])


def render_category_explain(result: dict[str, object]) -> None:
    st.subheader(f"What is {result['full_name']} ({result['category']})?")
    st.write(result["what_it_is"])
    problems = result.get("problems_it_solves", [])
    if problems:
        st.markdown("**Problems it solves**")
        for problem in problems:
            st.write(f"- {problem}")
    top = result.get("top_products", [])
    if top:
        with st.expander("Top vendor options in this category", expanded=True):
            rows = []
            for product in top:
                rows.append({
                    "Product": product["product_name"],
                    "Vendor": product["vendor"],
                    "Position": _position_label(product),
                    "Score": f"{product['score']}",
                    "Deployment": ", ".join(product.get("deployment_models", [])),
                    "Features": _fmt_features(product.get("features", [])),
                })
            st.dataframe(rows, use_container_width=True, hide_index=True)


def render_exclusions(result: dict[str, object]) -> None:
    excluded = result.get("excluded_products", [])
    for item in excluded[:8]:
        st.markdown(f"**{item['product_name']}** ({item['vendor']})")
        for reason in item["reasons"]:
            st.write(f"- {reason}")


def render_transparency(result: dict[str, object]) -> None:
    constraints = {key: value for key, value in result.get("constraints", {}).items() if value}
    data_gaps = result.get("data_gaps", [])
    excluded = result.get("excluded_products", [])

    if constraints:
        st.markdown("**Detected Constraints**")
        render_constraints(constraints)

    if data_gaps:
        st.markdown("**Data Gaps**")
        for item in data_gaps:
            st.write(f"- {item}")

    if excluded:
        with st.expander("Excluded Products"):
            render_exclusions(result)


def render_history_item(item: dict[str, object], index: int) -> None:
    result = item["result"]
    title = f"{index}. {item['query']}"
    with st.expander(title):
        if result["mode"] == "insufficient_data":
            render_insufficient(result)
        elif result["mode"] == "lookup":
            render_lookup(result)
        elif result["mode"] == "category_explain":
            render_category_explain(result)
        elif result["mode"] == "single_category":
            render_single(result)
        elif result["mode"] == "comparison":
            render_comparison(result)
        elif result["mode"] == "vendor_category":
            render_vendor_category(result)
        else:
            render_stack(result)
        render_transparency(result)


st.markdown("""
<div style="padding: 0.5rem 0 1.25rem 0; border-bottom: 1.5px solid #e5e7eb; margin-bottom: 1.25rem;">
  <p style="font-family:'Inter',sans-serif; font-size:1.45rem; font-weight:700; margin:0 0 0.25rem 0; color:#0f1117; letter-spacing:-0.02em;">Multi-Vendor Decision Copilot</p>
  <p style="font-family:'Inter',sans-serif; font-size:0.82rem; color:#6b7280; margin:0; line-height:1.5;">Transparent cybersecurity solution recommendations based on your constraints, required capabilities, and compliance needs.</p>
</div>
""", unsafe_allow_html=True)
st.markdown("<p style='font-family:Inter,sans-serif; font-size:0.88rem; font-weight:600; color:#374151; margin:0 0 0.3rem 0;'>Describe your cybersecurity need, constraints, and compliance requirements</p>", unsafe_allow_html=True)
if "pending_prompt" in st.session_state:
    st.session_state["prompt"] = st.session_state.pop("pending_prompt")
    st.session_state["auto_analyze"] = True

query = st.text_area(
    "Prompt",
    key="prompt",
    height=120,
    placeholder="Example: Compare SIEM vendors for a bank with FedRAMP, on-prem deployment, and ServiceNow integration.",
    label_visibility="collapsed",
)
run = st.button("Analyze", type="primary", use_container_width=True)
examples = engine.get_examples()
example_cols = st.columns(len(examples))
active_example = st.session_state.get("active_example", "")
for col, sample in zip(example_cols, examples):
    is_active = sample == active_example
    if col.button(sample, use_container_width=True, type="primary" if is_active else "secondary"):
        st.session_state["pending_prompt"] = sample
        st.session_state["active_example"] = sample
        st.rerun()
should_run = run or st.session_state.pop("auto_analyze", False)
if should_run and query.strip():
    if query.strip() not in examples:
        st.session_state.pop("active_example", None)
    result = engine.analyze(query.strip())
    if not any(h["query"] == query.strip() for h in history_store):
        history_store.append({"query": query.strip(), "result": result})
        del history_store[:-10]
    st.markdown("---")
    if result["mode"] == "insufficient_data":
        render_insufficient(result)
    elif result["mode"] == "lookup":
        render_lookup(result)
    elif result["mode"] == "category_explain":
        render_category_explain(result)
    elif result["mode"] == "single_category":
        render_single(result)
    elif result["mode"] == "comparison":
        render_comparison(result)
    elif result["mode"] == "vendor_category":
        render_vendor_category(result)
    else:
        render_stack(result)
    render_transparency(result)
elif should_run:
    st.warning("Enter a customer query to analyze.")

if history_store:
    st.markdown("---")
    history_left, history_right = st.columns([4, 1])
    with history_left:
        st.subheader("Session History")
    with history_right:
        if st.button("Clear History", use_container_width=True):
            history_store.clear()
            st.rerun()
    for index, item in enumerate(reversed(history_store), start=1):
        render_history_item(item, index)
