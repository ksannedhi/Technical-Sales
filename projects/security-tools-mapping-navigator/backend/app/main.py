import csv
import io
import json
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .models import AnalysisResponse, FrameworkChoice
from .services.analyzer import analyze_mappings
from .services.csv_parser import parse_tool_control_csv
from .services.storage import (
    delete_project_result,
    get_project_result,
    init_db,
    list_project_results,
    save_project_result,
)


app = FastAPI(title="Security Tools Mapping Navigator API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LAST_ANALYSIS: AnalysisResponse | None = None


def _default_framework_alignment(framework: FrameworkChoice) -> str:
    if framework == FrameworkChoice.NIST:
        return "NIST-CSF-2.0"
    if framework == FrameworkChoice.CIS:
        return "CIS-v8.1"
    return "NIST-CSF-2.0;CIS-v8.1"


def _apply_framework_alignment_defaults(rows, framework: FrameworkChoice) -> list[str]:
    default_value = _default_framework_alignment(framework)
    updated_records: list[str] = []

    for row in rows:
        if not (row.framework_alignment or "").strip():
            row.framework_alignment = default_value
            updated_records.append(row.record_id)

    if not updated_records:
        return []

    preview = ", ".join(updated_records[:10])
    suffix = "" if len(updated_records) <= 10 else f", and {len(updated_records) - 10} more"
    return [
        (
            f"Framework alignment was blank for {len(updated_records)} row(s). "
            f"Defaulted to '{default_value}' using the selected framework mode. "
            f"Affected record_ids: {preview}{suffix}."
        )
    ]


@app.on_event("startup")
def startup_event() -> None:
    init_db()


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={
                "detail": (
                    f"API route not found: {request.method} {request.url.path}. "
                    "Check that the Security Tools Mapping Navigator backend is running "
                    "and that the frontend is calling the correct API."
                )
            },
        )

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": (
                "Request validation failed. This usually means the frontend sent the wrong form "
                "fields or the backend/frontend versions are out of sync."
            ),
            "errors": exc.errors(),
        },
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Security Tools Mapping Navigator API is running."}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}



@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    framework: FrameworkChoice = Form(...),
    mapping_file: UploadFile = File(...),
    project_name: str = Form(default=""),
) -> AnalysisResponse:
    global LAST_ANALYSIS

    if not mapping_file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported in MVP.")

    raw = await mapping_file.read()
    try:
        rows = parse_tool_control_csv(raw)
        warnings = _apply_framework_alignment_defaults(rows, framework)
        result = analyze_mappings(rows, framework)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result.warnings = warnings

    if project_name.strip():
        project_id = save_project_result(
            project_name=project_name.strip(),
            framework=framework.value,
            rows_processed=result.rows_processed,
            result=result.model_dump(mode="json"),
        )
        result.project_id = project_id

    LAST_ANALYSIS = result
    return result


@app.get("/projects")
def list_projects(limit: int = 100):
    return {"projects": list_project_results(limit=limit)}


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    record = get_project_result(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return record


@app.delete("/projects/{project_id}")
def delete_project(project_id: int):
    deleted = delete_project_result(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"deleted": True, "project_id": project_id}


@app.get("/export")
def export_result(format: Literal["json", "csv"] = "json"):
    if LAST_ANALYSIS is None:
        raise HTTPException(status_code=404, detail="No analysis available yet. Run /analyze first.")

    if format == "json":
        payload = json.dumps(LAST_ANALYSIS.model_dump(mode="json"), indent=2)
        return StreamingResponse(
            io.BytesIO(payload.encode("utf-8")),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=tools_mapping_result.json"},
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["control_id", "framework", "control_name", "domain", "status", "severity", "coverage_score"])
    for gap in LAST_ANALYSIS.gaps:
        writer.writerow([
            gap.control_id,
            gap.framework,
            gap.control_name,
            gap.domain,
            gap.status,
            gap.severity,
            gap.coverage_score,
        ])

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tools_control_gap_summary.csv"},
    )
