from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SECTION_NAMES = ("requirements", "proposal")

OUTCOME_TO_LABEL = {
    "PASS": "PASS",
    "PASS_WITH_RISK": "PASS WITH RISK",
    "REWORK": "REWORK",
    "DELIVERY ISSUE": "ATTENTION REQUIRED",
}

OUTCOME_TO_SCORE = {
    "PASS": 90,
    "PASS_WITH_RISK": 72,
    "REWORK": 45,
    "DELIVERY ISSUE": 20,
}

KEYWORDS = {
    "ha": ["ha", "high availability", "active-active", "active passive", "cluster"],
    "dr": ["dr", "disaster recovery", "dr site"],
    "log_volume": ["tb/day", "gb/day", "log volume", "logs/day", "ingestion"],
    "retention": ["retention", "90-day", "1-year", "365 day"],
    "identity": ["ad", "o365", "entra", "identity", "iam", "hr"],
    "compliance": [
        "compliance", "cbk", "nist", "iso", "regulatory",
        "gdpr", "hipaa", "pci", "fedramp", "dora", "nerc", "cmmc", "fisma",
        "soc 2", "soc2", "iso 27001", "iso27001",
    ],
    "air_gap": ["air-gapped", "air gapped", "no internet", "disconnected network"],
    "cloud": ["cloud", "saas", "aws", "azure", "gcp"],
    "failover": ["failover", "redundant"],
    "latency": ["latency", "low latency", "sla"],
    "business_outcome": ["outcome", "business", "executive summary", "use case"],
    "bom": ["bom", "bill of materials"],
    "timeline": ["week", "weeks", "timeline", "phase", "phases"],
}

DEFAULT_GATE_CONFIG = {
    "weights": {
        "Requirements": 0.45,
        "Architecture": 0.25,
        "Proposal": 0.30,
    },
    "score_thresholds": {
        "gate_pass": 80,
        "gate_review": 60,
        "overall_pass": 82,
        "overall_pass_with_risk": 62,
        "overall_rework": 45,
    },
    "requirements": {
        "baseline": 68,
        "missing_baseline": 15,
        "log_volume_bonus": 6,
        "retention_bonus": 5,
        "identity_bonus": 5,
        "compliance_bonus": 4,
        "vague_penalty": 10,
        "unclear_penalty": 6,
        "scope_penalty": 8,
    },
    "architecture": {
        "baseline": 62,
        "ha_bonus": 8,
        "dr_bonus": 8,
        "air_gap_conflict_penalty": 30,
        "latency_penalty": 10,
        "identity_penalty": 8,
        "cloud_penalty": 6,
        "single_node_penalty": 10,
        "api_penalty": 6,
    },
    "proposal": {
        "baseline": 70,
        "missing_baseline": 12,
        "timeline_bonus": 6,
        "business_bonus": 4,
        "generic_penalty": 12,
        "assumption_penalty": 6,
        "conflict_bonus": 3,
        "conflict_penalty": 8,
        "latency_penalty": 6,
        "deliverables_penalty": 8,
    },
    "vague_language": {
        "terms": [
            "improve visibility",
            "generic",
            "some endpoints",
            "standard deployment",
            "improve security",
        ],
        "minimum_words": 40,
        "minimum_detail_signals": 3,
        "structure_terms": [
            "scope",
            "requirements",
            "deliverables",
            "timeline",
            "integrations",
            "architecture",
        ],
        "detail_terms": [
            "tb/day",
            "gb/day",
            "retention",
            "ad",
            "entra",
            "identity",
            "integration",
            "vpn",
            "waf",
            "firewall",
            "load balancer",
            "ha",
            "dr",
            "phase",
            "sla",
        ],
    },
}

GENERAL_SCOPE_TERMS = [
    "scope",
    "endpoint",
    "server",
    "user",
    "soc",
    "network",
    "aws",
    "azure",
    "gcp",
    "dc",
    "branch",
    "application",
    "environment",
]

SOLUTION_FAMILY_KEYWORDS = {
    "siem_log_mgmt": [
        "siem", "log management", "log analytics", "soc", "splunk", "qradar", "sentinel", "elastic", "event volume", "eps",
        "fortianalyzer", "fortisiem",
    ],
    "firewall_network": [
        "firewall", "fortigate", "palo alto", "checkpoint", "vpn", "nat", "segmentation", "internet edge", "perimeter",
    ],
    "email_security": [
        "email security", "secure email", "phishing", "m365", "office 365", "exchange", "mail flow", "email gateway", "mimecast", "proofpoint",
        "barracuda email", "email security gateway", "barracuda essentials",
    ],
    "endpoint_xdr": [
        "endpoint", "edr", "xdr", "workstation", "server protection", "device control", "crowdstrike", "defender", "sentinelone",
    ],
    "iam_pam": [
        "iam", "pam", "identity governance", "sso", "mfa", "privileged", "entra id", "okta", "active directory", "ad",
    ],
    "sase_proxy": [
        "sase", "sse", "proxy", "secure web gateway", "swg", "ztna", "casb", "remote users", "branch traffic",
    ],
    "app_delivery_security": [
        "load balancer", "load balancer license", "waf", "web application firewall", "f5", "barracuda", "adc", "reverse proxy", "virtual server",
    ],
    # Extended families
    "ot_ics": [
        "ot", "ics", "scada", "purdue", "plant floor", "industrial", "operational technology",
        "dnp3", "modbus", "claroty", "nozomi", "dragos",
    ],
    "cloud_security": [
        "cspm", "cnapp", "cloud security posture", "cloud posture", "cloud workload protection",
        "defender for cloud", "wiz", "prisma cloud", "lacework",
    ],
    "vulnerability_management": [
        "vulnerability management", "vulnerability scanning", "patch management", "cve",
        "tenable", "qualys", "rapid7", "nexpose", "nessus",
    ],
    "ndr": [
        "ndr", "network detection", "network traffic analysis", "nta",
        "darktrace", "extrahop", "vectra",
    ],
    "dlp": [
        "dlp", "data loss prevention", "data exfiltration", "information protection", "purview",
    ],
    "managed_services": [
        "mdr", "managed detection", "managed soc", "soc as a service", "mssp", "managed security service",
    ],
    "ddos_protection": [
        "ddos", "denial of service", "dos protection", "arbor", "netscout", "radware", "cloudflare",
        "akamai", "volumetric attack", "scrubbing", "traffic scrubbing", "bgp diversion",
        "anti-ddos", "ddos mitigation", "flow telemetry",
    ],
}

