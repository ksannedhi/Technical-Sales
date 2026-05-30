from __future__ import annotations

import html
import json
import os
import socket
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path
from wsgiref.simple_server import make_server, WSGIRequestHandler

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from file_ingest import extract_text_from_bytes, load_artifacts_from_zip_data
from presales_gate_engine import PresalesGateEngine


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", 8020))
_DEBUG = os.environ.get("PDG_DEBUG", "0") == "1"


def _tlog(msg: str) -> None:
    """Print timing/debug messages only when PDG_DEBUG=1."""
    if _DEBUG:
        print(msg)

engine = PresalesGateEngine(ROOT / "data")
SESSION_REVIEWS: list[dict[str, object]] = []
FLASH_MESSAGES: dict[str, list[str]] = {}
NEXT_REVIEW_ID = 1


class _QuietHandler(WSGIRequestHandler):
    """Suppress per-request access log lines from wsgiref.

    wsgiref writes a log line to stderr for every request.  On Windows,
    CMD.exe in Quick Edit Mode pauses all stdout/stderr when the user
    clicks inside the window — the server blocks mid-response until the
    user presses Escape.  Silencing the per-request logs removes that risk
    without losing our explicit [timing] prints.
    """

    def log_request(self, *args, **kwargs) -> None:  # type: ignore[override]
        pass

    def log_message(self, *args, **kwargs) -> None:  # type: ignore[override]
        pass


