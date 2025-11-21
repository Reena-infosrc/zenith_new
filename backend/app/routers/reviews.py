from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
import logging

from ..models.review import (
    ReviewCycleCreate,
    ReviewCycleUpdate,
    ReviewCycleInDB,
    ReviewCreate,
    ReviewUpdate,
    ReviewInDB,
)
from ..database_dynamodb import (
    get_reviews_table,
    get_employees_table,
    get_goals_table,
    format_dynamodb_item,
    parse_dynamodb_item,
    generate_id,
)
from ..security import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/reviews",
    tags=["reviews"],
    responses={404: {"description": "Not found"}},
)

CYCLE_PK_PREFIX = "CYCLE#"
REVIEW_SK_PREFIX = "REVIEW#"
CYCLE_SK_VALUE = "CYCLE"
ENTITY_TYPE_CYCLE = "cycle"
ENTITY_TYPE_REVIEW = "review"


def _cycle_pk(year: str) -> str:
    return f"{CYCLE_PK_PREFIX}{year}"


def _review_sk(review_id: str) -> str:
    return f"{REVIEW_SK_PREFIX}{review_id}"


def _format_value(value: Any) -> Any:
    formatted = format_dynamodb_item({"_v": value})
    return formatted.get("_v")


def _map_cycle(item: Dict[str, Any]) -> ReviewCycleInDB:
    parsed = parse_dynamodb_item(item)
    
    # Ensure date fields are ISO strings, not datetime objects
    def to_iso_string(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, str):
            return value
        return str(value) if value else None
    
    return ReviewCycleInDB(
        cycleId=parsed.get("year"),
        year=parsed.get("year"),
        name=parsed.get("name"),
        description=parsed.get("description"),
        status=parsed.get("status", "draft"),
        startDate=to_iso_string(parsed.get("startDate")),
        endDate=to_iso_string(parsed.get("endDate")),
        metadata=parsed.get("metadata", {}),
        createdAt=to_iso_string(parsed.get("createdAt")),
        updatedAt=to_iso_string(parsed.get("updatedAt")),
    )


def _map_review(item: Dict[str, Any]) -> ReviewInDB:
    parsed = parse_dynamodb_item(item)
    return ReviewInDB(
        reviewId=parsed["reviewId"],
        cycleYear=parsed["cycleYear"],
        employeeId=parsed["employeeId"],
        reviewerId=parsed["reviewerId"],
        reviewType=parsed.get("reviewType", "self"),
        goalIds=parsed.get("goalIds", []),
        ratings=parsed.get("ratings"),
        comments=parsed.get("comments"),
        strengths=parsed.get("strengths", []),
        improvements=parsed.get("improvements", []),
        attachments=parsed.get("attachments", []),
        metadata=parsed.get("metadata", {}),
        isDraft=parsed.get("isDraft", False),
        submittedAt=parsed.get("submittedAt"),
        createdAt=parsed.get("createdAt"),
        updatedAt=parsed.get("updatedAt"),
    )


async def _ensure_cycle(table, year: str) -> Dict[str, Any]:
    response = await table.get_item(Key={"pk": _cycle_pk(year), "sk": CYCLE_SK_VALUE})
    if "Item" not in response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review cycle {year} not found",
        )
    return response["Item"]


async def _fetch_review_by_id(table, review_id: str) -> Dict[str, Any]:
    response = await table.query(
        IndexName="ReviewIdIndex",
        KeyConditionExpression=Key("reviewId").eq(review_id),
        Limit=1,
    )
    items = response.get("Items", [])
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id} not found",
        )
    return items[0]


async def _validate_employee_and_goals(
    employee_id: str,
    goal_ids: List[str],
    enforce_goal_existence: bool = True
) -> None:
    employees_table = await get_employees_table()
    employee_response = await employees_table.get_item(Key={"id": employee_id})
    if "Item" not in employee_response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {employee_id} not found",
        )

    if not goal_ids:
        return

    goals_table = await get_goals_table()
    missing_goals = []
    for goal_id in goal_ids:
        response = await goals_table.get_item(Key={"id": goal_id})
        if "Item" not in response:
            missing_goals.append(goal_id)

    if missing_goals:
        warning_message = f"Goal(s) not found for employee {employee_id}: {', '.join(missing_goals)}"
        if enforce_goal_existence:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=warning_message,
            )
        logger.warning(warning_message)


