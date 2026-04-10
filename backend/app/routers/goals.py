from fastapi import APIRouter, HTTPException, status, Body, Depends, Query
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import time
import asyncio
from decimal import Decimal
from ..models.goal import (
    GoalCreate, GoalUpdate, GoalInDB, 
    MilestoneCreate, MilestoneUpdate, MilestoneBase
)
from ..database_dynamodb import get_goals_table, get_employees_table, parse_dynamodb_item, format_dynamodb_item, generate_id
from ..security import get_current_active_user
from ..services.milestone_notification import send_milestone_notifications, check_overdue_milestones
from boto3.dynamodb.conditions import Key
import logging

logger = logging.getLogger(__name__)

# In-memory caches for performance optimization
_employee_id_cache: Dict[str, tuple[str, float]] = {}  # email -> (employee_id, timestamp)
_manager_check_cache: Dict[str, tuple[bool, float]] = {}  # f"{manager_id}:{employee_id}" -> (is_manager, timestamp)
CACHE_DURATION = 300  # Cache for 5 minutes

# Only these statuses can have milestone mutations.
# "pending" / "pending_manager_approval" are review states and must be read-only.
MILESTONE_EDITABLE_STATUSES = {"in_progress", "manager_reopened"}


def _norm_goal_status(raw: Optional[str]) -> str:
    """Normalize status strings from API/UI (spacing, casing, legacy variants)."""
    if not raw:
        return ""
    s = str(raw).strip().lower().replace(" ", "_").replace("-", "_")
    if s == "inprogress":
        return "in_progress"
    return s


def _milestone_edits_allowed(goal_status: Optional[str]) -> bool:
    return _norm_goal_status(goal_status) in MILESTONE_EDITABLE_STATUSES

def clear_goals_caches():
    """Clear all caches (useful for testing or when employee data changes)"""
    global _employee_id_cache, _manager_check_cache
    _employee_id_cache.clear()
    _manager_check_cache.clear()
    logger.info("Goals API caches cleared")

# Optimized parsing function for goals (faster than generic parse_dynamodb_item)
def parse_goal_item_fast(item: Dict[str, Any]) -> Dict[str, Any]:
    """Fast parsing for goal items - optimized to avoid deep recursion"""
    item = parse_dynamodb_item(item, "goals")
    parsed = {}
    string_date_fields = {'created_at', 'updated_at', 'targetDate', 'dueDate', 'completedDate'}
    
    for key, value in item.items():
        if key in string_date_fields:
            # Keep date fields as strings
            if isinstance(value, datetime):
                parsed[key] = value.isoformat()
            elif isinstance(value, str):
                parsed[key] = value
            else:
                parsed[key] = str(value) if value is not None else None
        elif isinstance(value, Decimal):
            parsed[key] = float(value)
        elif isinstance(value, list):
            # Optimize milestone parsing - avoid deep recursion
            if key == 'milestones':
                parsed[key] = []
                for milestone in value:
                    if isinstance(milestone, dict):
                        milestone_parsed = {}
                        for k, v in milestone.items():
                            if isinstance(v, Decimal):
                                milestone_parsed[k] = float(v)
                            elif isinstance(v, datetime):
                                milestone_parsed[k] = v.isoformat()
                            elif k in ['dueDate', 'completedDate']:
                                milestone_parsed[k] = str(v) if v is not None else None
                            else:
                                milestone_parsed[k] = v
                        parsed[key].append(milestone_parsed)
                    else:
                        parsed[key].append(milestone)
            else:
                parsed[key] = [float(v) if isinstance(v, Decimal) else v for v in value]
        elif isinstance(value, dict):
            # Shallow parse nested dicts (one level only for performance)
            parsed[key] = {
                k: (float(v) if isinstance(v, Decimal) else (v.isoformat() if isinstance(v, datetime) else v))
                for k, v in value.items()
            }
        elif isinstance(value, datetime):
            parsed[key] = value.isoformat()
        else:
            parsed[key] = value
    
    return parsed

router = APIRouter(
    prefix="/api/goals",
    tags=["goals"],
    responses={404: {"description": "Not found"}},
)

