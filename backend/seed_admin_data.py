#!/usr/bin/env python3
"""
Script to seed initial admin data in the zenith-hr-admin table
"""

import asyncio
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database_dynamodb import get_admins_table, generate_id, format_dynamodb_item

load_dotenv()

async def seed_admin_data():
    """Seed initial admin data"""
    try:
        table = await get_admins_table()
        
        # Initial admin data - you can modify these as needed
        initial_admins = [
            {
                "employee_id": "EMP001",
                "email": "admin@zenith.com",
                "name": "System Administrator",
                "department": "IT",
                "position": "System Admin"
            },
            {
                "employee_id": "EMP002", 
                "email": "hr.admin@zenith.com",
                "name": "HR Administrator",
                "department": "Human Resources",
                "position": "HR Manager"
            }
        ]
        
        print("Seeding admin data...")
        
        for admin_data in initial_admins:
            admin_id = generate_id()
            now = datetime.utcnow()
            
            admin_dict = {
                "id": admin_id,
                "employee_id": admin_data["employee_id"],
                "email": admin_data["email"],
                "name": admin_data["name"],
                "department": admin_data["department"],
                "position": admin_data["position"],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": "system",
                "is_active": True
            }
            
            formatted_item = format_dynamodb_item(admin_dict)
            
            # Check if admin already exists
            try:
                response = await table.get_item(Key={"id": admin_id})
                if "Item" not in response:
                    await table.put_item(Item=formatted_item)
                    print(f"✅ Created admin: {admin_data['name']} ({admin_data['email']})")
                else:
                    print(f"⚠️  Admin already exists: {admin_data['name']} ({admin_data['email']})")
            except Exception as e:
                print(f"❌ Error creating admin {admin_data['name']}: {e}")
        
        print("✅ Admin data seeding completed!")
        
    except Exception as e:
        print(f"❌ Error seeding admin data: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(seed_admin_data())
