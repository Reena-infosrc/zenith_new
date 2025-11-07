from fastapi import APIRouter, HTTPException, status, Body, Depends
from typing import List, Optional
import uuid
from datetime import datetime
from ..models.goal import GoalCreate, GoalUpdate, GoalInDB
from ..database import db
from ..security import get_current_active_user

router = APIRouter(
    prefix="/api/goals",
    tags=["goals"],
    responses={404: {"description": "Not found"}},
)

goals_collection = db["goals"]

# Helper to convert doc to GoalInDB
async def goal_doc_to_model(doc):
    doc["id"] = doc["_id"]
    del doc["_id"]
    return GoalInDB(**doc)

@router.get("/employee/{employee_id}", response_model=List[GoalInDB])
async def list_goals(employee_id: str, current_user: dict = Depends(get_current_active_user)):
    cursor = goals_collection.find({"employeeId": employee_id})
    goals = []
    async for doc in cursor:
        goals.append(await goal_doc_to_model(doc))
    return goals

@router.post("/", response_model=GoalInDB, status_code=201)
async def create_goal(goal: GoalCreate = Body(...), current_user: dict = Depends(get_current_active_user)):
    now = datetime.utcnow().isoformat()
    goal_dict = goal.dict()
    goal_dict["_id"] = str(uuid.uuid4())
    goal_dict["created_at"] = now
    goal_dict["updated_at"] = now
    result = await goals_collection.insert_one(goal_dict)
    doc = await goals_collection.find_one({"_id": goal_dict["_id"]})
    return await goal_doc_to_model(doc)

@router.put("/{goal_id}", response_model=GoalInDB)
async def update_goal(goal_id: str, goal_update: GoalUpdate = Body(...), current_user: dict = Depends(get_current_active_user)):
    update_data = {k: v for k, v in goal_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    result = await goals_collection.update_one({"_id": goal_id}, {"$set": update_data})
    if result.get("modified_count", 0) == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    doc = await goals_collection.find_one({"_id": goal_id})
    return await goal_doc_to_model(doc)

@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str, current_user: dict = Depends(get_current_active_user)):
    result = await goals_collection.delete_one({"_id": goal_id})
    if result.get("deleted_count", 0) == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return None 