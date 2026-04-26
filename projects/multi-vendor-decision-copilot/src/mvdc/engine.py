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
VENDOR_SUFFIX_TOKENS = {"inc", "llc", "ltd", "corp", "corporation", "security", "networks", "network", "technologies"}
TERM_NORMALIZATIONS = {
    "forisiem": "FortiSIEM",
    "forti siem": "FortiSIEM",
    "fori siem": "FortiSIEM",
}
PROBLEM_ALIASES = {
    "ransomware_protection": ["ransomware", "endpoint security", "endpoint protection", "edr", "xdr"],
    "cloud_security": ["cloud security", "cloud posture", "cloud misconfiguration", "cnapp", "cspm", "cwpp", "cloud security posture", "cloud workload protection"],
    "identity_protection": ["identity protection", "identity security", "pam", "mfa", "passwordless", "itdr"],
    "identity_governance": ["identity governance", "iga", "access review", "access certification", "joiner mover leaver", "segregation of duties", "birthright access"],
    "api_security": ["api security", "waf", "web application firewall", "apis", "api abuse", "api exposure", "api attack", "secure our api"],
    "data_security": ["data security", "dspm", "dlp", "data loss prevention", "data privacy", "data leakage", "sensitive data", "protect our data", "prevent data loss"],
    "network_visibility": ["network visibility", "ndr", "siem", "security visibility", "qradar", "splunk", "fortisiem", "forisiem"],
    "email_protection": ["email security", "email protection", "phishing", "stop phishing", "email threats", "email attack", "email threat"],
    "mobile_security": ["mobile security", "mobile threat"],
    "ot_security": ["ot security", "operational technology", "ics security", "industrial control systems", "manufacturing plant", "factory security"],
}
CATEGORY_ALIASES = {
    "API Security": ["api security"],
    "ASM": ["asm", "easm", "attack surface management", "external attack surface management"],
    "CNAPP": ["cnapp", "cspm", "cwpp", "cloud security posture", "cloud workload protection"],
    "DLP": ["dlp"],
    "DSPM": ["dspm", "data security posture", "data privacy"],
    "CIAM": ["ciam", "customer identity", "customer identity and access management", "consumer identity"],
    "DAM": ["dam", "database activity monitoring", "database monitoring", "db activity monitoring"],
    "EDR": ["edr"],
    "Email Security": ["email security", "email protection", "phishing protection", "anti-phishing"],
    "TIP": ["tip", "threat intelligence", "threat intel", "threat intelligence platform", "cyber threat intelligence", "cti"],
    "Firewall": ["firewall", "firewalls", "next generation firewall", "ngfw"],
    "IGA": ["iga", "identity governance", "identity governance and administration", "access review", "access certification", "joiner mover leaver", "segregation of duties"],
    "Identity Security": ["identity security"],
    "ITDR": ["itdr", "identity threat detection", "identity threat detection and response"],
    "Microsegmentation": ["microsegmentation"],
    "MFA": ["mfa"],
    "Mobile Security": ["mobile security"],
    "NDR": ["ndr"],
    "OT Security": ["ot security", "operational technology", "industrial security", "ics security", "manufacturing plant", "plant security"],
    "PAM": ["pam"],
    "SASE": ["sase", "secure access service edge"],
    "SIEM": ["siem", "qradar", "splunk", "fortisiem", "forisiem"],
    "SOAR": ["soar"],
    "WAF": ["waf"],
    "XDR": ["xdr"],
}
UNSUPPORTED_HINTS = {
    "FortiSIEM": ["fortisiem", "forisiem", "forti siem", "fori siem"],
}
REGION_ALIASES = {
    "Global": ["global", "worldwide"],
    "Middle East": ["middle east", "gcc", "saudi", "saudi arabia", "uae"],
}
COMPLIANCE_ALIASES = {
    "FedRAMP": ["fedramp"],
    "HIPAA": ["hipaa"],
    "PCI DSS": ["pci", "pci dss"],
    "SOC 2": ["soc 2", "soc2"],
    "ISO 27001": ["iso 27001"],
}
INTEGRATION_ALIASES = {
    "ServiceNow": ["servicenow"],
    "Okta": ["okta"],
    "Microsoft Entra ID": ["entra id", "azure ad", "microsoft entra"],
    "AWS": ["aws", "amazon web services"],
    "Azure": ["azure"],
    "GCP": ["gcp", "google cloud"],
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
    required_compliance: list[str]
    required_integrations: list[str]


class DecisionEngine:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = Path(data_dir or DATA_DIR)
        self.raw_products = self._load_json("products.json")
        self.raw_vendors = self._load_json("vendors.json")
        self.problem_to_tool_mapping = self._load_json("problem_to_tool_mapping.json")
        self.categories = self._load_json("categories.json") if (self.data_dir / "categories.json").exists() else []
        self.feature_matrix = self._load_json("vendor_feature_matrix.json") if (self.data_dir / "vendor_feature_matrix.json").exists() else []
        self.scoring_weights = self._load_json("scoring_weights.json") if (self.data_dir / "scoring_weights.json").exists() else {}
        self.hard_exclusions = self._load_json("hard_exclusions.json") if (self.data_dir / "hard_exclusions.json").exists() else {"rules": []}
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
                "market_position": item.get("market_position"),
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
            return self._insufficient(parsed, self._missing_comparison_reason(parsed, parsed.compare_targets))
        categories = self._resolve_categories(parsed)
        if not categories:
            if parsed.required_region and not (parsed.vendors or parsed.lookup_products):
                return self._insufficient(
                    parsed,
                    f"I can use {parsed.required_region} as a region constraint, but I still need a cybersecurity category, vendor, or problem area to recommend solutions responsibly.",
                    suggested_queries=self._region_guided_queries(parsed.required_region),
                )
            reason = "I could not map the request to a supported cybersecurity problem or solution category."
            if parsed.unsupported_terms:
                reason = f"The current dataset does not yet cover: {', '.join(parsed.unsupported_terms)}."
            return self._insufficient(parsed, reason)
        if len(categories) > 1:
            return self._build_stack(parsed, categories)
        products = [product for product in self.products if categories[0] in product["categories"]]
        if not products:
            vendor_matches = self._vendor_category_matches(categories[0])
            if vendor_matches:
                return self._vendor_category_recommendation(parsed, categories[0], vendor_matches)
            return self._insufficient(parsed, "I identified a relevant category, but the current dataset has no products for it.", categories)
        return self._rank_category(parsed, categories[0], products)

    def parse_query(self, query: str) -> ParsedQuery:
        text = query.lower()
        comparison_hint = any(token in text for token in ["compare", " vs ", " against ", " versus "])
        lookup_hint = any(token in text for token in ["tell me about", "tell me all about", "tell me more about", "what is", "what about", "who is", "you know", "what does", "can do", "can provide", "explain", "describe", "offers", "makes"]) or bool(re.match(r"^what\s+.+\s+can\s+(?:do|provide|offer)\??$", text.strip()))
        compare_targets = self._compare_targets(query) if comparison_hint else []
        vendor_scope = self._vendor_scope(text)
        vendors = self._lookup_vendors(vendor_scope)
        lookup_products = self._lookup_products(text)
        categories = self._alias_matches(text, CATEGORY_ALIASES)
        problems = self._alias_matches(text, PROBLEM_ALIASES)
        unsupported = self._alias_matches(text, UNSUPPORTED_HINTS)
        deployment = "On-Prem" if any(token in text for token in ["on-prem", "on prem"]) else "Hybrid" if "hybrid" in text else "SaaS" if "saas" in text else None
        region = next((name for name, aliases in REGION_ALIASES.items() if any(alias in text for alias in aliases)), None)
        compliance = self._alias_matches(text, COMPLIANCE_ALIASES)
        integrations = self._alias_matches(text, INTEGRATION_ALIASES)
        has_category_signal = bool(categories or problems)
        vendor_capability_hint = bool(vendors) and bool(re.search(r"\b(?:can|does)\b.+\b(?:provide|offer|support)\b", text))
        intent = "comparison" if comparison_hint or len(compare_targets) >= 2 else "lookup" if (lookup_hint and not has_category_signal) or vendor_capability_hint else "recommendation"
        return ParsedQuery(query, intent, categories, problems, vendors, lookup_products, compare_targets, unsupported, deployment, region, compliance, integrations)

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

    def _lookup_vendors(self, text: str) -> list[str]:
        text_lc = text.lower()
        text_tokens = set(re.findall(r"[a-z0-9]+", text_lc))
        matches = []
        for vendor_name in self.vendor_names:
            vendor_lc = vendor_name.lower()
            if re.search(rf"\b{re.escape(vendor_lc)}\b", text_lc):
                matches.append(vendor_name)
                continue
            vendor_tokens = [token for token in re.findall(r"[a-z0-9]+", vendor_lc) if token not in VENDOR_SUFFIX_TOKENS]
            if not vendor_tokens:
                continue
            if len(vendor_tokens) == 1 and vendor_tokens[0] in text_tokens:
                matches.append(vendor_name)
                continue
            if len(vendor_tokens) > 1 and all(token in text_tokens for token in vendor_tokens[:2]):
                matches.append(vendor_name)
        unique = []
        seen = set()
        for name in matches:
            if name not in seen:
                unique.append(name)
                seen.add(name)
        return unique[:5]

    def _lookup_profile(self, parsed: ParsedQuery) -> dict[str, Any]:
        if not parsed.vendors and not parsed.lookup_products:
            if parsed.required_region:
                return self._insufficient(
                    parsed,
                    f"I can use {parsed.required_region} as a region constraint, but I still need a cybersecurity category, vendor, or problem area to recommend solutions responsibly.",
                    suggested_queries=self._region_guided_queries(parsed.required_region),
                )
            return self._insufficient(parsed, "I could not find a vendor or product matching your request in the current dataset.")
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
            capability_summary = self._vendor_capability_summary(parsed, vendor_name, vendor or {}, products)
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
                "capability_summary": capability_summary,
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
            "capability_summary": None,
            "assumptions": ["Product lookup answers are based on explicit product names present in the dataset."],
            "data_gaps": ["Detailed product capabilities are only available for categories covered by vendor_feature_matrix.json."],
            "confidence": "medium",
        }

    def _vendor_capability_summary(
        self,
        parsed: ParsedQuery,
        vendor_name: str,
        vendor: dict[str, Any],
        products: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        requested_categories = self._resolve_categories(parsed)
        if not requested_categories:
            return None
        assessments = []
        vendor_categories = set(vendor.get("categories", []))
        for category in requested_categories:
            matching_products = [product["product_name"] for product in products if category in product["categories"]]
            if matching_products:
                assessments.append({
                    "category": category,
                    "status": "product_supported",
                    "message": f"{vendor_name} has product-level coverage for {category} in the current dataset.",
                    "products": matching_products,
                })
            elif category in vendor_categories:
                assessments.append({
                    "category": category,
                    "status": "vendor_supported",
                    "message": f"{vendor_name} is tagged for {category}, but product-level records are not available yet.",
                    "products": [],
                })
            else:
                assessments.append({
                    "category": category,
                    "status": "not_supported",
                    "message": f"The current dataset does not show {vendor_name} covering {category}.",
                    "products": [],
                })
        return {
            "requested_categories": requested_categories,
            "assessments": assessments,
        }

    def _compare_products(self, parsed: ParsedQuery, matched_products: list[dict[str, Any]]) -> dict[str, Any]:
        rows = []
        missing = []
        excluded = []
        for target in parsed.compare_targets:
            target_lc = target.lower()
            products = [product for product in matched_products if target_lc in product["product_name"].lower() or target_lc == product["vendor"].lower()]
            if not products:
                missing.append(target)
                continue
            product = products[0]
            exclusion_reasons = self._exclusion_reasons(parsed, product)
            if exclusion_reasons:
                excluded.append({
                    "vendor": product["vendor"],
                    "product_name": product["product_name"],
                    "reasons": exclusion_reasons,
                })
                missing.append(target)
                continue
            category = product["primary_category"]
            rows.append({
                "vendor": product["vendor"],
                "product_name": product["product_name"],
                "category": category,
                "deployment_models": product["deployment_models"],
                "market_position": product.get("market_position"),
                "features": self.feature_lookup.get((product["vendor"].lower(), category), []),
                "score": self._weighted_score(parsed, product, category),
                "score_reason": self._comparison_reason(product),
            })
        if not rows:
            return self._insufficient(parsed, self._missing_comparison_reason(parsed, parsed.compare_targets), excluded_products=excluded)
        if missing:
            return self._insufficient(parsed, self._missing_comparison_reason(parsed, missing), excluded_products=excluded)
        rows.sort(key=lambda item: item["score"], reverse=True)
        return {
            "mode": "comparison",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": sorted({row["category"] for row in rows if row["category"]}),
            "constraints": self._constraints_dict(parsed),
            "comparison_results": rows,
            "missing_vendors": missing,
            "top_recommendation": rows[0],
            "excluded_products": excluded,
            "assumptions": ["Comparison is based only on named products present in the dataset and filtered by any explicit hard constraints in the query."],
            "data_gaps": self._data_gaps(parsed),
            "confidence": "medium" if len(rows) >= 2 else "low",
        }

    def _weighted_score(self, parsed: ParsedQuery, product: dict[str, Any], category: str | None) -> float:
        weights = {
            "deployment_fit": float(self.scoring_weights.get("deployment_fit", 0.25)),
            "feature_match": float(self.scoring_weights.get("feature_match", 0.20)),
            "integration_fit": float(self.scoring_weights.get("integration_fit", 0.15)),
            "compliance_fit": float(self.scoring_weights.get("compliance_fit", 0.15)),
            "market_position": float(self.scoring_weights.get("market_position", 0.15)),
            "cost_score": float(self.scoring_weights.get("cost_score", 0.05)),
            "operational_complexity": float(self.scoring_weights.get("operational_complexity", 0.05)),
        }
        components = {
            "deployment_fit": self._deployment_fit(parsed, product),
            "feature_match": self._feature_fit(product, category),
            "integration_fit": self._integration_fit(parsed, product),
            "compliance_fit": self._compliance_fit(parsed, product),
            "market_position": self._market_position_fit(product),
            "cost_score": self._cost_fit(product),
            "operational_complexity": self._operational_fit(product),
        }
        score = sum(weights[name] * components[name] for name in weights)
        return round(score, 1)

    def score_breakdown(self, product: dict[str, Any], category: str | None, parsed: ParsedQuery | None = None) -> dict[str, float]:
        if parsed is None:
            parsed = ParsedQuery("", "recommendation", [], [], [], [], [], [], None, None, [], [])
        product = self.product_name_lookup.get(str(product.get("product_name") or "").lower(), product)
        weights = {
            "deployment_fit": float(self.scoring_weights.get("deployment_fit", 0.25)),
            "feature_match": float(self.scoring_weights.get("feature_match", 0.20)),
            "integration_fit": float(self.scoring_weights.get("integration_fit", 0.15)),
            "compliance_fit": float(self.scoring_weights.get("compliance_fit", 0.15)),
            "market_position": float(self.scoring_weights.get("market_position", 0.15)),
            "cost_score": float(self.scoring_weights.get("cost_score", 0.05)),
            "operational_complexity": float(self.scoring_weights.get("operational_complexity", 0.05)),
        }
        components = {
            "Deployment Fit": self._deployment_fit(parsed, product),
            "Feature Match": self._feature_fit(product, category),
            "Integration Fit": self._integration_fit(parsed, product),
            "Compliance Fit": self._compliance_fit(parsed, product),
            "Market Position": self._market_position_fit(product),
            "Cost": self._cost_fit(product),
            "Complexity": self._operational_fit(product),
        }
        weight_list = list(weights.values())
        return {name: round(score * weight_list[i], 1) for i, (name, score) in enumerate(components.items())}

    def _comparison_reason(self, product: dict[str, Any]) -> str:
        parts = []
        if product["deployment_models"]:
            parts.append(f"deployment: {', '.join(product['deployment_models'])}")
        features = self.feature_lookup.get((product["vendor"].lower(), product["primary_category"]), [])
        if features:
            parts.append(f"known features: {', '.join(features[:3])}")
        return "; ".join(parts) if parts else "Named product found, but detailed comparison data is limited."

    def _constraints_dict(self, parsed: ParsedQuery) -> dict[str, object]:
        return {
            "deployment": parsed.required_deployment,
            "region": parsed.required_region,
            "compliance": parsed.required_compliance,
            "integrations": parsed.required_integrations,
        }

    def _has_hard_constraints(self, parsed: ParsedQuery) -> bool:
        return bool(
            parsed.required_deployment
            or parsed.required_region
            or parsed.required_compliance
            or parsed.required_integrations
        )

    def _missing_comparison_reason(self, parsed: ParsedQuery, missing_targets: list[str]) -> str:
        if self._has_hard_constraints(parsed):
            return f"I do not have reliable comparable records that satisfy the named request and hard constraints for: {', '.join(missing_targets)}."
        return f"I do not have reliable product or vendor records for: {', '.join(missing_targets)}. I would rather say that than fake a comparison."

    def _region_guided_queries(self, region: str) -> list[str]:
        return [
            f"Recommend SIEM solutions for the {region} market.",
            f"Which CNAPP vendors are available in the {region}?",
            f"Recommend PAM options for customers in the {region}.",
            f"Compare QRadar SIEM against Splunk Enterprise Security for the {region}.",
        ]

    def _data_gaps(self, parsed: ParsedQuery, vendor_only: bool = False) -> list[str]:
        gaps = []
        if vendor_only:
            gaps.append("Add product-level records for this category to enable more specific recommendations and comparisons.")
        else:
            gaps.append("Many products still lack detailed features, compliance, and integration fields in the current dataset.")
        if parsed.required_compliance:
            gaps.append("Compliance filtering is only as strong as the explicit compliance tags present on each product record.")
        if parsed.required_integrations:
            gaps.append("Integration filtering is only as strong as the explicit integration metadata present on each product record.")
        return gaps

    def _deployment_fit(self, parsed: ParsedQuery, product: dict[str, Any]) -> float:
        if not parsed.required_deployment:
            return 60.0
        if parsed.required_deployment in product.get("deployment_models", []):
            return 100.0
        if parsed.required_deployment == "On-Prem" and "Hybrid" in product.get("deployment_models", []):
            return 85.0
        return 25.0

    def _feature_fit(self, product: dict[str, Any], category: str | None) -> float:
        if not category:
            return 40.0
        features = self.feature_lookup.get((product["vendor"].lower(), category), [])
        if not features:
            return 45.0
        return min(100.0, 50.0 + len(features) * 10.0)

    def _integration_fit(self, parsed: ParsedQuery, product: dict[str, Any]) -> float:
        if not parsed.required_integrations:
            return 60.0
        supported = {item.lower() for item in product.get("integration_support", [])}
        matches = sum(1 for item in parsed.required_integrations if item.lower() in supported)
        return round((matches / len(parsed.required_integrations)) * 100.0, 1)

    def _compliance_fit(self, parsed: ParsedQuery, product: dict[str, Any]) -> float:
        if not parsed.required_compliance:
            return 60.0
        available = {item.lower() for item in product.get("compliance", [])}
        matches = sum(1 for item in parsed.required_compliance if item.lower() in available)
        return round((matches / len(parsed.required_compliance)) * 100.0, 1)

    def _market_position_fit(self, product: dict[str, Any]) -> float:
        position_scores = {"leader": 100.0, "strong": 75.0, "challenger": 50.0}
        position = str(product.get("market_position") or "").lower()
        return position_scores.get(position, 60.0)

    def _cost_fit(self, product: dict[str, Any]) -> float:
        tier_scores = {"low": 90.0, "medium": 70.0, "high": 45.0}
        tier = str(product.get("pricing_tier") or "").lower()
        return tier_scores.get(tier, 50.0)

    def _operational_fit(self, product: dict[str, Any]) -> float:
        complexity_scores = {"low": 90.0, "medium": 70.0, "high": 45.0}
        complexity = str(product.get("operational_complexity") or "").lower()
        return complexity_scores.get(complexity, 50.0)

    def _exclusion_reasons(self, parsed: ParsedQuery, product: dict[str, Any]) -> list[str]:
        reasons = []
        active_rules = set(self.hard_exclusions.get("rules", []))
        vendor = self.vendor_lookup.get(product["vendor"].lower(), {})
        deployment_models = product.get("deployment_models", [])
        compliance = {item.lower() for item in product.get("compliance", [])}
        integrations = {item.lower() for item in product.get("integration_support", [])}
        if (
            "exclude_if_required_onprem_and_product_saas_only" in active_rules
            and parsed.required_deployment == "On-Prem"
            and deployment_models == ["SaaS"]
        ):
            reasons.append("Excluded because the request requires on-prem and this product is SaaS-only.")
        if "exclude_if_required_compliance_missing" in active_rules and parsed.required_compliance and compliance:
            missing = [item for item in parsed.required_compliance if item.lower() not in compliance]
            if missing:
                reasons.append(f"Excluded because required compliance tags are missing: {', '.join(missing)}.")
        if (
            "exclude_if_product_not_available_in_region" in active_rules
            and parsed.required_region
            and parsed.required_region not in vendor.get("regions", [])
            and "Global" not in vendor.get("regions", [])
        ):
            reasons.append(f"Excluded because the product is not marked available in {parsed.required_region}.")
        if "exclude_if_required_integration_missing" in active_rules and parsed.required_integrations:
            missing = [item for item in parsed.required_integrations if item.lower() not in integrations]
            if missing:
                reasons.append(f"Excluded because required integrations are missing: {', '.join(missing)}.")
        return reasons

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
            "constraints": self._constraints_dict(parsed),
            "top_recommendation": rows[0],
            "ranked_vendors": rows,
            "excluded_products": [],
            "assumptions": ["This answer is vendor-level because the dataset has category coverage for vendors but no product records for this category."],
            "data_gaps": self._data_gaps(parsed, vendor_only=True),
            "confidence": "low-to-medium",
        }

    def _rank_category(self, parsed: ParsedQuery, category: str, products: list[dict[str, Any]]) -> dict[str, Any]:
        ranked = []
        excluded = []
        for product in products:
            if category not in product["categories"]:
                continue
            exclusion_reasons = self._exclusion_reasons(parsed, product)
            if exclusion_reasons:
                excluded.append({
                    "vendor": product["vendor"],
                    "product_name": product["product_name"],
                    "reasons": exclusion_reasons,
                })
                continue
            ranked.append({
                "vendor": product["vendor"],
                "product_name": product["product_name"],
                "category": category,
                "deployment_models": product["deployment_models"],
                "market_position": product.get("market_position"),
                "features": self.feature_lookup.get((product["vendor"].lower(), category), []),
                "score": self._weighted_score(parsed, product, category),
                "score_reason": self._comparison_reason(product),
            })
        ranked.sort(key=lambda item: item["score"], reverse=True)
        if not ranked:
            return self._insufficient(parsed, f"I found the category {category}, but there are no comparable products in the current dataset that satisfy the hard constraints in your request.", [category], excluded_products=excluded)
        return {
            "mode": "single_category",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": [category],
            "constraints": self._constraints_dict(parsed),
            "top_recommendation": ranked[0],
            "ranked_products": ranked[:5],
            "excluded_products": excluded,
            "assumptions": ["Scoring uses configured weights across deployment, available feature coverage, integrations, compliance, cost, and operational complexity when the dataset contains those fields."],
            "data_gaps": self._data_gaps(parsed),
            "confidence": "low-to-medium",
        }

    def _build_stack(self, parsed: ParsedQuery, categories: list[str]) -> dict[str, Any]:
        stack = []
        all_excluded: list[dict[str, Any]] = []
        for category in categories:
            cat_products = [p for p in self.products if category in p["categories"]]
            if not cat_products:
                vendor_matches = self._vendor_category_matches(category)
                if vendor_matches:
                    stack.append({
                        "category": category,
                        "status": "vendor_only",
                        "message": f"Vendor-level coverage only for {category}. No product records available yet.",
                        "recommended_product": None,
                    })
                else:
                    stack.append({
                        "category": category,
                        "status": "insufficient_data",
                        "message": f"No coverage for {category} in the current dataset.",
                        "recommended_product": None,
                    })
                continue
            ranked = self._rank_category(parsed, category, cat_products)
            all_excluded.extend(ranked.get("excluded_products", []))
            if ranked["mode"] == "insufficient_data":
                stack.append({
                    "category": category,
                    "status": "insufficient_data",
                    "message": ranked["reason"],
                    "recommended_product": None,
                })
            else:
                stack.append({
                    "category": category,
                    "status": "ok",
                    "message": None,
                    "recommended_product": ranked["top_recommendation"],
                })
        ok_count = sum(1 for item in stack if item["status"] == "ok")
        confidence = "medium" if ok_count == len(categories) else "low-to-medium" if ok_count else "low"
        return {
            "mode": "stack",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": categories,
            "constraints": self._constraints_dict(parsed),
            "solution_stack": stack,
            "excluded_products": all_excluded,
            "assumptions": ["Each category is evaluated independently using the same constraint filters."],
            "data_gaps": self._data_gaps(parsed),
            "confidence": confidence,
        }

    def _alias_matches(self, text: str, alias_map: dict[str, list[str]]) -> list[str]:
        return [name for name, aliases in alias_map.items() if any(self._contains_alias(text, alias) for alias in aliases)]

    def _contains_alias(self, text: str, alias: str) -> bool:
        pattern = rf"(?<![a-z0-9]){re.escape(alias.lower())}(?![a-z0-9])"
        return bool(re.search(pattern, text))

    def _vendor_scope(self, text: str) -> str:
        match = re.search(r"compare\s+(.+?)(?:\s+for\s+.+|$)", text)
        if match:
            return match.group(1)
        return text

    def _compare_targets(self, query: str) -> list[str]:
        text = query.strip().rstrip('.?')
        match = re.search(r"compare\s+(.+?)(?:\s+for\s+.+|$)", text, re.IGNORECASE)
        scope = match.group(1) if match else text
        parts = re.split(r"\s+(?:vs|versus|against|and|with)\s+", scope, flags=re.IGNORECASE)
        cleaned = []
        for part in parts:
            item = part.strip(' .')
            lowered = item.lower()
            for prefix in ('the ', 'what about ', 'how about ', 'tell me about '):
                if lowered.startswith(prefix):
                    item = item[len(prefix):].strip()
                    lowered = item.lower()
            normalized = TERM_NORMALIZATIONS.get(lowered)
            if normalized:
                item = normalized
            if item:
                cleaned.append(item)
        return cleaned[:4]

    def _insufficient(self, parsed: ParsedQuery, reason: str, categories: list[str] | None = None, excluded_products: list[dict[str, Any]] | None = None, suggested_queries: list[str] | None = None) -> dict[str, Any]:
        return {
            "mode": "insufficient_data",
            "query": parsed.raw_query,
            "interpreted_problem": parsed.problems,
            "solution_categories": categories or [],
            "constraints": self._constraints_dict(parsed),
            "reason": reason,
            "excluded_products": excluded_products or [],
            "supported_categories": self.supported_categories,
            "suggested_queries": suggested_queries or self.get_examples(),
            "assumptions": ["The assistant only compares products that exist explicitly in the current dataset."],
            "data_gaps": self._data_gaps(parsed),
            "confidence": "low",
        }

    def get_examples(self) -> list[str]:
        return [
            "Compare QRadar SIEM against Splunk Enterprise Security.",
            "Recommend CNAPP options for a cloud security program.",
            "Compare Falcon Insight XDR against Cortex XDR.",
            "Recommend identity protection tools for privileged access use cases.",
        ]
