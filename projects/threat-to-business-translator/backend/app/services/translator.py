from __future__ import annotations

import re
from collections import Counter
from copy import deepcopy

from .data_loader import get_scenario_bundle, load_domain, list_sectors


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

# Minimum keyword score required to bind to a specific template's BU/service context.
# Scores below this threshold (e.g. matching only on "cve-" or a single generic token)
# use the generic fallback instead, so sparse CVE titles don't inherit a completely
# unrelated business context (e.g. a SOAR platform CVE matching VPN/payroll).
MINIMUM_MATCH_SCORE = 4

# When falling back to the generic template (no meaningful keyword match), cap
# exploitability and threat_activity at this value. The template's authored values
# (often 4-5) were written for confirmed, well-described incidents. For a sparse
# input with no exploitability signals, inheriting max scores is unjustified.
FALLBACK_SIGNAL_CAP = 3

SCENARIO_MATCHERS = {
    # --- Existing matchers ---
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
            # Windows / Active Directory infrastructure — domain controller compromise
            # is a finance-tier blast radius event (credential store, ERP access, payroll)
            "active directory": 5,
            "domain controller": 5,
            "windows server": 3,
            "kerberos": 4,
            "ldap": 3,
            "ntlm": 4,
            "sam database": 5,
            "lsass": 5,
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
            # Path traversal / directory traversal / auth bypass via web
            "path traversal": 5,
            "directory traversal": 4,
            "cwe-24": 5,
            "cwe-22": 4,   # CWE-22 is the parent Path Traversal class
            "bypass authentication": 4,  # word-order variant (e.g. "bypass authentication via HTTP")
            "jrpc": 3,
            "api endpoint": 2,
        },
    },
    "vpn-zero-day-finance": {
        "keywords": {
            "vpn gateway": 5,
            "globalprotect": 4,   # PAN-OS VPN/remote-access component
            "denial of service": 3,
            "maintenance mode": 3,  # PAN-OS/Fortinet DoS symptom
            "firewall": 2,
            "cve-": 1,   # generic CVE prefix — tiebreaker only, not a decisive signal
            "cvss": 2,
            "remote code execution": 3,
            "vulnerable": 2,
            "authentication bypass": 4,
            "bypass authentication": 3,   # word-order variant of the above
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
    # --- New matchers ---
    "ransomware-endpoint": {
        "keywords": {
            "lockbit": 5,
            "blackcat": 5,
            "alphv": 5,
            "ryuk": 5,
            "conti": 5,
            "file encryption": 4,
            "encrypted files": 4,
            "ransom note": 5,
            "double extortion": 5,
            "ransomware attack": 5,
            "malware": 2,
            "endpoint compromise": 3,
            "workstation": 2,
        },
    },
    "cloud-workload-rce": {
        "keywords": {
            "vmware": 4,
            "esxi": 5,
            "vsphere": 5,
            "vcenter": 5,
            "container escape": 5,
            "kubernetes": 4,
            "k8s": 4,
            "docker": 3,
            "hypervisor": 4,
            "vm escape": 5,
            "cloud instance": 3,
            "virtual machine": 3,
        },
    },
    "identity-provider-compromise": {
        "keywords": {
            "okta": 5,
            "azure ad": 5,
            "entra id": 5,
            "saml": 4,
            "sso": 3,
            "single sign-on": 4,
            "identity provider": 5,
            "token forgery": 5,
            "idp": 4,
            "federated identity": 4,
            "oauth": 3,
            "openid connect": 4,
        },
    },
    "email-platform-compromise": {
        "keywords": {
            "exchange server": 5,
            "proxylogon": 5,
            "proxyshell": 5,
            "proxynotshell": 5,
            "m365": 4,
            "microsoft 365": 4,
            "office 365": 4,
            "business email compromise": 5,
            "bec": 4,
            "mail server": 3,
            "outlook web access": 4,
            "owa": 3,
            "email gateway": 3,
        },
    },
    "api-exposure": {
        "keywords": {
            "api key": 5,
            "hardcoded credential": 5,
            "hardcoded secret": 5,
            "bearer token": 4,
            "jwt": 4,
            "graphql": 3,
            "exposed api": 4,
            "api secret": 5,
            "broken authentication": 4,
            "idor": 4,
            "insecure direct object": 4,
            "bola": 4,
            "owasp api": 4,
            "path traversal": 5,
            "directory traversal": 5,
            "lfi": 5,
            "local file inclusion": 5,
            "ssrf": 5,
            "server-side request forgery": 5,
            "arbitrary file read": 5,
            "arbitrary file": 4,
            "read arbitrary": 4,
            "cluster api": 4,
            "api endpoint": 3,
            "unauthenticated access": 4,
            "without authentication": 4,
        },
    },
    "network-device-rce": {
        "keywords": {
            "cisco": 4,
            "juniper": 4,
            "ios xe": 5,
            "ios xr": 5,
            "junos": 5,
            "cisco catalyst": 5,
            "cisco asr": 5,
            "cisco nexus": 5,
            "network device": 3,
            "router": 3,
            "switch": 2,
            "core network": 3,
            "network infrastructure": 3,
        },
    },
    "ot-scada-attack": {
        "keywords": {
            "scada": 5,
            "ics": 4,
            "plc": 5,
            "modbus": 5,
            "dnp3": 5,
            "historian": 4,
            "hmi": 4,
            "industrial control": 5,
            "operational technology": 5,
            "ot network": 5,
            "purdue model": 4,
            "process control": 4,
            "factory floor": 3,
        },
    },
    "database-open-exposure": {
        "keywords": {
            "mongodb": 5,
            "elasticsearch": 5,
            "redis": 4,
            "port 27017": 5,
            "port 9200": 5,
            "open database": 5,
            "unauthenticated database": 5,
            "exposed database": 4,
            "nosql": 3,
            "database exposed": 4,
            "publicly accessible database": 5,
        },
    },
    "saas-account-takeover": {
        "keywords": {
            "credential stuffing": 5,
            "password spray": 5,
            "account takeover": 5,
            "ato": 4,
            "brute force": 3,
            "stolen credentials": 4,
            "phishing": 3,
            "mfa bypass": 4,
            "session hijack": 4,
            "cookie theft": 4,
            "credential breach": 4,
        },
    },
    "cicd-pipeline-compromise": {
        "keywords": {
            "jenkins": 5,
            "github actions": 5,
            "gitlab ci": 5,
            "ci/cd": 4,
            "cicd": 4,
            "dependency confusion": 5,
            "supply chain attack": 4,
            "solarwinds": 5,
            "xz utils": 5,
            "malicious package": 4,
            "build pipeline": 4,
            "software supply chain": 5,
            "npm package": 3,
            "pypi": 3,
        },
    },
}


# CVSS v3 full vector string — extracts AV, AC, PR, UI in one match.
# Example: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
_CVSS_VECTOR_RE = re.compile(
    r"cvss:3\.\d+/av:([nalp])/ac:([lh])/pr:([nlh])/ui:([nr])",
    re.IGNORECASE,
)

# Strips the full CVSS vector string (including any appended temporal/environmental
# metrics) from text before keyword scoring or sentence extraction. Prevents the
# "cvss" keyword weight in SCENARIO_MATCHERS from being triggered by the vector
# itself, and prevents the decimal in "3.1" from acting as a sentence boundary
# in _derive_executive_trigger.
_CVSS_STRIP_RE = re.compile(
    r"cvss:\d+\.\d+/[a-z0-9:/]+",
    re.IGNORECASE,
)

# CVSS base score in prose — handles the formats most common in vendor advisories
# and NVD page text:
#   "CVSS: 9.8"  "CVSSv3 Base Score: 9.8"  "CVSS v3.1 Score: 9.8"  "Base Score: 7.5"
# The negative lookahead (?!\d+\.\d*/) prevents matching the version prefix inside
# a vector string (e.g. "CVSS:3.1/AV:N/..." must not yield score=3.1).
_CVSS_SCORE_RE = re.compile(
    r"(?:"
    r"cvss\s*(?:v?\d+(?:\.\d+)?)?\s*(?:base\s+)?score\s*:?\s*"
    r"|base\s+score\s*:?\s*"
    r"|cvss\s*:(?!\d+\.\d*/)\s*"
    r")(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)


def default_profile() -> dict:
    return dict(DEFAULT_PROFILE)


def normalize_profile(profile: dict | None) -> dict:
    merged = default_profile()
    if profile:
        for key, value in profile.items():
            if key in merged and value is not None:
                merged[key] = int(value)
    return merged


def translate_scenario(scenario_id: str, profile: dict | None = None, sector: str = "financial-services") -> dict | None:
    domain = load_domain(sector)
    bundle = get_scenario_bundle(scenario_id, domain)
    if bundle is None:
        return None
    return _build_report(bundle, normalize_profile(profile), domain=domain)


def analyze_raw_input(
    raw_text: str,
    file_name: str | None = None,
    profile: dict | None = None,
    affected_service: str | None = None,
    sector: str = "financial-services",
) -> dict:
    domain = load_domain(sector)
    org_profile = normalize_profile(profile)
    parsed_findings = _parse_scan_report(raw_text)
    if len(parsed_findings) >= 2:
        return _analyze_scan_report(raw_text, file_name, org_profile, domain, parsed_findings)
    return _analyze_single_input(raw_text, file_name, org_profile, domain, affected_service=affected_service)


# Concept-based keyword map used by _resolve_service() Step 4.
# Keys are short concept terms that appear in domain service names or IDs across
# all sectors. Values are the customer input synonyms that map to each concept.
# _resolve_service() searches the live domain's services for a name/ID containing
# the concept term — so this map works for any sector without hardcoding service IDs.
_SERVICE_CONCEPT_KEYWORDS: dict[str, list[str]] = {
    "payroll":    ["payroll", "salary", "wages", "hr", "human resources", "hris", "people ops"],
    "support":    ["customer support", "support platform", "helpdesk", "help desk",
                   "service desk", "contact centre", "contact center", "crm"],
    "onboarding": ["onboarding", "kyc", "know your customer", "identity verification"],
    "analytics":  ["analytics", "customer analytics", "data analytics", "data platform"],
    "logistics":  ["logistics", "shipment", "shipments", "shipping", "delivery", "fulfillment",
                   "fulfilment", "supply chain", "procurement", "warehouse", "3pl",
                   "order management", "vendor management"],
    "portal":     ["portal", "digital banking", "online banking", "web portal",
                   "self-service", "internet banking", "patient portal", "customer portal"],
    "finance":    ["finance", "financial", "accounting", "general ledger", "treasury",
                   "financial reporting", "revenue cycle", "claims"],
    "erp":        ["erp", "enterprise resource planning"],
    "ehr":        ["ehr", "electronic health record", "clinical record", "epic", "cerner"],
    "imaging":    ["imaging", "pacs", "radiology", "ris", "dicom"],
    "scada":      ["scada", "ics", "industrial control", "process control", "plc", "hmi"],
    "mes":        ["mes", "manufacturing execution"],
    "plm":        ["plm", "product lifecycle", "cad", "cam", "engineering design"],
    "research":   ["research", "clinical research", "clinical trial", "irb", "trial data"],
    "ecommerce":  ["ecommerce", "e-commerce", "online store", "storefront", "shop", "checkout"],
    "pos":        ["pos", "point of sale", "store operations", "point-of-sale", "register"],
    "loyalty":    ["loyalty", "rewards", "membership", "points program"],
    "inventory":  ["inventory", "stock", "warehouse management", "wms"],
    "cicd":       ["ci/cd", "cicd", "pipeline", "build pipeline", "devops", "deployment"],
    "iam":        ["iam", "identity", "access management", "sso", "authentication platform"],
    "cloud":      ["cloud infrastructure", "cloud platform", "aws", "azure", "gcp", "iaas"],
    "saas":       ["saas platform", "product platform", "application platform"],
}

_FALLBACK_RECOMMENDED_ACTIONS = [
    "Patch the affected product per vendor advisory on an urgent timeline.",
    "Restrict network or application access to the affected component pending remediation.",
    "Monitor for exploitation indicators in relevant system and application logs.",
    "Assess internet exposure of the affected component and isolate if feasible.",
]


def _neutralise_fallback_context(report: dict, raw_text: str) -> dict:
    """Replace template-derived business context with neutral placeholders.

    When the engine falls back to the generic template (no keyword match above
    MINIMUM_MATCH_SCORE), the inherited BU, service, asset, and identity fields
    describe a fictional scenario unrelated to the actual input. Surfacing those
    fields as facts — e.g. 'Customer Support Platform' for a SOAR platform CVE —
    would mislead a customer who knows their environment.

    The risk scores, loss figures, and exposure bands remain intact; only the
    fields that are directly template-sourced and therefore meaningless for this
    input are replaced.
    """
    likely_usd = report["business_impact"]["impact_band"]["likely_usd"]
    high_usd = report["business_impact"]["impact_band"]["high_usd"]
    overall_risk = report["risk_assessment"]["overall_risk"]
    likelihood = report["risk_assessment"]["likelihood"]
    impact = report["risk_assessment"]["impact"]
    confidence_pct = int(report["risk_assessment"]["confidence"] * 100)
    avoided_usd = report["risk_reduction_if_fixed"]["likely_loss_avoided_usd"]
    avoided_hrs = report["risk_reduction_if_fixed"]["downtime_avoided_hours"]
    residual_risk = report["risk_reduction_if_fixed"]["residual_risk"]
    # Use _derive_executive_trigger so we get the first clean sentence (split at
    # the first period) rather than a raw 280-char slice that can end mid-sentence
    # and produce a grammatical break when stitched into "… represents a credible
    # security risk" below.
    trigger = _derive_executive_trigger(raw_text, raw_text.strip()[:80])

    report["business_context"].update({
        "business_unit": "Not determined — provide customer context to refine",
        "business_service": "Not determined — provide customer context to refine",
        "service_owner": "Not determined",
        "primary_asset": "Affected product or service (details unknown)",
        "primary_asset_type": "Unknown",
        "affected_assets": [],
        "impacted_identities": [],
    })

    report["leadership_output"]["recommended_actions"] = _FALLBACK_RECOMMENDED_ACTIONS

    report["leadership_output"]["executive_summary"] = (
        f"{trigger} represents a credible security risk requiring leadership attention. "
        f"The engine could not match this input to a known business service — provide the "
        f"affected service, asset owner, and business unit to enable a service-specific analysis. "
        f"At current risk parameters (likelihood {likelihood}/5, impact {impact}/5), the modeled "
        f"likely loss exposure is ${likely_usd:,}."
    )

    report["leadership_output"]["board_brief"] = (
        f"Leadership should treat this as an unclassified cyber risk pending service-owner confirmation. "
        f"The modeled high-case exposure is ${high_usd:,}. Escalation path and classification should be "
        f"determined once the affected business service is confirmed."
    )

    report["business_impact"]["summary"] = (
        f"The current input represents a {overall_risk} risk to business operations. "
        f"Without customer context on the affected service, the engine models a likely loss exposure of "
        f"${likely_usd:,} at conservative baseline parameters."
    )

    report["risk_assessment"]["rationale"] = [
        "Business service and asset context could not be determined from the input provided.",
        f"Risk is modeled at conservative baseline signal levels (likelihood {likelihood}/5, impact {impact}/5).",
        f"Confidence is {confidence_pct}% — provide customer context to improve accuracy.",
        "Provide the affected service, asset owner, and business unit to enable a service-specific analysis.",
    ]

    report["risk_reduction_if_fixed"]["summary"] = (
        f"If the recommended remediation actions are completed, risk exposure is expected to fall to "
        f"{residual_risk}. The modeled likely loss avoided is ${avoided_usd:,}, with roughly "
        f"{avoided_hrs} hours of disruption avoided. Refine this estimate by providing customer context "
        f"on the affected service."
    )

    return report


def _resolve_service(text: str, domain: dict) -> dict | None:
    """Match customer free-text to a known domain service.

    Checks in priority order:
    1. Exact service name (case-insensitive)
    2. Partial service name (substring either way)
    3. Business unit name → returns the highest-criticality service in that BU
    4. _SERVICE_CONCEPT_KEYWORDS — concept terms searched against live domain service
       names and IDs, making the lookup sector-agnostic across all five sector files

    Returns the matched service dict, or None if no confident match is found.
    """
    if not text or not text.strip():
        return None

    text_lower = text.lower().strip()
    services = {svc["id"]: svc for svc in domain["business_services"]}

    # 1. Exact service name
    for svc in services.values():
        if svc["name"].lower() == text_lower:
            return svc

    # 2. Partial service name match
    for svc in services.values():
        if text_lower in svc["name"].lower() or svc["name"].lower() in text_lower:
            return svc

    # 3. Business unit name → most critical service in that BU
    for bu in domain["business_units"]:
        if text_lower in bu["name"].lower() or bu["name"].lower() in text_lower:
            bu_services = [svc for svc in services.values() if svc["business_unit_id"] == bu["id"]]
            if bu_services:
                return max(bu_services, key=lambda s: s["criticality"])

    # 4. Concept keyword map — sector-agnostic.
    # Finds the first domain service whose name or ID contains the matched concept term.
    # This avoids hardcoding financial-services service IDs that don't exist in other domains.
    for concept, synonyms in _SERVICE_CONCEPT_KEYWORDS.items():
        if any(syn in text_lower for syn in synonyms):
            concept_lower = concept.lower()
            for svc in domain["business_services"]:
                if concept_lower in svc["name"].lower() or concept_lower in svc["id"]:
                    return svc

    return None


def _analyze_single_input(
    raw_text: str,
    file_name: str | None,
    org_profile: dict,
    domain: dict,
    finding: dict | None = None,
    affected_service: str | None = None,
) -> dict:
    scenario = _infer_scenario(raw_text, file_name, domain)
    if finding is not None:
        scenario = _apply_finding_overrides(scenario, finding)

    # If the customer named an affected service, resolve it and override the
    # scenario's service binding. This separates the two concerns: the CVE text
    # drives signal factors (exploitability, threat activity, conditional language),
    # while the customer's service input drives business context (BU, revenue,
    # criticality, recommended actions).
    resolved_service = _resolve_service(affected_service, domain) if affected_service else None
    # Save the fallback flag before any override — needed to decide whether to
    # substitute recommended actions after the report is built.
    was_fallback_before_service_override = scenario.get("_used_fallback", False)
    if resolved_service:
        scenario["service_id"] = resolved_service["id"]
        # Use a primary asset from the resolved service's own scenarios if available,
        # so revenue and criticality calculations are anchored to the right service.
        service_scenarios = [s for s in domain["scenarios"] if s["service_id"] == resolved_service["id"]]
        if service_scenarios:
            scenario["primary_asset_id"] = service_scenarios[0]["primary_asset_id"]
        # Clear linked assets and identities — customer named a service, not specific
        # assets or identities, so we should not assert fictional ones.
        scenario["asset_ids"] = []
        scenario["identity_ids"] = []
        # Mark as not a fallback so neutralisation does not run.
        scenario["_used_fallback"] = False

    bundle = _bundle_for_inferred_scenario(scenario, domain)
    report = _build_report(bundle, org_profile, domain=domain)
    report["scenario_name"] = scenario["name"]
    report["scenario_id"] = scenario["id"]
    report["technical_summary"] = raw_text.strip()[:AD_HOC_SUMMARY_LIMIT]
    report["analysis_type"] = "ad_hoc"
    report["leadership_output"]["headline"] = _ad_hoc_headline(raw_text, report["leadership_output"]["headline"])

    if scenario.get("_used_fallback"):
        report = _neutralise_fallback_context(report, raw_text)
    elif resolved_service:
        # Service was customer-provided — clear fictional asset/identity details
        # and note the source in the rationale.
        report["business_context"]["affected_assets"] = []
        report["business_context"]["impacted_identities"] = []
        report["risk_assessment"]["rationale"].insert(
            0,
            f"Business context resolved from customer-provided service input: '{resolved_service['name']}' "
            f"({report['business_context']['business_unit']}).",
        )
        # If the CVE match was too weak to reach a specific template (fallback),
        # the inherited recommended actions are irrelevant for the resolved service.
        # Replace them with generic CVE-response actions.
        if was_fallback_before_service_override:
            report["leadership_output"]["recommended_actions"] = _FALLBACK_RECOMMENDED_ACTIONS
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
    # Strip CVSS vector strings before keyword scoring. The vector has already
    # been parsed by _parse_cvss() for signal factors; leaving it in the text
    # causes the "cvss" keyword weight in vpn-zero-day-finance to fire and
    # override template matches that are based on actual product/technique context.
    text = _CVSS_STRIP_RE.sub("", (raw_text or "")).lower()
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

    used_fallback = True
    if scored_templates:
        scored_templates.sort(key=lambda item: item[0], reverse=True)
        best_score, best_id = scored_templates[0]
        if best_score >= MINIMUM_MATCH_SCORE:
            template = _scenario_by_id(domain, best_id)
            used_fallback = False
        else:
            # Best score is below threshold — keyword overlap is too weak to justify
            # binding to that template's BU/service context. Use generic fallback.
            template = _scenario_by_id(domain, "edr-identity-lateral")
    else:
        template = _scenario_by_id(domain, "edr-identity-lateral")

    scenario = deepcopy(template)
    scenario["id"] = f"ad-hoc-{template['id']}"
    # Use the template's category (e.g. "CVE / exposure", "Web / application exposure")
    # rather than its specific name. The template name describes a fictional scenario
    # ("Outdated Internet-facing web server...") that has no relation to the customer's
    # actual input and would erode trust during a demo.
    # Use a specific category name only when we confidently matched a template.
    # For fallback routes the template category (e.g. "EDR / identity") describes
    # a completely unrelated fictional scenario — always use the neutral label instead.
    scenario["name"] = "Ad hoc vulnerability analysis" if used_fallback else f"Ad hoc {template['category']} analysis"
    scenario["technical_signal"] = raw_text.strip()[:2000] or template["technical_signal"]
    scenario["executive_trigger"] = _derive_executive_trigger(raw_text, template["executive_trigger"])

    # For ad hoc input, reset evidence_quality and context_completeness to conservative
    # baselines. Template values (often 5/5) reflect fully-confirmed incidents — not a
    # pasted CVE advisory or SIEM alert where confirmation and asset context are unknown.
    ad_hoc_defaults = {
        **template["signal_factors"],
        "evidence_quality": min(template["signal_factors"]["evidence_quality"], 2),
        "context_completeness": min(template["signal_factors"]["context_completeness"], 2),
    }
    # When falling back to the generic template (no meaningful keyword match), also cap
    # exploitability and threat_activity. Sparse inputs — e.g. a CVE title with no
    # attack-vector detail — give no basis for inheriting the template's high authored
    # values, and doing so produces unjustifiably critical risk ratings.
    if used_fallback:
        ad_hoc_defaults["exploitability"] = min(ad_hoc_defaults["exploitability"], FALLBACK_SIGNAL_CAP)
        ad_hoc_defaults["threat_activity"] = min(ad_hoc_defaults["threat_activity"], FALLBACK_SIGNAL_CAP)
    scenario["signal_factors"] = _derive_signal_factors(raw_text, ad_hoc_defaults)
    scenario["recommended_actions"] = template["recommended_actions"]
    scenario["_used_fallback"] = used_fallback
    return scenario


def _derive_executive_trigger(raw_text: str, fallback: str) -> str:
    # Strip CVSS vector strings before sentence splitting. The decimal in the
    # version number (e.g. "3.1") would otherwise be treated as a sentence
    # boundary, producing a truncated trigger like "...CVSS:3".
    text = _CVSS_STRIP_RE.sub("", raw_text).strip()
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


def _parse_cvss(text: str) -> dict | None:
    """Extract CVSS v3 data from input text.

    Tries the full vector string first (version-explicit, all key fields).
    Falls back to a labeled base-score pattern ("CVSS: 9.8", "Base Score: 7.5",
    "CVSSv3 Base Score: 9.8", etc.).

    Returns a dict containing any subset of:
        base_score (float), attack_vector (str), attack_complexity (str),
        privileges_required (str), user_interaction (str)
    or None if no CVSS data is found.
    """
    result: dict = {}
    text_lower = text.lower()

    vector_match = _CVSS_VECTOR_RE.search(text_lower)
    if vector_match:
        result["attack_vector"] = vector_match.group(1).upper()
        result["attack_complexity"] = vector_match.group(2).upper()
        result["privileges_required"] = vector_match.group(3).upper()
        result["user_interaction"] = vector_match.group(4).upper()

    score_match = _CVSS_SCORE_RE.search(text_lower)
    if score_match:
        score = float(score_match.group(1))
        if 0.0 <= score <= 10.0:
            result["base_score"] = score

    return result or None


def _cvss_exploitability(cvss: dict) -> int:
    """Map parsed CVSS data to an exploitability score (1–5).

    Base score is the primary signal — the CVSS formula already incorporates
    attack vector, complexity, privileges, and user interaction, so no further
    adjustments from those fields are needed when a score is present.

    When only a vector string is available (no numeric score), the four vector
    components are used to synthesise a score from a medium baseline.

    CVSS v3 severity bands:  Critical ≥9.0 → 5,  High ≥7.0 → 4,
                              Medium  ≥4.0 → 3,  Low  ≥0.1 → 2,  None → 1.
    """
    if "base_score" in cvss:
        score = cvss["base_score"]
        if score >= 9.0:
            return 5
        if score >= 7.0:
            return 4
        if score >= 4.0:
            return 3
        if score >= 0.1:
            return 2
        return 1

    # Vector-only fallback — synthesise from available components.
    base = 3
    av = cvss.get("attack_vector")
    ac = cvss.get("attack_complexity")
    pr = cvss.get("privileges_required")
    ui = cvss.get("user_interaction")
    if av == "N":
        base += 1          # Network-reachable — most exploitable
    elif av in ("L", "P"):
        base -= 1          # Local / Physical access required
    if ac == "H":
        base -= 1          # High attack complexity
    if pr == "H":
        base -= 1          # High privileges required
    if ui == "R":
        base -= 1          # User interaction required
    return max(1, min(5, base))


def _derive_signal_factors(raw_text: str, defaults: dict) -> dict:
    text = raw_text.lower()
    cvss = _parse_cvss(text)

    threat_activity = defaults["threat_activity"]
    evidence_quality = defaults["evidence_quality"]
    context_completeness = defaults["context_completeness"]

    # Conditional language tokens — used for both exploitability and threat_activity.
    # Defined here so they are available regardless of whether CVSS is present.
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

    has_strong_conditional = any(token in text for token in strong_conditional)
    has_moderate_conditional = any(token in text for token in moderate_conditional)

    # Active exploitation is not encoded in CVSS scores — it is a separate signal
    # that warrants boosting exploitability and threat_activity regardless of
    # whether a CVSS score is present.
    actively_exploited = any(token in text for token in [
        "active exploitation", "actively exploited", "known exploited",
        "exploited in the wild", "cisa kev",
    ])

    # --- Exploitability ---
    if cvss:
        # CVSS base score (or vector) is authoritative. The CVSS formula already
        # incorporates attack vector, complexity, privileges required, and user
        # interaction — do not additionally apply keyword-based adjustments, as
        # that would double-penalise conditions already reflected in the score.
        exploitability = _cvss_exploitability(cvss)
        if actively_exploited:
            # KEV / in-the-wild exploitation is not captured by CVSS; treat it
            # as additive even when the score is present.
            exploitability = min(5, exploitability + 1)
    else:
        # No CVSS data — fall back to keyword-based inference.
        exploitability = defaults["exploitability"]
        if actively_exploited or any(token in text for token in [
            "critical", "rce", "remote code execution",
            "unauthenticated attacker", "no authentication required",
        ]):
            exploitability = min(5, exploitability + 1)
        if has_strong_conditional:
            exploitability = max(1, exploitability - 2)
        elif has_moderate_conditional:
            exploitability = max(1, exploitability - 1)
        if "medium" in text and exploitability > 3:
            exploitability -= 1

    # --- Threat activity ---
    # Always keyword-driven — CVSS does not capture threat intelligence or
    # active campaign data.
    if any(token in text for token in ["high", "sev 1", "urgent", "multiple hosts", "multiple assets"]):
        threat_activity = min(5, threat_activity + 1)
    if actively_exploited:
        threat_activity = min(5, threat_activity + 1)
    # Conditional language reduces expected threat activity regardless of CVSS.
    if has_strong_conditional:
        threat_activity = max(1, threat_activity - 1)

    # --- Evidence quality ---
    if any(token in text for token in ["ioc", "evidence", "observed", "confirmed", "scan", "cvss"]):
        evidence_quality = min(5, evidence_quality + 1)

    # --- Context completeness ---
    if any(token in text for token in ["asset", "owner", "business unit", "internet-facing", "public"]):
        context_completeness = min(5, context_completeness + 1)

    result: dict = {
        "exploitability": exploitability,
        "threat_activity": threat_activity,
        "evidence_quality": evidence_quality,
        "context_completeness": context_completeness,
    }
    # Attach parsed CVSS metadata so _rationale() can cite the source.
    if cvss:
        if "base_score" in cvss:
            result["cvss_base_score"] = cvss["base_score"]
        if "attack_vector" in cvss:
            result["cvss_attack_vector"] = cvss["attack_vector"]
    return result


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
    # Sector domain files don't need to be exhaustive. If the matched template ID
    # doesn't exist in this domain, fall back to the generic identity scenario rather
    # than raising. This keeps new matchers working even on older domain files.
    for item in domain["scenarios"]:
        if item["id"] == "edr-identity-lateral":
            return item
    return domain["scenarios"][0]


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


def _build_report(bundle: dict, profile: dict, domain: dict | None = None) -> dict:
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
    if domain is None:
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
    sf = scenario["signal_factors"]
    cvss_score = sf.get("cvss_base_score")
    cvss_av = sf.get("cvss_attack_vector")

    if cvss_score is not None:
        _av_labels = {"N": "Network", "A": "Adjacent", "L": "Local", "P": "Physical"}
        av_note = f", AV:{cvss_av} ({_av_labels.get(cvss_av, '')})" if cvss_av else ""
        exploit_line = (
            f"Exploitability {sf['exploitability']}/5 derived from CVSS base score "
            f"{cvss_score}{av_note}; keyword inference overridden."
        )
    else:
        exploit_line = (
            f"Threat activity is {sf['threat_activity']}/5 and exploitability is "
            f"{sf['exploitability']}/5."
        )

    lines = [
        f"{service['name']} carries service criticality {service['criticality']}/5 and supports {service['business_unit']} operations.",
        f"The primary asset {primary_asset['name']} is {'internet-facing' if primary_asset['internet_exposed'] else 'internally reachable'} and is tagged {primary_asset['criticality']} criticality.",
        exploit_line,
    ]
    # When CVSS drove exploitability, the exploit_line describes exploitability only —
    # add a separate threat activity line. When falling back to keywords, exploit_line
    # already covers both, so the separate line would be a duplicate.
    if cvss_score is not None:
        lines.append(f"Threat activity is {sf['threat_activity']}/5.")
    lines += [
        f"Average control effectiveness across linked controls is {coverage_score:.1f}/100, adjusted for organizational maturity {profile['security_maturity']}/5.",
        f"Combined likelihood {likelihood}/5 and impact {impact}/5 justify leadership escalation.",
    ]
    return lines


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
