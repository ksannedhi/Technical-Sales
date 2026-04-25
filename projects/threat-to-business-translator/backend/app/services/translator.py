from __future__ import annotations

import re
from collections import Counter
from copy import deepcopy

from .data_loader import get_scenario_bundle, load_domain


# Legacy 1-D label map — kept for reference.
RISK_LABELS = {
    1: "low",
    2: "moderate",
    3: "moderate",
    4: "high",
    5: "critical",
}

# Fix #5: ISO 31000-aligned 5×5 risk matrix keyed by (likelihood, impact).
# Replaces the naive max(likelihood, impact) lookup that over-rated low-likelihood,
# high-impact scenarios.
RISK_MATRIX: dict[tuple[int, int], str] = {
    (1, 1): "low",      (1, 2): "low",      (1, 3): "moderate", (1, 4): "moderate", (1, 5): "moderate",
    (2, 1): "low",      (2, 2): "moderate",  (2, 3): "moderate", (2, 4): "high",     (2, 5): "high",
    (3, 1): "moderate", (3, 2): "moderate",  (3, 3): "high",     (3, 4): "high",     (3, 5): "critical",
    (4, 1): "moderate", (4, 2): "high",      (4, 3): "high",     (4, 4): "critical",  (4, 5): "critical",
    (5, 1): "moderate", (5, 2): "high",      (5, 3): "critical",  (5, 4): "critical",  (5, 5): "critical",
}

# Fix #6: FAIR-inspired correlated loss weights. Each subsequent finding (sorted by loss,
# descending) contributes at a diminishing rate — prevents linear over-summation when
# findings share infrastructure or blast radius.
CORRELATION_WEIGHTS = [1.0, 0.5, 0.3, 0.2, 0.15]
CORRELATION_WEIGHT_TAIL = 0.10

DEFAULT_PROFILE = {
    "annual_revenue_musd": 250,
    "employee_count": 5000,
    "internet_exposure": 4,
    "security_maturity": 3,
    "regulatory_sensitivity": 4,
    "crown_jewel_dependency": 4,
}

SEVERITY_ORDER = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}

AD_HOC_SUMMARY_LIMIT = 2000
SCAN_REPORT_SUMMARY_LIMIT = 12000

SCENARIO_MATCHERS = {
    "deepfake-payment-diversion": {
        "keywords": {
            "deepfake": 4,
            "voice note": 3,
            "impersonat": 3,
            "payment reroute": 4,
            "urgent transfer": 3,
            "cfo": 2,
        },
    },
    "cloud-storage-regulated-data": {
        "keywords": {
            "bucket": 4,
            "public read": 4,
            "storage": 2,
            "s3": 5,
            "blob": 3,
            "object storage": 3,
        },
    },
    "privileged-admin-mfa-gap": {
        "keywords": {
            "mfa not enabled": 5,
            "multi-factor authentication not enabled": 5,
            "without mfa": 4,
            "administrator accounts": 3,
            "privileged accounts": 3,
            "vpn authentication": 3,
            "remote access": 2,
        },
    },
    "finance-sql-server-rce": {
        "keywords": {
            "sql server": 5,
            "microsoft sql": 4,
            "database server": 3,
            "remote code execution": 4,
            "rce": 4,
            "cve-2022-41064": 5,
        },
    },
    "customer-portal-outdated-web": {
        "keywords": {
            "apache": 4,
            "nginx": 4,
            "web server": 4,
            "customer portal": 4,
            "outdated version": 3,
            "known vulnerabilities": 2,
            # OS command injection / web injection / RCE via HTTP
            "os command injection": 5,
            "command injection": 4,
            "cwe-78": 5,
            "cwe-89": 5,
            "sql injection": 4,
            "execute unauthorized code": 4,
            "crafted http": 4,
            "crafted request": 3,
            "unauthorized code": 3,
            "injection": 2,
            "http request": 2,
            "unauthenticated": 2,
        },
    },
    "vpn-zero-day-finance": {
        "keywords": {
            "vpn gateway": 5,
            "cve-": 3,
            "cvss": 2,
            "remote code execution": 3,
            "vulnerable": 2,
            "authentication bypass": 4,
            "internet-facing": 3,
            "scan report": 1,
        },
        "file_extensions": {".csv", ".json", ".pdf", ".log", ".txt"},
    },
    "edr-identity-lateral": {
        "keywords": {
            "lateral movement": 4,
            "powershell": 4,
            "token reuse": 4,
            "edr": 3,
            "identity compromise": 4,
            "impossible travel": 3,
        },
    },
    "supplier-ransomware-chain": {
        "keywords": {
            "supplier": 4,
            "third-party": 4,
            "ransomware": 5,
            "fulfillment": 4,
            "partner vpn": 3,
        },
    },
}


def default_profile() -> dict:
    return dict(DEFAULT_PROFILE)


def normalize_profile(profile: dict | None) -> dict:
    merged = default_profile()
    if profile:
        for key, value in profile.items():
            if key in merged and value is not None:
                merged[key] = int(value)
    return merged


