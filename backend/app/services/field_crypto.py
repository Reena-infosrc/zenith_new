"""
DynamoDB field-level encryption: AES-256-GCM + AWS KMS envelope encryption.

Staging / safe default: DYNAMODB_FIELD_ENCRYPTION_ENABLED=false → no-op.
When enabled: only fields listed in ENCRYPTED_FIELDS_BY_TABLE are transformed
(plaintext attribute -> *_enc ciphertext); decrypt merges *_enc back on read.

Cleartext keys include partition/sort keys and GSI attributes (email, reporting_to,
reviewId, cycleYear, …). Do not list those in ENCRYPTED_FIELDS_BY_TABLE.

Legacy: items encrypted with AWS Encryption SDK (base64 blob, not JSON) are still
decrypted when aws-encryption-sdk is installed, until data is backfilled to the new format.
"""

from __future__ import annotations

import base64
import contextvars
import json
import logging
import os
import zlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_STATUS_LOGGED = False

# Per logical DynamoDB table key (see database_dynamodb.DynamoDBService.tables).
ENCRYPTED_FIELDS_BY_TABLE: Dict[str, List[str]] = {
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
    "clientRmFeedback": [
        # client_manager_email kept plaintext (lookup / UX); encrypt narrative + scores
        "ratings",
        "additional_feedback",
        "overall_satisfaction",
    ],
}

AAD_SCHEMA_V1 = 1
ALG_AES256GCM = "AES-256-GCM"
GCM_NONCE_LEN = 12

# Request-scoped cache: (kms_arn, crypto_version) -> (plaintext_dek_bytes, encrypted_dek_blob)
_dek_request_cache: contextvars.ContextVar[Optional[Dict[Tuple[str, str], Tuple[bytes, bytes]]]] = (
    contextvars.ContextVar("field_crypto_dek_cache", default=None)
)


def _get_dek_cache() -> Dict[Tuple[str, str], Tuple[bytes, bytes]]:
    cache = _dek_request_cache.get()
    if cache is None:
        cache = {}
        _dek_request_cache.set(cache)
    return cache


def clear_dek_request_cache() -> None:
    """Clear per-request DEK cache (e.g. after batch or for tests)."""
    _dek_request_cache.set(None)


