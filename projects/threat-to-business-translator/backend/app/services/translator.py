from __future__ import annotations

from copy import deepcopy

from .data_loader import get_scenario_bundle, load_domain


RISK_LABELS = {
    1: "low",
    2: "moderate",
    3: "moderate",
    4: "high",
    5: "critical",
}

DEFAULT_PROFILE = {
    "annual_revenue_musd": 250,
    "employee_count": 5000,
    "internet_exposure": 4,
    "security_maturity": 3,
    "regulatory_sensitivity": 4,
    "crown_jewel_dependency": 4,
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
    scenario = _infer_scenario(raw_text, file_name, domain)
    bundle = _bundle_for_inferred_scenario(scenario, domain)
    report = _build_report(bundle, org_profile)
    report["scenario_name"] = scenario["name"]
    report["scenario_id"] = scenario["id"]
    report["technical_summary"] = raw_text.strip()[:2000]
    report["leadership_output"]["headline"] = _ad_hoc_headline(raw_text, report["leadership_output"]["headline"])
    return report


def _infer_scenario(raw_text: str, file_name: str | None, domain: dict) -> dict:
    text = (raw_text or "").lower()
    file_name = (file_name or "manual-input").lower()

    if any(token in text for token in ["deepfake", "voice note", "impersonat", "payment reroute", "urgent transfer"]):
        template = _scenario_by_id(domain, "deepfake-payment-diversion")
    elif any(token in text for token in ["bucket", "public read", "storage", "s3", "blob"]):
        template = _scenario_by_id(domain, "cloud-storage-regulated-data")
    elif any(token in text for token in ["lateral movement", "powershell", "token reuse", "edr", "identity compromise"]):
        template = _scenario_by_id(domain, "edr-identity-lateral")
    elif any(token in text for token in ["supplier", "third-party", "ransomware", "fulfillment", "partner vpn"]):
        template = _scenario_by_id(domain, "supplier-ransomware-chain")
    elif any(token in text for token in ["cve-", "cvss", "remote code execution", "vulnerable", "scan report"]) or file_name.endswith((".csv", ".xlsx", ".json", ".xml")):
        template = _scenario_by_id(domain, "vpn-zero-day-finance")
    else:
        template = _scenario_by_id(domain, "edr-identity-lateral")

    scenario = deepcopy(template)
    scenario["id"] = f"ad-hoc-{template['id']}"
    scenario["name"] = f"Ad hoc analysis based on {template['name']}"
    scenario["technical_signal"] = raw_text.strip()[:2000] or template["technical_signal"]
    scenario["executive_trigger"] = _derive_executive_trigger(raw_text, template["executive_trigger"])
    scenario["signal_factors"] = _derive_signal_factors(raw_text, template["signal_factors"])
    scenario["recommended_actions"] = template["recommended_actions"]
    return scenario


def _derive_executive_trigger(raw_text: str, fallback: str) -> str:
    text = raw_text.strip()
    if not text:
        return fallback
    first_sentence = text.split(".")[0].strip()
    if len(first_sentence) < 20:
        return fallback
    return first_sentence[:180]


def _derive_signal_factors(raw_text: str, defaults: dict) -> dict:
    text = raw_text.lower()
    exploitability = defaults["exploitability"]
    threat_activity = defaults["threat_activity"]
    evidence_quality = defaults["evidence_quality"]
    context_completeness = defaults["context_completeness"]

    if any(token in text for token in ["critical", "active exploitation", "known exploited", "rce", "remote code execution"]):
        exploitability = min(5, exploitability + 1)
    if any(token in text for token in ["high", "sev 1", "urgent", "multiple hosts", "multiple assets"]):
        threat_activity = min(5, threat_activity + 1)
    if any(token in text for token in ["ioc", "evidence", "observed", "confirmed", "scan", "cvss"]):
        evidence_quality = min(5, evidence_quality + 1)
    if any(token in text for token in ["asset", "owner", "business unit", "internet-facing", "public"]):
        context_completeness = min(5, context_completeness + 1)

    return {
        "exploitability": exploitability,
        "threat_activity": threat_activity,
        "evidence_quality": evidence_quality,
        "context_completeness": context_completeness,
    }


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

    coverage_score = _coverage_score(linked_controls)
    exploitability = scenario["signal_factors"]["exploitability"]
    threat_activity = scenario["signal_factors"]["threat_activity"]
    base_internet_exposure = 5 if primary_asset["internet_exposed"] else 2
    internet_exposure = max(1, min(5, round((base_internet_exposure + profile["internet_exposure"]) / 2)))
    control_gap = max(1, min(5, round(5 - (coverage_score / 25) + ((3 - profile["security_maturity"]) * 0.4))))

    likelihood = _bounded_round(
        exploitability * 0.32
        + internet_exposure * 0.18
        + control_gap * 0.2
        + threat_activity * 0.2
        + profile["internet_exposure"] * 0.1
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
    confidence = round(
        min(
            0.98,
            0.4
            + scenario["signal_factors"]["evidence_quality"] * 0.07
            + scenario["signal_factors"]["context_completeness"] * 0.05
            + profile["security_maturity"] * 0.04,
        ),
        2,
    )

    impact_band = _impact_band(service, business_unit, likelihood, impact, profile)
    residual_likelihood = max(1, likelihood - 2)
    residual_impact = max(1, impact - 1)
    residual_impact_band = _impact_band(service, business_unit, residual_likelihood, residual_impact, profile)

    return {
        "scenario_id": scenario["id"],
        "scenario_name": scenario["name"],
        "audience": "CISO / Senior Leadership",
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
            "overall_risk": RISK_LABELS[max(likelihood, impact)],
            "rationale": _rationale(service, primary_asset, scenario, coverage_score, likelihood, impact, profile),
        },
        "risk_reduction_if_fixed": _risk_reduction_if_fixed(impact_band, residual_likelihood, residual_impact, residual_impact_band),
        "leadership_output": {
            "headline": _headline(service, impact_band),
            "executive_summary": _executive_summary(scenario, service, primary_asset, impact_band, likelihood, impact),
            "board_brief": _board_brief(service, business_unit, impact_band, urgency),
            "recommended_actions": scenario["recommended_actions"],
        },
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


def _impact_band(service: dict, business_unit: dict, likelihood: int, impact: int, profile: dict) -> dict:
    revenue_base = max(profile["annual_revenue_musd"], business_unit["annual_revenue_musd"]) * 100000
    people_scale = max(profile["employee_count"] / 1000, 1)
    service_modifier = 0.42 + (service["revenue_dependency"] * 0.07) + (profile["crown_jewel_dependency"] * 0.05)
    risk_modifier = 0.55 + (likelihood * 0.08) + (impact * 0.1) + (profile["regulatory_sensitivity"] * 0.03)
    likely = int(revenue_base * service_modifier * risk_modifier * min(people_scale / 5, 2.2))
    return {
        "low_usd": int(likely * 0.6),
        "likely_usd": likely,
        "high_usd": int(likely * 1.85),
        "downtime_hours": int((impact * 4) + (likelihood * 2) + service["criticality"] + max(0, 3 - profile["security_maturity"])),
        "people_affected": max(service["estimated_people_affected"], int(profile["employee_count"] * 0.35)),
    }


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


def _risk_reduction_if_fixed(impact_band: dict, residual_likelihood: int, residual_impact: int, residual_impact_band: dict) -> dict:
    avoided_loss = max(0, impact_band["likely_usd"] - residual_impact_band["likely_usd"])
    avoided_downtime = max(0, impact_band["downtime_hours"] - residual_impact_band["downtime_hours"])
    return {
        "residual_likelihood": residual_likelihood,
        "residual_impact": residual_impact,
        "residual_risk": RISK_LABELS[max(residual_likelihood, residual_impact)],
        "likely_loss_avoided_usd": avoided_loss,
        "downtime_avoided_hours": avoided_downtime,
        "summary": (
            f"If the recommended controls are implemented, the scenario would likely fall to {RISK_LABELS[max(residual_likelihood, residual_impact)]} "
            f"risk, avoiding about ${avoided_loss:,} in likely loss exposure and roughly {avoided_downtime} hours of disruption."
        ),
    }


def _business_impact_summary(service: dict, business_unit: dict, impact_band: dict, likelihood: int, impact: int) -> str:
    return (
        f"The current issue creates a {RISK_LABELS[max(likelihood, impact)]} risk of disruption to {service['name']} "
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
        return fallback

    first_line = text.splitlines()[0].strip()
    if len(first_line) <= 64 and first_line.lower().startswith("cve-"):
        return f"{first_line} maps to a likely business risk event that leadership should review now."

    if len(first_line) <= 90:
        return f"Ad hoc input indicates a business-impacting cyber risk that leadership should review now."

    return fallback


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
