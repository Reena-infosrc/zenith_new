"""
DynamoDB field-level encryption (AWS KMS + AWS Encryption SDK).

Staging / safe default: DYNAMODB_FIELD_ENCRYPTION_ENABLED=false → no-op; existing table data unchanged.
When enabled: only fields listed in ENCRYPTED_FIELDS_BY_TABLE for that logical table are transformed
(plaintext attribute -> *_enc ciphertext); decrypt merges *_enc back on read.

Cleartext keys include partition/sort keys, GSI attributes (email, reporting_to, reviewId, cycleYear, …).
See ENCRYPTED_FIELDS_BY_TABLE below.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_STATUS_LOGGED = False

# Per logical DynamoDB table key (see database_dynamodb.DynamoDBService.tables): attribute names to encrypt.
# Keys must match format_dynamodb_item top-level names. Do not list partition key, GSI keys, or foreign ids
# needed for queries (email, reporting_to, reviewId, cycleYear, reviewType, reviewerId, isActive, …).
ENCRYPTED_FIELDS_BY_TABLE: Dict[str, List[str]] = {
    # Only genuinely sensitive / PII fields. Operational fields (status, timestamps,
    # filter/sort columns like department, position, is_leader, etc.) stay plaintext
    # so DynamoDB queries, projections, and the UI work without extra decrypt overhead.
    "employees": [
        "bio",
        "date_of_birth",
        "emergency_contact_name",
        "emergency_contact_phone",
        "emergency_contact_relationship",
        "gender",
        "mobile",
        "overall_rating",
        "performance_client_feedback",
        "performance_communication",
        "performance_leadership",
        "phone",
        "reason_for_resignation",
        "strengths",
    ],
    "goals": [
        "description",
        "milestones",
        "title",
    ],
    "review": [
        "attachments",
        "comments",
        "improvements",
        "metadata",
        "ratings",
        "strengths",
    ],
    "reviewDraft": [
        "attachments",
        "comments",
        "improvements",
        "metadata",
        "ratings",
        "strengths",
    ],
}


def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def _kms_key_arn() -> str:
    return (os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN") or "").strip()


def _app_context() -> Dict[str, str]:
    return {
        "app": (os.getenv("DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP") or os.getenv("SERVICE_NAME") or "zenith-hr-pulse"),
        "stage": (os.getenv("STAGE") or "unknown"),
    }


def is_field_encryption_active() -> bool:
    """
    True only when explicitly enabled, KMS ARN is set, and at least one table has a non-empty allowlist.
    """
    if not _env_bool("DYNAMODB_FIELD_ENCRYPTION_ENABLED", False):
        return False
    if not _kms_key_arn():
        logger.warning(
            "DYNAMODB_FIELD_ENCRYPTION_ENABLED is true but DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN is missing; "
            "field encryption inactive."
        )
        return False
    if not any(ENCRYPTED_FIELDS_BY_TABLE.values()):
        logger.warning(
            "Field encryption enabled but ENCRYPTED_FIELDS_BY_TABLE has no fields; field encryption inactive."
        )
        return False
    return True


def _log_bootstrap_once() -> None:
    global _STATUS_LOGGED
    if _STATUS_LOGGED:
        return
    _STATUS_LOGGED = True
    logger.info(
        "Field encryption bootstrap: enabled_flag=%s, kms_configured=%s, allowlist_tables=%s",
        _env_bool("DYNAMODB_FIELD_ENCRYPTION_ENABLED", False),
        bool(_kms_key_arn()),
        [k for k, v in ENCRYPTED_FIELDS_BY_TABLE.items() if v],
    )


def _encryption_context(table_logical_name: str, field_name: str, physical_table: Optional[str]) -> Dict[str, str]:
    ctx = {**_app_context(), "logical_table": table_logical_name, "field": field_name}
    if physical_table:
        ctx["ddb_table"] = physical_table
    return ctx


def _physical_table_name(table_logical_name: str) -> Optional[str]:
    """Resolve env DYNAMODB_TABLE_* for encryption context."""
    mapping = {
        "employees": "DYNAMODB_TABLE_EMPLOYEES",
        "users": "DYNAMODB_TABLE_USERS",
        "admin": "DYNAMODB_TABLE_ADMIN",
        "review": "DYNAMODB_TABLE_REVIEW",
        "reviewdraft": "DYNAMODB_TABLE_REVIEW_DRAFT",
        "reviewDraft": "DYNAMODB_TABLE_REVIEW_DRAFT",
        "clientsatisfaction": "DYNAMODB_TABLE_CLIENT_SATISFACTION",
        "clientSatisfaction": "DYNAMODB_TABLE_CLIENT_SATISFACTION",
        "clients": "DYNAMODB_TABLE_CLIENTS",
        "competencies": "DYNAMODB_TABLE_COMPETENCIES",
        "cycle": "DYNAMODB_TABLE_CYCLE",
        "engagementactivities": "DYNAMODB_TABLE_ENGAGEMENT_ACTIVITIES",
        "engagementActivities": "DYNAMODB_TABLE_ENGAGEMENT_ACTIVITIES",
        "resourcemappings": "DYNAMODB_TABLE_RESOURCE_MAPPINGS",
        "resourceMappings": "DYNAMODB_TABLE_RESOURCE_MAPPINGS",
        "revenueforecasts": "DYNAMODB_TABLE_REVENUE_FORECASTS",
        "revenueForecasts": "DYNAMODB_TABLE_REVENUE_FORECASTS",
        "goals": "DYNAMODB_TABLE_GOALS",
        "feedback": "DYNAMODB_TABLE_FEEDBACK",
        "recruitment": "DYNAMODB_TABLE_RECRUITMENT",
        "features": "DYNAMODB_TABLE_FEATURES",
    }
    env_key = mapping.get(table_logical_name)
    if not env_key:
        return None
    return (os.getenv(env_key) or "").strip() or None


def remove_field_names_for_delete(table_logical_name: Optional[str], field_name: str) -> List[str]:
    """Attribute name(s) to REMOVE in DynamoDB when clearing a field (plaintext vs *_enc)."""
    if not table_logical_name or not is_field_encryption_active():
        return [field_name]
    fields = ENCRYPTED_FIELDS_BY_TABLE.get(table_logical_name, [])
    if field_name in fields:
        return [f"{field_name}_enc"]
    return [field_name]


def _serialize_for_encryption(val: Any) -> bytes:
    """JSON wrapper preserves type round-trip (str, bool, dict, list, int, float)."""
    return json.dumps({"v": val}, default=str).encode("utf-8")


def _deserialize_after_decryption(plain: bytes) -> Any:
    s = plain.decode("utf-8")
    try:
        obj = json.loads(s)
        if isinstance(obj, dict) and "v" in obj:
            return obj["v"]
    except json.JSONDecodeError:
        pass
    return s


_cached_client = None
_cached_provider = None
_cached_kms_arn = None


def _get_client_and_provider():
    global _cached_client, _cached_provider, _cached_kms_arn
    kms_key_arn = _kms_key_arn()
    if _cached_client is not None and _cached_kms_arn == kms_key_arn:
        return _cached_client, _cached_provider

    import aws_encryption_sdk

    try:
        from aws_encryption_sdk.key_providers.kms import StrictAwsKmsMasterKeyProvider as _KmsKeyProvider
    except ImportError:  # pragma: no cover
        from aws_encryption_sdk.key_providers.kms import KMSMasterKeyProvider as _KmsKeyProvider

    try:
        from aws_encryption_sdk.identifiers import CommitmentPolicy
    except ImportError:  # pragma: no cover
        from aws_encryption_sdk import CommitmentPolicy  # type: ignore

    _cached_provider = _KmsKeyProvider(key_ids=[kms_key_arn])
    _cached_client = aws_encryption_sdk.EncryptionSDKClient(
        commitment_policy=CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT
    )
    _cached_kms_arn = kms_key_arn
    return _cached_client, _cached_provider


def _encrypt_bytes(plaintext: bytes, encryption_context: Dict[str, str]) -> str:
    client, key_provider = _get_client_and_provider()
    ciphertext, _ = client.encrypt(
        source=plaintext,
        key_provider=key_provider,
        encryption_context=encryption_context,
    )
    return base64.b64encode(ciphertext).decode("ascii")


def _decrypt_payload(ciphertext_blob: Any) -> bytes:
    """Decrypt AWS Encryption SDK message from base64 string (our write path) or raw bytes (e.g. Binary attr)."""
    client, key_provider = _get_client_and_provider()
    if isinstance(ciphertext_blob, (bytes, bytearray)):
        raw = bytes(ciphertext_blob)
    else:
        raw = base64.b64decode(str(ciphertext_blob).encode("ascii"))
    plaintext, _ = client.decrypt(source=raw, key_provider=key_provider)
    return plaintext


def encrypt_item_for_write(table_logical_name: str, formatted_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    After format_dynamodb_item: encrypt configured top-level fields to *_enc; remove plaintext keys.
    No-op if encryption inactive or no fields for this table.
    """
    _log_bootstrap_once()
    if not is_field_encryption_active():
        return formatted_item

    fields = ENCRYPTED_FIELDS_BY_TABLE.get(table_logical_name, [])
    if not fields:
        return formatted_item

    out = dict(formatted_item)
    physical = _physical_table_name(table_logical_name)

    for field in fields:
        if field not in out or out[field] is None:
            continue
        val = out[field]
        enc_key = f"{field}_enc"
        try:
            ctx = _encryption_context(table_logical_name, field, physical)
            payload = _serialize_for_encryption(val)
            out[enc_key] = _encrypt_bytes(payload, ctx)
            del out[field]
        except Exception as e:
            logger.exception("Field encryption failed for %s.%s: %s", table_logical_name, field, e)
            raise

    return out


