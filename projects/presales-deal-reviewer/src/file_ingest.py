from __future__ import annotations

import contextlib
import hashlib
import io
import json
import logging
import re
import subprocess
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path
from xml.etree import ElementTree as ET


SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md"}
SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx", ".pptx", ".pdf", ".zip"}
NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
MAX_PDF_BYTES = 20_000_000   # 20 MB — text-based PDFs are almost always < 10 MB;
                             # files above this are virtually always scanned/image-heavy
                             # and yield no extractable text anyway
MAX_PDF_PAGES = 40           # first 40 pages covers most proposals and RFPs
PDF_TIMEOUT_SECONDS = 30     # allow extra time for larger government PDFs
MAX_CACHE_ENTRIES = 64
EXTRACTION_CACHE: OrderedDict[str, str] = OrderedDict()


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
            file_data = zf.read(name)
            # Skip large PDFs inside ZIP bundles — they are virtually always scanned
            # and pypdf would stall for 30-60 s without yielding any useful text.
            if suffix == ".pdf" and len(file_data) > MAX_PDF_BYTES:
                logging.warning("Skipping %s in ZIP — %d MB exceeds PDF limit", name, len(file_data) // 1_000_000)
                continue
            text = extract_text_from_bytes(name, file_data)
            assign_text_to_bucket(Path(name).name, text, artifacts)
    return artifacts


def extract_text_from_bytes(name: str, data: bytes) -> str:
    suffix = Path(name).suffix.lower()
    cache_key = build_cache_key(name, data)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    if suffix in SUPPORTED_TEXT_EXTENSIONS:
        text = data.decode("utf-8", errors="ignore")
    elif suffix == ".docx":
        text = extract_docx(data)
    elif suffix == ".pptx":
        text = extract_pptx(data)
    elif suffix == ".pdf":
        text = extract_pdf(io.BytesIO(data), suffix)
    else:
        text = ""
    cache_put(cache_key, text)
    return text


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
            mb = MAX_PDF_BYTES // 1_000_000
            return f"[PDF exceeds {mb} MB limit — convert to DOCX or paste text directly]"
    if isinstance(source, (str, Path)):
        try:
            payload = Path(source).read_bytes()
        except OSError:
            return f"[Could not parse {suffix_hint} file]"
        if len(payload) > MAX_PDF_BYTES:
            mb = MAX_PDF_BYTES // 1_000_000
            return f"[PDF exceeds {mb} MB limit — convert to DOCX or paste text directly]"

    if not payload:
        return f"[Could not parse {suffix_hint} file]"
    return extract_pdf_bytes(payload, suffix_hint)


def extract_pdf_bytes(payload: bytes, suffix_hint: str = ".pdf") -> str:
    if len(payload) > MAX_PDF_BYTES:
        mb = MAX_PDF_BYTES // 1_000_000
        return f"[PDF exceeds {mb} MB limit — convert to DOCX or paste text directly]"
    # Fast path: use pypdf in-process if available (avoids subprocess startup cost)
    try:
        return _extract_pdf_inprocess(payload)
    except ModuleNotFoundError:
        pass  # pypdf not importable — fall through to subprocess
    except Exception:
        pass  # unexpected parse error — subprocess may handle it differently
    # Subprocess fallback: crash-isolated, slightly slower
    try:
        return _extract_pdf_via_subprocess(payload)
    except ModuleNotFoundError:
        return "[PDF parsing unavailable: install pypdf]"
    except subprocess.TimeoutExpired:
        return "[PDF parsing timed out — try a shorter document or convert to DOCX]"
    except Exception:
        return f"[Could not parse {suffix_hint} file]"


def _extract_pdf_inprocess(payload: bytes) -> str:
    """Extract PDF text using pypdf directly in the current process (fast path).

    Detects scanned/image-only PDFs (very low character yield) and attempts OCR
    via pytesseract + pdf2image if both are installed.  Falls back gracefully
    with an informative message when OCR tools are not available.
    """
    try:
        from pypdf import PdfReader  # type: ignore[import]
    except ModuleNotFoundError:
        raise
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    reader = PdfReader(io.BytesIO(payload))
    total_pages = len(reader.pages)
    pages_to_read = min(total_pages, MAX_PDF_PAGES)
    pages: list[str] = []
    for index, page in enumerate(reader.pages):
        if index >= MAX_PDF_PAGES:
            break
        pages.append(page.extract_text() or "")
    text = "\n\n".join(pages).strip()

    # Detect scanned / image-based PDF: fewer than ~30 chars per page on average.
    # Genuinely text-based pages almost always produce several hundred characters each.
    if pages_to_read > 0 and len(text) < pages_to_read * 30:
        ocr_result = _try_ocr(payload, pages_to_read)
        if ocr_result:
            return ocr_result
        return (
            "[PDF appears to be scanned or image-based — very little text was extracted. "
            "Install pytesseract and pdf2image for OCR support, or upload the .docx version instead.]"
        )

    if total_pages > MAX_PDF_PAGES:
        text += f"\n\n[Only the first {MAX_PDF_PAGES} of {total_pages} pages were reviewed]"
    return text


def _try_ocr(payload: bytes, page_limit: int) -> str:
    """Attempt OCR on a scanned PDF using pytesseract + pdf2image (both optional).

    Returns extracted text prefixed with an OCR notice, or an empty string if
    the required libraries are not installed or OCR fails.
    """
    try:
        import pytesseract  # type: ignore[import]
        from pdf2image import convert_from_bytes  # type: ignore[import]
    except ImportError:
        return ""
    try:
        images = convert_from_bytes(payload, last_page=page_limit, dpi=200)
        ocr_pages: list[str] = []
        for image in images:
            ocr_pages.append(pytesseract.image_to_string(image))
        ocr_text = "\n\n".join(ocr_pages).strip()
        if ocr_text:
            return f"[OCR-extracted text — review for accuracy]\n\n{ocr_text}"
        return ""
    except Exception:
        return ""


def _extract_pdf_via_subprocess(payload: bytes) -> str:
    wheel_candidates = discover_pypdf_candidates()
    script = build_pdf_subprocess_script(wheel_candidates)
    completed = subprocess.run(
        [sys.executable, "-c", script],
        input=payload,
        capture_output=True,
        timeout=PDF_TIMEOUT_SECONDS,
        check=False,
    )
    stderr_text = completed.stderr.decode("utf-8", errors="ignore")
    if completed.returncode == 2 and "PDF_DEPENDENCY_MISSING" in stderr_text:
        raise ModuleNotFoundError("pypdf")
    if completed.returncode != 0:
        raise RuntimeError("pdf subprocess failed")
    return completed.stdout.decode("utf-8", errors="ignore")


# Content-based routing signals for files whose names give no obvious bucket hint.
# Scored against the lowercase document text; the bucket with the most hits wins.
_PROPOSAL_CONTENT_SIGNALS = [
    "statement of work", "bill of materials", "deliverable", "deliverables",
    "project plan", "acceptance criteria", "commercial", "pricing",
    "phases of work", "work breakdown",
]
_REQUIREMENTS_CONTENT_SIGNALS = [
    "functional requirement", "non-functional requirement", "request for proposal",
    "technical requirement", "business requirement", "shall ", "must ",
    "rfp ", "scope of work",
]


def assign_text_to_bucket(name: str, text: str, artifacts: dict[str, str]) -> None:
    lower_name = name.lower()
    clean = text.strip()
    if not clean:
        return

    # Primary: filename-keyword routing (fast, deterministic)
    if (
        "requirement" in lower_name
        or "discovery" in lower_name
        or "rfp" in lower_name
        or "scope" in lower_name
    ):
        artifacts["requirements"] = combine_text(artifacts["requirements"], clean)
    elif (
        "proposal" in lower_name
        or "sow" in lower_name
        or "statement of work" in lower_name
        or "technical response" in lower_name
    ):
        artifacts["proposal"] = combine_text(artifacts["proposal"], clean)
    else:
        # Secondary: content-based routing for generically named files
        # (e.g. "Solution Overview.docx", "Technical Response v2.docx")
        bucket = _infer_bucket_from_content(clean.lower())
        artifacts[bucket] = combine_text(artifacts[bucket], clean)


def _infer_bucket_from_content(text_lower: str) -> str:
    """Infer the artifact bucket from document content when the filename gives no hint.

    Requires at least 2 signal hits and a clear winner — defaults to
    supporting_context when ambiguous so the engine still sees the text.
    """
    proposal_hits = sum(1 for s in _PROPOSAL_CONTENT_SIGNALS if s in text_lower)
    req_hits = sum(1 for s in _REQUIREMENTS_CONTENT_SIGNALS if s in text_lower)
    if proposal_hits >= 2 and proposal_hits > req_hits:
        return "proposal"
    if req_hits >= 2 and req_hits > proposal_hits:
        return "requirements"
    return "supporting_context"


def combine_text(existing: str, new_text: str) -> str:
    return new_text if not existing else existing + "\n\n" + new_text


def blank_artifacts() -> dict[str, str]:
    return {
        "requirements": "",
        "proposal": "",
        "supporting_context": "",
    }


def build_cache_key(name: str, data: bytes) -> str:
    digest = hashlib.sha1(data).hexdigest()
    return f"{Path(name).suffix.lower()}:{len(data)}:{digest}"


def cache_get(key: str) -> str | None:
    cached = EXTRACTION_CACHE.get(key)
    if cached is not None:
        EXTRACTION_CACHE.move_to_end(key)
    return cached


def cache_put(key: str, value: str) -> None:
    EXTRACTION_CACHE[key] = value
    EXTRACTION_CACHE.move_to_end(key)
    while len(EXTRACTION_CACHE) > MAX_CACHE_ENTRIES:
        EXTRACTION_CACHE.popitem(last=False)


def discover_pypdf_candidates() -> list[str]:
    candidates: list[str] = []
    for parent in Path(__file__).resolve().parents:
        wheelhouse = parent / "wheelhouse"
        if wheelhouse.exists():
            for wheel in sorted(wheelhouse.glob("pypdf-*.whl")):
                candidates.append(str(wheel))
    return candidates


def build_pdf_subprocess_script(wheel_candidates: list[str]) -> str:
    candidates_literal = json.dumps(wheel_candidates)
    return f"""
import contextlib, importlib.util, io, json, logging, os, sys

def ensure_pypdf():
    if importlib.util.find_spec("pypdf") is not None:
        return
    for candidate in json.loads({candidates_literal!r}):
        if os.path.exists(candidate):
            sys.path.insert(0, candidate)
            if importlib.util.find_spec("pypdf") is not None:
                return
    raise ModuleNotFoundError("pypdf")

try:
    ensure_pypdf()
    from pypdf import PdfReader
except ModuleNotFoundError:
    sys.stderr.write("PDF_DEPENDENCY_MISSING")
    sys.exit(2)

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
            text += "\\n\\n[Only the first {{}} pages were reviewed for speed]".format(limit)
        sys.stdout.write(text)
finally:
    pypdf_logger.setLevel(previous_level)
"""