SOLUTION_FAMILY_QUESTIONS = {
    "siem_log_mgmt": [
        "Which log sources, daily volume, and peak EPS should be used as the authoritative SIEM sizing baseline?",
        "What hot, warm, and cold retention split is required for the logging platform?",
        "Which SOC use cases, content packs, or correlation priorities must be live in phase one?",
    ],
    "firewall_network": [
        "What is the required firewall topology across internet edge, internal segmentation, VPN, and branch connectivity?",
        "Are HA pairs, failover behavior, and maintenance windows defined for the firewall deployment?",
        "Which NAT, routing, and east-west segmentation requirements must the design preserve?",
    ],
    "email_security": [
        "Is the target email environment M365, Google Workspace, or on-prem Exchange, and what mail flow mode is required?",
        "Which email security capabilities are in scope: anti-phishing, sandboxing, DMARC, continuity, encryption, or awareness?",
        "Are journaling, impersonation protection, and user remediation workflows required in the first phase?",
    ],
    "endpoint_xdr": [
        "How many endpoints and servers are in scope, and what operating systems or legacy agents must be supported?",
        "Which endpoint controls are required: prevention, EDR/XDR, device control, isolation, or vulnerability management?",
        "What is the expected rollout model for pilots, coexistence, and agent replacement on existing devices?",
    ],
    "iam_pam": [
        "Which identity sources, directories, and HR systems are authoritative for IAM or PAM onboarding?",
        "Which authentication flows are required: SSO, MFA, privileged access, lifecycle automation, or federation?",
        "Are break-glass access, admin workflows, and compliance reporting requirements explicitly defined?",
    ],
    "sase_proxy": [
        "Which users, branches, and applications must traverse the SASE or proxy service on day one?",
        "What traffic steering model is required across remote users, branch offices, VPN replacement, and private app access?",
        "Which controls are mandatory in scope: SWG, CASB, ZTNA, DLP, RBI, or tenant restrictions?",
    ],
    "app_delivery_security": [
        "What application delivery topology is required across load balancers, WAF instances, virtual servers, and protected applications?",
        "Are HA pairs, failover behavior, SSL offload, and certificate responsibilities defined for the load balancer or WAF design?",
        "Which applications, public services, and environments must be front-ended or protected in phase one?",
    ],
    "ot_ics": [
        "Which OT protocols, zones, and network segments must the solution monitor or protect (e.g. Purdue zones, DNP3, Modbus)?",
        "What is the acceptable inspection depth and latency impact for OT traffic, and are passive-only or read-only sensor modes required?",
        "Which IT/OT boundary controls and integration points need to be defined before solution deployment can begin?",
    ],
    "cloud_security": [
        "Which cloud platforms, accounts, and workloads are in scope for posture management or workload protection?",
        "Are agent-based and agentless scanning both required, and which cloud-native services must the solution integrate with?",
        "What compliance frameworks or policy benchmarks must the CSPM/CNAPP tool enforce continuously?",
    ],
    "vulnerability_management": [
        "How many assets, subnets, and cloud accounts are in scope for vulnerability scanning?",
        "What scan frequency and credentialed vs. uncredentialed coverage is required for internal and DMZ segments?",
        "How must vulnerability data integrate with ticketing, patching, and risk-scoring workflows?",
    ],
    "ndr": [
        "Which network segments, cloud VPCs, and east-west traffic paths must the NDR sensor cover?",
        "What detection fidelity, alert volume, and SIEM integration requirements apply to the NDR deployment?",
        "Are encrypted traffic analysis, ML baselining, and threat hunting workflows required in phase one?",
    ],
    "dlp": [
        "Which data channels are in scope: endpoint, email, web, cloud storage, or all four?",
        "How are data classification policies, incident workflows, and false-positive tuning managed?",
        "What compliance or regulatory drivers are shaping the DLP policy scope and enforcement requirements?",
    ],
    "managed_services": [
        "What is the expected service model: fully managed SOC, co-managed, or MDR with human-analyst escalation?",
        "Which environments, log sources, and response actions must the managed service cover from day one?",
        "How are SLAs, escalation paths, and customer-side responsibilities divided between the provider and the internal team?",
    ],
    "ddos_protection": [
        "What is the expected attack profile — volumetric, protocol, or application-layer — and what peak bandwidth must the solution absorb?",
        "Which upstream ISPs or transit providers are in scope for BGP diversion or flow-telemetry integration?",
        "What on-premises scrubbing capacity, cloud-based mitigation, and hybrid failover model is required?",
    ],
}

# Solution-family-aware HA clarifying questions.
# The architecture gate uses these instead of a hardcoded SIEM-centric question.
HA_QUESTIONS_BY_FAMILY = {
    "siem_log_mgmt": "How is high availability handled across log collectors, indexers, and search nodes?",
    "firewall_network": "How are HA pairs and failover defined across internet edge, VPN termination, and branch sites?",
    "endpoint_xdr": "How is management server resilience and agent policy continuity maintained during infrastructure failure?",
    "iam_pam": "How is high availability defined for identity providers, PAM vaults, and authentication proxies?",
    "sase_proxy": "How is service resilience defined for SASE PoPs, SD-WAN edges, and private application connectors?",
    "app_delivery_security": "How are HA pairs, failover, and SSL offload responsibilities defined for the load balancer or WAF design?",
    "email_security": "How is email service continuity and failover defined for the mail flow path and security gateway?",
    "ot_ics": "How is sensor resilience and network tap availability maintained during OT maintenance windows or network disruption?",
    "cloud_security": "How is continuous posture assessment maintained across cloud accounts during API outages or configuration changes?",
    "vulnerability_management": "How is scanner availability and scan continuity maintained across network zones and cloud accounts?",
    "ndr": "How are NDR sensor redundancy and traffic capture continuity maintained during maintenance or network changes?",
    "dlp": "How is DLP policy enforcement continuity maintained during system upgrades or connector failures?",
    "managed_services": "How is analyst coverage and escalation continuity maintained during service provider incidents or maintenance windows?",
    "ddos_protection": "How is scrubbing centre availability and BGP diversion continuity maintained during a sustained volumetric attack or ISP failover?",
}
HA_QUESTION_DEFAULT = "How is high availability and failover defined for the primary system components?"

