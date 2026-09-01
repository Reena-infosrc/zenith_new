from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List
import time
import csv
import io
import json
import re

from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile, Form
from fastapi.responses import Response
from boto3.dynamodb.conditions import Key, Attr, And
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
    CompletionTrendPoint,
    RatingDistributionPoint,
    TeamPerformancePoint,
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
from ..services.s3_service import s3_service
from ..services.field_crypto import is_field_encryption_active, remove_field_names_for_delete

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/reviews",
    tags=["reviews"],
    responses={404: {"description": "Not found"}},
)

# Simple in-memory cache for dashboard stats (TTL: 120 seconds)
_dashboard_stats_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 120  # Cache for 2 minutes
}

# Cache for cycles endpoint (TTL: 5 minutes - cycles don't change often)
_cycles_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 300  # Cache for 5 minutes
}

# Cache for reviews queries without employeeId/reviewerId (TTL: 2 minutes)
_reviews_query_cache = {}

# Cache for completion trend (TTL: 5 minutes - data doesn't change frequently)
_completion_trend_cache = {}

# Cache for rating distribution (TTL: 5 minutes - data doesn't change frequently)
_rating_distribution_cache = {}

# Cache for team performance (TTL: 5 minutes)
_team_performance_cache = {}

# Cache for the set of active (non-inactive) employee IDs (TTL: 5 minutes)
_active_employees_cache = {
    "ids": None,
    "timestamp": 0,
    "ttl": 300,
}

CYCLE_PK_PREFIX = "CYCLE#"
REVIEW_SK_PREFIX = "REVIEW#"
CYCLE_SK_VALUE = "CYCLE"
ENTITY_TYPE_CYCLE = "cycle"
ENTITY_TYPE_REVIEW = "review"


def _review_logical_name(is_draft: bool) -> str:
    return "reviewDraft" if is_draft else "review"


def _omit_projection_if_encryption() -> bool:
    """When field encryption is on, skip ProjectionExpression (encrypted attrs use *_enc names)."""
    return is_field_encryption_active()


