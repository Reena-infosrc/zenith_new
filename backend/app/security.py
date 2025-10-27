from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import logging

from .models import TokenData, MOCK_USERS
from .config import config

# Configure logger
logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = config.get("security.secret_key", "your-secret-key-for-development")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours for development

# Update CryptContext configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Explicitly set rounds
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate password hash with proper length handling for bcrypt."""
    # Ensure we're working with a string
    password_str = str(password)
    
    # Convert to bytes and truncate to 72 bytes if necessary
    password_bytes = password_str.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        password_str = password_bytes.decode('utf-8', errors='ignore')
    
    return pwd_context.hash(password_str)

def get_user(username: str) -> Optional[dict]:
    """Get user from database."""
    if username in MOCK_USERS:
        user_dict = MOCK_USERS[username]
        return user_dict
    
    # For real users (not in mock users), create a basic user object
    # This allows any authenticated user to access the system
    if "@" in username:  # Assume it's an email
        return {
            "id": username,
            "username": username,
            "email": username,
            "full_name": username.split("@")[0].replace(".", " ").title(),
            "hashed_password": "not_used_for_msal_users",
            "is_active": True,
            "is_admin": False  # Will be updated by get_current_active_user
        }
    
    return None

def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Authenticate a user."""
    user = get_user(username)
    if not user:
        return None
    try:
        if not verify_password(password, user["hashed_password"]):
            return None
        return user
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current user from token."""
    print(f"DEBUG: Received token: {token[:20]}..." if token else "DEBUG: No token received")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # First, decode without verification to check the algorithm
        unverified_header = jwt.get_unverified_header(token)
        print(f"DEBUG: Token algorithm: {unverified_header.get('alg')}")
        
        # Decode token with verification - use HS256 only (RS256 requires PEM keys)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        print(f"DEBUG: Decoded username: {username}")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError as e:
        print(f"DEBUG: JWT decode error: {str(e)}")
        raise credentials_exception
    user = get_user(username=token_data.username)
    print(f"DEBUG: Found user: {user is not None}")
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current active user."""
    if not current_user["is_active"]:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Check if user is admin by email - avoid circular import
    try:
        # Import here to avoid circular import
        from .database_dynamodb import get_admins_table, parse_dynamodb_item
        
        user_email = current_user.get("email") or current_user.get("username")
        if user_email:
            table = await get_admins_table()
            response = await table.query(
                IndexName="EmailIndex",
                KeyConditionExpression="email = :email",
                ExpressionAttributeValues={":email": user_email}
            )
            
            if response.get("Items"):
                admin_data = parse_dynamodb_item(response["Items"][0])
                current_user["is_admin"] = admin_data.get("is_active", True)
            else:
                current_user["is_admin"] = False
        else:
            current_user["is_admin"] = False
    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        current_user["is_admin"] = False
    
    return current_user