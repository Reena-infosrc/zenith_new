from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class ReviewCycleBase(BaseModel):
    year: str = Field(..., pattern=r"^\d{4}$", description="Calendar year, e.g. 2025")
    name: Optional[str] = None
    description: Optional[str] = None
    status: str = Field(
        default="draft",
        description="draft, open, locked, closed"
    )
    startDate: Optional[str] = None  # ISO 8601 date string
    endDate: Optional[str] = None  # ISO 8601 date string
    metadata: Optional[Dict[str, Any]] = None


class ReviewCycleCreate(ReviewCycleBase):
    pass


class ReviewCycleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ReviewCycleInDB(ReviewCycleBase):
    cycleId: str
    createdAt: str
    updatedAt: str


class ReviewBase(BaseModel):
    cycleYear: str = Field(..., pattern=r"^\d{4}$")
    employeeId: str
    reviewerId: str
    reviewType: Literal["self", "manager", "peer", "skip_level", "other"] = "self"
    status: Optional[str] = Field(
        default=None,
        description="High-level lifecycle status of the review (e.g., draft, self_submitted, manager_submitted, hr_rejected)"
    )
    goalIds: List[str] = Field(default_factory=list)
    ratings: Optional[Dict[str, Any]] = None
    comments: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    attachments: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    submittedAt: Optional[str] = None  # ISO 8601 string - only set when review is submitted


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    reviewerId: Optional[str] = None
    reviewType: Optional[str] = None
    status: Optional[str] = None
    goalIds: Optional[List[str]] = None
    ratings: Optional[Dict[str, Any]] = None
    comments: Optional[str] = None
    strengths: Optional[List[str]] = None
    improvements: Optional[List[str]] = None
    attachments: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    submittedAt: Optional[str] = None  # Setting this moves review from draft to submitted


class ReviewInDB(ReviewBase):
    reviewId: str
    createdAt: str
    updatedAt: str
    isDraft: bool = False  # Computed field - true if in draft table, false if in review table


class ReviewStats(BaseModel):
    total: int = Field(..., description="Total number of review cycles")
    pending: int = Field(..., description="Number of pending self-reviews (drafts)")
    submitted: int = Field(..., description="Number of submitted self-reviews")
    managerPending: int = Field(..., description="Number of self-reviews awaiting manager review")
    finalized: int = Field(..., description="Number of finalized manager reviews")


class DashboardStats(BaseModel):
    cycleCompletionRate: float = Field(..., description="Percentage of employees who have completed reviews")
    averageRating: float = Field(..., description="Average rating across all manager reviews")
    pendingReviews: int = Field(..., description="Number of pending reviews")
    completedReviews: int = Field(..., description="Number of completed reviews")
    totalEmployees: int = Field(..., description="Total number of employees")

