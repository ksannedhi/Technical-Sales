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
from wsgiref.simple_server import make_server

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from file_ingest import extract_text_from_bytes, extract_text_from_path, load_artifacts_from_folder, load_artifacts_from_zip, load_artifacts_from_zip_data
from presales_gate_engine import PresalesGateEngine


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", 8020))
SUPPORTED_STANDARD_FORMATS = [".txt", ".md", ".docx", ".pptx", ".pdf", ".zip"]
UNSUPPORTED_STANDARD_FORMATS = [".xlsx", ".xls", ".csv", ".json", ".doc", ".ppt", ".rtf", ".html"]
PDF_SUPPORT_NOTE = ".pdf is supported for text-based PDFs only; scanned or image-heavy PDFs are not fully supported yet."

engine = PresalesGateEngine(ROOT / "data")
SESSION_REVIEWS: list[dict[str, object]] = []
FLASH_MESSAGES: dict[str, list[str]] = {}
NEXT_REVIEW_ID = 1


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    query = urllib.parse.parse_qs(environ.get("QUERY_STRING", ""))
    if method == "POST":
        request_started = time.time()
        form = parse_multipart(environ)
        print(f"[timing] parse_multipart_ms={round((time.time() - request_started) * 1000, 2)}")
        state_started = time.time()
        state = build_page_state(query, form)
        print(f"[timing] build_page_state_ms={round((time.time() - state_started) * 1000, 2)}")
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

    body = render_page(build_page_state(query, None))
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
            "deal_package_path": "",
            "requirements": "",
            "requirements_path": "",
            "proposal": "",
            "proposal_path": "",
            "supporting_context": "",
            "supporting_path": "",
            "messages": [],
            "result": None,
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
                "deal_package_path": "",
                "requirements": "",
                "requirements_path": "",
                "proposal": "",
                "proposal_path": "",
                "supporting_context": "",
                "supporting_path": "",
                "messages": messages,
                "result": saved["result"],
            }

    state = {
        "selected_review_id": "",
        "active_deal_name": "",
        "deal_name": "",
        "deal_package_path": "",
        "requirements": "",
        "requirements_path": "",
        "proposal": "",
        "proposal_path": "",
        "supporting_context": "",
        "supporting_path": "",
        "messages": [],
        "result": None,
    }
    if not form:
        return state

    delete_review_id = (form.get("delete_review_id") or "").strip()
    if delete_review_id:
        delete_session_review(delete_review_id)
        return {
            "selected_review_id": "",
            "active_deal_name": "",
            "deal_name": "",
            "deal_package_path": "",
            "requirements": "",
            "requirements_path": "",
            "proposal": "",
            "proposal_path": "",
            "supporting_context": "",
            "supporting_path": "",
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
                "deal_package_path": "",
                "requirements": "",
                "requirements_path": "",
                "proposal": "",
                "proposal_path": "",
                "supporting_context": "",
                "supporting_path": "",
                "messages": [f"Renamed session review to '{renamed['deal_name']}'."],
                "result": renamed["result"],
            }
        return state

    requested_deal_name = (form.get("deal_name") or state["deal_name"]).strip()
    if not requested_deal_name:
        state["messages"].append("Enter a deal name before running the review.")
        state["deal_package_path"] = (form.get("deal_package_path") or "").strip()
        state["requirements"] = (form.get("requirements") or "").strip()
        state["requirements_path"] = (form.get("requirements_path") or "").strip()
        state["proposal"] = (form.get("proposal") or "").strip()
        state["proposal_path"] = (form.get("proposal_path") or "").strip()
        state["supporting_context"] = (form.get("supporting_context") or "").strip()
        state["supporting_path"] = (form.get("supporting_path") or "").strip()
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
    state["deal_package_path"] = (form.get("deal_package_path") or "").strip()
    state["requirements_path"] = (form.get("requirements_path") or "").strip()
    state["proposal_path"] = (form.get("proposal_path") or "").strip()
    state["supporting_path"] = (form.get("supporting_path") or "").strip()

    package_path = state["deal_package_path"]
    if package_path:
        loaded = load_artifacts_from_local_package_path(package_path, state["messages"])
        for key, value in loaded.items():
            artifacts[key] = merge_text(value, artifacts.get(key, ""))

    for key, target in [
        ("requirements_path", "requirements"),
        ("proposal_path", "proposal"),
        ("supporting_path", "supporting_context"),
    ]:
        local_path = state[key]
        if local_path:
            text = load_text_from_local_path(local_path, state["messages"])
            artifacts[target] = merge_text(text, artifacts.get(target, ""))

    deal_zip = form.get("deal_zip")
    if isinstance(deal_zip, dict) and deal_zip.get("filename"):
        zipped = load_artifacts_from_zip_data(deal_zip["content"])
        for key, value in zipped.items():
            artifacts[key] = merge_text(value, artifacts.get(key, ""))
        state["messages"].append(f"Loaded deal ZIP: {deal_zip['filename']}")

    for key in ["requirements_file", "proposal_file", "supporting_file"]:
        upload = form.get(key)
        if isinstance(upload, dict) and upload.get("filename"):
            extraction_started = time.time()
            text = extract_text_from_bytes(upload["filename"], upload["content"])
            print(f"[timing] extract_{key}_ms={round((time.time() - extraction_started) * 1000, 2)} file={upload['filename']}")
            target = key.replace("_file", "")
            if target == "supporting":
                target = "supporting_context"
            artifacts[target] = merge_text(text, artifacts.get(target, ""))
            warning = upload_warning(upload["filename"], text)
            if warning:
                state["messages"].append(warning)

    state.update(artifacts)
    analyze_started = time.time()
    state["result"] = engine.analyze(deal_name=deal_name, artifacts=artifacts).to_dict()
    print(f"[timing] engine_analyze_ms={round((time.time() - analyze_started) * 1000, 2)}")
    state["selected_review_id"] = remember_session_review(deal_name, artifacts, state["result"])
    state["deal_name"] = ""
    state["deal_package_path"] = ""
    state["requirements"] = ""
    state["requirements_path"] = ""
    state["proposal"] = ""
    state["proposal_path"] = ""
    state["supporting_context"] = ""
    state["supporting_path"] = ""
    return state


