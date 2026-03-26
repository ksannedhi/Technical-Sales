from typing import Literal

from pydantic import BaseModel, Field


class ImpactBand(BaseModel):
    low_usd: int
    likely_usd: int
    high_usd: int
    downtime_hours: int
    people_affected: int


class BusinessImpact(BaseModel):
    summary: str
    impact_band: ImpactBand
    regulatory_exposure: Literal["low", "medium", "high"]
    reputation_exposure: Literal["low", "medium", "high"]
    operational_exposure: Literal["low", "medium", "high"]


class RiskAssessment(BaseModel):
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    urgency: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)
    overall_risk: Literal["low", "moderate", "high", "critical"]
    rationale: list[str]


class LeadershipOutput(BaseModel):
    headline: str
    executive_summary: str
    board_brief: str
    recommended_actions: list[str]


class RiskReduction(BaseModel):
    residual_likelihood: int = Field(ge=1, le=5)
    residual_impact: int = Field(ge=1, le=5)
    residual_risk: Literal["low", "moderate", "high", "critical"]
    likely_loss_avoided_usd: int
    downtime_avoided_hours: int
    summary: str


class OrganizationProfile(BaseModel):
    annual_revenue_musd: int = Field(ge=10, le=100000)
    employee_count: int = Field(ge=50, le=1000000)
    internet_exposure: int = Field(ge=1, le=5)
    security_maturity: int = Field(ge=1, le=5)
    regulatory_sensitivity: int = Field(ge=1, le=5)
    crown_jewel_dependency: int = Field(ge=1, le=5)


class FindingSummary(BaseModel):
    finding_id: str
    title: str
    severity: Literal["critical", "high", "medium", "low"]
    scenario_name: str
    mapped_business_service: str
    affected_asset: str
    overall_risk: Literal["low", "moderate", "high", "critical"]
    likely_loss_usd: int
    headline: str
    recommended_actions: list[str]


class ReportRollup(BaseModel):
    total_findings: int
    severity_counts: dict[str, int]
    highest_severity: Literal["critical", "high", "medium", "low"]
    top_business_services: list[str]
    top_actions: list[str]
    summary: str


class TranslationResponse(BaseModel):
    scenario_id: str
    scenario_name: str
    audience: str
    technical_summary: str
    business_context: dict
    exposure_scores: dict[str, int]
    organization_profile: OrganizationProfile
    business_impact: BusinessImpact
    risk_assessment: RiskAssessment
    risk_reduction_if_fixed: RiskReduction
    leadership_output: LeadershipOutput
    analysis_type: Literal["scenario", "ad_hoc", "scan_report"] = "scenario"
    report_rollup: ReportRollup | None = None
    finding_summaries: list[FindingSummary] = []