def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def _kms_key_arn_for_version(crypto_version: str) -> str:
    """CMK ARN for encrypt/decrypt of this crypto version (v2 can use a dedicated CMK)."""
    if crypto_version == "v2":
        v2 = (os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2") or "").strip()
        if v2:
            return v2
    return (os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN") or "").strip()


def _active_crypto_version() -> str:
    v = (os.getenv("DYNAMODB_FIELD_ENCRYPTION_VERSION") or "v1").strip().lower()
    return v if v in ("v1", "v2") else "v1"


def _app_context() -> Dict[str, str]:
    return {
        "app": (os.getenv("DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP") or os.getenv("SERVICE_NAME") or "zenith-hr-pulse"),
        "stage": (os.getenv("STAGE") or "unknown"),
    }


def _compress_before_encrypt() -> bool:
    return _env_bool("DYNAMODB_FIELD_ENCRYPTION_COMPRESS", False)


def is_field_encryption_active() -> bool:
    if not _env_bool("DYNAMODB_FIELD_ENCRYPTION_ENABLED", False):
        return False
    if not _kms_key_arn_for_version(_active_crypto_version()):
        logger.warning(
            "DYNAMODB_FIELD_ENCRYPTION_ENABLED is true but KMS key ARN is missing for version %s; "
            "field encryption inactive.",
            _active_crypto_version(),
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
        "Field encryption bootstrap: enabled_flag=%s, kms_v1=%s, kms_v2=%s, version=%s, alg=%s",
        _env_bool("DYNAMODB_FIELD_ENCRYPTION_ENABLED", False),
        bool((os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN") or "").strip()),
        bool((os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2") or "").strip()),
        _active_crypto_version(),
        ALG_AES256GCM,
    )


def _physical_table_name(table_logical_name: str) -> Optional[str]:
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
        "clientRmFeedback": "DYNAMODB_TABLE_CLIENT_RM_FEEDBACK",
        "leadershipAccess": "DYNAMODB_TABLE_LEADERSHIP_ACCESS",
        "monthlyFeedbackPeriods": "DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS",
    }
    env_key = mapping.get(table_logical_name)
    if not env_key:
        return None
    return (os.getenv(env_key) or "").strip() or None


def remove_field_names_for_delete(table_logical_name: Optional[str], field_name: str) -> List[str]:
    if not table_logical_name or not is_field_encryption_active():
        return [field_name]
    fields = ENCRYPTED_FIELDS_BY_TABLE.get(table_logical_name, [])
    if field_name in fields:
        return [f"{field_name}_enc"]
    return [field_name]


def _serialize_for_encryption(val: Any) -> bytes:
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


def _item_identity_for_aad(table_logical_name: str, item: Dict[str, Any]) -> Dict[str, Any]:
    """Stable identity for AAD (must not include encrypting field value)."""
    if table_logical_name in ("review", "reviewDraft"):
        return {
            "pk": str(item.get("pk") or ""),
            "sk": str(item.get("sk") or ""),
        }
    if table_logical_name == "monthlyFeedbackPeriods":
        return {"period_id": str(item.get("period_id") or "")}
    # Default: single-partition-key tables (id)
    return {"id": str(item.get("id") or item.get("period_id") or "")}


def _build_aad_bytes(
    *,
    aad_schema: int,
    logical_table: str,
    field: str,
    identity: Dict[str, Any],
    crypto_version: str,
) -> bytes:
    payload = {
        "s": aad_schema,
        "t": logical_table,
        "f": field,
        "i": identity,
        "cv": crypto_version,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _kms_client():
    import boto3

    region = (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1").strip()
    return boto3.client("kms", region_name=region)


def _generate_data_key(kms_arn: str) -> Tuple[bytes, bytes]:
    """Returns (plaintext_dek_32_bytes, ciphertext_blob)."""
    kms = _kms_client()
    resp = kms.generate_data_key(KeyId=kms_arn, KeySpec="AES_256")
    pt = resp["Plaintext"]
    ct = resp["CiphertextBlob"]
    if not isinstance(pt, (bytes, bytearray)) or len(pt) != 32:
        raise RuntimeError("KMS GenerateDataKey returned unexpected plaintext length")
    return bytes(pt), bytes(ct)


def _decrypt_data_key(encrypted_dek: bytes) -> bytes:
    kms = _kms_client()
    resp = kms.decrypt(CiphertextBlob=encrypted_dek)
    pt = resp["Plaintext"]
    if not isinstance(pt, (bytes, bytearray)):
        raise RuntimeError("KMS decrypt returned no Plaintext")
    return bytes(pt)


def _get_or_create_dek_for_encrypt(kms_arn: str, crypto_version: str) -> Tuple[bytes, bytes]:
    cache = _get_dek_cache()
    key = (kms_arn, crypto_version)
    if key in cache:
        return cache[key]
    pt, ct = _generate_data_key(kms_arn)
    cache[key] = (pt, ct)
    return pt, ct


def _encrypt_payload_aes_gcm(
    plaintext: bytes,
    aad: bytes,
    dek: bytes,
) -> Tuple[bytes, bytes]:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(GCM_NONCE_LEN)
    aesgcm = AESGCM(dek)
    ct = aesgcm.encrypt(nonce, plaintext, aad)
    return nonce, ct


def _decrypt_payload_aes_gcm(ciphertext: bytes, nonce: bytes, aad: bytes, dek: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    aesgcm = AESGCM(dek)
    return aesgcm.decrypt(nonce, ciphertext, aad)


def _encrypt_field_to_payload(
    *,
    table_logical_name: str,
    field_name: str,
    value: Any,
    item_for_identity: Dict[str, Any],
    crypto_version: str,
) -> str:
    kms_arn = _kms_key_arn_for_version(crypto_version)
    if not kms_arn:
        raise RuntimeError(f"No KMS key ARN configured for crypto version {crypto_version}")

    identity = _item_identity_for_aad(table_logical_name, item_for_identity)
    aad = _build_aad_bytes(
        aad_schema=AAD_SCHEMA_V1,
        logical_table=table_logical_name,
        field=field_name,
        identity=identity,
        crypto_version=crypto_version,
    )

    payload_bytes = _serialize_for_encryption(value)
    if _compress_before_encrypt() and len(payload_bytes) > 256:
        payload_bytes = b"\x01" + zlib.compress(payload_bytes, level=6)
    else:
        payload_bytes = b"\x00" + payload_bytes

    dek, edk = _get_or_create_dek_for_encrypt(kms_arn, crypto_version)
    nonce, ct = _encrypt_payload_aes_gcm(payload_bytes, aad, dek)

    envelope = {
        "v": crypto_version,
        "alg": ALG_AES256GCM,
        "aad_s": AAD_SCHEMA_V1,
        "iv": base64.b64encode(nonce).decode("ascii"),
        "ct": base64.b64encode(ct).decode("ascii"),
        "edk": base64.b64encode(edk).decode("ascii"),
        "kms_key_arn": kms_arn,
        "encrypted_at": datetime.now(timezone.utc).isoformat(),
        "encrypted_by_service": (os.getenv("SERVICE_NAME") or "zenith-hr-pulse"),
        "key_version": crypto_version,
    }
    return json.dumps(envelope, separators=(",", ":"))


def _try_decrypt_legacy_esdk(ciphertext_b64: str) -> Optional[bytes]:
    """Decrypt AWS Encryption SDK message if dependency present."""
    try:
        import aws_encryption_sdk

        try:
            from aws_encryption_sdk.key_providers.kms import StrictAwsKmsMasterKeyProvider as _KmsKeyProvider
        except ImportError:
            from aws_encryption_sdk.key_providers.kms import KMSMasterKeyProvider as _KmsKeyProvider
    except ImportError:
        return None

    kms_arn = (os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN") or "").strip()
    if not kms_arn:
        return None
    try:
        from aws_encryption_sdk.identifiers import CommitmentPolicy
    except ImportError:
        from aws_encryption_sdk import CommitmentPolicy  # type: ignore

    try:
        provider = _KmsKeyProvider(key_ids=[kms_arn])
        client = aws_encryption_sdk.EncryptionSDKClient(
            commitment_policy=CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT
        )
        raw = base64.b64decode(str(ciphertext_b64).encode("ascii"))
        plain, _ = client.decrypt(source=raw, key_provider=provider)
        return plain
    except Exception as e:
        logger.warning("Legacy ESDK decrypt failed: %s", e)
        return None


def _decrypt_new_format_payload(
    blob: str,
    *,
    table_logical_name: str,
    field_name: str,
    parsed_item: Dict[str, Any],
) -> bytes:
    env = json.loads(blob)
    if env.get("alg") != ALG_AES256GCM:
        raise ValueError(f"Unsupported alg: {env.get('alg')}")

    crypto_version = str(env.get("key_version") or env.get("v") or "v1")
    nonce = base64.b64decode(str(env["iv"]))
    ct = base64.b64decode(str(env["ct"]))
    edk = base64.b64decode(str(env["edk"]))

    dek = _decrypt_data_key(edk)

    identity = _item_identity_for_aad(table_logical_name, parsed_item)
    aad = _build_aad_bytes(
        aad_schema=int(env.get("aad_s") or AAD_SCHEMA_V1),
        logical_table=table_logical_name,
        field=field_name,
        identity=identity,
        crypto_version=crypto_version,
    )
    return _decrypt_payload_aes_gcm(ct, nonce, aad, dek)


def _strip_compression_prefix(plain: bytes) -> bytes:
    inner = plain
    if isinstance(inner, bytes) and len(inner) > 0:
        if inner[0:1] == b"\x01":
            inner = zlib.decompress(inner[1:])
        elif inner[0:1] == b"\x00":
            inner = inner[1:]
    return inner


def _decrypt_field_blob_to_value(
    blob_str: str,
    *,
    table_logical_name: str,
    field_name: str,
    parsed_item: Dict[str, Any],
) -> Any:
    """Decrypt a single *_enc attribute to the original Python value (used by API read + rotation)."""
    if _is_probably_json_envelope(blob_str):
        env = json.loads(blob_str)
        if env.get("alg") == ALG_AES256GCM:
            plain = _decrypt_new_format_payload(
                blob_str,
                table_logical_name=table_logical_name,
                field_name=field_name,
                parsed_item=parsed_item,
            )
        else:
            raise ValueError(f"Unknown JSON envelope alg={env.get('alg')}")
    else:
        plain = _try_decrypt_legacy_esdk(blob_str)
        if plain is None:
            raise RuntimeError(
                "Legacy ciphertext but aws-encryption-sdk not available or decrypt failed; "
                "install aws-encryption-sdk or backfill rows to the new format."
            )
    inner = _strip_compression_prefix(plain)
    return _deserialize_after_decryption(inner)


def re_encrypt_field_blob(
    old_blob: str,
    *,
    table_logical_name: str,
    field_name: str,
    parsed_item: Dict[str, Any],
    new_crypto_version: str,
) -> str:
    """
    Decrypt an existing *_enc value and re-encrypt with ``new_crypto_version`` (and its KMS ARN mapping).

    Used by rotation scripts (e.g. v1 -> v2). Caller should ``put_item`` the row with updated *_enc strings.
    """
    val = _decrypt_field_blob_to_value(
        old_blob if isinstance(old_blob, str) else old_blob.decode("utf-8"),
        table_logical_name=table_logical_name,
        field_name=field_name,
        parsed_item=parsed_item,
    )
    return _encrypt_field_to_payload(
        table_logical_name=table_logical_name,
        field_name=field_name,
        value=val,
        item_for_identity=parsed_item,
        crypto_version=new_crypto_version,
    )


def _is_probably_json_envelope(s: str) -> bool:
    t = (s or "").lstrip()
    return len(t) > 0 and t[0] == "{"


def encrypt_item_for_write(table_logical_name: str, formatted_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    After format_dynamodb_item: encrypt configured top-level fields to *_enc; remove plaintext keys.
    """
    _log_bootstrap_once()
    if not is_field_encryption_active():
        return formatted_item

    fields = ENCRYPTED_FIELDS_BY_TABLE.get(table_logical_name, [])
    if not fields:
        return formatted_item

    crypto_version = _active_crypto_version()
    out = dict(formatted_item)

    for field in fields:
        if field not in out or out[field] is None:
            continue
        val = out[field]
        enc_key = f"{field}_enc"
        try:
            out[enc_key] = _encrypt_field_to_payload(
                table_logical_name=table_logical_name,
                field_name=field,
                value=val,
                item_for_identity=out,
                crypto_version=crypto_version,
            )
            del out[field]
        except Exception as e:
            logger.exception("Field encryption failed for %s.%s: %s", table_logical_name, field, e)
            raise

    return out


def decrypt_item_after_read(table_logical_name: str, parsed_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    After parse_dynamodb_item: decrypt *_enc into plain field names when present.
    Legacy AWS Encryption SDK blobs are supported if aws-encryption-sdk is installed.
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
        blob_str = blob.decode("utf-8") if isinstance(blob, (bytes, bytearray)) else str(blob)

        try:
            out[field] = _decrypt_field_blob_to_value(
                blob_str,
                table_logical_name=table_logical_name,
                field_name=field,
                parsed_item=out,
            )
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
        "kms_key_configured": bool((os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN") or "").strip()),
        "kms_v2_key_configured": bool((os.getenv("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2") or "").strip()),
        "crypto_version": _active_crypto_version(),
        "algorithm": ALG_AES256GCM,
        "tables_with_allowlist": [k for k, v in ENCRYPTED_FIELDS_BY_TABLE.items() if v],
        "compress": _compress_before_encrypt(),
    }