def parse_multipart(environ: dict[str, str]) -> dict[str, object]:
    read_started = time.time()
    content_length = int(environ.get("CONTENT_LENGTH") or "0")
    body = environ["wsgi.input"].read(content_length)
    print(f"[timing] request_body_read_ms={round((time.time() - read_started) * 1000, 2)} bytes={len(body)}")
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
        payload = payload.rstrip(b"\r\n")
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


def render_page(state: dict[str, object]) -> str:
    result = state.get("result")
    session_history = render_session_history(state.get("selected_review_id", ""))
    selected_review_summary = ""

    result_html = ""
    if result:
        active_deal_name = state.get("active_deal_name", "") or "Untitled deal"
        overall_icon = readiness_icon(result["overall_score"])
        findings = render_findings_groups(result["findings"])
        strengths = "".join(f"<li>{escape(item)}</li>" for item in result["strengths"]) or "<li>No standout strengths detected yet.</li>"
        questions = "".join(f"<li>{escape(item)}</li>" for item in result["clarifying_questions"]) or "<li>No follow-up questions needed.</li>"
        findings_download_href = build_findings_download_href(active_deal_name, result)
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
              <ul>{strengths}</ul>
            </div>
          </div>
          <div class="two-col">
            <div>
              <h3>Clarifying Questions</h3>
              <ul>{questions}</ul>
            </div>
            <div>
              <h3>How To Read These Scores</h3>
              <ul>
                <li><strong>80-100</strong>: strong signal for that gate</li>
                <li><strong>60-79</strong>: usable but needs review or cleanup</li>
                <li><strong>0-59</strong>: major gaps or blockers were found</li>
              </ul>
            </div>
          </div>
        </section>
        """

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Presales Deal Gating</title>
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
    .local-path-box {{ margin: 14px 0 0; padding: 14px; border: 1px dashed #c9893f; border-radius: 12px; background: rgba(255,255,255,0.5); }}
    .local-path-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .local-path-box input[type="text"] {{ margin-bottom: 8px; }}
    .modal-backdrop {{ position: fixed; inset: 0; background: rgba(24, 32, 40, 0.45); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 20; }}
    .modal-backdrop.open {{ display: flex; }}
    .modal-card {{ width: min(460px, 100%); background: #fffdf8; border: 1px solid #d8cfc2; border-radius: 16px; box-shadow: 0 18px 40px rgba(24, 32, 40, 0.18); padding: 18px; }}
    .modal-card h3 {{ margin-bottom: 8px; }}
    .modal-actions {{ display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }}
    .ghost-button {{ background: transparent; color: #6d5c48; border: 1px solid #d8cfc2; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Presales Deal Gating</h1>
    <p class="hint">Local web app for gating requirements, architecture, proposal, and supporting presales context on your laptop.</p>
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
            <label for="deal_name">Deal name</label>
            <input id="deal_name" name="deal_name" type="text" placeholder="Enter a deal name" value="{escape(state['deal_name'])}" required>

            <label for="requirements">Requirements / Discovery Notes</label>
            <textarea id="requirements" name="requirements">{escape(state['requirements'])}</textarea>
            <label>Optional requirements upload</label>
            <input name="requirements_file" type="file" accept=".txt,.md,.docx,.pdf">
            <input name="requirements_path" type="text" placeholder="Or paste a local requirements file path" value="{escape(state['requirements_path'])}">

            <label for="proposal">Proposal / SOW Summary</label>
            <textarea id="proposal" name="proposal">{escape(state['proposal'])}</textarea>
            <label>Optional proposal upload</label>
            <input name="proposal_file" type="file" accept=".txt,.md,.docx,.pdf">
            <input name="proposal_path" type="text" placeholder="Or paste a local proposal file path" value="{escape(state['proposal_path'])}">

            <label for="supporting_context">Discovery Notes &amp; Supporting Context</label>
            <p class="hint" style="margin:4px 0 8px">Paste meeting notes, call summaries, sizing worksheets, or any context that does not fit the formal requirements or proposal docs. Architecture signals found here (HA, DR, integrations, constraints) will supplement the requirements gate and inform the architecture assessment.</p>
            <textarea id="supporting_context" name="supporting_context">{escape(state['supporting_context'])}</textarea>
            <label>Optional supporting upload</label>
            <input name="supporting_file" type="file" accept=".txt,.md,.docx,.pptx,.pdf">
            <input name="supporting_path" type="text" placeholder="Or paste a local supporting file path" value="{escape(state['supporting_path'])}">

            <div class="package-upload">
              <div class="package-kicker">Fastest Path On This Laptop</div>
              <label>Upload one deal package ZIP</label>
              <p class="hint">Use this when you already have the deal artifacts together. One ZIP can replace the individual uploads for requirements, proposal, and supporting notes.</p>
              <input name="deal_zip" type="file" accept=".zip">
              <div class="local-path-box">
                <label for="deal_package_path">Or paste a local folder or ZIP path</label>
                <p class="hint">This avoids slow browser uploads for large files stored locally or in Box-synced folders.</p>
                <input id="deal_package_path" name="deal_package_path" type="text" placeholder="C:\\Path\\To\\Deal Folder or Deal.zip" value="{escape(state['deal_package_path'])}">
              </div>
            </div>

            <div class="actions">
              <button id="review-button" type="submit">Run Gate Review</button>
            </div>
          </form>
          </section>
        </div>
        <div>
          <section class="panel">
            <h2>Format Support</h2>
            <p class="hint">Supported now: {escape(", ".join(SUPPORTED_STANDARD_FORMATS))}<br>Not supported yet: {escape(", ".join(UNSUPPORTED_STANDARD_FORMATS))}<br>{escape(PDF_SUPPORT_NOTE)}</p>
          </section>
          <section class="panel">
            <h2>About This App</h2>
            <ul>
              <li>Upload or paste presales inputs and get a readiness review in one place.</li>
              <li>The app evaluates requirements, proposal quality, and discovery notes together — architecture signals are extracted from across all inputs.</li>
              <li>It highlights missing artifacts, contradictions, weak assumptions, and technical delivery risks.</li>
              <li>It gives weighted gate scores plus follow-up questions to help improve the submission.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
    {result_html}
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
      reviewButton.textContent = "Reviewing...";
      document.body.style.cursor = "wait";
    }});
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
    if not lower.endswith(".pdf"):
        return ""
    if text.startswith("[PDF too large for fast local review]"):
        return f"'{filename}' is large for fast local review. If you have the same document in .docx, upload the .docx version for better extraction speed and quality."
    if text.startswith("[PDF parsing timed out for local review]"):
        return f"'{filename}' took too long to parse for local review. If you have the same document in .docx, upload the .docx version for better extraction speed and reliability."
    if text.startswith("[PDF parsing unavailable") or text.startswith("[Could not parse"):
        return f"PDF ingestion was limited for '{filename}'. If you have the same document in .docx, upload the .docx version for better extraction."
    if "Only the first" in text:
        return f"'{filename}' was only partially reviewed for speed. If you need full-document fidelity, prefer uploading a .docx version when available."
    if len(text.strip()) < 120:
        return f"'{filename}' produced very little extractable text. If this PDF is scanned or image-heavy, prefer uploading a .docx version when available."
    return ""


def readiness_icon(score: int) -> str:
    if score >= 80:
        return "\U0001F7E2"
    if score >= 60:
        return "\U0001F7E1"
    return "\U0001F534"


def render_findings_groups(findings: list[dict[str, str]]) -> str:
    if not findings:
        return "<p>No material findings.</p>"
    grouped: dict[str, list[dict[str, str]]] = {}
    for item in findings:
        grouped.setdefault(item["gate"], []).append(item)
    ordered_gates = ["Document Presence", "Requirements", "Architecture", "Proposal", "Cross-check"]
    sections: list[str] = []
    for gate in ordered_gates:
        gate_findings = grouped.get(gate, [])
        if not gate_findings:
            continue
        items = "".join(
            f"<li><strong>[{escape(item['severity'].upper())}]</strong> {escape(item['message'])}</li>"
            for item in gate_findings
        )
        sections.append(f"<h4>{escape(gate)}</h4><ul>{items}</ul>")
    return "".join(sections)


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


def load_text_from_local_path(path_text: str, messages: list[str]) -> str:
    try:
        file_path = Path(path_text.strip().strip('"'))
    except Exception:
        messages.append(f"Could not read local path: {path_text}")
        return ""
    if not file_path.exists() or not file_path.is_file():
        messages.append(f"Local file path was not found: {file_path}")
        return ""
    try:
        return extract_text_from_path(file_path)
    except Exception:
        messages.append(f"Could not extract text from local file: {file_path.name}")
        return ""


def load_artifacts_from_local_package_path(path_text: str, messages: list[str]) -> dict[str, str]:
    empty = {"requirements": "", "proposal": "", "supporting_context": ""}
    try:
        package_path = Path(path_text.strip().strip('"'))
    except Exception:
        messages.append(f"Could not read local package path: {path_text}")
        return empty
    if not package_path.exists():
        messages.append(f"Local package path was not found: {package_path}")
        return empty
    try:
        if package_path.is_dir():
            messages.append(f"Loaded local deal folder: {package_path.name}")
            return load_artifacts_from_folder(package_path)
        if package_path.suffix.lower() == ".zip":
            messages.append(f"Loaded local deal ZIP: {package_path.name}")
            return load_artifacts_from_zip(package_path)
        messages.append("Local package path must be a folder or .zip file.")
    except Exception:
        messages.append(f"Could not load local package path: {package_path.name}")
    return empty


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


def remember_session_review(deal_name: str, artifacts: dict[str, str], result: dict[str, object]) -> str:
    global NEXT_REVIEW_ID
    review_id = str(NEXT_REVIEW_ID)
    NEXT_REVIEW_ID += 1
    SESSION_REVIEWS.insert(0, {
        "id": review_id,
        "deal_name": deal_name,
        "artifacts": dict(artifacts),
        "result": dict(result),
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
            f"<button type='button' data-rename-review='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>Rename</button>"
            f"<button type='button' data-delete-review='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>Delete</button>"
            f"</div>"
            f"</div>"
            f"<a class='history-link' href='/?review={escape(item['id'])}' data-review-id='{escape(item['id'])}' data-deal-name='{escape(item['deal_name'])}'>"
            f"<span class='history-title'>{escape(item['deal_name'])}</span>"
            f"<div class='history-meta'>{escape(result['overall_status'])} ({result['overall_score']}/100)</div>"
            "</a>"
            "</li>"
        )
    return "<ul class='history-list'>" + "".join(items) + "</ul>"


def main() -> None:
    url = f"http://{HOST}:{PORT}"
    print(f"Presales Deal Gating running at {url}")
    with make_server(HOST, PORT, application) as server:
        if os.environ.get("PDG_OPEN_BROWSER", "0") == "1":
            threading.Thread(target=open_browser_when_ready, args=(url,), daemon=True).start()
        server.serve_forever()


def open_browser_when_ready(url: str) -> None:
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            with socket.create_connection((HOST, PORT), timeout=0.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass


if __name__ == "__main__":
    main()