# Helper function to check if user is manager of employee (with caching and batch optimization)
async def is_manager_of_employee(manager_id: str, employee_id: str) -> bool:
    """Check if the manager_id is the manager of employee_id with caching"""
    try:
        # Check cache first
        cache_key = f"{manager_id}:{employee_id}"
        current_time = time.time()
        
        if cache_key in _manager_check_cache:
            is_manager, timestamp = _manager_check_cache[cache_key]
            if current_time - timestamp < CACHE_DURATION:
                return is_manager
            # Cache expired, remove it
            del _manager_check_cache[cache_key]
        
        employees_table = await get_employees_table()
        
        # Fetch both employee and manager in parallel for better performance
        employee_response, manager_response = await asyncio.gather(
            employees_table.get_item(Key={"id": employee_id}),
            employees_table.get_item(Key={"id": manager_id}),
            return_exceptions=True
        )
        
        # Handle employee response
        if isinstance(employee_response, Exception):
            logger.warning(f"Error fetching employee: {str(employee_response)}")
            _manager_check_cache[cache_key] = (False, current_time)
            return False
        
        if "Item" not in employee_response:
            _manager_check_cache[cache_key] = (False, current_time)
            return False
        
        employee = parse_dynamodb_item(employee_response["Item"], "employees")
        reporting_to = employee.get("reporting_to")
        
        # Check if reporting_to matches manager_id directly
        if reporting_to == manager_id:
            _manager_check_cache[cache_key] = (True, current_time)
            return True
        
        # Check if manager's employee_id matches
        if not isinstance(manager_response, Exception) and "Item" in manager_response:
            manager = parse_dynamodb_item(manager_response["Item"], "employees")
            manager_employee_id = manager.get("employee_id")
            if reporting_to == manager_employee_id:
                _manager_check_cache[cache_key] = (True, current_time)
                return True
        
        _manager_check_cache[cache_key] = (False, current_time)
        return False
        
    except Exception as e:
        logger.error(f"Error checking manager relationship: {str(e)}")
        return False

# Helper function to get employee ID from user email (with caching)
async def get_employee_id_from_user(user: dict) -> Optional[str]:
    """Get employee ID from user email with caching - optimized similar to employee API"""
    try:
        user_email = user.get("email") or user.get("username")
        if not user_email:
            return None
        
        email_key = user_email.lower().strip()
        current_time = time.time()
        
        # Check cache first (fast path)
        if email_key in _employee_id_cache:
            employee_id, timestamp = _employee_id_cache[email_key]
            if current_time - timestamp < CACHE_DURATION:
                return employee_id
            # Cache expired, remove it
            del _employee_id_cache[email_key]
        
        # Cache miss - query database using GSI (same pattern as employee API)
        employees_table = await get_employees_table()
        response = await employees_table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": email_key},
            Limit=1,  # Only need first result
            ProjectionExpression="id"  # Only fetch id field for better performance
        )
        
        if response.get("Items"):
            # Parse only the id field (faster than full parse)
            item = response["Items"][0]
            employee_id = item.get("id")
            if employee_id:
                # Cache the result
                _employee_id_cache[email_key] = (employee_id, current_time)
                return employee_id
        return None
    except Exception as e:
        logger.error(f"Error getting employee ID from user: {str(e)}")
        return None

# ==================== GOALS ENDPOINTS ====================

