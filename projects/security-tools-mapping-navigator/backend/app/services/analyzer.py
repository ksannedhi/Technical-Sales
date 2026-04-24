from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Tuple

from ..models import (
    AnalysisResponse,
    Diagram,
    DiagramEdge,
    DiagramNode,
    FrameworkChoice,
    GapFinding,
    RedundancyFinding,
    RoadmapItem,
    ToolControlRow,
)


@dataclass
class ControlDef:
    control_id: str
    framework: str
    name: str
    domain: str
    keywords: List[str]


ALIAS_TOKEN_MAP: Dict[str, List[str]] = {
    "capability_identity": [
        "entra id",
        "azure ad",
        "active directory",
        "okta",
        "ping identity",
        "pingfederate",
        "sailpoint",
        "cyberark",
        "beyondtrust",
        "delinea",
        "thycotic",
        "duo security",
        "privileged account management",
        "identity governance",
    ],
    "capability_endpoint": [
        "crowdstrike",
        "falcon",
        "sentinelone",
        "carbon black",
        "defender for endpoint",
        # "microsoft defender" removed — too broad; matches "Defender for Office 365"
        # when vendor "Microsoft" and product name concatenate.  "defender for endpoint" is sufficient.
        "cortex xdr",
        "deep security",
        # "trend micro" removed — TippingPoint IPS vendor string also contains "trend micro"
        # which falsely injects endpoint capability into a network tool.
        # Trend Micro endpoint products are caught by "deep security" (specific product name).
        "qualys",
        "tenable",
        "rapid7",
        "insightvm",
        "mcafee",
        "bitdefender",
        "eset",
    ],
    "capability_soc": [
        "microsoft sentinel",
        "ibm qradar",
        "qradar",
        "elastic security",
        "splunk",
        "insightidr",
        "darktrace",
        "vectra",
        "extrahop",
        "fortianalyzer",
        "fortisiem",
        "anomali",
        "logrhythm",
        "sumo logic",
        "exabeam",
        "securonix",
        "cortex",
        "xsoar",
        "demisto",
    ],
    "capability_network": [
        "palo alto",
        "fortigate",
        "fortinet",
        "check point",
        "zscaler",
        "netskope",
        "cisco firepower",
        "cisco asa",
        "juniper",
        "sophos",
        "tippingpoint",
        "algosec",
        "gigamon",
        "infoblox",
    ],
    "capability_data": [
        "proofpoint",
        "mimecast",
        "barracuda",
        "purview",
        "microsoft purview",
        "digital guardian",
        "symantec dlp",
        "varonis",
        "boldon james",
        "reversing labs",
    ],
    "capability_cloud": [
        "wiz",
        "prisma cloud",
        "orca",
        "aqua",
        "panoptica",
        "sonrai",
        "lacework",
        "sysdig",
        "defender for cloud",
        "microsoft defender for cloud",
        "aws security hub",
        "gcp security command center",
    ],
    "capability_appsec": [
        "imperva",
        "f5",
        "cloudflare",
        "invicti",
        "netsparker",
        "veracode",
        "checkmarx",
        "fortify",
        "snyk",
        "black duck",
        "mend",
        "sonarqube",
        "burp suite",
        "salt security",
        "noname",
        "traceable",
        "apigee",
        "aws waf",
        "azure waf",
    ],
}


def _keywords(*terms: str) -> List[str]:
    return list(terms)