def _build_update_expression(payload: Dict[str, Any]) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
    set_clauses = []
    remove_clauses = []
    attr_names: Dict[str, str] = {}
    attr_values: Dict[str, Any] = {}

    for idx, (field, value) in enumerate(payload.items()):
        placeholder_name = f"#f{idx}"
        attr_names[placeholder_name] = field

        if value is None:
            remove_clauses.append(placeholder_name)
            continue

        placeholder_value = f":v{idx}"
        attr_values[placeholder_value] = _format_value(value)
        set_clauses.append(f"{placeholder_name} = {placeholder_value}")

    expressions = []
    if set_clauses:
        expressions.append("SET " + ", ".join(set_clauses))
    if remove_clauses:
        expressions.append("REMOVE " + ", ".join(remove_clauses))

    if not expressions:
        raise ValueError("No valid fields supplied for update")

    return " ".join(expressions), attr_names, attr_values


# ------------------------
# Cycle endpoints
# ------------------------

@router.post(
    "/cycles",
    response_model=ReviewCycleInDB,
    status_code=status.HTTP_201_CREATED,
)
async def create_cycle(
    cycle: ReviewCycleCreate,
    current_user: dict = Depends(get_current_active_user),
):
    """Create a new yearly review cycle."""
    del current_user  # Unused but enforces auth
    table = await get_reviews_table()
    pk = _cycle_pk(cycle.year)
    now = datetime.utcnow().isoformat()

    item = {
        "pk": pk,
        "sk": CYCLE_SK_VALUE,
        "entityType": ENTITY_TYPE_CYCLE,
        "year": cycle.year,
        "name": cycle.name,
        "description": cycle.description,
        "status": cycle.status or "draft",
        "startDate": cycle.startDate,
        "endDate": cycle.endDate,
        "metadata": cycle.metadata or {},
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        await table.put_item(
            Item=format_dynamodb_item(item),
            ConditionExpression="attribute_not_exists(pk)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Review cycle {cycle.year} already exists",
            )
        logger.exception("Failed to create review cycle")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create review cycle",
        ) from exc

    return _map_cycle(item)


@router.get("/cycles", response_model=List[ReviewCycleInDB])
async def list_cycles(
    current_user: dict = Depends(get_current_active_user),
):
    """List all review cycles."""
    del current_user
    table = await get_reviews_table()
    cycles = []
    
    try:
        # Query all cycles using EntityTypeIndex
        response = await table.query(
            IndexName="EntityTypeIndex",
            KeyConditionExpression=Key("entityType").eq(ENTITY_TYPE_CYCLE)
        )
        
        items = response.get("Items", [])
        for item in items:
            parsed = parse_dynamodb_item(item)
            if parsed.get("sk") == CYCLE_SK_VALUE:  # Only get cycle items, not reviews
                cycles.append(_map_cycle(item))
        
        # Sort by year descending (most recent first)
        cycles.sort(key=lambda x: x.year, reverse=True)
        
    except ClientError as exc:
        logger.exception("Failed to list review cycles")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list review cycles",
        ) from exc
    
    return cycles


@router.get("/cycles/{year}", response_model=ReviewCycleInDB)
async def get_cycle(
    year: str,
    current_user: dict = Depends(get_current_active_user),
):
    """Fetch a specific cycle by year."""
    del current_user
    table = await get_reviews_table()
    item = await _ensure_cycle(table, year)
    return _map_cycle(item)