@router.post("/", response_model=GoalInDB, status_code=status.HTTP_201_CREATED)
async def create_goal(
    goal: GoalCreate = Body(...),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Create a new goal.
    - Employees can create goals for themselves (status: pending)
    - Managers can create goals for their direct reports (status: in_progress)
    """
    try:
        # Get current user's employee ID
        user_employee_id = await get_employee_id_from_user(current_user)
        if not user_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current user's employee ID not found"
            )
        
        # Verify permissions
        is_self = user_employee_id == goal.employeeId
        is_manager = False
        
        if not is_self:
            is_manager = await is_manager_of_employee(user_employee_id, goal.employeeId)
            if not is_manager:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only set goals for yourself or your direct reports"
                )
        
        # Verify employee exists
        employees_table = await get_employees_table()
        employee_response = await employees_table.get_item(Key={"id": goal.employeeId})
        if "Item" not in employee_response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Create goal
        now = datetime.utcnow().isoformat()
        goal_id = generate_id()
        
        # Employees submit goals for approval first; milestones are only allowed
        # after manager approval/in_progress. Block pre-approval milestone creation.
        if is_self and goal.milestones:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Milestones can only be added after manager approval"
            )

        # Convert milestones
        milestones = []
        if goal.milestones:
            for milestone in goal.milestones:
                milestones.append({
                    "id": generate_id(),
                    "title": milestone.title,
                    "completed": False,
                    "dueDate": milestone.dueDate,
                    "evidence": None,
                    "completedDate": None,
                    "managerApproved": None,
                    "managerReopened": None,
                    "managerComment": None,
                    "userComment": None
                })
        
        # Set initial status: 'pending' if created by employee, 'in_progress' if by manager
        initial_status = "pending" if is_self else "in_progress"
        
        goal_dict = {
            "id": goal_id,
            "employeeId": goal.employeeId,
            "title": goal.title,
            "description": goal.description or "",
            "category": goal.category,
            "targetDate": goal.targetDate,
            "status": initial_status,
            "completion": 0.0,
            "weightage": goal.weightage,
            "milestones": milestones,
            "createdBy": user_employee_id,
            "managerApproved": None,
            "managerReopened": None,
            "created_at": now,
            "updated_at": now
        }
        
        # Insert into DynamoDB
        table = await get_goals_table()
        formatted_item = format_dynamodb_item(goal_dict, "goals")
        await table.put_item(Item=formatted_item)
        
        # Return created goal
        response = await table.get_item(Key={"id": goal_id})
        created_goal = parse_dynamodb_item(response["Item"], "goals")
        return GoalInDB(**created_goal)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create goal: {str(e)}"
        )

@router.get("/batch", response_model=Dict[str, List[GoalInDB]])
async def get_batch_employee_goals(
    employeeIds: str = Query(..., description="Comma-separated list of employee IDs"),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get goals for multiple employees in a single request (batch endpoint).
    Optimized for loading team member goals efficiently.
    Returns a dictionary mapping employeeId -> list of goals.
    """
    try:
        start_time = time.time()
        
        # Parse employee IDs
        employee_id_list = [eid.strip() for eid in employeeIds.split(',') if eid.strip()]
        if not employee_id_list:
            return {}
        
        # Get user's employee ID for permission checks
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Get table
        table = await get_goals_table()
        
        # Fetch goals for all employees in parallel using asyncio.gather
        async def fetch_employee_goals(employee_id: str):
            """Fetch goals for a single employee using GSI query."""
            try:
                response = await table.query(
                    IndexName="EmployeeIndex",
                    KeyConditionExpression="employeeId = :employeeId",
                    ExpressionAttributeValues={":employeeId": employee_id}
                )
                
                goals = []
                for item in response.get("Items", []):
                    try:
                        parsed_item = parse_goal_item_fast(item)
                        goals.append(GoalInDB(**parsed_item))
                    except Exception as parse_error:
                        logger.warning(f"Error parsing goal for {employee_id}: {str(parse_error)}")
                        continue
                
                return employee_id, goals
            except Exception as e:
                logger.error(f"Error fetching goals for {employee_id}: {str(e)}")
                return employee_id, []
        
        # Fetch all goals in parallel
        results = await asyncio.gather(*[fetch_employee_goals(eid) for eid in employee_id_list])
        
        # Build result dictionary
        result_dict = {}
        for employee_id, goals in results:
            # Permission check: user can view their own goals or their team members' goals
            if employee_id != user_employee_id:
                # Check if user is manager of this employee
                if not user_employee_id or not await is_manager_of_employee(user_employee_id, employee_id):
                    # Skip goals for employees the user doesn't have permission to view
                    logger.warning(f"User {user_employee_id} doesn't have permission to view goals for {employee_id}")
                    result_dict[employee_id] = []
                    continue
            
            result_dict[employee_id] = goals
        
        total_time = time.time() - start_time
        logger.info(f"get_batch_employee_goals: {total_time:.3f}s total for {len(employee_id_list)} employees")
        
        return result_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching batch employee goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch batch goals: {str(e)}"
        )