CONTROL_LIBRARY: List[ControlDef] = [
    # ── NIST CSF 2.0 ──────────────────────────────────────────────────────────
    # PR.AA  (Protect – Identity Management, Authentication, and Access Control)
    ControlDef("NIST-PR.AA", "NIST", "Identity Management, Authentication, and Access Control", "Identity",
               _keywords("pr.aa", "identity", "sso", "mfa", "iam", "directory", "privileged", "pam",
                         "rbac", "least privilege", "capability_identity")),
    # PR.PS  (Protect – Platform Security)  covers endpoint and cloud workloads
    ControlDef("NIST-PR.PS", "NIST", "Platform Security", "Endpoint",
               _keywords("pr.ps", "endpoint", "edr", "xdr", "antimalware", "workload", "patch",
                         "hardening", "configuration", "endpoint posture", "cloud posture",
                         "cloud security posture", "endpoint security posture", "benchmark",
                         "capability_endpoint", "capability_cloud")),
    # PR.DS  (Protect – Data Security)  covers data protection and application-layer defences
    ControlDef("NIST-PR.DS", "NIST", "Data Security", "Data",
               _keywords("pr.ds", "dlp", "encryption", "data loss", "classification", "email security",
                         "email protection", "phishing", "spam", "waf", "api security",
                         "web application", "capability_data", "capability_appsec")),
    # PR.IR  (Protect – Technology Infrastructure Resilience)  ← replaces CSF 1.1 PR.AC
    ControlDef("NIST-PR.IR", "NIST", "Technology Infrastructure Resilience", "Network",
               _keywords("pr.ir", "network firewall", "ngfw", "ztna", "zero trust", "ids", "ips",
                         "ndr", "segmentation", "sase", "proxy", "dns", "vpn", "network resilience",
                         "capability_network")),
    # DE.CM  (Detect – Continuous Monitoring)
    ControlDef("NIST-DE.CM", "NIST", "Continuous Monitoring", "SOC",
               _keywords("de.cm", "siem", "monitoring", "log management", "telemetry",
                         "observability", "threat detection", "ueba", "capability_soc")),
    # RS.MA  (Respond – Incident Management)  ← replaces CSF 1.1 RS.RP
    ControlDef("NIST-RS.MA", "NIST", "Incident Management", "SOC",
               _keywords("rs.ma", "soar", "incident response", "orchestration", "playbook",
                         "containment", "case management", "triage", "capability_soc")),

    # ── CIS Controls v8.1 ─────────────────────────────────────────────────────
    # CIS-3  Data Protection
    ControlDef("CIS-3", "CIS", "Data Protection", "Data",
               _keywords("cis-3", "dlp", "encryption", "data loss", "classification",
                         "email security", "email protection", "phishing", "spam", "capability_data")),
    # CIS-4  Secure Configuration of Enterprise Assets and Software  → Cloud domain
    ControlDef("CIS-4", "CIS", "Secure Configuration of Enterprise Assets and Software", "Cloud",
               _keywords("cis-4", "configuration", "cloud posture", "endpoint posture",
                         "cloud security posture", "cspm", "cnapp", "benchmark", "secure config",
                         "misconfiguration", "cis benchmark",
                         # "hardening" removed — too generic; matches "workload hardening" in
                         # EPP/patch objectives, falsely pulling endpoint tools into CIS-4.
                         # CIS-4 is identified by configuration/posture terms, not the word "hardening".
                         "capability_cloud")),
    # CIS-5  Account Management
    ControlDef("CIS-5", "CIS", "Account Management", "Identity",
               _keywords("cis-5", "account", "mfa", "directory", "provisioning", "deprovisioning",
                         "user lifecycle", "capability_identity")),
    # CIS-6  Access Control Management
    ControlDef("CIS-6", "CIS", "Access Control Management", "Identity",
               _keywords("cis-6", "privileged", "privileged access", "rbac", "least privilege",
                         "access control", "role-based", "just-in-time", "jit", "capability_identity")),
    # CIS-7  Continuous Vulnerability Management
    ControlDef("CIS-7", "CIS", "Continuous Vulnerability Management", "Endpoint",
               _keywords("cis-7", "vulnerability", "patch", "cve", "vulnerability scan",
                         "vulnerability management", "remediation",
                         "qualys", "tenable", "rapid7", "insightvm", "capability_endpoint")),
    # CIS-8  Audit Log Management
    ControlDef("CIS-8", "CIS", "Audit Log Management", "SOC",
               _keywords("cis-8", "siem", "log", "audit", "telemetry", "monitoring",
                         "threat detection", "ueba", "capability_soc")),
    # CIS-9  Email and Web Browser Protections
    ControlDef("CIS-9", "CIS", "Email and Web Browser Protections", "Data",
               _keywords("cis-9", "email", "phishing", "spam", "web gateway", "url filtering",
                         "sandboxing", "browser", "email security", "email threat",
                         "email gateway", "email protection")),
    # CIS-10 Malware Defenses
    ControlDef("CIS-10", "CIS", "Malware Defenses", "Endpoint",
               _keywords("cis-10", "edr", "xdr", "antimalware", "antivirus", "endpoint protection",
                         "workload protection", "capability_endpoint", "capability_cloud")),
    # CIS-12 Network Infrastructure Management
    ControlDef("CIS-12", "CIS", "Network Infrastructure Management", "Network",
               _keywords("cis-12", "network firewall", "ngfw", "network infrastructure",
                         "segmentation", "perimeter", "ids", "ips", "ztna", "zero trust",
                         "sase", "capability_network")),
    # CIS-13 Network Monitoring and Defense
    ControlDef("CIS-13", "CIS", "Network Monitoring and Defense", "Network",
               _keywords("cis-13", "ndr", "network detection", "network monitoring", "ids", "ips",
                         "packet", "flow", "traffic analysis", "lateral movement", "capability_network")),
    # CIS-16 Application Software Security  → AppSec domain
    ControlDef("CIS-16", "CIS", "Application Software Security", "AppSec",
               _keywords("cis-16", "waf", "api security", "dast", "sast",
                         "software composition", "software composition analysis", "owasp",
                         "devsecops", "application security", "web application", "code scanning",
                         "vulnerability scanning", "appsec", "capability_appsec")),
    # CIS-17 Incident Response Management
    ControlDef("CIS-17", "CIS", "Incident Response Management", "SOC",
               _keywords("cis-17", "incident response", "soar", "orchestration", "playbook",
                         "case management", "triage", "capability_soc")),
]


