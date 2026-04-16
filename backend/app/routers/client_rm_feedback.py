from datetime import datetime
from typing import Any, Dict, List, Optional

from boto3.dynamodb.conditions import Attr
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..database_dynamodb import (
    format_dynamodb_item,
    generate_id,
    get_client_rm_feedback_table,
    get_leadership_access_table,
    get_employees_table,
    parse_dynamodb_item,
)
from ..models.client_rm_feedback import (
    ClientRMFeedbackMeContext,
    ClientRMFeedbackNotificationSummary,
    ClientRMFeedbackPeriodCreate,
    ClientRMFeedbackPeriodUpdate,
    ClientRMFeedbackSubmissionCreate,
    ClientRMFeedbackSubmissionUpdate,
)
from ..security import get_current_active_user, require_admin_user

router = APIRouter(prefix="/api/client-rm-feedback", tags=["client-rm-feedback"])


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _is_admin(current_user: Dict[str, Any]) -> bool:
    return bool(current_user.get("is_admin"))


async def _list_leadership_emails() -> List[str]:
    """List leadership access emails stored in the Leadership Access table."""
    table = await get_leadership_access_table()
    response = await table.scan()
    items = [parse_dynamodb_item(i) for i in response.get("Items", [])]
    emails = sorted({_normalize_email(i.get("email")) for i in items if _normalize_email(i.get("email"))})
    return emails


async def _is_leadership_email(email: str) -> bool:
    """Leadership is restricted by the Leadership Access table."""
    normalized = _normalize_email(email)
    if not normalized:
        return False
    table = await get_leadership_access_table()
    response = await table.query(
        IndexName="EmailIndex",
        KeyConditionExpression="email = :email",
        ExpressionAttributeValues={":email": normalized},
        Limit=1,
    )
    return bool(response.get("Items"))


async def _can_view_all_async(current_user: Dict[str, Any]) -> bool:
    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    if _is_admin(current_user):
        return True
    # HR access is treated as Admin only (per requirement).
    if await _is_leadership_email(user_email):
        return True
    return False


async def _get_employee_by_email(email: str) -> Optional[Dict[str, Any]]:
    table = await get_employees_table()
    response = await table.query(
        IndexName="EmailIndex",
        KeyConditionExpression="email = :email",
        ExpressionAttributeValues={":email": _normalize_email(email)},
        Limit=1,
    )
    items = response.get("Items", [])
    if not items:
        return None
    return parse_dynamodb_item(items[0], "employees")


async def _get_direct_reports(manager_employee_id: str) -> List[Dict[str, Any]]:
    if not manager_employee_id:
        return []
    table = await get_employees_table()
    try:
        response = await table.query(
            IndexName="ReportingToIndex",
            KeyConditionExpression="reporting_to = :manager_id",
            ExpressionAttributeValues={":manager_id": manager_employee_id},
        )
        raw = response.get("Items", [])
    except Exception:
        response = await table.scan(
            FilterExpression=Attr("reporting_to").eq(manager_employee_id)
        )
        raw = response.get("Items", [])
    reportees: List[Dict[str, Any]] = []
    for item in raw:
        parsed = parse_dynamodb_item(item, "employees")
        if parsed.get("status", "active") == "inactive":
            continue
        reportees.append(
            {
                "id": parsed.get("id"),
                "employee_id": parsed.get("employee_id"),
                "name": parsed.get("name"),
                "email": parsed.get("email"),
                "position": parsed.get("position"),
            }
        )
    return reportees


def _validate_ratings(ratings: Dict[str, int]) -> None:
    for key, value in ratings.items():
        if not isinstance(value, int) or value < 1 or value > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid rating for {key}. Expected integer 1-5.",
            )