@router.put("/cycles/{year}", response_model=ReviewCycleInDB)
async def update_cycle(
    year: str,
    cycle_update: ReviewCycleUpdate,
    current_user: dict = Depends(get_current_active_user),
):
    """Update cycle metadata."""
    del current_user
    table = await get_reviews_table()
    await _ensure_cycle(table, year)

    update_payload = cycle_update.dict(exclude_unset=True)
    if not update_payload:
        item = await _ensure_cycle(table, year)
        return _map_cycle(item)

    update_payload["updatedAt"] = datetime.utcnow().isoformat()

    try:
        update_expression, attr_names, attr_values = _build_update_expression(update_payload)
        update_kwargs = {
            "Key": {"pk": _cycle_pk(year), "sk": CYCLE_SK_VALUE},
            "UpdateExpression": update_expression,
            "ExpressionAttributeNames": attr_names,
            "ReturnValues": "ALL_NEW",
        }
        if attr_values:
            update_kwargs["ExpressionAttributeValues"] = attr_values
        response = await table.update_item(**update_kwargs)
    except ValueError:
        item = await _ensure_cycle(table, year)
        return _map_cycle(item)
    except ClientError as exc:
        logger.exception("Failed to update review cycle %s", year)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update review cycle",
        ) from exc

    return _map_cycle(response["Attributes"])


@router.delete("/cycles/{year}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cycle(
    year: str,
    current_user: dict = Depends(get_current_active_user),
):
    """Delete a cycle and all related reviews."""
    del current_user
    table = await get_reviews_table()
    await _ensure_cycle(table, year)

    pk = _cycle_pk(year)
    last_evaluated_key: Optional[Dict[str, Any]] = None
    deleted = 0

    while True:
        query_kwargs = {
            "KeyConditionExpression": Key("pk").eq(pk),
        }
        if last_evaluated_key:
            query_kwargs["ExclusiveStartKey"] = last_evaluated_key

        response = await table.query(**query_kwargs)
        items = response.get("Items", [])

        for item in items:
            await table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
            deleted += 1

        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    logger.info("Deleted %s items for cycle %s", deleted, year)


# ------------------------
# Review endpoints
# ------------------------

@router.post(
    "",
    response_model=ReviewInDB,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    review: ReviewCreate,
    current_user: dict = Depends(get_current_active_user),
):
    """Create a review entry tied to a yearly cycle."""
    table = await get_reviews_table()
    await _ensure_cycle(table, review.cycleYear)
    await _validate_employee_and_goals(
        review.employeeId,
        review.goalIds or [],
        enforce_goal_existence=not review.isDraft
    )

    review_id = generate_id()
    now = datetime.utcnow().isoformat()

    item = {
        "pk": _cycle_pk(review.cycleYear),
        "sk": _review_sk(review_id),
        "entityType": ENTITY_TYPE_REVIEW,
        "reviewId": review_id,
        "cycleYear": review.cycleYear,
        "employeeId": review.employeeId,
        "reviewerId": review.reviewerId,
        "reviewType": review.reviewType,
        "goalIds": review.goalIds,
        "ratings": review.ratings,
        "comments": review.comments,
        "strengths": review.strengths,
        "improvements": review.improvements,
        "attachments": review.attachments,
        "metadata": review.metadata,
        "isDraft": review.isDraft,
        "submittedAt": review.submittedAt,
        "createdAt": now,
        "updatedAt": now,
        "createdBy": current_user.get("email") or current_user.get("username"),
    }

    try:
        await table.put_item(Item=format_dynamodb_item(item))
    except ClientError as exc:
        logger.exception("Failed to create review")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create review",
        ) from exc

    return _map_review(item)


