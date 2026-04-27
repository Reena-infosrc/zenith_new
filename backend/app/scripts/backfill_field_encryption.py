"""
Backfill DynamoDB field-level encryption for existing plaintext rows.

Uses the same parse → format path as the API (format_dynamodb_item / parse_dynamodb_item +
field_crypto: AES-256-GCM + KMS envelope per field). Safe to re-run: already-encrypted rows are
decrypted in memory then written back with ciphertext.

Run from the backend directory (see docstring at bottom for prerequisites).

Examples:
  cd backend
  python -m app.scripts.backfill_field_encryption --all-tables --dry-run
  python -m app.scripts.backfill_field_encryption --all-tables --sleep 0.05
  python -m app.scripts.backfill_field_encryption --logical-table reviewDraft --dry-run
  # Trial: only 10 rows per table, then run without --limit for the rest
  python -m app.scripts.backfill_field_encryption --logical-table reviewDraft --limit 10
  python -m app.scripts.backfill_field_encryption --logical-table employees goals review reviewDraft clientRmFeedback
  # One person: encrypt employees row by email substring, then goals/reviews by employee id
  python -m app.scripts.backfill_field_encryption --logical-table employees --email-contains mayoori
  python -m app.scripts.backfill_field_encryption --logical-table goals review reviewDraft --employee-id <uuid>
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any, Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import boto3
from dotenv import load_dotenv


def _load_env(env_file: str | None) -> None:
    path = env_file or os.path.join(_BACKEND_DIR, ".env.staging")
    if os.path.isfile(path):
        load_dotenv(dotenv_path=path, override=True)
        print(f"Loaded env file: {path}")
    else:
        print(f"Warning: env file not found at {path}; using process environment only.")


LOGICAL_KEY_ATTRS: Dict[str, List[str]] = {
    "employees": ["id"],
    "goals": ["id"],
    "review": ["pk", "sk"],
    "reviewDraft": ["pk", "sk"],
    "clientRmFeedback": ["id"],
}

LOGICAL_TO_ENV_TABLE: Dict[str, str] = {
    "employees": "DYNAMODB_TABLE_EMPLOYEES",
    "goals": "DYNAMODB_TABLE_GOALS",
    "review": "DYNAMODB_TABLE_REVIEW",
    "reviewDraft": "DYNAMODB_TABLE_REVIEW_DRAFT",
    "clientRmFeedback": "DYNAMODB_TABLE_CLIENT_RM_FEEDBACK",
}


def _table_name(logical: str) -> str:
    env_key = LOGICAL_TO_ENV_TABLE[logical]
    name = (os.getenv(env_key) or "").strip()
    if not name:
        print(f"ERROR: {env_key} is not set.", file=sys.stderr)
        sys.exit(1)
    return name


def _row_matches_filter(
    raw: Dict[str, Any],
    logical: str,
    *,
    employee_id: Optional[str],
    email_contains: Optional[str],
) -> bool:
    """If no filter args, match all rows."""
    if employee_id:
        if logical == "employees":
            return raw.get("id") == employee_id
        if logical == "goals":
            return raw.get("employeeId") == employee_id
        if logical in ("review", "reviewDraft"):
            return raw.get("employeeId") == employee_id
        if logical == "clientRmFeedback":
            # Client RM feedback items use an 'employee_id' attribute (not employeeId).
            return raw.get("employee_id") == employee_id
    if email_contains and logical == "employees":
        em = (raw.get("email") or "").lower()
        return email_contains.lower() in em
    if employee_id or email_contains:
        return False
    return True


def _log_progress(count: int, *, verbose: bool, every: int = 3) -> None:
    """Print so the process does not look hung (KMS + DynamoDB can take seconds per item)."""
    if verbose or count == 1 or count % every == 0:
        print(f"  ... items processed: {count}", flush=True)


def backfill_table(
    dynamodb,
    logical: str,
    *,
    dry_run: bool,
    sleep_s: float,
    verbose: bool,
    limit: Optional[int],
    employee_id: Optional[str],
    email_contains: Optional[str],
) -> tuple[int, int]:
    from app.database_dynamodb import format_dynamodb_item, parse_dynamodb_item

    table_name = _table_name(logical)
    table = dynamodb.Table(table_name)
    processed = 0
    skipped = 0

    if employee_id:
        print(f"  Filter: employee id = {employee_id}", flush=True)
    if email_contains and logical == "employees":
        print(f"  Filter: email contains (case-insensitive) = {email_contains!r}", flush=True)

    if limit is not None:
        print(
            f"Table: {table_name} — TRIAL: max {limit} item(s), then stop. "
            f"First scan page may take a few seconds; each row uses KMS for allowlisted fields.",
            flush=True,
        )
    else:
        print(
            f"Table: {table_name} — full run. "
            f"First scan page may take a few seconds; each row uses KMS for allowlisted fields.",
            flush=True,
        )

    scan_kwargs: Dict[str, Any] = {}
    page = 0
    stop_early = False
    while True:
        page += 1
        resp = table.scan(**scan_kwargs)
        items = resp.get("Items", [])
        print(f"  Scan page {page}: {len(items)} item(s) in this page", flush=True)

        for raw in items:
            if not _row_matches_filter(
                raw, logical, employee_id=employee_id, email_contains=email_contains
            ):
                skipped += 1
                continue

            parsed = parse_dynamodb_item(raw, logical)
            new_item = format_dynamodb_item(parsed, logical)

            if dry_run:
                processed += 1
                _log_progress(processed, verbose=verbose)
            else:
                table.put_item(Item=new_item)
                processed += 1
                _log_progress(processed, verbose=verbose)
                if sleep_s > 0:
                    time.sleep(sleep_s)

            if limit is not None and processed >= limit:
                stop_early = True
                print(
                    f"  Reached --limit {limit}; stopping this table (trial run).",
                    flush=True,
                )
                break

        if stop_early:
            break

        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        scan_kwargs["ExclusiveStartKey"] = last

    if skipped:
        print(f"  Rows skipped (did not match filter): {skipped}", flush=True)
    return processed, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill field-level encryption (AES-256-GCM + KMS) for existing DynamoDB items."
    )
    parser.add_argument(
        "--all-tables",
        action="store_true",
        help="Backfill every logical table that supports field encryption (employees, goals, review, reviewDraft, clientRmFeedback).",
    )
    parser.add_argument(
        "--logical-table",
        nargs="+",
        default=None,
        choices=list(LOGICAL_KEY_ATTRS.keys()),
        help="One or more logical table names (omit if using --all-tables).",
    )
    parser.add_argument(
        "--env-file",
        default=None,
        help=f"Dotenv file (default: {_BACKEND_DIR + os.sep}.env.staging)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse/format each row but do not write to DynamoDB.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between writes (throttling). Ignored with --dry-run.",
    )
    parser.add_argument(
        "--region",
        default=None,
        help="AWS region (default: AWS_REGION env or us-east-1).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log every item processed (default: every 5 items).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N items per logical table (trial run), then exit. Omit for full table.",
    )
    parser.add_argument(
        "--employee-id",
        default=None,
        metavar="UUID",
        help="Only rows for this employee: employees.id, goals/review/reviewDraft.employeeId, clientRmFeedback.employee_id.",
    )
    parser.add_argument(
        "--email-contains",
        default=None,
        metavar="TEXT",
        help="Only for --logical-table employees: process rows whose email contains this text (case-insensitive).",
    )
    args = parser.parse_args()

    if args.all_tables and args.logical_table:
        print("ERROR: use either --all-tables or --logical-table, not both.", file=sys.stderr)
        sys.exit(1)
    if not args.all_tables and not args.logical_table:
        print("ERROR: pass --all-tables or --logical-table <names...>.", file=sys.stderr)
        sys.exit(1)

    logical_tables: List[str] = (
        list(LOGICAL_KEY_ATTRS.keys()) if args.all_tables else list(args.logical_table or [])
    )

    if args.limit is not None and args.limit < 1:
        print("ERROR: --limit must be >= 1", file=sys.stderr)
        sys.exit(1)

    if args.email_contains and "employees" not in logical_tables:
        print(
            "ERROR: --email-contains only applies when --logical-table includes employees "
            "(use --employee-id for goals/review/reviewDraft).",
            file=sys.stderr,
        )
        sys.exit(1)

    if (
        args.email_contains
        and len(logical_tables) > 1
        and not args.employee_id
    ):
        print(
            "ERROR: With --email-contains, run --logical-table employees only first, "
            "note the employee id, then run goals/review/reviewDraft with --employee-id <id>. "
            "Or pass --employee-id together with multiple tables.",
            file=sys.stderr,
        )
        sys.exit(1)

    _load_env(args.env_file)

    region = args.region or os.getenv("AWS_REGION", "us-east-1")
    dynamodb = boto3.resource("dynamodb", region_name=region)

    from app.services.field_crypto import describe_status, is_field_encryption_active

    if not is_field_encryption_active():
        print(describe_status())
        print(
            "Fix: set DYNAMODB_FIELD_ENCRYPTION_ENABLED=true and a valid "
            "DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN (same CMK the API uses), then re-run.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Field encryption status:", describe_status())

    total = 0
    for logical in logical_tables:
        print(f"\n--- Backfilling logical table: {logical} ---")
        n, _skipped = backfill_table(
            dynamodb,
            logical,
            dry_run=args.dry_run,
            sleep_s=args.sleep,
            verbose=args.verbose,
            limit=args.limit,
            employee_id=args.employee_id,
            email_contains=args.email_contains if logical == "employees" else None,
        )
        print(f"Items processed: {n}" + (" (dry-run)" if args.dry_run else ""))
        total += n

    print(f"\nDone. Total items processed: {total}")


if __name__ == "__main__":
    main()