@router.get("/employee/{employee_id}", response_model=List[GoalInDB])
async def get_employee_goals(
    employee_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all goals for an employee
    User can view their own goals, Manager can view goals of their team members
    Optimized: Direct GSI query first, permission check deferred (matches employee API pattern exactly)
    """
    try:
        start_time = time.time()
        
        # Get table and fetch goals IMMEDIATELY (like employee API - no permission check blocking)
        table = await get_goals_table()
        table_time = time.time() - start_time
        
        # Fetch goals using GSI query - EXACT same pattern as employee API uses EmailIndex
        # Using EmployeeIndex GSI for efficient lookup by employeeId (HASH key)
        query_start = time.time()
        response = await table.query(
            IndexName="EmployeeIndex",
            KeyConditionExpression="employeeId = :employeeId",
            ExpressionAttributeValues={":employeeId": employee_id}
        )
        query_time = time.time() - query_start
        
        # Parse items efficiently
        parse_start = time.time()
        goals = []
        items = response.get("Items", [])
        
        for item in items:
            try:
                parsed_item = parse_goal_item_fast(item)
                goals.append(GoalInDB(**parsed_item))
            except Exception as parse_error:
                logger.warning(f"Error parsing/validating goal item: {str(parse_error)}")
                continue
        
        parse_time = time.time() - parse_start
        
        # Permission check AFTER fetching (deferred, like employee API pattern)
        # This allows fast response even if permission check is slow
        perm_start = time.time()
        user_employee_id = await get_employee_id_from_user(current_user)
        
        if employee_id != user_employee_id:
            # Only check manager relationship if viewing someone else's goals
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, employee_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view these goals"
                )
        perm_time = time.time() - perm_start
        
        total_time = time.time() - start_time
        logger.info(f"get_employee_goals: {total_time:.3f}s total (table: {table_time:.3f}s, query: {query_time:.3f}s, parse: {parse_time:.3f}s, perm: {perm_time:.3f}s, items: {len(goals)})")
        
        return goals
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch goals: {str(e)}"
        )

@router.get("/{goal_id}", response_model=GoalInDB)
async def get_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get a specific goal by ID
    User can view their own goals, Manager can view goals of their team members
    """
    try:
        table = await get_goals_table()
        response = await table.get_item(Key={"id": goal_id})
        
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check if user owns the goal or is the manager
        if goal.get("employeeId") == user_employee_id:
            return GoalInDB(**goal)
        
        # Check if user is manager of the employee
        if user_employee_id and await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
            return GoalInDB(**goal)
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this goal"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch goal: {str(e)}"
        )