def translate_scenario(scenario_id: str, profile: dict | None = None) -> dict | None:
    bundle = get_scenario_bundle(scenario_id)
    if bundle is None:
        return None
    return _build_report(bundle, normalize_profile(profile))


def analyze_raw_input(raw_text: str, file_name: str | None = None, profile: dict | None = None) -> dict:
    domain = load_domain()
    org_profile = normalize_profile(profile)
    parsed_findings = _parse_scan_report(raw_text)
    if len(parsed_findings) >= 2:
        return _analyze_scan_report(raw_text, file_name, org_profile, domain, parsed_findings)
    return _analyze_single_input(raw_text, file_name, org_profile, domain)


def _analyze_single_input(
    raw_text: str,
    file_name: str | None,
    org_profile: dict,
    domain: dict,
    finding: dict | None = None,
) -> dict:
    scenario = _infer_scenario(raw_text, file_name, domain)
    if finding is not None:
        scenario = _apply_finding_overrides(scenario, finding)
    bundle = _bundle_for_inferred_scenario(scenario, domain)
    report = _build_report(bundle, org_profile)
    report["scenario_name"] = scenario["name"]
    report["scenario_id"] = scenario["id"]
    report["technical_summary"] = raw_text.strip()[:AD_HOC_SUMMARY_LIMIT]
    report["analysis_type"] = "ad_hoc"
    report["leadership_output"]["headline"] = _ad_hoc_headline(raw_text, report["leadership_output"]["headline"])
    return report


def _analyze_scan_report(
    raw_text: str,
    file_name: str | None,
    org_profile: dict,
    domain: dict,
    findings: list[dict],
) -> dict:
    finding_reports = [
        _analyze_single_input(_finding_text(finding), file_name, org_profile, domain, finding=finding)
        for finding in findings
    ]
    ranked_reports = sorted(
        zip(findings, finding_reports, strict=False),
        key=lambda item: (
            SEVERITY_ORDER.get(item[0]["severity"], 1),
            item[1]["business_impact"]["impact_band"]["likely_usd"],
            item[1]["risk_assessment"]["urgency"],
        ),
        reverse=True,
    )
    top_finding, top_report = ranked_reports[0]
    report = deepcopy(top_report)

    # Fix #6: correlated aggregation — diminishing weights prevent linear over-summation
    # when multiple findings share infrastructure or map to overlapping scenarios.
    low_total = _correlated_sum([item["business_impact"]["impact_band"]["low_usd"] for _, item in ranked_reports])
    likely_total = _correlated_sum([item["business_impact"]["impact_band"]["likely_usd"] for _, item in ranked_reports])
    high_total = _correlated_sum([item["business_impact"]["impact_band"]["high_usd"] for _, item in ranked_reports])
    downtime_max = max(item["business_impact"]["impact_band"]["downtime_hours"] for _, item in ranked_reports)
    people_total = max(item["business_impact"]["impact_band"]["people_affected"] for _, item in ranked_reports)
    likelihood = max(item["risk_assessment"]["likelihood"] for _, item in ranked_reports)
    impact = max(item["risk_assessment"]["impact"] for _, item in ranked_reports)
    urgency = max(item["risk_assessment"]["urgency"] for _, item in ranked_reports)
    confidence = round(sum(item["risk_assessment"]["confidence"] for _, item in ranked_reports) / len(ranked_reports), 2)
    severity_counts = Counter(finding["severity"] for finding in findings)
    top_services = _top_ranked_values(
        [item["business_context"]["business_service"] for _, item in ranked_reports],
        limit=3,
    )
    top_actions = _top_ranked_values(
        [
            action
            for finding, item in ranked_reports
            for action in _merge_actions(finding.get("recommendations", []), item["leadership_output"]["recommended_actions"])
        ],
        limit=4,
    )

    report["analysis_type"] = "scan_report"
    report["scenario_id"] = "ad-hoc-scan-report"
    report["scenario_name"] = f"Vulnerability scan report analysis{f' ({file_name})' if file_name else ''}"
    report["technical_summary"] = raw_text.strip()[:SCAN_REPORT_SUMMARY_LIMIT]
    report["business_context"] = _aggregate_business_context(ranked_reports)
    report["exposure_scores"] = _aggregate_exposure_scores(ranked_reports)
    report["business_impact"]["impact_band"] = {
        "low_usd": low_total,
        "likely_usd": likely_total,
        "high_usd": high_total,
        "downtime_hours": downtime_max,
        "people_affected": people_total,
    }
    report["business_impact"]["summary"] = (
        f"This scan report contains {len(findings)} findings, including {severity_counts.get('critical', 0)} critical and "
        f"{severity_counts.get('high', 0)} high issues. The modeled combined likely loss exposure is ${likely_total:,} "
        f"(correlation-adjusted), with the highest business disruption pressure on {', '.join(top_services)}."
    )
    report["risk_assessment"]["likelihood"] = likelihood
    report["risk_assessment"]["impact"] = impact
    report["risk_assessment"]["urgency"] = urgency
    report["risk_assessment"]["confidence"] = confidence
    report["risk_assessment"]["overall_risk"] = RISK_MATRIX.get((likelihood, impact), "moderate")  # Fix #5
    report["risk_assessment"]["rationale"] = [
        f"Uploaded report contains {len(findings)} discrete findings mapped across {len(top_services)} business services.",
        f"Highest-severity finding is '{top_finding['title']}' with severity {top_finding['severity']}.",
        f"Top exposed business services are {', '.join(top_services)}.",
        f"Combined modeled likely loss exposure is ${likely_total:,} across the uploaded findings (correlation-adjusted).",
    ]
    # Fix #6: correlated aggregation for avoided loss as well.
    report["risk_reduction_if_fixed"]["likely_loss_avoided_usd"] = _correlated_sum(
        [item["risk_reduction_if_fixed"]["likely_loss_avoided_usd"] for _, item in ranked_reports]
    )
    report["risk_reduction_if_fixed"]["downtime_avoided_hours"] = max(
        item["risk_reduction_if_fixed"]["downtime_avoided_hours"] for _, item in ranked_reports
    )
    report["risk_reduction_if_fixed"]["summary"] = (
        f"If the highest-priority remediation actions are completed, leadership can reduce the report-level risk concentration "
        f"and avoid about ${report['risk_reduction_if_fixed']['likely_loss_avoided_usd']:,} in modeled likely loss exposure "
        f"(correlation-adjusted across {len(findings)} findings)."
    )
    report["leadership_output"]["headline"] = (
        f"{len(findings)} scan findings map to a likely ${likely_total:,} business risk concentration requiring leadership review."
    )
    report["leadership_output"]["executive_summary"] = (
        f"The uploaded vulnerability assessment identifies multiple issues across internet-facing access, cloud data exposure, "
        f"and core business platforms. The highest-risk findings affect {', '.join(top_services)}, and the combined modeled "
        f"likely loss exposure is ${likely_total:,}. Leadership should prioritize the critical findings first and track closure "
        f"against the actions listed in the roll-up."
    )
    report["leadership_output"]["board_brief"] = (
        f"Leadership should treat this as a multi-finding exposure event rather than a single vulnerability. The report includes "
        f"{severity_counts.get('critical', 0)} critical and {severity_counts.get('high', 0)} high findings, with a modeled high-case "
        f"exposure of ${high_total:,}."
    )
    report["leadership_output"]["recommended_actions"] = top_actions
    report["report_rollup"] = {
        "total_findings": len(findings),
        "severity_counts": {
            "critical": severity_counts.get("critical", 0),
            "high": severity_counts.get("high", 0),
            "medium": severity_counts.get("medium", 0),
            "low": severity_counts.get("low", 0),
        },
        "highest_severity": _highest_severity(findings),
        "top_business_services": top_services,
        "top_actions": top_actions,
        "summary": report["leadership_output"]["executive_summary"],
    }
    report["finding_summaries"] = [
        {
            "finding_id": finding["finding_id"],
            "title": finding["title"],
            "severity": finding["severity"],
            "scenario_name": item["scenario_name"],
            "mapped_business_service": item["business_context"]["business_service"],
            "affected_asset": finding.get("affected_asset") or item["business_context"]["primary_asset"],
            "overall_risk": item["risk_assessment"]["overall_risk"],
            "likely_loss_usd": item["business_impact"]["impact_band"]["likely_usd"],
            "headline": item["leadership_output"]["headline"],
            "recommended_actions": _merge_actions(finding.get("recommendations", []), item["leadership_output"]["recommended_actions"])[:3],
        }
        for finding, item in ranked_reports
    ]
    return report