# Families where missing identity integration is a material gap worth flagging.
IDENTITY_SENSITIVE_FAMILIES = {"siem_log_mgmt", "iam_pam", "endpoint_xdr"}

# Sector terms that imply a specific compliance driver.  Used to produce a low-severity
# finding when no explicit framework (GDPR, ISO 27001, PCI-DSS, etc.) is named.
# Kept narrow so general "government" or "bank" references do not over-trigger.
REGULATED_SECTOR_SIGNALS = [
    "healthcare", "financial services", "critical infrastructure",
    "defence", "defense", "fintech",
]

# Terms that indicate a license or support renewal rather than a new deployment.
# When detected, HA/DR architecture findings are softened — the infrastructure
# already exists; the check becomes "confirm it hasn't changed" rather than "define it".
RENEWAL_SIGNALS = [
    "renewal", "license renewal", "maintenance renewal", "support renewal",
    "renew", "contract renewal", "subscription renewal",
]

# Anchor keywords for proposal-fallback family detection.
# When the requirements/RFP yields zero family hits (generic procurement language,
# bilingual PDFs, terse renewal RFPs), the engine falls back to the proposal text.
# To avoid false positives — e.g. "active directory" and "mfa" in a Proofpoint email
# proposal triggering the iam_pam family — at least one anchor keyword (vendor name
# or product-specific term) must be present before the fallback qualifies.
# Generic integration terms ("sso", "mfa", "firewall") are deliberately excluded.
FAMILY_ANCHOR_KEYWORDS: dict[str, list[str]] = {
    # Vendor/product names only — "siem", "log management", "log analytics" are excluded
    # because they appear as integration context in firewall, network, and multi-product
    # proposals ("SIEM integration", "centralized log management") and would spuriously
    # trigger the siem_log_mgmt family for non-SIEM deals.
    "siem_log_mgmt": ["splunk", "qradar", "microsoft sentinel", "elastic siem", "elastic stack", "exabeam", "logrhythm", "securonix", "chronicle siem", "devo", "fortianalyzer", "fortisiem"],
    "firewall_network": ["fortigate", "palo alto", "checkpoint", "internet edge", "perimeter firewall", "next-generation firewall", "ngfw"],
    "email_security": ["proofpoint", "mimecast", "email security", "email gateway", "secure email gateway", "barracuda email"],
    "endpoint_xdr": ["crowdstrike", "sentinelone", "defender for endpoint", "edr", "xdr", "endpoint protection"],
    "sase_proxy": ["sase", "ztna", "secure web gateway", "casb", "swg", "zero trust network"],
    "app_delivery_security": ["load balancer", "waf", "web application firewall", "f5", "barracuda", "adc", "reverse proxy"],
    "ot_ics": ["scada", "operational technology", "purdue", "claroty", "nozomi", "dragos", "ics security"],
    "cloud_security": ["cspm", "cnapp", "wiz", "lacework", "cloud security posture", "prisma cloud", "defender for cloud"],
    "vulnerability_management": ["tenable", "qualys", "rapid7", "nessus", "vulnerability management", "vulnerability scanning"],
    "ndr": ["darktrace", "extrahop", "vectra", "network detection", "network traffic analysis"],
    "dlp": ["data loss prevention", "purview", "dlp policy", "information protection platform"],
    "managed_services": ["managed detection", "managed soc", "soc as a service", "mssp", "mdr service"],
    "ddos_protection": ["arbor", "netscout", "radware", "ddos mitigation", "scrubbing", "bgp diversion", "anti-ddos", "volumetric attack"],
}

# Families excluded from proposal-fallback detection entirely.
# iam_pam is excluded because its keywords (sso, mfa, active directory, privileged access)
# appear ubiquitously in proposals for unrelated solutions as integration references.
# Even strict vendor anchors (cyberark, beyondtrust) can appear in context phrases like
# "securing email for privileged access management accounts" in an email security proposal.
# A genuine IAM/PAM deal always has the RFP state "identity management", "privileged access",
# or a PAM vendor name — req_hits will be ≥1 and normal detection fires without fallback.
PROPOSAL_FALLBACK_EXCLUDED: frozenset[str] = frozenset({"iam_pam"})

POSITIVE_SIGNALS = [
    ("Quantified sizing is present", "requirements", "log_volume"),
    ("Retention requirement is defined", "requirements", "retention"),
    ("Identity/integration detail is present", "requirements", "identity"),
    ("HA or clustering detail is present in the deal package", "architecture", "ha"),
    ("DR or failover detail is present in the deal package", "architecture", "dr"),
    ("Proposal includes phased delivery or timeline detail", "proposal", "timeline"),
    ("Proposal references business or executive value", "proposal", "business_outcome"),
    ("Proposal includes BoM or commercial structure cues", "proposal", "bom"),
]


@dataclass
class AnalysisResult:
    overall_status: str
    overall_score: int
    gate_scores: dict[str, int]
    gate_statuses: dict[str, str]
    findings: list[dict[str, str]]
    strengths: list[str]
    missing_artifacts: list[str]
    clarifying_questions: list[str]
    seed_examples: list[dict[str, str]]

    def to_dict(self) -> dict[str, object]:
        return {
            "overall_status": self.overall_status,
            "overall_score": self.overall_score,
            "gate_scores": self.gate_scores,
            "gate_statuses": self.gate_statuses,
            "findings": self.findings,
            "strengths": self.strengths,
            "missing_artifacts": self.missing_artifacts,
            "clarifying_questions": self.clarifying_questions,
            "seed_examples": self.seed_examples,
        }


