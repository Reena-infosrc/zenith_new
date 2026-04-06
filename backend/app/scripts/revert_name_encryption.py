"""
One-time script: revert fields that should no longer be encrypted back to plaintext.

For each table, any *_enc attribute listed in FIELDS_TO_REVERT is decrypted and written
back as the plain attribute name; the _enc attribute is removed. Uses UpdateItem so only
the affected attributes are touched.

Run from backend/:
  python -m app.scripts.revert_name_encryption --dry-run                     # preview all tables
  python -m app.scripts.revert_name_encryption --table employees --limit 5   # trial
  python -m app.scripts.revert_name_encryption                               # full run, all tables
"""

from __future__ import annotations

import argparse
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from dotenv import load_dotenv

# Fields that WERE encrypted but should NOT be any longer.
# (removed from ENCRYPTED_FIELDS_BY_TABLE in field_crypto.py)
FIELDS_TO_REVERT = {
    "employees": [
        "account",
        "created_at",
        "date_of_joining",
        "department",
        "employee_status",
        "employment_category",
        "experience_years",
        "expertise",
        "first_name",
        "is_leader",
        "last_name",
        "location",
        "manager_email",
        "name",
        "photo_url",
        "position",
        "project_end_date",
        "project_start_date",
        "skills",
        "status",
        "tech_stack",
        "updated_at",
        "usage_location",
    ],
    "goals": [
        "category",
        "completion",
        "created_at",
        "createdBy",
        "managerApproved",
        "status",
        "targetDate",
        "updated_at",
        "weightage",
    ],
    "review": [
        "createdAt",
        "createdBy",
        "goalIds",
        "status",
        "submittedAt",
        "updatedAt",
    ],
    "reviewDraft": [
        "createdAt",
        "createdBy",
        "goalIds",
        "status",
        "submittedAt",
        "updatedAt",
    ],
}

TABLE_ENV_MAP = {
    "employees": "DYNAMODB_TABLE_EMPLOYEES",
    "goals": "DYNAMODB_TABLE_GOALS",
    "review": "DYNAMODB_TABLE_REVIEW",
    "reviewDraft": "DYNAMODB_TABLE_REVIEW_DRAFT",
}

TABLE_KEY_ATTRS = {
    "employees": ["id"],
    "goals": ["id"],
    "review": ["pk", "sk"],
    "reviewDraft": ["pk", "sk"],
}


def revert_table(dynamodb, logical: str, *, dry_run: bool, limit: int | None) -> int:
    from app.services.field_crypto import _decrypt_payload, _deserialize_after_decryption

    env_key = TABLE_ENV_MAP[logical]
    table_name = (os.getenv(env_key) or "").strip()
    if not table_name:
        print(f"  SKIP: {env_key} not set")
        return 0

    table = dynamodb.Table(table_name)
    fields = FIELDS_TO_REVERT[logical]
    key_attrs = TABLE_KEY_ATTRS[logical]

    print(f"\n=== {logical} ({table_name}) ===")
    print(f"  Fields to revert: {fields}")
    print(f"  Mode: {'DRY RUN' if dry_run else 'LIVE'}")

    fixed = 0
    scanned = 0
    scan_kwargs = {}

    while True:
        resp = table.scan(**scan_kwargs)
        items = resp.get("Items", [])

        for item in items:
            scanned += 1
            enc_present = [f for f in fields if f"{f}_enc" in item]
            if not enc_present:
                continue

            row_key = {k: item[k] for k in key_attrs if k in item}
            print(f"  Row {row_key}: {[f'{f}_enc' for f in enc_present]}")

            set_parts = []
            remove_parts = []
            attr_names = {}
            attr_values = {}

            for field in enc_present:
                enc_key = f"{field}_enc"
                blob = item[enc_key]
                try:
                    plain_bytes = _decrypt_payload(blob)
                    val = _deserialize_after_decryption(plain_bytes)
                except Exception as e:
                    print(f"    WARN: decrypt {enc_key} failed: {e}")
                    continue

                fn = f"#f_{field}"
                vn = f":v_{field}"
                en = f"#e_{field}"

                set_parts.append(f"{fn} = {vn}")
                remove_parts.append(en)
                attr_names[fn] = field
                attr_names[en] = enc_key
                attr_values[vn] = val

                preview = str(val)[:80]
                print(f"    {enc_key} -> {field} = {preview}{'...' if len(str(val)) > 80 else ''}")

            if not set_parts:
                continue

            expr = "SET " + ", ".join(set_parts) + " REMOVE " + ", ".join(remove_parts)

            if dry_run:
                print(f"    [DRY RUN] {expr[:120]}")
            else:
                table.update_item(
                    Key=row_key,
                    UpdateExpression=expr,
                    ExpressionAttributeNames=attr_names,
                    ExpressionAttributeValues=attr_values,
                )
                print(f"    UPDATED")

            fixed += 1
            if limit and fixed >= limit:
                print(f"  Reached --limit {limit}")
                return fixed

        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        scan_kwargs["ExclusiveStartKey"] = last

    print(f"  Scanned: {scanned} | Fixed: {fixed}")
    return fixed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Revert non-sensitive fields from *_enc back to plaintext."
    )
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to fix per table.")
    parser.add_argument("--region", default=None)
    parser.add_argument(
        "--table",
        nargs="*",
        choices=list(FIELDS_TO_REVERT.keys()),
        default=None,
        help="Logical table(s) to process (default: all).",
    )
    args = parser.parse_args()

    env_path = args.env_file or os.path.join(_BACKEND_DIR, ".env.staging")
    if os.path.isfile(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
        print(f"Loaded env: {env_path}")

    region = args.region or os.getenv("AWS_REGION", "us-east-1")

    import boto3
    dynamodb = boto3.resource("dynamodb", region_name=region)

    tables = args.table or list(FIELDS_TO_REVERT.keys())
    total = 0
    for logical in tables:
        total += revert_table(dynamodb, logical, dry_run=args.dry_run, limit=args.limit)

    print(f"\nDone. Total rows fixed: {total}")


if __name__ == "__main__":
    main()
