"""
Admin Authentication Router
Handles admin user checks and management (authenticated routes).
"""

import urllib.parse
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException

from ..database_dynamodb import (
    get_admins_table,
    parse_dynamodb_item,
    format_dynamodb_item,
    generate_id,
)
from ..security import get_current_active_user, get_current_user, require_admin_user

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
)


@router.get("")
async def get_admins(_: dict = Depends(require_admin_user)):
    """List admins — requires admin JWT."""
    try:
        table = await get_admins_table()
        response = await table.scan(Limit=100)
        admins = []
        for item in response.get("Items", []):
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
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch admins: {str(e)}",
        )


@router.post("")
async def add_admin(data: dict, _: dict = Depends(require_admin_user)):
    """Add admin — requires admin JWT."""
    try:
        table = await get_admins_table()
        admin_id = generate_id()
        admin_data = {
            "id": admin_id,
            "employee_id": data.get("employee_id", ""),
            "email": data.get("email", ""),
            "name": data.get("name", ""),
            "department": data.get("department", ""),
            "position": data.get("position", ""),
            "created_by": data.get("created_by", "manual_add"),
            "is_active": True,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }
        formatted_item = format_dynamodb_item(admin_data, "admin")
        await table.put_item(Item=formatted_item)
        return {
            "success": True,
            "message": "Admin added successfully",
            "admin": admin_data,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add admin: {str(e)}",
        )


@router.get("/check/{email}")
async def check_admin_status(email: str, current_user: dict = Depends(get_current_active_user)):
    """Return admin flag for the signed-in user only (path email must match JWT identity)."""
    decoded = urllib.parse.unquote(email).lower().strip()
    subject = (current_user.get("email") or current_user.get("username") or "").lower().strip()
    if not subject or subject != decoded:
        raise HTTPException(
            status_code=403,
            detail="Admin status can only be checked for the signed-in user",
        )
    try:
        table = await get_admins_table()
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": decoded},
        )
        is_admin = False
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_active_value = admin_data.get("is_active", True)
            if isinstance(is_active_value, str):
                is_admin = is_active_value.lower() == "true"
            else:
                is_admin = bool(is_active_value)
        return {
            "is_admin": is_admin,
            "email": decoded,
            "timestamp": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check admin status: {str(e)}",
        )


@router.delete("/{admin_id}")
async def delete_admin(admin_id: str, _: dict = Depends(require_admin_user)):
    """Delete admin — requires admin JWT."""
    try:
        table = await get_admins_table()
        await table.delete_item(Key={"id": admin_id})
        return {
            "success": True,
            "message": "Admin deleted successfully",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete admin: {str(e)}",
        )
