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


def _decode(contents: bytes) -> str:
    """Try common encodings in order. Excel on Windows typically saves CSV as cp1252."""
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return contents.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(
        "CSV file encoding could not be detected. Please re-save the file as UTF-8 "
        "(in Excel: File → Save As → CSV UTF-8)."
    )


def _is_hint_row(tool_name: str) -> bool:
    """Return True for the template hint/placeholder row exported from Excel."""
    lower = tool_name.lower()
    return lower.startswith("e.g.") or "[required]" in lower or "[recommended]" in lower


def parse_tool_control_csv(contents: bytes) -> List[ToolControlRow]:
    text = _decode(contents)
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV appears to be empty or missing headers.")

    # Strip visual decorators exported from the Excel template (e.g. "tool_name *" → "tool_name")
    reader.fieldnames = [f.rstrip(" *").strip() for f in reader.fieldnames]

    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    rows: List[ToolControlRow] = []
    for idx, row in enumerate(reader, start=2):
        cleaned = {k: (v or "").strip() for k, v in row.items()}

        tool_name = cleaned.get("tool_name", "")

        # Skip blank rows and the template hint/placeholder row
        if not tool_name or _is_hint_row(tool_name):
            continue

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
