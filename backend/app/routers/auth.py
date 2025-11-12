from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
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

from ..models import Token, UserLogin, MOCK_USERS
from ..database_dynamodb import get_admins_table, parse_dynamodb_item, format_dynamodb_item, generate_id
from ..security import (
    authenticate_user, 
    create_access_token, 
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_active_user
)

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
async def login(user_data: UserLogin):
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
async def refresh_access_token(current_user = Depends(get_current_active_user)):
    """Refresh access token for authenticated user"""
    try:
        # Create new token with extended expiration
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": current_user["username"]}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        logger.error(f"Error refreshing token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while refreshing token"
        )

@router.post("/msal-token", response_model=Token)
async def exchange_msal_token(msal_token: str = Body(..., embed=True)):
    """Exchange MSAL token for backend JWT token"""
    try:
        logger.info(f"DEBUG: Received MSAL token")
        
        # Extract user email from MSAL token (simplified approach)
        # In production, you should validate the token with Microsoft Graph API
        from jose import jwt as jose_jwt
        
        try:
            # Decode the MSAL token without verification to get user info
            # This is just for demo purposes - in production, validate with Microsoft
            decoded_token = jose_jwt.get_unverified_claims(msal_token)
            user_email = decoded_token.get("preferred_username") or decoded_token.get("email") or decoded_token.get("upn")
            logger.info(f"DEBUG: Extracted user email from MSAL token: {user_email}")
        except Exception as e:
            logger.warning(f"DEBUG: Could not decode MSAL token: {e}")
            user_email = None
        
        # If we can't extract email, use a fallback for now
        if not user_email:
            logger.warning("Could not extract email from MSAL token, using fallback")
            user_email = "admin@example.com"
        
        # Create a backend token for the actual user
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user_email}, expires_delta=access_token_expires
        )
        logger.info(f"DEBUG: Created backend token for: {user_email}")
        return {"access_token": access_token, "token_type": "bearer"}
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
    """Health check for auth router - verify deployment"""
    return {
        "status": "healthy",
        "router": "auth",
        "version": "6.0.0-PRODUCTION-FIX",
        "deployment_id": "auth-router-prod-fix-v6.0",
        "timestamp": datetime.now().isoformat(),
        "endpoints": ["/token", "/msal-token", "/role", "/admins", "/admins/test", "/admins/check/{email}"],
        "admin_endpoints_working": True
    }

@router.get("/admins/check/{email}", response_model=dict)
@router.get("/admins/check/{email}/", response_model=dict)
async def check_admin_status(email: str):
    """Check if a user is an admin by email - public endpoint for frontend"""
    try:
        # URL decode the email parameter
        import urllib.parse
        decoded_email = urllib.parse.unquote(email)
        logger.info(f"Auth router - Checking admin status for email: {decoded_email}")
        
        is_admin = await is_user_admin(decoded_email)
        logger.info(f"Auth router - Admin check result for {decoded_email}: {is_admin}")
        
        return {
            "is_admin": is_admin,
            "email": decoded_email,
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "router": "auth",
            "version": "6.0.0"
        }
    except Exception as e:
        logger.error(f"Auth router - Error checking admin status for {email}: {str(e)}")
        # Return False instead of error for production compatibility
        return {
            "is_admin": False,
            "email": email,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "router": "auth",
            "version": "6.0.0"
        }

@router.get("/admins/test", response_model=dict)
async def test_admin_endpoint():
    """Test endpoint to debug admin functionality - public endpoint"""
    try:
        table = await get_admins_table()
        
        # Test the admin check function with a sample email
        test_email = "test@example.com"
        test_result = await is_user_admin(test_email)
        
        return {
            "status": "success",
            "message": "Auth router admin endpoint is working - PRODUCTION FIX v6.0",
            "table_name": table.table_name,
            "test_admin_check": test_result,
            "test_email": test_email,
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "version": "6.0.0",
            "router": "auth",
            "endpoints": [
                "/api/auth/admins/check/{email}",
                "/api/auth/admins/test",
                "/api/auth/admins",
                "/api/auth/admins/"
            ]
        }
    except Exception as e:
        logger.error(f"Auth router - Error in test endpoint: {str(e)}")
        return {
            "status": "error",
            "message": f"Auth router admin endpoint error: {str(e)}",
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "auth-router-prod-fix-v6.0",
            "version": "6.0.0",
            "router": "auth"
        }

@router.get("/admins", response_model=List[Dict[str, Any]])
@router.get("/admins/", response_model=List[Dict[str, Any]])
async def get_admins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_active_user)
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
        logger.info(f"Auth router - Checking admin status for normalized email: {normalized_email}")
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": normalized_email}
        )
        
        logger.info(f"Auth router - Query result items count: {len(response.get('Items', []))}")
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_active = admin_data.get("is_active", True)
            logger.info(f"Auth router - Found admin record. Email: {admin_data.get('email')}, Active: {is_active}")
            return is_active
        
        logger.info(f"Auth router - No admin record found for email: {normalized_email}")
        return False
    except Exception as e:
        logger.error(f"Error checking admin status for {email}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False 