def _infer_scenario(raw_text: str, file_name: str | None, domain: dict) -> dict:
    text = (raw_text or "").lower()
    file_name = (file_name or "manual-input").lower()
    scored_templates = []
    for scenario_id, matcher in SCENARIO_MATCHERS.items():
        score = 0
        for token, weight in matcher.get("keywords", {}).items():
            if token in text:
                score += weight
        if any(file_name.endswith(ext) for ext in matcher.get("file_extensions", set())):
            score += 1
        if score > 0:
            scored_templates.append((score, scenario_id))

    if scored_templates:
        scored_templates.sort(key=lambda item: item[0], reverse=True)
        template = _scenario_by_id(domain, scored_templates[0][1])
    else:
        template = _scenario_by_id(domain, "edr-identity-lateral")

    scenario = deepcopy(template)
    scenario["id"] = f"ad-hoc-{template['id']}"
    scenario["name"] = f"Ad hoc analysis based on {template['name']}"
    scenario["technical_signal"] = raw_text.strip()[:2000] or template["technical_signal"]
    scenario["executive_trigger"] = _derive_executive_trigger(raw_text, template["executive_trigger"])

    # Fix: for ad hoc input, reset evidence_quality and context_completeness to
    # conservative baselines before text-driven adjustments. Template values (often 5/5)
    # reflect a fully-confirmed, well-documented incident scenario — not a pasted CVE
    # advisory or SIEM alert where confirmation and asset context are unknown.
    # exploitability and threat_activity are kept from the template (they reflect the
    # vulnerability's inherent characteristics) and adjusted by _derive_signal_factors.
    ad_hoc_defaults = {
        **template["signal_factors"],
        "evidence_quality": min(template["signal_factors"]["evidence_quality"], 2),
        "context_completeness": min(template["signal_factors"]["context_completeness"], 2),
    }
    scenario["signal_factors"] = _derive_signal_factors(raw_text, ad_hoc_defaults)
    scenario["recommended_actions"] = template["recommended_actions"]
    return scenario


