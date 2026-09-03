"""
Runtime security configuration validation and helpers.

Call validate_security_at_startup() from FastAPI lifespan — fails fast in production-like
environments when secrets are missing or left at development defaults.
"""
from __future__ import annotations

import logging
import os
from typing import FrozenSet

logger = logging.getLogger(__name__)

DEFAULT_SECRET_PLACEHOLDER = "your-secret-key-for-development"


def get_jwt_secret_key() -> str:
    """JWT signing secret: SECURITY_SECRET_KEY env overrides config.yaml security.secret_key."""
    env_secret = (os.getenv("SECURITY_SECRET_KEY") or "").strip()
    if env_secret:
        return env_secret
    try:
        from .config import config

        return str(config.get("security.secret_key", DEFAULT_SECRET_PLACEHOLDER) or DEFAULT_SECRET_PLACEHOLDER)
    except Exception:
        return DEFAULT_SECRET_PLACEHOLDER

# Treat these as non-dev: must have strong secrets and no MSAL bypass
_PROD_LIKE: FrozenSet[str] = frozenset(
    {"production", "prod", "staging", "stage", "uat", "preprod", "preview"}
)


def _running_in_aws_runtime() -> bool:
    """True when code is likely running on ECS/Lambda (not a developer laptop)."""
    return bool(
        os.getenv("AWS_EXECUTION_ENV")
        or os.getenv("ECS_CONTAINER_METADATA_URI")
        or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
    )


def get_environment() -> str:
    """
    Explicit ENVIRONMENT is required for production/staging deploys.
    If unset: local dev defaults to 'development'; on AWS without ENVIRONMENT we assume production-like.
    """
    raw = os.getenv("ENVIRONMENT")
    if raw is not None and str(raw).strip():
        return str(raw).strip().lower()
    if _running_in_aws_runtime():
        return "production"
    return "development"


def is_production_like() -> bool:
    return get_environment() in _PROD_LIKE


def allow_unverified_msal_exchange() -> bool:
    """
    Only local development may skip JWKS validation. Never use 'dev' alone — staging
    teams sometimes set ENVIRONMENT=dev by mistake.
    """
    e = get_environment()
    return e in ("development", "local")


def debug_endpoints_enabled() -> bool:
    return (os.getenv("ENABLE_DEBUG_ENDPOINTS") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def validate_security_at_startup() -> None:
    """
    Raises RuntimeError if production-like settings are inconsistent.
    Set SKIP_SECURITY_STARTUP_CHECK=1 only for emergency local overrides (not in prod).
    """
    if (os.getenv("SKIP_SECURITY_STARTUP_CHECK") or "").strip().lower() in ("1", "true", "yes"):
        logger.warning("SKIP_SECURITY_STARTUP_CHECK is set — startup secret validation skipped")
        return

    secret = get_jwt_secret_key()

    tenant = (os.getenv("AZURE_MSAL_TENANT_ID") or "").strip().strip('"').strip("'")
    client = (os.getenv("AZURE_MSAL_CLIENT_ID") or "").strip().strip('"').strip("'")

    if is_production_like():
        weak = (
            not secret
            or secret == DEFAULT_SECRET_PLACEHOLDER
            or len(secret) < 32
            or "your-secret-key" in secret.lower()
            or "replace-in-production" in secret.lower()
        )
        if weak:
            raise RuntimeError(
                "SECURITY: In production/staging, set a strong SECURITY_SECRET_KEY or "
                "security.secret_key (32+ random bytes, not a template placeholder)."
            )
        if not tenant or not client:
            raise RuntimeError(
                "SECURITY: AZURE_MSAL_TENANT_ID and AZURE_MSAL_CLIENT_ID are required in production-like environments."
            )
        if allow_unverified_msal_exchange():
            raise RuntimeError(
                "SECURITY: ENVIRONMENT must not be 'development' or 'local' in production/staging "
                "(unverified MSAL exchange would be allowed)."
            )
        logger.info("Security startup check passed (production-like environment)")
    else:
        if secret == DEFAULT_SECRET_PLACEHOLDER:
            logger.warning(
                "SECURITY: Using default JWT secret — acceptable for local dev only; never deploy this to prod."
            )
        if allow_unverified_msal_exchange():
            logger.warning(
                "SECURITY: Unverified MSAL token exchange is allowed (development/local only)."
            )
