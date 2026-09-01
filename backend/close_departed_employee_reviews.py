#!/usr/bin/env python3
"""
One-time reconciliation: close out performance reviews whose employee is no
longer in the directory (hard-deleted), so they stop counting as "pending" and
the cycle can actually reach 100%.

What it does
------------
Sets ONLY the top-level ``status`` field to ``employee_departed`` (plus
``updatedAt``). It never touches ``metadata`` / ``ratings`` / ``comments`` —
those are field-encrypted on the review tables, and a plaintext read/write here
would corrupt them. The frontend and ``_map_review`` both read the top-level
``status`` first, so this is enough for the row to drop out of every pending
count while the record stays intact for audit.

Rows already in a terminal state (hr_approved / hr_rejected / approved /
rejected / employee_departed / closed) are skipped.

Usage
-----
    python close_departed_employee_reviews.py                     # dry run
    python close_departed_employee_reviews.py --apply             # write
    python close_departed_employee_reviews.py --apply --include-inactive
    python close_departed_employee_reviews.py --cycle-year 2025   # limit scope

Requires the same env as the API (``.env`` / real environment):
``AWS_REGION``, ``DYNAMODB_TABLE_EMPLOYEES``, ``DYNAMODB_TABLE_REVIEW``,
``DYNAMODB_TABLE_REVIEW_DRAFT`` and valid AWS credentials.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import boto3
from dotenv import load_dotenv

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

TERMINAL_STATUSES = {
    "hr_approved",
    "hr_rejected",
    "approved",
    "rejected",
    "employee_departed",
    "closed",
}
NEW_STATUS = "employee_departed"


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        sys.exit(f"ERROR: environment variable {name} is not set. "
                 f"Run this with the same env as the API (e.g. source the prod .env).")
    return value


def _scan_all(table, **kwargs):
    items, start_key = [], None
    while True:
        if start_key:
            kwargs["ExclusiveStartKey"] = start_key
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            break
    return items


def _status_of(item) -> str:
    return (item.get("status") or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="write changes (default: dry run, prints only)")
    parser.add_argument("--include-inactive", action="store_true",
                        help="also close reviews for employees whose status is 'inactive' "
                             "(default: only employees missing from the table entirely)")
    parser.add_argument("--cycle-year", default=None,
                        help="restrict to a single cycleYear (e.g. 2025)")
    args = parser.parse_args()

    region = AWS_REGION
    t_employees = _require_env("DYNAMODB_TABLE_EMPLOYEES")
    t_review = _require_env("DYNAMODB_TABLE_REVIEW")
    t_review_draft = _require_env("DYNAMODB_TABLE_REVIEW_DRAFT")

    ddb = boto3.resource("dynamodb", region_name=region)

    # ---- 1. Directory: who currently exists / who is inactive -----------------
    emp_rows = _scan_all(
        ddb.Table(t_employees),
        ProjectionExpression="id, #s",
        ExpressionAttributeNames={"#s": "status"},
    )
    present_ids = {r["id"] for r in emp_rows if r.get("id")}
    inactive_ids = {
        r["id"] for r in emp_rows
        if r.get("id") and (r.get("status") or "active") == "inactive"
    }
    print(f"directory: {len(present_ids)} employees present, "
          f"{len(inactive_ids)} marked inactive")

    def is_departed(emp_id: str | None) -> bool:
        if not emp_id or emp_id not in present_ids:
            return True
        if args.include_inactive and emp_id in inactive_ids:
            return True
        return False

    # ---- 2. Walk both review tables -----------------------------------------
    now_iso = datetime.now(timezone.utc).isoformat()
    grand_total = 0

    for logical, table_name in (("review", t_review), ("reviewDraft", t_review_draft)):
        table = ddb.Table(table_name)
        rows = _scan_all(table)

        to_close = []
        for item in rows:
            if args.cycle_year and str(item.get("cycleYear")) != str(args.cycle_year):
                continue
            if not is_departed(item.get("employeeId")):
                continue
            if _status_of(item) in TERMINAL_STATUSES:
                continue
            to_close.append(item)

        print(f"\n[{logical}] scanned {len(rows)} rows, "
              f"{len(to_close)} belong to departed employees and are still open")

        for item in to_close:
            print(f"  {logical} pk={item.get('pk')} sk={item.get('sk')} "
                  f"employeeId={item.get('employeeId')} "
                  f"type={item.get('reviewType')} cycle={item.get('cycleYear')} "
                  f"status='{_status_of(item) or '(none)'}' -> {NEW_STATUS}")
            if args.apply:
                table.update_item(
                    Key={"pk": item["pk"], "sk": item["sk"]},
                    UpdateExpression="SET #s = :s, #u = :u",
                    ExpressionAttributeNames={"#s": "status", "#u": "updatedAt"},
                    ExpressionAttributeValues={":s": NEW_STATUS, ":u": now_iso},
                )

        grand_total += len(to_close)

    verb = "closed" if args.apply else "would be closed"
    print(f"\n{'APPLIED' if args.apply else 'DRY RUN'}: "
          f"{grand_total} review row(s) {verb} as '{NEW_STATUS}'.")
    if not args.apply and grand_total:
        print("Re-run with --apply to write the changes.")


if __name__ == "__main__":
    main()