def _derive_executive_trigger(raw_text: str, fallback: str) -> str:
    text = raw_text.strip()
    if not text:
        return fallback
    first_sentence = text.split(".")[0].strip()
    if len(first_sentence) < 20:
        return fallback
    limit = 280
    if len(first_sentence) <= limit:
        return first_sentence
    # Truncate at the last word boundary before the limit to avoid mid-word cuts.
    # Preserving conditional clauses (e.g. "under specific configuration") is important
    # for accuracy — truncating before them silently inflates the apparent severity.
    truncated = first_sentence[:limit].rsplit(" ", 1)[0]
    return truncated + "…"


def _derive_signal_factors(raw_text: str, defaults: dict) -> dict:
    text = raw_text.lower()
    exploitability = defaults["exploitability"]
    threat_activity = defaults["threat_activity"]
    evidence_quality = defaults["evidence_quality"]
    context_completeness = defaults["context_completeness"]

    # Upward adjustments — confirmed severity signals
    if any(token in text for token in ["critical", "active exploitation", "known exploited", "rce", "remote code execution",
                                        "unauthenticated attacker", "no authentication required"]):
        exploitability = min(5, exploitability + 1)
    if any(token in text for token in ["high", "sev 1", "urgent", "multiple hosts", "multiple assets"]):
        threat_activity = min(5, threat_activity + 1)
    if any(token in text for token in ["ioc", "evidence", "observed", "confirmed", "scan", "cvss"]):
        evidence_quality = min(5, evidence_quality + 1)
    if any(token in text for token in ["asset", "owner", "business unit", "internet-facing", "public"]):
        context_completeness = min(5, context_completeness + 1)

    # Downward adjustments — conditional/hedged language lowers exploitability.
    # A vulnerability that only triggers "under specific configuration" or "may allow"
    # has a narrower real-world attack surface than an unconditional exploit.
    # -2: strong conditionality (specific server config, physical access required)
    # -1: moderate hedge (probabilistic language, authenticated-attacker precondition)
    strong_conditional = [
        "under specific",
        "specific configuration",
        "specific ldap",
        "when configured",
        "if configured",
        "requires physical",
        "physical access",
        "under certain conditions",
        "in certain configurations",
        "requires local",
        "local access required",
    ]
    moderate_conditional = [
        "may allow",
        "could allow",
        "might allow",
        "requires authentication",
        "authenticated attacker",
        "authenticated user",
        "low privileges required",
        "user interaction required",
        "requires user",
    ]

    if any(token in text for token in strong_conditional):
        exploitability = max(1, exploitability - 2)
        # Conditional exploits are less likely to have active threat campaigns
        threat_activity = max(1, threat_activity - 1)
    elif any(token in text for token in moderate_conditional):
        exploitability = max(1, exploitability - 1)

    if "medium" in text and exploitability > 3:
        exploitability -= 1

    return {
        "exploitability": exploitability,
        "threat_activity": threat_activity,
        "evidence_quality": evidence_quality,
        "context_completeness": context_completeness,
    }


def _parse_scan_report(raw_text: str) -> list[dict]:
    matches = list(
        re.finditer(
            r"Finding\s+(?P<number>\d+)\s*:\s*(?P<title>[^\r\n]+)\s*(?P<body>.*?)(?=Finding\s+\d+\s*:|Conclusion|$)",
            raw_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
    )
    findings: list[dict] = []
    for match in matches:
        block = f"Finding {match.group('number')}: {match.group('title').strip()}\n{match.group('body').strip()}".strip()
        findings.append(
            {
                "finding_id": f"finding-{match.group('number')}",
                "title": match.group("title").strip(),
                "severity": _extract_field(block, "Severity", default="medium").lower(),
                "cve": _extract_field(block, "CVE"),
                "description": _extract_field(block, "Description"),
                "affected_asset": _extract_field(block, "Affected Asset"),
                "business_impact": _extract_field(block, "Business Impact"),
                "recommendations": _split_recommendations(_extract_field(block, "Recommendation")),
                "raw_text": block,
            }
        )
    return findings


def _extract_field(block: str, label: str, default: str = "") -> str:
    match = re.search(rf"{label}:\s*(.+)", block, flags=re.IGNORECASE)
    return match.group(1).strip() if match else default


def _split_recommendations(value: str) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in re.split(r"[;]|(?:\.\s+)", value) if part.strip()]


def _finding_text(finding: dict) -> str:
    parts = [
        finding["title"],
        f"Severity: {finding['severity']}",
        f"CVE: {finding['cve']}" if finding.get("cve") else "",
        finding.get("description", ""),
        f"Affected Asset: {finding['affected_asset']}" if finding.get("affected_asset") else "",
        f"Business Impact: {finding['business_impact']}" if finding.get("business_impact") else "",
        finding.get("raw_text", ""),
    ]
    return "\n".join(part for part in parts if part)


