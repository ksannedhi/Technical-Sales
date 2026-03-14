from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "compare", "for", "from", "have", "in", "is", "it",
    "me", "need", "of", "on", "or", "our", "show", "solution", "solutions", "the", "to", "us", "we",
    "what", "which", "with",
}
PROBLEM_ALIASES = {
    "ransomware_protection": ["ransomware", "endpoint security", "endpoint protection", "edr", "xdr"],
    "cloud_security": ["cloud security", "cloud posture", "cloud misconfiguration", "cnapp", "cspm", "cwpp"],
    "identity_protection": ["identity protection", "identity security", "pam", "mfa", "passwordless", "itdr"],
    "identity_governance": ["identity governance", "iga", "access review", "access certification", "joiner mover leaver", "segregation of duties", "birthright access"],
    "api_security": ["api security", "waf", "web application firewall"],
    "data_security": ["data security", "dspm", "dlp", "data privacy"],
    "network_visibility": ["network visibility", "ndr", "siem", "security visibility", "qradar", "splunk", "fortisiem"],
    "email_protection": ["email security", "email protection"],
    "mobile_security": ["mobile security", "mobile threat"],
    "ot_security": ["ot security", "operational technology", "ics security", "industrial control systems", "manufacturing plant", "factory security"],
}
CATEGORY_ALIASES = {
    "API Security": ["api security"],
    "ASM": ["asm", "attack surface management"],
    "CNAPP": ["cnapp"],
    "CSPM": ["cspm"],
    "CWPP": ["cwpp"],
    "DLP": ["dlp"],
    "DSPM": ["dspm"],
    "EDR": ["edr"],
    "IGA": ["iga", "identity governance", "identity governance and administration", "access review", "access certification", "joiner mover leaver", "segregation of duties"],
    "Identity Security": ["identity security"],
    "Microsegmentation": ["microsegmentation"],
    "MFA": ["mfa"],
    "Mobile Security": ["mobile security"],
    "NDR": ["ndr"],
    "OT Security": ["ot security", "operational technology", "industrial security", "ics security", "manufacturing plant", "plant security"],
    "PAM": ["pam"],
    "SASE": ["sase", "secure access service edge"],
    "SIEM": ["siem", "qradar", "splunk", "fortisiem"],
    "SOAR": ["soar"],
    "WAF": ["waf"],
    "XDR": ["xdr"],
}
UNSUPPORTED_HINTS = {
    "FortiSIEM": ["fortisiem"],
}
REGION_ALIASES = {
    "Global": ["global", "worldwide"],
    "Middle East": ["middle east", "gcc", "saudi", "saudi arabia", "uae"],
}


@dataclass
class ParsedQuery:
    raw_query: str
    intent: str
    categories: list[str]
    problems: list[str]
    vendors: list[str]
    lookup_products: list[str]
    compare_targets: list[str]
    unsupported_terms: list[str]
    required_deployment: str | None
    required_region: str | None