def _strip_projection_if_encryption(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Drop ProjectionExpression when encryption is on; clean up # placeholders only used there.

    DynamoDB rejects (1) names with no expressions, and (2) unused placeholders in
    ExpressionAttributeNames. Scans often only had #names for projection; queries may
    still use KeyConditionExpression/FilterExpression without those placeholders.
    """
    if not _omit_projection_if_encryption():
        return kwargs
    out = dict(kwargs)
    proj = out.pop("ProjectionExpression", None)
    if not proj:
        return out
    names = out.get("ExpressionAttributeNames") or {}
    if not names:
        return out
    placeholders_in_proj = set(re.findall(r"#\w+", proj))
    other_blob = " ".join(
        str(out.get(k))
        for k in ("KeyConditionExpression", "FilterExpression", "ConditionExpression")
        if out.get(k) is not None
    )
    for ph in placeholders_in_proj:
        if ph in other_blob:
            continue
        names.pop(ph, None)
    if names:
        out["ExpressionAttributeNames"] = names
    else:
        out.pop("ExpressionAttributeNames", None)
    return out


def _cycle_pk(year: str) -> str:
    return f"{CYCLE_PK_PREFIX}{year}"


def _review_sk(review_id: str) -> str:
    return f"{REVIEW_SK_PREFIX}{review_id}"


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
    parsed = parse_dynamodb_item(item, _review_logical_name(is_draft))
    # Remove isDraft from parsed data if it exists (legacy data)
    parsed.pop("isDraft", None)
    status_value = parsed.get("status") or parsed.get("metadata", {}).get("status")

    metadata = parsed.get("metadata", {}) or {}
    # Reviewer of record: for a submitted manager review that predates snapshot
    # tracking, derive one on read from the stored reviewerId + submittedAt so the
    # UI always shows the manager who actually submitted it, not whoever the
    # employee reports to now. This is not persisted here — update_review freezes
    # a real snapshot the next time the row is written.
    if (
        parsed.get("reviewType") == "manager"
        and parsed.get("submittedAt")
        and not metadata.get("reviewerSnapshot")
    ):
        metadata = {
            **metadata,
            "reviewerSnapshot": {
                "reviewerId": parsed.get("reviewerId"),
                "reviewerName": None,
                "capturedAt": parsed.get("submittedAt"),
                "source": "derived",
            },
        }

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
        metadata=metadata,
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


async def _get_active_cycle() -> Dict[str, Any]:
    """Get the active cycle (status = 'open') from the cycles table.
    Always use this logic - do not create fallback."""
    cycles_table = await get_cycles_table()
    
    # Scan for cycles with status = 'open'
    # Note: 'year', 'status', and 'name' are reserved keywords in DynamoDB, so we need to alias them in ProjectionExpression
    # For FilterExpression, we use the actual attribute name with Attr() from boto3
    last_evaluated_key = None
    while True:
        scan_kwargs = {
            "FilterExpression": Attr("status").eq("open"),
            "ProjectionExpression": "#year, #status, #name, startDate, endDate, metadata, createdAt, updatedAt",
            "ExpressionAttributeNames": {
                "#year": "year",
                "#status": "status",
                "#name": "name"
            }
        }
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        
        response = await cycles_table.scan(**scan_kwargs)
        items = response.get("Items", [])
        
        if items:
            # Parse and return the first active cycle found
            parsed_item = parse_dynamodb_item(items[0])
            return parsed_item
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
    
    # No active cycle found
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No active review cycle found. Please activate a cycle first.",
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
        parsed = parse_dynamodb_item(item, _review_logical_name(is_draft))
        if parsed.get("isActive", True) is False and not include_inactive:
            continue
        if review_type and parsed.get("reviewType") != review_type:
            continue
        if cycle_year and parsed.get("cycleYear") != cycle_year:
            continue
        return item, table
    
    return None, table


async def _get_active_employee_ids(force_refresh: bool = False) -> Optional[set]:
    """Return the set of employee IDs whose status is not 'inactive'.

    Cached for 5 minutes. Returns None (or a possibly-stale set) if the lookup
    fails, so callers treat "unknown" as "don't filter" rather than hiding
    every row.
    """
    now = time.time()
    cache = _active_employees_cache
    if (
        not force_refresh
        and cache["ids"] is not None
        and now - cache["timestamp"] < cache["ttl"]
    ):
        return cache["ids"]

    try:
        employees_table = await get_employees_table()
        active_ids: set = set()
        last_evaluated_key = None
        while True:
            scan_kwargs = {
                "ProjectionExpression": "id, #status",
                "ExpressionAttributeNames": {"#status": "status"},
            }
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await employees_table.scan(
                **_strip_projection_if_encryption(scan_kwargs)
            )
            for item in response.get("Items", []):
                parsed = parse_dynamodb_item(item)
                if parsed.get("status", "active") != "inactive":
                    emp_id = parsed.get("id")
                    if emp_id:
                        active_ids.add(emp_id)
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        cache["ids"] = active_ids
        cache["timestamp"] = now
        return active_ids
    except ClientError as exc:
        logger.warning("Failed to load active employee IDs: %s", exc)
        return cache["ids"]  # possibly stale, possibly None


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


def _build_update_expression(
    payload: Dict[str, Any],
    table_logical_name: Optional[str] = None,
) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
    set_clauses = []
    remove_clauses = []
    attr_names: Dict[str, str] = {}
    attr_values: Dict[str, Any] = {}
    name_counter = 0
    val_counter = 0

    for field, value in payload.items():
        if value is None:
            for rm in remove_field_names_for_delete(table_logical_name, field):
                placeholder_name = f"#n{name_counter}"
                name_counter += 1
                attr_names[placeholder_name] = rm
                remove_clauses.append(placeholder_name)
            continue

        formatted = format_dynamodb_item({field: value}, table_logical_name)
        for fk, fv in formatted.items():
            placeholder_name = f"#f{name_counter}"
            name_counter += 1
            attr_names[placeholder_name] = fk
            placeholder_value = f":v{val_counter}"
            val_counter += 1
            attr_values[placeholder_value] = fv
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
    """List all review cycles (cached for 5 minutes)."""
    del current_user
    
    # Check cache first
    current_time = time.time()
    if (_cycles_cache["data"] is not None and 
        current_time - _cycles_cache["timestamp"] < _cycles_cache["ttl"]):
        logger.info("Returning cached cycles")
        return _cycles_cache["data"]
    
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
        
        # Update cache
        _cycles_cache["data"] = cycles
        _cycles_cache["timestamp"] = current_time
        
    except ClientError as exc:
        logger.exception("Failed to list review cycles")
        # Stale-while-error: a transient scan failure should not blank the
        # dashboard when we still have a previous (expired) result to serve.
        if _cycles_cache["data"] is not None:
            logger.warning("Serving stale cycles cache after scan failure")
            return _cycles_cache["data"]
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
    
    IMPORTANT: Always uses the active cycle (status = 'open') from the database,
    not the cycleYear from the request body.
    """
    # Get the active cycle from database (status = 'open')
    active_cycle = await _get_active_cycle()
    active_cycle_year = str(active_cycle.get("year", ""))
    
    if not active_cycle_year or active_cycle_year == "":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Active cycle found but missing year field",
        )
    
    # Create a modified review dict with the active cycle's year
    review_dict = review.dict()
    original_cycle_year = review_dict.get("cycleYear")
    review_dict["cycleYear"] = active_cycle_year
    logger.info(f"Using active cycle year: {active_cycle_year} (ignoring request cycleYear: {original_cycle_year})")
    
    # Create a new ReviewCreate object with the corrected cycleYear
    review = ReviewCreate(**review_dict)
    
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
        review_id = parse_dynamodb_item(existing_item, _review_logical_name(is_draft)).get("reviewId", "")
        update_payload = review.dict()
        update_payload["isActive"] = True  # reactivate/ensure active
        update_payload["updatedAt"] = now
        
        update_expression, attr_names, attr_values = _build_update_expression(
            update_payload, _review_logical_name(is_draft)
        )
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
            existing_item = parse_dynamodb_item(existing_check["Item"], _review_logical_name(is_draft))
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
        await table.put_item(Item=format_dynamodb_item(item, _review_logical_name(is_draft)))
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

        # Reviews belonging to employees who have left / are inactive must not
        # keep a cycle from reaching 100%. None => lookup failed, so don't filter.
        active_ids = await _get_active_employee_ids()

        def _counts(emp_id: Optional[str]) -> bool:
            return active_ids is None or emp_id in active_ids

        # Count pending (draft self-reviews)
        pending = 0
        last_evaluated_key = None
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await drafts_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                parsed = parse_dynamodb_item(item, "reviewDraft")
                if parsed.get("reviewType") == "self" and _counts(parsed.get("employeeId")):
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
                parsed = parse_dynamodb_item(item, "review")
                review_type = parsed.get("reviewType")
                submitted_at = parsed.get("submittedAt")
                employee_id = parsed.get("employeeId")
                cycle_year = parsed.get("cycleYear")

                if not submitted_at or not _counts(employee_id):
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
        # Optimized to use ProjectionExpression to reduce data transfer
        async def count_table_items(table, filter_func=None):
            """Count items in a table, optionally filtering. Uses COUNT projection for efficiency."""
            count = 0
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "Select": "COUNT"  # Only return count, not full items
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                # If we have a filter function, we need to scan with FilterExpression
                # Otherwise, we can use COUNT projection
                if filter_func:
                    # Need full items for filtering, so use regular scan
                    scan_kwargs.pop("Select")
                    response = await table.scan(**scan_kwargs)
                    items = response.get("Items", [])
                    count += sum(
                        1 for item in items if filter_func(parse_dynamodb_item(item, "review"))
                    )
                else:
                    # No filter - use COUNT projection for efficiency
                    response = await table.scan(**scan_kwargs)
                    count += response.get("Count", 0)
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            return count
        
        # Helper function to process reviews table
        # Optimized to use ReviewTypeIndex for manager reviews with ProjectionExpression
        async def process_reviews_table(active_employee_ids: set):
            """Process reviews table to get completed reviews and ratings. Uses ReviewTypeIndex for efficiency.
            Only counts reviews for active employees."""
            reviews_table = await get_reviews_table()
            completed_reviews = 0
            pending_reviews = 0
            ratings_sum = 0.0
            ratings_count = 0
            
            # Use ReviewTypeIndex to query manager reviews directly (more efficient than scanning)
            # Use ProjectionExpression to only fetch needed fields (reduces data transfer)
            try:
                # Query manager reviews using ReviewTypeIndex
                last_evaluated_key = None
                while True:
                    query_kwargs = {
                        "IndexName": "ReviewTypeIndex",
                        "KeyConditionExpression": Key("reviewType").eq("manager"),
                        "FilterExpression": Attr("submittedAt").exists(),  # Only submitted reviews
                        "ProjectionExpression": "employeeId, submittedAt, #metadata, ratings",  # Include employeeId to filter
                        "ExpressionAttributeNames": {
                            "#metadata": "metadata"
                        }
                    }
                    if last_evaluated_key:
                        query_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    
                    response = await reviews_table.query(**_strip_projection_if_encryption(query_kwargs))
                    for item in response.get("Items", []):
                        parsed = parse_dynamodb_item(item, "review")
                        employee_id = parsed.get("employeeId")
                        submitted_at = parsed.get("submittedAt")
                        
                        # Only count reviews for active employees
                        if submitted_at and employee_id in active_employee_ids:
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
                
                # Note: We don't count manager reviews without submittedAt as "pending"
                # because those would be manager drafts, not pending reviews.
                # Pending reviews = draft self-reviews (counted in draft_count)
                # Manager pending = self-reviews submitted but no manager review yet (not counted here)
                # This is handled separately if needed
                        
            except ClientError as exc:
                # Fallback to scan if index doesn't exist
                logger.warning(f"ReviewTypeIndex not available, falling back to scan: {exc}")
                last_evaluated_key = None
                while True:
                    scan_kwargs = {
                        "ProjectionExpression": "employeeId, reviewType, submittedAt, #metadata, ratings",  # Include employeeId to filter
                        "ExpressionAttributeNames": {
                            "#metadata": "metadata"
                        }
                    }
                    if last_evaluated_key:
                        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    response = await reviews_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                    for item in response.get("Items", []):
                        parsed = parse_dynamodb_item(item, "review")
                        employee_id = parsed.get("employeeId")
                        review_type = parsed.get("reviewType")
                        submitted_at = parsed.get("submittedAt")
                        
                        # Note: Reviews in the reviews table should have submittedAt
                        # If they don't, they might be incorrectly placed (should be in drafts table)
                        # We don't count these as pending reviews
                        # Only count reviews for active employees
                        
                        if review_type == "manager" and submitted_at and employee_id in active_employee_ids:
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
        # Count active employees and get their IDs, and draft reviews in parallel
        async def get_active_employees():
            """Get count and set of active employee IDs.

            Only needs id + status — skip field decryption entirely to avoid
            thousands of KMS round-trips that added ~30 s to this endpoint.
            """
            active_ids = set()
            count = 0
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "ProjectionExpression": "id, #status",
                    "ExpressionAttributeNames": {
                        "#status": "status"
                    }
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await employees_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item)
                    emp_status = parsed.get("status", "active")
                    if emp_status != "inactive":
                        emp_id = parsed.get("id")
                        if emp_id:
                            active_ids.add(emp_id)
                            count += 1
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            return count, active_ids
        
        async def count_draft_reviews(active_employee_ids: set):
            """Count only draft self-reviews (pending self-reviews that need to be submitted) for active employees.

            employeeId and reviewType are not encrypted — skip decryption.
            """
            count = 0
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "ProjectionExpression": "employeeId, reviewType"
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await drafts_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item)
                    if parsed.get("reviewType") == "self" and parsed.get("employeeId") in active_employee_ids:
                        count += 1
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            return count
        
        # Get active employees first (needed for filtering reviews)
        total_employees, active_employee_ids = await get_active_employees()
        
        # Run remaining queries in parallel
        results = await asyncio.gather(
            count_draft_reviews(active_employee_ids),
            process_reviews_table(active_employee_ids)
        )
        draft_count = results[0]
        completed_reviews, pending_from_reviews, ratings_sum, ratings_count = results[1]
        
        # Total pending = draft self-reviews (employees who haven't submitted their self-review yet)
        # Note: pending_from_reviews is now 0 (we removed counting manager reviews without submittedAt)
        pending_reviews = draft_count
        
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


