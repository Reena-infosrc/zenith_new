from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Optional
from ...models.recruitment import (
    JobRequisition, JobRequisitionCreate, JobRequisitionUpdate, 
    JobRequisitionResponse, WorkflowAction, RecruitmentStats, 
    HeadcountForecast, StepStatus
)
from ...services.recruitment_service import RecruitmentService
from ...security import get_current_active_user
import re

router = APIRouter(prefix="/api/recruitment", tags=["recruitment"])

def camel_to_snake(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def dict_keys_to_snake(d):
    if isinstance(d, dict):
        return {camel_to_snake(k): dict_keys_to_snake(v) for k, v in d.items()}
    elif isinstance(d, list):
        return [dict_keys_to_snake(i) for i in d]
    else:
        return d

# Get all job requisitions
@router.get("/job-requisitions", response_model=List[JobRequisitionResponse])
async def get_job_requisitions(
    skip: int = 0, 
    limit: int = 100,
    status: Optional[StepStatus] = Query(None),
    department: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_active_user)
):
    return await RecruitmentService.get_all_job_requisitions(skip=skip, limit=limit, status=status, department=department)

# Get a single job requisition by ID
@router.get("/job-requisitions/{requisition_id}", response_model=JobRequisitionResponse)
async def get_job_requisition(
    requisition_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    req = await RecruitmentService.get_job_requisition(requisition_id)
    if not req:
        raise HTTPException(status_code=404, detail="Job requisition not found")
    return req

# Create a new job requisition
@router.post("/job-requisitions", response_model=JobRequisitionResponse)
async def create_job_requisition(
    request: Request,
    current_user: dict = Depends(get_current_active_user)
):
    raw_body = await request.json()
    print("[DEBUG] Raw request body:", raw_body)
    snake_body = dict_keys_to_snake(raw_body)
    print("[DEBUG] Snake_case request body:", snake_body)
    try:
        requisition = JobRequisitionCreate(**snake_body)
        print("[DEBUG] Parsed JobRequisitionCreate:", requisition)
        result = await RecruitmentService.create_job_requisition(requisition)
        print("[DEBUG] Created job requisition:", result)
        return result
    except Exception as e:
        print("[ERROR] Exception in create_job_requisition:", e)
        raise

# Update a job requisition
@router.put("/job-requisitions/{requisition_id}", response_model=JobRequisitionResponse)
async def update_job_requisition(
    requisition_id: str,
    update: JobRequisitionUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    req = await RecruitmentService.update_job_requisition(requisition_id, update)
    if not req:
        raise HTTPException(status_code=404, detail="Job requisition not found")
    return req

# Delete a job requisition
@router.delete("/job-requisitions/{requisition_id}")
async def delete_job_requisition(
    requisition_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    success = await RecruitmentService.delete_job_requisition(requisition_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job requisition not found")
    return {"success": True}

# Workflow step action (approve/decline/request_info/submit)
@router.post("/job-requisitions/{requisition_id}/workflow/{step_id}/action", response_model=JobRequisitionResponse)
async def workflow_action(
    requisition_id: str,
    step_id: str,
    action: WorkflowAction,
    current_user: dict = Depends(get_current_active_user)
):
    req = await RecruitmentService.update_workflow_step(requisition_id, step_id, action)
    if not req:
        raise HTTPException(status_code=404, detail="Job requisition or step not found")
    return req

# Recruitment statistics
@router.get("/stats", response_model=RecruitmentStats)
async def get_recruitment_stats(
    current_user: dict = Depends(get_current_active_user)
):
    return await RecruitmentService.get_recruitment_stats()

# Headcount forecast
@router.get("/headcount-forecast", response_model=List[HeadcountForecast])
async def get_headcount_forecast(
    current_user: dict = Depends(get_current_active_user)
):
    return await RecruitmentService.get_headcount_forecast() 