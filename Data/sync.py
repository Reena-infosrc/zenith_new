#!/usr/bin/env python3
"""
Azure AD → DynamoDB Unified Sync (AWS Lambda Optimized + SNS Alerts + AWS Secrets Manager)

Features:
- Advanced User Filtering (Non-human name detection + Domain validation)
- AWS Secrets Manager for Credentials
- SNS Notifications with full per-user audit trail (who added, removed, what changed)
- Comprehensive Logging
- Scan-based US Employee ID generation (no counter table needed)
- Batched manager resolution (eliminates N+1 queries)
- Safe error handling (one bad user never aborts the full sync)
- Auto-deactivation of users removed from Azure AD

SNS email includes:
  • ADDED   — name, email, department, position, employee_id, manager
  • REMOVED — name, email (deactivated from Azure AD)
  • UPDATED — name, email + exactly which fields changed (old → new)
  • ERRORS  — email + exception message

Fixes applied (v3):
  FIX-1  Domain check uses endswith() — prevents suffix-spoofing.
  FIX-2  Same endswith() fix in deactivate_removed_users().
  FIX-3  Secrets cache preserved across warm invocations; force_refresh param added.
  FIX-4  SNS subject truncated by bytes not chars (100-byte AWS limit).
  FIX-5  SNS alert fires when skipped > 0 (was previously ignored).
  FIX-6  ddb_safe() handles bool and set types correctly.
  FIX-7  get_employee_by_email() pages all GSI results; warns on duplicates.
  FIX-8  batch_resolve_emails() docstring clarified (sequential, not true batch).
  FIX-9  _us_id_current reset moved to lambda_handler(), not sync().
  FIX-10 Deactivation counter only increments on successful writes.
  FIX-11 Secret keys stripped of whitespace on load — prevents KeyError from
         accidental trailing spaces in Secrets Manager key names.
  FIX-12 employee_id NEVER overwritten with empty string on update — if Azure
         has no employeeId, the existing DB value is always preserved.
  FIX-13 detect_changes() skips fields absent from new_payload so omitted
         employee_id on update path doesn't show as a false change.
"""

import os, json, time, uuid, logging, traceback, re
from datetime import datetime
from decimal import Decimal
from typing import Set, Dict, Any, Optional, List

import boto3
import requests
import msal
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# =======================
# CONFIGURATION
# =======================
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-1")
DDB_TABLE     = os.environ.get("DDB_TABLE", "zenith-hr-employees-staging")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
SECRET_NAME   = os.environ.get("SECRET_NAME", "infosrv-zenith-data-prod")
TARGET_DOMAIN = os.environ.get("TARGET_DOMAIN", "@infoservices.com")
US_ID_START   = int(os.environ.get("US_ID_START", 5001))
US_ID_END     = int(os.environ.get("US_ID_END", 5999))

# Initialize AWS clients (module-level = reused across warm Lambda invocations)
ddb        = boto3.resource("dynamodb", region_name=AWS_REGION)
sns_client = boto3.client("sns", region_name=AWS_REGION)
table      = ddb.Table(DDB_TABLE)

