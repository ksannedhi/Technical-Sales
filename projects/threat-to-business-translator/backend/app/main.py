from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

from .models import TranslationResponse
from .services.data_loader import list_scenario_cards
from .services.translator import analyze_raw_input, default_profile, translate_scenario


app = FastAPI(title="Threat-to-Business Translator API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _profile_from_inputs(
    annual_revenue_musd: int,
    employee_count: int,
    internet_exposure: int,
    security_maturity: int,
    regulatory_sensitivity: int,
    crown_jewel_dependency: int,
) -> dict:
    return {
        "annual_revenue_musd": annual_revenue_musd,
        "employee_count": employee_count,
        "internet_exposure": internet_exposure,
        "security_maturity": security_maturity,
        "regulatory_sensitivity": regulatory_sensitivity,
        "crown_jewel_dependency": crown_jewel_dependency,
    }


def _extract_file_text(file_bytes: bytes, file_name: str | None) -> str:
    name = (file_name or "").lower()
    if name.endswith(".pdf"):
        reader = PdfReader(BytesIO(file_bytes))
        pages: list[str] = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(part.strip() for part in pages if part.strip())

    return file_bytes.decode("utf-8", errors="ignore")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/default-profile")
def get_default_profile() -> dict[str, dict]:
    return {"profile": default_profile()}


@app.get("/api/scenarios")
def list_scenarios() -> dict[str, list[dict]]:
    return {"scenarios": list_scenario_cards()}


@app.get("/api/translate/{scenario_id}", response_model=TranslationResponse)
def translate(
    scenario_id: str,
    annual_revenue_musd: int = Query(default=250),
    employee_count: int = Query(default=5000),
    internet_exposure: int = Query(default=4),
    security_maturity: int = Query(default=3),
    regulatory_sensitivity: int = Query(default=4),
    crown_jewel_dependency: int = Query(default=4),
) -> TranslationResponse:
    profile = _profile_from_inputs(
        annual_revenue_musd,
        employee_count,
        internet_exposure,
        security_maturity,
        regulatory_sensitivity,
        crown_jewel_dependency,
    )
    result = translate_scenario(scenario_id, profile)
    if result is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return TranslationResponse.model_validate(result)


@app.post("/api/analyze", response_model=TranslationResponse)
async def analyze(
    raw_text: str = Form(default=""),
    source_file: UploadFile | None = File(default=None),
    affected_service: str = Form(default=""),
    annual_revenue_musd: int = Form(default=250),
    employee_count: int = Form(default=5000),
    internet_exposure: int = Form(default=4),
    security_maturity: int = Form(default=3),
    regulatory_sensitivity: int = Form(default=4),
    crown_jewel_dependency: int = Form(default=4),
) -> TranslationResponse:
    file_text = ""
    file_name = None
    if source_file is not None:
        file_name = source_file.filename
        file_text = _extract_file_text(await source_file.read(), file_name)

    combined_text = "\n\n".join(part for part in [raw_text.strip(), file_text.strip()] if part)
    if not combined_text:
        raise HTTPException(status_code=400, detail="Provide pasted text or upload a report file.")

    profile = _profile_from_inputs(
        annual_revenue_musd,
        employee_count,
        internet_exposure,
        security_maturity,
        regulatory_sensitivity,
        crown_jewel_dependency,
    )
    result = analyze_raw_input(
        combined_text,
        file_name=file_name,
        profile=profile,
        affected_service=affected_service.strip() or None,
    )
    return TranslationResponse.model_validate(result)