def _apply_finding_overrides(scenario: dict, finding: dict) -> dict:
    scenario = deepcopy(scenario)
    scenario["id"] = f"ad-hoc-{finding['finding_id']}-{scenario['id']}"
    scenario["name"] = f"{finding['title']} mapped to {scenario['name']}"
    scenario["technical_signal"] = _finding_text(finding)[:2000]
    scenario["executive_trigger"] = _derive_executive_trigger(
        f"{finding['title']}. {finding.get('business_impact', '')}".strip(),
        scenario["executive_trigger"],
    )
    scenario["signal_factors"] = _derive_signal_factors(scenario["technical_signal"], scenario["signal_factors"])
    scenario["recommended_actions"] = _merge_actions(finding.get("recommendations", []), scenario["recommended_actions"])
    return scenario


def _merge_actions(*action_lists: list[str]) -> list[str]:
    merged: list[str] = []
    for action_list in action_lists:
        for action in action_list:
            if action and action not in merged:
                merged.append(action)
    return merged


def _top_ranked_values(values: list[str], limit: int) -> list[str]:
    counts = Counter(value for value in values if value)
    return [item for item, _ in counts.most_common(limit)]


def _highest_severity(findings: list[dict]) -> str:
    return max(findings, key=lambda item: SEVERITY_ORDER.get(item["severity"], 1))["severity"]


def _aggregate_business_context(ranked_reports: list[tuple[dict, dict]]) -> dict:
    finding_count = len(ranked_reports)
    business_units = _top_ranked_values(
        [item["business_context"]["business_unit"] for _, item in ranked_reports],
        limit=4,
    )
    business_services = _top_ranked_values(
        [item["business_context"]["business_service"] for _, item in ranked_reports],
        limit=4,
    )
    owners = _top_ranked_values(
        [item["business_context"]["service_owner"] for _, item in ranked_reports],
        limit=4,
    )
    primary_assets = _top_ranked_values(
        [item["business_context"]["primary_asset"] for _, item in ranked_reports],
        limit=6,
    )
    primary_asset_types = _top_ranked_values(
        [item["business_context"]["primary_asset_type"] for _, item in ranked_reports],
        limit=6,
    )
    affected_assets = _top_ranked_values(
        [
            asset
            for _, item in ranked_reports
            for asset in item["business_context"]["affected_assets"]
        ],
        limit=10,
    )
    impacted_identities = _top_ranked_values(
        [
            identity
            for _, item in ranked_reports
            for identity in item["business_context"]["impacted_identities"]
        ],
        limit=8,
    )
    controls = _top_ranked_values(
        [
            control
            for _, item in ranked_reports
            for control in item["business_context"]["control_posture"]
        ],
        limit=10,
    )
    dependencies = _top_ranked_values(
        [
            dependency
            for _, item in ranked_reports
            for dependency in item["business_context"]["key_dependencies"]
        ],
        limit=8,
    )

    return {
        "business_unit": ", ".join(business_units),
        "business_service": ", ".join(business_services),
        "service_owner": ", ".join(owners),
        "internet_exposed": any(item["business_context"]["internet_exposed"] for _, item in ranked_reports),
        "primary_asset": f"{finding_count} assets across the uploaded findings",
        "primary_asset_type": ", ".join(primary_asset_types[:3]),
        "affected_assets": affected_assets or primary_assets,
        "impacted_identities": impacted_identities,
        "control_posture": controls,
        "key_dependencies": dependencies,
    }


def _aggregate_exposure_scores(ranked_reports: list[tuple[dict, dict]]) -> dict[str, int]:
    all_keys = {
        key
        for _, item in ranked_reports
        for key in item["exposure_scores"].keys()
    }
    aggregated: dict[str, int] = {}
    for key in all_keys:
        values = [item["exposure_scores"].get(key, 0) for _, item in ranked_reports]
        aggregated[key] = round(sum(values) / len(values))
    return aggregated


def _scenario_by_id(domain: dict, scenario_id: str) -> dict:
    for item in domain["scenarios"]:
        if item["id"] == scenario_id:
            return item
    raise KeyError(f"Scenario {scenario_id} not found")


def _bundle_for_inferred_scenario(scenario: dict, domain: dict) -> dict:
    services = {item["id"]: item for item in domain["business_services"]}
    assets = {item["id"]: item for item in domain["assets"]}
    identities = {item["id"]: item for item in domain["identities"]}
    controls = {item["id"]: item for item in domain["controls"]}
    business_units = {item["id"]: item for item in domain["business_units"]}

    service = services[scenario["service_id"]]
    business_unit = business_units[service["business_unit_id"]]
    primary_asset = assets[scenario["primary_asset_id"]]
    linked_assets = [assets[item] for item in scenario.get("asset_ids", []) if item in assets]
    linked_identities = [identities[item] for item in scenario.get("identity_ids", []) if item in identities]

    control_ids = set(primary_asset.get("control_ids", []))
    for asset in linked_assets:
        control_ids.update(asset.get("control_ids", []))
    linked_controls = [controls[item] for item in control_ids if item in controls]

    return {
        "scenario": scenario,
        "service": service,
        "business_unit": business_unit,
        "primary_asset": primary_asset,
        "linked_assets": linked_assets,
        "linked_identities": linked_identities,
        "linked_controls": linked_controls,
    }


