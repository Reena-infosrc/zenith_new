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
        print(f"DEBUG: Received MSAL token: {msal_token[:20]}...")
        
        # For now, we'll create a token for the actual logged-in user
        # In a real implementation, you would validate the MSAL token with Microsoft
        # and extract user information from it
        
        # Extract user email from MSAL token (simplified approach)
        # In production, you should validate the token with Microsoft Graph API
        import jwt as pyjwt
        
        try:
            # Decode the MSAL token without verification to get user info
            # This is just for demo purposes - in production, validate with Microsoft
            decoded_token = pyjwt.decode(msal_token, options={"verify_signature": False})
            user_email = decoded_token.get("preferred_username") or decoded_token.get("email") or decoded_token.get("upn")
            print(f"DEBUG: Extracted user email from MSAL token: {user_email}")
        except Exception as e:
            print(f"DEBUG: Could not decode MSAL token: {e}")
            user_email = "admin@example.com"  # Fallback
        
        # Create a backend token for the actual user
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user_email}, expires_delta=access_token_expires
        )
        print(f"DEBUG: Created backend token for: {user_email}")
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        logger.error(f"Error exchanging MSAL token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MSAL token"
        )

@router.get("/me")
async def get_me(email: str = None):
    # For demo: allow public access and select user by email param
    user = None
    if email and email in MOCK_USERS:
        user = MOCK_USERS[email]
    else:
        user = MOCK_USERS["admin@example.com"]
    role = "admin" if user.get("is_admin") else "user"
    return {
        "role": role,
        "employeeId": user.get("id", "1"),
        "name": user.get("full_name", "User"),
        "email": user.get("email", "user@example.com")
    }

# Admin endpoints - added to auth router for production compatibility
@router.get("/health", response_model=dict)
async def auth_health_check():
    """Health check for auth router - verify deployment"""
    return {
        "status": "healthy",
        "router": "auth",
        "version": "2.0.0",
        "deployment_id": "0af32bf-auth-router-admin",
        "timestamp": datetime.now().isoformat(),
        "endpoints": ["/token", "/msal-token", "/role", "/admins", "/admins/test", "/admins/check/{email}"]
    }

@router.get("/admins/check/{email}", response_model=dict)
async def check_admin_status(email: str):
    """Check if a user is an admin by email - public endpoint for frontend"""
    try:
        is_admin = await is_user_admin(email)
        return {"is_admin": is_admin}
    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        # Return False instead of error for production compatibility
        return {"is_admin": False}

@router.get("/admins/test", response_model=dict)
async def test_admin_endpoint():
    """Test endpoint to debug admin functionality - public endpoint"""
    try:
        table = await get_admins_table()
        return {
            "status": "success",
            "message": "Admin endpoint is working - DEPLOYMENT TEST v2.0",
            "table_name": table.table_name,
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "0af32bf-auth-router-admin",
            "version": "2.0.0"
        }
    except Exception as e:
        logger.error(f"Error in test endpoint: {str(e)}")
        return {
            "status": "error",
            "message": f"Admin endpoint error: {str(e)}",
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "0af32bf-auth-router-admin",
            "version": "2.0.0"
        }

@router.get("/admins", response_model=List[Dict[str, Any]])
async def get_admins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """Get all admins - simplified version without Pydantic models"""
    print(f"DEBUG: get_admins called")
    
    try:
        table = await get_admins_table()
        print(f"DEBUG: Got admins table: {table}")
        
        # Scan the table with pagination
        response = await table.scan(Limit=limit)
        print(f"DEBUG: Scan response: {response}")
        
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
            
            print(f"DEBUG: Parsed item: {parsed_item}")
            admins.append(parsed_item)
        
        print(f"DEBUG: Returning {len(admins)} admins")
        return admins
    except Exception as e:
        print(f"DEBUG: Error in get_admins: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error fetching admins: {str(e)}")
        
        # Return empty list instead of error for production compatibility
        print(f"DEBUG: Returning empty list due to error")
        return []

# Helper function for admin status check
async def is_user_admin(email: str) -> bool:
    """Check if a user is an admin by email"""
    try:
        table = await get_admins_table()
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": email}
        )
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            return admin_data.get("is_active", True)
        
        return False
    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        return False 