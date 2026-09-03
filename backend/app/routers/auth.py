from fastapi import APIRouter, Depends, HTTPException, status, Body, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from typing import Union, List, Dict, Any
try:
    from typing import Annotated
except ImportError:
    # For Python < 3.9 compatibility
    from typing_extensions import Annotated
from datetime import timedelta, datetime
import logging
import traceback
from decimal import Decimal
import os
from jose import jwt as jose_jwt

from ..models import Token, UserLogin, MOCK_USERS
from ..database_dynamodb import get_admins_table, parse_dynamodb_item, format_dynamodb_item, generate_id
from ..security import (
    authenticate_user,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_active_user,
    get_current_user,
    jwks_validator,
    require_admin_user,
    oauth2_scheme,
    SECRET_KEY,
    ALGORITHM,
)
from ..security_config import allow_unverified_msal_exchange, debug_endpoints_enabled
from ..rate_limit import limiter

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/auth",
    tags=["authentication"]
)

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
):
    """Login endpoint that accepts form data"""
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
@limiter.limit("30/minute")
async def login(request: Request, user_data: UserLogin):
    """Login endpoint that accepts JSON"""
    try:
        user = authenticate_user(user_data.username, user_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["username"]}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        logger.error(f"Error during login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        )

@router.post("/refresh-token", response_model=Token)
@limiter.limit("60/minute")
async def refresh_access_token(
    request: Request,
    token: str = Depends(oauth2_scheme),
):
    """Refresh access token for authenticated user (supports expired tokens)"""
    try:
        # Decode but explicitly IGNORE expiration to allow refresh of expired tokens
        payload = jose_jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False}
        )
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")
            
        import time
        current_time = int(time.time())
        
        # 1. Enforce strict 15-minute refresh window
        exp_timestamp = payload.get("exp")
        if not exp_timestamp:
            raise HTTPException(status_code=401, detail="Invalid token payload: missing exp")
            
        time_since_expired = current_time - exp_timestamp
        if time_since_expired > (15 * 60):
            raise HTTPException(
                status_code=401, 
                detail="Refresh window exceeded. Session is permanently expired."
            )
            
        # 2. Enforce Absolute session lifetime (1 hour max from initial MSAL login)
        iat_timestamp = payload.get("iat")
        if iat_timestamp:
            session_age = current_time - iat_timestamp
            if session_age > (60 * 60):
                raise HTTPException(
                    status_code=401,
                    detail="Absolute session lifetime exceeded. Please securely re-authenticate."
                )
        else:
            # Fallback for old tokens missing iat
            iat_timestamp = current_time
            
        # Create new token with extended expiration, preserving the original iat
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username, "iat": iat_timestamp}, 
            expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature"
        )

@router.post("/msal-token", response_model=Token)
@limiter.limit("45/minute")
async def exchange_msal_token(
    request: Request,
    msal_token: str = Body(..., embed=True),
):
    """Exchange MSAL token for backend JWT token.

    In production: validate the MSAL token using JWKS and enforce issuer/audience.
    In development (ENVIRONMENT=development): skip JWKS signature validation and
    decode unverified claims so local logins work even without outbound access
    to Microsoft JWKS. This should never be enabled in production.
    """
    try:
        logger.info("Received MSAL token for exchange")
        
        tenant_id = (os.getenv("AZURE_MSAL_TENANT_ID") or "").strip().strip('"').strip("'")
        client_id = (os.getenv("AZURE_MSAL_CLIENT_ID") or "").strip().strip('"').strip("'")

        if not tenant_id or not client_id:
            logger.error("AZURE_MSAL_TENANT_ID or AZURE_MSAL_CLIENT_ID not configured")
            raise HTTPException(status_code=500, detail="SSO Configuration error")

        if allow_unverified_msal_exchange():
            try:
                logger.warning("Unverified MSAL token exchange enabled (development/local only)")
                payload = jose_jwt.get_unverified_claims(msal_token)
            except Exception as e:
                logger.error("Failed to decode unverified MSAL token claims: %s", e)
                raise HTTPException(status_code=401, detail="Invalid MSAL token")
        else:
            # Production/staging: validate via JWKS
            payload = jwks_validator.validate_token(msal_token, tenant_id, client_id)
            if not payload:
                logger.warning("Token validation failed via JWKS validator")
                raise HTTPException(status_code=401, detail="Invalid MSAL token")

        user_email = payload.get("preferred_username") or payload.get("email") or payload.get("upn")
        if not user_email:
            logger.error("Could not extract email from MSAL token payload")
            raise HTTPException(status_code=401, detail="Could not identify user from token")
        
        # Create a backend token for the actual user
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user_email}, expires_delta=access_token_expires
        )
        logger.debug("Issued backend JWT after MSAL exchange")
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exchanging MSAL token: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MSAL token"
        )

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_active_user)):
    """Get current authenticated user information"""
    role = "admin" if current_user.get("is_admin") else "user"
    return {
        "role": role,
        "employeeId": current_user.get("id", "1"),
        "name": current_user.get("full_name", "User"),
        "email": current_user.get("email", current_user.get("username", "user@example.com"))
    }

