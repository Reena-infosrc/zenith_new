#!/usr/bin/env python3
"""
Script to verify admin status for a specific user
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database_dynamodb import get_admins_table, parse_dynamodb_item

load_dotenv()

async def verify_admin_status(user_email: str):
    """Verify if a user is an admin"""
    try:
        admins_table = await get_admins_table()
        
        # Query by email
        response = await admins_table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": user_email}
        )
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            print(f"✅ User {user_email} is an ADMIN")
            print(f"   - Name: {admin_data.get('name')}")
            print(f"   - Employee ID: {admin_data.get('employee_id')}")
            print(f"   - Department: {admin_data.get('department')}")
            print(f"   - Position: {admin_data.get('position')}")
            print(f"   - Active: {admin_data.get('is_active')}")
            print(f"   - Created: {admin_data.get('created_at')}")
            return True
        else:
            print(f"❌ User {user_email} is NOT an admin")
            return False
            
    except Exception as e:
        print(f"❌ Error checking admin status: {e}")
        return False

async def main():
    """Main function"""
    user_email = "jagadeesh.l@infoservices.com"
    
    print(f"Checking admin status for {user_email}...")
    await verify_admin_status(user_email)

if __name__ == "__main__":
    asyncio.run(main())
