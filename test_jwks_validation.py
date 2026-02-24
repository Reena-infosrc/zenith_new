import os
import sys
from dotenv import load_dotenv

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

load_dotenv()

from app.security import jwks_validator

def test_jwks_fetch():
    tenant_id = os.getenv("AZURE_MSAL_TENANT_ID")
    if not tenant_id:
        print("AZURE_MSAL_TENANT_ID not found in .env")
        return

    print(f"Testing JWKS fetch for tenant: {tenant_id}")
    jwks = jwks_validator._fetch_jwks(tenant_id)
    if jwks and "keys" in jwks:
        print(f"Successfully fetched {len(jwks['keys'])} keys")
        for key in jwks['keys']:
            print(f" - kid: {key.get('kid')}, use: {key.get('use')}, n: {key.get('n')[:20]}...")
    else:
        print("Failed to fetch JWKS or keys missing")

if __name__ == "__main__":
    test_jwks_fetch()
