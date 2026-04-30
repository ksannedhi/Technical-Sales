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
    "compliance": ["compliance", "cbk", "nist", "iso", "regulatory"],
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
    ],
    "firewall_network": [
        "firewall", "fortigate", "palo alto", "checkpoint", "vpn", "nat", "segmentation", "internet edge", "perimeter",
    ],
    "email_security": [
        "email security", "secure email", "phishing", "m365", "office 365", "exchange", "mail flow", "email gateway", "mimecast", "proofpoint",
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
}
HA_QUESTION_DEFAULT = "How is high availability and failover defined for the primary system components?"

# Families where missing identity integration is a material gap worth flagging.
IDENTITY_SENSITIVE_FAMILIES = {"siem_log_mgmt", "iam_pam", "endpoint_xdr"}

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
    def __init__(self, roots: list[Path]) -> None:
        self.roots = roots
        self.deals = self._load()

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
        )
        architecture_score = self._architecture_gate(normalized["requirements"], supporting_context, detected_solution_families, findings, strengths, clarifying_questions)
        proposal_score = self._proposal_gate(normalized["requirements"], normalized["proposal"], supporting_context, findings, strengths, clarifying_questions)
        self._cross_document_checks(normalized["requirements"], normalized["proposal"], supporting_context, findings, clarifying_questions)
        self._solution_family_questions(detected_solution_families, normalized, supporting_context, clarifying_questions)

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

        dedup_questions = dedupe(clarifying_questions)[:6]
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
        family_scores: list[tuple[int, str]] = []
        for family, keywords in SOLUTION_FAMILY_KEYWORDS.items():
            # Require at least one hit in the requirements/RFP to consider a family in scope.
            # This prevents vendor credential boilerplate in the proposal from triggering
            # solution families unrelated to the actual deal.
            req_hits = sum(1 for kw in keywords if _keyword_match(requirements, kw))
            if req_hits == 0:
                continue
            total_hits = sum(1 for kw in keywords if _keyword_match(combined, kw))
            if total_hits >= 2:
                family_scores.append((total_hits, family))
        family_scores.sort(reverse=True)
        return [family for _, family in family_scores][:2]

    def _solution_family_questions(
        self,
        solution_families: list[str],
        artifacts: dict[str, str],
        supporting_context: str,
        questions: list[str],
    ) -> None:
        combined = " ".join([artifacts.get(section, "") for section in SECTION_NAMES] + [supporting_context])
        for family in solution_families:
            family_questions = SOLUTION_FAMILY_QUESTIONS.get(family, [])
            if not family_questions:
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
            else:
                findings.append(make_finding("Requirements", "medium", "Sizing input is missing or unclear, especially log volume or ingestion rate.", "log volume"))
                questions.append("What is the expected daily ingestion or event volume?")

            if has_any(requirements, KEYWORDS["retention"]):
                score += gate_config["retention_bonus"]
            elif has_any(supporting_context, KEYWORDS["retention"]):
                score += gate_config["retention_bonus"] // 2
            else:
                findings.append(make_finding("Requirements", "medium", "Retention requirement is not clearly stated.", "retention"))
                questions.append("What retention period is required?")

        if has_any(requirements, KEYWORDS["identity"]):
            score += gate_config["identity_bonus"]
        elif has_any(supporting_context, KEYWORDS["identity"]):
            score += gate_config["identity_bonus"] // 2
        elif any(f in solution_families for f in IDENTITY_SENSITIVE_FAMILIES):
            # Only flag missing identity as a gap for SIEM, IAM/PAM, and endpoint deals
            # where identity integration is a core delivery dependency.
            findings.append(make_finding("Requirements", "medium", "Identity or core integration dependencies are not clearly defined.", "identity"))
            questions.append("Which identity systems and core integrations must be supported?")

        if has_any(requirements, KEYWORDS["compliance"]):
            score += gate_config["compliance_bonus"]
        elif has_any(supporting_context, KEYWORDS["compliance"]):
            score += gate_config["compliance_bonus"] // 2
        elif has_word(requirements, "government") or has_word(requirements, "bank"):
            findings.append(make_finding("Requirements", "medium", "Compliance driver is implied but not made explicit.", "compliance"))

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
    ) -> int:
        gate_config = self.config["architecture"]
        combined = f"{requirements} {supporting_context}".strip()
        score = gate_config["baseline"]

        if has_any(combined, KEYWORDS["ha"]):
            score += gate_config["ha_bonus"]
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
        else:
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

        # FIX: was `token in proposal or supporting_context` — OR binds tighter, making
        # the condition always truthy when supporting_context is non-empty.
        if any(has_word(proposal, token) or has_word(supporting_context, token) for token in ["assumed", "tbd", "check policy"]):
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
        volume_values = [
            value
            for value in [
                extract_tb_per_day(requirements),
                extract_tb_per_day(proposal),
                extract_tb_per_day(supporting_context),
            ]
            if value is not None
        ]
        if len(volume_values) >= 2 and (max(volume_values) - min(volume_values)) >= 1.0:
            findings.append(make_finding("Cross-check", "high", "Documented log-volume assumptions are inconsistent across artifacts.", "log volume"))
            questions.append("Which ingestion estimate is authoritative for sizing and proposal commitments?")

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
