from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator, GetCoreSchemaHandler
from bson import ObjectId
from enum import Enum
from pydantic_core import core_schema

class PyObjectId(ObjectId):
    @classmethod
    def __get_pydantic_core_schema__(cls, source, handler: GetCoreSchemaHandler):
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.str_schema()
        )

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return str(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")
        return field_schema

class StepStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in-progress"
    CURRENT = "current"
    APPROVED = "approved"
    DECLINED = "declined"

class WorkflowStepType(str, Enum):
    DEPARTMENT_REQUEST = "department_request"
    HR_REVIEW = "hr_review"
    BUDGET_APPROVAL = "budget_approval"
    FINAL_APPROVAL = "final_approval"

class JobType(str, Enum):
    FULL_TIME = "Full-time"
    PART_TIME = "Part-time"
    CONTRACT = "Contract"
    INTERN = "Intern"

class LocationType(str, Enum):
    OFFICE = "Office"
    REMOTE = "Remote"
    HYBRID = "Hybrid"

class ExperienceLevel(str, Enum):
    ENTRY_LEVEL = "Entry Level (0-2 years)"
    MID_LEVEL = "Mid Level (3-5 years)"
    SENIOR_LEVEL = "Senior Level (6-10 years)"
    EXECUTIVE_LEVEL = "Executive Level (10+ years)"

class EducationLevel(str, Enum):
    HIGH_SCHOOL = "High School"
    ASSOCIATE_DEGREE = "Associate Degree"
    BACHELORS_DEGREE = "Bachelor's Degree"
    MASTERS_DEGREE = "Master's Degree"
    PHD = "PhD"
    PROFESSIONAL_CERTIFICATION = "Professional Certification"

class ReasonForHire(str, Enum):
    NEW_ROLE = "New Role"
    REPLACEMENT = "Replacement"
    TEAM_EXPANSION = "Team Expansion"
    SEASONAL = "Seasonal"
    PROJECT_BASED = "Project-based"

def to_snake_case(string: str) -> str:
    return ''.join(['_' + c.lower() if c.isupper() else c for c in string]).lstrip('_')

class CamelModel(BaseModel):
    class Config:
        alias_generator = to_snake_case
        allow_population_by_field_name = True

class WorkflowStep(CamelModel):
    id: str
    title: str
    status: StepStatus
    step_type: WorkflowStepType
    comments: Optional[str] = None
    reviewer: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    attachments: Optional[List[str]] = None

class DepartmentRequestData(CamelModel):
    job_title: str
    department: str
    manager: str
    number_of_openings: int = Field(ge=1)
    job_type: JobType
    location: LocationType
    skills: List[str] = []
    experience_level: ExperienceLevel
    education_requirements: Optional[EducationLevel] = None
    salary_min: float = Field(ge=0)
    salary_max: float = Field(ge=0)
    reason_for_hire: ReasonForHire
    start_date: Optional[datetime] = None
    notes: Optional[str] = None

    @validator('salary_max')
    def validate_salary_range(cls, v, values):
        if 'salary_min' in values and v <= values['salary_min']:
            raise ValueError('Maximum salary must be greater than minimum salary')
        return v

class HRReviewData(CamelModel):
    reviewer: str
    decision: str  # "approve", "decline", "request_info"
    comments: Optional[str] = None
    attachments: Optional[List[str]] = None
    review_date: datetime = Field(default_factory=datetime.utcnow)

class BudgetApprovalData(CamelModel):
    budget_owner: str
    approved_budget: float
    currency: str = "USD"
    budget_period_start: Optional[datetime] = None
    budget_period_end: Optional[datetime] = None
    comments: Optional[str] = None
    approval_date: datetime = Field(default_factory=datetime.utcnow)

class FinalApprovalData(CamelModel):
    approver: str
    decision: str  # "approve", "decline"
    effective_date: Optional[datetime] = None
    comments: Optional[str] = None
    approval_date: datetime = Field(default_factory=datetime.utcnow)

class JobRequisition(CamelModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    requisition_id: str
    department_request: DepartmentRequestData
    hr_review: Optional[HRReviewData] = None
    budget_approval: Optional[BudgetApprovalData] = None
    final_approval: Optional[FinalApprovalData] = None
    workflow_steps: List[WorkflowStep]
    current_step: WorkflowStepType = WorkflowStepType.DEPARTMENT_REQUEST
    status: StepStatus = StepStatus.IN_PROGRESS
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Config(CamelModel.Config):
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class JobRequisitionCreate(CamelModel):
    department_request: DepartmentRequestData
    created_by: str

class JobRequisitionUpdate(CamelModel):
    department_request: Optional[DepartmentRequestData] = None
    hr_review: Optional[HRReviewData] = None
    budget_approval: Optional[BudgetApprovalData] = None
    final_approval: Optional[FinalApprovalData] = None
    current_step: Optional[WorkflowStepType] = None
    status: Optional[StepStatus] = None

class WorkflowAction(CamelModel):
    action: str  # "approve", "decline", "request_info", "submit"
    comments: Optional[str] = None
    reviewer: str

class JobRequisitionResponse(CamelModel):
    id: str
    requisition_id: str
    department_request: DepartmentRequestData
    hr_review: Optional[HRReviewData] = None
    budget_approval: Optional[BudgetApprovalData] = None
    final_approval: Optional[FinalApprovalData] = None
    workflow_steps: List[WorkflowStep]
    current_step: WorkflowStepType
    status: StepStatus
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool

    class Config(CamelModel.Config):
        json_encoders = {ObjectId: str}

# Statistics and Analytics Models
class RecruitmentStats(CamelModel):
    total_requisitions: int
    pending_requisitions: int
    approved_requisitions: int
    declined_requisitions: int
    open_positions: int
    closed_positions: int
    average_approval_time: Optional[float] = None

class HeadcountForecast(CamelModel):
    month: str
    actual: Optional[int] = None
    forecast: int
    department: Optional[str] = None 