@router.put("/{goal_id}", response_model=GoalInDB)
async def update_goal(
    goal_id: str,
    goal_update: GoalUpdate = Body(...),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Update a goal.
    - Employees can edit their own goals if status is 'pending' or 'manager_reopened'.
    - Managers can edit goals of their direct reports and approve them (status -> 'in_progress').
    """
    try:
        table = await get_goals_table()
        
        # Get existing goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        existing_goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        is_owner = existing_goal.get("employeeId") == user_employee_id
        is_manager = await is_manager_of_employee(user_employee_id, existing_goal.get("employeeId"))
        
        if not is_owner and not is_manager:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this goal"
            )
            
        # If employee is updating, check status (only allow editing if not already approved/in progress)
        if is_owner and not is_manager:
            if existing_goal.get("status") not in ["pending", "manager_reopened"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot edit goal once it has been approved and is in progress"
                )
            # Before manager approval, reportee can edit proposal details but not milestones.
            if "milestones" in goal_update.dict(exclude_unset=True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Milestones can only be updated after manager approval"
                )
        
        # Update goal
        update_data = {k: v for k, v in goal_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        # Special handling for status transitions
        # If manager updates a 'pending' goal, they might be approving it
        if is_manager and existing_goal.get("status") == "pending" and "status" not in update_data:
            # Optionally auto-approve if manager edits? 
            # Or better: require explicit status change or assume if they edit it they might approve it?
            # Let's keep it flexible. The UI will send the new status.
            pass

        # Recalculate completion if milestones are updated
        if "milestones" in update_data and update_data["milestones"]:
            completed_count = sum(1 for m in update_data["milestones"] if m.get("completed", False))
            total_count = len(update_data["milestones"])
            update_data["completion"] = (completed_count / total_count * 100) if total_count > 0 else 0.0
            
            # Check if all milestones completed
            all_completed = all(m.get("completed", False) for m in update_data["milestones"])
            if all_completed and existing_goal.get("status") == "in_progress":
                update_data["status"] = "pending_manager_approval"
        
        # Merge with existing data
        updated_goal = {**existing_goal, **update_data}
        
        # Format and save
        formatted_item = format_dynamodb_item(updated_goal, "goals")
        await table.put_item(Item=formatted_item)
        
        # Return updated goal
        updated_response = await table.get_item(Key={"id": goal_id})
        updated_goal_data = parse_dynamodb_item(updated_response["Item"], "goals")
        return GoalInDB(**updated_goal_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update goal: {str(e)}"
        )

@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Delete a goal.
    - Owner can delete if status is 'pending'.
    - Manager can delete goals of their team members.
    """
    try:
        table = await get_goals_table()
        
        # Get existing goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        existing_goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        is_owner = existing_goal.get("employeeId") == user_employee_id
        is_manager = await is_manager_of_employee(user_employee_id, existing_goal.get("employeeId"))
        
        if not is_owner and not is_manager:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this goal"
            )
        
        # If owner (not manager), only allow deleting if pending
        if is_owner and not is_manager:
            if existing_goal.get("status") != "pending":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only delete goals that are pending approval"
                )
        
        # Delete goal
        await table.delete_item(Key={"id": goal_id})
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete goal: {str(e)}"
        )

# ==================== MILESTONE ENDPOINTS ====================

@router.post("/{goal_id}/milestones", response_model=MilestoneBase, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    goal_id: str,
    milestone: MilestoneCreate = Body(...),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Create a new milestone for a goal
    User/Manager can create milestones for goals they have access to
    """
    try:
        table = await get_goals_table()
        
        # Get goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions
        if goal.get("employeeId") != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to add milestones to this goal"
                )
        
        if not _milestone_edits_allowed(goal.get("status")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Milestones can only be added after manager approval"
            )

        # Create milestone
        new_milestone = {
            "id": generate_id(),
            "title": milestone.title,
            "completed": False,
            "dueDate": milestone.dueDate,
            "evidence": None,
            "completedDate": None,
            "managerApproved": None,
            "managerReopened": None,
            "managerComment": None,
            "userComment": None
        }
        
        # Add milestone to goal
        milestones = goal.get("milestones", [])
        milestones.append(new_milestone)
        
        # Recalculate completion
        completed_count = sum(1 for m in milestones if m.get("completed", False))
        total_count = len(milestones)
        completion = (completed_count / total_count * 100) if total_count > 0 else 0.0
        
        # Update goal
        goal["milestones"] = milestones
        goal["completion"] = completion
        goal["updated_at"] = datetime.utcnow().isoformat()
        
        formatted_item = format_dynamodb_item(goal, "goals")
        await table.put_item(Item=formatted_item)
        
        return MilestoneBase(**new_milestone)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating milestone: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create milestone: {str(e)}"
        )

@router.put("/{goal_id}/milestones/{milestone_id}", response_model=MilestoneBase)
async def update_milestone(
    goal_id: str,
    milestone_id: str,
    milestone_update: MilestoneUpdate = Body(...),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Update a milestone
    User/Manager can update milestones for goals they have access to
    """
    try:
        table = await get_goals_table()
        
        # Get goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions
        if goal.get("employeeId") != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to update milestones for this goal"
                )
        
        if not _milestone_edits_allowed(goal.get("status")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Milestones can only be updated after manager approval"
            )

        # Find and update milestone
        milestones = goal.get("milestones", [])
        milestone_found = False
        
        for i, milestone in enumerate(milestones):
            if milestone.get("id") == milestone_id:
                # Update milestone
                update_data = {k: v for k, v in milestone_update.dict().items() if v is not None}
                
                # If marking as completed, set completedDate
                if update_data.get("completed") and not milestone.get("completedDate"):
                    update_data["completedDate"] = datetime.utcnow().isoformat()
                
                # If reopening, clear completedDate
                if update_data.get("completed") == False:
                    update_data["completedDate"] = None
                
                milestones[i] = {**milestone, **update_data}
                milestone_found = True
                break
        
        if not milestone_found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Milestone not found"
            )
        
        # Recalculate completion
        completed_count = sum(1 for m in milestones if m.get("completed", False))
        total_count = len(milestones)
        completion = (completed_count / total_count * 100) if total_count > 0 else 0.0
        
        # Check if all milestones completed
        all_completed = all(m.get("completed", False) for m in milestones)
        if all_completed and goal.get("status") == "in_progress":
            goal["status"] = "pending_manager_approval"
        elif not all_completed and goal.get("status") == "pending_manager_approval":
            goal["status"] = "in_progress"
        
        # Update goal
        goal["milestones"] = milestones
        goal["completion"] = completion
        goal["updated_at"] = datetime.utcnow().isoformat()
        
        formatted_item = format_dynamodb_item(goal, "goals")
        await table.put_item(Item=formatted_item)
        
        # Return updated milestone
        updated_milestone = next((m for m in milestones if m.get("id") == milestone_id), None)
        if updated_milestone:
            return MilestoneBase(**updated_milestone)
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve updated milestone"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating milestone: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update milestone: {str(e)}"
        )

