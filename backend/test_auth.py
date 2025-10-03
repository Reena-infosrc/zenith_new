from passlib.context import CryptContext
import logging

# Configure logging
logging.basicConfig(level=logging.Debug)
logger = logging.getLogger(__name__)

# Password hashing with safe configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

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

# Test password
test_password = "user123"

# Generate a new hash using safe function
new_hash = hash_password_safe(test_password)
logger.debug(f"Generated new hash: {new_hash}")

# Verify the password
verify_result = pwd_context.verify(test_password, new_hash)
logger.debug(f"Verification result: {verify_result}")

# Test with the hash from our models.py
stored_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"
verify_stored = pwd_context.verify(test_password, stored_hash)
logger.debug(f"Verification with stored hash: {verify_stored}")

# Generate a new hash for both users using safe function
admin_hash = hash_password_safe("admin123")
user_hash = hash_password_safe("user123")

print("\nNew hashes to use in models.py:")
print(f"Admin hash: {admin_hash}")
print(f"User hash: {user_hash}") 