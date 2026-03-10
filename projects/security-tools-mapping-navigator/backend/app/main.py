import csv
import io
import json
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .models import AnalysisResponse, FrameworkChoice
from .services.analyzer import analyze_mappings
from .services.csv_parser import parse_tool_control_csv
from .services.storage import get_project_result, init_db, list_project_results, save_project_result


app = FastAPI(title="Security Tools Mapping Navigator API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LAST_ANALYSIS: AnalysisResponse | None = None


@app.on_event("startup")
def startup_event() -> None:
    init_db()


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
        result = analyze_mappings(rows, framework)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
