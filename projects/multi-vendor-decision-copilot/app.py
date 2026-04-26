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


def render_single(result: dict[str, object]) -> None:
    top = result["top_recommendation"]
    st.subheader("Best Fit")
    position = _position_label(top)
    st.markdown(f"**{top['product_name']}** from **{top['vendor']}** &nbsp;·&nbsp; Market position: **{position}** &nbsp;·&nbsp; Score: **{top['score']} / 100**")
    st.caption(f"Confidence: {result['confidence']}")
    st.write(top["score_reason"])
    rows = []
    for product in result["ranked_products"]:
        rows.append({
            "Product": product["product_name"],
            "Vendor": product["vendor"],
            "Position": _position_label(product),
            "Score": product["score"],
            "Deployment": ", ".join(product.get("deployment_models", [])),
            "Features": ", ".join(product.get("features", [])[:3]) or "Limited feature data",
        })
    st.subheader("Weighted Comparison")
    st.dataframe(rows, use_container_width=True, hide_index=True)
    with st.expander("Score Breakdown — top recommendation"):
        category = result.get("solution_categories", [None])[0]
        breakdown = engine.score_breakdown(top, category)
        breakdown_rows = [{"Dimension": name, "Weighted Score": score} for name, score in breakdown.items()]
        st.dataframe(breakdown_rows, use_container_width=True, hide_index=True)
        st.caption("Weighted score = raw component score × dimension weight. Individual values are rounded; sum may differ by ±0.1 from the total above.")


def render_lookup(result: dict[str, object]) -> None:
    profile = result["vendor_profile"]
    st.subheader("Vendor Profile")
    st.markdown(f"**{profile['vendor']}**")
    st.caption(f"Confidence: {result['confidence']}")
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
            "Position": _position_label(item),
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
    for item in excluded[:8]:
        st.markdown(f"**{item['product_name']}** ({item['vendor']})")
        for reason in item["reasons"]:
            st.write(f"- {reason}")


def render_transparency(result: dict[str, object]) -> None:
    constraints = {key: value for key, value in result.get("constraints", {}).items() if value}
    assumptions = result.get("assumptions", [])
    data_gaps = result.get("data_gaps", [])
    excluded = result.get("excluded_products", [])

    show_constraints = bool(constraints)
    show_assumptions = bool(assumptions)

    if show_constraints and show_assumptions:
        left, right = st.columns(2)
        with left:
            st.markdown("**Detected Constraints**")
            render_constraints(constraints)
        with right:
            st.markdown("**Assumptions**")
            render_assumptions(assumptions)
    elif show_constraints:
        st.markdown("**Detected Constraints**")
        render_constraints(constraints)
    elif show_assumptions:
        st.markdown("**Assumptions**")
        render_assumptions(assumptions)

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
        st.caption(f"Mode: {result['mode']} | Confidence: {result.get('confidence', 'unknown')}")
        if result["mode"] == "lookup":
            profile = result["vendor_profile"]
            st.write(f"Vendor: {profile['vendor']}")
            st.write(f"Categories: {', '.join(profile.get('categories', [])) or 'Not specified'}")
        elif result["mode"] == "comparison":
            top = result["top_recommendation"]
            st.write(f"Top comparison result: {top['product_name']} from {top['vendor']}")
        elif result["mode"] == "single_category":
            top = result["top_recommendation"]
            st.write(f"Best fit: {top['product_name']} from {top['vendor']}")
        elif result["mode"] == "vendor_category":
            top = result["top_recommendation"]
            st.write(f"Vendor-level signal: {top['vendor']} for {top['category']}")
        elif result["mode"] == "stack":
            categories = result.get("solution_categories", [])
            st.write(f"Solution stack: {', '.join(categories)}")
        else:
            st.write(result.get("reason", "No detail available."))
        with st.expander("Raw Result", expanded=False):
            st.json(result)


st.title("Multi-Vendor Decision Copilot")
st.caption("Transparent cybersecurity solution recommendations based on your constraints, required capabilities, and compliance needs.")
st.markdown("### Describe your cybersecurity need, constraints, and compliance requirements")
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
for col, sample in zip(example_cols, examples):
    if col.button(sample, use_container_width=True):
        st.session_state["pending_prompt"] = sample
        st.rerun()
should_run = run or st.session_state.pop("auto_analyze", False)
if should_run and query.strip():
    result = engine.analyze(query.strip())
    history_store.append({"query": query.strip(), "result": result})
    del history_store[:-10]
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
