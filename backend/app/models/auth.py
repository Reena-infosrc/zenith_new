from pydantic import BaseModel, EmailStr
from typing import Optional, Dict
from passlib.context import CryptContext
import bcrypt

# Update the CryptContext configuration with more robust settings
pwd_context = CryptContext(
    schemes=["bcrypt"], 
    deprecated="auto", 
    bcrypt__ident="2b",
    bcrypt__rounds=12
)

def hash_password_safe(password: str) -> str:
    """
    Safely hash password with proper length handling for bcrypt.
    Bcrypt has a 72-byte limit, so we truncate if necessary.
    """
    # Ensure we're working with a string
    password_str = str(password)
    
    # Convert to bytes and truncate to 72 bytes if necessary
    password_bytes = password_str.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        password_str = password_bytes.decode('utf-8', errors='ignore')
    
    return pwd_context.hash(password_str)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: str
    is_active: bool = True
    is_admin: bool = False

    class Config:
        json_schema_extra = {  # Updated from schema_extra to json_schema_extra for Pydantic v2
            "example": {
                "id": "5f8d0d55b54764421b71cc2d",
                "email": "user@example.com",
                "username": "johndoe",
                "full_name": "John Doe",
                "is_active": True,
                "is_admin": False
            }
        }

# Update mock users with the correct credentials and safe password hashing
MOCK_USERS: Dict[str, dict] = {
    "admin@example.com": {
        "id": "1",
        "username": "admin",
        "email": "admin@example.com",
        "full_name": "Admin User",
        "hashed_password": hash_password_safe("admin123"),
        "is_active": True,
        "is_admin": True
    },
    "user@example.com": {
        "id": "2",
        "username": "user",
        "email": "user@example.com",
        "full_name": "Regular User",
        "hashed_password": hash_password_safe("user123"),
        "is_active": True,
        "is_admin": False
    }
}