# Curated tool recommendations per control — shown for missing and partial controls only.
# Format: short, vendor-specific, include function label in parentheses where helpful.
_CONTROL_RECOMMENDATIONS: Dict[str, str] = {
    # ── NIST CSF 2.0 ──────────────────────────────────────────────────────────
    "NIST-PR.AA":  "Entra ID, Okta, Ping Identity (IdP/SSO)  ·  CyberArk, BeyondTrust, Delinea (PAM)",
    "NIST-PR.PS":  "CrowdStrike Falcon, SentinelOne, Defender for Endpoint (EDR)  ·  Wiz, Orca, Prisma Cloud (CSPM)",
    "NIST-PR.DS":  "Varonis, Microsoft Purview (DLP/classification)  ·  Mimecast, Proofpoint (email)  ·  Cloudflare, F5 BIG-IP (WAF)",
    "NIST-PR.IR":  "Palo Alto NGFW, FortiGate, Check Point (NGFW)  ·  Zscaler, Netskope (SASE/ZTNA)",
    "NIST-DE.CM":  "Splunk, Microsoft Sentinel, IBM QRadar (SIEM)  ·  Darktrace, Vectra AI, ExtraHop (NDR/UEBA)",
    "NIST-RS.MA":  "Palo Alto XSOAR, Splunk SOAR, IBM QRadar SOAR (SOAR/orchestration)",
    # ── CIS Controls v8.1 ─────────────────────────────────────────────────────
    "CIS-3":   "Varonis, Microsoft Purview, Digital Guardian (DLP/classification)",
    "CIS-4":   "Wiz, Orca, Prisma Cloud, Defender for Cloud (CSPM/CNAPP)",
    "CIS-5":   "Microsoft Entra ID, Okta, SailPoint, Saviynt (IAM/provisioning)",
    "CIS-6":   "CyberArk, BeyondTrust, Delinea (PAM/JIT access)",
    "CIS-7":   "Qualys VMDR, Tenable.io, Rapid7 InsightVM (vulnerability management)",
    "CIS-8":   "Splunk, Microsoft Sentinel, Elastic SIEM, LogRhythm (SIEM/log management)",
    "CIS-9":   "Mimecast, Proofpoint, Defender for Office 365 (email/browser protection)",
    "CIS-10":  "CrowdStrike Falcon, SentinelOne, Defender for Endpoint (EDR/AV)",
    "CIS-12":  "Palo Alto NGFW, Fortinet FortiGate, Check Point, Cisco Firepower",
    "CIS-13":  "ExtraHop, Darktrace, Vectra AI, Gigamon (NDR/network monitoring)",
    "CIS-16":  "Cloudflare, F5 BIG-IP (WAF)  ·  Checkmarx, Veracode, Snyk (SAST/SCA)",
    "CIS-17":  "Palo Alto XSOAR, Splunk SOAR, ServiceNow SecOps (IR/orchestration)",
}