@router.get("", response_model=List[ReviewInDB])
async def get_reviews(
    employeeId: Optional[str] = Query(None, description="Filter by employee ID"),
    reviewerId: Optional[str] = Query(None, description="Filter by reviewer ID"),
    cycleYear: Optional[str] = Query(None, description="Filter by cycle year"),
    reviewType: Optional[str] = Query(None, description="Filter by review type"),
    isDraft: Optional[bool] = Query(None, description="Filter by draft status"),
    current_user: dict = Depends(get_current_active_user),
):
    """Query reviews with optional filters."""
    del current_user
    table = await get_reviews_table()
    reviews = []

    try:
        if employeeId:
            # Query by employeeId using EmployeeIndex GSI
            response = await table.query(
                IndexName="EmployeeIndex",
                KeyConditionExpression=Key("employeeId").eq(employeeId)
            )
            items = response.get("Items", [])
            
            # Apply additional filters
            for item in items:
                parsed = parse_dynamodb_item(item)
                if reviewerId and parsed.get("reviewerId") != reviewerId:
                    continue
                if cycleYear and parsed.get("cycleYear") != cycleYear:
                    continue
                if reviewType and parsed.get("reviewType") != reviewType:
                    continue
                if isDraft is not None and parsed.get("isDraft") != isDraft:
                    continue
                reviews.append(_map_review(item))
        elif reviewerId:
            # For reviewerId, we need to scan or use a different approach
            # Since we don't have a ReviewerIndex, we'll scan with a filter
            # This is less efficient but works for now
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "FilterExpression": Key("reviewerId").eq(reviewerId) if hasattr(Key, "eq") else None
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                # Use a simpler filter expression
                filter_expr = Attr("reviewerId").eq(reviewerId)
                if cycleYear:
                    filter_expr = filter_expr & Attr("cycleYear").eq(cycleYear)
                if reviewType:
                    filter_expr = filter_expr & Attr("reviewType").eq(reviewType)
                if isDraft is not None:
                    filter_expr = filter_expr & Attr("isDraft").eq(isDraft)
                
                scan_kwargs["FilterExpression"] = filter_expr
                response = await table.scan(**scan_kwargs)
                
                for item in response.get("Items", []):
                    if item.get("entityType") == ENTITY_TYPE_REVIEW:
                        reviews.append(_map_review(item))
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        else:
            # No filters - return empty list (or could return all, but that's expensive)
            return []
            
    except ClientError as exc:
        logger.exception("Failed to query reviews")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to query reviews",
        ) from exc

    return reviews


@router.get("/{review_id}", response_model=ReviewInDB)
async def get_review(
    review_id: str,
    current_user: dict = Depends(get_current_active_user),
):
    """Fetch a review by id."""
    del current_user
    table = await get_reviews_table()
    item = await _fetch_review_by_id(table, review_id)
    return _map_review(item)


@router.put("/{review_id}", response_model=ReviewInDB)
async def update_review(
    review_id: str,
    review_update: ReviewUpdate,
    current_user: dict = Depends(get_current_active_user),
):
    """Update a review entry."""
    del current_user
    table = await get_reviews_table()
    item = await _fetch_review_by_id(table, review_id)

    update_payload = review_update.dict(exclude_unset=True)
    goal_ids_for_validation = update_payload.get("goalIds")
    target_goal_ids = (
        goal_ids_for_validation
        if goal_ids_for_validation is not None
        else item.get("goalIds", [])
    )
    target_is_draft = update_payload.get("isDraft")
    if target_is_draft is None:
        target_is_draft = item.get("isDraft", False)
    await _validate_employee_and_goals(
        item["employeeId"],
        target_goal_ids,
        enforce_goal_existence=not target_is_draft
    )

    if not update_payload:
        return _map_review(item)

    update_payload["updatedAt"] = datetime.utcnow().isoformat()

    try:
        update_expression, attr_names, attr_values = _build_update_expression(update_payload)
        update_kwargs = {
            "Key": {"pk": item["pk"], "sk": item["sk"]},
            "UpdateExpression": update_expression,
            "ExpressionAttributeNames": attr_names,
            "ReturnValues": "ALL_NEW",
        }
        if attr_values:
            update_kwargs["ExpressionAttributeValues"] = attr_values
        response = await table.update_item(**update_kwargs)
    except ValueError:
        return _map_review(item)
    except ClientError as exc:
        logger.exception("Failed to update review %s", review_id)
        raise HTTPException(
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update review",
        ) from exc

    return _map_review(response["Attributes"])


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: str,
    current_user: dict = Depends(get_current_active_user),
):
    """Delete a review entry."""
    del current_user
    table = await get_reviews_table()
    item = await _fetch_review_by_id(table, review_id)

    try:
        await table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    except ClientError as exc:
        logger.exception("Failed to delete review %s", review_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete review",
        ) from exc

