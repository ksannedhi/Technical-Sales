from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SECTION_NAMES = ("requirements", "architecture", "proposal")

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
    "air_gap": ["air-gapped", "air gapped", "no cloud"],
    "cloud": ["cloud", "saas", "aws", "azure", "gcp"],
    "failover": ["failover", "redundant"],
    "latency": ["latency", "low latency", "sla"],
    "business_outcome": ["outcome", "business", "executive summary", "use case"],
    "bom": ["bom", "bill of materials"],
    "timeline": ["week", "weeks", "timeline", "phase", "phases"],
}

POSITIVE_SIGNALS = [
    ("Quantified sizing is present", "requirements", "log_volume"),
    ("Retention requirement is defined", "requirements", "retention"),
    ("Identity/integration detail is present", "requirements", "identity"),
    ("Architecture includes HA or clustering detail", "architecture", "ha"),
    ("Architecture includes DR/failover detail", "architecture", "dr"),
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

        findings: list[dict[str, str]] = []
        strengths: list[str] = []
        clarifying_questions: list[str] = []

        requirements_score = self._requirements_gate(normalized["requirements"], supporting_context, findings, strengths, clarifying_questions)
        architecture_score = self._architecture_gate(normalized, supporting_context, findings, strengths, clarifying_questions)
        proposal_score = self._proposal_gate(normalized, supporting_context, findings, strengths, clarifying_questions)
        self._cross_document_checks(normalized, supporting_context, findings, clarifying_questions)

        for missing in missing_artifacts:
            findings.append({
                "gate": "Document Presence",
                "severity": "high",
                "message": f"Missing {missing} artifact.",
                "tag": missing,
            })

        gate_scores = {
            "Requirements": clamp_score(requirements_score - len(missing_artifacts) * 5),
            "Architecture": clamp_score(architecture_score - (10 if "architecture" in missing_artifacts else 0)),
            "Proposal": clamp_score(proposal_score - (10 if "proposal" in missing_artifacts else 0)),
        }
        gate_statuses = {gate: status_from_score(score) for gate, score in gate_scores.items()}
        overall_score = round((gate_scores["Requirements"] * 0.35) + (gate_scores["Architecture"] * 0.4) + (gate_scores["Proposal"] * 0.25))
        overall_status = overall_status_from_findings(overall_score, findings)

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

    def _requirements_gate(
        self,
        requirements: str,
        supporting_context: str,
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
    ) -> int:
        score = 70 if requirements else 15
        if not requirements:
            questions.append("Can you provide a requirements or discovery summary before gating the deal?")
            return score

        if has_any(requirements, KEYWORDS["log_volume"]):
            score += 8
        else:
            findings.append(make_finding("Requirements", "medium", "Sizing input is missing or unclear, especially log volume or ingestion rate.", "log volume"))
            questions.append("What is the expected daily ingestion or event volume?")

        if has_any(requirements, KEYWORDS["retention"]):
            score += 6
        else:
            findings.append(make_finding("Requirements", "medium", "Retention requirement is not clearly stated.", "retention"))
            questions.append("What retention period is required?")

        if has_any(requirements, KEYWORDS["identity"]):
            score += 5
        else:
            findings.append(make_finding("Requirements", "medium", "Identity or core integration dependencies are not clearly defined.", "identity"))
            questions.append("Which identity systems and core integrations must be supported?")

        if has_any(requirements, KEYWORDS["compliance"]):
            score += 5
        elif "government" in requirements or "bank" in requirements:
            findings.append(make_finding("Requirements", "medium", "Compliance driver is implied but not made explicit.", "compliance"))

        if vague_language(requirements):
            score -= 18
            findings.append(make_finding("Requirements", "high", "Requirements are too vague for a reliable design review.", "vague"))

        if any(token in requirements or token in supporting_context for token in ["tbd", "not confirmed", "unclear", "incomplete"]):
            score -= 10
            findings.append(make_finding("Requirements", "medium", "Critical discovery inputs are still uncertain or incomplete.", "unclear"))

        if not any(token in requirements for token in ["scope", "endpoint", "server", "user", "soc", "network", "aws", "azure", "dc"]):
            score -= 12
            findings.append(make_finding("Requirements", "medium", "Scope boundaries are weak or missing.", "scope"))
            questions.append("What assets, users, and environments are in scope?")

        for message, section, tag in POSITIVE_SIGNALS[:4]:
            if section == "requirements" and has_any(requirements, KEYWORDS[tag]):
                strengths.append(message)

        return clamp_score(score)

    def _architecture_gate(
        self,
        artifacts: dict[str, str],
        supporting_context: str,
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
    ) -> int:
        architecture = artifacts["architecture"]
        requirements = artifacts["requirements"]
        score = 68 if architecture else 10
        if not architecture:
            questions.append("Can you provide architecture notes or a text description of the design?")
            return score

        if has_any(architecture, KEYWORDS["ha"]):
            score += 8
        else:
            findings.append(make_finding("Architecture", "high", "High availability design is missing or unclear.", "ha"))
            questions.append("How is high availability handled across collectors, nodes, or sites?")

        if has_any(architecture, KEYWORDS["dr"]) or has_any(architecture, KEYWORDS["failover"]):
            score += 8
        else:
            findings.append(make_finding("Architecture", "medium", "DR or failover design is not defined.", "dr"))

        if has_any(requirements, KEYWORDS["air_gap"]) and has_any(architecture, KEYWORDS["cloud"]):
            score -= 35
            findings.append(make_finding("Architecture", "high", "Architecture conflicts with an air-gapped or no-cloud requirement.", "air-gapped"))

        if has_any(requirements, KEYWORDS["latency"]) and not has_any(architecture, KEYWORDS["latency"]):
            score -= 14
            findings.append(make_finding("Architecture", "medium", "Low-latency requirement is present but latency handling is not described.", "latency"))

        if has_any(requirements, KEYWORDS["identity"]) and not has_any(architecture, KEYWORDS["identity"]):
            score -= 12
            findings.append(make_finding("Architecture", "medium", "Required identity or core integrations are not reflected in the design.", "identity"))

        if has_any(requirements, KEYWORDS["cloud"]) and not has_any(architecture, KEYWORDS["cloud"]):
            score -= 8
            findings.append(make_finding("Architecture", "medium", "Cloud ingestion path or cloud controls are not clearly addressed.", "cloud"))

        if "single node" in architecture:
            score -= 12
            findings.append(make_finding("Architecture", "medium", "Single-node architecture creates resilience risk for production use.", "single node"))

        if any(token in architecture or token in supporting_context for token in ["unclear", "not confirmed", "api access not confirmed"]):
            score -= 8
            findings.append(make_finding("Architecture", "medium", "Architecture depends on unresolved integration or API assumptions.", "api"))

        for message, section, tag in POSITIVE_SIGNALS:
            if section == "architecture" and has_any(architecture, KEYWORDS[tag]):
                strengths.append(message)

        return clamp_score(score)

    def _proposal_gate(
        self,
        artifacts: dict[str, str],
        supporting_context: str,
        findings: list[dict[str, str]],
        strengths: list[str],
        questions: list[str],
    ) -> int:
        proposal = artifacts["proposal"]
        requirements = artifacts["requirements"]
        architecture = artifacts["architecture"]
        score = 70 if proposal else 12
        if not proposal:
            questions.append("Can you provide proposal or SOW text before customer-ready gating?")
            return score

        if has_any(proposal, KEYWORDS["timeline"]):
            score += 6
        else:
            findings.append(make_finding("Proposal", "medium", "Timeline or phased delivery plan is missing.", "timeline"))

        if has_any(proposal, KEYWORDS["business_outcome"]):
            score += 4
        else:
            findings.append(make_finding("Proposal", "low", "Proposal focuses on solution delivery but not business value.", "business"))

        if "generic" in proposal:
            score -= 20
            findings.append(make_finding("Proposal", "medium", "Proposal content appears generic and not tailored to the deal.", "generic"))

        if any(token in proposal or supporting_context for token in ["assumed", "tbd", "check policy"]):
            score -= 8
            findings.append(make_finding("Proposal", "medium", "Proposal relies on unresolved assumptions that should be surfaced before customer submission.", "assumption"))

        if has_any(requirements, KEYWORDS["air_gap"]) and "conflict" in proposal:
            score += 3
        elif has_any(requirements, KEYWORDS["air_gap"]) and has_any(architecture, KEYWORDS["cloud"]):
            score -= 10
            findings.append(make_finding("Proposal", "high", "Proposal does not address a major requirement-architecture conflict.", "conflict"))

        if has_any(requirements, KEYWORDS["latency"]) and not has_any(proposal, KEYWORDS["latency"]):
            score -= 8
            findings.append(make_finding("Proposal", "medium", "Proposal does not mention SLA or latency commitments for a latency-sensitive deal.", "sla"))

        if not any(token in proposal for token in ["deliverables", "scope", "bom", "plan", "phases", "dashboard", "playbook", "summary"]):
            score -= 10
            findings.append(make_finding("Proposal", "medium", "Scope or explicit deliverables are not clearly stated.", "deliverables"))

        for message, section, tag in POSITIVE_SIGNALS:
            if section == "proposal" and has_any(proposal, KEYWORDS[tag]):
                strengths.append(message)

        return clamp_score(score)

    def _cross_document_checks(
        self,
        artifacts: dict[str, str],
        supporting_context: str,
        findings: list[dict[str, str]],
        questions: list[str],
    ) -> None:
        requirements = artifacts["requirements"]
        architecture = artifacts["architecture"]
        proposal = artifacts["proposal"]
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

        if "air-gapped" in requirements and "cloud" in proposal:
            findings.append(make_finding("Cross-check", "high", "Proposal language still references cloud dependencies for an air-gapped deal.", "conflict"))

        if "log sources list incomplete" in supporting_context:
            findings.append(make_finding("Cross-check", "medium", "Supporting notes indicate source inventory is incomplete, which weakens sizing and scope confidence.", "sources"))


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def has_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def vague_language(text: str) -> bool:
    vague_terms = ["improve visibility", "generic", "some endpoints", "standard deployment", "improve security"]
    bullet_count = text.count("-")
    return any(term in text for term in vague_terms) or len(text.split()) < 12 or bullet_count < 2


def make_finding(gate: str, severity: str, message: str, tag: str) -> dict[str, str]:
    return {"gate": gate, "severity": severity, "message": message, "tag": tag}


def extract_tb_per_day(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*tb/day", text)
    return float(match.group(1)) if match else None


def clamp_score(value: int) -> int:
    return max(0, min(100, value))


def status_from_score(score: int) -> str:
    if score >= 80:
        return "PASS"
    if score >= 60:
        return "REVIEW"
    return "ATTENTION REQUIRED"


def overall_status_from_findings(score: int, findings: list[dict[str, str]]) -> str:
    if any(finding["severity"] == "high" and "conflict" in finding["message"].lower() for finding in findings):
        return "ATTENTION REQUIRED"
    if score >= 82:
        return "PASS"
    if score >= 62:
        return "PASS WITH RISK"
    if score >= 45:
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
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(output, key=lambda item: (severity_rank.get(item["severity"], 3), item["gate"], item["message"]))
