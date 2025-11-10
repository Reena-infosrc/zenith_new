from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

class MilestoneBase(BaseModel):
    id: str
    title: str
    completed: bool = False
    dueDate: str  # ISO format date string
    evidence: Optional[str] = None
    completedDate: Optional[str] = None  # ISO format date string
    managerApproved: Optional[bool] = None
    managerReopened: Optional[bool] = None
    managerComment: Optional[str] = None
    userComment: Optional[str] = None

class MilestoneCreate(BaseModel):
    title: str
    dueDate: str  # ISO format date string

class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    dueDate: Optional[str] = None
    evidence: Optional[str] = None
    completedDate: Optional[str] = None
    userComment: Optional[str] = None
    managerComment: Optional[str] = None
    managerApproved: Optional[bool] = None
    managerReopened: Optional[bool] = None

class GoalBase(BaseModel):
    employeeId: str
    title: str
    description: Optional[str] = None
    category: str  # communication, leadership, client_feedback, Technical Skills, Leadership, Certification
    targetDate: str  # ISO format date string
    status: str = "in_progress"  # in_progress, completed, pending, pending_manager_approval, manager_reopened
    completion: float = 0.0  # percentage
    milestones: Optional[List[MilestoneBase]] = []
    createdBy: Optional[str] = None  # Manager/Admin ID who created the goal
    managerApproved: Optional[bool] = None
    managerReopened: Optional[bool] = None
    created_at: Optional[str] = None  # ISO format string
    updated_at: Optional[str] = None  # ISO format string

class GoalCreate(BaseModel):
    employeeId: str
    title: str
    description: Optional[str] = None
    category: str
    targetDate: str  # ISO format date string
    milestones: Optional[List[MilestoneCreate]] = []

class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    targetDate: Optional[str] = None
    status: Optional[str] = None
    completion: Optional[float] = None
    milestones: Optional[List[MilestoneBase]] = None
    managerApproved: Optional[bool] = None
    managerReopened: Optional[bool] = None
    updated_at: Optional[str] = None

class GoalInDB(GoalBase):
    id: str 