from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Any, Dict, List, Optional
import datetime
import time

from ..database_dynamodb import get_employees_table, parse_dynamodb_item
from ..security import get_current_active_user

router = APIRouter(
    prefix="/api/employees-dashboard",
    tags=["employees-dashboard"],
    responses={404: {"description": "Not found"}},
)

_CACHE_TTL = 300  # 5 minutes
_dashboard_cache: Dict[str, Any] = {
    "data": None,
    "timestamp": 0.0,
}


def invalidate_dashboard_cache() -> None:
    _dashboard_cache["data"] = None
    _dashboard_cache["timestamp"] = 0.0


_EMPTY_DASHBOARD = {
    "total_employees": 0,
    "monthly_headcount": [],
    "by_account": {},
    "by_location": {},
    "by_employee_status": {},
    "by_employment_category": {},
    "by_is_leader": {},
    "by_expertise": {},
    "by_department": {},
    "by_gender": {},
    "employees": [],
    "by_usage_location": {},
    "usage_location_coverage": {"with_field": 0, "total_active": 0},
}

# Only these fields are needed for dashboard analytics + drill-down.
# Stripping everything else cuts payload size by ~80%.
_DASHBOARD_FIELDS = frozenset({
    "id", "employee_id", "name", "email", "position", "department",
    "account", "location", "usage_location", "gender", "status",
    "employee_status", "employment_category", "is_leader", "expertise",
    "date_of_joining", "created_at", "photo_url",
})


def _slim_employee(emp: dict) -> dict:
    """Return only dashboard-relevant fields from an employee dict."""
    return {k: v for k, v in emp.items() if k in _DASHBOARD_FIELDS}


def _get_shared_employee_cache() -> Optional[List[Dict[str, Any]]]:
    """Try to reuse the employee list cache from the employees router."""
    try:
        from .employees import _employee_list_cache, _CACHE_TTL as emp_ttl
        cached = _employee_list_cache["data"]
        if cached is not None and (time.time() - _employee_list_cache["ts"]) < emp_ttl:
            return cached
    except Exception:
        pass
    return None


def _warm_shared_employee_cache(employees: List[Dict[str, Any]]) -> None:
    """Push parsed employees into the shared employee list cache."""
    try:
        from .employees import _employee_list_cache
        if _employee_list_cache["data"] is None:
            _employee_list_cache["data"] = employees
            _employee_list_cache["ts"] = time.time()
    except Exception:
        pass


