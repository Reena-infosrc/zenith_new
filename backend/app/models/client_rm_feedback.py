from typing import Dict, Optional, List, Literal, Any
from pydantic import BaseModel, Field


BillingStatus = Literal["billable", "non_billable", "internal"]


class ClientRMFeedbackPeriodCreate(BaseModel):
    label: str = Field(..., min_length=2, max_length=100)
    start_date: str
    end_date: str
    status: Literal["draft", "open", "closed"] = "open"


class ClientRMFeedbackPeriodUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=2, max_length=100)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[Literal["draft", "open", "closed"]] = None


class ClientRMFeedbackSubmissionCreate(BaseModel):
    period_id: str
    employee_id: str
    employee_name: str
    employee_code: Optional[str] = None
    billing_status: BillingStatus
    client_name: str
    project_name: str
    client_reporting_manager_name: str
    info_services_reporting_manager_name: str
    ratings: Dict[str, int]
    additional_feedback: Optional[str] = None
    overall_satisfaction: int
    started_at: Optional[str] = None


class ClientRMFeedbackSubmissionUpdate(BaseModel):
    billing_status: Optional[BillingStatus] = None
    client_name: Optional[str] = None
    project_name: Optional[str] = None
    client_reporting_manager_name: Optional[str] = None
    info_services_reporting_manager_name: Optional[str] = None
    ratings: Optional[Dict[str, int]] = None
    additional_feedback: Optional[str] = None
    overall_satisfaction: Optional[int] = None


class ClientRMFeedbackNotificationSummary(BaseModel):
    manager_pending_count: int = 0
    reportee_unread_count: int = 0
    hr_new_count: int = 0
    leadership_new_count: int = 0
    open_period_count: int = Field(
        default=0,
        description="Number of feedback periods currently in open status (cycle initiated).",
    )


class ClientRMFeedbackMeContext(BaseModel):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    has_team_members: bool = False
    team_count: int = 0
    can_view_all: bool = False
    is_admin: bool = False
    is_leadership: bool = False
    reportees: List[Dict[str, Any]] = []
