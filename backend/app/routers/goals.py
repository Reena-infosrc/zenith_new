from fastapi import APIRouter, HTTPException, status, Body, Depends, Query
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
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

router = APIRouter(
    prefix="/api/goals",
    tags=["goals"],
    responses={404: {"description": "Not found"}},
)

# Helper function to check if user is manager of employee
async def is_manager_of_employee(manager_id: str, employee_id: str) -> bool:
    """Check if the manager_id is the manager of employee_id"""
    try:
        employees_table = await get_employees_table()
        response = await employees_table.get_item(Key={"id": employee_id})
        
        if "Item" not in response:
            return False
        
        employee = parse_dynamodb_item(response["Item"])
        reporting_to = employee.get("reporting_to")
        
        # Check if reporting_to matches manager_id or manager's employee_id
        if reporting_to == manager_id:
            return True
        
        # Also check if manager's employee_id matches
        manager_response = await employees_table.get_item(Key={"id": manager_id})
        if "Item" in manager_response:
            manager = parse_dynamodb_item(manager_response["Item"])
            manager_employee_id = manager.get("employee_id")
            if reporting_to == manager_employee_id:
                return True
        
        return False
    except Exception as e:
        logger.error(f"Error checking manager relationship: {str(e)}")
        return False

# Helper function to get employee ID from user email
async def get_employee_id_from_user(user: dict) -> Optional[str]:
    """Get employee ID from user email"""
    try:
        user_email = user.get("email") or user.get("username")
        if not user_email:
            return None
        
        employees_table = await get_employees_table()
        response = await employees_table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": user_email.lower().strip()}
        )
        
        if response.get("Items"):
            employee = parse_dynamodb_item(response["Items"][0])
            return employee.get("id")
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
    Create a new goal for a team member (Manager only)
    Manager can set goals for their direct reports
    """
    try:
        # Get manager's employee ID
        manager_employee_id = await get_employee_id_from_user(current_user)
        if not manager_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Manager employee ID not found"
            )
        
        # Verify manager is the manager of the employee
        if not await is_manager_of_employee(manager_employee_id, goal.employeeId):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only set goals for your direct reports"
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
        
        goal_dict = {
            "id": goal_id,
            "employeeId": goal.employeeId,
            "title": goal.title,
            "description": goal.description or "",
            "category": goal.category,
            "targetDate": goal.targetDate,
            "status": "in_progress",
            "completion": 0.0,
            "weightage": goal.weightage,  # Include weightage if provided
            "milestones": milestones,
            "createdBy": manager_employee_id,
            "managerApproved": None,
            "managerReopened": None,
            "created_at": now,
            "updated_at": now
        }
        
        # Insert into DynamoDB
        table = await get_goals_table()
        formatted_item = format_dynamodb_item(goal_dict)
        await table.put_item(Item=formatted_item)
        
        # Return created goal
        response = await table.get_item(Key={"id": goal_id})
        created_goal = parse_dynamodb_item(response["Item"])
        return GoalInDB(**created_goal)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create goal: {str(e)}"
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
        
        goal = parse_dynamodb_item(response["Item"])
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

@router.get("/employee/{employee_id}", response_model=List[GoalInDB])
async def get_employee_goals(
    employee_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all goals for an employee
    User can view their own goals, Manager can view goals of their team members
    """
    try:
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check if user owns the goals or is the manager
        if employee_id != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, employee_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view these goals"
                )
        
        table = await get_goals_table()
        response = await table.query(
            IndexName="EmployeeIndex",
            KeyConditionExpression="employeeId = :employeeId",
            ExpressionAttributeValues={":employeeId": employee_id}
        )
        
        goals = []
        for item in response.get("Items", []):
            goal = parse_dynamodb_item(item)
            goals.append(GoalInDB(**goal))
        
        return goals
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch goals: {str(e)}"
        )

@router.put("/{goal_id}", response_model=GoalInDB)
async def update_goal(
    goal_id: str,
    goal_update: GoalUpdate = Body(...),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Update a goal (Manager only)
    Manager can edit goals they created for their team members
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
        
        existing_goal = parse_dynamodb_item(response["Item"])
        manager_employee_id = await get_employee_id_from_user(current_user)
        
        # Verify manager created this goal or is manager of the employee
        if existing_goal.get("createdBy") != manager_employee_id:
            if not manager_employee_id or not await is_manager_of_employee(manager_employee_id, existing_goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only edit goals you created for your team members"
                )
        
        # Update goal
        update_data = {k: v for k, v in goal_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
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
        formatted_item = format_dynamodb_item(updated_goal)
        await table.put_item(Item=formatted_item)
        
        # Return updated goal
        updated_response = await table.get_item(Key={"id": goal_id})
        updated_goal_data = parse_dynamodb_item(updated_response["Item"])
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
    Delete a goal (Manager only)
    Manager can delete goals they created for their team members
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
        
        existing_goal = parse_dynamodb_item(response["Item"])
        manager_employee_id = await get_employee_id_from_user(current_user)
        
        # Verify manager created this goal
        if existing_goal.get("createdBy") != manager_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete goals you created"
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
        
        goal = parse_dynamodb_item(response["Item"])
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions
        if goal.get("employeeId") != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to add milestones to this goal"
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
        
        formatted_item = format_dynamodb_item(goal)
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
        
        goal = parse_dynamodb_item(response["Item"])
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions
        if goal.get("employeeId") != user_employee_id:
            if not user_employee_id or not await is_manager_of_employee(user_employee_id, goal.get("employeeId")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to update milestones for this goal"
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
        
        formatted_item = format_dynamodb_item(goal)
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
        
        goal = parse_dynamodb_item(response["Item"])
        user_employee_id = await get_employee_id_from_user(current_user)
        
        # Check permissions - only user can delete their own milestones
        if goal.get("employeeId") != user_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete milestones from your own goals"
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
        
        formatted_item = format_dynamodb_item(goal)
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
        
        goal = parse_dynamodb_item(response["Item"])
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