@router.get("/dashboard/completion-trend", response_model=List[CompletionTrendPoint])
async def get_completion_trend(
    cycleYear: Optional[str] = Query(None, description="Optional: filter by cycle year. If not provided, uses current active cycle."),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Get completion trend data showing review completion progress over time.
    Returns weekly data points with completed and pending counts.
    Optimized with caching and efficient indexing.
    """
    del current_user
    
    # Validate cycleYear format if provided
    if cycleYear and not cycleYear.isdigit() or (cycleYear and len(cycleYear) != 4):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cycleYear format. Must be a 4-digit year (e.g., 2025)"
        )
    
    # Check cache first
    cache_key = f"completion_trend_{cycleYear or 'current'}"
    current_time = time.time()
    if cache_key in _completion_trend_cache:
        cached_data, cached_timestamp = _completion_trend_cache[cache_key]
        if current_time - cached_timestamp < 300:  # 5 minute TTL
            logger.info(f"Returning cached completion trend for {cache_key}")
            return cached_data
    
    try:
        reviews_table = await get_reviews_table()
        drafts_table = await get_review_drafts_table()
        cycles_table = await get_cycles_table()
        
        # OPTIMIZED: Determine cycle year - use cache if available
        target_cycle_year = cycleYear
        cycle_start_date = None
        
        if not target_cycle_year:
            # Check cache for active cycle
            active_cycle_cache_key = "active_cycle_year"
            if active_cycle_cache_key in _completion_trend_cache:
                cached_cycle, cached_ts = _completion_trend_cache[active_cycle_cache_key]
                if current_time - cached_ts < 600:  # 10 minute TTL for active cycle
                    target_cycle_year = cached_cycle.get("year")
                    cycle_start_date = cached_cycle.get("startDate")
            
            if not target_cycle_year:
                # Get current active cycle - OPTIMIZED: Only fetch year and startDate
                last_evaluated_key = None
                active_cycles = []
                while True:
                    scan_kwargs = {
                        "FilterExpression": Attr("status").in_(["open", "active"]),
                        "ProjectionExpression": "#year, startDate, #status",  # Only fetch needed fields
                        "ExpressionAttributeNames": {
                            "#year": "year",
                            "#status": "status"
                        }
                    }
                    if last_evaluated_key:
                        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    response = await cycles_table.scan(**scan_kwargs)
                    for item in response.get("Items", []):
                        parsed = parse_dynamodb_item(item)
                        active_cycles.append(parsed)
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
                
                if active_cycles:
                    # Sort by year descending and take the most recent
                    active_cycles.sort(key=lambda x: x.get("year", ""), reverse=True)
                    target_cycle_year = active_cycles[0].get("year")
                    cycle_start_date = active_cycles[0].get("startDate")
                    # Cache the active cycle
                    _completion_trend_cache[active_cycle_cache_key] = (active_cycles[0], current_time)
                else:
                    # Fallback: use current year
                    target_cycle_year = datetime.now().strftime("%Y")
        else:
            # Get cycle details for start date - OPTIMIZED: Only fetch startDate
            try:
                response = await cycles_table.get_item(
                    Key={"year": target_cycle_year},
                    ProjectionExpression="startDate",
                )
                if "Item" in response:
                    cycle_data = parse_dynamodb_item(response["Item"])
                    cycle_start_date = cycle_data.get("startDate")
            except:
                cycle_start_date = None
        
        # Parse cycle start date or use current date as fallback
        if cycle_start_date:
            try:
                cycle_start = datetime.fromisoformat(cycle_start_date.replace('Z', '+00:00'))
            except:
                cycle_start = datetime.now(timezone.utc)
        else:
            cycle_start = datetime.now(timezone.utc)
        
        # Calculate 4 weeks from cycle start
        weeks = []
        for week_num in range(1, 5):
            week_start = cycle_start + timedelta(weeks=week_num - 1)
            week_end = cycle_start + timedelta(weeks=week_num)
            weeks.append({
                "week": f"Week {week_num}",
                "start": week_start,
                "end": week_end,
                "completed": 0,
                "pending": 0
            })
        
        # Get all manager reviews (completed) for the cycle
        # Use ProjectionExpression to only fetch submittedAt (reduces data transfer significantly)
        try:
            last_evaluated_key = None
            while True:
                query_kwargs = {
                    "IndexName": "ReviewTypeIndex",
                    "KeyConditionExpression": Key("reviewType").eq("manager"),
                    "FilterExpression": Attr("cycleYear").eq(target_cycle_year) & Attr("submittedAt").exists(),
                    "ProjectionExpression": "submittedAt, cycleYear"  # Only fetch needed fields
                }
                if last_evaluated_key:
                    query_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.query(**_strip_projection_if_encryption(query_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    submitted_at = parsed.get("submittedAt")
                    if submitted_at:
                        try:
                            submit_date = datetime.fromisoformat(submitted_at.replace('Z', '+00:00'))
                            # Find which week this belongs to
                            for week in weeks:
                                if week["start"] <= submit_date < week["end"]:
                                    week["completed"] += 1
                                    break
                        except:
                            pass
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        except ClientError:
            # Fallback to scan if index doesn't exist
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "FilterExpression": Attr("cycleYear").eq(target_cycle_year) & Attr("reviewType").eq("manager") & Attr("submittedAt").exists()
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    submitted_at = parsed.get("submittedAt")
                    if submitted_at:
                        try:
                            submit_date = datetime.fromisoformat(submitted_at.replace('Z', '+00:00'))
                            for week in weeks:
                                if week["start"] <= submit_date < week["end"]:
                                    week["completed"] += 1
                                    break
                        except:
                            pass
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        
        # Get total employees count for the cycle to calculate pending
        # Use COUNT projection for efficiency (no need to fetch full items)
        # OPTIMIZED: Cache employee count separately to avoid repeated scans
        employees_table = await get_employees_table()
        employee_count_cache_key = "active_employee_count"
        total_employees = 0
        
        # Check if we have a cached count (with 10 min TTL)
        if employee_count_cache_key in _completion_trend_cache:
            cached_count, cached_ts = _completion_trend_cache[employee_count_cache_key]
            if current_time - cached_ts < 600:  # 10 minute TTL for employee count
                total_employees = cached_count
            else:
                # Recalculate
                last_evaluated_key = None
                while True:
                    scan_kwargs = {
                        "FilterExpression": Attr("status").ne("inactive"),
                        "Select": "COUNT"  # Only return count, not full items
                    }
                    if last_evaluated_key:
                        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    response = await employees_table.scan(**scan_kwargs)
                    total_employees += response.get("Count", 0)
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
                # Cache the count
                _completion_trend_cache[employee_count_cache_key] = (total_employees, current_time)
        else:
            # First time - calculate and cache
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "FilterExpression": Attr("status").ne("inactive"),
                    "Select": "COUNT"  # Only return count, not full items
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await employees_table.scan(**scan_kwargs)
                total_employees += response.get("Count", 0)
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            # Cache the count
            _completion_trend_cache[employee_count_cache_key] = (total_employees, current_time)
        
        # Calculate pending for each week (total employees - completed up to that week)
        cumulative_completed = 0
        for week in weeks:
            cumulative_completed += week["completed"]
            week["pending"] = max(0, total_employees - cumulative_completed)
        
        # Return in expected format
        result = [
            CompletionTrendPoint(
                week=w["week"],
                completed=w["completed"],
                pending=w["pending"]
            )
            for w in weeks
        ]
        
        # Cache the result
        _completion_trend_cache[cache_key] = (result, current_time)
        
        return result
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error getting completion trend")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get completion trend data",
        ) from exc


@router.get("/dashboard/rating-distribution", response_model=List[RatingDistributionPoint])
async def get_rating_distribution(
    cycleYear: Optional[str] = Query(None, description="Optional: filter by cycle year. If not provided, uses all cycles."),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Get rating distribution data showing distribution of performance ratings (1-5).
    Returns count and percentage for each rating level.
    Optimized with caching and efficient indexing.
    """
    del current_user
    
    # Validate cycleYear format if provided
    if cycleYear and (not cycleYear.isdigit() or len(cycleYear) != 4):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cycleYear format. Must be a 4-digit year (e.g., 2025)"
        )
    
    # Check cache first
    cache_key = f"rating_distribution_{cycleYear or 'all'}"
    current_time = time.time()
    if cache_key in _rating_distribution_cache:
        cached_data, cached_timestamp = _rating_distribution_cache[cache_key]
        if current_time - cached_timestamp < 300:  # 5 minute TTL
            logger.info(f"Returning cached rating distribution for {cache_key}")
            return cached_data
    
    try:
        reviews_table = await get_reviews_table()
        
        # Initialize rating counts
        rating_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_reviews = 0
        
        # Query manager reviews with ratings
        # Use ProjectionExpression to only fetch rating fields (reduces data transfer significantly)
        try:
            last_evaluated_key = None
            while True:
                # Build filter expression
                filter_expr = Attr("submittedAt").exists()
                if cycleYear:
                    filter_expr = filter_expr & Attr("cycleYear").eq(cycleYear)
                
                query_kwargs = {
                    "IndexName": "ReviewTypeIndex",
                    "KeyConditionExpression": Key("reviewType").eq("manager"),
                    "FilterExpression": filter_expr,
                    "ProjectionExpression": "#metadata, ratings, cycleYear",  # Only fetch needed fields
                    "ExpressionAttributeNames": {
                        "#metadata": "metadata"
                    }
                }
                
                if last_evaluated_key:
                    query_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.query(**_strip_projection_if_encryption(query_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    
                    # Extract rating from metadata.finalRating.overallRating or ratings.overall
                    metadata = parsed.get("metadata", {})
                    final_rating = metadata.get("finalRating", {})
                    overall_rating = final_rating.get("overallRating")
                    
                    if overall_rating is None:
                        ratings_obj = parsed.get("ratings", {})
                        overall_rating = ratings_obj.get("overall")
                    
                    if overall_rating is not None:
                        try:
                            rating_value = float(overall_rating)
                            if 1 <= rating_value <= 5:
                                # Round to nearest integer
                                rating_int = int(round(rating_value))
                                rating_counts[rating_int] += 1
                                total_reviews += 1
                        except (ValueError, TypeError):
                            pass
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        except ClientError:
            # Fallback to scan if index doesn't exist
            last_evaluated_key = None
            while True:
                # Build filter expression using & operator
                filter_expr = Attr("reviewType").eq("manager") & Attr("submittedAt").exists()
                if cycleYear:
                    filter_expr = filter_expr & Attr("cycleYear").eq(cycleYear)
                
                scan_kwargs = {
                    "FilterExpression": filter_expr,
                    "ProjectionExpression": "#metadata, ratings, cycleYear",  # Only fetch needed fields
                    "ExpressionAttributeNames": {
                        "#metadata": "metadata"
                    }
                }
                
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    
                    metadata = parsed.get("metadata", {})
                    final_rating = metadata.get("finalRating", {})
                    overall_rating = final_rating.get("overallRating")
                    
                    if overall_rating is None:
                        ratings_obj = parsed.get("ratings", {})
                        overall_rating = ratings_obj.get("overall")
                    
                    if overall_rating is not None:
                        try:
                            rating_value = float(overall_rating)
                            if 1 <= rating_value <= 5:
                                rating_int = int(round(rating_value))
                                rating_counts[rating_int] += 1
                                total_reviews += 1
                        except (ValueError, TypeError):
                            pass
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        
        # Calculate percentages and return in expected format (5 to 1 order)
        result = []
        for rating in [5, 4, 3, 2, 1]:
            count = rating_counts[rating]
            percentage = (count / total_reviews * 100) if total_reviews > 0 else 0.0
            result.append(RatingDistributionPoint(
                rating=rating,
                count=count,
                percentage=round(percentage, 1)
            ))
        
        # Cache the result
        _rating_distribution_cache[cache_key] = (result, current_time)
        
        return result
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error getting rating distribution")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get rating distribution data",
        ) from exc


@router.get("/dashboard/team-performance", response_model=List[TeamPerformancePoint])
async def get_team_performance(
    cycleYear: Optional[str] = Query(None, description="Optional: filter by cycle year. If not provided, uses current active cycle."),
    current_user: dict = Depends(get_current_active_user),
):
    """
    OPTIMIZED: Uses caching, ProjectionExpression, and efficient data structures.
    """
    del current_user
    
    # Check cache first
    cache_key = f"team_performance_{cycleYear or 'current'}"
    current_time = time.time()
    if cache_key in _team_performance_cache:
        cached_data, cached_timestamp = _team_performance_cache[cache_key]
        if current_time - cached_timestamp < 300:  # 5 minute TTL
            logger.info(f"Returning cached team performance for {cache_key}")
            return cached_data
    
    try:
        employees_table = await get_employees_table()
        reviews_table = await get_reviews_table()
        cycles_table = await get_cycles_table()
        
        # OPTIMIZED: Determine cycle year - use cache if available
        target_cycle_year = cycleYear
        if not target_cycle_year:
            # Check cache for active cycle
            active_cycle_cache_key = "active_cycle_year"
            if active_cycle_cache_key in _team_performance_cache:
                cached_cycle, cached_ts = _team_performance_cache[active_cycle_cache_key]
                if current_time - cached_ts < 600:  # 10 minute TTL for active cycle
                    target_cycle_year = cached_cycle.get("year")
            
            if not target_cycle_year:
                # Get current active cycle - OPTIMIZED: Only fetch year
                last_evaluated_key = None
                active_cycles = []
                while True:
                    scan_kwargs = {
                        "FilterExpression": Attr("status").in_(["open", "active"]),
                        "ProjectionExpression": "#year, #status",  # Only fetch needed fields
                        "ExpressionAttributeNames": {
                            "#year": "year",
                            "#status": "status"
                        }
                    }
                    if last_evaluated_key:
                        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                    response = await cycles_table.scan(**scan_kwargs)
                    for item in response.get("Items", []):
                        parsed = parse_dynamodb_item(item)
                        active_cycles.append(parsed)
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
                
                if active_cycles:
                    active_cycles.sort(key=lambda x: x.get("year", ""), reverse=True)
                    target_cycle_year = active_cycles[0].get("year")
                    # Cache the active cycle
                    _team_performance_cache[active_cycle_cache_key] = (active_cycles[0], current_time)
                else:
                    target_cycle_year = datetime.now().strftime("%Y")
        
        # OPTIMIZED: Fetch only needed fields for employees (id, name, position, reporting_to, status)
        employees = []
        employee_map = {}  # {employee_id: employee}
        last_evaluated_key = None
        while True:
            scan_kwargs = {
                "FilterExpression": Attr("status").ne("inactive"),
                "ProjectionExpression": "id, #name, #position, reporting_to, #status",  # Only fetch needed fields
                "ExpressionAttributeNames": {
                    "#name": "name",
                    "#position": "position",
                    "#status": "status"
                }
            }
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            response = await employees_table.scan(**_strip_projection_if_encryption(scan_kwargs))
            for item in response.get("Items", []):
                parsed = parse_dynamodb_item(item, "employees")
                employee_id = parsed.get("id")
                if employee_id:
                    employees.append(parsed)
                    employee_map[employee_id] = parsed
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        # Find all managers (anyone who has direct reports)
        directors = []
        for emp in employees:
            emp_id = emp.get("id")
            if emp_id and any(e.get("reporting_to") == emp_id for e in employees):
                directors.append(emp)
        
        # Group employees by their direct manager 
        teams_by_director = {}  # {manager_id: {manager: emp, employees: [emp_ids]}}
        
        for director in directors:
            director_id = director.get("id")
            if director_id:
                teams_by_director[director_id] = {
                    "director": director,
                    "employees": []
                }
        
        # Validate cycle
        if not target_cycle_year:
            raise HTTPException(status_code=400, detail="No active review cycle found")
        
        # Assign employees to their direct managers (include all direct reports)
        for emp in employees:
            manager_id = emp.get("reporting_to")
            if manager_id and manager_id in teams_by_director:
                teams_by_director[manager_id]["employees"].append(emp.get("id"))
        
        # OPTIMIZED: Fetch only needed fields for manager reviews (employeeId, metadata, ratings)
        manager_reviews_by_employee = {}  # {employee_id: {rating, submitted}}
        try:
            last_evaluated_key = None
            while True:
                query_kwargs = {
                    "IndexName": "ReviewTypeIndex",
                    "KeyConditionExpression": Key("reviewType").eq("manager"),
                    "FilterExpression": And(
                        Attr("cycleYear").eq(target_cycle_year),
                        Attr("submittedAt").exists()
                    ),
                    "ProjectionExpression": "employeeId, #metadata, ratings",  # Only fetch needed fields
                    "ExpressionAttributeNames": {
                        "#metadata": "metadata"
                    }
                }
                if last_evaluated_key:
                    query_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.query(**_strip_projection_if_encryption(query_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    employee_id = parsed.get("employeeId")
                    
                    if employee_id:
                        # Extract rating
                        metadata = parsed.get("metadata", {})
                        final_rating = metadata.get("finalRating", {})
                        overall_rating = final_rating.get("overallRating")
                        
                        if overall_rating is None:
                            ratings_obj = parsed.get("ratings", {})
                            overall_rating = ratings_obj.get("overall")
                        
                        if overall_rating is not None:
                            try:
                                rating_value = float(overall_rating)
                                if 1 <= rating_value <= 5:
                                    manager_reviews_by_employee[employee_id] = {
                                        "rating": rating_value,
                                        "submitted": True
                                    }
                            except (ValueError, TypeError):
                                pass
                        else:
                            # Review exists but no rating
                            manager_reviews_by_employee[employee_id] = {
                                "rating": None,
                                "submitted": True
                            }
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        except ClientError:
            # Fallback to scan if index doesn't exist
            last_evaluated_key = None
            while True:
                scan_kwargs = {
                    "FilterExpression": Attr("cycleYear").eq(target_cycle_year) & Attr("reviewType").eq("manager") & Attr("submittedAt").exists(),
                    "ProjectionExpression": "employeeId, #metadata, ratings",  # Only fetch needed fields
                    "ExpressionAttributeNames": {
                        "#metadata": "metadata"
                    }
                }
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                
                response = await reviews_table.scan(**_strip_projection_if_encryption(scan_kwargs))
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item, "review")
                    employee_id = parsed.get("employeeId")
                    
                    if employee_id:
                        metadata = parsed.get("metadata", {})
                        final_rating = metadata.get("finalRating", {})
                        overall_rating = final_rating.get("overallRating")
                        
                        if overall_rating is None:
                            ratings_obj = parsed.get("ratings", {})
                            overall_rating = ratings_obj.get("overall")
                        
                        if overall_rating is not None:
                            try:
                                rating_value = float(overall_rating)
                                if 1 <= rating_value <= 5:
                                    manager_reviews_by_employee[employee_id] = {
                                        "rating": rating_value,
                                        "submitted": True
                                    }
                            except (ValueError, TypeError):
                                pass
                        else:
                            manager_reviews_by_employee[employee_id] = {
                                "rating": None,
                                "submitted": True
                            }
                
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
        
        # Helper function to get initials from name
        def get_initials(name: str) -> str:
            if not name:
                return ""
            parts = name.split()
            return "".join(p[0].upper() for p in parts if p)
        
        # Calculate metrics for each team
        team_performance = []
        for director_id, team_data in teams_by_director.items():
            director = team_data["director"]
            employee_ids = team_data["employees"]
            
            if len(employee_ids) == 0:
                continue  # Skip teams with no members
            
            # Calculate completion rate and average rating
            completed_count = 0
            ratings_sum = 0.0
            ratings_count = 0
            
            for emp_id in employee_ids:
                review_data = manager_reviews_by_employee.get(emp_id)
                if review_data and review_data.get("submitted"):
                    completed_count += 1
                    rating = review_data.get("rating")
                    if rating is not None:
                        ratings_sum += rating
                        ratings_count += 1
            
            completion_rate = (completed_count / len(employee_ids) * 100) if len(employee_ids) > 0 else 0.0
            average_rating = (ratings_sum / ratings_count) if ratings_count > 0 else 0.0
            
            name = director.get("name") or "Unknown"
            position = director.get("position") or ""
            team_name = name
            
            team_performance.append({
                "team": team_name,
                "completionRate": round(completion_rate, 1),
                "averageRating": round(average_rating, 1),
                "employees": len(employee_ids)
            })
        
        # Sort by completion rate descending
        team_performance.sort(key=lambda x: x["completionRate"], reverse=True)
        
        # Return in expected format
        result = [
            TeamPerformancePoint(
                team=t["team"],
                completionRate=t["completionRate"],
                averageRating=t["averageRating"],
                employees=t["employees"]
            )
            for t in team_performance
        ]
        
        # Cache the result
        _team_performance_cache[cache_key] = (result, current_time)
        
        return result
        
    except Exception as exc:
        logger.exception("Error getting team performance")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get team performance data",
        ) from exc


@router.post("/upload-attachment")
async def upload_review_attachment(
    file: UploadFile = File(...),
    employee_id: str = Form(...),
    review_id: Optional[str] = Form(None),
    cycle_year: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Upload a file attachment for a review.
    Returns the S3 URL of the uploaded file.
    """
    try:
        # Validate inputs
        if not employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="employee_id is required"
            )
        
        # If cycle_year not provided, try to get from current active cycle
        if not cycle_year:
            cycles_table = await get_cycles_table()
            last_evaluated_key = None
            active_cycles = []
            while True:
                scan_kwargs = {}
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await cycles_table.scan(**scan_kwargs)
                for item in response.get("Items", []):
                    parsed = parse_dynamodb_item(item)
                    if parsed.get("status") in ["open", "active"]:
                        active_cycles.append(parsed)
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
            
            if active_cycles:
                active_cycles.sort(key=lambda x: x.get("year", ""), reverse=True)
                cycle_year = active_cycles[0].get("year")
            else:
                cycle_year = datetime.now().strftime("%Y")
        
        # Upload file to S3
        attachment_url = await s3_service.upload_attachment(
            file=file,
            employee_id=employee_id,
            review_id=review_id,
            cycle_year=cycle_year
        )
        
        logger.info(f"Uploaded attachment for employee {employee_id}, review {review_id}, URL: {attachment_url}")
        
        return {
            "url": attachment_url,
            "filename": file.filename,
            "size": file.size,
            "content_type": file.content_type
        }
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error uploading review attachment")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload attachment",
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
                emp = parse_dynamodb_item(item, "employees")
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

        # Load manager reviews AND self reviews for the given cycle from both submitted and draft tables
        reviews_table = await get_reviews_table()
        drafts_table = await get_review_drafts_table()

        manager_review_map: Dict[str, ReviewInDB] = {}
        self_review_map: Dict[str, ReviewInDB] = {}  # Key: employeeId, Value: ReviewInDB
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

                # Filter reviews for the requested cycle year (both manager and self)
                filter_expr = Attr("cycleYear").eq(cycleYear) & (
                    Attr("reviewType").eq("manager") | Attr("reviewType").eq("self")
                )
                scan_kwargs["FilterExpression"] = filter_expr

                response = await table.scan(**scan_kwargs)
                for item in response.get("Items", []):
                    review_obj = _map_review(item, is_draft=is_draft_table)
                    review_id = review_obj.reviewId
                    if not review_id:
                        continue

                    if review_obj.reviewType == "manager":
                        existing = manager_review_map.get(review_id)
                        if not existing:
                            manager_review_map[review_id] = review_obj
                            continue

                        existing_status = _get_review_status_value(existing).lower()
                        new_status = _get_review_status_value(review_obj).lower()
                        existing_is_processed = existing_status in processed_statuses
                        new_is_processed = new_status in processed_statuses

                        if new_is_processed and not existing_is_processed:
                            manager_review_map[review_id] = review_obj
                        elif existing_is_processed and not new_is_processed:
                            # keep existing
                            pass
                        else:
                            # Same priority - keep the one with the most recent timestamp
                            existing_ts = _parse_timestamp(existing.updatedAt or existing.createdAt)
                            new_ts = _parse_timestamp(review_obj.updatedAt or review_obj.createdAt)
                            if new_ts > existing_ts:
                                manager_review_map[review_id] = review_obj
                    elif review_obj.reviewType == "self":
                        # For self reviews, keep the most recent one per employee
                        emp_id = review_obj.employeeId
                        existing_self = self_review_map.get(emp_id)
                        if not existing_self:
                            self_review_map[emp_id] = review_obj
                        else:
                            # Keep the one with the most recent timestamp
                            existing_ts = _parse_timestamp(existing_self.updatedAt or existing_self.createdAt)
                            new_ts = _parse_timestamp(review_obj.updatedAt or review_obj.createdAt)
                            if new_ts > existing_ts:
                                self_review_map[emp_id] = review_obj

                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break

        reviews = list(manager_review_map.values())

        # Build CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        # CSV header - expanded with all review details
        writer.writerow(
            [
                "cycleYear",
                "cycleName",
                "employee_id",
                "employeeName",
                "employeeEmail",
                "employeeDepartment",
                "employeePosition",
                "managerId",
                "managerEmail",
                "managerSignOffStatus",
                "rawStatus",
                "submittedAt",
                "lastUpdated",
                # Self Review Highlights
                "selfReview_KeyAccomplishments",
                "selfReview_BeyondRoleContributions",
                "selfReview_ChallengesAndSolutions",
                "selfReview_AreasOfImprovement",
                "selfReview_CertificationsCompleted",
                "selfReview_OverallRating",
                # Manager Summary
                "managerOverallRating",
                "managerSummary_SummaryFeedback",
                "managerSummary_DevelopmentNeed",
                "managerSummary_ActionPlan",
                "managerSummary_Recommendations",
                # Goals (up to 5 goals)
                "goal1_Title",
                "goal1_Weightage",
                "goal1_Rating",
                "goal1_Completion",
                "goal2_Title",
                "goal2_Weightage",
                "goal2_Rating",
                "goal2_Completion",
                "goal3_Title",
                "goal3_Weightage",
                "goal3_Rating",
                "goal3_Completion",
                "goal4_Title",
                "goal4_Weightage",
                "goal4_Rating",
                "goal4_Completion",
                "goal5_Title",
                "goal5_Weightage",
                "goal5_Rating",
                "goal5_Completion",
                "allGoals_JSON",  # JSON string of all goals if more than 5
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
            raw_status = _get_review_status_value(review)

            # Extract overall rating from ratings/metadata
            overall_rating = None
            if review.ratings and isinstance(review.ratings, dict):
                overall_rating = review.ratings.get("overall")
            if overall_rating is None:
                metadata = review.metadata or {}
                final_rating = metadata.get("finalRating") or {}
                overall_rating = final_rating.get("overallRating")

            submitted_at = review.submittedAt or ""
            last_updated = review.updatedAt or review.createdAt or ""

            # Get manager email
            manager_email = manager.get("email", "") if manager else ""

            # Get self-review data
            self_review = self_review_map.get(review.employeeId)
            self_review_fields = {}
            self_review_overall_rating = ""
            if self_review:
                if self_review.metadata:
                    self_review_meta = self_review.metadata.get("selfReviewFields", {})
                    self_review_fields = {
                        "keyAccomplishments": self_review_meta.get("significantAccomplishments", ""),
                        "beyondRoleContributions": self_review_meta.get("beyondRoleContributions", ""),
                        "challengesAndSolutions": self_review_meta.get("challengesAndSolutions", ""),
                        "areasOfImprovement": self_review_meta.get("areasNeedingImprovement", ""),
                        "certificationsCompleted": self_review_meta.get("certificationsCompleted", ""),
                    }
                    self_review_overall_rating = self_review.metadata.get("selfRating", "")
                
                # Check ratings.overall if metadata.selfRating is empty
                if not self_review_overall_rating and self_review.ratings:
                    self_review_overall_rating = self_review.ratings.get("overall", "")

            # Get manager summary from metadata
            manager_metadata = review.metadata or {}
            final_rating = manager_metadata.get("finalRating", {})
            manager_summary = {
                "summaryFeedback": final_rating.get("summaryFeedback", ""),
                "developmentNeed": final_rating.get("developmentNeed", ""),
                "actionPlan": final_rating.get("actionPlan", ""),
                "recommendations": final_rating.get("developmentRecommendations", ""),
            }

            # Get goal reviews
            goal_reviews = manager_metadata.get("goalReviews", [])
            # Extract up to 5 goals
            goal_data = []
            for i in range(5):
                if i < len(goal_reviews):
                    goal = goal_reviews[i]
                    goal_data.extend([
                        goal.get("goalDescription", ""),
                        goal.get("weightage", ""),
                        goal.get("managerRating", ""),
                        goal.get("completion", ""),
                    ])
                else:
                    goal_data.extend(["", "", "", ""])
            
            # All goals as JSON (if more than 5)
            all_goals_json = ""
            if len(goal_reviews) > 5:
                all_goals_json = json.dumps(goal_reviews)

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
                    manager_email,
                    signoff_status,
                    raw_status,
                    submitted_at,
                    last_updated,
                    # Self Review Highlights
                    self_review_fields.get("keyAccomplishments", ""),
                    self_review_fields.get("beyondRoleContributions", ""),
                    self_review_fields.get("challengesAndSolutions", ""),
                    self_review_fields.get("areasOfImprovement", ""),
                    self_review_fields.get("certificationsCompleted", ""),
                    self_review_overall_rating,
                    # Manager Summary
                    overall_rating if overall_rating is not None else "",
                    manager_summary.get("summaryFeedback", ""),
                    manager_summary.get("developmentNeed", ""),
                    manager_summary.get("actionPlan", ""),
                    manager_summary.get("recommendations", ""),
                    # Goals (up to 5)
                    *goal_data,
                    all_goals_json,
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
    activeEmployeesOnly: Optional[bool] = Query(False, description="Exclude reviews whose employee has left / is marked inactive"),
    current_user: dict = Depends(get_current_active_user),
):
    """Query reviews with optional filters.

    If includeSelfReview=True and reviewType=manager, also fetches the corresponding self-review
    for the same employeeId and cycleYear.

    If activeEmployeesOnly=True, reviews belonging to employees who are no longer
    in the directory or are marked inactive are dropped from the response.
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
                    parsed = parse_dynamodb_item(item, _review_logical_name(is_draft_table))
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
                    parsed = parse_dynamodb_item(item, _review_logical_name(is_draft_table))
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
                # No specific filter - use ReviewTypeIndex if available, otherwise scan with filters
                # Check cache for this query pattern
                cache_key = f"{is_draft_table}_{reviewType}_{cycleYear}_{includeInactive}"
                current_time = time.time()
                if cache_key in _reviews_query_cache:
                    cached_data, cached_time = _reviews_query_cache[cache_key]
                    if current_time - cached_time < 120:  # 2 minute cache
                        logger.info(f"Returning cached reviews for query: {cache_key}")
                        reviews.extend(cached_data)
                        continue
                
                # Try to use ReviewTypeIndex if reviewType is specified
                if reviewType:
                    try:
                        # Use ReviewTypeIndex GSI for fast query
                        last_evaluated_key = None
                        query_reviews = []
                        while True:
                            query_kwargs = {
                                "IndexName": "ReviewTypeIndex",
                                "KeyConditionExpression": Key("reviewType").eq(reviewType)
                            }
                            if last_evaluated_key:
                                query_kwargs["ExclusiveStartKey"] = last_evaluated_key
                            
                            # Add FilterExpression for cycleYear and isActive if needed
                            filter_conditions = []
                            if cycleYear:
                                filter_conditions.append(Attr("cycleYear").eq(cycleYear))
                            if not includeInactive:
                                filter_conditions.append(Attr("isActive").eq(True))
                            
                            if filter_conditions:
                                if len(filter_conditions) == 1:
                                    query_kwargs["FilterExpression"] = filter_conditions[0]
                                else:
                                    query_kwargs["FilterExpression"] = And(*filter_conditions)
                            
                            response = await table.query(**_strip_projection_if_encryption(query_kwargs))
                            
                            for item in response.get("Items", []):
                                parsed = parse_dynamodb_item(item, _review_logical_name(is_draft_table))
                                item_is_active = parsed.get("isActive", True)
                                
                                # Skip inactive items (unless includeInactive=True)
                                if item_is_active is False and not includeInactive:
                                    continue
                                
                                query_reviews.append(_map_review(item, is_draft=is_draft_table))
                            
                            last_evaluated_key = response.get("LastEvaluatedKey")
                            if not last_evaluated_key:
                                break
                        
                        reviews.extend(query_reviews)
                        # Cache the results
                        _reviews_query_cache[cache_key] = (query_reviews, current_time)
                        continue
                    except ClientError as exc:
                        # Fallback to scan if index doesn't exist
                        logger.warning(f"ReviewTypeIndex not available, falling back to scan: {exc}")
                
                # Fallback to scan with filters (if no reviewType or index unavailable)
                last_evaluated_key = None
                scan_reviews = []
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
                    if not includeInactive:
                        if filter_expr:
                            filter_expr = filter_expr & Attr("isActive").eq(True)
                        else:
                            filter_expr = Attr("isActive").eq(True)
                    
                    if filter_expr:
                        scan_kwargs["FilterExpression"] = filter_expr
                    
                    response = await table.scan(**_strip_projection_if_encryption(scan_kwargs))
                    
                    for item in response.get("Items", []):
                        parsed = parse_dynamodb_item(item, _review_logical_name(is_draft_table))
                        item_is_active = parsed.get("isActive", True)  # Default to True for backward compatibility
                        
                        # Skip inactive items (unless includeInactive=True for debugging)
                        if item_is_active is False and not includeInactive:
                            continue
                        
                        scan_reviews.append(_map_review(item, is_draft=is_draft_table))
                    
                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break
                
                reviews.extend(scan_reviews)
                # Cache the results
                if not reviewType:  # Only cache if we used scan (no reviewType means no index)
                    _reviews_query_cache[cache_key] = (scan_reviews, current_time)
        
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
                        parsed = parse_dynamodb_item(item, _review_logical_name(is_draft_table))
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

    if activeEmployeesOnly and reviews:
        active_ids = await _get_active_employee_ids()
        if active_ids is not None:
            before = len(reviews)
            reviews = [r for r in reviews if r.employeeId in active_ids]
            if before != len(reviews):
                logger.info(
                    "activeEmployeesOnly filtered reviews %d -> %d", before, len(reviews)
                )

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
                    # Build filter expression for DynamoDB query (server-side filtering)
                    filter_conditions = []
                    
                    # Filter by isActive if needed
                    if not includeInactive:
                        filter_conditions.append(Attr("isActive").eq(True))
                    
                    # Filter by reviewType if provided
                    if reviewType:
                        filter_conditions.append(Attr("reviewType").eq(reviewType))
                    
                    # Filter by cycleYear if provided
                    if cycleYear:
                        filter_conditions.append(Attr("cycleYear").eq(cycleYear))
                    
                    # Build query parameters
                    query_params = {
                        "IndexName": "EmployeeIndex",
                        "KeyConditionExpression": Key("employeeId").eq(emp_id)
                    }
                    
                    # Add FilterExpression if we have any filters
                    if filter_conditions:
                        if len(filter_conditions) == 1:
                            query_params["FilterExpression"] = filter_conditions[0]
                        else:
                            # Combine multiple conditions with AND
                            query_params["FilterExpression"] = And(*filter_conditions)
                    
                    # Query by employeeId using EmployeeIndex GSI with server-side filtering
                    response = await table.query(**query_params)
                    items = response.get("Items", [])
                    
                    # Map reviews (no client-side filtering needed, DynamoDB did it)
                    for item in items:
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
    parsed_item_check = parse_dynamodb_item(item, _review_logical_name(current_is_draft))
    existing_review_type = parsed_item_check.get('reviewType')
    logger.info(f"Updating review: reviewId={review_id}, reviewType={existing_review_type}, employeeId={parsed_item_check.get('employeeId')}, isDraft={current_is_draft}")
    
    update_payload = review_update.dict(exclude_unset=True)
    metadata_update = update_payload.get("metadata")
    # Keep top-level status in sync with metadata.status if provided
    if "status" not in update_payload:
        if isinstance(metadata_update, dict) and "status" in metadata_update:
            update_payload["status"] = metadata_update.get("status")
    parsed_item = parse_dynamodb_item(item, _review_logical_name(current_is_draft))
    
    # CRITICAL SAFETY CHECK: Prevent changing reviewType
    # If update payload tries to change reviewType, reject it
    new_review_type = update_payload.get("reviewType")
    if new_review_type and new_review_type != existing_review_type:
        logger.error(f"❌ CRITICAL: Attempted to change reviewType from {existing_review_type} to {new_review_type} for reviewId {review_id}. This is not allowed!")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change reviewType from {existing_review_type} to {new_review_type}. Each review must maintain its original type."
        )
    
    # ------------------------------------------------------------------
    # Reviewer of record (manager reviews)
    #
    # Once a manager review has been submitted, the manager who submitted it is
    # frozen. Later writes — HR sign-off, clarification round-trips, a different
    # manager reopening it, or the employee's line manager changing — never
    # rewrite reviewerId or metadata.reviewerSnapshot. Every submit event is
    # appended to metadata.reviewerHistory for the audit trail.
    # ------------------------------------------------------------------
    if existing_review_type == "manager":
        existing_metadata = parsed_item.get("metadata") or {}
        existing_snapshot = existing_metadata.get("reviewerSnapshot")
        already_submitted = bool(parsed_item.get("submittedAt"))
        incoming_metadata = update_payload.get("metadata")
        frozen_reviewer_id = parsed_item.get("reviewerId")

        _im_status = incoming_metadata.get("status") if isinstance(incoming_metadata, dict) else None
        incoming_status = update_payload.get("status") or _im_status
        is_manager_submit_event = incoming_status in ("manager_submitted", "manager_resubmitted")

        # Freeze reviewer identity once there is a submission or a snapshot.
        if already_submitted or existing_snapshot:
            if (
                "reviewerId" in update_payload
                and update_payload["reviewerId"] != frozen_reviewer_id
            ):
                logger.info(
                    "update_review %s: keeping original reviewerId %s (ignoring %s)",
                    review_id, frozen_reviewer_id, update_payload["reviewerId"],
                )
                update_payload["reviewerId"] = frozen_reviewer_id
            if isinstance(incoming_metadata, dict) and existing_snapshot:
                incoming_metadata["reviewerSnapshot"] = existing_snapshot

        # Record the reviewer of record + an audit entry, only on an actual
        # manager (re)submission — not on HR sign-off or clarification writes.
        if is_manager_submit_event and update_payload.get("submittedAt") is not None:
            base_meta = incoming_metadata if isinstance(incoming_metadata, dict) else dict(existing_metadata)
            if not base_meta.get("reviewerSnapshot"):
                base_meta["reviewerSnapshot"] = {
                    "reviewerId": update_payload.get("reviewerId") or frozen_reviewer_id,
                    "reviewerName": base_meta.get("reviewerName"),
                    "capturedAt": update_payload.get("submittedAt"),
                    "source": "submit",
                }
            history = list(existing_metadata.get("reviewerHistory") or [])
            history.append({
                "reviewerId": update_payload.get("reviewerId") or frozen_reviewer_id,
                "at": update_payload.get("submittedAt") or datetime.utcnow().isoformat(),
                "action": "resubmitted" if already_submitted else "submitted",
            })
            base_meta["reviewerHistory"] = history
            update_payload["metadata"] = base_meta

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

    # Only re-validate employee/goal existence when the goal set is actually
    # changing or the review is moving between draft and submitted. A pure
    # status/metadata update (e.g. HR sign-off) must not fail just because the
    # employee has since left the org or a goal was cleaned up.
    goals_changed = (
        goal_ids_for_validation is not None
        and set(goal_ids_for_validation) != set(parsed_item.get("goalIds", []))
    )
    if goals_changed or moving_to_submitted or moving_to_draft:
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
            parsed_item = parse_dynamodb_item(item, _review_logical_name(current_is_draft))
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
                    existing_item = parse_dynamodb_item(existing_check["Item"], "reviewDraft")
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
            await target_table.put_item(Item=format_dynamodb_item(parsed_item, "reviewDraft"))
            
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
            formatted_item = format_dynamodb_item(parsed_item, "reviewDraft")
            return _map_review(formatted_item, is_draft=True)
        
        # Normal case: Moving from draft to submitted (submitting a draft)
        # Update in current table first if there are other updates
        if len(update_payload) > 1:  # More than just updatedAt
            try:
                update_expression, attr_names, attr_values = _build_update_expression(
                    update_payload, _review_logical_name(current_is_draft)
                )
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
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update review",
                ) from exc
        else:
            # Only submittedAt is changing, just copy the item
            parsed_item.update(update_payload)
        
        # Copy item to target table
        parsed_item = parse_dynamodb_item(item, _review_logical_name(current_is_draft))
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
            existing_review_id = parse_dynamodb_item(existing_target_item, "review").get("reviewId")
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
        
        await target_table.put_item(Item=format_dynamodb_item(parsed_item, _review_logical_name(target_is_draft)))
        
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
        formatted_item = format_dynamodb_item(parsed_item, _review_logical_name(target_is_draft))
        return _map_review(formatted_item, is_draft=target_is_draft)
    else:
        # Normal update - no table change needed
        table = await get_review_table_by_draft_status(current_is_draft)
        try:
            update_expression, attr_names, attr_values = _build_update_expression(
                update_payload, _review_logical_name(current_is_draft)
            )
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
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