@router.get("/me-context", response_model=ClientRMFeedbackMeContext)
async def get_me_context(current_user: dict = Depends(get_current_active_user)):
    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    if not user_email:
        return ClientRMFeedbackMeContext(
            can_view_all=await _can_view_all_async(current_user),
            is_admin=_is_admin(current_user),
            is_leadership=False,
        )
    employee = await _get_employee_by_email(user_email)
    if not employee:
        return ClientRMFeedbackMeContext(
            can_view_all=await _can_view_all_async(current_user),
            is_admin=_is_admin(current_user),
            is_leadership=await _is_leadership_email(user_email),
        )
    reportees = await _get_direct_reports(employee.get("id"))
    return ClientRMFeedbackMeContext(
        employee_id=employee.get("id"),
        employee_name=employee.get("name"),
        has_team_members=len(reportees) > 0,
        team_count=len(reportees),
        can_view_all=await _can_view_all_async(current_user),
        is_admin=_is_admin(current_user),
        is_leadership=await _is_leadership_email(user_email),
        reportees=reportees,
    )


@router.get("/access/leadership")
async def list_leadership_access(_: dict = Depends(require_admin_user)):
    """Admin UI: list leadership emails allowed to view this module."""
    emails = await _list_leadership_emails()
    return {"emails": emails, "count": len(emails)}


@router.post("/access/leadership", status_code=201)
async def add_leadership_access(
    email: str = Query(..., min_length=3),
    current_user: dict = Depends(require_admin_user),
):
    """Admin UI: add a leadership email to the allowlist."""
    normalized = _normalize_email(email)
    if "@" not in normalized or "." not in normalized.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    existing = set(await _list_leadership_emails())
    if normalized in existing:
        return {"ok": True, "email": normalized, "already_exists": True}
    table = await get_leadership_access_table()
    now = _now_iso()
    item = {
        "id": generate_id(),
        "email": normalized,
        "created_at": now,
        "updated_at": now,
        "created_by_email": _normalize_email(current_user.get("email") or current_user.get("username")),
        "is_active": True,
    }
    await table.put_item(Item=format_dynamodb_item(item))
    return {"ok": True, "email": normalized}


@router.delete("/access/leadership")
async def remove_leadership_access(
    email: str = Query(..., min_length=3),
    _: dict = Depends(require_admin_user),
):
    """Admin UI: remove a leadership email from the allowlist."""
    normalized = _normalize_email(email)
    table = await get_leadership_access_table()
    response = await table.query(
        IndexName="EmailIndex",
        KeyConditionExpression="email = :email",
        ExpressionAttributeValues={":email": normalized},
    )
    for it in response.get("Items", []):
        parsed = parse_dynamodb_item(it)
        if parsed.get("id"):
            await table.delete_item(Key={"id": parsed["id"]})
    return {"ok": True, "email": normalized}


@router.post("/periods", status_code=201)
async def create_period(
    payload: ClientRMFeedbackPeriodCreate,
    current_user: dict = Depends(require_admin_user),
):
    table = await get_client_rm_feedback_table()
    now = _now_iso()
    item = {
        "id": generate_id(),
        "entity_type": "period",
        "period_id": generate_id(),
        "label": payload.label,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "period_status": payload.status,
        "created_at": now,
        "updated_at": now,
        "created_by_email": _normalize_email(current_user.get("email") or current_user.get("username")),
    }
    await table.put_item(Item=format_dynamodb_item(item))
    return item


@router.get("/periods")
async def list_periods(current_user: dict = Depends(get_current_active_user)):
    table = await get_client_rm_feedback_table()
    response = await table.scan(
        FilterExpression=Attr("entity_type").eq("period")
    )
    items = [parse_dynamodb_item(i) for i in response.get("Items", [])]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@router.put("/periods/{period_id}")
async def update_period(
    period_id: str,
    payload: ClientRMFeedbackPeriodUpdate,
    _: dict = Depends(require_admin_user),
):
    table = await get_client_rm_feedback_table()
    response = await table.scan(
        FilterExpression=Attr("entity_type").eq("period") & Attr("period_id").eq(period_id)
    )
    items = response.get("Items", [])
    if not items:
        raise HTTPException(status_code=404, detail="Period not found")
    existing = parse_dynamodb_item(items[0])
    updates = payload.model_dump(exclude_none=True)
    updates["updated_at"] = _now_iso()
    if "status" in updates:
        updates["period_status"] = updates.pop("status")
    if "start_date" in updates:
        updates["start_date"] = updates.pop("start_date")
    if "end_date" in updates:
        updates["end_date"] = updates.pop("end_date")
    existing.update(updates)
    await table.put_item(Item=format_dynamodb_item(existing))
    return existing


