from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import logging
import requests
import time
from jose import jwt, jwk, JWTError

from .models import TokenData, MOCK_USERS
from .security_config import get_jwt_secret_key

# Configure logger
logger = logging.getLogger(__name__)

class JWKSValidator:
    _instance = None
    _jwks_cache = {}
    _last_fetched = 0
    _cache_duration = 86400  # 24 hours

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(JWKSValidator, cls).__new__(cls)
        return cls._instance

    def _fetch_jwks(self, tenant_id: str):
        current_time = time.time()
        if tenant_id in self._jwks_cache and (current_time - self._last_fetched) < self._cache_duration:
            return self._jwks_cache[tenant_id]

        logger.info(f"Fetching JWKS for tenant: {tenant_id}")
        url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
        try:
            response = requests.get(url)
            response.raise_for_status()
            jwks = response.json()
            self._jwks_cache[tenant_id] = jwks
            self._last_fetched = current_time
            return jwks
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            return self._jwks_cache.get(tenant_id)

    def validate_token(self, token: str, tenant_id: str, client_id: str):
        try:
            # Get the key ID from the header
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            if not kid:
                raise JWTError("Token header missing 'kid'")

            unverified = jwt.get_unverified_claims(token)
            logger.debug("JWKS validate: checking token headers")

            # STRICT FIX: Always use the configured tenant_id. Do NOT trust the token's tid.
            jwks_tenant = tenant_id
            expected_issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

            jwks = self._fetch_jwks(jwks_tenant)
            if not jwks:
                raise JWTError("Could not retrieve JWKS")

            # Find the correct public key (Azure JWKS may omit "alg"; python-jose needs it for RSA)
            public_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    key_copy = dict(key)
                    if not key_copy.get("alg") and key_copy.get("kty") == "RSA":
                        key_copy["alg"] = "RS256"
                    public_key = jwk.construct(key_copy)
                    break

            if not public_key:
                raise JWTError(f"Public key for kid {kid} not found")

            # Decode with signature + exp/nbf; we'll check issuer and audience ourselves to support Azure's formats
            try:
                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=["RS256"],
                    options={"verify_exp": True, "verify_nbf": True, "verify_aud": False, "verify_iss": False},
                )
            except JWTError as e:
                logger.error(f"JWT decode failed (signature/exp): {e}")
                return None

            # Validate issuer (token may have trailing slash; normalize)
            token_iss_val = (payload.get("iss") or "").rstrip("/")
            expected_issuer_norm = expected_issuer.rstrip("/")
            if token_iss_val != expected_issuer_norm:
                logger.error(f"Issuer mismatch: token iss={token_iss_val!r}, expected={expected_issuer_norm!r}")
                return None

            # STRICT FIX: Only allow the specific client_id or custom API scope. NEVER "https://graph.microsoft.com"
            # to prevent cross-app Graph token replay.
            token_aud_val = payload.get("aud")
            allowed_audiences = (client_id, f"api://{client_id}")
            if isinstance(token_aud_val, list):
                aud_ok = any(a in token_aud_val for a in allowed_audiences)
            else:
                aud_ok = token_aud_val in allowed_audiences
            if not aud_ok:
                logger.error(f"Audience mismatch: token aud={token_aud_val!r}, allowed={allowed_audiences}")
                return None

            logger.debug("Microsoft token validated via JWKS")
            return payload
        except JWTError as e:
            logger.error(f"JWT Validation Error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error during token validation: {e}", exc_info=True)
            return None

jwks_validator = JWKSValidator()

# Security configuration
SECRET_KEY = get_jwt_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # 15 minutes for strict security

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
    now = datetime.utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=15)
        
    to_encode.update({"exp": expire})
    
    # Add iat to track absolute session lifetime across refreshes
    if "iat" not in to_encode:
        to_encode.update({"iat": now})
        
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current user from token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        jwt.get_unverified_header(token)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError as e:
        logger.debug("JWT validation failed: %s", e)
        raise credentials_exception
    user = get_user(username=token_data.username)
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
            # Normalize email to lowercase for consistent comparison
            normalized_email = user_email.lower().strip()
            
            table = await get_admins_table()
            response = await table.query(
                IndexName="EmailIndex",
                KeyConditionExpression="email = :email",
                ExpressionAttributeValues={":email": normalized_email}
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


async def require_admin_user(current_user: dict = Depends(get_current_active_user)) -> dict:
    """Reject non-admin users (use on routes that manage admins or sensitive bulk data)."""
    if not current_user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user