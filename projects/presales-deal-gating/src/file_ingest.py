from __future__ import annotations

import contextlib
import io
import logging
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md"}
SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx", ".pptx", ".pdf", ".zip"}
NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
MAX_PDF_BYTES = 4_000_000
MAX_PDF_PAGES = 25
PDF_TIMEOUT_SECONDS = 8


def extract_text_from_path(path: str | Path) -> str:
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    if suffix in SUPPORTED_TEXT_EXTENSIONS:
        return file_path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".docx":
        return extract_docx(file_path.read_bytes())
    if suffix == ".pptx":
        return extract_pptx(file_path.read_bytes())
    if suffix == ".pdf":
        return extract_pdf(file_path)
    if suffix == ".zip":
        bundle = load_artifacts_from_zip(file_path)
        return "\n".join(value for value in bundle.values() if value)
    raise ValueError(f"Unsupported file type: {suffix}")


def load_artifacts_from_folder(folder: str | Path) -> dict[str, str]:
    folder_path = Path(folder)
    artifacts = blank_artifacts()
    for file_path in sorted(folder_path.rglob("*")):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS - {".zip"}:
            continue
        assign_text_to_bucket(file_path.name, extract_text_from_path(file_path), artifacts)
    return artifacts


def load_artifacts_from_zip(path: str | Path) -> dict[str, str]:
    return load_artifacts_from_zip_data(Path(path).read_bytes())


def load_artifacts_from_zip_data(data: bytes) -> dict[str, str]:
    artifacts = blank_artifacts()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in sorted(zf.namelist()):
            if name.endswith("/"):
                continue
            suffix = Path(name).suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS - {".zip"}:
                continue
            text = extract_text_from_bytes(name, zf.read(name))
            assign_text_to_bucket(Path(name).name, text, artifacts)
    return artifacts


def extract_text_from_bytes(name: str, data: bytes) -> str:
    suffix = Path(name).suffix.lower()
    if suffix in SUPPORTED_TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="ignore")
    if suffix == ".docx":
        return extract_docx(data)
    if suffix == ".pptx":
        return extract_pptx(data)
    if suffix == ".pdf":
        return extract_pdf(io.BytesIO(data), suffix)
    return ""


def extract_docx(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
    texts = [node.text for node in root.iter() if node.tag.endswith("}t") and node.text]
    return "\n".join(texts)


def extract_pptx(data: bytes) -> str:
    slides: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in sorted(zf.namelist()):
            if not re.match(r"ppt/slides/slide\d+\.xml$", name):
                continue
            root = ET.fromstring(zf.read(name))
            texts = [node.text for node in root.findall(".//a:t", NS) if node.text]
            slides.append("\n".join(texts))
    return "\n\n".join(slides)


def extract_pdf(source: str | Path | io.BytesIO, suffix_hint: str = ".pdf") -> str:
    payload: bytes | None = None
    if isinstance(source, io.BytesIO):
        payload = source.getvalue()
        if len(payload) > MAX_PDF_BYTES:
            return "[PDF too large for fast local review]"
    if isinstance(source, (str, Path)):
        try:
            payload = Path(source).read_bytes()
        except OSError:
            return f"[Could not parse {suffix_hint} file]"
        if len(payload) > MAX_PDF_BYTES:
            return "[PDF too large for fast local review]"

    if not payload:
        return f"[Could not parse {suffix_hint} file]"
    return extract_pdf_bytes(payload, suffix_hint)


def extract_pdf_bytes(payload: bytes, suffix_hint: str = ".pdf") -> str:
    if len(payload) > MAX_PDF_BYTES:
        return "[PDF too large for fast local review]"
    try:
        return _extract_pdf_via_subprocess(payload)
    except subprocess.TimeoutExpired:
        return "[PDF parsing timed out for local review]"
    except Exception:
        return f"[Could not parse {suffix_hint} file]"


def _extract_pdf_via_subprocess(payload: bytes) -> str:
    wheel = Path(__file__).resolve().parents[2] / "wheelhouse" / "pypdf-6.9.1-py3-none-any.whl"
    script = f"""
import contextlib, io, logging, sys
sys.path.insert(0, r"{wheel}")
from pypdf import PdfReader
data = sys.stdin.buffer.read()
stderr_buffer = io.StringIO()
stdout_buffer = io.StringIO()
pypdf_logger = logging.getLogger("pypdf")
previous_level = pypdf_logger.level
pypdf_logger.setLevel(logging.ERROR)
try:
    with contextlib.redirect_stderr(stderr_buffer), contextlib.redirect_stdout(stdout_buffer):
        reader = PdfReader(io.BytesIO(data))
        pages = []
        limit = {MAX_PDF_PAGES}
        for index, page in enumerate(reader.pages):
            if index >= limit:
                break
            pages.append(page.extract_text() or "")
        text = "\\n\\n".join(pages).strip()
        if len(reader.pages) > limit:
            text += f"\\n\\n[Only the first {{limit}} pages were reviewed for speed]"
        sys.stdout.write(text)
finally:
    pypdf_logger.setLevel(previous_level)
"""
    completed = subprocess.run(
        [sys.executable, "-c", script],
        input=payload,
        capture_output=True,
        timeout=PDF_TIMEOUT_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("pdf subprocess failed")
    return completed.stdout.decode("utf-8", errors="ignore")


def assign_text_to_bucket(name: str, text: str, artifacts: dict[str, str]) -> None:
    lower_name = name.lower()
    clean = text.strip()
    if not clean:
        return
    if "requirement" in lower_name or "discovery" in lower_name or "rfp" in lower_name:
        artifacts["requirements"] = combine_text(artifacts["requirements"], clean)
    elif "architect" in lower_name:
        artifacts["architecture"] = combine_text(artifacts["architecture"], clean)
    elif "proposal" in lower_name or "sow" in lower_name:
        artifacts["proposal"] = combine_text(artifacts["proposal"], clean)
    else:
        artifacts["supporting_context"] = combine_text(artifacts["supporting_context"], clean)


def combine_text(existing: str, new_text: str) -> str:
    return new_text if not existing else existing + "\n\n" + new_text


def blank_artifacts() -> dict[str, str]:
    return {
        "requirements": "",
        "architecture": "",
        "proposal": "",
        "supporting_context": "",
    }
