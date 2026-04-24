from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class FrameworkChoice(str, Enum):
    NIST = "NIST"
    CIS = "CIS"
    BOTH = "BOTH"


class ToolControlRow(BaseModel):
    record_id: str
    tool_name: str
    vendor: Optional[str] = ""
    product: Optional[str] = ""
    version: Optional[str] = ""
    control_domain: str
    control_objective: str
    current_control_id: Optional[str] = ""
    current_control_name: Optional[str] = ""
    framework_alignment: Optional[str] = ""
    deployment_scope: Optional[str] = ""
    environment: Optional[str] = ""
    coverage_level: Optional[str] = ""
    effectiveness_score: Optional[float] = 0
    operational_status: Optional[str] = ""
    annual_cost_usd: Optional[float] = 0
    utilization_percent: Optional[float] = 0
    license_count: Optional[float] = 0
    eol_date: Optional[str] = ""
    notes: Optional[str] = ""


class GapFinding(BaseModel):
    control_id: str
    framework: str
    control_name: str
    domain: str
    status: str
    severity: str
    coverage_score: float
    rationale: str
    recommended_tools: str = ""


class RedundancyFinding(BaseModel):
    framework: str
    domain: str
    objective: str
    tools: List[str]
    vendors: List[str]
    products: List[str]
    overlap_score: float
    classification: str
    estimated_savings_usd: float


class RoadmapItem(BaseModel):
    phase: str
    initiative: str
    framework_focus: str
    priority: str
    effort: str
    expected_outcome: str
    depends_on: str = ""


class DiagramNode(BaseModel):
    id: str
    label: str
    domain: str
    state: str


class DiagramEdge(BaseModel):
    source: str
    target: str
    label: str = ""


class Diagram(BaseModel):
    title: str
    nodes: List[DiagramNode]
    edges: List[DiagramEdge]


class AnalysisResponse(BaseModel):
    project_id: Optional[int] = None
    framework_selected: FrameworkChoice
    rows_processed: int
    controls_total: int
    controls_covered: int
    controls_partial: int
    controls_missing: int
    warnings: List[str] = []
    gaps: List[GapFinding]
    redundancies: List[RedundancyFinding]
    roadmap: List[RoadmapItem]
    current_state_diagram: Diagram
    target_state_diagram: Diagram


class ProjectSummary(BaseModel):
    id: int
    project_name: str
    framework: str
    rows_processed: int
    created_at: str
