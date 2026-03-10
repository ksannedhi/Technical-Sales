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


CONTROL_LIBRARY: List[ControlDef] = [
    ControlDef("NIST-PR.AA", "NIST", "Identity Management and Access Control", "Identity", ["identity", "sso", "mfa", "access"]),
    ControlDef("NIST-PR.PS", "NIST", "Endpoint and Platform Security", "Endpoint", ["endpoint", "edr", "xdr", "antimalware"]),
    ControlDef("NIST-DE.CM", "NIST", "Security Continuous Monitoring", "SOC", ["siem", "monitor", "detection", "log"]),
    ControlDef("NIST-PR.AC", "NIST", "Network Access and Segmentation", "Network", ["firewall", "ztna", "ids", "ips", "segment"]),
    ControlDef("NIST-PR.DS", "NIST", "Data Security", "Data", ["dlp", "encryption", "data"]),
    ControlDef("NIST-RS.RP", "NIST", "Incident Response Planning", "SOC", ["soar", "incident", "response"]),
    ControlDef("CIS-5", "CIS", "Account Management", "Identity", ["identity", "mfa", "access", "account"]),
    ControlDef("CIS-10", "CIS", "Malware Defenses", "Endpoint", ["edr", "xdr", "antimalware", "endpoint"]),
    ControlDef("CIS-8", "CIS", "Audit Log Management", "SOC", ["siem", "log", "monitor"]),
    ControlDef("CIS-12", "CIS", "Network Infrastructure Management", "Network", ["firewall", "network", "ids", "ips"]),
    ControlDef("CIS-3", "CIS", "Data Protection", "Data", ["dlp", "encryption", "classification"]),
    ControlDef("CIS-17", "CIS", "Incident Response Management", "SOC", ["incident", "response", "soar"]),
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
        row.current_control_name or "",
        row.framework_alignment or "",
        row.notes or "",
    ]
    return " ".join(parts).lower()


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
    domain_to_tools: Dict[Tuple[str, str], List[str]] = defaultdict(list)

    for control in controls:
        match_count = 0
        matched_tools = []
        for idx, text in enumerate(normalized):
            if any(k in text for k in control.keywords):
                match_count += 1
                matched_tools.append(rows[idx].tool_name)

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

        if matched_tools:
            domain_to_tools[(control.domain, control.name)].extend(matched_tools)

    redundancies: List[RedundancyFinding] = []
    for (domain, objective), tools in domain_to_tools.items():
        unique_tools = sorted(set(tools))
        if len(unique_tools) < 2:
            continue

        overlap_score = min(1.0, len(unique_tools) / 5)
        avg_cost = sum([(r.annual_cost_usd or 0) for r in rows]) / max(1, len(rows))
        savings = round(max(0, (len(unique_tools) - 1) * avg_cost * 0.2), 2)
        classification = "likely_redundant" if len(unique_tools) >= 3 else "healthy_overlap"

        redundancies.append(
            RedundancyFinding(
                domain=domain,
                objective=objective,
                tools=unique_tools,
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

    current_nodes = [
        DiagramNode(id=f"cur-{idx}", label=row.tool_name, domain=row.control_domain, state="current")
        for idx, row in enumerate(rows[:20])
    ]
    current_edges = [
        DiagramEdge(source=current_nodes[i].id, target=current_nodes[i + 1].id, label="control dependency")
        for i in range(0, max(0, len(current_nodes) - 1))
    ]

    target_nodes = [
        DiagramNode(id="t-identity", label="Unified IAM Control Stack", domain="Identity", state="target"),
        DiagramNode(id="t-endpoint", label="Consolidated Endpoint Control Stack", domain="Endpoint", state="target"),
        DiagramNode(id="t-network", label="Policy-Driven Network Control Plane", domain="Network", state="target"),
        DiagramNode(id="t-data", label="Integrated Data Security Controls", domain="Data", state="target"),
        DiagramNode(id="t-soc", label="Centralized Detection and Response Controls", domain="SOC", state="target"),
    ]
    target_edges = [
        DiagramEdge(source="t-identity", target="t-endpoint", label="identity context"),
        DiagramEdge(source="t-endpoint", target="t-network", label="telemetry + policy"),
        DiagramEdge(source="t-network", target="t-data", label="enforcement"),
        DiagramEdge(source="t-data", target="t-soc", label="detection + response"),
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
        current_state_diagram=Diagram(title="Current Tool-Control Map", nodes=current_nodes, edges=current_edges),
        target_state_diagram=Diagram(title="Target Tool-Control Map", nodes=target_nodes, edges=target_edges),
    )