class SeedDataset:
    """Seed deal dataset with lazy loading.

    File I/O is deferred until the first access of `.deals` so that
    ``PresalesGateEngine.__init__`` completes (and the WSGI server socket
    binds) before any disk reads occur.  Subsequent accesses hit the
    in-memory cache instantly.
    """

    def __init__(self, roots: list[Path]) -> None:
        self.roots = roots
        self._deals: list[dict[str, str]] | None = None

    @property
    def deals(self) -> list[dict[str, str]]:
        if self._deals is None:
            self._deals = self._load()
        return self._deals

    def _load(self) -> list[dict[str, str]]:
        deals: list[dict[str, str]] = []
        for root in self.roots:
            if not root.exists():
                continue
            for deal_dir in sorted(path for path in root.iterdir() if path.is_dir()):
                record: dict[str, str] = {"name": deal_dir.name}
                supporting_context: list[str] = []
                for file_path in sorted(path for path in deal_dir.iterdir() if path.is_file()):
                    key = file_path.stem.lower()
                    content = file_path.read_text(encoding="utf-8").strip()
                    if key in SECTION_NAMES or key == "outcome":
                        record[key] = content
                    else:
                        supporting_context.append(content)
                for section in (*SECTION_NAMES, "outcome"):
                    record.setdefault(section, "")
                record["supporting_context"] = "\n\n".join(supporting_context).strip()
                deals.append(record)
        return deals

    def examples(self) -> list[str]:
        return [deal["name"] for deal in self.deals]

    def get(self, name: str) -> dict[str, str] | None:
        for deal in self.deals:
            if deal["name"] == name:
                return deal
        return None

    def related_examples(self, findings: Iterable[dict[str, str]]) -> list[dict[str, str]]:
        tags = {finding["tag"] for finding in findings if finding.get("tag")}
        matches: list[dict[str, str]] = []
        for deal in self.deals:
            text = " ".join(deal.get(section, "").lower() for section in (*SECTION_NAMES, "outcome"))
            if any(tag in text for tag in tags):
                matches.append({
                    "name": deal["name"],
                    "outcome": deal.get("outcome", ""),
                })
        return matches[:3]


class HistoryStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._initialize()

    def _initialize(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    deal_name TEXT NOT NULL,
                    overall_status TEXT NOT NULL,
                    overall_score INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def save(self, deal_name: str, result: AnalysisResult) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT INTO analyses (deal_name, overall_status, overall_score, payload) VALUES (?, ?, ?, ?)",
                (deal_name, result.overall_status, result.overall_score, json.dumps(result.to_dict())),
            )
            conn.commit()
        finally:
            conn.close()

    def recent(self, limit: int = 8) -> list[dict[str, object]]:
        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT deal_name, overall_status, overall_score, created_at FROM analyses ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        finally:
            conn.close()
        return [
            {
                "deal_name": row[0],
                "overall_status": row[1],
                "overall_score": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]


class PresalesGateEngine:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.config = load_gate_config(data_dir / "gate_config.json")
        self.seed_dataset = SeedDataset([data_dir / "seed_dataset", data_dir / "messy_seed_dataset"])
        self.history = HistoryStore(data_dir / "analyses.db")

    def get_examples(self) -> list[str]:
        return self.seed_dataset.examples()

    def get_seed_deal(self, name: str) -> dict[str, str] | None:
        return self.seed_dataset.get(name)

    def analyze(self, deal_name: str, artifacts: dict[str, str]) -> AnalysisResult:
        normalized = {key: normalize_text(artifacts.get(key, "")) for key in SECTION_NAMES}
        supporting_context = normalize_text(artifacts.get("supporting_context", ""))
        missing_artifacts = [section for section, text in normalized.items() if not text.strip()]
        detected_solution_families = self._detect_solution_families(normalized, supporting_context)

        # Compute renewal flag once from all artifact text so every gate sees it
        # consistently — "renewal" typically appears in the proposal title or body,
        # not in the RFP requirements section.
        all_artifact_text = " ".join([normalized.get(k, "") for k in SECTION_NAMES] + [supporting_context])
        is_renewal = has_any(all_artifact_text, RENEWAL_SIGNALS)

        findings: list[dict[str, str]] = []
        strengths: list[str] = []
        clarifying_questions: list[str] = []

        requirements_score = self._requirements_gate(
            normalized["requirements"],
            supporting_context,
            detected_solution_families,
            findings,
            strengths,
            clarifying_questions,
            is_renewal,
        )
        architecture_score = self._architecture_gate(normalized["requirements"], supporting_context, detected_solution_families, findings, strengths, clarifying_questions, is_renewal)
        proposal_score = self._proposal_gate(normalized["requirements"], normalized["proposal"], supporting_context, findings, strengths, clarifying_questions)
        self._cross_document_checks(normalized["requirements"], normalized["proposal"], supporting_context, findings, clarifying_questions)
        self._solution_family_questions(detected_solution_families, normalized, supporting_context, clarifying_questions, is_renewal)

        for missing in missing_artifacts:
            findings.append({
                "gate": "Document Presence",
                "severity": "high",
                "message": f"Missing {missing} artifact.",
                "tag": missing,
            })

        gate_scores = {
            "Requirements": clamp_score(requirements_score - len(missing_artifacts) * 5),
            "Architecture": clamp_score(architecture_score),
            "Proposal": clamp_score(proposal_score - (10 if "proposal" in missing_artifacts else 0)),
        }
        gate_statuses = {gate: status_from_score(score) for gate, score in gate_scores.items()}
        weights = self.config["weights"]
        overall_score = round(
            (gate_scores["Requirements"] * weights["Requirements"])
            + (gate_scores["Architecture"] * weights["Architecture"])
            + (gate_scores["Proposal"] * weights["Proposal"])
        )
        overall_status = overall_status_from_findings(overall_score, findings, self.config)

        # Cap at 8 questions — multi-product deals with 4 solution families can generate
        # many valid questions, and the extra 2 slots ensure family-specific questions survive.
        dedup_questions = dedupe(clarifying_questions)[:8]
        dedup_strengths = dedupe(strengths)[:6]
        dedup_findings = dedupe_findings(findings)

        result = AnalysisResult(
            overall_status=overall_status,
            overall_score=overall_score,
            gate_scores=gate_scores,
            gate_statuses=gate_statuses,
            findings=dedup_findings,
            strengths=dedup_strengths,
            missing_artifacts=missing_artifacts,
            clarifying_questions=dedup_questions,
            seed_examples=self.seed_dataset.related_examples(dedup_findings),
        )
        self.history.save(deal_name, result)
        return result

    def _detect_solution_families(self, artifacts: dict[str, str], supporting_context: str) -> list[str]:
        requirements = artifacts.get("requirements", "")
        proposal = artifacts.get("proposal", "")
        combined = f"{requirements} {supporting_context} {proposal}"

        # Renewal deals (e.g. government RFPs for existing installations) often have bilingual
        # PDFs or terse commercial-only requirements sections that don't restate product keywords.
        # In that case, fall back to proposal hits so the correct solution families are still
        # detected and relevant questions are asked.
        is_renewal = has_any(combined, RENEWAL_SIGNALS)

        family_scores: list[tuple[int, str]] = []
        for family, keywords in SOLUTION_FAMILY_KEYWORDS.items():
            # Require at least one hit in the requirements/RFP to consider a family in scope.
            # This prevents vendor credential boilerplate in the proposal from triggering
            # solution families unrelated to the actual deal.
            # Exception: renewal deals may have sparse/bilingual requirements — allow proposal
            # hits to stand in when the requirements text yields nothing.
            req_hits = sum(1 for kw in keywords if _keyword_match(requirements, kw))
            proposal_hits = sum(1 for kw in keywords if _keyword_match(proposal, kw))
            if req_hits == 0:
                # Government and procurement RFPs often use generic procurement language
                # without naming the solution or vendor — the proposal carries the specificity.
                # Allow proposal-only detection when the proposal shows enough signal, but
                # require at least one anchor keyword (vendor name or product-specific term)
                # so that generic integration terms ("active directory", "mfa", "sso") in an
                # unrelated proposal don't spuriously trigger a family.
                # Rules:
                #   - Renewal deal: ≥2 proposal hits AND ≥1 anchor hit
                #   - Any deal:     ≥4 proposal hits AND ≥1 anchor hit
                # Some families are excluded from proposal-fallback altogether because
                # their keywords are too generic to reliably distinguish primary scope
                # from incidental integration references in an unrelated proposal.
                if family in PROPOSAL_FALLBACK_EXCLUDED:
                    continue
                anchors = FAMILY_ANCHOR_KEYWORDS.get(family, [])
                has_anchor = any(_keyword_match(proposal, a) for a in anchors)
                if not has_anchor:
                    continue
                renewal_ok = is_renewal and proposal_hits >= 2
                strong_proposal = proposal_hits >= 4
                if not (renewal_ok or strong_proposal):
                    continue
            total_hits = sum(1 for kw in keywords if _keyword_match(combined, kw))
            if total_hits >= 2:
                family_scores.append((total_hits, family))
        family_scores.sort(reverse=True)
        # Allow up to 4 families so multi-workstream deals (e.g. firewall + email + OT + IAM)
        # receive relevant questions and findings for every in-scope product area.
        return [family for _, family in family_scores][:4]

    def _solution_family_questions(
        self,
        solution_families: list[str],
        artifacts: dict[str, str],
        supporting_context: str,
        questions: list[str],
        is_renewal: bool = False,
    ) -> None:
        combined = " ".join([artifacts.get(section, "") for section in SECTION_NAMES] + [supporting_context])
        for family in solution_families:
            family_questions = SOLUTION_FAMILY_QUESTIONS.get(family, [])
            if not family_questions:
                continue
            # For renewal deals, suppress siem_log_mgmt questions entirely.
            # SIEM is often detected from customer-references boilerplate in renewal
            # proposals rather than as the primary solution being renewed — asking
            # about sizing baselines and retention splits is inappropriate in that context.
            if family == "siem_log_mgmt" and is_renewal:
                continue
            # For SIEM: if log volume is already defined, skip the sizing question
            # and surface the higher-level retention and use-case questions instead.
            if family == "siem_log_mgmt" and has_any(combined, KEYWORDS["log_volume"]):
                questions.extend(family_questions[1:3])
            else:
                questions.extend(family_questions[:2])

    def _requirements_gate(
        self,
        requirements: str,
        supporting_context: str,
        solution_families: list[str],
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
        is_renewal: bool = False,
    ) -> int:
        gate_config = self.config["requirements"]
        score = gate_config["baseline"] if requirements else gate_config["missing_baseline"]
        if not requirements:
            questions.append("Can you provide a requirements or discovery summary before gating the deal?")
            return score

        observability_sensitive = "siem_log_mgmt" in solution_families
        if observability_sensitive:
            if has_any(requirements, KEYWORDS["log_volume"]):
                score += gate_config["log_volume_bonus"]
            elif has_any(supporting_context, KEYWORDS["log_volume"]):
                score += gate_config["log_volume_bonus"] // 2
            elif is_renewal:
                # Renewal deal — existing SIEM sizing is already set and running.
                # SIEM may appear in customer references or as a passing mention;
                # don't penalise for missing log volume on a renewal.
                pass
            else:
                findings.append(make_finding("Requirements", "medium", "Sizing input is missing or unclear, especially log volume or ingestion rate.", "log volume"))
                questions.append("What is the expected daily ingestion or event volume?")

            if has_any(requirements, KEYWORDS["retention"]):
                score += gate_config["retention_bonus"]
            elif has_any(supporting_context, KEYWORDS["retention"]):
                score += gate_config["retention_bonus"] // 2
            elif is_renewal:
                # Retention policy is already configured on the existing SIEM.
                pass
            else:
                findings.append(make_finding("Requirements", "medium", "Retention requirement is not clearly stated.", "retention"))
                questions.append("What retention period is required?")

        if has_any(requirements, KEYWORDS["identity"]):
            score += gate_config["identity_bonus"]
        elif has_any(supporting_context, KEYWORDS["identity"]):
            score += gate_config["identity_bonus"] // 2
        elif any(f in solution_families for f in IDENTITY_SENSITIVE_FAMILIES) and not is_renewal:
            # Only flag missing identity as a gap for SIEM, IAM/PAM, and endpoint deals
            # where identity integration is a core delivery dependency.
            # Suppressed for renewal deals — SIEM may appear in customer references
            # rather than as the primary solution, and integrations are already live.
            findings.append(make_finding("Requirements", "medium", "Identity or core integration dependencies are not clearly defined.", "identity"))
            questions.append("Which identity systems and core integrations must be supported?")

        if has_any(requirements, KEYWORDS["compliance"]):
            score += gate_config["compliance_bonus"]
        elif has_any(supporting_context, KEYWORDS["compliance"]):
            score += gate_config["compliance_bonus"] // 2
        elif any(has_word(requirements, sector) for sector in REGULATED_SECTOR_SIGNALS):
            # A specific regulated sector is named but no explicit compliance framework is mentioned.
            # Lower severity than a genuine missing requirement — the framework is implied but
            # should be named before the deal advances to technical proposal.
            findings.append(make_finding("Requirements", "low", "A regulated sector is referenced but no specific compliance framework is named.", "compliance"))

        if vague_language(requirements, self.config):
            score -= gate_config["vague_penalty"]
            findings.append(make_finding("Requirements", "high", "Requirements are too vague for a reliable design review.", "vague"))

        # Only check discovery notes for uncertainty markers — formal RFPs routinely use
        # "incomplete" and "unclear" in procurement boilerplate (e.g. "right to reject
        # incomplete proposals"), which is not a discovery gap indicator.
        if any(has_word(supporting_context, token) for token in ["tbd", "not confirmed", "unclear", "incomplete"]):
            score -= gate_config["unclear_penalty"]
            findings.append(make_finding("Requirements", "medium", "Critical discovery inputs are still uncertain or incomplete.", "unclear"))

        scope_terms = self._scope_terms(solution_families)
        if not any(token in requirements for token in scope_terms) and not any(token in supporting_context for token in scope_terms):
            score -= gate_config["scope_penalty"]
            findings.append(make_finding("Requirements", "medium", "Scope boundaries are weak or missing.", "scope"))
            questions.append("What assets, users, and environments are in scope?")

        for message, section, tag in POSITIVE_SIGNALS[:4]:
            if section == "requirements" and (has_any(requirements, KEYWORDS[tag]) or has_any(supporting_context, KEYWORDS[tag])):
                strengths.append(message)

        return clamp_score(score)

    def _architecture_gate(
        self,
        requirements: str,
        supporting_context: str,
        solution_families: list[str],
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
        is_renewal: bool = False,
    ) -> int:
        gate_config = self.config["architecture"]
        combined = f"{requirements} {supporting_context}".strip()
        score = gate_config["baseline"]

        if has_any(combined, KEYWORDS["ha"]):
            score += gate_config["ha_bonus"]
        elif is_renewal:
            findings.append(make_finding("Architecture", "low", "Renewal deal — confirm the existing HA design is unchanged and still fit for the renewed term.", "ha"))
        else:
            findings.append(make_finding("Architecture", "high", "High availability design is missing or unclear.", "ha"))
            # Use a solution-family-specific HA question rather than SIEM-centric language.
            ha_q = next(
                (HA_QUESTIONS_BY_FAMILY[f] for f in solution_families if f in HA_QUESTIONS_BY_FAMILY),
                HA_QUESTION_DEFAULT,
            )
            questions.append(ha_q)

        if has_any(combined, KEYWORDS["dr"]) or has_any(combined, KEYWORDS["failover"]):
            score += gate_config["dr_bonus"]
        elif not is_renewal:
            findings.append(make_finding("Architecture", "medium", "DR or failover design is not defined.", "dr"))

        if has_any(requirements, KEYWORDS["air_gap"]) and has_any(combined, KEYWORDS["cloud"]):
            score -= gate_config["air_gap_conflict_penalty"]
            findings.append(make_finding("Architecture", "high", "Architecture conflicts with an air-gapped or no-cloud requirement.", "air-gapped"))

        # Alignment checks: only penalise when discovery notes exist but don't address the requirement
        has_discovery_notes = len(supporting_context.strip()) > 50

        if has_any(requirements, KEYWORDS["latency"]) and has_discovery_notes and not has_any(supporting_context, KEYWORDS["latency"]):
            score -= gate_config["latency_penalty"]
            findings.append(make_finding("Architecture", "medium", "Low-latency requirement is present but latency handling is not described in discovery notes.", "latency"))

        if has_any(requirements, KEYWORDS["identity"]) and has_discovery_notes and not has_any(supporting_context, KEYWORDS["identity"]):
            score -= gate_config["identity_penalty"]
            findings.append(make_finding("Architecture", "medium", "Identity integration is required but not addressed in discovery notes.", "identity"))

        if has_any(requirements, KEYWORDS["cloud"]) and has_discovery_notes and not has_any(supporting_context, KEYWORDS["cloud"]):
            score -= gate_config["cloud_penalty"]
            findings.append(make_finding("Architecture", "medium", "Cloud ingestion or controls are required but not addressed in discovery notes.", "cloud"))

        if has_word(combined, "single node"):
            score -= gate_config["single_node_penalty"]
            findings.append(make_finding("Architecture", "medium", "Single-node architecture creates resilience risk for production use.", "single node"))

        # Restrict uncertainty checks to discovery notes — RFP documents commonly use
        # "unclear" in procurement clauses that have nothing to do with design gaps.
        if any(has_word(supporting_context, token) for token in ["unclear", "not confirmed", "api access not confirmed"]):
            score -= gate_config["api_penalty"]
            findings.append(make_finding("Architecture", "medium", "Architecture depends on unresolved integration or API assumptions.", "api"))

        for message, section, tag in POSITIVE_SIGNALS:
            if section == "architecture" and has_any(combined, KEYWORDS[tag]):
                strengths.append(message)

        return clamp_score(score)

    def _proposal_gate(
        self,
        requirements: str,
        proposal: str,
        supporting_context: str,
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
    ) -> int:
        gate_config = self.config["proposal"]
        score = gate_config["baseline"] if proposal else gate_config["missing_baseline"]
        if not proposal:
            questions.append("Can you provide proposal or SOW text before customer-ready gating?")
            return score

        if has_any(proposal, KEYWORDS["timeline"]):
            score += gate_config["timeline_bonus"]
        elif has_any(supporting_context, KEYWORDS["timeline"]):
            score += gate_config["timeline_bonus"] // 2
        else:
            findings.append(make_finding("Proposal", "medium", "Timeline or phased delivery plan is missing.", "timeline"))

        if has_any(proposal, KEYWORDS["business_outcome"]):
            score += gate_config["business_bonus"]
        elif has_any(supporting_context, KEYWORDS["business_outcome"]):
            score += gate_config["business_bonus"] // 2
        else:
            findings.append(make_finding("Proposal", "low", "Proposal focuses on solution delivery but not business value.", "business"))

        # "generic malware", "generic threats" etc. are valid cybersecurity terms; only
        # flag when "generic" qualifies the solution or approach itself.
        if has_word(proposal, "generic solution") or has_word(proposal, "generic approach") or has_word(proposal, "generic template"):
            score -= gate_config["generic_penalty"]
            findings.append(make_finding("Proposal", "medium", "Proposal content appears generic and not tailored to the deal.", "generic"))

        # "assumed" alone is too broad — it fires on biographical text ("assumed the role").
        # "assumed that" is specific to technical assumption statements in proposals/SOWs.
        if any(has_word(proposal, token) or has_word(supporting_context, token) for token in ["assumed that", "tbd", "check policy"]):
            score -= gate_config["assumption_penalty"]
            findings.append(make_finding("Proposal", "medium", "Proposal relies on unresolved assumptions that should be surfaced before customer submission.", "assumption"))

        if has_any(requirements, KEYWORDS["air_gap"]) and has_word(proposal, "conflict"):
            score += gate_config["conflict_bonus"]
        elif has_any(requirements, KEYWORDS["air_gap"]) and has_any(supporting_context, KEYWORDS["cloud"]):
            score -= gate_config["conflict_penalty"]
            findings.append(make_finding("Proposal", "high", "Proposal does not address a major requirement-architecture conflict.", "conflict"))

        if has_any(requirements, KEYWORDS["latency"]) and not has_any(proposal, KEYWORDS["latency"]):
            score -= gate_config["latency_penalty"]
            findings.append(make_finding("Proposal", "medium", "Proposal does not mention SLA or latency commitments for a latency-sensitive deal.", "sla"))

        if not any(has_word(proposal, token) for token in ["deliverables", "scope", "bom", "plan", "phases", "dashboard", "playbook", "summary"]):
            score -= gate_config["deliverables_penalty"]
            findings.append(make_finding("Proposal", "medium", "Scope or explicit deliverables are not clearly stated.", "deliverables"))

        for message, section, tag in POSITIVE_SIGNALS:
            if section == "proposal" and has_any(proposal, KEYWORDS[tag]):
                strengths.append(message)

        return clamp_score(score)

    def _cross_document_checks(
        self,
        requirements: str,
        proposal: str,
        supporting_context: str,
        findings: list[dict[str, str]],
        questions: list[str],
    ) -> None:
        # Log volume consistency — normalise TB/day and GB/day to GB for comparison
        volume_values_gb = [
            v for v in [
                extract_volume_gb_per_day(requirements),
                extract_volume_gb_per_day(proposal),
                extract_volume_gb_per_day(supporting_context),
            ]
            if v is not None
        ]
        if len(volume_values_gb) >= 2 and max(volume_values_gb) > 0:
            vol_deviation = (max(volume_values_gb) - min(volume_values_gb)) / max(volume_values_gb)
            if vol_deviation >= 0.30:
                findings.append(make_finding("Cross-check", "high", "Documented log-volume assumptions are inconsistent across artifacts.", "log volume"))
                questions.append("Which ingestion estimate is authoritative for sizing and proposal commitments?")

        # Retention period consistency
        retention_values = [
            v for v in [
                extract_retention_days(requirements),
                extract_retention_days(proposal),
                extract_retention_days(supporting_context),
            ]
            if v is not None
        ]
        if len(retention_values) >= 2 and max(retention_values) > 0:
            ret_deviation = (max(retention_values) - min(retention_values)) / max(retention_values)
            # >10% relative gap catches materially different periods (e.g. 90 days vs 1 year)
            # while tolerating minor wording differences (e.g. "1 year" ≈ "12 months")
            if ret_deviation >= 0.10:
                findings.append(make_finding("Cross-check", "medium", "Retention period is stated differently across deal artifacts.", "retention"))
                questions.append("Which retention period is the binding commitment for sizing, licensing, and contract?")

        # EPS consistency
        eps_values = [
            v for v in [
                extract_eps(requirements),
                extract_eps(proposal),
                extract_eps(supporting_context),
            ]
            if v is not None
        ]
        if len(eps_values) >= 2 and max(eps_values) > 0:
            deviation = (max(eps_values) - min(eps_values)) / max(eps_values)
            if deviation >= 0.30:
                findings.append(make_finding("Cross-check", "medium", "EPS or event-volume figures appear inconsistent across deal artifacts.", "eps"))
                questions.append("Which EPS estimate should be used as the authoritative baseline for sizing?")

        # Endpoint count consistency
        endpoint_counts = [
            v for v in [
                extract_endpoint_count(requirements),
                extract_endpoint_count(proposal),
                extract_endpoint_count(supporting_context),
            ]
            if v is not None
        ]
        if len(endpoint_counts) >= 2:
            max_count = max(endpoint_counts)
            min_count = min(endpoint_counts)
            # Flag only when the gap is both relatively large (>20%) and materially sized (>100 devices)
            if max_count >= min_count * 1.20 and (max_count - min_count) >= 100:
                findings.append(make_finding("Cross-check", "medium", "Endpoint or device count appears inconsistent across deal artifacts.", "endpoint"))
                questions.append("Which endpoint count is authoritative for licensing and scope commitments?")

        # Air-gap / cloud conflicts
        if has_word(requirements, "air-gapped") and has_word(proposal, "cloud"):
            findings.append(make_finding("Cross-check", "high", "Proposal language still references cloud dependencies for an air-gapped deal.", "conflict"))

        if has_word(requirements, "air-gapped") and has_word(supporting_context, "cloud"):
            findings.append(make_finding("Cross-check", "high", "Discovery notes reference cloud components for an air-gapped deal.", "conflict"))

        if "log sources list incomplete" in supporting_context:
            findings.append(make_finding("Cross-check", "medium", "Supporting notes indicate source inventory is incomplete, which weakens sizing and scope confidence.", "sources"))

    def _scope_terms(self, solution_families: list[str]) -> list[str]:
        terms = list(GENERAL_SCOPE_TERMS)
        for family in solution_families:
            for token in SOLUTION_FAMILY_KEYWORDS.get(family, []):
                if " " in token or len(token) > 3:
                    terms.append(token)
        return dedupe(terms)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


# Short alphabetic/numeric keywords (≤4 chars, e.g. "ha", "dr", "soc", "siem") need
# whole-word matching to prevent false substring hits such as "ha" matching "hardware"
# or "dr" matching "address". Longer / compound keywords use plain substring matching
# so plurals and hyphenated forms are still caught naturally.
_SHORT_ALPHA_RE = re.compile(r"^[a-z0-9]{1,4}$")


def _keyword_match(text: str, kw: str) -> bool:
    if _SHORT_ALPHA_RE.match(kw):
        return bool(re.search(r"\b" + kw + r"\b", text))
    return kw in text


def has_any(text: str, keywords: list[str]) -> bool:
    return any(_keyword_match(text, kw) for kw in keywords)


def has_word(text: str, term: str) -> bool:
    """Single-term equivalent of has_any. Use for direct one-off keyword checks."""
    return _keyword_match(text, term)


def vague_language(text: str, config: dict[str, object]) -> bool:
    settings = config["vague_language"]
    vague_terms = settings["terms"]
    minimum_words = settings["minimum_words"]
    minimum_detail_signals = settings["minimum_detail_signals"]
    structure_terms = settings["structure_terms"]
    detail_terms = settings["detail_terms"]
    word_count = len(text.split())
    structure_hits = sum(1 for term in structure_terms if _keyword_match(text, term))
    detail_hits = sum(1 for term in detail_terms if _keyword_match(text, term))
    has_digit = bool(re.search(r"\d", text))
    has_vague_term = any(_keyword_match(text, term) for term in vague_terms)
    if word_count < minimum_words and detail_hits < minimum_detail_signals and structure_hits < 2 and not has_digit:
        return True
    if has_vague_term and detail_hits < minimum_detail_signals and structure_hits < 2:
        return True
    return structure_hits == 0 and detail_hits == 0 and not has_digit


def make_finding(gate: str, severity: str, message: str, tag: str) -> dict[str, str]:
    return {"gate": gate, "severity": severity, "message": message, "tag": tag}


def extract_tb_per_day(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*tb/day", text)
    return float(match.group(1)) if match else None


def extract_volume_gb_per_day(text: str) -> float | None:
    """Extract log ingestion volume as GB/day, normalising TB/day when present.

    TB/day is converted to GB/day (×1000) so both units can be compared on
    the same scale.  Returns the first figure found; TB/day takes priority
    if both units appear in the same artifact.
    """
    tb = re.search(r"(\d+(?:\.\d+)?)\s*tb/day", text)
    if tb:
        return float(tb.group(1)) * 1000
    gb = re.search(r"(\d+(?:\.\d+)?)\s*gb/day", text)
    if gb:
        return float(gb.group(1))
    return None


def extract_retention_days(text: str) -> int | None:
    """Extract a retention period in days, anchored to 'retention' context.

    Only returns a value when a recognisable duration (days, months, years)
    falls within ~50 characters of the word 'retain' or 'retention', which
    avoids matching unrelated project timelines or trial periods.

    Handles:  '90-day retention', 'retention: 1 year', '12-month retention policy'
    """
    for anchor in re.finditer(r"\bretain|\bretent", text):
        start = max(0, anchor.start() - 50)
        end = min(len(text), anchor.end() + 50)
        window = text[start:end]
        year_m = re.search(r"(\d+)[-\s]*year", window)
        if year_m:
            return int(year_m.group(1)) * 365
        month_m = re.search(r"(\d+)[-\s]*month", window)
        if month_m:
            return int(month_m.group(1)) * 30
        day_m = re.search(r"(\d+)[-\s]*day", window)
        if day_m:
            return int(day_m.group(1))
    return None


def extract_endpoint_count(text: str) -> int | None:
    """Extract a device/endpoint count from text (e.g. '3,200 endpoints', '5000 workstations')."""
    match = re.search(r"(\d[\d,]*)\s*(?:endpoint|workstation|device|laptop|desktop)", text)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def extract_eps(text: str) -> float | None:
    """Extract events-per-second rate (e.g. '50k eps', '50,000 eps')."""
    match = re.search(r"(\d+(?:\.\d+)?)\s*k\s*eps|(\d[\d,]*(?:\.\d+)?)\s*eps", text)
    if not match:
        return None
    try:
        if match.group(1):            # "Xk eps" form
            return float(match.group(1)) * 1000
        return float(match.group(2).replace(",", ""))
    except ValueError:
        return None


def clamp_score(value: int) -> int:
    return max(0, min(100, value))


def status_from_score(score: int, config: dict[str, object] = DEFAULT_GATE_CONFIG) -> str:
    thresholds = config["score_thresholds"]
    if score >= thresholds["gate_pass"]:
        return "PASS"
    if score >= thresholds["gate_review"]:
        return "REVIEW"
    return "ATTENTION REQUIRED"


def overall_status_from_findings(score: int, findings: list[dict[str, str]], config: dict[str, object] = DEFAULT_GATE_CONFIG) -> str:
    thresholds = config["score_thresholds"]
    if any(finding["severity"] == "high" and "conflict" in finding["message"].lower() for finding in findings):
        return "ATTENTION REQUIRED"
    if score >= thresholds["overall_pass"]:
        return "PASS"
    if score >= thresholds["overall_pass_with_risk"]:
        return "PASS WITH RISK"
    if score >= thresholds["overall_rework"]:
        return "REWORK"
    return "ATTENTION REQUIRED"


def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item not in seen:
            output.append(item)
            seen.add(item)
    return output


def dedupe_findings(findings: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    output: list[dict[str, str]] = []
    for finding in findings:
        key = (finding["gate"], finding["message"])
        if key not in seen:
            output.append(finding)
            seen.add(key)
    gate_rank = {"Document Presence": 0, "Requirements": 1, "Architecture": 2, "Proposal": 3, "Cross-check": 4}
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(output, key=lambda item: (gate_rank.get(item["gate"], 9), severity_rank.get(item["severity"], 3), item["message"]))


def load_gate_config(path: Path) -> dict[str, object]:
    config = json.loads(json.dumps(DEFAULT_GATE_CONFIG))
    if not path.exists():
        return config
    try:
        user_config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return config
    merge_config(config, user_config)
    return config


def merge_config(base: dict[str, object], overrides: dict[str, object]) -> None:
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_config(base[key], value)
        else:
            base[key] = value