@router.get("/")
async def get_employees_dashboard(
    nocache: bool = Query(False, description="Skip server cache (use after Azure sync)"),
    employee_limit: int = Query(
        0, ge=-1,
        description="Cap the employees array size (0 = all, -1 = none). "
                    "Aggregates always use the full dataset.",
    ),
    current_user: dict = Depends(get_current_active_user),
):
    """Pre-aggregated employee analytics — cached server-side for 5 min.

    KMS decryption is skipped **only** for this analytics listing because the
    dashboard charts/cards use non-encrypted fields (name, department, location,
    etc.).  When a user opens or edits an individual employee, the detail
    endpoints (GET/PUT ``/api/employees/{id}``) run **full KMS decryption** so
    all personal fields (phone, bio, emergency contacts, etc.) are available.
    """
    try:
        current_time = time.time()
        cached = _dashboard_cache["data"]
        if (
            not nocache
            and cached is not None
            and current_time - _dashboard_cache["timestamp"] < _CACHE_TTL
        ):
            return _apply_employee_limit(cached, employee_limit)

        # --- 1. Get parsed employees (reuse shared cache if warm) ---
        employees = _get_shared_employee_cache()
        if employees is None:
            table = await get_employees_table()
            all_items: list = []
            last_evaluated_key = None
            while True:
                scan_kwargs = {}
                if last_evaluated_key:
                    scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
                response = await table.scan(**scan_kwargs)
                all_items.extend(response.get("Items", []))
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break

            if not all_items:
                return _EMPTY_DASHBOARD

            employees = [parse_dynamodb_item(item) for item in all_items]
            _warm_shared_employee_cache(employees)

        # --- 2. Single-pass aggregation ---
        by_account: Dict[str, int] = {}
        by_location: Dict[str, int] = {}
        by_employee_status: Dict[str, int] = {}
        by_employment_category: Dict[str, int] = {}
        by_is_leader: Dict[str, int] = {}
        by_expertise: Dict[str, int] = {}
        by_department: Dict[str, int] = {}
        by_gender: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        by_usage_location: Dict[str, int] = {}

        current_year = datetime.datetime.now().year
        month_ends = []
        for m in range(1, 13):
            end = datetime.datetime(current_year, m + 1, 1) if m < 12 else datetime.datetime(current_year + 1, 1, 1)
            month_ends.append(end)
        monthly_counts = [0] * 12

        active_employees: List[dict] = []
        with_usage = 0

        for emp in employees:
            emp_status = emp.get("status", "active")
            if emp_status == "inactive":
                continue

            active_employees.append(_slim_employee(emp))

            # Distributions
            acct = emp.get("account", "Unknown")
            by_account[acct] = by_account.get(acct, 0) + 1

            loc_raw = emp.get("location", "Unknown")
            loc_norm = loc_raw.lower().strip()
            loc_key = "Remote" if (loc_norm.startswith("remote -") or loc_norm == "remote") else loc_raw
            by_location[loc_key] = by_location.get(loc_key, 0) + 1

            es = emp.get("employee_status", "Unknown")
            by_employee_status[es] = by_employee_status.get(es, 0) + 1

            cat = emp.get("employment_category", "Unknown")
            by_employment_category[cat] = by_employment_category.get(cat, 0) + 1

            leader = emp.get("is_leader", "No")
            by_is_leader[leader] = by_is_leader.get(leader, 0) + 1

            exp = emp.get("expertise", "Unknown")
            by_expertise[exp] = by_expertise.get(exp, 0) + 1

            dept = emp.get("department", "Unknown")
            by_department[dept] = by_department.get(dept, 0) + 1

            gen = emp.get("gender", "Unknown")
            by_gender[gen] = by_gender.get(gen, 0) + 1

            by_status[emp_status] = by_status.get(emp_status, 0) + 1

            ul = (emp.get("usage_location") or "").strip().upper()
            ul_key = ul if ul else "not_set"
            by_usage_location[ul_key] = by_usage_location.get(ul_key, 0) + 1
            if ul:
                with_usage += 1

            # Monthly headcount (parse join date once, check all 12 months)
            jd_str = emp.get("date_of_joining") or emp.get("created_at")
            if jd_str:
                try:
                    jd = datetime.datetime.fromisoformat(jd_str.replace("Z", "+00:00"))
                    for mi in range(12):
                        if jd <= month_ends[mi]:
                            monthly_counts[mi] += 1
                except Exception:
                    for mi in range(12):
                        monthly_counts[mi] += 1

        monthly_headcount = []
        for m in range(1, 13):
            monthly_headcount.append({
                "month": datetime.datetime(current_year, m, 1).strftime("%b"),
                "count": monthly_counts[m - 1],
                "month_number": m,
            })

        full_result = {
            "total_employees": len(active_employees),
            "monthly_headcount": monthly_headcount,
            "by_account": by_account,
            "by_location": by_location,
            "by_employee_status": by_employee_status,
            "by_employment_category": by_employment_category,
            "by_is_leader": by_is_leader,
            "by_expertise": by_expertise,
            "by_department": by_department,
            "by_gender": by_gender,
            "by_status": by_status,
            "by_usage_location": by_usage_location,
            "employees": active_employees,
            "usage_location_coverage": {
                "with_field": with_usage,
                "total_active": len(active_employees),
            },
        }

        _dashboard_cache["data"] = full_result
        _dashboard_cache["timestamp"] = current_time

        return _apply_employee_limit(full_result, employee_limit)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get dashboard data: {str(e)}",
        )


def _apply_employee_limit(result: dict, limit: int) -> dict:
    """Truncate or remove the employees array based on the requested limit."""
    emps = result.get("employees", [])
    if limit < 0:
        return {**result, "employees": [], "employees_truncated": True}
    if limit and len(emps) > limit:
        return {**result, "employees": emps[:limit], "employees_truncated": True}
    return result