# Maps each control domain to the capability-bucket tokens that are meaningful for
# redundancy grouping within that domain.  Tools that happen to match a control via a
# *different* capability bucket (e.g. a WAF matching NIST-PR.DS which also covers Data)
# are excluded so cross-function tools are never flagged as redundant with each other.
# "Endpoint" deliberately includes capability_cloud because NIST-PR.PS covers both.
_DOMAIN_EXPECTED_CAPS: Dict[str, set] = {
    "Identity": {"capability_identity"},
    "Endpoint": {"capability_endpoint", "capability_cloud"},
    "Cloud":    {"capability_cloud"},
    "Network":  {"capability_network"},
    "Data":     {"capability_data"},     # capability_appsec excluded — WAF != DLP/email
    "AppSec":   {"capability_appsec"},
    "SOC":      {"capability_soc"},
}


def _row_caps(row: ToolControlRow) -> set:
    """Return the set of capability-bucket tokens present in a row's combined text fields."""
    parts = " ".join([
        row.tool_name,
        row.vendor or "",
        row.product or "",
        row.control_domain,
        row.control_objective,
        row.current_control_id or "",
        row.notes or "",
    ]).lower()
    return {tok for tok, aliases in ALIAS_TOKEN_MAP.items() if any(a in parts for a in aliases)}


def _selected_controls(framework: FrameworkChoice) -> List[ControlDef]:
    if framework == FrameworkChoice.NIST:
        return [c for c in CONTROL_LIBRARY if c.framework == "NIST"]
    if framework == FrameworkChoice.CIS:
        return [c for c in CONTROL_LIBRARY if c.framework == "CIS"]
    return CONTROL_LIBRARY


def _normalize_text(row: ToolControlRow) -> str:
    parts = [
        row.tool_name,
        row.vendor or "",
        row.product or "",
        row.control_domain,
        row.control_objective,
        row.current_control_id or "",   # direct control ID match (e.g. "PR.AA", "CIS-5")
        row.framework_alignment or "",
        row.notes or "",
    ]
    normalized = " ".join(parts).lower()
    alias_tokens = [
        token
        for token, aliases in ALIAS_TOKEN_MAP.items()
        if any(alias in normalized for alias in aliases)
    ]
    if alias_tokens:
        normalized = f"{normalized} {' '.join(alias_tokens)}"
    return normalized


def _build_current_state_diagram(rows: List[ToolControlRow]) -> Diagram:
    grouped_rows: Dict[str, List[ToolControlRow]] = defaultdict(list)
    for row in rows:
        domain = (row.control_domain or "Unmapped").strip() or "Unmapped"
        grouped_rows[domain].append(row)

    nodes: List[DiagramNode] = []
    edges: List[DiagramEdge] = []

    for domain in sorted(grouped_rows):
        domain_id = f"cur-domain-{domain.lower().replace(' ', '-')}"
        nodes.append(
            DiagramNode(
                id=domain_id,
                label=f"{domain} Controls",
                domain=domain,
                state="current",
            )
        )

        seen_tools = set()
        for idx, row in enumerate(sorted(grouped_rows[domain], key=lambda item: item.tool_name.lower())):
            tool_key = (row.tool_name or "").strip().lower()
            if not tool_key or tool_key in seen_tools:
                continue
            seen_tools.add(tool_key)

            tool_id = f"{domain_id}-tool-{idx}"
            nodes.append(
                DiagramNode(
                    id=tool_id,
                    label=row.tool_name,
                    domain=domain,
                    state="current",
                )
            )
            edges.append(
                DiagramEdge(
                    source=domain_id,
                    target=tool_id,
                    label="mapped tool",
                )
            )

    return Diagram(title="Current Tool-Control Map", nodes=nodes[:30], edges=edges[:40])