async def _is_direct_report(manager_employee_id: str, employee_id: str) -> bool:
    reportees = await _get_direct_reports(manager_employee_id)
    return any(r.get("id") == employee_id for r in reportees)


@router.post("/submissions", status_code=201)
async def create_submission(
    payload: ClientRMFeedbackSubmissionCreate,
    current_user: dict = Depends(get_current_active_user),
):
    _validate_ratings(payload.ratings)
    if payload.overall_satisfaction < 1 or payload.overall_satisfaction > 5:
        raise HTTPException(status_code=400, detail="overall_satisfaction must be 1-5")

    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    employee = await _get_employee_by_email(user_email)
    if not employee:
        raise HTTPException(status_code=403, detail="Employee profile not found for current user")

    manager_employee_id = employee.get("id")
    if not await _is_direct_report(manager_employee_id, payload.employee_id):
        raise HTTPException(status_code=403, detail="You can submit feedback only for your direct reportees")

    table = await get_client_rm_feedback_table()
    periods = await table.scan(
        FilterExpression=Attr("entity_type").eq("period") & Attr("period_id").eq(payload.period_id)
    )
    p_items = [parse_dynamodb_item(i) for i in periods.get("Items", [])]
    if not p_items:
        raise HTTPException(status_code=400, detail="Invalid feedback period")
    if p_items[0].get("period_status") != "open":
        raise HTTPException(status_code=400, detail="Feedback period is not open")

    now = _now_iso()
    submission_id = generate_id()
    item = {
        "id": submission_id,
        "entity_type": "submission",
        "submission_id": submission_id,
        "period_id": payload.period_id,
        "employee_id": payload.employee_id,
        "employee_name": payload.employee_name,
        "employee_code": payload.employee_code,
        "manager_employee_id": manager_employee_id,
        "manager_email": user_email,
        "manager_name": employee.get("name"),
        "billing_status": payload.billing_status,
        "client_name": payload.client_name,
        "project_name": payload.project_name,
        "client_reporting_manager_name": payload.client_reporting_manager_name,
        "info_services_reporting_manager_name": payload.info_services_reporting_manager_name,
        "ratings": payload.ratings,
        "additional_feedback": payload.additional_feedback,
        "overall_satisfaction": payload.overall_satisfaction,
        "started_at": payload.started_at or now,
        "submitted_at": now,
        "updated_at": now,
        "is_submitted": True,
        "is_active": True,
        "reportee_seen": False,
    }
    await table.put_item(Item=format_dynamodb_item(item))
    return item


