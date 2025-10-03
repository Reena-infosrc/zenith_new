from passlib.context import CryptContext

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

# Generate hashes for our test passwords using safe function
admin_password = "admin123"
user_password = "user123"

admin_hash = hash_password_safe(admin_password)
user_hash = hash_password_safe(user_password)

print("Admin password hash:", admin_hash)
print("User password hash:", user_hash) 