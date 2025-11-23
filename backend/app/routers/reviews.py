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
    ReviewStats,
)
from ..database_dynamodb import (
    get_reviews_table,
    get_review_drafts_table,
    get_cycles_table,
    get_review_table_by_draft_status,
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


def _map_review(item: Dict[str, Any], is_draft: bool = False) -> ReviewInDB:
    """Map DynamoDB item to ReviewInDB. is_draft indicates which table it came from."""
    parsed = parse_dynamodb_item(item)
    # Remove isDraft from parsed data if it exists (legacy data)
    parsed.pop("isDraft", None)
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
        submittedAt=parsed.get("submittedAt"),
        createdAt=parsed.get("createdAt"),
        updatedAt=parsed.get("updatedAt"),
        isDraft=is_draft,  # Set based on which table the data came from
    )


async def _ensure_cycle(year: str) -> Dict[str, Any]:
    """Check if cycle exists in cycles table"""
    cycles_table = await get_cycles_table()
    response = await cycles_table.get_item(Key={"year": year})
    if "Item" not in response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review cycle {year} not found",
        )
    return response["Item"]


async def _fetch_review_by_id(review_id: str, is_draft: Optional[bool] = None) -> Tuple[Dict[str, Any], bool]:
    """Fetch review by ID, checking both tables if is_draft is None"""
    # First try reviews table (submitted)
    reviews_table = await get_reviews_table()
    response = await reviews_table.query(
        IndexName="ReviewIdIndex",
        KeyConditionExpression=Key("reviewId").eq(review_id),
        Limit=1,
    )
    items = response.get("Items", [])
    if items:
        return items[0], False  # Found in reviews table (not draft)
    
    # If not found and is_draft is None or True, check drafts table
    if is_draft is None or is_draft:
        drafts_table = await get_review_drafts_table()
        response = await drafts_table.query(
            IndexName="ReviewIdIndex",
            KeyConditionExpression=Key("reviewId").eq(review_id),
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            return items[0], True  # Found in drafts table
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Review {review_id} not found",
    )


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
    cycles_table = await get_cycles_table()
    now = datetime.utcnow().isoformat()

    item = {
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
        await cycles_table.put_item(
            Item=format_dynamodb_item(item),
            ConditionExpression="attribute_not_exists(#year)",
            ExpressionAttributeNames={"#year": "year"},
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
    cycles_table = await get_cycles_table()
    cycles = []
    
    try:
        # Scan all cycles from cycles table
        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await cycles_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                cycles.append(_map_cycle(item))
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
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
    item = await _ensure_cycle(year)
    return _map_cycle(item)


@router.put("/cycles/{year}", response_model=ReviewCycleInDB)
async def update_cycle(
    year: str,
    cycle_update: ReviewCycleUpdate,
    current_user: dict = Depends(get_current_active_user),
):
    """Update cycle metadata."""
    del current_user
    cycles_table = await get_cycles_table()
    await _ensure_cycle(year)

    update_payload = cycle_update.dict(exclude_unset=True)
    if not update_payload:
        item = await _ensure_cycle(year)
        return _map_cycle(item)

    update_payload["updatedAt"] = datetime.utcnow().isoformat()

    try:
        update_expression, attr_names, attr_values = _build_update_expression(update_payload)
        update_kwargs = {
            "Key": {"year": year},
            "UpdateExpression": update_expression,
            "ExpressionAttributeNames": attr_names,
            "ReturnValues": "ALL_NEW",
        }
        if attr_values:
            update_kwargs["ExpressionAttributeValues"] = attr_values
        response = await cycles_table.update_item(**update_kwargs)
    except ValueError:
        item = await _ensure_cycle(year)
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
    cycles_table = await get_cycles_table()
    reviews_table = await get_reviews_table()
    drafts_table = await get_review_drafts_table()
    
    await _ensure_cycle(year)

    # Delete all reviews for this cycle from both tables
    deleted = 0
    
    # Delete from reviews table
    last_evaluated_key = None
    while True:
        scan_kwargs = {
            "FilterExpression": Attr("cycleYear").eq(year)
        }
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        
        response = await reviews_table.scan(**scan_kwargs)
        items = response.get("Items", [])
        
        for item in items:
            await reviews_table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
            deleted += 1
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
    
    # Delete from drafts table
    last_evaluated_key = None
    while True:
        scan_kwargs = {
            "FilterExpression": Attr("cycleYear").eq(year)
        }
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        
        response = await drafts_table.scan(**scan_kwargs)
        items = response.get("Items", [])
        
        for item in items:
            await drafts_table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
            deleted += 1
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
    
    # Delete the cycle itself
    await cycles_table.delete_item(Key={"year": year})
    deleted += 1

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
    """Create a review entry tied to a yearly cycle.
    
    If submittedAt is provided, review goes to reviews table (submitted).
    Otherwise, review goes to review_drafts table (draft).
    Note: isDraft field is accepted for backward compatibility but not stored.
    """
    await _ensure_cycle(review.cycleYear)
    
    # Determine if this is a draft based on submittedAt (not isDraft field)
    # submittedAt being None means it's a draft
    is_draft = review.submittedAt is None
    await _validate_employee_and_goals(
        review.employeeId,
        review.goalIds or [],
        enforce_goal_existence=not is_draft
    )

    # Route to appropriate table based on submittedAt
    table = await get_review_table_by_draft_status(is_draft)

    review_id = generate_id()
    now = datetime.utcnow().isoformat()

    item = {
        "pk": _cycle_pk(review.cycleYear),
        "sk": _review_sk(review_id),
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
        "submittedAt": review.submittedAt,  # Only set when submitted
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

    return _map_review(item, is_draft=is_draft)


@router.get("/stats", response_model=ReviewStats)
async def get_review_stats(
    current_user: dict = Depends(get_current_active_user),
):
    """Get review statistics across all cycles."""
    del current_user
    
    try:
        # Get total cycles count
        cycles_table = await get_cycles_table()
        cycles_count = 0
        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await cycles_table.scan(**scan_kwargs)
            cycles_count += len(response.get("Items", []))
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        # Get reviews from both tables
        reviews_table = await get_reviews_table()
        drafts_table = await get_review_drafts_table()
        
        # Count pending (draft self-reviews)
        pending = 0
        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await drafts_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                parsed = parse_dynamodb_item(item)
                if parsed.get("reviewType") == "self":
                    pending += 1
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        # Count submitted and finalized, track submitted self-reviews
        submitted = 0
        finalized = 0
        submitted_self_reviews = set()  # {(employeeId, cycleYear)}
        manager_reviews = set()  # {(employeeId, cycleYear)} that have manager reviews
        
        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await reviews_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                parsed = parse_dynamodb_item(item)
                review_type = parsed.get("reviewType")
                submitted_at = parsed.get("submittedAt")
                employee_id = parsed.get("employeeId")
                cycle_year = parsed.get("cycleYear")
                
                if not submitted_at:
                    continue
                    
                key = (employee_id, cycle_year)
                
                if review_type == "self":
                    submitted += 1
                    submitted_self_reviews.add(key)
                elif review_type == "manager":
                    finalized += 1
                    manager_reviews.add(key)
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        # Manager pending = self-reviews submitted but no manager review yet
        manager_pending = len(submitted_self_reviews - manager_reviews)
        
        return ReviewStats(
            total=cycles_count,
            pending=pending,
            submitted=submitted,
            managerPending=manager_pending,
            finalized=finalized
        )
        
    except ClientError as exc:
        logger.exception("Failed to get review stats")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get review statistics",
        ) from exc


@router.get("", response_model=List[ReviewInDB])
async def get_reviews(
    employeeId: Optional[str] = Query(None, description="Filter by employee ID"),
    reviewerId: Optional[str] = Query(None, description="Filter by reviewer ID"),
    cycleYear: Optional[str] = Query(None, description="Filter by cycle year"),
    reviewType: Optional[str] = Query(None, description="Filter by review type"),
    isDraft: Optional[bool] = Query(None, description="Filter by draft status"),
    includeSelfReview: Optional[bool] = Query(False, description="When querying manager reviews, also include corresponding self-review"),
    current_user: dict = Depends(get_current_active_user),
):
    """Query reviews with optional filters.
    
    If includeSelfReview=True and reviewType=manager, also fetches the corresponding self-review
    for the same employeeId and cycleYear.
    """
    del current_user
    reviews = []

    try:
        # Determine which tables to query
        tables_to_query = []
        if isDraft is None:
            # Query both tables if isDraft is not specified
            tables_to_query = [
                (await get_reviews_table(), False),
                (await get_review_drafts_table(), True)
            ]
        elif isDraft:
            tables_to_query = [(await get_review_drafts_table(), True)]
        else:
            tables_to_query = [(await get_reviews_table(), False)]

        for table, is_draft_table in tables_to_query:
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
                    reviews.append(_map_review(item, is_draft=is_draft_table))
            elif reviewerId:
                # Query by reviewerId using ReviewerIndex GSI
                response = await table.query(
                    IndexName="ReviewerIndex",
                    KeyConditionExpression=Key("reviewerId").eq(reviewerId)
                )
                items = response.get("Items", [])
                
                # Apply additional filters
                for item in items:
                    parsed = parse_dynamodb_item(item)
                    if employeeId and parsed.get("employeeId") != employeeId:
                        continue
                    if cycleYear and parsed.get("cycleYear") != cycleYear:
                        continue
                    if reviewType and parsed.get("reviewType") != reviewType:
                        continue
                    reviews.append(_map_review(item, is_draft=is_draft_table))
            else:
                # No specific filter - scan with filters
                last_evaluated_key = None
                while True:
                    scan_kwargs = {}
                    if last_evaluated_key:
                        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    
                    # Build filter expression
                    filter_expr = None
                    if cycleYear:
                        filter_expr = Attr("cycleYear").eq(cycleYear)
                    if reviewType:
                        if filter_expr:
                            filter_expr = filter_expr & Attr("reviewType").eq(reviewType)
                        else:
                            filter_expr = Attr("reviewType").eq(reviewType)
                    
                    if filter_expr:
                        scan_kwargs["FilterExpression"] = filter_expr
                    
                    response = await table.scan(**scan_kwargs)
                    
                    for item in response.get("Items", []):
                        reviews.append(_map_review(item, is_draft=is_draft_table))
                    
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
        
        # If includeSelfReview=True and we're querying manager reviews, also fetch self-reviews
        # OR if reviewType=manager and we have employeeId+cycleYear, automatically include self-review
        should_include_self = (includeSelfReview or reviewType == "manager") and employeeId and cycleYear
        if should_include_self:
            logger.info(f"Fetching self-review for employeeId={employeeId}, cycleYear={cycleYear}")
            # Query both tables for self-reviews
            for table, is_draft_table in tables_to_query:
                try:
                    response = await table.query(
                        IndexName="EmployeeIndex",
                        KeyConditionExpression=Key("employeeId").eq(employeeId)
                    )
                    items = response.get("Items", [])
                    
                    for item in items:
                        parsed = parse_dynamodb_item(item)
                        # Only include self-reviews for the same cycle year
                        if parsed.get("reviewType") == "self" and parsed.get("cycleYear") == cycleYear:
                            # Check if we already have this review (avoid duplicates)
                            review_id = parsed.get("reviewId")
                            if not any(r.reviewId == review_id for r in reviews):
                                reviews.append(_map_review(item, is_draft=is_draft_table))
                                logger.info(f"Added self-review {review_id} to response")
                except ClientError as exc:
                    logger.warning(f"Failed to fetch self-review: {exc}")
                    # Continue even if self-review fetch fails
            
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
    item, is_draft = await _fetch_review_by_id(review_id)
    return _map_review(item, is_draft=is_draft)


@router.put("/{review_id}", response_model=ReviewInDB)
async def update_review(
    review_id: str,
    review_update: ReviewUpdate,
    current_user: dict = Depends(get_current_active_user),
):
    """Update a review entry.
    
    If submittedAt is set (and wasn't before), review moves from draft to submitted table.
    If submittedAt is removed, review moves from submitted to draft table.
    """
    del current_user
    item, current_is_draft = await _fetch_review_by_id(review_id)

    update_payload = review_update.dict(exclude_unset=True)
    parsed_item = parse_dynamodb_item(item)
    
    # Determine if we're moving between tables based on submittedAt
    current_submitted_at = parsed_item.get("submittedAt")
    new_submitted_at = update_payload.get("submittedAt")
    
    # If submittedAt is being set (was None, now has value), move from draft to submitted
    # If submittedAt is being removed (had value, now None), move from submitted to draft
    moving_to_submitted = current_submitted_at is None and new_submitted_at is not None
    moving_to_draft = current_submitted_at is not None and new_submitted_at is None
    
    goal_ids_for_validation = update_payload.get("goalIds")
    target_goal_ids = (
        goal_ids_for_validation
        if goal_ids_for_validation is not None
        else parsed_item.get("goalIds", [])
    )
    
    # Determine target table
    if moving_to_submitted:
        target_is_draft = False
    elif moving_to_draft:
        target_is_draft = True
    else:
        target_is_draft = current_is_draft
    
    await _validate_employee_and_goals(
        parsed_item["employeeId"],
        target_goal_ids,
        enforce_goal_existence=not target_is_draft
    )

    if not update_payload:
        return _map_review(item, is_draft=current_is_draft)

    update_payload["updatedAt"] = datetime.utcnow().isoformat()
    
    # Handle table move when submitting or unsubmitting
    if moving_to_submitted or moving_to_draft:
        current_table = await get_review_table_by_draft_status(current_is_draft)
        target_table = await get_review_table_by_draft_status(target_is_draft)
        
        # If there are other updates, update in current table first
        if len(update_payload) > 1:  # More than just updatedAt
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
                response = await current_table.update_item(**update_kwargs)
                item = response["Attributes"]
            except ValueError:
                pass
            except ClientError as exc:
                logger.exception("Failed to update review %s", review_id)
                raise HTTPException(
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update review",
                ) from exc
        else:
            # Only submittedAt is changing, just copy the item
            parsed_item.update(update_payload)
        
        # Copy item to target table
        parsed_item = parse_dynamodb_item(item)
        parsed_item.update(update_payload)
        
        # Create new item in target table
        await target_table.put_item(Item=format_dynamodb_item(parsed_item))
        
        # Delete from current table
        await current_table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
        
        # Fetch from target table to return
        response = await target_table.get_item(Key={"pk": item["pk"], "sk": item["sk"]})
        return _map_review(response["Item"], is_draft=target_is_draft)
    else:
        # Normal update - no table change needed
        table = await get_review_table_by_draft_status(current_is_draft)
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
            return _map_review(item, is_draft=current_is_draft)
        except ClientError as exc:
            logger.exception("Failed to update review %s", review_id)
            raise HTTPException(
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update review",
            ) from exc

        return _map_review(response["Attributes"], is_draft=current_is_draft)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: str,
    current_user: dict = Depends(get_current_active_user),
):
    """Delete a review entry."""
    del current_user
    item, is_draft = await _fetch_review_by_id(review_id)
    table = await get_review_table_by_draft_status(is_draft)

    try:
        await table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    except ClientError as exc:
        logger.exception("Failed to delete review %s", review_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete review",
        ) from exc