def _build_report(bundle: dict, profile: dict) -> dict:
    scenario = bundle["scenario"]
    service = bundle["service"]
    business_unit = bundle["business_unit"]
    primary_asset = bundle["primary_asset"]
    linked_assets = bundle["linked_assets"]
    linked_identities = bundle["linked_identities"]
    linked_controls = bundle["linked_controls"]

    # Fix #3: scope loss to the affected BU's proportional share of org revenue.
    # Using the BU's share of the fictional enterprise total as a structural weight
    # against the customer's org revenue avoids inflating BU-scoped incidents to
    # full company scale.
    domain = load_domain()
    total_bu_revenue = sum(bu["annual_revenue_musd"] for bu in domain["business_units"])
    bu_proportion = business_unit["annual_revenue_musd"] / total_bu_revenue

    coverage_score = _coverage_score(linked_controls)
    exploitability = scenario["signal_factors"]["exploitability"]
    threat_activity = scenario["signal_factors"]["threat_activity"]
    base_internet_exposure = 5 if primary_asset["internet_exposed"] else 2
    internet_exposure = max(1, min(5, round((base_internet_exposure + profile["internet_exposure"]) / 2)))
    control_gap = max(1, min(5, round(5 - (coverage_score / 25) + ((3 - profile["security_maturity"]) * 0.4))))

    # Fix #1: exploitability is the dominant term (0.42) per CVSS/FAIR convention.
    # Removed the redundant profile["internet_exposure"] * 0.1 term — internet exposure
    # is already captured in the blended internet_exposure variable above.
    # Weights: exploitability 0.42, control_gap 0.20, threat_activity 0.20,
    #          internet_exposure 0.18 → sum = 1.00.
    likelihood = _bounded_round(
        exploitability * 0.42
        + internet_exposure * 0.18
        + control_gap * 0.2
        + threat_activity * 0.2
    )
    impact = _bounded_round(
        service["criticality"] * 0.24
        + service["data_sensitivity"] * 0.18
        + service["user_scale"] * 0.14
        + service["revenue_dependency"] * 0.14
        + profile["regulatory_sensitivity"] * 0.14
        + profile["crown_jewel_dependency"] * 0.16
    )
    urgency = _bounded_round((likelihood * 0.55) + (impact * 0.45))

    # Fix #2: base lowered from 0.4 → 0.12; minimum confidence is now ~28% for
    # ambiguous input with minimal evidence quality and context completeness.
    confidence = round(
        min(
            0.98,
            0.12
            + scenario["signal_factors"]["evidence_quality"] * 0.07
            + scenario["signal_factors"]["context_completeness"] * 0.05
            + profile["security_maturity"] * 0.04,
        ),
        2,
    )

    impact_band = _impact_band(service, business_unit, likelihood, impact, profile, bu_proportion)

    # Fix #4: scenario-aware residual deltas.
    residual_likelihood, residual_impact = _residual_deltas(scenario, service, profile, likelihood, impact)
    residual_impact_band = _impact_band(service, business_unit, residual_likelihood, residual_impact, profile, bu_proportion)

    return {
        "scenario_id": scenario["id"],
        "scenario_name": scenario["name"],
        "audience": "CISO / Senior Leadership",
        "analysis_type": "scenario",
        "technical_summary": scenario["technical_signal"],
        "business_context": _business_context(service, business_unit, primary_asset, linked_assets, linked_identities, linked_controls),
        "exposure_scores": _exposure_scores(exploitability, internet_exposure, control_gap, threat_activity, service, profile),
        "organization_profile": profile,
        "business_impact": {
            "summary": _business_impact_summary(service, business_unit, impact_band, likelihood, impact),
            "impact_band": impact_band,
            "regulatory_exposure": _band_label(max(service["data_sensitivity"], profile["regulatory_sensitivity"])),
            "reputation_exposure": _band_label(max(service["user_scale"], service["criticality"])),
            "operational_exposure": _band_label(max(service["criticality"], service["revenue_dependency"], profile["crown_jewel_dependency"])),
        },
        "risk_assessment": {
            "likelihood": likelihood,
            "impact": impact,
            "urgency": urgency,
            "confidence": confidence,
            "overall_risk": RISK_MATRIX.get((likelihood, impact), "moderate"),  # Fix #5
            "rationale": _rationale(service, primary_asset, scenario, coverage_score, likelihood, impact, profile),
        },
        "risk_reduction_if_fixed": _risk_reduction_if_fixed(
            impact_band, residual_likelihood, residual_impact, residual_impact_band, scenario, service, profile
        ),
        "leadership_output": {
            "headline": _headline(service, impact_band),
            "executive_summary": _executive_summary(scenario, service, primary_asset, impact_band, likelihood, impact),
            "board_brief": _board_brief(service, business_unit, impact_band, urgency),
            "recommended_actions": scenario["recommended_actions"],
        },
        "report_rollup": None,
        "finding_summaries": [],
    }