# =======================
# LOGGING SETUP
# =======================
logger = logging.getLogger("AzureADSync")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s | %(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False  # Prevent double-logging via Lambda root logger

# =======================
# AUDIT LOG
# =======================
# Accumulates one entry per user action during a sync run.
# Cleared at the start of each lambda_handler() invocation.
#
# Entry shapes:
#   {"action": "ADDED",   "name": str, "email": str, "employee_id": str,
#    "department": str, "position": str, "manager_email": str|None}
#
#   {"action": "REMOVED", "name": str, "email": str}
#
#   {"action": "UPDATED", "name": str, "email": str,
#    "changes": [{"field": str, "old": str, "new": str}, ...]}
#
#   {"action": "ERROR",   "email": str, "reason": str}
#
_audit_log: List[Dict[str, Any]] = []


def _audit(entry: Dict[str, Any]) -> None:
    """Append one entry to the run-scoped audit log."""
    _audit_log.append(entry)


# =======================
# SECRETS MANAGER
# =======================
# Intentionally preserved across warm invocations to avoid redundant API calls.
# If credentials are rotated, pass force_refresh=True or trigger a cold start.
_cached_secrets: Optional[Dict] = None


def get_secret(force_refresh: bool = False) -> Dict:
    """
    Retrieve secrets from AWS Secrets Manager.
    Cached after first call to reduce latency and API cost.
    Pass force_refresh=True after a credential rotation.
    """
    global _cached_secrets
    if _cached_secrets and not force_refresh:
        return _cached_secrets

    session = boto3.session.Session()
    client  = session.client(service_name="secretsmanager", region_name=AWS_REGION)
    try:
        resp = client.get_secret_value(SecretId=SECRET_NAME)
    except ClientError as e:
        logger.error(f"Failed to retrieve secret '{SECRET_NAME}': {e}")
        raise

    raw = json.loads(resp["SecretString"])

    # FIX-11: Strip whitespace from key names and string values.
    # Accidental trailing spaces in Secrets Manager key names cause KeyError.
    _cached_secrets = {
        k.strip(): v.strip() if isinstance(v, str) else v
        for k, v in raw.items()
    }

    logger.info(f"Secret keys loaded: {list(_cached_secrets.keys())}")
    return _cached_secrets


# =======================
# ALERTING
# =======================
def _fmt_audit_section(action: str, entries: List[Dict]) -> str:
    """Format one section of the audit report for a given action type."""
    if not entries:
        return ""

    lines = [f"\n{'='*60}", f"  {action} ({len(entries)})", f"{'='*60}"]

    for e in entries:
        if action == "ADDED":
            lines.append(
                f"  + {e['name']} <{e['email']}>\n"
                f"      Employee ID : {e.get('employee_id', 'N/A')}\n"
                f"      Department  : {e.get('department', '—')}\n"
                f"      Position    : {e.get('position', '—')}\n"
                f"      Manager     : {e.get('manager_email') or '—'}\n"
                f"      Usage loc.  : {e.get('usage_location') or '—'}"
            )
        elif action == "REMOVED":
            lines.append(f"  - {e['name']} <{e['email']}>")
        elif action == "UPDATED":
            change_lines = "\n".join(
                f"      {c['field']:20s}: {c['old']!r:30s} → {c['new']!r}"
                for c in e.get("changes", [])
            )
            lines.append(
                f"  ~ {e['name']} <{e['email']}>\n"
                + (change_lines if change_lines else "      (no tracked field changes)")
            )
        elif action == "ERROR":
            lines.append(f"  ! {e['email']}\n      {e['reason']}")

    return "\n".join(lines)


def build_sns_message(stats: Dict, duration: float, dry_run: bool) -> str:
    """
    Assemble the full SNS email body:
      1. Header with counts and run time
      2. ADDED   section — who was provisioned and their full details
      3. REMOVED section — who was deactivated
      4. UPDATED section — who changed and exactly which fields (old → new)
      5. ERRORS  section — who failed and the exception message
    """
    mode   = "(DRY RUN) " if dry_run else ""
    header = (
        f"Azure AD Sync {mode}— {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
        f"Duration : {duration}s\n\n"
        f"  Inserted    : {stats['inserted']}\n"
        f"  Updated     : {stats['updated']}\n"
        f"  Deactivated : {stats['deactivated']}\n"
        f"  Skipped     : {stats['skipped']}\n"
        f"  Errors      : {stats['errors']}"
    )

    added   = [e for e in _audit_log if e["action"] == "ADDED"]
    removed = [e for e in _audit_log if e["action"] == "REMOVED"]
    updated = [e for e in _audit_log if e["action"] == "UPDATED"]
    errors  = [e for e in _audit_log if e["action"] == "ERROR"]

    body  = header
    body += _fmt_audit_section("ADDED",   added)
    body += _fmt_audit_section("REMOVED", removed)
    body += _fmt_audit_section("UPDATED", updated)
    body += _fmt_audit_section("ERROR",   errors)

    # SNS message hard limit is 256 KB; truncate gracefully if enormous
    if len(body.encode("utf-8")) > 250_000:
        body = body[:250_000] + "\n\n[...truncated — too many changes to display in full]"

    return body


def send_sns_alert(subject: str, message: str) -> None:
    """Publish an SNS notification. Silently skips if no topic ARN is configured."""
    if not SNS_TOPIC_ARN:
        return

    # FIX-4: SNS subject limit is 100 bytes (UTF-8), not 100 characters
    subject = subject.strip().encode("utf-8")[:100].decode("utf-8", errors="ignore")

    try:
        sns_client.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)
    except Exception as e:
        logger.error(f"SNS publish failed: {e}")


