import csv
import io
from typing import List

from ..models import ToolControlRow


REQUIRED_COLUMNS = [
    "tool_name",
    "control_domain",
    "control_objective",
]

NUMERIC_COLUMNS = ["effectiveness_score", "annual_cost_usd", "utilization_percent", "license_count"]

# Normalise common domain variants so every row maps to a canonical domain.
# Keys are lowercase; values are the canonical domain strings used by the analyzer.
DOMAIN_ALIASES: dict[str, str] = {
    "email":                "Data",
    "email security":       "Data",
    "epp":                  "Endpoint",
    "endpoint protection":  "Endpoint",
    "appsec":               "AppSec",
    "application":          "AppSec",
    "application security": "AppSec",
    "web application":      "AppSec",
    "api security":         "AppSec",
}


def _normalise_domain(raw: str) -> str:
    return DOMAIN_ALIASES.get(raw.lower().strip(), raw.strip())


def parse_tool_control_csv(contents: bytes) -> List[ToolControlRow]:
    text = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV appears to be empty or missing headers.")

    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    rows: List[ToolControlRow] = []
    for idx, row in enumerate(reader, start=2):
        cleaned = {k: (v or "").strip() for k, v in row.items()}
        if not cleaned.get("record_id"):
            cleaned["record_id"] = f"MAP-{idx}"

        cleaned["control_domain"] = _normalise_domain(cleaned.get("control_domain", ""))

        for numeric in NUMERIC_COLUMNS:
            value = cleaned.get(numeric, "")
            if value == "":
                cleaned[numeric] = 0
            else:
                try:
                    cleaned[numeric] = float(value)
                except ValueError as exc:
                    raise ValueError(f"Invalid numeric value for {numeric} on row {idx}: {value}") from exc

        rows.append(ToolControlRow(**cleaned))

    if not rows:
        raise ValueError("No tool/control mapping rows found in CSV.")

    return rows
