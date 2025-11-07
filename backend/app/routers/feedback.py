from fastapi import APIRouter, HTTPException, status, Body, Depends
from typing import List, Optional
import uuid
from datetime import datetime
from ..models.feedback import FeedbackCreate, FeedbackUpdate, FeedbackInDB
from ..database import db
from ..security import get_current_active_user

router = APIRouter(
    prefix="/api/feedback",
    tags=["feedback"],
    responses={404: {"description": "Not found"}},
)

feedback_collection = db["feedback"]

# Helper to convert doc to FeedbackInDB
async def feedback_doc_to_model(doc):
    doc["id"] = doc["_id"]
    del doc["_id"]
    return FeedbackInDB(**doc)

@router.post("/", response_model=FeedbackInDB, status_code=201)
async def create_feedback(feedback: FeedbackCreate = Body(...), current_user: dict = Depends(get_current_active_user)):
    now = datetime.utcnow().isoformat()
    feedback_dict = feedback.dict()
    feedback_dict["_id"] = str(uuid.uuid4())
    feedback_dict["created_at"] = now
    feedback_dict["updated_at"] = now
    result = await feedback_collection.insert_one(feedback_dict)
    doc = await feedback_collection.find_one({"_id": feedback_dict["_id"]})
    return await feedback_doc_to_model(doc)

@router.get("/to/{employee_id}", response_model=List[FeedbackInDB])
async def list_feedback_inbox(employee_id: str, current_user: dict = Depends(get_current_active_user)):
    cursor = feedback_collection.find({"toEmployeeId": employee_id})
    feedbacks = []
    async for doc in cursor:
        feedbacks.append(await feedback_doc_to_model(doc))
    return feedbacks

@router.get("/from/{employee_id}", response_model=List[FeedbackInDB])
async def list_feedback_outbox(employee_id: str, current_user: dict = Depends(get_current_active_user)):
    cursor = feedback_collection.find({"fromEmployeeId": employee_id})
    feedbacks = []
    async for doc in cursor:
        feedbacks.append(await feedback_doc_to_model(doc))
    return feedbacks

@router.put("/{feedback_id}", response_model=FeedbackInDB)
async def update_feedback(feedback_id: str, feedback_update: FeedbackUpdate = Body(...), current_user: dict = Depends(get_current_active_user)):
    update_data = {k: v for k, v in feedback_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    result = await feedback_collection.update_one({"_id": feedback_id}, {"$set": update_data})
    if result.get("modified_count", 0) == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    doc = await feedback_collection.find_one({"_id": feedback_id})
    return await feedback_doc_to_model(doc) 