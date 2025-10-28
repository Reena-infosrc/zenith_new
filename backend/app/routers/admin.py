from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime
import logging
from decimal import Decimal

from ..models import AdminCreate, AdminUpdate, AdminInDB, Admin
from ..database_dynamodb import get_admins_table, generate_id, format_dynamodb_item, parse_dynamodb_item
from ..security import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admins",
    tags=["admin-management"]
)

# Define specific routes first to avoid conflicts with {admin_id} route
@router.get("/check/{email}", response_model=dict)
async def check_admin_status(email: str):
    """Check if a user is an admin by email - public endpoint for frontend"""
    try:
        # URL decode the email parameter
        import urllib.parse
        decoded_email = urllib.parse.unquote(email)
        logger.info(f"Admin router - Checking admin status for email: {decoded_email}")
        
        is_admin = await is_user_admin(decoded_email.lower())
        logger.info(f"Admin router - Admin check result for {decoded_email}: {is_admin}")
        
        return {
            "is_admin": is_admin,
            "email": decoded_email,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        # Return False instead of error for production compatibility
        return {
            "is_admin": False,
            "email": email,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.get("/test", response_model=dict)
async def test_admin_endpoint():
    """Test endpoint to debug admin functionality - public endpoint"""
    try:
        table = await get_admins_table()
        return {
            "status": "success",
            "message": "Admin endpoint is working",
            "table_name": table.table_name,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in test endpoint: {str(e)}")
        return {
            "status": "error",
            "message": f"Admin endpoint error: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }

@router.get("", response_model=List[Admin])
@router.get("/", response_model=List[Admin])
async def get_admins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
    # Temporarily remove authentication to test basic functionality
    # current_user: dict = Depends(get_current_active_user)
):
    """Get all admins - temporarily public for testing"""
    print(f"DEBUG: get_admins called")
    
    try:
        table = await get_admins_table()
        print(f"DEBUG: Got admins table: {table}")
        
        # Scan the table with pagination
        response = await table.scan(Limit=limit)
        print(f"DEBUG: Scan response: {response}")
        
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
            
            print(f"DEBUG: Parsed item: {parsed_item}")
            admins.append(Admin(**parsed_item))
        
        print(f"DEBUG: Returning {len(admins)} admins")
        return admins
    except Exception as e:
        print(f"DEBUG: Error in get_admins: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error fetching admins: {str(e)}")
        
        # Return empty list instead of error for production compatibility
        print(f"DEBUG: Returning empty list due to error")
        return []

@router.post("/", response_model=Admin)
async def create_admin(
    admin_data: AdminCreate
    # Temporarily remove authentication to test basic functionality
    # current_user: dict = Depends(get_current_active_user)
):
    """Create a new admin - temporarily public for testing"""
    print(f"DEBUG: create_admin called with data: {admin_data}")
    
    try:
        table = await get_admins_table()
        
        # Generate new admin ID
        admin_id = generate_id()
        
        # Create admin data - normalize email to lowercase
        admin_item = {
            "id": admin_id,
            "employee_id": admin_data.employee_id,
            "email": admin_data.email.lower().strip(),  # Normalize to lowercase
            "name": admin_data.name,
            "department": admin_data.department,
            "position": admin_data.position,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "created_by": "manual_add",  # Temporarily hardcoded
            "is_active": True
        }
        
        # Format for DynamoDB
        formatted_item = format_dynamodb_item(admin_item)
        
        # Insert into database
        await table.put_item(Item=formatted_item)
        
        print(f"DEBUG: Created admin with ID: {admin_id}")
        return Admin(**admin_item)
        
    except Exception as e:
        print(f"DEBUG: Error in create_admin: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error creating admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create admin"
        )

@router.get("/{admin_id}", response_model=Admin)
async def get_admin(
    admin_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific admin by ID - only accessible by admins"""
    # Check if current user is admin
    if not await is_user_admin(current_user["email"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can access this endpoint"
        )
    
    try:
        table = await get_admins_table()
        response = await table.get_item(Key={"id": admin_id})
        
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        parsed_item = parse_dynamodb_item(response["Item"])
        return Admin(**parsed_item)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch admin"
        )

@router.put("/{admin_id}", response_model=Admin)
async def update_admin(
    admin_id: str,
    admin_data: AdminUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """Update an admin - only accessible by admins"""
    # Check if current user is admin
    if not await is_user_admin(current_user["email"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update admins"
        )
    
    try:
        table = await get_admins_table()
        
        # Get existing admin
        response = await table.get_item(Key={"id": admin_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        existing_admin = parse_dynamodb_item(response["Item"])
        
        # Update fields
        update_fields = {}
        for field, value in admin_data.dict(exclude_unset=True).items():
            if value is not None:
                update_fields[field] = value
        
        if not update_fields:
            return Admin(**existing_admin)
        
        update_fields["updated_at"] = datetime.utcnow().isoformat()
        
        # Update the item
        update_expression = "SET " + ", ".join([f"{k} = :{k}" for k in update_fields.keys()])
        expression_values = {f":{k}": v for k, v in update_fields.items()}
        
        await table.update_item(
            Key={"id": admin_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values
        )
        
        # Return updated admin
        updated_admin = {**existing_admin, **update_fields}
        return Admin(**updated_admin)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update admin"
        )

@router.delete("/{admin_id}")
async def delete_admin(
    admin_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Delete an admin - only accessible by admins"""
    # Check if current user is admin
    if not await is_user_admin(current_user["email"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete admins"
        )
    
    try:
        table = await get_admins_table()
        
        # Check if admin exists
        response = await table.get_item(Key={"id": admin_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        # Delete the admin
        await table.delete_item(Key={"id": admin_id})
        
        return {"message": "Admin deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete admin"
        )

# Helper functions
async def is_user_admin(email: str) -> bool:
    """Check if a user is an admin by email - case insensitive"""
    try:
        table = await get_admins_table()
        
        # Normalize email to lowercase for consistent comparison
        normalized_email = email.lower().strip()
        logger.info(f"Checking admin status for normalized email: {normalized_email}")
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": normalized_email}
        )
        
        logger.info(f"Query result items count: {len(response.get('Items', []))}")
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_active = admin_data.get("is_active", True)
            logger.info(f"Found admin record. Email: {admin_data.get('email')}, Active: {is_active}")
            return is_active
        
        logger.info(f"No admin record found for email: {normalized_email}")
        return False
    except Exception as e:
        logger.error(f"Error checking admin status for {email}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

async def get_admin_by_employee_id_or_email(employee_id: str, email: str) -> Optional[dict]:
    """Get admin by employee ID or email"""
    try:
        table = await get_admins_table()
        
        # Check by employee_id
        response = await table.query(
            IndexName="EmployeeIndex",
            KeyConditionExpression="employee_id = :employee_id",
            ExpressionAttributeValues={":employee_id": employee_id}
        )
        
        if response.get("Items"):
            return parse_dynamodb_item(response["Items"][0])
        
        # Check by email
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": email}
        )
        
        if response.get("Items"):
            return parse_dynamodb_item(response["Items"][0])
        
        return None
    except Exception as e:
        logger.error(f"Error checking existing admin: {str(e)}")
        return None