def decrypt_item_after_read(table_logical_name: str, parsed_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    After parse_dynamodb_item: decrypt *_enc into plain field names when present.
    If only plaintext exists (legacy rows), leave unchanged.
    """
    _log_bootstrap_once()
    if not is_field_encryption_active():
        return parsed_item

    fields = ENCRYPTED_FIELDS_BY_TABLE.get(table_logical_name, [])
    if not fields:
        return parsed_item

    out = dict(parsed_item)

    for field in fields:
        enc_key = f"{field}_enc"
        if enc_key not in out or out[enc_key] is None:
            continue
        blob = out[enc_key]
        if not isinstance(blob, (str, bytes, bytearray)):
            continue
        try:
            plain = _decrypt_payload(blob)
            out[field] = _deserialize_after_decryption(plain)
            del out[enc_key]
        except Exception as e:
            logger.exception("Field decryption failed for %s.%s: %s", table_logical_name, field, e)
            raise

    return out


def describe_status() -> Dict[str, Any]:
    """Safe for /health (no secrets)."""
    _log_bootstrap_once()
    return {
        "active": is_field_encryption_active(),
        "enabled_flag": _env_bool("DYNAMODB_FIELD_ENCRYPTION_ENABLED", False),
        "kms_key_configured": bool(_kms_key_arn()),
        "tables_with_allowlist": [k for k, v in ENCRYPTED_FIELDS_BY_TABLE.items() if v],
    }