@router.delete("/{goal_id}/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    goal_id: str,
    milestone_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Delete a milestone
    User can delete milestones from their own goals
    """
    try:
        table = await get_goals_table()
        
        # Get goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions - only user can delete their own milestones
        if goal.get("employeeId") != user_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete milestones from your own goals"
            )
        
        if not _milestone_edits_allowed(goal.get("status")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Milestones can only be changed after manager approval"
            )

        # Remove milestone
        milestones = goal.get("milestones", [])
        original_count = len(milestones)
        milestones = [m for m in milestones if m.get("id") != milestone_id]
        
        if len(milestones) == original_count:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Milestone not found"
            )
        
        # Recalculate completion
        completed_count = sum(1 for m in milestones if m.get("completed", False))
        total_count = len(milestones)
        completion = (completed_count / total_count * 100) if total_count > 0 else 0.0
        
        # Update goal
        goal["milestones"] = milestones
        goal["completion"] = completion
        goal["updated_at"] = datetime.utcnow().isoformat()
        
        formatted_item = format_dynamodb_item(goal, "goals")
        await table.put_item(Item=formatted_item)
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting milestone: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete milestone: {str(e)}"
        )

@router.get("/{goal_id}/milestones", response_model=List[MilestoneBase])
async def get_milestones(
    goal_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all milestones for a goal
    User can view milestones of their own goals, Manager can view milestones of team member goals
    """
    try:
        table = await get_goals_table()
        
        # Get goal
        response = await table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        
        goal = parse_dynamodb_item(response["Item"], "goals")
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions
        if goal.get("employeeId") != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view milestones for this goal"
                )
        
        milestones = goal.get("milestones", [])
        return [MilestoneBase(**m) for m in milestones]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching milestones: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch milestones: {str(e)}"
        )

# ==================== NOTIFICATION ENDPOINTS ====================

@router.post("/notifications/check-due-milestones")
async def check_due_milestones_notification(
    days_ahead: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Check and send notifications for milestones due within specified days
    This endpoint can be called periodically (e.g., via cron job)
    """
    try:
        result = await send_milestone_notifications(days_ahead)
        return {
            "success": True,
            "notifications_sent": result.get("notifications_sent", 0),
            "message": f"Checked milestones due within {days_ahead} days"
        }
    except Exception as e:
        logger.error(f"Error checking due milestones: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check due milestones: {str(e)}"
        )

@router.get("/notifications/overdue")
async def get_overdue_milestones(
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all overdue milestones
    """
    try:
        overdue = await check_overdue_milestones()
        return {
            "overdue_count": len(overdue),
            "overdue_milestones": overdue
        }
    except Exception as e:
        logger.error(f"Error fetching overdue milestones: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch overdue milestones: {str(e)}"
        )
