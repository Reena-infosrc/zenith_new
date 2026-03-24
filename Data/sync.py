#!/usr/bin/env python3
"""
Azure AD → DynamoDB Unified Sync (AWS Lambda Optimized + SNS Alerts + AWS Secrets Manager)

Features:
- Advanced User Filtering (Non-human name detection + Domain validation)
- AWS Secrets Manager for Credentials
- SNS Notifications for Success Summary & Critical Failures
- Comprehensive Logging
- Scan-based US Employee ID generation (no counter table needed)
- Batched manager resolution (eliminates N+1 queries)
- Safe error handling (one bad user never aborts the full sync)
- Auto-deactivation of users removed from Azure AD
"""

import os, json, time, uuid, logging, traceback, re
from datetime import datetime
from decimal import Decimal
from typing import Set, Dict, Any, Optional

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
DDB_TABLE     = os.environ.get("DDB_TABLE", "zenith-hr-employees")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
SECRET_NAME   = os.environ.get("SECRET_NAME", "zenith/azure-ad-sync")
TARGET_DOMAIN = os.environ.get("TARGET_DOMAIN", "@infoservices.com")
US_ID_START   = int(os.environ.get("US_ID_START", 5001))
US_ID_END     = int(os.environ.get("US_ID_END", 5999))

# Initialize AWS Clients (module-level = reused across warm Lambda invocations)
ddb        = boto3.resource("dynamodb", region_name=AWS_REGION)
sns_client = boto3.client("sns", region_name=AWS_REGION)
table      = ddb.Table(DDB_TABLE)

