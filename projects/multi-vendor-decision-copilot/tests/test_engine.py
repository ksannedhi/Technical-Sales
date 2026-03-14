from pathlib import Path
import unittest

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

    def test_missing_named_product_fails_safely(self) -> None:
        result = self.engine.analyze("Compare FortiSIEM against QRadar SIEM.")
        self.assertEqual(result["mode"], "insufficient_data")
        self.assertIn("FortiSIEM", result["reason"])

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

    def test_data_security_routes_to_category(self) -> None:
        result = self.engine.analyze("What about data security?")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["DSPM"])
        self.assertEqual(result["top_recommendation"]["vendor"], "Varonis")

    def test_ot_security_routes_to_category(self) -> None:
        result = self.engine.analyze("I want to secure my manufacturing plant. Can you recommend few ot security solutions?")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["OT Security"])

    def test_sase_vendor_level_fallback_works(self) -> None:
        result = self.engine.analyze("What about SASE?")
        self.assertEqual(result["mode"], "vendor_category")
        self.assertEqual(result["solution_categories"], ["SASE"])
        self.assertGreaterEqual(len(result["ranked_vendors"]), 1)

    def test_cnapp_recommendation_works(self) -> None:
        result = self.engine.analyze("Recommend CNAPP options for cloud security.")
        self.assertEqual(result["mode"], "single_category")
        self.assertEqual(result["solution_categories"], ["CNAPP"])

    def test_iga_maps_but_fails_honestly_without_products(self) -> None:
        result = self.engine.analyze("Recommend IGA tools for access reviews and joiner mover leaver workflows.")
        self.assertEqual(result["mode"], "insufficient_data")
        self.assertEqual(result["solution_categories"], ["IGA"])

if __name__ == "__main__":
    unittest.main()
