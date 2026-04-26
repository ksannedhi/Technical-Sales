import json
from pathlib import Path
import shutil
import unittest
import uuid

from mvdc.engine import DecisionEngine

ROOT = Path(__file__).resolve().parents[1]

class DecisionEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = DecisionEngine(ROOT / "data")

    def test_named_product_comparison_works(self) -> None:
        result = self.engine.analyze("Compare QRadar SIEM against Splunk Enterprise Security.")
        self.assertEqual(result["mode"], "comparison")
        self.assertGreaterEqual(len(result["comparison_results"]), 2)
        self.assertIn("SIEM", result["solution_categories"])

    def test_comparison_with_separator_works(self) -> None:
        result = self.engine.analyze("Compare QRadar with Splunk.")
        self.assertEqual(result["mode"], "comparison")
        self.assertGreaterEqual(len(result["comparison_results"]), 2)
        vendors = {item["vendor"] for item in result["comparison_results"]}
        self.assertIn("IBM Security", vendors)
        self.assertIn("Splunk", vendors)

    def test_missing_named_product_fails_safely(self) -> None:
        result = self.engine.analyze("Compare FortiSIEM against QRadar SIEM.")
        self.assertEqual(result["mode"], "insufficient_data")
        self.assertIn("FortiSIEM", result["reason"])
        self.assertNotIn("hard constraints", result["reason"])

    def test_vendor_lookup_works(self) -> None:
        result = self.engine.analyze("Tell me about Varonis")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["lookup_type"], "vendor")
        self.assertEqual(result["vendor_profile"]["vendor"], "Varonis")

    def test_product_lookup_works(self) -> None:
        result = self.engine.analyze("You know Cortex?")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["lookup_type"], "product")
        self.assertEqual(result["vendor_profile"]["vendor"], "Palo Alto Networks")
        self.assertEqual(result["vendor_profile"]["products"][0]["product_name"], "Cortex XDR")

    def test_conversational_vendor_lookup_works(self) -> None:
        result = self.engine.analyze("What Varonis can do?")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["vendor_profile"]["vendor"], "Varonis")

    def test_conversational_vendor_lookup_with_can_provide_works(self) -> None:
        result = self.engine.analyze("What Varonis can provide?")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["vendor_profile"]["vendor"], "Varonis")

    def test_vendor_capability_question_with_named_category_routes_to_lookup(self) -> None:
        result = self.engine.analyze("Can Varonis provide DLP?")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["vendor_profile"]["vendor"], "Varonis")
        self.assertEqual(result["capability_summary"]["assessments"][0]["category"], "DLP")
        self.assertEqual(result["capability_summary"]["assessments"][0]["status"], "not_supported")

    def test_vendor_capability_question_with_supported_category_shows_product_support(self) -> None:
        result = self.engine.analyze("Can Varonis provide DSPM?")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["capability_summary"]["assessments"][0]["category"], "DSPM")
        self.assertEqual(result["capability_summary"]["assessments"][0]["status"], "product_supported")

    def test_partial_vendor_name_lookup_works(self) -> None:
        result = self.engine.analyze("Explain more about Palo Alto.")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["lookup_type"], "vendor")
        self.assertEqual(result["vendor_profile"]["vendor"], "Palo Alto Networks")

    def test_tell_me_all_about_vendor_lookup_works(self) -> None:
        result = self.engine.analyze("Tell me all about Palo Alto.")
        self.assertEqual(result["mode"], "lookup")
        self.assertEqual(result["lookup_type"], "vendor")
        self.assertEqual(result["vendor_profile"]["vendor"], "Palo Alto Networks")

    def test_common_product_typo_in_comparison_is_normalized(self) -> None:
        result = self.engine.analyze("What about ForiSIEM vs QRadar?")
        self.assertEqual(result["mode"], "insufficient_data")
        self.assertIn("FortiSIEM", result["reason"])
        self.assertNotIn("hard constraints", result["reason"])

    def test_data_security_routes_to_category(self) -> None:
        result = self.engine.analyze("What about data security?")
        # data_security now maps to both DSPM and DLP, both have products — stack mode fires
        self.assertEqual(result["mode"], "stack")
        self.assertIn("DSPM", result["solution_categories"])
        self.assertIn("DLP", result["solution_categories"])

    def test_ot_security_routes_to_category(self) -> None:
        result = self.engine.analyze("I want to secure my manufacturing plant. Can you recommend few ot security solutions?")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["OT Security"])

    def test_sase_category_explain(self) -> None:
        result = self.engine.analyze("What about SASE?")
        self.assertEqual(result["mode"], "category_explain")
        self.assertEqual(result["solution_categories"], ["SASE"])
        self.assertGreaterEqual(len(result["top_products"]), 1)

    def test_sase_recommendation_works_with_products(self) -> None:
        result = self.engine.analyze("Recommend SASE solutions.")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["SASE"])
        self.assertGreaterEqual(len(result["ranked_products"]), 1)

    def test_firewall_vendor_level_fallback_works(self) -> None:
        result = self.engine.analyze("Recommend firewall solutions.")
        self.assertEqual(result["mode"], "vendor_category")
        self.assertEqual(result["solution_categories"], ["Firewall"])
        self.assertGreaterEqual(len(result["ranked_vendors"]), 1)

    def test_cnapp_recommendation_works(self) -> None:
        result = self.engine.analyze("Recommend CNAPP options for cloud security.")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["CNAPP"])

    def test_iga_recommendation_works_with_products(self) -> None:
        result = self.engine.analyze("Recommend IGA tools for access reviews and joiner mover leaver workflows.")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["IGA"])
        self.assertGreaterEqual(len(result["ranked_products"]), 1)

    def test_region_only_query_gets_guided_clarification(self) -> None:
        result = self.engine.analyze("What solutions are available for the Middle East market?")
        self.assertEqual(result["mode"], "insufficient_data")
        self.assertEqual(result["constraints"]["region"], "Middle East")
        self.assertIn("I can use Middle East as a region constraint", result["reason"])
        self.assertTrue(any("Middle East" in item for item in result["suggested_queries"]))

    def test_onprem_compliance_and_integration_constraints_exclude_non_matching_products(self) -> None:
        data_dir = self._make_temp_data_dir()
        try:
            self._write_constraint_fixture(data_dir)
            engine = DecisionEngine(data_dir)

            result = engine.analyze("Recommend SIEM options with on-prem deployment, FedRAMP, and ServiceNow integration.")

            self.assertEqual(result["mode"], "single_category")
            self.assertEqual(result["top_recommendation"]["product_name"], "Anchor SIEM")
            self.assertEqual(result["constraints"]["deployment"], "On-Prem")
            self.assertEqual(result["constraints"]["compliance"], ["FedRAMP"])
            self.assertEqual(result["constraints"]["integrations"], ["ServiceNow"])
            excluded_names = {item["product_name"] for item in result["excluded_products"]}
            self.assertIn("Cloud SIEM", excluded_names)
            self.assertIn("Legacy SIEM", excluded_names)
        finally:
            shutil.rmtree(data_dir, ignore_errors=True)

    def test_constraint_driven_request_fails_honestly_when_every_product_is_excluded(self) -> None:
        data_dir = self._make_temp_data_dir()
        try:
            self._write_constraint_fixture(data_dir)
            engine = DecisionEngine(data_dir)

            result = engine.analyze("Recommend SIEM options with on-prem deployment, HIPAA, and Okta integration.")

            self.assertEqual(result["mode"], "insufficient_data")
            self.assertEqual(result["solution_categories"], ["SIEM"])
            self.assertGreaterEqual(len(result["excluded_products"]), 1)
            self.assertIn("hard constraints", result["reason"])
        finally:
            shutil.rmtree(data_dir, ignore_errors=True)

    def _make_temp_data_dir(self) -> Path:
        data_dir = ROOT / "tests_artifacts" / f"fixture_{uuid.uuid4().hex}"
        data_dir.mkdir(parents=True, exist_ok=False)
        return data_dir

    def _write_constraint_fixture(self, data_dir: Path) -> None:
        files = {
            "products.json": [
                {
                    "vendor": "Anchor",
                    "product": "Anchor SIEM",
                    "category": ["SIEM"],
                    "deployment": ["On-Prem", "Hybrid"],
                    "integration_support": ["ServiceNow", "Okta"],
                    "compliance": ["FedRAMP", "SOC 2"],
                    "pricing_tier": "medium",
                    "operational_complexity": "medium",
                },
                {
                    "vendor": "CloudCo",
                    "product": "Cloud SIEM",
                    "category": ["SIEM"],
                    "deployment": ["SaaS"],
                    "integration_support": ["ServiceNow"],
                    "compliance": ["FedRAMP"],
                    "pricing_tier": "low",
                    "operational_complexity": "low",
                },
                {
                    "vendor": "LegacySec",
                    "product": "Legacy SIEM",
                    "category": ["SIEM"],
                    "deployment": ["On-Prem"],
                    "integration_support": ["Okta"],
                    "compliance": ["SOC 2"],
                    "pricing_tier": "high",
                    "operational_complexity": "high",
                },
            ],
            "vendors.json": [
                {"vendor": "Anchor", "categories": ["SIEM"], "regions": ["Global"]},
                {"vendor": "CloudCo", "categories": ["SIEM"], "regions": ["Global"]},
                {"vendor": "LegacySec", "categories": ["SIEM"], "regions": ["Global"]},
            ],
            "problem_to_tool_mapping.json": {
                "network_visibility": ["SIEM"],
            },
            "categories.json": ["SIEM"],
            "vendor_feature_matrix.json": [
                {
                    "category": "SIEM",
                    "vendors": [
                        {"vendor": "Anchor", "features": ["UEBA", "SOAR", "Log analytics"]},
                        {"vendor": "CloudCo", "features": ["UEBA"]},
                        {"vendor": "LegacySec", "features": ["Log analytics"]},
                    ],
                }
            ],
            "scoring_weights.json": {
                "deployment_fit": 0.25,
                "feature_match": 0.25,
                "integration_fit": 0.15,
                "compliance_fit": 0.15,
                "cost_score": 0.1,
                "operational_complexity": 0.1,
            },
            "hard_exclusions.json": {
                "rules": [
                    "exclude_if_required_onprem_and_product_saas_only",
                    "exclude_if_required_compliance_missing",
                    "exclude_if_product_not_available_in_region",
                    "exclude_if_required_integration_missing",
                ]
            },
        }
        for name, payload in files.items():
            (data_dir / name).write_text(json.dumps(payload), encoding="utf-8")

if __name__ == "__main__":
    unittest.main()