# =======================
# FILTERING LOGIC
# =======================
NON_HUMAN_KEYWORDS = {
    "test", "aws", "devops", "hrteam", "admin", "service", "support", "bot",
    "automation", "qa", "generator", "portal", "app", "genie", "force",
    "conference", "account", "backup", "office", "desk", "integration",
}


def is_valid_human_user(user: Dict, excluded_emails: Set[str]) -> bool:
    """
    Returns True only if the user passes all human-employee checks.
    Order: exclusion list → domain → keyword → pattern.
    """
    email        = (user.get("mail") or user.get("userPrincipalName") or "").strip().lower()
    display_name = (user.get("displayName") or "").strip().lower()

    if not email:
        logger.debug("Skipping user with no email/UPN")
        return False

    if email in excluded_emails:
        logger.debug(f"Skipping {email}: in exclusion list")
        return False

    # FIX-1: endswith() prevents suffix-spoofing (e.g. "evil-infoservices.com")
    if not email.endswith(TARGET_DOMAIN):
        logger.info(f"Skipping {email}: non-target domain")
        return False

    email_prefix = email.split("@")[0].replace(".", " ").replace("-", " ")
    name_clean   = display_name.replace(".", " ").replace("-", " ")
    combined     = f"{email_prefix} {name_clean}"

    for kw in NON_HUMAN_KEYWORDS:
        if re.search(rf"\b{kw}\b", combined, re.IGNORECASE):
            logger.info(f"Skipping {email}: flagged as non-human (keyword: '{kw}')")
            return False

    if "@" in display_name or ".com" in display_name or ".org" in display_name:
        logger.info(f"Skipping {email}: display name looks like a URL/service ID")
        return False

    return True


# =======================
# AZURE AUTH & GRAPH API
# =======================
def get_access_token() -> str:
    secrets = get_secret()
    app = msal.ConfidentialClientApplication(
        secrets["AZURE_CLIENT_ID"],
        authority=f"https://login.microsoftonline.com/{secrets['AZURE_TENANT_ID']}",
        client_credential=secrets["AZURE_CLIENT_SECRET"],
    )
    token = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in token:
        raise RuntimeError(f"Token acquisition failed: {token.get('error_description')}")
    return token["access_token"]


def fetch_users(token: str) -> list:
    """Page through all Graph API users and return a flat list."""
    headers = {"Authorization": f"Bearer {token}", "ConsistencyLevel": "eventual"}
    select  = (
        "id,displayName,userPrincipalName,mail,accountEnabled,"
        "department,jobTitle,officeLocation,employeeId,usageLocation"
    )
    url = (
        f"https://graph.microsoft.com/v1.0/users"
        f"?$select={select}&$expand=manager&$top=250"
    )

    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=Retry(total=3, backoff_factor=1)))

    users = []
    while url:
        resp = session.get(url, headers=headers, ti
        meout=30)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"Graph API error: {data['error']}")
        users.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    return users


# =======================
# DYNAMODB UTILITIES
# =======================
def ddb_safe(v: Any) -> Any:
    """Recursively convert Python types to DynamoDB-safe equivalents."""
    if isinstance(v, bool):
        return v                                    # must be before int (bool ⊂ int)
    if isinstance(v, float):
        return Decimal(str(v))
    if isinstance(v, set):
        return [ddb_safe(x) for x in sorted(v)]    # DynamoDB SS/NS needs TypeSerializer
    if isinstance(v, dict):
        return {k: ddb_safe(x) for k, x in v.items()}
    if isinstance(v, list):
        return [ddb_safe(x) for x in v]
    return v