def _coverage_score(controls: list[dict]) -> float:
    if not controls:
        return 0
    return sum(item["effectiveness"] for item in controls) / len(controls)


def _business_context(
    service: dict,
    business_unit: dict,
    primary_asset: dict,
    linked_assets: list[dict],
    linked_identities: list[dict],
    linked_controls: list[dict],
) -> dict:
    return {
        "business_unit": business_unit["name"],
        "business_service": service["name"],
        "service_owner": service["service_owner"],
        "internet_exposed": primary_asset["internet_exposed"],
        "primary_asset": primary_asset["name"],
        "primary_asset_type": primary_asset["asset_type"],
        "affected_assets": [item["name"] for item in linked_assets],
        "impacted_identities": [item["name"] for item in linked_identities],
        "control_posture": [f"{item['name']} ({item['status']})" for item in linked_controls],
        "key_dependencies": service["key_dependencies"],
    }


def _bounded_round(score: float) -> int:
    return max(1, min(5, round(score)))


def _band_label(score: int) -> str:
    if score >= 4:
        return "high"
    if score == 3:
        return "medium"
    return "low"


def _correlated_sum(values: list[int]) -> int:
    """Aggregate loss values with FAIR-inspired diminishing weights.

    Findings are sorted descending by value; each subsequent entry contributes at a
    decreasing rate to account for shared infrastructure and correlated blast radius.
    Prevents linear over-summation when findings map to overlapping scenarios.
    """
    total = 0.0
    for i, value in enumerate(sorted(values, reverse=True)):
        weight = CORRELATION_WEIGHTS[i] if i < len(CORRELATION_WEIGHTS) else CORRELATION_WEIGHT_TAIL
        total += value * weight
    return int(total)


def _impact_band(service: dict, business_unit: dict, likelihood: int, impact: int, profile: dict, bu_proportion: float) -> dict:
    # Fix #3: customer org revenue scaled by the BU's proportional share of the
    # fictional enterprise total — keeps loss figures BU-scoped, not company-wide.
    customer_bu_revenue_musd = profile["annual_revenue_musd"] * bu_proportion
    revenue_base = customer_bu_revenue_musd * 100_000
    people_scale = max(profile["employee_count"] / 1000, 1)
    service_modifier = 0.42 + (service["revenue_dependency"] * 0.07) + (profile["crown_jewel_dependency"] * 0.05)
    risk_modifier = 0.55 + (likelihood * 0.08) + (impact * 0.1) + (profile["regulatory_sensitivity"] * 0.03)
    likely = int(revenue_base * service_modifier * risk_modifier * min(people_scale / 5, 2.2))
    return {
        "low_usd": int(likely * 0.6),
        "likely_usd": likely,
        "high_usd": int(likely * 1.85),
        "downtime_hours": int((impact * 4) + (likelihood * 2) + service["criticality"] + max(0, 3 - profile["security_maturity"])),
        # Cap at employee_count. The domain's estimated_people_affected values were
        # authored for a large fictional enterprise and will exceed smaller customer
        # org sizes. We have no external customer-count input, so the org's employee
        # count is the only defensible upper bound.
        "people_affected": min(
            max(service["estimated_people_affected"], int(profile["employee_count"] * 0.35)),
            profile["employee_count"],
        ),
    }


def _residual_deltas(scenario: dict, service: dict, profile: dict, likelihood: int, impact: int) -> tuple[int, int]:
    """Return (residual_likelihood, residual_impact) driven by scenario and service characteristics.

    Likelihood reduction:
    - exploitability >= threat_activity → fix removes the primary attack path → -2
    - threat_activity > exploitability → active adversary persists beyond the patch → -1

    Impact reduction:
    - max(service criticality, crown jewel dependency) >= 5 → mission-critical, floor stays → -0
    - same >= 4 → high criticality constrains blast radius reduction → -1
    - otherwise → controls can meaningfully reduce blast radius → -2
    """
    exploitability = scenario["signal_factors"]["exploitability"]
    threat_activity = scenario["signal_factors"]["threat_activity"]
    likelihood_reduction = 2 if exploitability >= threat_activity else 1

    crown_and_criticality = max(service["criticality"], profile["crown_jewel_dependency"])
    if crown_and_criticality >= 5:
        impact_reduction = 0
    elif crown_and_criticality >= 4:
        impact_reduction = 1
    else:
        impact_reduction = 2

    return (
        max(1, likelihood - likelihood_reduction),
        max(1, impact - impact_reduction),
    )


def _exposure_scores(
    exploitability: int,
    internet_exposure: int,
    control_gap: int,
    threat_activity: int,
    service: dict,
    profile: dict,
) -> dict[str, int]:
    return {
        "exploitability": exploitability * 20,
        "internet_exposure": internet_exposure * 20,
        "control_gap": control_gap * 20,
        "threat_activity": threat_activity * 20,
        "data_sensitivity": max(service["data_sensitivity"], profile["regulatory_sensitivity"]) * 20,
        "business_criticality": max(service["criticality"], profile["crown_jewel_dependency"]) * 20,
    }


