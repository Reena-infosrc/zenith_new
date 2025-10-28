"""
Admin Authentication Router
Handles admin user authentication and management
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
from decimal import Decimal
from ..database_dynamodb import get_admins_table, parse_dynamodb_item, format_dynamodb_item, generate_id

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"]
)

@router.get("")
async def get_admins():
    """Get all admins"""
    try:
        table = await get_admins_table()
        
        # Scan the table
        response = await table.scan(Limit=100)
        
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
            
            admins.append(parsed_item)
        
        return {
            "admins": admins,
            "count": len(admins),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch admins: {str(e)}"
        )

@router.post("")
async def add_admin(data: dict):
    """Add a new admin"""
    try:
        table = await get_admins_table()
        admin_id = generate_id()
        
        admin_data = {
            'id': admin_id,
            'employee_id': data.get('employee_id', ''),
            'email': data.get('email', ''),
            'name': data.get('name', ''),
            'department': data.get('department', ''),
            'position': data.get('position', ''),
            'created_by': data.get('created_by', 'manual_add'),
            'is_active': True,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
        
        formatted_item = format_dynamodb_item(admin_data)
        await table.put_item(Item=formatted_item)
        
        return {
            "success": True,
            "message": "Admin added successfully",
            "admin": admin_data,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add admin: {str(e)}"
        )

@router.get("/check/{email}")
async def check_admin_status(email: str):
    """Check if a user is an admin by email"""
    try:
        # URL decode the email parameter
        import urllib.parse
        decoded_email = urllib.parse.unquote(email)
        
        # Normalize email to lowercase for consistent comparison
        normalized_email = decoded_email.lower().strip()
        
        table = await get_admins_table()
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": normalized_email}
        )
        
        is_admin = False
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_admin = admin_data.get("is_active", True)
        
        return {
            "is_admin": is_admin,
            "email": decoded_email,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check admin status: {str(e)}"
        )

@router.delete("/{admin_id}")
async def delete_admin(admin_id: str):
    """Delete an admin by ID"""
    try:
        table = await get_admins_table()
        
        # Delete the admin
        await table.delete_item(Key={"id": admin_id})
        
        return {
            "success": True,
            "message": "Admin deleted successfully",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete admin: {str(e)}"
        )