def _coverage_status(match_count: int) -> Tuple[str, float, str]:
    if match_count >= 2:
        return "covered", 1.0, "Multiple tools/controls support this objective."
    if match_count == 1:
        return "partial", 0.5, "Single mapped tool/control found for this objective."
    return "missing", 0.0, "No mapped tool/control found for this objective."


# Core domains carry the highest baseline risk — prioritised in Phase 1 when no controls are missing.
# Specialty domains follow in Phase 2.
_CORE_DOMAINS = {"Identity", "SOC", "Endpoint", "Network"}


def _build_roadmap(
    fw: str,
    gaps: List[GapFinding],
    redundancies: List[RedundancyFinding],
) -> List[RoadmapItem]:
    """Generate a roadmap directly from the analysis findings."""
    missing_gaps  = [g for g in gaps if g.status == "missing"]
    partial_gaps  = [g for g in gaps if g.status == "partial"]
    missing_domains = sorted({g.domain for g in missing_gaps})
    partial_domains = sorted({g.domain for g in partial_gaps})

    likely_red    = [r for r in redundancies if r.classification == "likely_redundant"]
    healthy_ovlp  = [r for r in redundancies if r.classification == "healthy_overlap"]
    total_savings = sum(r.estimated_savings_usd for r in redundancies)

    def _plural(n: int, word: str) -> str:
        return f"{n} {word}{'s' if n != 1 else ''}"

    def _join(items: list) -> str:
        return ", ".join(items) if items else "all domains"

    # ── Phase 1: close missing controls, or prioritise core partial domains ──
    if missing_domains:
        p1 = RoadmapItem(
            phase="Phase 1 (0–3 months)",
            initiative=(
                f"Deploy controls for {_join(missing_domains)} — "
                f"{_plural(len(missing_gaps), 'control')} currently have no coverage"
            ),
            framework_focus=fw,
            priority="P1",
            effort="M",
            expected_outcome=(
                f"Eliminate critical exposure in {_join(missing_domains)}; "
                "achieve baseline coverage across all mapped domains"
            ),
            depends_on="Tool procurement planning and control ownership assignment per domain",
        )
    else:
        # Split partial domains: core (Identity, SOC, Endpoint, Network) get Phase 1 focus
        core_partial = sorted(d for d in partial_domains if d in _CORE_DOMAINS)
        p1_targets = core_partial if core_partial else partial_domains
        p1 = RoadmapItem(
            phase="Phase 1 (0–3 months)",
            initiative=(
                f"No critical gaps — add second-layer coverage for {_join(p1_targets)} "
                "to reduce single-tool dependency in highest-risk domains"
            ),
            framework_focus=fw,
            priority="P1",
            effort="M",
            expected_outcome=(
                f"Uplift {_join(p1_targets)} controls to full coverage; "
                "eliminate single-point-of-failure risk in core security domains"
            ),
            depends_on="Control ownership mapping, stakeholder sign-off, and vendor shortlisting",
        )

    # ── Phase 2: remaining partial domains or integration work ───────────────
    if missing_domains and partial_domains:
        # There were gaps in Phase 1; Phase 2 cleans up partial controls
        p2 = RoadmapItem(
            phase="Phase 2 (3–6 months)",
            initiative=(
                f"Add second-layer coverage for {_join(partial_domains)} — "
                f"{_plural(len(partial_gaps), 'control')} rely on a single tool"
            ),
            framework_focus=fw,
            priority="P1",
            effort="L",
            expected_outcome=(
                "Eliminate single-tool dependencies; improve resilience and "
                "control confidence across all domains"
            ),
            depends_on="Vendor shortlisting and proof-of-concept for gap-fill tools",
        )
    elif not missing_domains and partial_domains:
        # No gaps: Phase 2 covers specialty domains not addressed in Phase 1
        core_partial    = sorted(d for d in partial_domains if d in _CORE_DOMAINS)
        spec_partial    = sorted(d for d in partial_domains if d not in _CORE_DOMAINS)
        p2_targets      = spec_partial if (core_partial and spec_partial) else partial_domains
        p2 = RoadmapItem(
            phase="Phase 2 (3–6 months)",
            initiative=(
                f"Extend second-layer coverage to {_join(p2_targets)} and "
                "deepen tool integrations to improve cross-domain signal fidelity"
            ),
            framework_focus=fw,
            priority="P1",
            effort="L",
            expected_outcome=(
                "Complete defense-in-depth across all domains; "
                "reduce analyst workload through tighter tool integration"
            ),
            depends_on="Proof-of-concept for gap-fill tools; architecture review for integration touchpoints",
        )
    else:
        p2 = RoadmapItem(
            phase="Phase 2 (3–6 months)",
            initiative="All controls have multi-tool coverage — deepen integrations and automate control evidence collection",
            framework_focus=fw,
            priority="P1",
            effort="L",
            expected_outcome="Improved detection fidelity and reduced analyst workload through tighter tool integration",
            depends_on="Architecture review and integration feasibility assessment",
        )

    # ── Phase 3: consolidate redundancies or harden posture ──────────────────
    if likely_red:
        red_domains = sorted({r.domain for r in likely_red})
        p3 = RoadmapItem(
            phase="Phase 3 (6–12 months)",
            initiative=(
                f"Consolidate likely-redundant tools in {', '.join(red_domains)} — "
                f"est. ${total_savings:,.0f} in potential savings"
            ),
            framework_focus=fw,
            priority="P2",
            effort="M",
            expected_outcome="Reduced TCO and operational complexity without loss of control coverage",
            depends_on="Vendor contractual review; workload migration and cutover planning",
        )
    elif healthy_ovlp:
        p3 = RoadmapItem(
            phase="Phase 3 (6–12 months)",
            initiative=(
                f"Review {_plural(len(healthy_ovlp), 'healthy-overlap tool pair')} "
                "for selective consolidation or enhanced integration"
            ),
            framework_focus=fw,
            priority="P2",
            effort="M",
            expected_outcome="Lower operational overhead and improved visibility through fewer, better-integrated tools",
            depends_on="Cost–benefit analysis per tool pair; business continuity planning",
        )
    else:
        p3 = RoadmapItem(
            phase="Phase 3 (6–12 months)",
            initiative="Establish continuous compliance posture monitoring and align tool stack to target architecture",
            framework_focus=fw,
            priority="P2",
            effort="M",
            expected_outcome="Sustained governance and framework-aligned control posture",
            depends_on="Runbook and automation integration; regular review cadence",
        )

    return [p1, p2, p3]