# =======================
# LOGGING SETUP
# =======================
# Guard against duplicate handlers on Lambda warm starts
logger = logging.getLogger("AzureADSync")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s | %(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False  # Prevent double-logging via Lambda root logger

# =======================
# SECRETS MANAGER
# =======================
_cached_secrets: Optional[Dict] = None

def get_secret() -> Dict:
    """Retrieve secrets from AWS Secrets Manager. Cached after first call."""
    global _cached_secrets
    if _cached_secrets:
        return _cached_secrets

    session = boto3.session.Session()
    client  = session.client(service_name="secretsmanager", region_name=AWS_REGION)

    try:
        resp = client.get_secret_value(SecretId=SECRET_NAME)
    except ClientError as e:
        logger.error(f"Failed to retrieve secret '{SECRET_NAME}': {e}")
        raise

    _cached_secrets = json.loads(resp["SecretString"])
    return _cached_secrets

# =======================
# ALERTING
# =======================
def send_sns_alert(subject: str, message: str):
    """Publish an SNS notification. Silently skips if no topic ARN is configured."""
    if not SNS_TOPIC_ARN:
        return
    subject = subject.strip()[:100]
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
    Order: exclusion list -> domain -> keyword -> pattern.
    """
    email        = (user.get("mail") or user.get("userPrincipalName") or "").strip().lower()
    display_name = (user.get("displayName") or "").strip().lower()

    if not email:
        logger.debug("Skipping user with no email/UPN")
        return False

    # 1. Manual exclusion list
    if email in excluded_emails:
        logger.debug(f"Skipping {email}: in exclusion list")
        return False

    # 2. Domain check
    if TARGET_DOMAIN not in email:
        logger.info(f"Skipping {email}: non-target domain")
        return False

    # 3. Non-human keyword detection (whole-word match to avoid false positives)
    email_prefix = email.split("@")[0].replace(".", " ").replace("-", " ")
    name_clean   = display_name.replace(".", " ").replace("-", " ")
    combined     = f"{email_prefix} {name_clean}"

    for kw in NON_HUMAN_KEYWORDS:
        if re.search(rf"\b{kw}\b", combined, re.IGNORECASE):
            logger.info(f"Skipping {email}: flagged as non-human (keyword: '{kw}')")
            return False

    # 4. Pattern check: display name looks like a service URL or technical ID
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
    url = f"https://graph.microsoft.com/v1.0/users?$select={select}&$expand=manager&$top=250"

    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=Retry(total=3, backoff_factor=1)))

    users = []
    while url:
        resp = session.get(url, headers=headers, timeout=30)
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
def ddb_safe(v):
    """Recursively convert Python types to DynamoDB-safe equivalents."""
    if isinstance(v, float):
        return Decimal(str(v))
    if isinstance(v, dict):
        return {k: ddb_safe(x) for k, x in v.items()}
    if isinstance(v, list):
        return [ddb_safe(x) for x in v]
    return v

def get_employee_by_email(email: str) -> Optional[Dict]:
    """Look up a single employee record by email via GSI."""
    resp  = table.query(
        IndexName="EmailIndex",
        KeyConditionExpression=Key("email").eq(email),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None

def batch_resolve_emails(emails: Set[str]) -> Dict[str, Dict]:
    """
    Resolve a set of emails to DB records up-front.
    Returns {email: record} mapping.
    Doing this once before the sync loop eliminates the N+1 query problem.
    """
    result = {}
    for email in emails:
        rec = get_employee_by_email(email)
        if rec:
            result[email] = rec
    return result

# =======================
# US ID GENERATOR (scan-based, no counter table needed)
# =======================
# Module-level cache: scan once per invocation, increment in-memory for
# each additional new US user in the same run — no extra AWS calls needed.
_us_id_current: Optional[int] = None

def get_next_us_employee_id() -> str:
    """
    Finds the current max US employee ID already stored in the employees
    table and returns max + 1. Scans only numeric IDs within US_ID_START
    to US_ID_END range so it always picks up exactly where the data left off.

    The module-level _us_id_current cache means the table is only scanned
    once per Lambda invocation even if multiple new US users need IDs.
    """
    global _us_id_current

    if _us_id_current is None:
        # First new US user this invocation — scan to find the real current max
        logger.info("Scanning employees table for current max US employee ID...")
        max_id = US_ID_START - 1  # safe floor if no US IDs exist yet

        scan_kwargs = {
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
                        pass  # skip non-numeric IDs like "N/A"

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
# DEACTIVATION LOGIC
# =======================
def deactivate_removed_users(azure_emails: Set[str], today: str, dry_run: bool) -> int:
    """
    Scan DynamoDB for active TARGET_DOMAIN users no longer present in
    Azure AD and mark them inactive.
    Returns count of deactivated records.
    """
    deactivated = 0
    errors      = 0

    logger.info("Scanning for users to deactivate (removed from Azure AD)...")

    scan_kwargs = {
        # Only check currently active records
        "FilterExpression": "#s = :active",
        "ExpressionAttributeNames":  {"#s": "status"},
        "ExpressionAttributeValues": {":active": "active"},
        # Fetch only what we need
        "ProjectionExpression": "id, email",
    }

    try:
        while True:
            resp = table.scan(**scan_kwargs)

            for record in resp.get("Items", []):
                db_email = (record.get("email") or "").strip().lower()

                if not db_email:
                    continue

                # Only touch records in our managed domain —
                # never auto-deactivate contractors or externally-added accounts
                if TARGET_DOMAIN not in db_email:
                    continue

                if db_email not in azure_emails:
                    logger.info(f"Deactivating {db_email}: no longer present in Azure AD")
                    if not dry_run:
                        try:
                            table.update_item(
                                Key={"id": record["id"]},
                                UpdateExpression="SET #s = :inactive, updated_at = :today",
                                ExpressionAttributeNames={"#s": "status"},
                                ExpressionAttributeValues={
                                    ":inactive": "inactive",
                                    ":today":    today,
                                },
                            )
                        except Exception as e:
                            logger.error(f"Failed to deactivate {db_email}: {e}")
                            errors += 1
                            continue
                    deactivated += 1

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

    # Reset the US ID cache at the start of each sync so every run
    # re-scans for the latest max rather than using a stale warm-start value
    global _us_id_current
    _us_id_current = None

    # --- Pre-resolve all manager emails in one pass (eliminates N+1 queries) ---
    manager_emails: Set[str] = set()
    for u in users:
        mgr = u.get("manager")
        if mgr:
            mgr_email = (mgr.get("mail") or mgr.get("userPrincipalName") or "").strip().lower()
            if mgr_email:
                manager_emails.add(mgr_email)

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
            existing = get_employee_by_email(email)

            # Resolve manager from pre-built map
            mgr_email    = None
            reporting_to = None
            mgr_raw      = u.get("manager")
            if mgr_raw:
                mgr_email = (mgr_raw.get("mail") or mgr_raw.get("userPrincipalName") or "").strip().lower()
                if mgr_email and mgr_email in manager_map:
                    reporting_to = manager_map[mgr_email]["id"]

            # Safe location fallback — existing may be None on insert path
            location = (
                u.get("officeLocation")
                or (existing.get("location") if existing else None)
                or "Unknown"
            )

            # Azure Entra: ISO 3166 alpha-2 country code for license assignment (e.g. IN, US).
            # Distinct from officeLocation (often city/office text).
            usage_raw = (u.get("usageLocation") or "").strip()
            usage_location = usage_raw.upper() if usage_raw else None

            payload: Dict[str, Any] = {
                "name":       u.get("displayName") or email,
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
                # UPDATE — only overwrite employee_id if Azure now provides a different one
                new_eid = (u.get("employeeId") or "").strip()
                if new_eid and new_eid != str(existing.get("employee_id", "")).strip():
                    payload["employee_id"] = new_eid

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
                stats["updated"] += 1

            else:
                # INSERT — assign employee ID if Azure doesn't provide one
                usage  = usage_location or ""
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
                stats["inserted"] += 1

        except Exception as e:
            # Log and CONTINUE — one bad record must never abort the full sync
            logger.error(f"Error processing '{email}': {e}\n{traceback.format_exc()}")
            stats["errors"] += 1

    return stats

# =======================
# LAMBDA HANDLER
# =======================
def lambda_handler(event: Dict, context: Any) -> Dict:
    start_time = time.time()
    dry_run    = bool(event.get("dry_run", False))

    if dry_run:
        logger.info("=== DRY RUN MODE — no writes will be made ===")

    try:
        token     = get_access_token()
        all_users = fetch_users(token)
        logger.info(f"Fetched {len(all_users)} total users from Azure AD")

        # Load excluded emails — must be bundled in the Lambda deployment zip
        # Required env var: EXCLUDED_USERS_PATH = /var/task/excluded_users.json
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
        summary  = (
            f"Azure AD Sync {'(DRY RUN) ' if dry_run else ''}completed in {duration}s.\n\n"
            f"Inserted    : {stats['inserted']}\n"
            f"Updated     : {stats['updated']}\n"
            f"Deactivated : {stats['deactivated']}\n"
            f"Skipped     : {stats['skipped']}\n"
            f"Errors      : {stats['errors']}"
        )
        logger.info(summary)

        if stats["inserted"] + stats["updated"] + stats["deactivated"] + stats["errors"] > 0:
            send_sns_alert("Azure AD Sync Summary", summary)

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