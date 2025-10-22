#!/usr/bin/env python3
"""
Script to add a specific user to the admin table
"""

import asyncio
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database_dynamodb import get_employees_table, get_admins_table, generate_id, format_dynamodb_item, parse_dynamodb_item

load_dotenv()

async def add_user_to_admin_table(user_id: str):
    """Add a specific user to the admin table"""
    try:
        # First, get the employee data
        employees_table = await get_employees_table()
        response = await employees_table.get_item(Key={"id": user_id})
        
        if "Item" not in response:
            print(f"❌ Employee with ID {user_id} not found in employees table")
            return False
        
        employee_data = parse_dynamodb_item(response["Item"])
        print(f"✅ Found employee: {employee_data.get('name', 'Unknown')} ({employee_data.get('email', 'No email')})")
        
        # Check if user is already an admin
        admins_table = await get_admins_table()
        
        # Check by employee_id if it exists
        if employee_data.get('employee_id'):
            admin_response = await admins_table.query(
                IndexName="EmployeeIndex",
                KeyConditionExpression="employee_id = :employee_id",
                ExpressionAttributeValues={":employee_id": employee_data['employee_id']}
            )
            if admin_response.get("Items"):
                print(f"⚠️  User {employee_data.get('name')} is already an admin")
                return True
        
        # Check by email
        if employee_data.get('email'):
            admin_response = await admins_table.query(
                IndexName="EmailIndex",
                KeyConditionExpression="email = :email",
                ExpressionAttributeValues={":email": employee_data['email']}
            )
            if admin_response.get("Items"):
                print(f"⚠️  User with email {employee_data.get('email')} is already an admin")
                return True
        
        # Create admin entry
        admin_id = generate_id()
        now = datetime.utcnow()
        
        admin_dict = {
            "id": admin_id,
            "employee_id": employee_data.get('employee_id', user_id),  # Use employee_id if available, otherwise use the main ID
            "email": employee_data.get('email', ''),
            "name": employee_data.get('name', 'Unknown'),
            "department": employee_data.get('department', ''),
            "position": employee_data.get('position', ''),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": "manual_add",
            "is_active": True
        }
        
        formatted_item = format_dynamodb_item(admin_dict)
        await admins_table.put_item(Item=formatted_item)
        
        print(f"✅ Successfully added {employee_data.get('name')} to admin table")
        print(f"   - Admin ID: {admin_id}")
        print(f"   - Employee ID: {admin_dict['employee_id']}")
        print(f"   - Email: {admin_dict['email']}")
        print(f"   - Department: {admin_dict['department']}")
        print(f"   - Position: {admin_dict['position']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error adding user to admin table: {e}")
        return False

async def main():
    """Main function"""
    user_id = "a1ed1099-e9be-4356-a41d-f7dfcefb5104"
    
    print(f"Adding user {user_id} to admin table...")
    success = await add_user_to_admin_table(user_id)
    
    if success:
        print("✅ Process completed successfully!")
    else:
        print("❌ Process failed!")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
