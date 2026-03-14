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
engine = DecisionEngine(ROOT / "data")


def render_constraints(constraints: dict[str, object]) -> None:
    active = {key: value for key, value in constraints.items() if value}
    if not active:
        st.write("No explicit hard constraints were detected.")
        return
    for key, value in active.items():
        st.write(f"**{key.replace('_', ' ').title()}:** {value}")


def render_insufficient(result: dict[str, object]) -> None:
    st.warning(result["reason"])
    if result["solution_categories"]:
        st.write(f"Detected categories: {', '.join(result['solution_categories'])}")
    st.write(f"**Currently supported categories:** {', '.join(result['supported_categories'])}")
    st.write("**Try one of these instead:**")
    for sample in result["suggested_queries"][:3]:
        st.write(f"- {sample}")


def render_single(result: dict[str, object]) -> None:
    top = result["top_recommendation"]
    st.subheader("Best Fit")
    st.markdown(f"**{top['product_name']}** from **{top['vendor']}** scored **{top['score']} / 100**.")
    st.caption(f"Confidence: {result['confidence']}")
    st.write(top["score_reason"])
    rows = []
    for product in result["ranked_products"]:
        rows.append({
            "Product": product["product_name"],
            "Vendor": product["vendor"],
            "Score": product["score"],
            "Deployment": ", ".join(product.get("deployment_models", [])),
            "Features": ", ".join(product.get("features", [])[:3]) or "Limited feature data",
            "Notes": product.get("score_reason", "Limited comparison detail"),
        })
    st.subheader("Weighted Comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_lookup(result: dict[str, object]) -> None:
    profile = result["vendor_profile"]
    st.subheader("Vendor Profile")
    st.markdown(f"**{profile['vendor']}**")
    st.caption(f"Confidence: {result['confidence']}")
    st.write(f"**Categories:** {', '.join(profile.get('categories', [])) or 'Not specified'}")
    st.write(f"**Regions:** {', '.join(profile.get('regions', [])) or 'Not specified'}")
    st.write(f"**Deployment Models:** {', '.join(profile.get('deployment_models', [])) or 'Not specified'}")
    if profile.get('features'):
        st.write(f"**Known Features:** {', '.join(profile['features'])}")
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
            "Category": item["category"],
            "Score": item["score"],
            "Deployment": ", ".join(item["deployment_models"]),
            "Features": ", ".join(item.get("features", [])[:3]) or "Limited feature data",
        })
    st.subheader("Vendor Comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)
    top = result["top_recommendation"]
    st.info(f"Top ranked option in the current dataset: {top['vendor']} via {top['product_name']}. Confidence: {result['confidence']}.")
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
            "Score": item["score"],
            "Notes": item["score_reason"],
        })
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_stack(result: dict[str, object]) -> None:
    st.subheader("Recommended Solution Stack")
    st.caption(f"Confidence: {result['confidence']}")
    for item in result["solution_stack"]:
        if item["status"] == "insufficient_data":
            st.warning(f"{item['category']}: {item['message']}")
            continue
        product = item["recommended_product"]
        st.markdown(f"**{item['category']}**: {product['product_name']} from {product['vendor']} ({product['score']} / 100)")
        st.caption(product["score_reason"])


def render_exclusions(result: dict[str, object]) -> None:
    excluded = result.get("excluded_products", [])
    if not excluded:
        st.write("No products were excluded by the detected hard constraints.")
        return
    for item in excluded[:8]:
        st.markdown(f"**{item['product_name']}** ({item['vendor']})")
        for reason in item["reasons"]:
            st.write(f"- {reason}")


def render_transparency(result: dict[str, object]) -> None:
    left, right = st.columns(2)
    with left:
        st.markdown("**Detected Constraints**")
        render_constraints(result.get("constraints", {}))
    with right:
        st.markdown("**Assumptions**")
        for item in result.get("assumptions", []):
            st.write(f"- {item}")
    st.markdown("**Data Gaps**")
    for item in result.get("data_gaps", []):
        st.write(f"- {item}")
    with st.expander("Excluded Products"):
        render_exclusions(result)


st.title("Multi-Vendor Decision Copilot")
st.caption("Transparent cybersecurity solution recommendations based on your constraints, required capabilities, and compliance needs.")
st.markdown("### Describe your cybersecurity need, constraints, and compliance requirements")
query = st.text_area(
    "Prompt",
    value=st.session_state.get("example_prompt", ""),
    height=120,
    placeholder="Example: Compare SIEM vendors for a bank with FedRAMP, on-prem deployment, and ServiceNow integration.",
    label_visibility="collapsed",
)
run = st.button("Analyze", type="primary", use_container_width=True)
example_cols = st.columns(len(engine.get_examples()))
for col, sample in zip(example_cols, engine.get_examples()):
    if col.button(sample, use_container_width=True):
        st.session_state["example_prompt"] = sample
        st.rerun()
if run and query.strip():
    result = engine.analyze(query.strip())
    st.markdown("---")
    if result["mode"] == "insufficient_data":
        render_insufficient(result)
    elif result["mode"] == "lookup":
        render_lookup(result)
    elif result["mode"] == "single_category":
        render_single(result)
    elif result["mode"] == "comparison":
        render_comparison(result)
    elif result["mode"] == "vendor_category":
        render_vendor_category(result)
    else:
        render_stack(result)
    render_transparency(result)
    with st.expander("Raw Engine Output"):
        st.json(result)
elif run:
    st.warning("Enter a customer query to analyze.")
