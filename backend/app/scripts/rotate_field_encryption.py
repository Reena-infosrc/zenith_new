"""
Re-wrap DynamoDB field-level ciphertext (v1 -> v2 or new CMK).

Decrypts each allowlisted ``*_enc`` attribute using the stored envelope (AES-256-GCM + KMS)
or legacy AWS Encryption SDK, then re-encrypts with ``--to-version`` (and
``DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2`` when to-version is v2).

Prerequisites (same as API):
  - DYNAMODB_FIELD_ENCRYPTION_ENABLED=true
  - DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN set (for v1 / legacy DEK unwrap)
  - For v2 target: DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2 (optional; falls back to v1 ARN)
  - AWS credentials with kms:Decrypt, kms:GenerateDataKey, dynamodb:Scan, dynamodb:PutItem

Run from backend directory::

  cd backend
  python -m app.scripts.rotate_field_encryption --logical-table employees --to-version v2 --dry-run
  python -m app.scripts.rotate_field_encryption --logical-table employees goals review reviewDraft clientRmFeedback --to-version v2 --limit 50
"""

from __future__ import annotations

import argparse
import json
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

from app.services.field_crypto import (
    ENCRYPTED_FIELDS_BY_TABLE,
    describe_status,
    is_field_encryption_active,
    re_encrypt_field_blob,
)


def _load_env(env_file: str | None) -> None:
    path = env_file or os.path.join(_BACKEND_DIR, ".env.staging")
    if os.path.isfile(path):
        load_dotenv(dotenv_path=path, override=True)
        print(f"Loaded env file: {path}")
    else:
        print(f"Warning: env file not found at {path}; using process environment only.")


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


def _should_rotate_blob(blob: str, from_version: Optional[str], to_version: str) -> bool:
    if not blob:
        return False
    s = blob.strip()
    if s.startswith("{"):
        try:
            env = json.loads(s)
            cur = str(env.get("key_version") or env.get("v") or "v1")
        except json.JSONDecodeError:
            return True
        if from_version and cur != from_version:
            return False
        return cur != to_version
    # Legacy AWS Encryption SDK ciphertext (not JSON) — re-wrap to AES-GCM envelope
    return True


def rotate_table(
    dynamodb,
    logical: str,
    *,
    to_version: str,
    from_version: Optional[str],
    dry_run: bool,
    sleep_s: float,
    limit: Optional[int],
) -> int:
    table_name = _table_name(logical)
    table = dynamodb.Table(table_name)
    fields = ENCRYPTED_FIELDS_BY_TABLE.get(logical, [])
    if not fields:
        print(f"  No encrypted fields configured for {logical}, skipping.")
        return 0

    processed = 0
    updated = 0
    scan_kwargs: Dict[str, Any] = {}
    stop = False

    while True:
        resp = table.scan(**scan_kwargs)
        items = resp.get("Items", [])

        for raw in items:
            changed = False
            new_item = dict(raw)

            for field in fields:
                enc_key = f"{field}_enc"
                if enc_key not in raw or raw[enc_key] is None:
                    continue
                blob = raw[enc_key]
                if not isinstance(blob, str):
                    blob = str(blob)
                if not _should_rotate_blob(blob, from_version, to_version):
                    continue
                try:
                    new_blob = re_encrypt_field_blob(
                        blob,
                        table_logical_name=logical,
                        field_name=field,
                        parsed_item=new_item,
                        new_crypto_version=to_version,
                    )
                    new_item[enc_key] = new_blob
                    changed = True
                except Exception as e:
                    print(f"  ERROR row rotate {logical} {enc_key}: {e}", file=sys.stderr)
                    raise

            processed += 1
            if changed:
                updated += 1
                if not dry_run:
                    table.put_item(Item=new_item)
                if sleep_s > 0:
                    time.sleep(sleep_s)

            if limit is not None and updated >= limit:
                stop = True
                break

        if stop:
            break
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        scan_kwargs["ExclusiveStartKey"] = last

    print(f"  Table {logical}: rows scanned={processed}, rows re-encrypted={updated}" + (" (dry-run)" if dry_run else ""))
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rotate DynamoDB field encryption blobs (e.g. v1 -> v2 / new CMK)."
    )
    parser.add_argument(
        "--logical-table",
        nargs="+",
        required=True,
        choices=list(LOGICAL_TO_ENV_TABLE.keys()),
        help="Logical DynamoDB table name(s).",
    )
    parser.add_argument(
        "--to-version",
        default="v2",
        choices=("v1", "v2"),
        help="Target crypto version written into new envelopes (default: v2).",
    )
    parser.add_argument(
        "--from-version",
        default=None,
        choices=("v1", "v2"),
        help="Only rotate rows whose envelope key_version/v matches this value (omit to rotate any non-target).",
    )
    parser.add_argument("--env-file", default=None, help="Dotenv file path.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and compute new ciphertext but do not write.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between writes.")
    parser.add_argument("--limit", type=int, default=None, help="Stop after this many rows updated (not scanned).")
    parser.add_argument("--region", default=None, help="AWS region (default from env).")
    args = parser.parse_args()

    _load_env(args.env_file)

    if not is_field_encryption_active():
        print(describe_status(), file=sys.stderr)
        print(
            "Set DYNAMODB_FIELD_ENCRYPTION_ENABLED=true and DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN, then re-run.",
            file=sys.stderr,
        )
        sys.exit(1)

    os.environ["DYNAMODB_FIELD_ENCRYPTION_VERSION"] = args.to_version
    print("Field encryption:", describe_status())
    print(f"Target write version (env): {args.to_version}")

    region = args.region or os.getenv("AWS_REGION", "us-east-1")
    dynamodb = boto3.resource("dynamodb", region_name=region)

    total = 0
    for logical in args.logical_table:
        print(f"\n--- Rotating: {logical} ---")
        n = rotate_table(
            dynamodb,
            logical,
            to_version=args.to_version,
            from_version=args.from_version,
            dry_run=args.dry_run,
            sleep_s=args.sleep,
            limit=args.limit,
        )
        total += n

    print(f"\nDone. Total rows re-encrypted: {total}" + (" (dry-run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
