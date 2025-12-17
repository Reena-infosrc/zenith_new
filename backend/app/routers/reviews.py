from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple, List
import time
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
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
    DashboardStats,
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

# Simple in-memory cache for dashboard stats (TTL: 60 seconds)
_dashboard_stats_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 60  # Cache for 60 seconds
}

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
    status_value = parsed.get("status") or parsed.get("metadata", {}).get("status")
    return ReviewInDB(
        reviewId=parsed["reviewId"],
        cycleYear=parsed["cycleYear"],
        employeeId=parsed["employeeId"],
        reviewerId=parsed["reviewerId"],
        reviewType=parsed.get("reviewType", "self"),
        status=status_value,
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


def _get_review_status_value(review: ReviewInDB) -> str:
    """Get the unified status value from a ReviewInDB (status or metadata.status)."""
    if review.status:
        return str(review.status)
    metadata = review.metadata or {}
    return str(metadata.get("status", ""))


def _parse_timestamp(value: Optional[str]) -> float:
    """Parse ISO timestamp string to epoch seconds for comparison."""
    if not value:
        return 0.0
    try:
        # Handle possible Z suffix
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


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
    """Fetch review by ID, checking both tables if is_draft is None
    
    IMPORTANT: When is_draft is explicitly True, prefer draft table.
    When is_draft is None, check draft table first (prefer draft if both exist
    since draft is more recent when saving after submission).
    """
    # If explicitly looking for draft, check draft table first
    if is_draft is True:
        drafts_table = await get_review_drafts_table()
        response = await drafts_table.query(
            IndexName="ReviewIdIndex",
            KeyConditionExpression=Key("reviewId").eq(review_id),
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            return items[0], True  # Found in drafts table
    
    # Check drafts table first when is_draft is None (prefer draft if both exist)
    if is_draft is None:
        drafts_table = await get_review_drafts_table()
        response = await drafts_table.query(
            IndexName="ReviewIdIndex",
            KeyConditionExpression=Key("reviewId").eq(review_id),
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            return items[0], True  # Found in drafts table (prefer draft)
    
    # Then check reviews table (submitted)
    reviews_table = await get_reviews_table()
    response = await reviews_table.query(
        IndexName="ReviewIdIndex",
        KeyConditionExpression=Key("reviewId").eq(review_id),
        Limit=1,
    )
    items = response.get("Items", [])
    if items:
        return items[0], False  # Found in reviews table (not draft)
    
    # If explicitly looking for draft and not found, raise error
    if is_draft is True:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Draft review {review_id} not found",
        )
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Review {review_id} not found",
    )


async def _find_existing_review(
    employee_id: str,
    cycle_year: Optional[str],
    review_type: Optional[str],
    is_draft: bool,
    include_inactive: bool = False
) -> Tuple[Optional[Dict[str, Any]], Optional[Any]]:
    """Return an existing active review for the same employee/cycle/type if present."""
    if not employee_id:
        return None, None
    
    table = await get_review_table_by_draft_status(is_draft)
    try:
        response = await table.query(
            IndexName="EmployeeIndex",
            KeyConditionExpression=Key("employeeId").eq(employee_id)
        )
    except ClientError as exc:
        logger.warning(f"Failed to query existing reviews for employee {employee_id}: {exc}")
        return None, table
    
    for item in response.get("Items", []):
        parsed = parse_dynamodb_item(item)
        if parsed.get("isActive", True) is False and not include_inactive:
            continue
        if review_type and parsed.get("reviewType") != review_type:
            continue
        if cycle_year and parsed.get("cycleYear") != cycle_year:
            continue
        return item, table
    
    return None, table


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

    now = datetime.utcnow().isoformat()

    # If a review already exists for this employee/cycle/type in the target table,
    # update it instead of creating a new record to keep data consolidated.
    existing_item, existing_table = await _find_existing_review(
        review.employeeId,
        review.cycleYear,
        review.reviewType,
        is_draft,
        include_inactive=not is_draft  # allow reusing inactive submitted reviews
    )
    
    if existing_item and existing_table:
        pk = existing_item["pk"]
        sk = existing_item["sk"]
        review_id = parse_dynamodb_item(existing_item).get("reviewId", "")
        update_payload = review.dict()
        update_payload["isActive"] = True  # reactivate/ensure active
        update_payload["updatedAt"] = now
        
        update_expression, attr_names, attr_values = _build_update_expression(update_payload)
        update_kwargs: Dict[str, Any] = {
            "Key": {"pk": pk, "sk": sk},
            "UpdateExpression": update_expression,
            "ExpressionAttributeNames": attr_names,
            "ReturnValues": "ALL_NEW",
        }
        if attr_values:
            update_kwargs["ExpressionAttributeValues"] = attr_values
        
        try:
            response = await existing_table.update_item(**update_kwargs)
            logger.info(f"Updated existing review {review_id} (type={review.reviewType}) in {'draft' if is_draft else 'submitted'} table")
            return _map_review(response["Attributes"], is_draft=is_draft)
        except ClientError as exc:
            logger.exception(f"❌ Failed to update existing review {review_id}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update review",
            ) from exc
    
    review_id = generate_id()
    pk = _cycle_pk(review.cycleYear)
    sk = _review_sk(review_id)
    
    # CRITICAL SAFETY CHECK: Before creating, check if an item with the same pk/sk exists
    # If it exists with a different reviewType, generate a new reviewId
    try:
        existing_check = await table.get_item(Key={"pk": pk, "sk": sk})
        if "Item" in existing_check:
            existing_item = parse_dynamodb_item(existing_check["Item"])
            existing_review_type = existing_item.get("reviewType")
            
            if existing_review_type != review.reviewType:
                logger.error(f"❌ CRITICAL: Generated reviewId {review_id} conflicts with existing {existing_review_type} review!")
                logger.error(f"   Generating new reviewId to prevent overwriting...")
                # Generate a new reviewId
                review_id = generate_id()
                sk = _review_sk(review_id)
                logger.info(f"✅ Generated new reviewId {review_id} to prevent conflict")
    except ClientError as exc:
        logger.warning(f"Could not check for existing item before creation: {exc}")
        # Continue - if check fails, proceed with creation

    metadata = review.metadata or {}
    status_value = review.status or metadata.get("status")
    if not status_value:
        status_value = "draft" if is_draft else "submitted"
    
    item = {
        "pk": pk,
        "sk": sk,
        "reviewId": review_id,
        "cycleYear": review.cycleYear,
        "employeeId": review.employeeId,
        "reviewerId": review.reviewerId,
        "reviewType": review.reviewType,
        "status": status_value,
        "goalIds": review.goalIds,
        "ratings": review.ratings,
        "comments": review.comments,
        "strengths": review.strengths,
        "improvements": review.improvements,
        "attachments": review.attachments,
        "metadata": metadata,
        "submittedAt": review.submittedAt,  # Only set when submitted
        "isActive": True,  # All new reviews are active by default
        "createdAt": now,
        "updatedAt": now,
        "createdBy": current_user.get("email") or current_user.get("username"),
    }

    try:
        logger.info(f"Creating review: reviewId={review_id}, reviewType={review.reviewType}, employeeId={review.employeeId}, cycleYear={review.cycleYear}, isDraft={is_draft}, isActive=True")
        await table.put_item(Item=format_dynamodb_item(item))
        logger.info(f"✅ Successfully created review {review_id} (type={review.reviewType}) in {'draft' if is_draft else 'submitted'} table")
    except ClientError as exc:
        logger.exception(f"❌ Failed to create review {review_id}: {exc}")
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


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_active_user),
):
    """Get performance dashboard statistics - optimized with parallel queries and caching."""
    del current_user
    
    # Check cache first
    current_time = time.time()
    if (_dashboard_stats_cache["data"] is not None and 
        current_time - _dashboard_stats_cache["timestamp"] < _dashboard_stats_cache["ttl"]):
        logger.info("Returning cached dashboard stats")
        return _dashboard_stats_cache["data"]
    
    try:
        import asyncio
        
        # Helper function to count items in a table with filter
        async def count_table_items(table, filter_func=None):
            """Count items in a table, optionally filtering."""
            count = 0
            last_evaluated_key = None
            while True:
                scan_kwargs = {}
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await table.scan(**scan_kwargs)
                items = response.get("Items", [])
                if filter_func:
                    count += sum(1 for item in items if filter_func(parse_dynamodb_item(item)))
                else:
                    count += len(items)
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            return count
        
        # Helper function to process reviews table
        async def process_reviews_table():
            """Process reviews table to get completed reviews and ratings."""
            reviews_table = await get_reviews_table()
            completed_reviews = 0
            pending_reviews = 0
            ratings_sum = 0.0
            ratings_count = 0
            
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
                    
                    if not submitted_at:
                        pending_reviews += 1
                        continue
                    
                    if review_type == "manager":
                        completed_reviews += 1
                        metadata = parsed.get("metadata", {})
                        final_rating = metadata.get("finalRating", {})
                        overall_rating = final_rating.get("overallRating")
                        
                        if overall_rating is None:
                            ratings_obj = parsed.get("ratings", {})
                            overall_rating = ratings_obj.get("overall")
                        
                        if overall_rating is not None:
                            try:
                                rating_value = float(overall_rating)
                                if 0 < rating_value <= 5:
                                    ratings_sum += rating_value
                                    ratings_count += 1
                            except (ValueError, TypeError):
                                pass
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            
            return completed_reviews, pending_reviews, ratings_sum, ratings_count
        
        # Get tables
        employees_table = await get_employees_table()
        drafts_table = await get_review_drafts_table()
        
        # Execute parallel queries for better performance
        # Count active employees and draft reviews in parallel
        async def count_active_employees():
            return await count_table_items(
                employees_table,
                lambda parsed: parsed.get("status", "active") != "inactive"
            )
        
        async def count_draft_reviews():
            return await count_table_items(drafts_table)
        
        # Run parallel queries
        results = await asyncio.gather(
            count_active_employees(),
            count_draft_reviews(),
            process_reviews_table()
        )
        total_employees = results[0]
        draft_count = results[1]
        completed_reviews, pending_from_reviews, ratings_sum, ratings_count = results[2]
        
        # Total pending = drafts + pending from reviews table
        pending_reviews = draft_count + pending_from_reviews
        
        # Calculate average rating
        average_rating = ratings_sum / ratings_count if ratings_count > 0 else 0.0
        
        # Calculate cycle completion rate
        cycle_completion_rate = (completed_reviews / total_employees * 100) if total_employees > 0 else 0.0
        
        result = DashboardStats(
            cycleCompletionRate=round(cycle_completion_rate, 1),
            averageRating=round(average_rating, 1),
            pendingReviews=pending_reviews,
            completedReviews=completed_reviews,
            totalEmployees=total_employees
        )
        
        # Cache the result
        _dashboard_stats_cache["data"] = result
        _dashboard_stats_cache["timestamp"] = current_time
        
        return result
        
    except ClientError as exc:
        logger.exception("Failed to get dashboard stats")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get dashboard statistics",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error getting dashboard stats")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error getting dashboard statistics",
        ) from exc