def application(environ, start_response):
    # Fast-path: browsers always fetch /favicon.ico; return empty 204 so
    # wsgiref doesn't run a full page render for an asset that doesn't exist.
    if environ.get("PATH_INFO") == "/favicon.ico":
        start_response("204 No Content", [("Cache-Control", "max-age=86400")])
        return [b""]

    method = environ.get("REQUEST_METHOD", "GET").upper()
    query = urllib.parse.parse_qs(environ.get("QUERY_STRING", ""))
    if method == "POST":
        request_started = time.time()
        form = parse_multipart(environ)
        _tlog(f"[timing] parse_multipart_ms={round((time.time() - request_started) * 1000, 2)}")
        state_started = time.time()
        state = build_page_state(query, form)
        _tlog(f"[timing] build_page_state_ms={round((time.time() - state_started) * 1000, 2)}")
        # Error with no analysis result — redirect to a clean GET so the form
        # resets completely.  Message is preserved via a special flash slot.
        if state.get("_redirect_error"):
            if state.get("messages"):
                FLASH_MESSAGES["_error"] = list(state["messages"])
            start_response("303 See Other", [
                ("Location", "/"),
                ("Cache-Control", "no-store"),
            ])
            return [b""]
        review_id = state.get("selected_review_id", "")
        if review_id:
            if state.get("messages"):
                FLASH_MESSAGES[review_id] = list(state["messages"])
            start_response("303 See Other", [
                ("Location", f"/?review={urllib.parse.quote(str(review_id))}"),
                ("Cache-Control", "no-store"),
            ])
            return [b""]
        body = render_page(state)
        start_response("200 OK", [
            ("Content-Type", "text/html; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ])
        return [body.encode("utf-8")]

    t0 = time.time()
    state = build_page_state(query, None)
    _tlog(f"[timing] GET build_page_state_ms={round((time.time() - t0) * 1000, 2)}")
    t1 = time.time()
    body = render_page(state)
    _tlog(f"[timing] GET render_page_ms={round((time.time() - t1) * 1000, 2)}")
    start_response("200 OK", [
        ("Content-Type", "text/html; charset=utf-8"),
        ("Cache-Control", "no-store"),
    ])
    return [body.encode("utf-8")]


def build_page_state(query: dict[str, list[str]], form: dict[str, object] | None) -> dict[str, object]:
    if (query.get("new", [""]) or [""])[0] == "1":
        return {
            "selected_review_id": "",
            "active_deal_name": "",
            "deal_name": "",
            "requirements": "",
            "proposal": "",
            "supporting_context": "",
            "messages": [],
            "result": None,
            "review_mode": "deal",
        }

    review_id = (query.get("review", [""]) or [""])[0]
    if review_id:
        saved = get_session_review(review_id)
        if saved:
            messages = consume_flash_messages(review_id)
            return {
                "selected_review_id": review_id,
                "active_deal_name": saved["deal_name"],
                "deal_name": "",
                "requirements": "",
                "proposal": "",
                "supporting_context": "",
                "messages": messages,
                "result": saved["result"],
                "rerun_from_id": "",
                "score_delta": saved.get("score_delta"),
                "review_mode": saved["result"].get("review_mode", "deal"),
            }

    # Re-run: pre-populate the form with a previous deal's artifacts so the user
    # can edit and re-submit without re-uploading or re-pasting the documents.
    rerun_id = (query.get("rerun", [""]) or [""])[0]
    if rerun_id:
        saved = get_session_review(rerun_id)
        if saved:
            saved_artifacts = saved.get("artifacts", {})
            return {
                "selected_review_id": rerun_id,
                "active_deal_name": saved["deal_name"],
                "deal_name": "",
                "requirements": saved_artifacts.get("requirements", ""),
                "proposal": saved_artifacts.get("proposal", ""),
                "supporting_context": saved_artifacts.get("supporting_context", ""),
                "messages": [
                    f"Artifacts from \"{saved['deal_name']}\" are pre-loaded below. "
                    "Edit as needed, enter a new deal name, then re-run."
                ],
                "result": saved["result"],
                # Carry the source review ID so the POST can compute a score delta.
                "rerun_from_id": rerun_id,
                "review_mode": saved["result"].get("review_mode", "deal"),
            }

    state = {
        "selected_review_id": "",
        "active_deal_name": "",
        "deal_name": "",
        "requirements": "",
        "proposal": "",
        "supporting_context": "",
        "messages": [],
        "result": None,
        "rerun_from_id": "",
        "score_delta": None,
        "review_mode": "deal",
    }
    if not form:
        # Consume any error flash stored by a failed POST (e.g. scanned PDF).
        error_messages = FLASH_MESSAGES.pop("_error", [])
        if error_messages:
            state["messages"] = error_messages
        return state

    delete_review_id = (form.get("delete_review_id") or "").strip()
    if delete_review_id:
        delete_session_review(delete_review_id)
        return {
            "selected_review_id": "",
            "active_deal_name": "",
            "deal_name": "",
            "requirements": "",
            "proposal": "",
            "supporting_context": "",
            "messages": ["Deal removed from this session."],
            "result": None,
        }

    rename_review_id = (form.get("rename_review_id") or "").strip()
    if rename_review_id:
        new_name = (form.get("rename_deal_name") or "").strip()
        renamed = rename_session_review(rename_review_id, new_name)
        if renamed:
            return {
                "selected_review_id": rename_review_id,
                "active_deal_name": renamed["deal_name"],
                "deal_name": "",
                "requirements": "",
                "proposal": "",
                "supporting_context": "",
                "messages": [f"Renamed session review to '{renamed['deal_name']}'."],
                "result": renamed["result"],
            }
        return state

    requested_deal_name = (form.get("deal_name") or state["deal_name"]).strip()
    if not requested_deal_name:
        state["messages"].append("Enter a deal name before running the review.")
        state["requirements"] = (form.get("requirements") or "").strip()
        state["proposal"] = (form.get("proposal") or "").strip()
        state["supporting_context"] = (form.get("supporting_context") or "").strip()
        return state

    deal_name = make_unique_deal_name(requested_deal_name)
    state["deal_name"] = deal_name
    state["active_deal_name"] = deal_name
    if deal_name != requested_deal_name:
        state["messages"].append(f"Deal name already existed, so this review was saved as '{deal_name}'.")

    artifacts = {
        "requirements": (form.get("requirements") or state["requirements"]).strip(),
        "proposal": (form.get("proposal") or state["proposal"]).strip(),
        "supporting_context": (form.get("supporting_context") or state["supporting_context"]).strip(),
    }
    deal_zip = form.get("deal_zip")
    if isinstance(deal_zip, dict) and deal_zip.get("filename"):
        import zipfile as _zipfile
        zip_warnings: list[str] = []
        zip_routing: dict[str, str] = {}
        try:
            zipped = load_artifacts_from_zip_data(deal_zip["content"], warnings=zip_warnings, routing=zip_routing)
        except _zipfile.BadZipFile:
            state["messages"].append(
                f"'{deal_zip['filename']}' could not be opened — the file does not appear to be a valid ZIP. "
                f"Re-download or re-compress the file and try again."
            )
            state["_redirect_error"] = True
            return state
        for key, value in zipped.items():
            artifacts[key] = merge_text(value, artifacts.get(key, ""))
        bucket_labels = {"requirements": "requirements", "proposal": "proposal", "supporting_context": "supporting context"}
        if zip_routing:
            route_parts = " · ".join(f"{fname} → {bucket_labels.get(b, b)}" for fname, b in zip_routing.items())
            state["messages"].append(f"ZIP loaded — {len(zip_routing)} file(s) routed: {route_parts}")
        else:
            state["messages"].append(f"Loaded deal ZIP: {deal_zip['filename']}")
        state["messages"].extend(zip_warnings)

    for key in ["requirements_file", "proposal_file", "supporting_file"]:
        upload = form.get(key)
        if isinstance(upload, dict) and upload.get("filename"):
            fname = upload["filename"]
            content = upload["content"]
            size_mb = len(content) / 1_000_000
            # Reject PDFs over 20 MB immediately — large PDFs are virtually always
            # scanned/image-heavy and pypdf would hang for 30-60 s trying to parse them.
            # Emit a clear message so the user knows to convert before uploading.
            if fname.lower().endswith(".pdf") and len(content) > 20_000_000:
                state["messages"].append(
                    f"{fname} is {size_mb:.0f} MB — PDFs over 20 MB are almost always "
                    f"scanned and contain no extractable text. Convert to DOCX or paste "
                    f"the text content directly into the textbox."
                )
                # Store a placeholder so the gate uses the baseline score rather than
                # the missing-artifact penalty — the document exists but is unreadable.
                # This mirrors what pypdf's scanned-PDF message did previously.
                target = key.replace("_file", "")
                if target == "supporting":
                    target = "supporting_context"
                placeholder = (
                    f"[{fname} ({size_mb:.0f} MB) could not be processed — "
                    f"PDF exceeds the 20 MB size limit. Convert to DOCX or paste the text directly.]"
                )
                artifacts[target] = merge_text(placeholder, artifacts.get(target, ""))
                continue
            extraction_started = time.time()
            text = extract_text_from_bytes(fname, content)
            _tlog(f"[timing] extract_{key}_ms={round((time.time() - extraction_started) * 1000, 2)} file={fname}")
            target = key.replace("_file", "")
            if target == "supporting":
                target = "supporting_context"
            warning = upload_warning(fname, text)
            if warning:
                state["messages"].append(warning)
            # Do not merge error markers into artifacts — scanned or unreadable PDFs
            # produce a bracketed error string that looks like content to the engine
            # but yields meaningless scores and generic questions unrelated to the
            # actual document.  Show the warning only; let the empty-artifact guard
            # below catch the case where nothing usable was provided.
            if not text.startswith("["):
                artifacts[target] = merge_text(text, artifacts.get(target, ""))

    # Guard: refuse to run analysis when no content was provided at all.
    # Uploads are already merged into artifacts by this point, so checking
    # artifact values is sufficient — empty text + no file = all empty strings.
    if not any(artifacts.values()):
        file_was_attempted = any(
            isinstance(form.get(k), dict) and form.get(k, {}).get("filename")
            for k in ["requirements_file", "proposal_file", "supporting_file"]
        )
        if file_was_attempted:
            state["messages"].append(
                "The uploaded file(s) could not be read — the PDF is likely scanned or image-based and contains no extractable text. "
                "Convert to DOCX (open in Word and save as .docx), or paste the document text directly into the form."
            )
        else:
            state["messages"].append("Paste or upload at least one document (requirements, proposal, or supporting context) before running the review.")
        state["_redirect_error"] = True
        state["deal_name"] = deal_name
        return state

    state.update(artifacts)
    review_mode = (form.get("review_mode") or "deal").strip()
    if review_mode not in ("rfp", "deal"):
        review_mode = "deal"
    state["review_mode"] = review_mode
    analyze_started = time.time()
    state["result"] = engine.analyze(deal_name=deal_name, artifacts=artifacts).to_dict()
    state["result"]["review_mode"] = review_mode
    # In RFP mode there is no proposal by design — strip the "provide proposal"
    # question that the engine adds when the proposal field is empty.
    if review_mode == "rfp":
        state["result"]["clarifying_questions"] = [
            q for q in state["result"].get("clarifying_questions", [])
            if "proposal or sow" not in q.lower() and "customer-ready gating" not in q.lower()
        ]
    _tlog(f"[timing] engine_analyze_ms={round((time.time() - analyze_started) * 1000, 2)}")

    # Enhancement 10 — re-run delta: if the user clicked Re-run on a prior deal,
    # compute the score change so we can show a delta banner on the results page.
    rerun_from_id = (form.get("rerun_from_id") or "").strip()
    score_delta: int | None = None
    if rerun_from_id:
        prior = get_session_review(rerun_from_id)
        if prior:
            old_score = prior["result"].get("overall_score", 0)
            new_score = state["result"]["overall_score"]
            score_delta = new_score - old_score

    state["selected_review_id"] = remember_session_review(deal_name, artifacts, state["result"], score_delta=score_delta)
    state["deal_name"] = ""
    state["requirements"] = ""
    state["proposal"] = ""
    state["supporting_context"] = ""
    return state


def parse_multipart(environ: dict[str, str]) -> dict[str, object]:
    read_started = time.time()
    content_length = int(environ.get("CONTENT_LENGTH") or "0")
    body = environ["wsgi.input"].read(content_length)
    _tlog(f"[timing] request_body_read_ms={round((time.time() - read_started) * 1000, 2)} bytes={len(body)}")
    content_type = environ.get("CONTENT_TYPE", "")
    boundary = extract_boundary(content_type)
    if not boundary:
        return {}
    values: dict[str, object] = {}
    delimiter = b"--" + boundary
    for chunk in body.split(delimiter):
        part = chunk.strip()
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].rstrip()
        if b"\r\n\r\n" not in part:
            continue
        header_block, payload = part.split(b"\r\n\r\n", 1)
        # Strip exactly the trailing CRLF that multipart format adds before the
        # next boundary — rstrip() would corrupt binary files (ZIP, DOCX, PDF)
        # by removing any trailing bytes that happen to be 0x0D or 0x0A.
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        headers = parse_part_headers(header_block)
        disposition = headers.get("content-disposition", "")
        name = extract_disposition_value(disposition, "name")
        if not name:
            continue
        filename = extract_disposition_value(disposition, "filename")
        if filename:
            values[name] = {"filename": filename, "content": payload}
        else:
            values[name] = payload.decode("utf-8", errors="ignore")
    return values


def render_delta_banner(score_delta: int | None) -> str:
    """Return an HTML banner showing score movement on a re-run, or empty string."""
    if score_delta is None:
        return ""
    if score_delta > 0:
        css = "delta-up"
        icon = "&#x2B06;"  # ⬆
        headline = f"Score improved by +{score_delta} points on this re-run."
        sub = "Keep addressing remaining findings to push the score higher."
    elif score_delta < 0:
        css = "delta-down"
        icon = "&#x2B07;"  # ⬇
        headline = f"Score dropped by {score_delta} points on this re-run."
        sub = "Review new or worsened findings — the deal may need rework before advancing."
    else:
        css = "delta-flat"
        icon = "&#x27A1;"  # ➡
        headline = "Score unchanged on this re-run."
        sub = "No net movement — check whether the updated artifacts addressed the open findings."
    return (
        f"<div class='delta-banner {css}'>"
        f"<span class='delta-icon'>{icon}</span>"
        f"<div class='delta-text'>{headline}<small>{sub}</small></div>"
        f"</div>"
    )


def render_page(state: dict[str, object]) -> str:
    result = state.get("result")
    session_history = render_session_history(state.get("selected_review_id", ""))
    selected_review_summary = ""
    delta_banner = render_delta_banner(state.get("score_delta"))

    result_html = ""
    if result:
        active_deal_name = state.get("active_deal_name", "") or "Untitled deal"
        overall_icon = readiness_icon(result["overall_score"])
        findings_download_href = build_findings_download_href(active_deal_name, result)
        is_rfp_mode = result.get("review_mode") == "rfp"

        if is_rfp_mode:
            # RFP Review mode — questions + HIGH architectural/requirements risk flags
            questions_items = result["clarifying_questions"]
            questions_html = "".join(f"<li>{escape(item)}</li>" for item in questions_items) or "<li>No specific questions generated — try adding more RFP text.</li>"
            req_score = result["gate_scores"]["Requirements"]
            # Surface HIGH severity findings from Architecture and Requirements gates so
            # the presales engineer sees critical risks before starting to write the proposal.
            rfp_risk_flags = [
                f for f in result["findings"]
                if f["severity"] == "high" and f["gate"] in ("Architecture", "Requirements")
            ]
            risk_flags_html = ""
            if rfp_risk_flags:
                flags_items = "".join(
                    f"<li><span class='badge badge-high'>HIGH</span> {escape(f['message'])}</li>"
                    for f in rfp_risk_flags
                )
                risk_flags_html = f"""
              <div class="rfp-questions-box" style="margin-top:1rem;">
                <h3>Risk Flags ({len(rfp_risk_flags)})</h3>
                <p class="copy-hint">Address these before writing the proposal — they signal structural gaps in the RFP.</p>
                <ul>{flags_items}</ul>
              </div>"""
            selected_review_summary = f"""
            <section class="panel selected-review-summary" id="selected-review-summary">
              <div class="selected-review-header">
                <div>
                  <div class="selected-review-label">RFP Review</div>
                  <h2>{escape(active_deal_name)}</h2>
                </div>
                <div class="selected-review-status">📋 {len(questions_items)} clarifying questions</div>
              </div>
              <div class="selected-review-metrics">
                <div class="mini-metric"><span>Requirements Coverage</span><strong>{req_score}/100</strong></div>
                <div class="mini-metric"><span>Questions for Customer</span><strong>{len(questions_items)}</strong></div>
                {f'<div class="mini-metric"><span>Risk Flags</span><strong style="color:#ef4444">{len(rfp_risk_flags)}</strong></div>' if rfp_risk_flags else ''}
              </div>
              <p class="selected-review-note">Scroll down for the full question list.</p>
            </section>
            """
            result_html = f"""
            <section class="panel">
              <div class="result-header">
                <h2>📋 RFP Review — {escape(active_deal_name)}</h2>
                <a class="download-link" href="{findings_download_href}" download="{escape(active_deal_name)}_rfp_review.txt">Download Questions</a>
              </div>
              <div class="rfp-questions-box">
                <h3>Questions for the Customer ({len(questions_items)})</h3>
                <p class="copy-hint">Copy these into your clarification response or share with the account team.</p>
                <ul>{questions_html}</ul>
              </div>{risk_flags_html}
            </section>
            """
        else:
            # Deal Review mode — score-first, all gates, findings + strengths + questions
            findings = render_findings_groups(result["findings"], always_show=["Requirements"])
            strengths = "".join(f"<li>{escape(item)}</li>" for item in result["strengths"]) or "<li>No standout strengths detected yet.</li>"
            questions = "".join(f"<li>{escape(item)}</li>" for item in result["clarifying_questions"]) or "<li>No follow-up questions needed.</li>"
            selected_review_summary = f"""
            <section class="panel selected-review-summary" id="selected-review-summary">
              <div class="selected-review-header">
                <div>
                  <div class="selected-review-label">Selected Deal</div>
                  <h2>{escape(active_deal_name)}</h2>
                </div>
                <div class="selected-review-status">{overall_icon} {escape(result['overall_status'])}</div>
              </div>
              <div class="selected-review-metrics">
                <div class="mini-metric"><span>Overall</span><strong>{result['overall_score']}/100</strong></div>
                <div class="mini-metric"><span>Requirements</span><strong>{result['gate_scores']['Requirements']}</strong></div>
                <div class="mini-metric"><span>Architecture</span><strong>{result['gate_scores']['Architecture']}</strong></div>
                <div class="mini-metric"><span>Proposal</span><strong>{result['gate_scores']['Proposal']}</strong></div>
              </div>
              <p class="selected-review-note">Scroll down for more details.</p>
            </section>
            """
            result_html = f"""
            <section class="panel">
              <div class="result-header">
                <h2>{overall_icon} Overall Readiness for {escape(active_deal_name)}: {escape(result['overall_status'])}</h2>
                <a class="download-link" href="{findings_download_href}" download="{escape(active_deal_name)}_review.txt">Download Findings</a>
              </div>
              {delta_banner}
              <p class="hint">Overall is a weighted score out of 100. Requirements, Architecture, and Proposal are gate scores that show how each area performed before the weighted roll-up.</p>
              <div class="scores">
                <div class="score"><span>Overall</span><strong>{result['overall_score']}/100</strong><small>Weighted readiness across all gates</small></div>
                <div class="score"><span>Requirements</span><strong>{result['gate_scores']['Requirements']}</strong><small>Input quality, scope, sizing, retention, integrations</small></div>
                <div class="score"><span>Architecture</span><strong>{result['gate_scores']['Architecture']}</strong><small>Design completeness, HA/DR, constraint alignment, contradictions</small></div>
                <div class="score"><span>Proposal</span><strong>{result['gate_scores']['Proposal']}</strong><small>Scope, deliverables, timeline, assumptions, customer readiness</small></div>
              </div>
              <div class="two-col">
                <div>
                  <h3>Findings</h3>
                  {findings}
                </div>
                <div>
                  <h3>Strengths</h3>
                  <ul class="strengths-list">{strengths}</ul>
                </div>
              </div>
              <h3>Clarifying Questions</h3>
              <ul>{questions}</ul>
            </section>
            """

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Presales Deal Reviewer</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #f5f1e8; color: #1f2933; }}
    .wrap {{ max-width: 1360px; margin: 0 auto; padding: 24px; }}
    h1, h2, h3 {{ margin-top: 0; }}
    .layout {{ display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; align-items: start; }}
    .main-grid {{ display: grid; grid-template-columns: 1.35fr 0.9fr; gap: 20px; align-items: start; }}
    .panel {{ background: #fffdf8; border: 1px solid #d8cfc2; border-radius: 16px; padding: 18px; box-shadow: 0 8px 20px rgba(42, 50, 60, 0.06); margin-bottom: 20px; }}
    label {{ display: block; font-weight: 600; margin: 12px 0 6px; }}
    textarea, input[type="text"], select {{ width: 100%; box-sizing: border-box; border: 1px solid #c7bfb0; border-radius: 10px; padding: 10px 12px; background: #fff; }}
    textarea {{ min-height: 150px; resize: vertical; }}
    .actions {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }}
    button {{ background: #8a4b16; color: white; border: 0; border-radius: 999px; padding: 11px 16px; font-weight: 700; cursor: pointer; }}
    .hint {{ color: #5f6b76; font-size: 0.94rem; line-height: 1.45; }}
    .scores {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }}
    .score {{ background: #f3ebe0; border-radius: 12px; padding: 14px; }}
    .score span {{ display: block; color: #6d5c48; font-size: 0.9rem; }}
    .score strong {{ font-size: 1.35rem; display: block; }}
    .score small {{ display: block; margin-top: 8px; color: #6d5c48; line-height: 1.35; }}
    .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
    pre {{ white-space: pre-wrap; word-break: break-word; background: #f7f3ec; padding: 14px; border-radius: 10px; }}
    ul {{ padding-left: 20px; }}
    .notice {{ margin-bottom: 14px; padding: 12px 14px; background: #efe2cf; border-radius: 12px; }}
    .history-list {{ list-style: none; padding-left: 0; margin: 0; display: grid; gap: 12px; }}
    .history-item {{ border: 1px solid #e4d7c8; border-radius: 12px; background: #f9f5ee; overflow: visible; position: relative; }}
    .history-item.active {{ border-color: #8a4b16; background: #f3ebe0; box-shadow: inset 0 0 0 1px rgba(138,75,22,0.12); }}
    .history-link {{ display: block; color: #1f2933; text-decoration: none; padding: 12px 48px 12px 12px; cursor: pointer; }}
    .history-link:hover {{ background: rgba(138, 75, 22, 0.06); }}
    .history-title {{ display: block; font-weight: 700; }}
    .history-meta {{ color: #6d5c48; font-size: 0.92rem; margin-top: 6px; }}
    .sticky {{ position: sticky; top: 20px; }}
    .history-menu-wrap {{ position: absolute; top: 8px; right: 8px; }}
    .history-menu-button {{ background: transparent; color: #6d5c48; border: 0; border-radius: 8px; padding: 6px 10px; font-size: 1.1rem; line-height: 1; cursor: pointer; }}
    .history-menu-button:hover {{ background: rgba(138, 75, 22, 0.08); }}
    .history-menu {{ position: absolute; top: 34px; right: 0; min-width: 120px; background: #fffdf8; border: 1px solid #d8cfc2; border-radius: 10px; box-shadow: 0 8px 20px rgba(42, 50, 60, 0.10); padding: 6px; display: none; z-index: 5; }}
    .history-menu.open {{ display: block; }}
    .history-menu button {{ width: 100%; text-align: left; background: transparent; color: #1f2933; border-radius: 8px; padding: 8px 10px; font-weight: 600; }}
    .history-menu button:hover {{ background: rgba(138, 75, 22, 0.08); }}
    .history-menu a.history-menu-action {{ display: block; width: 100%; text-align: left; background: transparent; color: #1f2933; border-radius: 8px; padding: 8px 10px; font-weight: 600; text-decoration: none; box-sizing: border-box; }}
    .history-menu a.history-menu-action:hover {{ background: rgba(138, 75, 22, 0.08); }}
    .finding-badge {{ display: inline-block; border-radius: 5px; padding: 1px 7px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.03em; margin-right: 5px; vertical-align: middle; }}
    .badge-high {{ background: #fde8e8; color: #8b1a1a; }}
    .badge-medium {{ background: #fef5d4; color: #7a5200; }}
    .badge-low {{ background: #eef4fb; color: #2d5282; }}
    .no-findings-note {{ color: #265c3a; font-size: 0.92rem; margin: 2px 0 10px 0; }}
    .strengths-list {{ list-style: none; padding-left: 0; }}
    .strengths-list li::before {{ content: "✓ "; color: #265c3a; font-weight: 700; }}
    .result-header {{ display: flex; justify-content: space-between; align-items: center; gap: 16px; }}
    .download-link {{ display: inline-block; white-space: nowrap; background: #8a4b16; color: white; text-decoration: none; border-radius: 999px; padding: 10px 14px; font-weight: 700; }}
    .download-link:hover {{ opacity: 0.92; }}
    .new-deal-link {{ display: inline-block; color: #8a4b16; font-weight: 700; text-decoration: none; margin: 4px 0 12px; }}
    .new-deal-link:hover {{ text-decoration: underline; }}
    .selected-review-summary {{ border-color: #c9893f; background: linear-gradient(135deg, #fff8eb 0%, #f6ead4 100%); }}
    .selected-review-header {{ display: flex; justify-content: space-between; align-items: center; gap: 16px; }}
    .selected-review-label {{ color: #6d5c48; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }}
    .selected-review-status {{ white-space: nowrap; font-weight: 700; color: #6d3d0d; }}
    .selected-review-metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }}
    .mini-metric {{ background: rgba(255,255,255,0.65); border-radius: 12px; padding: 12px; }}
    .mini-metric span {{ display: block; color: #6d5c48; font-size: 0.85rem; }}
    .mini-metric strong {{ display: block; font-size: 1.2rem; }}
    .selected-review-note {{ margin: 12px 0 0; color: #6d5c48; font-size: 0.92rem; }}
    .package-upload {{ margin-top: 20px; padding: 16px; border: 1px solid #c9893f; border-radius: 14px; background: linear-gradient(135deg, #fff3dd 0%, #f7e6c6 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55); }}
    .package-upload label {{ margin-top: 0; color: #6d3d0d; }}
    .package-kicker {{ display: inline-block; margin-bottom: 8px; padding: 4px 10px; border-radius: 999px; background: rgba(138, 75, 22, 0.12); color: #6d3d0d; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }}
    .package-upload .hint {{ margin: 0 0 12px; color: #6d5c48; }}
    .info-gates {{ display: grid; gap: 8px; margin-bottom: 4px; }}
    .info-gate {{ background: #f3ebe0; border-radius: 10px; padding: 10px 12px; }}
    .info-gate .hint {{ margin: 4px 0 0; font-size: 0.88rem; }}
    .info-gate-header {{ display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.93rem; }}
    .gate-weight {{ background: rgba(138,75,22,0.12); color: #6d3d0d; border-radius: 999px; padding: 2px 9px; font-size: 0.82rem; font-weight: 700; }}
    .score-bands {{ display: grid; gap: 5px; margin-top: 12px; }}
    .band {{ display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 9px; font-weight: 600; font-size: 0.88rem; }}
    .band-score {{ font-variant-numeric: tabular-nums; font-weight: 700; min-width: 38px; }}
    .band-pass {{ background: #e6f4ec; color: #265c3a; }}
    .band-risk {{ background: #fef5d4; color: #7a5400; }}
    .band-rework {{ background: #fdeaea; color: #872020; }}
    .info-where {{ display: grid; gap: 11px; }}
    .info-where-item {{ border-left: 3px solid #c9893f; padding-left: 10px; }}
    .info-where-label {{ font-weight: 700; font-size: 0.91rem; margin-bottom: 2px; }}
    .info-where-item .hint {{ margin: 3px 0 0; font-size: 0.88rem; }}
    .format-table {{ border-collapse: collapse; width: 100%; }}
    .format-table td {{ padding: 4px 6px; vertical-align: top; font-size: 0.88rem; line-height: 1.4; }}
    .fmt-ok {{ color: #265c3a; font-weight: 700; width: 16px; padding-right: 8px; }}
    .fmt-no {{ color: #872020; font-weight: 700; width: 16px; padding-right: 8px; }}
    .modal-backdrop {{ position: fixed; inset: 0; background: rgba(24, 32, 40, 0.45); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 20; }}
    .modal-backdrop.open {{ display: flex; }}
    .modal-card {{ width: min(460px, 100%); background: #fffdf8; border: 1px solid #d8cfc2; border-radius: 16px; box-shadow: 0 18px 40px rgba(24, 32, 40, 0.18); padding: 18px; }}
    .modal-card h3 {{ margin-bottom: 8px; }}
    .modal-actions {{ display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }}
    .ghost-button {{ background: transparent; color: #6d5c48; border: 1px solid #d8cfc2; }}
    .delta-banner {{ display: flex; align-items: center; gap: 14px; margin-bottom: 18px; padding: 14px 18px; border-radius: 14px; font-weight: 600; font-size: 0.97rem; }}
    .delta-up {{ background: #e6f4ec; border-left: 4px solid #265c3a; color: #1c4530; }}
    .delta-down {{ background: #fdeaea; border-left: 4px solid #872020; color: #5a1212; }}
    .delta-flat {{ background: #f3ebe0; border-left: 4px solid #b8975e; color: #4a3515; }}
    .delta-icon {{ font-size: 1.4rem; line-height: 1; }}
    .delta-text {{ flex: 1; }}
    .delta-text small {{ display: block; font-weight: 400; font-size: 0.88rem; margin-top: 2px; opacity: 0.8; }}
    .page-header {{ margin-bottom: 22px; }}
    .page-header h1 {{ margin-bottom: 6px; }}
    .page-tagline {{ margin: 0 0 14px; }}
    .page-mode-bar {{ display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; }}
    .mode-toggle {{ display: flex; gap: 8px; flex-shrink: 0; }}
    .mode-btn {{ background: #f3ebe0; color: #6d5c48; border: 1px solid #d8cfc2; border-radius: 999px; padding: 9px 18px; font-weight: 700; font-size: 0.92rem; cursor: pointer; }}
    .mode-btn.active {{ background: #8a4b16; color: white; border-color: #8a4b16; }}
    .mode-hint {{ margin: 0; flex: 1; min-width: 240px; }}
    .rfp-questions-box {{ background: #e8f5ee; border: 1px solid #b2d8c0; border-radius: 14px; padding: 16px 18px; margin-bottom: 18px; }}
    .rfp-questions-box h3 {{ color: #1c4530; margin-bottom: 4px; }}
    .rfp-questions-box .copy-hint {{ color: #265c3a; font-size: 0.88rem; margin: 8px 0 12px; font-style: italic; }}
    .rfp-questions-box li {{ margin-bottom: 8px; line-height: 1.5; }}
    .rfp-score {{ display: inline-block; background: #f3ebe0; border-radius: 10px; padding: 10px 16px; margin-bottom: 16px; }}
    .rfp-score span {{ color: #6d5c48; font-size: 0.9rem; }}
    .rfp-score strong {{ font-size: 1.25rem; margin-left: 6px; }}
    /* Loading overlay — shown while the server is processing a review */
    #loading-overlay {{
      display: none; position: fixed; inset: 0;
      background: rgba(255,253,248,0.88); z-index: 9999;
      flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      backdrop-filter: blur(2px);
    }}
    #loading-overlay.active {{ display: flex; }}
    .loading-spinner {{
      width: 52px; height: 52px;
      border: 5px solid #e5ddd0; border-top-color: #8a4b16;
      border-radius: 50%; animation: lo-spin 0.75s linear infinite;
    }}
    @keyframes lo-spin {{ to {{ transform: rotate(360deg); }} }}
    .loading-text {{ font-size: 1.05rem; color: #2a323c; font-weight: 700; }}
    .loading-hint {{ font-size: 0.88rem; color: #6b7280; }}
    /* Pulse on the submit button while loading */
    #review-button:disabled {{ opacity: 0.65; cursor: not-allowed; }}
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="loading-spinner"></div>
    <div class="loading-text">Analysing…</div>
    <div class="loading-hint">Large PDFs may take up to 30 seconds</div>
  </div>
  <div class="wrap">
    <div class="page-header">
      <h1>Presales Deal Reviewer</h1>
      <p class="hint page-tagline">Two modes — pick the one that fits where you are in the deal.</p>
      <div class="page-mode-bar">
        <div class="mode-toggle">
          <button type="button" class="mode-btn" data-mode="rfp" id="btn-rfp">RFP Review</button>
          <button type="button" class="mode-btn" data-mode="deal" id="btn-deal">Deal Review</button>
        </div>
        <p class="hint mode-hint" id="mode-hint-rfp">Customer has a clarification window open — upload the RFP to get targeted questions to send back and flag what needs confirming before you write a word of the proposal.</p>
        <p class="hint mode-hint" id="mode-hint-deal">Deal is in flight — upload your RFP, proposal draft, and discovery notes to get a readiness score and specific gaps to fix before internal review or submission.</p>
      </div>
    </div>
    <div class="layout">
      <aside class="sticky">
        <section class="panel">
          <h2>Deal History</h2>
          <p><a class="new-deal-link" href="/?new=1">+ New Deal</a></p>
          {session_history}
        </section>
      </aside>
      <div class="main-grid">
        <div>
          {selected_review_summary}
          <section class="panel">
          {"".join(f"<div class='notice'>{escape(message)}</div>" for message in state.get("messages", [])) if state.get("messages") else ""}
          <form id="review-form" method="post" action="/" enctype="multipart/form-data">
            <input type="hidden" name="rerun_from_id" value="{escape(str(state.get('rerun_from_id', '')))}">
            <input type="hidden" name="review_mode" id="review_mode_input" value="{escape(state.get('review_mode', 'deal'))}">

            <label for="deal_name">Deal name</label>
            <input id="deal_name" name="deal_name" type="text" placeholder="Enter a deal name" value="{escape(state['deal_name'])}" required>

            <label for="requirements" id="requirements-label">Requirements / RFP</label>
            <textarea id="requirements" name="requirements">{escape(state['requirements'])}</textarea>
            <label>Optional requirements upload</label>
            <input name="requirements_file" type="file" accept=".txt,.md,.docx,.pdf">

            <div id="proposal-section">
              <label for="proposal">Proposal / SOW Summary</label>
              <textarea id="proposal" name="proposal">{escape(state['proposal'])}</textarea>
              <label>Optional proposal upload</label>
              <input name="proposal_file" type="file" accept=".txt,.md,.docx,.pdf">
            </div>

            <div id="supporting-section">
              <label for="supporting_context">Discovery Notes &amp; Supporting Context</label>
              <p class="hint" style="margin:4px 0 8px">Paste meeting notes, call summaries, sizing worksheets, or any context that does not fit the formal requirements or proposal docs. Architecture signals found here (HA, DR, integrations, constraints) will supplement the requirements gate and inform the architecture assessment.</p>
              <textarea id="supporting_context" name="supporting_context">{escape(state['supporting_context'])}</textarea>
              <label>Optional supporting context upload</label>
              <input name="supporting_file" type="file" accept=".txt,.md,.docx,.pptx,.pdf">
            </div>

            <div id="zip-section" class="package-upload">
              <div class="package-kicker">Fastest Path On This Laptop</div>
              <label>Upload one deal package ZIP</label>
              <p class="hint">Use this when you already have the deal artifacts together. One ZIP can replace the individual uploads for requirements, proposal, and supporting notes.</p>
              <input name="deal_zip" type="file" accept=".zip">
            </div>

            <div class="actions">
              <button id="review-button" type="submit">Run Gate Review</button>
            </div>
          </form>
          </section>
        </div>
        <div>
          <section class="panel" id="panel-score-reference">
            <h2>Score Reference</h2>
            <div class="info-gates">
              <div class="info-gate">
                <div class="info-gate-header"><span>Requirements</span><span class="gate-weight">25%</span></div>
                <p class="hint">Scope clarity, sizing, retention, integrations, and discovery completeness.</p>
              </div>
              <div class="info-gate">
                <div class="info-gate-header"><span>Architecture</span><span class="gate-weight">25%</span></div>
                <p class="hint">HA/DR coverage, design constraints, and technical alignment with requirements.</p>
              </div>
              <div class="info-gate">
                <div class="info-gate-header"><span>Proposal</span><span class="gate-weight">50%</span></div>
                <p class="hint">Deliverable scope, timeline, assumptions, and executive readiness.</p>
              </div>
            </div>
            <div class="score-bands">
              <div class="band band-pass"><span class="band-score">80–100</span><span>PASS — ready to proceed</span></div>
              <div class="band band-risk"><span class="band-score">60–79</span><span>PASS WITH RISK — review gaps first</span></div>
              <div class="band band-rework"><span class="band-score">0–59</span><span>REWORK — material blockers found</span></div>
            </div>
          </section>
          <section class="panel" id="panel-rfp-guide" style="display:none;">
            <h2>RFP Review Guide</h2>
            <div class="info-where">
              <div class="info-where-item">
                <div class="info-where-label">What this mode does</div>
                <p class="hint">Reads the RFP, detects solution families, and generates targeted questions to submit to the customer during the clarification window.</p>
              </div>
              <div class="info-where-item">
                <div class="info-where-label">Questions for the customer</div>
                <p class="hint">Tailored per detected solution family — sizing baselines, scope boundaries, compliance frameworks, integration dependencies.</p>
              </div>
              <div class="info-where-item">
                <div class="info-where-label">Risk Flags</div>
                <p class="hint">HIGH severity architectural and requirements gaps that must be resolved before you start writing — missing HA design, air-gap conflicts, sparse or unreadable RFP content.</p>
              </div>
              <div class="info-where-item">
                <div class="info-where-label">When done</div>
                <p class="hint">Once the customer responds and you have a proposal draft, switch to Deal Review mode for a full readiness score.</p>
              </div>
            </div>
          </section>
          <section class="panel" id="panel-what-goes-where">
            <h2>What Goes Where</h2>
            <div class="info-where">
              <div class="info-where-item">
                <div class="info-where-label">Requirements / Discovery Notes</div>
                <p class="hint">RFPs, scope documents, customer discovery notes, data sheets — what the customer needs and why.</p>
              </div>
              <div class="info-where-item">
                <div class="info-where-label">Proposal / SOW</div>
                <p class="hint">Technical proposals, statements of work, solution summaries, or deliverable outlines.</p>
              </div>
              <div class="info-where-item">
                <div class="info-where-label">Supporting Context</div>
                <p class="hint">Meeting notes, call summaries, sizing worksheets. HA, DR, and integration signals here count toward the architecture assessment.</p>
              </div>
            </div>
          </section>
          <section class="panel">
            <h2>File Formats</h2>
            <table class="format-table">
              <tr><td class="fmt-ok">✓</td><td>.txt &nbsp; .md &nbsp; .docx &nbsp; .pptx &nbsp; .zip</td></tr>
              <tr><td class="fmt-ok">✓</td><td>.pdf — text-based only; scanned or image-heavy PDFs extract poorly</td></tr>
              <tr><td class="fmt-no">✗</td><td>.xlsx &nbsp; .xls &nbsp; .csv &nbsp; .json &nbsp; .doc &nbsp; .ppt &nbsp; .rtf &nbsp; .html</td></tr>
            </table>
            <p class="hint" style="margin-top:12px">💡 Tip: drop all deal artifacts into a folder, zip it, and upload as a deal package for the fastest path.</p>
          </section>
        </div>
      </div>
    </div>
    <div id="result-section">{result_html}</div>
    <form id="delete-session-form" method="post" action="/" enctype="multipart/form-data" style="display:none;">
      <input type="hidden" name="delete_review_id" id="delete_review_id">
    </form>
    <div class="modal-backdrop" id="rename-modal" aria-hidden="true">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
        <h3 id="rename-modal-title">Rename deal</h3>
        <p class="hint">Update the name shown in Deal History for this session.</p>
        <form id="rename-session-form" method="post" action="/" enctype="multipart/form-data">
          <input type="hidden" name="rename_review_id" id="rename_review_id">
          <label for="rename_deal_name">Deal name</label>
          <input type="text" name="rename_deal_name" id="rename_deal_name" required>
          <div class="modal-actions">
            <button type="button" class="ghost-button" id="rename-cancel-button">Cancel</button>
            <button type="submit">Save name</button>
          </div>
        </form>
      </div>
    </div>
  </div>
<script>
  const reviewForm = document.getElementById("review-form");
  const reviewButton = document.getElementById("review-button");
  if (reviewForm && reviewButton) {{
    reviewForm.addEventListener("submit", () => {{
      reviewButton.disabled = true;
      reviewButton.textContent = "Analysing…";
      document.body.style.cursor = "wait";
      const overlay = document.getElementById("loading-overlay");
      if (overlay) overlay.classList.add("active");
    }});
  }}
  // Mode toggle
  const reviewModeInput = document.getElementById("review_mode_input");
  const proposalSection = document.getElementById("proposal-section");
  const supportingSection = document.getElementById("supporting-section");
  const zipSection = document.getElementById("zip-section");
  const modeHintRfp = document.getElementById("mode-hint-rfp");
  const modeHintDeal = document.getElementById("mode-hint-deal");
  const reqLabel = document.getElementById("requirements-label");
  function setReviewMode(mode, isInit = false) {{
    if (!reviewModeInput) return;
    reviewModeInput.value = mode;
    const isRfp = mode === "rfp";
    document.querySelectorAll(".mode-btn").forEach(btn => {{
      btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
    }});
    if (proposalSection) proposalSection.style.display = isRfp ? "none" : "";
    if (supportingSection) supportingSection.style.display = isRfp ? "none" : "";
    if (zipSection) zipSection.style.display = isRfp ? "none" : "";
    if (modeHintRfp) modeHintRfp.style.display = isRfp ? "" : "none";
    if (modeHintDeal) modeHintDeal.style.display = isRfp ? "none" : "";
    if (reqLabel) reqLabel.textContent = isRfp ? "Requirements / RFP" : "Requirements / Discovery Notes";
    if (reviewButton) reviewButton.textContent = isRfp ? "Run RFP Review" : "Run Gate Review";
    const scorePanel = document.getElementById("panel-score-reference");
    const rfpGuide = document.getElementById("panel-rfp-guide");
    const whatGoesWhere = document.getElementById("panel-what-goes-where");
    if (scorePanel) scorePanel.style.display = isRfp ? "none" : "";
    if (rfpGuide) rfpGuide.style.display = isRfp ? "" : "none";
    if (whatGoesWhere) whatGoesWhere.style.display = isRfp ? "none" : "";
    // Hide stale result from a previous run when the user switches mode —
    // the old result belongs to the other mode and would be misleading.
    // Only hide a stale result when the user actively switches mode —
    // not on the initial page-load call where the result belongs to the current mode.
    if (!isInit) {{
      const resultSection = document.getElementById("result-section");
      if (resultSection) resultSection.style.display = "none";
      const summary = document.getElementById("selected-review-summary");
      if (summary) summary.style.display = "none";
    }}
  }}
  document.querySelectorAll(".mode-btn").forEach(btn => {{
    btn.addEventListener("click", () => setReviewMode(btn.getAttribute("data-mode")));
  }});
  // Initialise from server-rendered hidden input value
  setReviewMode(reviewModeInput ? reviewModeInput.value : "deal", true);
  // Auto-scroll to results when the page loads with an active review
  const _rs = document.getElementById("result-section");
  if (_rs && _rs.children.length > 0) {{
    setTimeout(() => _rs.scrollIntoView({{ behavior: "smooth", block: "start" }}), 120);
  }}
  document.querySelectorAll("[data-review-id]").forEach((link) => {{
    link.addEventListener("contextmenu", (event) => {{
      event.preventDefault();
    }});
  }});
  document.querySelectorAll("[data-menu-button]").forEach((button) => {{
    button.addEventListener("click", (event) => {{
      event.preventDefault();
      event.stopPropagation();
      const targetId = button.getAttribute("data-menu-button");
      document.querySelectorAll(".history-menu").forEach((menu) => {{
        if (menu.id === targetId) {{
          menu.classList.toggle("open");
        }} else {{
          menu.classList.remove("open");
        }}
      }});
    }});
  }});
  const renameModal = document.getElementById("rename-modal");
  const renameReviewIdInput = document.getElementById("rename_review_id");
  const renameDealNameInput = document.getElementById("rename_deal_name");
  const renameCancelButton = document.getElementById("rename-cancel-button");
  const closeRenameModal = () => {{
    if (!renameModal) return;
    renameModal.classList.remove("open");
    renameModal.setAttribute("aria-hidden", "true");
  }};
  const openRenameModal = (reviewId, dealName) => {{
    if (!renameModal || !renameReviewIdInput || !renameDealNameInput) return;
    renameReviewIdInput.value = reviewId;
    renameDealNameInput.value = dealName || "";
    renameModal.classList.add("open");
    renameModal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {{
      renameDealNameInput.focus();
      renameDealNameInput.select();
    }}, 0);
  }};
  document.querySelectorAll("[data-rename-review]").forEach((button) => {{
    button.addEventListener("click", (event) => {{
      event.preventDefault();
      const reviewId = button.getAttribute("data-rename-review");
      const currentName = button.getAttribute("data-deal-name") || "";
      openRenameModal(reviewId, currentName);
    }});
  }});
  document.querySelectorAll("[data-delete-review]").forEach((button) => {{
    button.addEventListener("click", (event) => {{
      event.preventDefault();
      const reviewId = button.getAttribute("data-delete-review");
      const dealName = button.getAttribute("data-deal-name") || "this deal";
      const shouldDelete = window.confirm(`Delete "${{dealName}}" from this session?`);
      if (!shouldDelete) return;
      document.getElementById("delete_review_id").value = reviewId;
      document.getElementById("delete-session-form").submit();
    }});
  }});
  document.addEventListener("click", () => {{
    document.querySelectorAll(".history-menu").forEach((menu) => menu.classList.remove("open"));
  }});
  if (renameCancelButton) {{
    renameCancelButton.addEventListener("click", () => closeRenameModal());
  }}
  if (renameModal) {{
    renameModal.addEventListener("click", (event) => {{
      if (event.target === renameModal) {{
        closeRenameModal();
      }}
    }});
  }}
  document.addEventListener("keydown", (event) => {{
    if (event.key === "Escape") {{
      closeRenameModal();
    }}
  }});
  const selectedSummary = document.getElementById("selected-review-summary");
  if (selectedSummary && window.location.search.includes("review=")) {{
    selectedSummary.scrollIntoView({{ behavior: "smooth", block: "start" }});
  }}
</script>
</body>
</html>"""


def escape(value: str) -> str:
    return html.escape(value or "")


def merge_text(primary: str, secondary: str) -> str:
    primary = (primary or "").strip()
    secondary = (secondary or "").strip()
    if primary and secondary:
        return primary + "\n\n" + secondary
    return primary or secondary


def upload_warning(filename: str, text: str) -> str:
    lower = filename.lower()
    # DOCX files that contain mostly scanned images yield very few words —
    # the XML extractor only reads typed text nodes, not embedded image content.
    # Flag when a DOCX produces fewer than 80 words so the reviewer knows the
    # source document is image-heavy, not that the tool failed.
    if lower.endswith(".docx"):
        if len(text.split()) < 80:
            return (
                f"'{filename}' produced very little text — the document appears to contain "
                f"mostly scanned or image-based pages. Paste the relevant text directly into "
                f"the form, or use a text-based PDF or typed DOCX for reliable extraction."
            )
        return ""
    if not lower.endswith(".pdf"):
        return ""
    if text.startswith("[PDF too large"):
        return f"'{filename}' exceeds the size limit. Upload the .docx version instead, or paste the text directly into the form."
    if text.startswith("[PDF parsing timed out"):
        return f"'{filename}' took too long to parse. Upload the .docx version instead for better reliability."
    if text.startswith("[PDF parsing unavailable") or text.startswith("[Could not parse"):
        return f"PDF extraction was not available for '{filename}'. Upload the .docx version for best results."
    if "Only the first" in text:
        import re as _re
        m = _re.search(r"Only the first (\d+) of (\d+) pages were reviewed", text)
        if m:
            read_pages, total_pages = m.group(1), m.group(2)
            return (
                f"'{filename}' has {total_pages} pages — the first {read_pages} were reviewed. "
                f"If appendices or later sections carry key requirements, upload the .docx version for full coverage."
            )
        return f"'{filename}' is long — only the first pages were reviewed. Upload the .docx version for full coverage."
    if len(text.strip()) < 120:
        return f"'{filename}' produced very little extractable text. If this is a scanned or image-heavy PDF, upload the .docx version instead."
    return ""


def readiness_icon(score: int) -> str:
    if score >= 80:
        return "\U0001F7E2"
    if score >= 60:
        return "\U0001F7E1"
    return "\U0001F534"


def render_findings_groups(findings: list[dict[str, str]], always_show: list[str] | None = None) -> str:
    if not findings and not always_show:
        return "<p>No material findings.</p>"
    grouped: dict[str, list[dict[str, str]]] = {}
    for item in findings:
        grouped.setdefault(item["gate"], []).append(item)
    ordered_gates = ["Document Presence", "Requirements", "Architecture", "Proposal", "Cross-check"]
    sections: list[str] = []
    for gate in ordered_gates:
        gate_findings = grouped.get(gate, [])
        if not gate_findings:
            if always_show and gate in always_show:
                sections.append(f"<h4>{escape(gate)}</h4><p class='hint no-findings-note'>✓ No gaps detected.</p>")
            continue
        items = "".join(
            f"<li><span class='finding-badge badge-{escape(item['severity'].lower())}'>{escape(item['severity'].upper())}</span>{escape(item['message'])}</li>"
            for item in gate_findings
        )
        sections.append(f"<h4>{escape(gate)}</h4><ul>{items}</ul>")
    return "".join(sections) or "<p>No material findings.</p>"


def extract_boundary(content_type: str) -> bytes:
    marker = "boundary="
    if marker not in content_type:
        return b""
    boundary = content_type.split(marker, 1)[1].strip().strip('"')
    return boundary.encode("utf-8")


def parse_part_headers(header_block: bytes) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in header_block.decode("utf-8", errors="ignore").split("\r\n"):
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    return headers


def extract_disposition_value(disposition: str, key: str) -> str:
    token = f'{key}="'
    if token not in disposition:
        return ""
    tail = disposition.split(token, 1)[1]
    return tail.split('"', 1)[0]


def build_findings_download_href(deal_name: str, result: dict[str, object]) -> str:
    is_rfp = result.get("review_mode") == "rfp"
    if is_rfp:
        lines = [
            f"RFP Review: {deal_name}",
            "",
            "Questions for Customer:",
        ]
        if result["clarifying_questions"]:
            lines.extend(f"{i+1}. {item}" for i, item in enumerate(result["clarifying_questions"]))
        else:
            lines.append("- No specific questions generated.")
        rfp_flags = [
            f for f in result.get("findings", [])
            if f["severity"] == "high" and f["gate"] in ("Architecture", "Requirements")
        ]
        if rfp_flags:
            lines += ["", "Risk Flags (address before writing the proposal):"]
            lines.extend(f"- [HIGH] {f['message']}" for f in rfp_flags)
    else:
        lines = [
            f"Deal: {deal_name}",
            f"Overall Readiness: {result['overall_status']} ({result['overall_score']}/100)",
            f"Requirements: {result['gate_scores']['Requirements']}",
            f"Architecture: {result['gate_scores']['Architecture']}",
            f"Proposal: {result['gate_scores']['Proposal']}",
            "",
            "Findings:",
        ]
        if result["findings"]:
            lines.extend(f"- [{item['severity'].upper()}] {item['gate']}: {item['message']}" for item in result["findings"])
        else:
            lines.append("- No material findings.")
        lines.extend(["", "Strengths:"])
        if result["strengths"]:
            lines.extend(f"- {item}" for item in result["strengths"])
        else:
            lines.append("- No standout strengths detected yet.")
        lines.extend(["", "Clarifying Questions:"])
        if result["clarifying_questions"]:
            lines.extend(f"- {item}" for item in result["clarifying_questions"])
        else:
            lines.append("- No follow-up questions needed.")
    payload = "\n".join(lines)
    return "data:text/plain;charset=utf-8," + urllib.parse.quote(payload)



def make_unique_deal_name(requested_name: str) -> str:
    requested_clean = requested_name.strip() or "Untitled deal"
    existing = {item["deal_name"].strip().casefold() for item in SESSION_REVIEWS}
    if requested_clean.casefold() not in existing:
        return requested_clean
    index = 2
    while True:
        candidate = f"{requested_clean} ({index})"
        if candidate.casefold() not in existing:
            return candidate
        index += 1


def remember_session_review(
    deal_name: str,
    artifacts: dict[str, str],
    result: dict[str, object],
    score_delta: int | None = None,
) -> str:
    global NEXT_REVIEW_ID
    review_id = str(NEXT_REVIEW_ID)
    NEXT_REVIEW_ID += 1
    SESSION_REVIEWS.insert(0, {
        "id": review_id,
        "deal_name": deal_name,
        "artifacts": dict(artifacts),
        "result": dict(result),
        "score_delta": score_delta,
    })
    del SESSION_REVIEWS[12:]
    return review_id


def get_session_review(review_id: str) -> dict[str, object] | None:
    for item in SESSION_REVIEWS:
        if item["id"] == review_id:
            return item
    return None


def consume_flash_messages(review_id: str) -> list[str]:
    return FLASH_MESSAGES.pop(review_id, [])


def rename_session_review(review_id: str, new_name: str) -> dict[str, object] | None:
    clean_name = new_name.strip()
    if not clean_name:
        return None
    for item in SESSION_REVIEWS:
        if item["id"] == review_id:
            item["deal_name"] = clean_name
            return item
    return None


def delete_session_review(review_id: str) -> None:
    for index, item in enumerate(SESSION_REVIEWS):
        if item["id"] == review_id:
            del SESSION_REVIEWS[index]
            return


def render_session_history(selected_review_id: str) -> str:
    if not SESSION_REVIEWS:
        return "<p class='hint'>No reviews in this session yet.</p>"
    items = []
    for item in SESSION_REVIEWS:
        result = item["result"]
        active_class = " active" if item["id"] == selected_review_id else ""
        menu_id = f"deal-menu-{item['id']}"
        items.append(
            f"<li class='history-item{active_class}'>"
            f"<div class='history-menu-wrap'>"
            f"<button type='button' class='history-menu-button' data-menu-button='{escape(menu_id)}' aria-label='Deal options' title='Deal options'>&#8942;</button>"
            f"<div class='history-menu' id='{escape(menu_id)}'>"
            f"<a class='history-menu-action' href='/?rerun={escape(item['id'])}'>Re-run</a>"
            f"<button type='button' data-rename-review='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>Rename</button>"
            f"<button type='button' data-delete-review='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>Delete</button>"
            f"</div>"
            f"</div>"
            f"<a class='history-link' href='/?review={escape(item['id'])}' data-review-id='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>"
            f"<span class='history-title'>{escape(item['deal_name'])}</span>"
            f"<div class='history-meta'>{escape('RFP REVIEW · ' + str(len(result.get('clarifying_questions', []))) + ' questions') if result.get('review_mode') == 'rfp' else escape(result['overall_status'] + ' (' + str(result['overall_score']) + '/100)')}</div>"
            "</a>"
            "</li>"
        )
    return "<ul class='history-list'>" + "".join(items) + "</ul>"


def main() -> None:
    t0 = time.time()
    url = f"http://{HOST}:{PORT}"
    with make_server(HOST, PORT, application, handler_class=_QuietHandler) as server:
        elapsed = round((time.time() - t0) * 1000, 1)
        print(f"Presales Deal Reviewer running at {url}  (ready in {elapsed} ms)")
        if os.environ.get("PDG_OPEN_BROWSER", "0") == "1":
            threading.Thread(target=open_browser_when_ready, args=(url,), daemon=True).start()
        server.serve_forever()


def open_browser_when_ready(url: str) -> None:
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with socket.create_connection((HOST, PORT), timeout=0.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.1)
    try:
        webbrowser.open(url)
    except Exception:
        pass


if __name__ == "__main__":
    main()