class DecisionEngine:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = Path(data_dir or DATA_DIR)
        self.raw_products = self._load_json("products.json")
        self.raw_vendors = self._load_json("vendors.json")
        self.problem_to_tool_mapping = self._load_json("problem_to_tool_mapping.json")
        self.categories = self._load_json("categories.json") if (self.data_dir / "categories.json").exists() else []
        self.feature_matrix = self._load_json("vendor_feature_matrix.json") if (self.data_dir / "vendor_feature_matrix.json").exists() else []
        self.products = self._normalize_products(self.raw_products)
        self.vendors = self._normalize_vendors(self.raw_vendors)
        self.vendor_names = sorted({vendor["vendor"] for vendor in self.vendors})
        self.product_names = sorted({product["product_name"] for product in self.products})
        self.product_name_lookup = {product["product_name"].lower(): product for product in self.products}
        self.vendor_lookup = {vendor["vendor"].lower(): vendor for vendor in self.vendors}
        self.feature_lookup = self._build_feature_lookup()
        self.supported_categories = sorted({category for product in self.products for category in product["categories"]} | {category for vendor in self.vendors for category in vendor.get("categories", [])} | set(self.categories))

    def _load_json(self, filename: str) -> Any:
        return json.loads((self.data_dir / filename).read_text(encoding="utf-8"))

    def _normalize_products(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for item in items:
            product_name = item.get("product_name") or item.get("product")
            categories = item.get("categories") or item.get("category") or []
            if isinstance(categories, str):
                categories = [categories]
            deployment = item.get("deployment_models") or item.get("deployment") or []
            if isinstance(deployment, str):
                deployment = [deployment]
            normalized.append({
                "vendor": item["vendor"],
                "product_name": product_name,
                "categories": categories,
                "primary_category": categories[0] if categories else None,
                "deployment_models": deployment,
                "capabilities": item.get("capabilities", []),
                "integration_support": item.get("integration_support", []),
                "compliance": item.get("compliance", []),
                "pricing_tier": item.get("pricing_tier"),
                "ideal_customer_size": item.get("ideal_customer_size"),
                "operational_complexity": item.get("operational_complexity"),
                "evidence": item.get("evidence", []),
            })
        return normalized

    def _normalize_vendors(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for item in items:
            normalized.append({
                "vendor": item["vendor"],
                "categories": item.get("categories", []),
                "regions": item.get("regions") or item.get("regional_availability", {}).get("regions", []),
            })
        return normalized

    def _build_feature_lookup(self) -> dict[tuple[str, str], list[str]]:
        lookup: dict[tuple[str, str], list[str]] = {}
        for category_block in self.feature_matrix:
            category = category_block.get("category")
            for entry in category_block.get("vendors", []):
                lookup[(entry["vendor"].lower(), category)] = entry.get("features", [])
        return lookup

    def analyze(self, query: str) -> dict[str, Any]:
        parsed = self.parse_query(query)
        matched_products = self._matched_products(parsed)
        if parsed.intent == "lookup":
            return self._lookup_profile(parsed)
        if parsed.intent == "comparison" and parsed.compare_targets and matched_products:
            return self._compare_products(parsed, matched_products)
        if parsed.intent == "comparison" and parsed.compare_targets and len(parsed.compare_targets) >= 2 and not matched_products:
            return self._insufficient(parsed, f"I do not have reliable product or vendor records for: {', '.join(parsed.compare_targets)}. I would rather say that than fake a comparison.")
        categories = self._resolve_categories(parsed)
        products = [product for product in self.products if any(category in product["categories"] for category in categories)]
        if not categories:
            reason = "I could not map the request to a supported cybersecurity problem or solution category."
            if parsed.unsupported_terms:
                reason = f"The current dataset does not yet cover: {', '.join(parsed.unsupported_terms)}."
            return self._insufficient(parsed, reason)
        if not products:
            vendor_matches = self._vendor_category_matches(categories[0]) if categories else []
            if vendor_matches:
                return self._vendor_category_recommendation(parsed, categories[0], vendor_matches)
            return self._insufficient(parsed, "I identified a relevant category, but the current dataset has no products for it.", categories)
        return self._rank_category(parsed, categories[0], products)

    def parse_query(self, query: str) -> ParsedQuery:
        text = query.lower()
        comparison_hint = any(token in text for token in ["compare", " vs ", " against ", " versus "])
        lookup_hint = any(token in text for token in ["tell me about", "what is", "what about", "who is", "you know", "what does", "can do"]) or bool(re.match(r"^what\s+.+\s+can\s+do\??$", text.strip()))
        compare_targets = self._compare_targets(query) if comparison_hint else []
        vendor_scope = self._vendor_scope(text)
        vendors = [vendor for vendor in self.vendor_names if re.search(rf"\b{re.escape(vendor.lower())}\b", vendor_scope)]
        lookup_products = self._lookup_products(text)
        categories = self._alias_matches(text, CATEGORY_ALIASES)
        problems = self._alias_matches(text, PROBLEM_ALIASES)
        unsupported = self._alias_matches(text, UNSUPPORTED_HINTS)
        deployment = "On-Prem" if any(token in text for token in ["on-prem", "on prem"]) else "Hybrid" if "hybrid" in text else "SaaS" if "saas" in text else None
        region = next((name for name, aliases in REGION_ALIASES.items() if any(alias in text for alias in aliases)), None)
        has_category_signal = bool(categories or problems)
        intent = "comparison" if comparison_hint or len(compare_targets) >= 2 else "lookup" if lookup_hint and not has_category_signal and (vendors or lookup_products) else "recommendation"
        return ParsedQuery(query, intent, categories, problems, vendors, lookup_products, compare_targets, unsupported, deployment, region)

    def _matched_products(self, parsed: ParsedQuery) -> list[dict[str, Any]]:
        matches = []
        for target in parsed.compare_targets:
            target_lc = target.lower()
            for product in self.products:
                if target_lc in product["product_name"].lower() or target_lc == product["vendor"].lower():
                    matches.append(product)
        unique = []
        seen = set()
        for product in matches:
            key = (product["vendor"], product["product_name"])
            if key not in seen:
                unique.append(product)
                seen.add(key)
        return unique

    def _lookup_products(self, text: str) -> list[str]:
        ignore_tokens = {"cloud", "data", "platform", "security", "enterprise", "identity"}
        query_tokens = set(re.findall(r"[a-z0-9]+", text.lower()))
        matches = []
        for product_name in self.product_names:
            lower_name = product_name.lower()
            if lower_name in text:
                matches.append(product_name)
                continue
            tokens = [token for token in re.findall(r"[a-z0-9]+", lower_name) if len(token) > 4 and token not in ignore_tokens]
            if tokens and any(token in query_tokens for token in tokens):
                matches.append(product_name)
        unique = []
        seen = set()
        for name in matches:
            if name not in seen:
                unique.append(name)
                seen.add(name)
        return unique[:5]

    def _lookup_profile(self, parsed: ParsedQuery) -> dict[str, Any]:
        if parsed.vendors:
            vendor_name = parsed.vendors[0]
            vendor = self.vendor_lookup.get(vendor_name.lower())
            products = [product for product in self.products if product["vendor"].lower() == vendor_name.lower()]
            if not vendor and not products:
                return self._insufficient(parsed, f"I do not have a reliable vendor profile for {vendor_name}.")
            categories = sorted({category for product in products for category in product["categories"]} | set((vendor or {}).get("categories", [])))
            deployments = sorted({deployment for product in products for deployment in product.get("deployment_models", [])})
            feature_summary = []
            for product in products:
                for category in product["categories"]:
                    feature_summary.extend(self.feature_lookup.get((product["vendor"].lower(), category), []))
            unique_features = []
            seen = set()
            for feature in feature_summary:
                if feature not in seen:
                    unique_features.append(feature)
                    seen.add(feature)
            return {
                "mode": "lookup",
                "query": parsed.raw_query,
                "lookup_type": "vendor",
                "vendor": vendor_name,
                "vendor_profile": {
                    "vendor": vendor_name,
                    "categories": categories,
                    "regions": (vendor or {}).get("regions", []),
                    "deployment_models": deployments,
                    "products": [
                        {
                            "product_name": product["product_name"],
                            "categories": product["categories"],
                            "deployment_models": product.get("deployment_models", []),
                        }
                        for product in products
                    ],
                    "features": unique_features[:6],
                },
                "assumptions": ["Vendor lookup answers are based on vendor and product records explicitly present in the dataset."],
                "data_gaps": ["Detailed product capabilities are only available for categories covered by vendor_feature_matrix.json."],
                "confidence": "medium" if products else "low",
            }

        product_name = parsed.lookup_products[0]
        product = next(product for product in self.products if product["product_name"] == product_name)
        features = []
        for category in product["categories"]:
            features.extend(self.feature_lookup.get((product["vendor"].lower(), category), []))
        unique_features = []
        seen = set()
        for feature in features:
            if feature not in seen:
                unique_features.append(feature)
                seen.add(feature)
        return {
            "mode": "lookup",
            "query": parsed.raw_query,
            "lookup_type": "product",
            "vendor": product["vendor"],
            "vendor_profile": {
                "vendor": product["vendor"],
                "categories": product["categories"],
                "regions": self.vendor_lookup.get(product["vendor"].lower(), {}).get("regions", []),
                "deployment_models": product.get("deployment_models", []),
                "products": [
                    {
                        "product_name": product["product_name"],
                        "categories": product["categories"],
                        "deployment_models": product.get("deployment_models", []),
                    }
                ],
                "features": unique_features[:6],
            },
            "assumptions": ["Product lookup answers are based on explicit product names present in the dataset."],
            "data_gaps": ["Detailed product capabilities are only available for categories covered by vendor_feature_matrix.json."],
            "confidence": "medium",
        }

    def _compare_products(self, parsed: ParsedQuery, matched_products: list[dict[str, Any]]) -> dict[str, Any]:
        rows = []
        missing = []
        target_map = {target.lower(): target for target in parsed.compare_targets}
        for target in parsed.compare_targets:
            target_lc = target.lower()
            products = [product for product in matched_products if target_lc in product["product_name"].lower() or target_lc == product["vendor"].lower()]
            if not products:
                missing.append(target)
                continue
            product = products[0]
            category = product["primary_category"]
            rows.append({
                "vendor": product["vendor"],
                "product_name": product["product_name"],
                "category": category,
                "deployment_models": product["deployment_models"],
                "features": self.feature_lookup.get((product["vendor"].lower(), category), []),
                "score": self._comparison_score(product),
                "score_reason": self._comparison_reason(product),
            })
        if not rows:
            return self._insufficient(parsed, f"I do not have reliable comparable records for: {', '.join(parsed.compare_targets)}.")
        if missing:
            return self._insufficient(parsed, f"I do not have reliable product or vendor records for: {', '.join(missing)}. I would rather say that than fake a comparison.")
        rows.sort(key=lambda item: item["score"], reverse=True)
        return {
            "mode": "comparison",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": sorted({row["category"] for row in rows if row["category"]}),
            "constraints": {"deployment": parsed.required_deployment, "region": parsed.required_region},
            "comparison_results": rows,
            "missing_vendors": missing,
            "top_recommendation": rows[0],
            "excluded_products": [],
            "assumptions": ["Comparison is based only on named products present in the dataset."],
            "data_gaps": ["Feature coverage is currently sparse outside categories present in vendor_feature_matrix.json."],
            "confidence": "medium" if len(rows) >= 2 else "low",
        }

    def _comparison_score(self, product: dict[str, Any]) -> float:
        score = 55.0
        if "Hybrid" in product["deployment_models"]:
            score += 10
        if product["primary_category"] and self.feature_lookup.get((product["vendor"].lower(), product["primary_category"]), []):
            score += 10
        return score

    def _comparison_reason(self, product: dict[str, Any]) -> str:
        parts = []
        if product["deployment_models"]:
            parts.append(f"deployment: {', '.join(product['deployment_models'])}")
        features = self.feature_lookup.get((product["vendor"].lower(), product["primary_category"]), [])
        if features:
            parts.append(f"known features: {', '.join(features[:3])}")
        return "; ".join(parts) if parts else "Named product found, but detailed comparison data is limited."

    def _resolve_categories(self, parsed: ParsedQuery) -> list[str]:
        if parsed.categories:
            return parsed.categories
        categories = []
        fallback_problem_map = {"identity_governance": ["IGA"]}
        for problem in parsed.problems:
            source_categories = self.problem_to_tool_mapping.get(problem, fallback_problem_map.get(problem, []))
            for category in source_categories:
                if category not in categories:
                    categories.append(category)
        return categories

    def _vendor_category_matches(self, category: str) -> list[dict[str, Any]]:
        return [vendor for vendor in self.vendors if category in vendor.get("categories", [])]

    def _vendor_category_recommendation(self, parsed: ParsedQuery, category: str, vendors: list[dict[str, Any]]) -> dict[str, Any]:
        rows = []
        for vendor in vendors:
            score = 45.0
            if parsed.required_region and parsed.required_region in vendor.get("regions", []):
                score += 10
            rows.append({
                "vendor": vendor["vendor"],
                "category": category,
                "regions": vendor.get("regions", []),
                "score": score,
                "score_reason": "Vendor-level recommendation only. Product-level records are not yet available for this category.",
            })
        rows.sort(key=lambda item: item["score"], reverse=True)
        return {
            "mode": "vendor_category",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": [category],
            "constraints": {"deployment": parsed.required_deployment, "region": parsed.required_region},
            "top_recommendation": rows[0],
            "ranked_vendors": rows,
            "excluded_products": [],
            "assumptions": ["This answer is vendor-level because the dataset has category coverage for vendors but no product records for this category."],
            "data_gaps": ["Add product-level records for this category to enable more specific recommendations and comparisons."],
            "confidence": "low-to-medium",
        }

    def _rank_category(self, parsed: ParsedQuery, category: str, products: list[dict[str, Any]]) -> dict[str, Any]:
        ranked = []
        for product in products:
            if category not in product["categories"]:
                continue
            score = 50.0
            if parsed.required_deployment and parsed.required_deployment in product["deployment_models"]:
                score += 20
            if parsed.required_region:
                vendor = self.vendor_lookup.get(product["vendor"].lower())
                if vendor and parsed.required_region in vendor.get("regions", []):
                    score += 10
            if self.feature_lookup.get((product["vendor"].lower(), category), []):
                score += 10
            ranked.append({
                "vendor": product["vendor"],
                "product_name": product["product_name"],
                "category": category,
                "deployment_models": product["deployment_models"],
                "features": self.feature_lookup.get((product["vendor"].lower(), category), []),
                "score": round(score, 1),
                "score_reason": self._comparison_reason(product),
            })
        ranked.sort(key=lambda item: item["score"], reverse=True)
        if not ranked:
            return self._insufficient(parsed, f"I found the category {category}, but there are no comparable products in the current dataset.", [category])
        return {
            "mode": "single_category",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": [category],
            "constraints": {"deployment": parsed.required_deployment, "region": parsed.required_region},
            "top_recommendation": ranked[0],
            "ranked_products": ranked[:5],
            "excluded_products": [],
            "assumptions": ["Scoring uses only deployment, region, and available feature coverage from the current dataset."],
            "data_gaps": ["Many products still lack detailed features, compliance, and integration fields in this final dataset."],
            "confidence": "low-to-medium",
        }

    def _alias_matches(self, text: str, alias_map: dict[str, list[str]]) -> list[str]:
        return [name for name, aliases in alias_map.items() if any(alias in text for alias in aliases)]

    def _vendor_scope(self, text: str) -> str:
        match = re.search(r"compare\s+(.+?)(?:\s+for\s+|\s+with\s+|$)", text)
        if match:
            return match.group(1)
        return text

    def _compare_targets(self, query: str) -> list[str]:
        text = query.strip().rstrip('.?')
        match = re.search(r"compare\s+(.+?)(?:\s+for\s+|\s+with\s+|$)", text, re.IGNORECASE)
        scope = match.group(1) if match else text
        parts = re.split(r"\s+(?:vs|versus|against|and)\s+", scope, flags=re.IGNORECASE)
        cleaned = []
        for part in parts:
            item = part.strip(' .')
            lowered = item.lower()
            for prefix in ('the ', 'what about ', 'how about ', 'tell me about '):
                if lowered.startswith(prefix):
                    item = item[len(prefix):].strip()
                    lowered = item.lower()
            if item:
                cleaned.append(item)
        return cleaned[:4]

    def _insufficient(self, parsed: ParsedQuery, reason: str, categories: list[str] | None = None) -> dict[str, Any]:
        return {
            "mode": "insufficient_data",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": categories or [],
            "constraints": {"deployment": parsed.required_deployment, "region": parsed.required_region},
            "reason": reason,
            "excluded_products": [],
            "supported_categories": self.supported_categories,
            "suggested_queries": self.get_examples(),
            "assumptions": ["The assistant only compares products that exist explicitly in the current dataset."],
            "data_gaps": ["The dataset still needs more named products and more detailed feature, compliance, and integration coverage."],
            "confidence": "low",
        }

    def get_examples(self) -> list[str]:
        return [
            "Compare QRadar SIEM against Splunk Enterprise Security.",
            "Recommend CNAPP options for a cloud security program.",
            "Compare Falcon Insight XDR against Cortex XDR.",
            "Recommend identity protection tools for privileged access use cases.",
        ]
