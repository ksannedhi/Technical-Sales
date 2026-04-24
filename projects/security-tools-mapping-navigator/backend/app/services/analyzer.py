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
        "microsoft defender",
        "cortex xdr",
        "deep security",
        "qualys",
        "tenable",
        "rapid7",
        "insightvm",
        "mcafee",
        "trend micro",
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
               _keywords("cis-4", "configuration", "hardening", "cloud posture", "endpoint posture",
                         "cloud security posture", "cspm", "cnapp", "benchmark", "secure config",
                         "misconfiguration", "cis benchmark",
                         "capability_cloud", "capability_endpoint")),
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
               _keywords("cis-7", "vulnerability", "patch", "cve", "scan", "remediation",
                         "qualys", "tenable", "rapid7", "insightvm", "capability_endpoint")),
    # CIS-8  Audit Log Management
    ControlDef("CIS-8", "CIS", "Audit Log Management", "SOC",
               _keywords("cis-8", "siem", "log", "audit", "telemetry", "monitoring",
                         "threat detection", "ueba", "capability_soc")),
    # CIS-9  Email and Web Browser Protections
    ControlDef("CIS-9", "CIS", "Email and Web Browser Protections", "Data",
               _keywords("cis-9", "email", "phishing", "spam", "web gateway", "url filtering",
                         "sandboxing", "browser", "email security", "capability_data")),
    # CIS-10 Malware Defenses
    ControlDef("CIS-10", "CIS", "Malware Defenses", "Endpoint",
               _keywords("cis-10", "edr", "xdr", "antimalware", "antivirus", "endpoint protection",
                         "workload protection", "capability_endpoint", "capability_cloud")),
    # CIS-12 Network Infrastructure Management
    ControlDef("CIS-12", "CIS", "Network Infrastructure Management", "Network",
               _keywords("cis-12", "network firewall", "ngfw", "network infrastructure", "ids", "ips",
                         "ztna", "zero trust", "sase", "capability_network")),
    # CIS-13 Network Monitoring and Defense
    ControlDef("CIS-13", "CIS", "Network Monitoring and Defense", "Network",
               _keywords("cis-13", "ndr", "network detection", "network monitoring", "ids", "ips",
                         "packet", "flow", "traffic analysis", "lateral movement", "capability_network")),
    # CIS-16 Application Software Security  → AppSec domain
    ControlDef("CIS-16", "CIS", "Application Software Security", "AppSec",
               _keywords("cis-16", "waf", "api security", "dast", "sast", "sca", "owasp",
                         "devsecops", "application security", "web application", "code scanning",
                         "vulnerability scanning", "appsec", "capability_appsec")),
    # CIS-17 Incident Response Management
    ControlDef("CIS-17", "CIS", "Incident Response Management", "SOC",
               _keywords("cis-17", "incident response", "soar", "orchestration", "playbook",
                         "case management", "triage", "capability_soc")),
]


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


def analyze_mappings(rows: List[ToolControlRow], framework: FrameworkChoice) -> AnalysisResponse:
    controls = _selected_controls(framework)
    normalized = [_normalize_text(r) for r in rows]
    gaps: List[GapFinding] = []
    domain_to_rows: Dict[Tuple[str, str], List[ToolControlRow]] = defaultdict(list)

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
            )
        )

        if matched_rows:
            domain_to_rows[(control.domain, control.name)].extend(matched_rows)

    redundancies: List[RedundancyFinding] = []
    for (domain, objective), matching_rows in domain_to_rows.items():
        unique_tools = sorted({row.tool_name for row in matching_rows})
        if len(unique_tools) < 2:
            continue

        unique_vendors = sorted({(row.vendor or "").strip() for row in matching_rows if (row.vendor or "").strip()})
        unique_products = sorted({(row.product or "").strip() for row in matching_rows if (row.product or "").strip()})

        overlap_score = min(1.0, len(unique_tools) / 5)
        avg_cost = sum([(r.annual_cost_usd or 0) for r in rows]) / max(1, len(rows))
        savings = round(max(0, (len(unique_tools) - 1) * avg_cost * 0.2), 2)
        classification = "likely_redundant" if len(unique_tools) >= 3 else "healthy_overlap"

        redundancies.append(
            RedundancyFinding(
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

    covered = sum(1 for g in gaps if g.status == "covered")
    partial = sum(1 for g in gaps if g.status == "partial")
    missing = sum(1 for g in gaps if g.status == "missing")

    roadmap: List[RoadmapItem] = [
        RoadmapItem(
            phase="Phase 1 (0-3 months)",
            initiative="Close high-severity control gaps for IAM, endpoint protection, and monitoring",
            framework_focus=framework.value,
            priority="P1",
            effort="M",
            expected_outcome="Immediate control coverage uplift for highest-risk objectives",
            depends_on="Tool/control mapping validation and control ownership alignment",
        ),
        RoadmapItem(
            phase="Phase 2 (3-6 months)",
            initiative="Consolidate redundant controls and rationalize overlapping tools",
            framework_focus=framework.value,
            priority="P1",
            effort="L",
            expected_outcome="Reduced TCO and simplified operations without reducing coverage",
            depends_on="Vendor/workload migration planning",
        ),
        RoadmapItem(
            phase="Phase 3 (6-12 months)",
            initiative="Harden control effectiveness and align tool stack to target security architecture",
            framework_focus=framework.value,
            priority="P2",
            effort="M",
            expected_outcome="Sustained governance and architecture-aligned control posture",
            depends_on="Runbook and automation integration",
        ),
    ]

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
