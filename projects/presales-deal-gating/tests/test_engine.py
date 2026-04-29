from pathlib import Path
import sys
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from file_ingest import EXTRACTION_CACHE, MAX_CACHE_ENTRIES, cache_put, extract_text_from_path, load_artifacts_from_zip
from pdg_mvp import PresalesGateEngine


class GateEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = PresalesGateEngine(ROOT / "data")
        cls.generated_dir = ROOT / "tests" / "_generated"
        cls.generated_dir.mkdir(exist_ok=True)

    @classmethod
    def tearDownClass(cls) -> None:
        for path in cls.generated_dir.glob("*"):
            path.unlink(missing_ok=True)

    def test_strong_bank_scores_as_pass(self) -> None:
        deal = self.engine.get_seed_deal("deal1_strong_bank")
        result = self.engine.analyze("strong bank", deal)
        self.assertEqual(result.overall_status, "PASS")
        self.assertGreaterEqual(result.overall_score, 80)

    def test_conflict_gov_flags_attention(self) -> None:
        deal = self.engine.get_seed_deal("deal3_conflict_gov")
        result = self.engine.analyze("conflict gov", deal)
        self.assertEqual(result.overall_status, "ATTENTION REQUIRED")
        messages = " ".join(item["message"] for item in result.findings)
        self.assertIn("air-gapped", messages.lower())

    def test_missing_inputs_raise_questions(self) -> None:
        result = self.engine.analyze("empty", {"requirements": "", "proposal": ""})
        self.assertTrue(result.missing_artifacts)
        self.assertTrue(result.clarifying_questions)

    def test_docx_and_pptx_ingestion(self) -> None:
        docx_path = self.generated_dir / "requirements.docx"
        pptx_path = self.generated_dir / "architecture.pptx"
        with zipfile.ZipFile(docx_path, "w") as zf:
            zf.writestr(
                "word/document.xml",
                '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Requirement</w:t></w:r></w:p></w:body></w:document>',
            )
        with zipfile.ZipFile(pptx_path, "w") as zf:
            zf.writestr(
                "ppt/slides/slide1.xml",
                '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hello Diagram</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
            )
        self.assertIn("Hello Requirement", extract_text_from_path(docx_path))
        self.assertIn("Hello Diagram", extract_text_from_path(pptx_path))

    def test_zip_bundle_routes_supporting_files(self) -> None:
        zip_path = self.generated_dir / "deal.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("deal/requirements.txt", "Need 1 TB/day and 90-day retention")
            zf.writestr("deal/architecture_diagram.md", "graph LR; A-->B")
            zf.writestr("deal/proposal.txt", "Timeline: 8 weeks")
            zf.writestr("deal/meeting_notes.txt", "Log sources list incomplete")
        artifacts = load_artifacts_from_zip(zip_path)
        self.assertIn("1 TB/day", artifacts["requirements"])
        self.assertIn("Timeline", artifacts["proposal"])
        self.assertIn("graph LR", artifacts["supporting_context"])
        self.assertIn("Log sources list incomplete", artifacts["supporting_context"])

    def test_solution_family_questions_become_more_specific(self) -> None:
        result = self.engine.analyze(
            "firewall renewal",
            {
                "requirements": "Customer needs firewall renewal for internet edge and VPN access across branches.",
                "proposal": "Phased firewall migration plan with deliverables and timeline.",
                "supporting_context": "Firewall HA pair is proposed at the perimeter with branch connectivity.",
            },
        )
        joined_questions = " ".join(result.clarifying_questions).lower()
        self.assertIn("firewall topology", joined_questions)

    def test_app_delivery_deal_does_not_require_log_volume(self) -> None:
        result = self.engine.analyze(
            "crown prince",
            {
                "requirements": "RFP covers load balancer Barracuda license, Palo Alto firewall license, WAF F5 license, and FortiGate firewall license renewal.",
                "proposal": "Technical proposal for load balancer, firewall, and WAF renewal with phased delivery and assumptions.",
                "supporting_context": "",
            },
        )
        requirement_messages = " ".join(
            item["message"] for item in result.findings if item["gate"] == "Requirements"
        ).lower()
        self.assertNotIn("log volume", requirement_messages)

    def test_detailed_requirements_are_not_flagged_as_vague_for_single_phrase(self) -> None:
        result = self.engine.analyze(
            "detailed siem",
            {
                "requirements": (
                    "The customer wants to improve visibility across SOC operations. "
                    "Requirements include 2 TB/day ingestion, 365 day retention, Entra ID integration, "
                    "AD enrichment, phased onboarding for 12 log sources, architecture review, and delivery scope "
                    "across primary and DR sites with named integrations and timeline expectations."
                ),
                "proposal": "Phased plan with deliverables, timeline, and executive summary.",
                "supporting_context": "HA cluster across two sites with DR failover and identity integration.",
            },
        )
        requirement_messages = " ".join(
            item["message"] for item in result.findings if item["gate"] == "Requirements"
        ).lower()
        self.assertNotIn("too vague", requirement_messages)

    def test_extraction_cache_is_bounded(self) -> None:
        EXTRACTION_CACHE.clear()
        for index in range(MAX_CACHE_ENTRIES + 5):
            cache_put(f"key-{index}", f"value-{index}")
        self.assertLessEqual(len(EXTRACTION_CACHE), MAX_CACHE_ENTRIES)


if __name__ == "__main__":
    unittest.main()
