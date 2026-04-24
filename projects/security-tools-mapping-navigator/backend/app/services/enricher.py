"""
enricher.py — Optional AI-assisted control ID enrichment.

When ANTHROPIC_API_KEY is set in backend/.env (or the environment), the /analyze
endpoint can pre-process rows whose current_control_id is blank by sending them to
the Claude API.  The model suggests the best-matching framework control ID from the
CONTROL_LIBRARY before the deterministic analyzer runs.

This resolves two common failure modes:
  1. Vague control_objective text — phrases like "prevent ransomware spreading
     laterally" that contain none of the expected keyword tokens.
  2. Niche or regional vendors not in ALIAS_TOKEN_MAP — tools whose product name
     alone cannot inject a capability token into the normalised text.

All enrichment is opt-in (frontend toggle).  If the API key is absent, not
installed, or the call fails, the function returns an empty list and analysis
proceeds deterministically as before.
"""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Dict, List, Optional

if TYPE_CHECKING:
    from ..models import ToolControlRow
    from ..services.analyzer import ControlDef

logger = logging.getLogger(__name__)


def is_enrichment_enabled() -> bool:
    """Return True if ANTHROPIC_API_KEY is configured and non-empty."""
    return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


def _build_control_menu(control_library: list) -> str:
    lines = []
    for ctrl in control_library:
        lines.append(
            f"  {ctrl.control_id}: {ctrl.name} "
            f"({ctrl.domain} domain, {ctrl.framework})"
        )
    return "\n".join(lines)


def _rows_to_json(rows: list) -> str:
    items = []
    for row in rows:
        items.append({
            "record_id": row.record_id,
            "tool_name": row.tool_name,
            "vendor": row.vendor or "",
            "product": row.product or "",
            "control_domain": row.control_domain,
            "control_objective": row.control_objective,
            "notes": row.notes or "",
        })
    return json.dumps(items, indent=2)


def enrich_rows(rows: list, control_library: list) -> List[str]:
    """
    Pre-process rows that have no current_control_id using the Claude API.

    Sends all eligible rows in a single batch call, receives a JSON array of
    {record_id, control_id} suggestions, and writes the suggestion back into
    row.current_control_id so the downstream analyzer can use direct-ID matching.

    Returns the list of record_ids that were enriched.  Modifies rows in-place.
    Silently returns [] on any failure so the caller always gets a usable result.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return []

    try:
        import anthropic  # noqa: PLC0415 — optional dependency
    except ImportError:
        logger.warning("AI enrichment skipped: anthropic package not installed.")
        return []

    # Only enrich rows that have no control ID already assigned
    blank_rows = [r for r in rows if not (r.current_control_id or "").strip()]
    if not blank_rows:
        return []

    valid_ids = {ctrl.control_id for ctrl in control_library}
    control_menu = _build_control_menu(control_library)
    rows_block = _rows_to_json(blank_rows)

    prompt = (
        "You are a cybersecurity controls expert.  Map each input row to the single "
        "best-matching framework control from the list below.\n\n"
        "CONTROL LIBRARY\n"
        f"{control_menu}\n\n"
        "INPUT ROWS (JSON — these rows have no control ID assigned yet)\n"
        f"{rows_block}\n\n"
        "TASK\n"
        "For each row, determine the single most likely framework control based on "
        "tool_name, vendor, product, control_domain, and control_objective.\n\n"
        "RULES\n"
        "1. Only use control IDs from the CONTROL LIBRARY above — never invent IDs.\n"
        "2. Prefer the control whose domain matches the row's control_domain; "
        "if no clean match exists, choose by objective.\n"
        "3. If you cannot determine a confident match, set control_id to null.\n"
        "4. Return a JSON array ONLY — no prose, no markdown code fences.\n\n"
        "OUTPUT FORMAT (strict JSON array)\n"
        '[\n  {"record_id": "...", "control_id": "NIST-PR.AA"},\n'
        '  {"record_id": "...", "control_id": null},\n'
        "  ...\n]"
    )

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw: str = message.content[0].text.strip()
    except Exception as exc:
        logger.error("AI enrichment API call failed: %s", exc)
        return []

    # Strip accidental markdown fences
    if raw.startswith("```"):
        parts = raw.split("\n", 1)
        raw = parts[1] if len(parts) > 1 else raw[3:]
        raw = raw.rsplit("```", 1)[0].strip()

    try:
        suggestions: list = json.loads(raw)
    except Exception as exc:
        logger.error(
            "AI enrichment: JSON parse failed (%s) — raw=%r", exc, raw[:300]
        )
        return []

    if not isinstance(suggestions, list):
        logger.error("AI enrichment: expected list, got %s", type(suggestions))
        return []

    # Build lookup map
    suggestion_map: Dict[str, Optional[str]] = {}
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        rid = item.get("record_id")
        cid = item.get("control_id")
        if rid:
            # Only accept IDs actually in the control library
            suggestion_map[str(rid)] = str(cid) if cid and str(cid) in valid_ids else None

    # Apply suggestions to the original rows list
    row_lookup = {r.record_id: r for r in rows}
    enriched: List[str] = []

    for record_id, suggested_id in suggestion_map.items():
        if not suggested_id:
            continue
        row = row_lookup.get(record_id)
        if row is None:
            continue
        # Guard: never overwrite a user-supplied control ID
        if (row.current_control_id or "").strip():
            continue
        row.current_control_id = suggested_id
        row.ai_enriched = True
        enriched.append(record_id)

    logger.info(
        "AI enrichment complete: %d/%d rows enriched.",
        len(enriched),
        len(blank_rows),
    )
    return enriched