@router.put("/submissions/{submission_id}")
async def update_submission(
    submission_id: str,
    payload: ClientRMFeedbackSubmissionUpdate,
    current_user: dict = Depends(get_current_active_user),
):
    table = await get_client_rm_feedback_table()
    response = await table.get_item(Key={"id": submission_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Submission not found")
    item = parse_dynamodb_item(response["Item"])
    if item.get("entity_type") != "submission":
        raise HTTPException(status_code=400, detail="Invalid submission item")

    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    if not await _can_view_all_async(current_user) and user_email != _normalize_email(item.get("manager_email")):
        raise HTTPException(status_code=403, detail="Only the submitting manager can edit")

    updates = payload.model_dump(exclude_none=True)
    if "ratings" in updates:
        _validate_ratings(updates["ratings"])
    if "overall_satisfaction" in updates:
        val = updates["overall_satisfaction"]
        if val < 1 or val > 5:
            raise HTTPException(status_code=400, detail="overall_satisfaction must be 1-5")

    context_fields = [
        "billing_status",
        "client_name",
        "project_name",
        "client_reporting_manager_name",
        "info_services_reporting_manager_name",
    ]
    changed = any(item.get(f) != updates.get(f) for f in context_fields if f in updates)

    item.update(updates)
    item["updated_at"] = _now_iso()
    await table.put_item(Item=format_dynamodb_item(item))

    if changed:
        snapshot = {
            "id": generate_id(),
            "entity_type": "snapshot",
            "submission_id": submission_id,
            "changed_at": _now_iso(),
            "changed_by_email": user_email,
            "before": {k: response["Item"].get(k) for k in context_fields},
            "after": {k: item.get(k) for k in context_fields},
        }
        await table.put_item(Item=format_dynamodb_item(snapshot))

    return item


@router.get("/submissions")
async def list_submissions(
    period_id: Optional[str] = Query(default=None),
    employee_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_active_user),
):
    table = await get_client_rm_feedback_table()
    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    requester = await _get_employee_by_email(user_email) if user_email else None
    requester_employee_id = requester.get("id") if requester else None

    can_view_all = await _can_view_all_async(current_user)
    reportee_ids = set()
    if requester_employee_id:
        reportees = await _get_direct_reports(requester_employee_id)
        reportee_ids = {r.get("id") for r in reportees}

    response = await table.scan(
        FilterExpression=Attr("entity_type").eq("submission")
    )
    all_items = [parse_dynamodb_item(i) for i in response.get("Items", [])]
    filtered: List[Dict[str, Any]] = []
    for item in all_items:
        if period_id and item.get("period_id") != period_id:
            continue
        if employee_id and item.get("employee_id") != employee_id:
            continue

        if can_view_all:
            filtered.append(item)
            continue

        if requester_employee_id and item.get("employee_id") == requester_employee_id:
            filtered.append(item)
            continue

        if item.get("manager_email") == user_email:
            filtered.append(item)
            continue

        if item.get("employee_id") in reportee_ids:
            filtered.append(item)
            continue

    filtered.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return filtered


@router.post("/submissions/{submission_id}/mark-seen")
async def mark_submission_seen(
    submission_id: str,
    current_user: dict = Depends(get_current_active_user),
):
    table = await get_client_rm_feedback_table()
    response = await table.get_item(Key={"id": submission_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Submission not found")
    item = parse_dynamodb_item(response["Item"])
    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    requester = await _get_employee_by_email(user_email) if user_email else None
    requester_employee_id = requester.get("id") if requester else None
    if item.get("employee_id") != requester_employee_id and not await _can_view_all_async(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    item["reportee_seen"] = True
    item["updated_at"] = _now_iso()
    await table.put_item(Item=format_dynamodb_item(item))
    return {"ok": True}


@router.get("/notifications/summary", response_model=ClientRMFeedbackNotificationSummary)
async def get_notification_summary(current_user: dict = Depends(get_current_active_user)):
    user_email = _normalize_email(current_user.get("email") or current_user.get("username"))
    requester = await _get_employee_by_email(user_email) if user_email else None
    requester_employee_id = requester.get("id") if requester else None
    can_view_all = await _can_view_all_async(current_user)
    table = await get_client_rm_feedback_table()
    all_items = await table.scan(FilterExpression=Attr("entity_type").eq("submission"))
    submissions = [parse_dynamodb_item(i) for i in all_items.get("Items", [])]
    periods = await table.scan(FilterExpression=Attr("entity_type").eq("period"))
    period_items = [parse_dynamodb_item(p) for p in periods.get("Items", [])]
    open_period_ids = {p.get("period_id") for p in period_items if p.get("period_status") == "open"}
    open_period_count = sum(1 for p in period_items if p.get("period_status") == "open")

    manager_pending_count = 0
    reportee_unread_count = 0
    hr_new_count = 0
    leadership_new_count = 0

    if requester_employee_id:
        reportees = await _get_direct_reports(requester_employee_id)
        reportee_ids = {r.get("id") for r in reportees}
        submitted_in_open = {
            s.get("employee_id")
            for s in submissions
            if s.get("period_id") in open_period_ids and s.get("manager_employee_id") == requester_employee_id
        }
        manager_pending_count = max(0, len(reportee_ids - submitted_in_open))
        reportee_unread_count = sum(
            1
            for s in submissions
            if s.get("employee_id") == requester_employee_id and not s.get("reportee_seen")
        )

    if can_view_all:
        new_count = sum(1 for s in submissions if s.get("period_id") in open_period_ids)
        hr_new_count = new_count
        if await _is_leadership_email(user_email):
            leadership_new_count = new_count

    return ClientRMFeedbackNotificationSummary(
        manager_pending_count=manager_pending_count,
        reportee_unread_count=reportee_unread_count,
        hr_new_count=hr_new_count,
        leadership_new_count=leadership_new_count,
        open_period_count=open_period_count,
    )