@router.get("/dashboard/export")
async def export_dashboard_csv(
    cycleYear: str = Query(..., description="Review cycle year to export, e.g. 2025"),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Export organization-wide performance data for a specific cycle as CSV.

    Includes one row per manager review in the selected cycle with:
    - Employee details (name, department, position)
    - Manager details
    - Manager sign-off status (pending, approved, rejected, escalated)
    - Overall manager rating and key timestamps
    """
    del current_user

    # Basic validation for year format
    if not cycleYear or len(cycleYear) != 4 or not cycleYear.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cycleYear must be a 4-digit year, e.g. 2025",
        )

    try:
        # Load employees (active only) for enrichment
        employees_table = await get_employees_table()
        employees_by_id: Dict[str, Dict[str, Any]] = {}

        last_evaluated_key = None
        while True:
            scan_kwargs: Dict[str, Any] = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

            response = await employees_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                emp = parse_dynamodb_item(item)
                emp_id = emp.get("id")
                if not emp_id:
                    continue

                # Default status to "active" if missing, skip inactive employees
                emp_status = emp.get("status", "active")
                if emp_status == "inactive":
                    continue

                employees_by_id[emp_id] = emp

            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break

        # Load cycles to resolve human-friendly cycle names
        cycles_table = await get_cycles_table()
        cycles_by_year: Dict[str, str] = {}

        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

            response = await cycles_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                cycle = _map_cycle(item)
                cycles_by_year[cycle.year] = cycle.name or f"{cycle.year} Annual Performance Review"

            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break

        # Load manager reviews for the given cycle from both submitted and draft tables
        reviews_table = await get_reviews_table()
        drafts_table = await get_review_drafts_table()

        review_map: Dict[str, ReviewInDB] = {}
        processed_statuses = {
            "changes_requested",
            "hr_approved",
            "hr_rejected",
            "approved",
            "rejected",
            "escalated",
        }

        tables_to_query: List[Tuple[Any, bool]] = [
            (reviews_table, False),
            (drafts_table, True),
        ]

        for table, is_draft_table in tables_to_query:
            last_evaluated_key = None
            while True:
                scan_kwargs: Dict[str, Any] = {}
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

                # Filter only manager reviews for the requested cycle year
                filter_expr = Attr("cycleYear").eq(cycleYear) & Attr("reviewType").eq("manager")
                scan_kwargs["FilterExpression"] = filter_expr

                response = await table.scan(**scan_kwargs)
                for item in response.get("Items", []):
                    review_obj = _map_review(item, is_draft=is_draft_table)
                    review_id = review_obj.reviewId
                    if not review_id:
                        continue

                    existing = review_map.get(review_id)
                    if not existing:
                        review_map[review_id] = review_obj
                        continue

                    existing_status = _get_review_status_value(existing).lower()
                    new_status = _get_review_status_value(review_obj).lower()
                    existing_is_processed = existing_status in processed_statuses
                    new_is_processed = new_status in processed_statuses

                    if new_is_processed and not existing_is_processed:
                        review_map[review_id] = review_obj
                    elif existing_is_processed and not new_is_processed:
                        # keep existing
                        pass
                    else:
                        # Same priority - keep the one with the most recent timestamp
                        existing_ts = _parse_timestamp(existing.updatedAt or existing.createdAt)
                        new_ts = _parse_timestamp(review_obj.updatedAt or review_obj.createdAt)
                        if new_ts > existing_ts:
                            review_map[review_id] = review_obj

                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break

        reviews = list(review_map.values())

        # Build CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        # CSV header
        writer.writerow(
            [
                "cycleYear",
                "cycleName",
                "employee_id",  # Business employee ID from Zenith HR employees table
                "employeeName",
                "employeeEmail",
                "employeeDepartment",
                "employeePosition",
                "managerId",
                "managerSignOffStatus",
                "managerOverallRating",
                "submittedAt",
                "rawStatus",
            ]
        )

        # Helper to map review status to sign-off status
        def map_signoff_status(review: ReviewInDB) -> str:
            raw = _get_review_status_value(review).lower()
            if raw in {"hr_approved", "approved"}:
                return "approved"
            if raw in {"hr_rejected", "rejected", "changes_requested"}:
                return "rejected"
            if raw == "escalated":
                return "escalated"
            if raw == "manager_submitted" or review.submittedAt:
                return "pending"
            return "pending"

        for review in reviews:
            emp = employees_by_id.get(review.employeeId, {})
            manager = employees_by_id.get(review.reviewerId, {})

            # Skip if employee is not in the active employees set (safety)
            if not emp:
                continue

            cycle_name = cycles_by_year.get(
                review.cycleYear,
                f"{review.cycleYear} Annual Performance Review",
            )

            signoff_status = map_signoff_status(review)

            # Extract overall rating from ratings/metadata
            overall_rating = None
            if review.ratings and isinstance(review.ratings, dict):
                overall_rating = review.ratings.get("overall")
            if overall_rating is None:
                metadata = review.metadata or {}
                final_rating = metadata.get("finalRating") or {}
                overall_rating = final_rating.get("overallRating")

            submitted_at = review.submittedAt or review.updatedAt or review.createdAt or ""

            writer.writerow(
                [
                    review.cycleYear,
                    cycle_name,
                    emp.get("employee_id", ""),
                    emp.get("name", ""),
                    emp.get("email", ""),
                    emp.get("department", ""),
                    emp.get("position", ""),
                    review.reviewerId,
                    signoff_status,
                    overall_rating if overall_rating is not None else "",
                    submitted_at,
                    _get_review_status_value(review),
                ]
            )

        csv_data = output.getvalue()
        filename = f"performance-dashboard-{cycleYear}.csv"

        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )
    except Exception as exc:
        logger.exception("Failed to export dashboard CSV")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export dashboard CSV",
        ) from exc


@router.get("", response_model=List[ReviewInDB])
async def get_reviews(
    employeeId: Optional[str] = Query(None, description="Filter by employee ID"),
    reviewerId: Optional[str] = Query(None, description="Filter by reviewer ID"),
    cycleYear: Optional[str] = Query(None, description="Filter by cycle year"),
    reviewType: Optional[str] = Query(None, description="Filter by review type"),
    isDraft: Optional[bool] = Query(None, description="Filter by draft status"),
    includeSelfReview: Optional[bool] = Query(False, description="When querying manager reviews, also include corresponding self-review"),
    includeInactive: Optional[bool] = Query(False, description="Include inactive reviews (for debugging)"),
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
                logger.info(f"Querying {'draft' if is_draft_table else 'submitted'} table for employeeId={employeeId}, reviewType={reviewType}, cycleYear={cycleYear}")
                response = await table.query(
                    IndexName="EmployeeIndex",
                    KeyConditionExpression=Key("employeeId").eq(employeeId)
                )
                items = response.get("Items", [])
                logger.info(f"Found {len(items)} items in {'draft' if is_draft_table else 'submitted'} table for employeeId={employeeId}")
                
                # Apply additional filters
                for item in items:
                    parsed = parse_dynamodb_item(item)
                    item_review_type = parsed.get("reviewType")
                    item_cycle_year = parsed.get("cycleYear")
                    item_reviewer_id = parsed.get("reviewerId")
                    item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                    
                    logger.debug(f"Item: reviewType={item_review_type}, cycleYear={item_cycle_year}, reviewerId={item_reviewer_id}, isDraft={is_draft_table}, isActive={item_is_active}")
                    
                    # Skip inactive items (preserved for history but not shown in active queries)
                    # Unless includeInactive=True for debugging
                    if item_is_active is False and not includeInactive:
                        logger.debug(f"Skipping item - marked as inactive: reviewId={parsed.get('reviewId')}")
                        continue
                    
                    if reviewerId and item_reviewer_id != reviewerId:
                        logger.debug(f"Skipping item - reviewerId mismatch: {item_reviewer_id} != {reviewerId}")
                        continue
                    if cycleYear and item_cycle_year != cycleYear:
                        logger.debug(f"Skipping item - cycleYear mismatch: {item_cycle_year} != {cycleYear}")
                        continue
                    if reviewType and item_review_type != reviewType:
                        logger.debug(f"Skipping item - reviewType mismatch: {item_review_type} != {reviewType}")
                        continue
                    logger.info(f"Adding review: reviewId={parsed.get('reviewId')}, reviewType={item_review_type}, cycleYear={item_cycle_year}, isDraft={is_draft_table}")
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
                    item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                    
                    # Skip inactive items (unless includeInactive=True for debugging)
                    if item_is_active is False and not includeInactive:
                        continue
                    
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
                        parsed = parse_dynamodb_item(item)
                        item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                        
                        # Skip inactive items (unless includeInactive=True for debugging)
                        if item_is_active is False and not includeInactive:
                            continue
                        
                        reviews.append(_map_review(item, is_draft=is_draft_table))
                    
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
        
        logger.info(f"Total reviews found after filtering: {len(reviews)}")
        
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
                        item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                        
                        # Skip inactive items (unless includeInactive=True for debugging)
                        if item_is_active is False and not includeInactive:
                            continue
                        
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


@router.get("/batch", response_model=List[ReviewInDB])
async def get_reviews_batch(
    employeeIds: str = Query(..., description="Comma-separated list of employee IDs"),
    reviewType: Optional[str] = Query(None, description="Filter by review type (self or manager)"),
    cycleYear: Optional[str] = Query(None, description="Filter by cycle year"),
    isDraft: Optional[bool] = Query(None, description="Filter by draft status"),
    includeInactive: bool = Query(False, description="Include inactive reviews in the response"),
    current_user: dict = Depends(get_current_active_user),
):
    """Batch fetch reviews for multiple employees efficiently.
    
    This endpoint accepts a comma-separated list of employee IDs and returns
    all reviews for those employees in a single request, significantly
    reducing the number of API calls needed.
    """
    del current_user
    
    # Parse employee IDs from comma-separated string
    employee_id_list = [eid.strip() for eid in employeeIds.split(",") if eid.strip()]
    
    if not employee_id_list:
        return []
    
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
        
        # Import asyncio for parallel queries
        import asyncio
        
        # Fetch reviews for all employees in parallel
        async def fetch_reviews_for_employee(emp_id: str):
            """Fetch reviews for a single employee."""
            emp_reviews = []
            
            for table, is_draft_table in tables_to_query:
                try:
                    # Query by employeeId using EmployeeIndex GSI
                    response = await table.query(
                        IndexName="EmployeeIndex",
                        KeyConditionExpression=Key("employeeId").eq(emp_id)
                    )
                    items = response.get("Items", [])
                    
                    # Apply additional filters
                    for item in items:
                        parsed = parse_dynamodb_item(item)
                        item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                        
                        # Skip inactive items unless explicitly requested
                        if item_is_active is False and not includeInactive:
                            continue
                        
                        if reviewType and parsed.get("reviewType") != reviewType:
                            continue
                        if cycleYear and parsed.get("cycleYear") != cycleYear:
                            continue
                        emp_reviews.append((_map_review(item, is_draft=is_draft_table), emp_id))
                except ClientError as exc:
                    logger.warning(f"Failed to fetch reviews for employee {emp_id}: {exc}")
                    continue
            
            return emp_reviews
        
        # Execute all queries in parallel
        results = await asyncio.gather(
            *[fetch_reviews_for_employee(emp_id) for emp_id in employee_id_list],
            return_exceptions=True
        )
        
        # Flatten results and collect reviews
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error fetching reviews: {result}")
                continue
            for review, emp_id in result:
                reviews.append(review)
        
    except ClientError as exc:
        logger.exception("Failed to batch query reviews")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to batch query reviews",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error in batch query")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error in batch query",
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
    
    IMPORTANT: This only updates the specific review by review_id. It does NOT affect
    other reviews (e.g., self-reviews) even if they share the same employeeId.
    """
    del current_user
    item, current_is_draft = await _fetch_review_by_id(review_id)
    
    # Log which review is being updated to ensure we're not affecting others
    parsed_item_check = parse_dynamodb_item(item)
    existing_review_type = parsed_item_check.get('reviewType')
    logger.info(f"Updating review: reviewId={review_id}, reviewType={existing_review_type}, employeeId={parsed_item_check.get('employeeId')}, isDraft={current_is_draft}")
    
    update_payload = review_update.dict(exclude_unset=True)
    metadata_update = update_payload.get("metadata")
    # Keep top-level status in sync with metadata.status if provided
    if "status" not in update_payload:
        if isinstance(metadata_update, dict) and "status" in metadata_update:
            update_payload["status"] = metadata_update.get("status")
    parsed_item = parse_dynamodb_item(item)
    
    # CRITICAL SAFETY CHECK: Prevent changing reviewType
    # If update payload tries to change reviewType, reject it
    new_review_type = update_payload.get("reviewType")
    if new_review_type and new_review_type != existing_review_type:
        logger.error(f"❌ CRITICAL: Attempted to change reviewType from {existing_review_type} to {new_review_type} for reviewId {review_id}. This is not allowed!")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change reviewType from {existing_review_type} to {new_review_type}. Each review must maintain its original type."
        )
    
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
        
        # SPECIAL CASE: When moving from submitted to draft (saving draft after submission),
        # create a NEW entry in draft table WITHOUT deleting the submitted entry
        # This allows both submitted and draft versions to coexist
        if moving_to_draft:
            logger.info(f"Creating draft version of submitted review {review_id} - keeping submitted version intact")
            
            # Copy item to draft table with updated data
            parsed_item = parse_dynamodb_item(item)
            parsed_item.update(update_payload)
            # Ensure submittedAt is None for draft
            parsed_item["submittedAt"] = None
            # Ensure new draft is marked as active
            parsed_item["isActive"] = True
            
            # CRITICAL SAFETY CHECK: Before creating in draft table, check if an item with the same pk/sk exists
            # If it exists with a different reviewType, generate a new reviewId to prevent overwriting
            try:
                existing_check = await target_table.get_item(Key={"pk": item["pk"], "sk": item["sk"]})
                if "Item" in existing_check:
                    existing_item = parse_dynamodb_item(existing_check["Item"])
                    existing_review_type = existing_item.get("reviewType")
                    current_review_type = parsed_item.get("reviewType")
                    
                    if existing_review_type != current_review_type:
                        logger.error(f"❌ CRITICAL: Attempted to overwrite {existing_review_type} review with {current_review_type} review using same reviewId {review_id}")
                        logger.error(f"   This would cause data loss! Generating new reviewId...")
                        # Generate a new reviewId to prevent overwriting
                        new_review_id = generate_id()
                        parsed_item["reviewId"] = new_review_id
                        parsed_item["sk"] = _review_sk(new_review_id)
                        logger.info(f"✅ Generated new reviewId {new_review_id} to prevent overwriting existing {existing_review_type} review")
            except ClientError as exc:
                logger.warning(f"Could not check for existing item in draft table: {exc}")
                # Continue - if check fails, proceed with creation
            
            # Create new entry in draft table (don't delete from submitted table)
            await target_table.put_item(Item=format_dynamodb_item(parsed_item))
            
            # Fetch from draft table to return
            # Use the formatted item directly if get_item fails (eventual consistency)
            try:
                response = await target_table.get_item(Key={"pk": item["pk"], "sk": item["sk"]})
                if "Item" in response and response["Item"]:
                    return _map_review(response["Item"], is_draft=True)
            except Exception as e:
                logger.warning(f"Could not fetch draft review immediately after creation: {e}, using formatted item")
            
            # Fallback: format the parsed item and return it
            # We need to format it as DynamoDB item since _map_review expects DynamoDB format
            formatted_item = format_dynamodb_item(parsed_item)
            return _map_review(formatted_item, is_draft=True)
        
        # Normal case: Moving from draft to submitted (submitting a draft)
        # Update in current table first if there are other updates
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
        # Ensure new item is marked as active
        parsed_item["isActive"] = True
        
        # Reuse existing submitted review if one exists (even if previously inactive)
        existing_target_item, _ = await _find_existing_review(
            parsed_item.get("employeeId"),
            parsed_item.get("cycleYear"),
            parsed_item.get("reviewType"),
            is_draft=False,
            include_inactive=True
        )
        
        if existing_target_item:
            existing_pk = existing_target_item["pk"]
            existing_sk = existing_target_item["sk"]
            existing_review_id = parse_dynamodb_item(existing_target_item).get("reviewId")
            if existing_review_id:
                parsed_item["reviewId"] = existing_review_id
                parsed_item["pk"] = existing_pk
                parsed_item["sk"] = existing_sk
                review_id = existing_review_id
        
        # If still no pk/sk (first submission), derive from reviewId
        if "pk" not in parsed_item or "sk" not in parsed_item:
            parsed_item["reviewId"] = parsed_item.get("reviewId") or review_id or generate_id()
            parsed_item["pk"] = _cycle_pk(parsed_item.get("cycleYear"))
            parsed_item["sk"] = _review_sk(parsed_item["reviewId"])
            review_id = parsed_item["reviewId"]
        
        await target_table.put_item(Item=format_dynamodb_item(parsed_item))
        
        # IMPORTANT: Instead of deleting, mark the old item as inactive
        # This preserves all data in the database for audit/history purposes
        # CRITICAL: Only mark the specific review by reviewId - do NOT affect other reviews
        try:
            # Double-check we're updating the correct review
            review_type = parsed_item.get("reviewType")
            employee_id = parsed_item.get("employeeId")
            item_review_id = parsed_item.get("reviewId")
            
            # Safety check: Ensure the reviewId matches
            if item_review_id != review_id:
                logger.error(f"❌ CRITICAL: ReviewId mismatch! Expected {review_id}, got {item_review_id}. Aborting inactive marking.")
                raise ValueError(f"ReviewId mismatch: expected {review_id}, got {item_review_id}")
            
            logger.info(f"Marking review as inactive: reviewId={review_id}, reviewType={review_type}, employeeId={employee_id}, pk={item['pk']}, sk={item['sk']}")
            
            update_expression = "SET #isActive = :isActive, #updatedAt = :updatedAt"
            attr_names = {
                "#isActive": "isActive",
                "#updatedAt": "updatedAt"
            }
            attr_values = {
                ":isActive": False,
                ":updatedAt": datetime.utcnow().isoformat()
            }
            await current_table.update_item(
                Key={"pk": item["pk"], "sk": item["sk"]},
                UpdateExpression=update_expression,
                ExpressionAttributeNames=attr_names,
                ExpressionAttributeValues=attr_values
            )
            logger.info(f"✅ Successfully marked review {review_id} (type={review_type}) as inactive in {'draft' if current_is_draft else 'submitted'} table")
        except ClientError as exc:
            logger.error(f"❌ Failed to mark review {review_id} as inactive: {exc}")
            # Don't fail the request if marking inactive fails, but log the error
        except ValueError as exc:
            logger.error(f"❌ Safety check failed: {exc}")
            # Don't mark as inactive if safety check fails
        
        # Fetch from target table to return
        # Handle potential eventual consistency issues
        try:
            response = await target_table.get_item(Key={"pk": item["pk"], "sk": item["sk"]})
            if "Item" in response and response["Item"]:
                return _map_review(response["Item"], is_draft=target_is_draft)
        except Exception as e:
            logger.warning(f"Could not fetch review immediately after move: {e}, using formatted item")
        
        # Fallback: format the parsed item and return it
        formatted_item = format_dynamodb_item(parsed_item)
        return _map_review(formatted_item, is_draft=target_is_draft)
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
            return _map_review(response["Attributes"], is_draft=current_is_draft)
        except ValueError:
            return _map_review(item, is_draft=current_is_draft)
        except ClientError as exc:
            logger.exception("Failed to update review %s", review_id)
            raise HTTPException(
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update review",
            ) from exc


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