def analyze_mappings(rows: List[ToolControlRow], framework: FrameworkChoice) -> AnalysisResponse:
    controls = _selected_controls(framework)
    normalized = [_normalize_text(r) for r in rows]
    gaps: List[GapFinding] = []

    # Tracks matched rows AND contributing frameworks per (domain, control_name) key
    domain_to_meta: Dict[Tuple[str, str], dict] = defaultdict(lambda: {"rows": [], "frameworks": set()})

    for control in controls:
        match_count = 0
        matched_rows: List[ToolControlRow] = []
        for idx, text in enumerate(normalized):
            if any(k in text for k in control.keywords):
                match_count += 1
                matched_rows.append(rows[idx])

        status, score, rationale = _coverage_status(match_count)
        severity = "high" if status == "missing" else "medium" if status == "partial" else "low"
        gaps.append(
            GapFinding(
                control_id=control.control_id,
                framework=control.framework,
                control_name=control.name,
                domain=control.domain,
                status=status,
                severity=severity,
                coverage_score=score,
                rationale=rationale,
                recommended_tools=(
                    _CONTROL_RECOMMENDATIONS.get(control.control_id, "")
                    if status != "covered" else ""
                ),
            )
        )

        if matched_rows:
            key = (control.domain, control.name)
            domain_to_meta[key]["rows"].extend(matched_rows)
            domain_to_meta[key]["frameworks"].add(control.framework)

    redundancies: List[RedundancyFinding] = []
    avg_cost = sum([(r.annual_cost_usd or 0) for r in rows]) / max(1, len(rows))

    for (domain, objective), meta in domain_to_meta.items():
        matching_rows: List[ToolControlRow] = meta["rows"]
        fw_label = "BOTH" if len(meta["frameworks"]) > 1 else next(iter(meta["frameworks"]))

        # Filter to tools whose capability bucket aligns with this domain.
        # This prevents cross-function tools (e.g. a WAF matching NIST-PR.DS which
        # also covers Data) from being grouped as redundant with data-protection tools.
        expected_caps = _DOMAIN_EXPECTED_CAPS.get(domain, set())
        if expected_caps:
            matching_rows = [r for r in matching_rows if _row_caps(r) & expected_caps]

        unique_tools = sorted({row.tool_name for row in matching_rows})
        if len(unique_tools) < 2:
            continue

        unique_vendors  = sorted({(row.vendor  or "").strip() for row in matching_rows if (row.vendor  or "").strip()})
        unique_products = sorted({(row.product or "").strip() for row in matching_rows if (row.product or "").strip()})

        overlap_score  = min(1.0, len(unique_tools) / 5)
        savings        = round(max(0, (len(unique_tools) - 1) * avg_cost * 0.2), 2)
        classification = "likely_redundant" if len(unique_tools) >= 3 else "healthy_overlap"

        redundancies.append(
            RedundancyFinding(
                framework=fw_label,
                domain=domain,
                objective=objective,
                tools=unique_tools,
                vendors=unique_vendors,
                products=unique_products,
                overlap_score=overlap_score,
                classification=classification,
                estimated_savings_usd=savings,
            )
        )

    # Deduplicate entries that share the same tool set and domain.  In BOTH mode the same
    # tool pair can satisfy a NIST control *and* a CIS control in the same domain, which
    # would otherwise produce two identical-looking redundancy rows.
    seen_keys: set = set()
    deduped: List[RedundancyFinding] = []
    for r in redundancies:
        key = (frozenset(r.tools), r.domain)
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(r)
    redundancies = deduped

    covered = sum(1 for g in gaps if g.status == "covered")
    partial = sum(1 for g in gaps if g.status == "partial")
    missing = sum(1 for g in gaps if g.status == "missing")

    roadmap = _build_roadmap(framework.value, gaps, redundancies)

    current_diagram = _build_current_state_diagram(rows)

    target_nodes = [
        DiagramNode(id="t-identity", label="Unified IAM Control Stack",                    domain="Identity", state="target"),
        DiagramNode(id="t-endpoint", label="Consolidated Endpoint Control Stack",           domain="Endpoint", state="target"),
        DiagramNode(id="t-network",  label="Policy-Driven Network Control Plane",           domain="Network",  state="target"),
        DiagramNode(id="t-data",     label="Integrated Data Security Controls",             domain="Data",     state="target"),
        DiagramNode(id="t-cloud",    label="Cloud Security Posture and Workload Controls",  domain="Cloud",    state="target"),
        DiagramNode(id="t-appsec",   label="Application and API Security Controls",         domain="AppSec",   state="target"),
        DiagramNode(id="t-soc",      label="Centralized Detection and Response Controls",   domain="SOC",      state="target"),
    ]
    target_edges = [
        DiagramEdge(source="t-identity", target="t-endpoint", label="identity context"),
        DiagramEdge(source="t-endpoint", target="t-network",  label="telemetry + policy"),
        DiagramEdge(source="t-network",  target="t-data",     label="enforcement"),
        DiagramEdge(source="t-cloud",    target="t-appsec",   label="workload context"),
        DiagramEdge(source="t-appsec",   target="t-data",     label="application data protection"),
        DiagramEdge(source="t-data",     target="t-soc",      label="detection + response"),
    ]

    return AnalysisResponse(
        framework_selected=framework,
        rows_processed=len(rows),
        controls_total=len(gaps),
        controls_covered=covered,
        controls_partial=partial,
        controls_missing=missing,
        gaps=sorted(gaps, key=lambda g: (g.severity, g.control_id), reverse=True),
        redundancies=sorted(redundancies, key=lambda r: r.overlap_score, reverse=True),
        roadmap=roadmap,
        current_state_diagram=current_diagram,
        target_state_diagram=Diagram(title="Target Tool-Control Map", nodes=target_nodes, edges=target_edges),
    )