# Admin endpoints - added to auth router for production compatibility
@router.get("/health", response_model=dict)
async def auth_health_check():
    """Minimal auth router health (no internal path enumeration)."""
    if debug_endpoints_enabled():
        return {
            "status": "healthy",
            "router": "auth",
            "timestamp": datetime.now().isoformat(),
        }
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


def _normalize_email(s: str) -> str:
    import urllib.parse

    return urllib.parse.unquote(s).lower().strip()


@router.get("/admins/check/{email}", response_model=dict)
@router.get("/admins/check/{email}/", response_model=dict)
async def check_admin_status(
    email: str,
    current_user: dict = Depends(get_current_user),
):
    """Check admin status for the authenticated user only (path email must match JWT subject)."""
    decoded = _normalize_email(email)
    subject = (current_user.get("email") or current_user.get("username") or "").lower().strip()
    if not subject or subject != decoded:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin status can only be checked for the signed-in user",
        )
    try:
        is_admin = await is_user_admin(decoded)
        return {
            "is_admin": is_admin,
            "email": decoded,
            "timestamp": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Auth router admin check failed: %s", e)
        raise HTTPException(status_code=500, detail="Admin check failed")


@router.get("/admins/test", response_model=dict)
async def test_admin_endpoint(_: dict = Depends(get_current_user)):
    """Debug-only: requires auth. Enable with ENABLE_DEBUG_ENDPOINTS=1."""
    if not debug_endpoints_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        test_email = "test@example.com"
        test_result = await is_user_admin(test_email)
        return {
            "status": "success",
            "test_admin_check": test_result,
            "test_email": test_email,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error("Auth router test endpoint: %s", e)
        raise HTTPException(status_code=500, detail="Test failed")

@router.get("/admins", response_model=List[Dict[str, Any]])
@router.get("/admins/", response_model=List[Dict[str, Any]])
async def get_admins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(require_admin_user),
):
    """Get all admins - simplified version without Pydantic models"""
    logger.info(f"Auth router - get_admins called with skip={skip}, limit={limit}")
    
    try:
        table = await get_admins_table()
        logger.info(f"Auth router - Got admins table: {table.table_name}")
        
        # Ensure limit is an integer
        if hasattr(limit, 'default'):
            limit = limit.default
        elif not isinstance(limit, int):
            limit = 100
            
        # Scan the table with pagination
        response = await table.scan(Limit=limit)
        logger.info(f"Auth router - Scan response count: {len(response.get('Items', []))}")
        
        admins = []
        for item in response.get("Items", []):
            # Convert datetime objects to strings manually
            parsed_item = {}
            for key, value in item.items():
                if isinstance(value, datetime):
                    parsed_item[key] = value.isoformat()
                elif isinstance(value, Decimal):
                    parsed_item[key] = float(value)
                else:
                    parsed_item[key] = value
            
            admins.append(parsed_item)
        
        logger.info(f"Auth router - Returning {len(admins)} admins")
        return {
            "admins": admins,
            "count": len(admins),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "router": "auth",
            "version": "6.0.0"
        }
    except Exception as e:
        logger.error(f"Auth router - Error fetching admins: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Return empty list instead of error for production compatibility
        return {
            "admins": [],
            "count": 0,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "router": "auth",
            "version": "6.0.0"
        }

# Helper function for admin status check
async def is_user_admin(email: str) -> bool:
    """Check if a user is an admin by email - case insensitive"""
    try:
        table = await get_admins_table()
        
        # Normalize email to lowercase for consistent comparison
        normalized_email = email.lower().strip()
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": normalized_email}
        )
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_active = admin_data.get("is_active", True)
            logger.debug("Auth router admin lookup: found record, active=%s", is_active)
            return is_active
        logger.debug("Auth router admin lookup: no record for email")
        return False
    except Exception as e:
        logger.error(f"Error checking admin status for {email}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False 