def get_employee_by_email(email: str) -> Optional[Dict]:
    """
    Look up a single employee record by email via GSI.
    Pages all results; warns on duplicates (data integrity issue).
    """
    query_kwargs: Dict = {
        "IndexName": "EmailIndex",
        "KeyConditionExpression": Key("email").eq(email),
    }
    items: list = []
    while True:
        resp = table.query(**query_kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        query_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    if len(items) > 1:
        logger.warning(
            f"Data integrity: {len(items)} records for '{email}' in EmailIndex — "
            "using first. Investigate and deduplicate."
        )
    return items[0] if items else None


def batch_resolve_emails(emails: Set[str]) -> Dict[str, Dict]:
    """
    Resolve a set of emails to DB records in one pre-pass before the sync loop.
    (DynamoDB has no GSI batch-get; calls are sequential but hoisted out of
    the per-user loop to avoid the N+1 query pattern.)
    """
    result: Dict[str, Dict] = {}
    for email in emails:
        rec = get_employee_by_email(email)
        if rec:
            result[email] = rec
    return result


# =======================
# US ID GENERATOR
# =======================
# FIX-9: Reset in lambda_handler(), not sync(), so calling sync() twice in one
# invocation (e.g. in tests) doesn't force a redundant table scan.
_us_id_current: Optional[int] = None


def get_next_us_employee_id() -> str:
    """
    Scan for the current max US employee ID and return max+1.
    Table is scanned at most once per Lambda invocation (module-level cache).
    """
    global _us_id_current

    if _us_id_current is None:
        logger.info("Scanning employees table for current max US employee ID...")
        max_id      = US_ID_START - 1
        scan_kwargs: Dict = {
            "FilterExpression": "attribute_exists(employee_id)",
            "ProjectionExpression": "employee_id",
        }
        try:
            while True:
                resp = table.scan(**scan_kwargs)
                for item in resp.get("Items", []):
                    try:
                        val = int(item["employee_id"])
                        if US_ID_START <= val <= US_ID_END and val > max_id:
                            max_id = val
                    except (ValueError, TypeError):
                        pass
                if "LastEvaluatedKey" not in resp:
                    break
                scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        except ClientError as e:
            logger.error(f"Failed to scan for max US employee ID: {e}")
            raise

        _us_id_current = max_id
        logger.info(f"Current max US employee ID in DB: {_us_id_current}")

    _us_id_current += 1
    if _us_id_current > US_ID_END:
        raise RuntimeError(
            f"US employee ID range exhausted (max={US_ID_END}). "
            "Increase US_ID_END env var."
        )

    logger.info(f"Assigned new US employee ID: {_us_id_current}")
    return str(_us_id_current)


# =======================
# FIELD CHANGE DETECTION
# =======================
# Fields diffed on UPDATE to populate the audit trail.
# Internal/always-changing fields (updated_at, id, created_at) are excluded.
TRACKED_FIELDS = (
    "name", "department", "position", "location",
    "status", "manager_email", "employee_id",
    "usage_location",
)


def detect_changes(existing: Dict, new_payload: Dict) -> List[Dict[str, str]]:
    """
    Compare the current DB record against the incoming payload.
    Returns a list of {"field", "old", "new"} dicts for every field that changed.

    FIX-13: Fields absent from new_payload are intentionally skipped — this
    prevents employee_id (and other preserved fields) from showing as a
    false change (old='5001', new='') when they were deliberately omitted
    from the update payload to preserve the existing value.
    """
    changes = []
    for field in TRACKED_FIELDS:
        # Field not in new payload = intentionally preserved, not a change
        if field not in new_payload:
            continue
        old_val = str(existing.get(field) or "").strip()
        new_val = str(new_payload.get(field) or "").strip()
        if old_val != new_val:
            changes.append({"field": field, "old": old_val, "new": new_val})
    return changes


# =======================
# DEACTIVATION LOGIC
# =======================
def deactivate_removed_users(
    azure_emails: Set[str],
    today: str,
    dry_run: bool,
) -> int:
    """
    Scan DynamoDB for active TARGET_DOMAIN users no longer present in Azure AD
    and mark them inactive. Appends a REMOVED entry to _audit_log for each one.
    Returns count of deactivated records.
    """
    deactivated = 0
    errors      = 0

    logger.info("Scanning for users to deactivate (removed from Azure AD)...")

    scan_kwargs: Dict = {
        "FilterExpression": "#s = :active",
        "ExpressionAttributeNames":  {"#s": "status", "#n": "name"},
        "ExpressionAttributeValues": {":active": "active"},
        "ProjectionExpression":      "id, email, #n",
    }

    try:
        while True:
            resp = table.scan(**scan_kwargs)
            for record in resp.get("Items", []):
                db_email = (record.get("email") or "").strip().lower()
                if not db_email:
                    continue

                # FIX-2: endswith() — never auto-deactivate externally managed accounts
                if not db_email.endswith(TARGET_DOMAIN):
                    continue

                if db_email not in azure_emails:
                    display = record.get("name") or db_email
                    logger.info(f"Deactivating {db_email}: no longer in Azure AD")

                    if not dry_run:
                        try:
                            table.update_item(
                                Key={"id": record["id"]},
                                UpdateExpression=(
                                    "SET #s = :inactive, updated_at = :today"
                                ),
                                ExpressionAttributeNames={"#s": "status"},
                                ExpressionAttributeValues={
                                    ":inactive": "inactive",
                                    ":today":    today,
                                },
                            )
                            # FIX-10: only count after a successful write
                            deactivated += 1
                            _audit({"action": "REMOVED", "name": display, "email": db_email})
                        except Exception as e:
                            logger.error(f"Failed to deactivate {db_email}: {e}")
                            errors += 1
                    else:
                        deactivated += 1
                        _audit({"action": "REMOVED", "name": display, "email": db_email})

            if "LastEvaluatedKey" not in resp:
                break
            scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    except Exception as e:
        logger.error(f"Deactivation scan failed: {e}\n{traceback.format_exc()}")

    if errors:
        logger.warning(f"Deactivation completed with {errors} error(s)")

    return deactivated


# =======================
# SYNC LOGIC
# =======================
def sync(users: list, dry_run: bool = False) -> Dict[str, Any]:
    stats = {"inserted": 0, "updated": 0, "skipped": 0, "deactivated": 0, "errors": 0}
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # --- Pre-resolve manager emails (one pass, eliminates N+1) ---
    manager_emails: Set[str] = set()
    for u in users:
        mgr = u.get("manager")
        if mgr:
            me = (mgr.get("mail") or mgr.get("userPrincipalName") or "").strip().lower()
            if me:
                manager_emails.add(me)

    logger.info(f"Pre-resolving {len(manager_emails)} unique manager email(s)...")
    manager_map = batch_resolve_emails(manager_emails)

    # --- Build authoritative set of Azure AD emails for deactivation check ---
    azure_emails: Set[str] = set()
    for u in users:
        e = (u.get("mail") or u.get("userPrincipalName") or "").strip().lower()
        if e:
            azure_emails.add(e)

    # --- Deactivate users removed from Azure AD ---
    stats["deactivated"] = deactivate_removed_users(azure_emails, today, dry_run)

    # --- Process each user (insert / update) ---
    for u in users:
        email = (u.get("mail") or u.get("userPrincipalName") or "").strip().lower()
        if not email:
            logger.warning("User has no resolvable email — skipping")
            stats["skipped"] += 1
            continue

        try:
            existing     = get_employee_by_email(email)
            display_name = u.get("displayName") or email

            # Resolve manager
            mgr_email    = None
            reporting_to = None
            mgr_raw      = u.get("manager")
            if mgr_raw:
                mgr_email = (
                    mgr_raw.get("mail") or mgr_raw.get("userPrincipalName") or ""
                ).strip().lower()
                if mgr_email and mgr_email in manager_map:
                    reporting_to = manager_map[mgr_email]["id"]

            location = (
                u.get("officeLocation")
                or (existing.get("location") if existing else None)
                or "Unknown"
            )

            usage_raw = (u.get("usageLocation") or "").strip()
            usage_location = usage_raw.upper() if usage_raw else None

            # Base payload — does NOT include employee_id.
            # employee_id is handled separately below on both paths to avoid
            # ever overwriting an existing ID with a blank value (FIX-12).
            payload: Dict[str, Any] = {
                "name":       display_name,
                "email":      email,
                "department": u.get("department") or "Internal",
                "position":   u.get("jobTitle") or "Employee",
                "location":   location,
                "status":     "active" if u.get("accountEnabled") else "inactive",
                "updated_at": today,
            }
            if usage_location:
                payload["usage_location"] = usage_location
            if mgr_email:    payload["manager_email"] = mgr_email
            if reporting_to: payload["reporting_to"]  = reporting_to

            if existing:
                # ----------------------------------------------------------------
                # UPDATE path
                # FIX-12: Only add employee_id to the payload when Azure actually
                # provides a non-empty value that differs from what is stored.
                # When Azure has no employeeId, employee_id is intentionally left
                # out of the payload so the existing DB value is untouched.
                # ----------------------------------------------------------------
                new_eid = (u.get("employeeId") or "").strip()
                if new_eid and new_eid != str(existing.get("employee_id", "")).strip():
                    payload["employee_id"] = new_eid
                # If new_eid is blank → employee_id is NOT in payload → DB value preserved

                # Diff before writing (FIX-13: absent keys are not reported as changes)
                changes = detect_changes(existing, payload)

                if not dry_run:
                    safe_payload = ddb_safe(payload)
                    expr, vals, names = [], {}, {}
                    for k, v in safe_payload.items():
                        expr.append(f"#{k} = :{k}")
                        vals[f":{k}"]  = v
                        names[f"#{k}"] = k
                    table.update_item(
                        Key={"id": existing["id"]},
                        UpdateExpression="SET " + ", ".join(expr),
                        ExpressionAttributeValues=vals,
                        ExpressionAttributeNames=names,
                    )

                # Audit even in dry_run so you can preview what would change
                _audit({
                    "action":  "UPDATED",
                    "name":    display_name,
                    "email":   email,
                    "changes": changes,
                })
                stats["updated"] += 1

            else:
                # ----------------------------------------------------------------
                # INSERT path
                # Assign a US employee ID if Azure doesn't provide one.
                # ----------------------------------------------------------------
                usage = usage_location or ""
                emp_id = (u.get("employeeId") or "").strip()
                if not emp_id:
                    emp_id = get_next_us_employee_id() if usage == "US" else "N/A"

                payload.update({
                    "id":          str(uuid.uuid4()),
                    "employee_id": emp_id,
                    "created_at":  today,
                })

                if not dry_run:
                    table.put_item(Item=ddb_safe(payload))

                _audit({
                    "action":        "ADDED",
                    "name":          display_name,
                    "email":         email,
                    "employee_id":   emp_id,
                    "department":    payload["department"],
                    "position":      payload["position"],
                    "manager_email": mgr_email,
                    "usage_location": payload.get("usage_location"),
                })
                stats["inserted"] += 1

        except Exception as e:
            # Log and CONTINUE — one bad record must never abort the full sync
            reason = str(e).split("\n")[0]
            logger.error(f"Error processing '{email}': {e}\n{traceback.format_exc()}")
            _audit({"action": "ERROR", "email": email, "reason": reason})
            stats["errors"] += 1

    return stats


# =======================
# LAMBDA HANDLER
# =======================
def lambda_handler(event: Dict, context: Any) -> Dict:
    global _us_id_current, _audit_log

    start_time = time.time()
    dry_run    = bool(event.get("dry_run", False))

    # Reset all per-invocation state
    _us_id_current = None   # FIX-9: reset here, not inside sync()
    _audit_log     = []

    if dry_run:
        logger.info("=== DRY RUN MODE — no writes will be made ===")

    try:
        token     = get_access_token()
        all_users = fetch_users(token)
        logger.info(f"Fetched {len(all_users)} total users from Azure AD")

        # Load excluded emails — must be bundled in the Lambda deployment zip.
        # Set env var EXCLUDED_USERS_PATH=/var/task/excluded_users.json
        exc_path = os.environ.get("EXCLUDED_USERS_PATH", "/var/task/excluded_users.json")
        excluded_emails: Set[str] = set()
        if os.path.exists(exc_path):
            with open(exc_path, "r") as f:
                excluded_emails = {e.strip().lower() for e in json.load(f) if e.strip()}
            logger.info(f"Loaded {len(excluded_emails)} manually excluded email(s)")
        else:
            logger.warning(
                f"Excluded users file NOT FOUND at '{exc_path}' — "
                "no emails will be excluded! "
                "Ensure excluded_users.json is bundled in the zip and "
                "EXCLUDED_USERS_PATH=/var/task/excluded_users.json env var is set."
            )

        filtered = [u for u in all_users if is_valid_human_user(u, excluded_emails)]
        logger.info(
            f"After filtering: {len(filtered)} human users "
            f"(dropped {len(all_users) - len(filtered)})"
        )

        stats    = sync(filtered, dry_run=dry_run)
        duration = round(time.time() - start_time, 2)

        # Build full audit-enriched SNS message and log it
        sns_message = build_sns_message(stats, duration, dry_run)
        logger.info(sns_message)

        # FIX-5: alert when any counter > 0, including skipped
        if any(stats[k] > 0 for k in ("inserted", "updated", "deactivated", "skipped", "errors")):
            subject = f"Azure AD Sync {'[DRY RUN] ' if dry_run else ''}Summary"
            send_sns_alert(subject, sns_message)

        return {"statusCode": 200, "body": json.dumps(stats)}

    except Exception as e:
        err_msg = f"Azure AD Sync FAILED:\n\n{str(e)}\n\n{traceback.format_exc()}"
        logger.error(err_msg)
        send_sns_alert("Azure AD Sync Failed", err_msg[:5000])
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


# =======================
# LOCAL TESTING ENTRY
# =======================
if __name__ == "__main__":
    result = lambda_handler({"dry_run": True}, None)
    print(json.dumps(result, indent=2))