def _risk_reduction_if_fixed(
    impact_band: dict,
    residual_likelihood: int,
    residual_impact: int,
    residual_impact_band: dict,
    scenario: dict,
    service: dict,
    profile: dict,
) -> dict:
    avoided_loss = max(0, impact_band["likely_usd"] - residual_impact_band["likely_usd"])
    avoided_downtime = max(0, impact_band["downtime_hours"] - residual_impact_band["downtime_hours"])
    residual_risk = RISK_MATRIX.get((residual_likelihood, residual_impact), "moderate")

    exploitability = scenario["signal_factors"]["exploitability"]
    threat_activity = scenario["signal_factors"]["threat_activity"]
    crown_and_criticality = max(service["criticality"], profile["crown_jewel_dependency"])

    likelihood_note = (
        "addressing the exploitable weakness removes the primary attack path"
        if exploitability >= threat_activity
        else "an active threat actor means likelihood remains elevated even after patching"
    )
    impact_note = (
        "the mission-critical nature of this service means impact cannot be significantly reduced by a single fix"
        if crown_and_criticality >= 5
        else "the high business criticality constrains how much the blast radius can be reduced"
        if crown_and_criticality >= 4
        else "recommended controls can meaningfully reduce the blast radius"
    )

    return {
        "residual_likelihood": residual_likelihood,
        "residual_impact": residual_impact,
        "residual_risk": residual_risk,
        "likely_loss_avoided_usd": avoided_loss,
        "downtime_avoided_hours": avoided_downtime,
        "summary": (
            f"If the recommended controls are implemented, the scenario would likely fall to "
            f"{residual_risk} risk — {likelihood_note}, and {impact_note}. "
            f"This avoids about ${avoided_loss:,} in likely loss exposure and roughly "
            f"{avoided_downtime} hours of disruption."
        ),
    }


def _business_impact_summary(service: dict, business_unit: dict, impact_band: dict, likelihood: int, impact: int) -> str:
    return (
        f"The current issue creates a {RISK_MATRIX.get((likelihood, impact), 'moderate')} risk of disruption to {service['name']} "
        f"within {business_unit['name']}. If not contained, leadership should plan around roughly "
        f"{impact_band['downtime_hours']} hours of interruption and a likely loss exposure of ${impact_band['likely_usd']:,}."
    )


def _rationale(
    service: dict,
    primary_asset: dict,
    scenario: dict,
    coverage_score: float,
    likelihood: int,
    impact: int,
    profile: dict,
) -> list[str]:
    return [
        f"{service['name']} carries service criticality {service['criticality']}/5 and supports {service['business_unit']} operations.",
        f"The primary asset {primary_asset['name']} is {'internet-facing' if primary_asset['internet_exposed'] else 'internally reachable'} and is tagged {primary_asset['criticality']} criticality.",
        f"Threat activity is {scenario['signal_factors']['threat_activity']}/5 and exploitability is {scenario['signal_factors']['exploitability']}/5.",
        f"Average control effectiveness across linked controls is {coverage_score:.1f}/100, adjusted for organizational maturity {profile['security_maturity']}/5.",
        f"Combined likelihood {likelihood}/5 and impact {impact}/5 justify leadership escalation.",
    ]


def _headline(service: dict, impact_band: dict) -> str:
    return f"{service['name']} faces a likely ${impact_band['likely_usd']:,} risk event if current exposure persists."


def _ad_hoc_headline(raw_text: str, fallback: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return "Security input provided — business risk review recommended."

    first_line = text.splitlines()[0].strip()
    if len(first_line) <= 64 and first_line.lower().startswith("cve-"):
        return f"{first_line} maps to a likely business risk event that leadership should review now."

    if len(first_line) <= 90:
        return f"Ad hoc input indicates a business-impacting cyber risk that leadership should review now."

    # Fix #9: generic fallback — avoids naming the wrong service for unrelated ad hoc input.
    return "Submitted security input maps to a business-impacting risk that leadership should review now."


def _executive_summary(scenario: dict, service: dict, primary_asset: dict, impact_band: dict, likelihood: int, impact: int) -> str:
    return (
        f"{scenario['executive_trigger']} has created a credible path to impair {service['name']}. The risk is anchored in "
        f"{primary_asset['name']}, where current exposure and control weakness support a likelihood score of {likelihood}/5 "
        f"and an impact score of {impact}/5. The likely downside is ${impact_band['likely_usd']:,}, with approximately "
        f"{impact_band['downtime_hours']} hours of disruption affecting about {impact_band['people_affected']:,} people."
    )


def _board_brief(service: dict, business_unit: dict, impact_band: dict, urgency: int) -> str:
    return (
        f"Board visibility is recommended because this scenario threatens {service['name']} in {business_unit['name']} and "
        f"could drive a high-case loss exposure of ${impact_band['high_usd']:,}. Management should track mitigation as urgency {urgency}/5."
    )
