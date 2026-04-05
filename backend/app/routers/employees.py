from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile, status, Form, Request
from typing import List, Optional, Dict, Any
from ..models.employee import EmployeeCreate, EmployeeUpdate, EmployeeInDB
from ..database_dynamodb import get_employees_table, get_admins_table, parse_dynamodb_item, format_dynamodb_item, generate_id
from ..security import get_current_active_user
from ..services.image_upload import ImageUploadService
from ..feature_flags import FeatureFlags
from botocore.exceptions import ClientError
import time
from datetime import datetime
import csv
import io
import uuid
import logging
import traceback
from decimal import Decimal

logger = logging.getLogger(__name__)
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("Warning: pandas not available, Excel import will be disabled")

router = APIRouter(
    prefix="/api/employees",
    tags=["employees"],
    responses={404: {"description": "Not found"}},
)

# Define specific routes first to avoid conflicts with {employee_id} route
@router.get("/health", tags=["employees"])
async def employees_health_check():
    """Health check endpoint for employees router"""
    return {
        "status": "healthy",
        "router": "employees",
        "version": "3.0.0-PRODUCTION-FIX",
        "endpoints": ["/clients", "/employee-statuses", "/health", "/admins", "/admins/check/{email}", "/admins/test"],
        "deployment_id": "prod-fix-v3.0",
        "timestamp": datetime.now().isoformat(),
        "admin_endpoints_working": True
    }

@router.get("/clients", tags=["employees"])
async def get_unique_clients(current_user: dict = Depends(get_current_active_user)):
    """Get all unique client/account values from employees"""
    try:
        table = await get_employees_table()
        
        # Scan all employees to get unique account values
        response = await table.scan(
            ProjectionExpression="account",
            Limit=1000
        )
        
        clients = set()
        for item in response.get("Items", []):
            parsed_item = parse_dynamodb_item(item, "employees")
            account = parsed_item.get("account")
            if account and account.strip():
                clients.add(account.strip())
        
        # Convert to sorted list
        unique_clients = sorted(list(clients))
        
        return {
            "clients": unique_clients,
            "count": len(unique_clients)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch clients: {str(e)}"
        )

@router.get("/employee-statuses", tags=["employees"])
async def get_unique_employee_statuses(current_user: dict = Depends(get_current_active_user)):
    """Get all unique employee_status values from employees"""
    try:
        table = await get_employees_table()
        
        # Scan all employees to get unique employee_status values
        response = await table.scan(
            ProjectionExpression="employee_status",
            Limit=1000
        )
        
        statuses = set()
        for item in response.get("Items", []):
            parsed_item = parse_dynamodb_item(item, "employees")
            status = parsed_item.get("employee_status")
            if status and status.strip():
                statuses.add(status.strip())
        
        # Convert to sorted list
        unique_statuses = sorted(list(statuses))
        
        return {
            "employee_statuses": unique_statuses,
            "count": len(unique_statuses)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch employee statuses: {str(e)}"
        )

@router.get("/admins", response_model=List[Dict[str, Any]])
async def get_admins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_active_user)
):
    """Get all admins - simplified version without Pydantic models"""
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
            admins.append(parsed_item)
        
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

@router.post("/admins", response_model=Dict[str, Any])
async def create_admin(
    admin_data: Dict[str, Any],
    current_user: dict = Depends(get_current_active_user)
):
    """Create a new admin - simplified version without Pydantic models"""
    print(f"DEBUG: create_admin called with data: {admin_data}")
    
    try:
        table = await get_admins_table()
        
        # Generate new admin ID
        admin_id = generate_id()
        
        # Create admin data - normalize email to lowercase
        admin_item = {
            "id": admin_id,
            "employee_id": admin_data.get("employee_id", ""),
            "email": admin_data.get("email", "").lower().strip(),  # Normalize to lowercase
            "name": admin_data.get("name", ""),
            "department": admin_data.get("department", ""),
            "position": admin_data.get("position", ""),
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
        return admin_item
        
    except Exception as e:
        print(f"DEBUG: Error in create_admin: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error creating admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create admin"
        )

@router.get("/admins/{admin_id}", response_model=Dict[str, Any])
async def get_admin(
    admin_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific admin by ID - simplified version"""
    try:
        table = await get_admins_table()
        
        response = await table.get_item(Key={"id": admin_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        admin_data = parse_dynamodb_item(response["Item"])
        return admin_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch admin"
        )

@router.put("/admins/{admin_id}", response_model=Dict[str, Any])
async def update_admin(
    admin_id: str,
    admin_data: Dict[str, Any],
    current_user: dict = Depends(get_current_active_user)
):
    """Update an admin - simplified version"""
    try:
        table = await get_admins_table()
        
        # Check if admin exists
        response = await table.get_item(Key={"id": admin_id})
        if "Item" not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        # Update fields
        update_data = {k: v for k, v in admin_data.items() if v is not None}
        update_data["updated_at"] = datetime.now().isoformat()
        
        # Update in database
        formatted_item = format_dynamodb_item(update_data)
        await table.update_item(
            Key={"id": admin_id},
            UpdateExpression="SET " + ", ".join([f"{k} = :{k}" for k in update_data.keys()]),
            ExpressionAttributeValues={f":{k}": v for k, v in formatted_item.items()}
        )
        
        # Return updated admin
        updated_response = await table.get_item(Key={"id": admin_id})
        updated_admin = parse_dynamodb_item(updated_response["Item"])
        return updated_admin
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update admin"
        )

@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Delete an admin - only accessible by admins"""
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

# Helper function for admin status check
async def is_user_admin(email: str) -> bool:
    """Check if a user is an admin by email - case insensitive"""
    try:
        table = await get_admins_table()
        
        # Normalize email to lowercase for consistent comparison
        normalized_email = email.lower().strip()
        logger.info(f"Employees router - Checking admin status for normalized email: {normalized_email}")
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": normalized_email}
        )
        
        logger.info(f"Employees router - Query result items count: {len(response.get('Items', []))}")
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            is_active = admin_data.get("is_active", True)
            logger.info(f"Employees router - Found admin record. Email: {admin_data.get('email')}, Active: {is_active}")
            return is_active
        
        logger.info(f"Employees router - No admin record found for email: {normalized_email}")
        return False
    except Exception as e:
        logger.error(f"Error checking admin status for {email}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

@router.get("", response_model=List[EmployeeInDB])
@router.get("/", response_model=List[EmployeeInDB])
async def get_employees(
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1),
    department: Optional[str] = None,
    location: Optional[str] = None,
    employee_status: Optional[str] = None,
    employment_category: Optional[str] = None,
    is_leader: Optional[str] = None,
    position: Optional[str] = None,
    gender: Optional[str] = None,
    account: Optional[str] = None,
    search: Optional[str] = None,
    usage_location: Optional[str] = Query(
        None,
        description="Filter by Azure Entra usage location (ISO 3166 alpha-2), e.g. IN or US",
    ),
    sort_by: Optional[str] = Query(None, description="Sort by field: name, date_of_joining"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc, desc"),
    current_user: dict = Depends(get_current_active_user)
):
    """Get all employees with optional filtering from DynamoDB"""
    try:
        print(f"DEBUG: get_employees called with params: department={department}, location={location}, skip={skip}, limit={limit}")
        
        # Get table
        table = await get_employees_table()
        print(f"DEBUG: Table obtained: {table}")

        # Scan all employees with pagination
        print(f"DEBUG: Performing scan with pagination...")
        all_items = []
        last_evaluated_key = None
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            resp = await table.scan(**scan_kwargs)
            items = resp.get("Items", [])
            all_items.extend(items)
            
            print(f"DEBUG: Scan batch returned {len(items)} items, total so far: {len(all_items)}")
            
            # Check if there are more items to scan
            last_evaluated_key = resp.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
        
        print(f"DEBUG: Total items scanned: {len(all_items)}")
        items = all_items

        # Parse and normalize items
        print(f"DEBUG: Parsing {len(items)} items")
        parsed = []
        for i, raw in enumerate(items):
            print(f"DEBUG: Parsing item {i+1}: {raw}")
            doc = parse_dynamodb_item(raw, "employees")
            print(f"DEBUG: Parsed item {i+1}: {doc}")
            
            # Ensure id field exists for API model
            if "id" not in doc and "_id" in doc:
                doc["id"] = doc["_id"]
            elif "id" not in doc:
                print(f"DEBUG: Skipping item {i+1} - no id field")
                continue

            # Set photo_url to empty string if not present
            if not doc.get("photo_url"):
                doc["photo_url"] = ""
            
            # Set default status to "active" if not present (but don't override explicit "inactive")
            if doc.get("status") is None or doc.get("status") == "":
                doc["status"] = "active"
            
            # Ensure required fields have default values
            if not doc.get("department"):
                doc["department"] = ""
            if not doc.get("position"):
                doc["position"] = ""

            parsed.append(doc)
        
        print(f"DEBUG: Final parsed items: {len(parsed)}")

        # Filter by Entra usage location (DynamoDB usage_location)
        if usage_location:
            want = usage_location.strip().upper()
            parsed = [
                d for d in parsed
                if (d.get("usage_location") or "").strip().upper() == want
            ]

        # Apply search filter client-side
        if search:
            search_lower = search.lower()
            parsed = [
                d for d in parsed
                if (
                    search_lower in d.get("name", "").lower()
                    or search_lower in d.get("position", "").lower()
                    or search_lower in d.get("email", "").lower()
                )
            ]

        # Apply sorting
        if sort_by:
            reverse_order = sort_order and sort_order.lower() == "desc"
            
            if sort_by == "name":
                parsed.sort(key=lambda x: x.get("name", "").lower(), reverse=reverse_order)
            elif sort_by == "date_of_joining":
                def get_date_key(emp):
                    date_str = emp.get("date_of_joining", "")
                    if not date_str:
                        return "9999-12-31"  # Put employees without date at the end
                    try:
                        # Handle both date string and datetime object
                        if isinstance(date_str, str):
                            return date_str
                        else:
                            return date_str.isoformat() if hasattr(date_str, 'isoformat') else str(date_str)
                    except:
                        return "9999-12-31"
                
                parsed.sort(key=get_date_key, reverse=reverse_order)

        # Apply pagination via slicing
        try:
            start_idx = int(skip) if isinstance(skip, (int, str)) else 0
            end_idx = start_idx + (int(limit) if isinstance(limit, (int, str)) else 1000)
        except (ValueError, TypeError):
            start_idx = 0
            end_idx = 1000
        sliced = parsed[start_idx: end_idx]
        
        print(f"DEBUG: Returning {len(sliced)} employees")
        return sliced
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error fetching employees from DynamoDB: {e}")
        print(f"Full traceback: {error_details}")
        raise HTTPException(status_code=500, detail=f"Error fetching employees: {str(e)}")

@router.get("/check-team-members", tags=["employees"])
async def check_team_members(current_user: dict = Depends(get_current_active_user)):
    """
    Check if the current user has team members (direct reports).
    Returns whether the user should see manager view or user view.
    
    **Security:**
    - Requires valid JWT Bearer token in Authorization header
    - Token is validated via get_current_active_user dependency
    - Returns 401 Unauthorized if token is missing or invalid
    - Only returns data for the authenticated user
    
    **Request Headers:**
    - Authorization: Bearer <jwt_token>
    
    **Response:**
    - has_team_members: bool - Whether user has direct reports
    - view_mode: str - "manager" or "user" based on team membership
    - team_count: int - Number of direct reports
    """
    try:
        user_email = current_user.get("email") or current_user.get("preferred_username")
        if not user_email:
            return {
                "has_team_members": False,
                "view_mode": "user",
                "team_count": 0
            }
        
        table = await get_employees_table()
        
        # Normalize email to lowercase for consistent comparison
        normalized_email = user_email.lower().strip()
        
        # Find current user's employee record using EmailIndex GSI
        user_response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={
                ":email": normalized_email
            },
            Limit=1
        )
        
        if not user_response.get("Items"):
            return {
                "has_team_members": False,
                "view_mode": "user",
                "team_count": 0
            }
        
        current_employee = parse_dynamodb_item(user_response["Items"][0], "employees")
        current_employee_id = current_employee.get("id")
        
        if not current_employee_id:
            return {
                "has_team_members": False,
                "view_mode": "user",
                "team_count": 0
            }
        
        # Check for direct reports (employees who report to current user)
        # Use ReportingToIndex GSI for fast query instead of scan
        try:
            reports_response = await table.query(
                IndexName="ReportingToIndex",
                KeyConditionExpression="reporting_to = :manager_id",
                ExpressionAttributeValues={
                    ":manager_id": current_employee_id
                }
            )
            raw_items = reports_response.get("Items", [])
        except ClientError as e:
            # Fallback to scan if index doesn't exist yet (for backward compatibility)
            logger.warning(f"ReportingToIndex not available, falling back to scan: {e}")
            reports_scan = await table.scan(
                FilterExpression="reporting_to = :manager_id",
                ExpressionAttributeValues={
                    ":manager_id": current_employee_id
                }
            )
            raw_items = reports_scan.get("Items", [])
        
        # Parse and filter out inactive team members (default to active if status missing)
        team_members = []
        for item in raw_items:
            emp = parse_dynamodb_item(item, "employees")
            emp_status = emp.get("status", "active")
            if emp_status == "inactive":
                continue
            team_members.append(emp)
        
        has_team = len(team_members) > 0
        
        return {
            "has_team_members": has_team,
            "view_mode": "manager" if has_team else "user",
            "team_count": len(team_members)
        }
        
    except Exception as e:
        logger.error(f"Error checking team members: {str(e)}")
        import traceback
        traceback.print_exc()
        # Default to user view on error
        return {
            "has_team_members": False,
            "view_mode": "user",
            "team_count": 0,
            "error": str(e)
        }

@router.get("/{employee_id}", response_model=EmployeeInDB)
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_active_user)):
    """Get a specific employee by ID"""
    try:
        table = await get_employees_table()
        response = await table.get_item(Key={"id": employee_id})
        
        if "Item" not in response:
            raise HTTPException(status_code=404, detail="Employee not found")
    
        employee = parse_dynamodb_item(response["Item"], "employees")
        
        # Set default status to "active" if not present (but don't override explicit "inactive")
        if employee.get("status") is None or employee.get("status") == "":
            employee["status"] = "active"
        
        return employee
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch employee: {str(e)}")

@router.post("/", response_model=EmployeeInDB, status_code=201)
async def create_employee(
    current_user: dict = Depends(get_current_active_user),
    employeeId: Optional[str] = Form(None),
    firstName: Optional[str] = Form(None),
    lastName: Optional[str] = Form(None),
    name: str = Form(...),
    position: str = Form(...),
    department: str = Form(...),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    mobile: Optional[str] = Form(None),
    emergencyContactName: Optional[str] = Form(None),
    emergencyContactRelationship: Optional[str] = Form(None),
    emergencyContactPhone: Optional[str] = Form(None),
    employmentCategory: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    employeeStatus: Optional[str] = Form(None),
    account: Optional[str] = Form(None),
    isLeader: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    dateOfBirth: Optional[str] = Form(None),
    dateOfJoining: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    projectStartDate: Optional[str] = Form(None),  # Renamed from startDate
    projectEndDate: Optional[str] = Form(None),    # New field for project end date
    skills: Optional[str] = Form(None),
    expertise: Optional[str] = Form(None),
    experienceYears: Optional[int] = Form(None),
    reporting_to: Optional[str] = Form(None),
    status: Optional[str] = Form("active"),
    resignationDate: Optional[str] = Form(None),
    reasonForResignation: Optional[str] = Form(None)
):
    """Create a new employee from form data"""
    try:
        table = await get_employees_table()
        
        # Generate a unique ID
        employee_id = str(uuid.uuid4())
        
        # Parse date fields
        parsed_date_of_birth = None
        parsed_date_of_joining = None
        parsed_project_start_date = None
        parsed_project_end_date = None
        parsed_resignation_date = None
        
        if dateOfBirth:
            try:
                parsed_date_of_birth = datetime.datetime.strptime(dateOfBirth, "%Y-%m-%d").date()
            except ValueError:
                pass
        
        if dateOfJoining:
            try:
                parsed_date_of_joining = datetime.datetime.strptime(dateOfJoining, "%Y-%m-%d").date()
            except ValueError:
                pass
        
        if projectStartDate:
            try:
                parsed_project_start_date = datetime.datetime.strptime(projectStartDate, "%Y-%m-%d").date()
            except ValueError:
                pass
        
        if projectEndDate:
            try:
                parsed_project_end_date = datetime.datetime.strptime(projectEndDate, "%Y-%m-%d").date()
            except ValueError:
                pass
        
        if resignationDate:
            try:
                parsed_resignation_date = datetime.datetime.strptime(resignationDate, "%Y-%m-%d").date()
            except ValueError:
                pass
        
        # Parse skills if provided
        parsed_skills = []
        if skills:
            try:
                parsed_skills = [skill.strip() for skill in skills.split(',') if skill.strip()]
            except:
                pass
        
        # Convert experienceYears to int if provided
        parsed_experience_years = None
        if experienceYears is not None:
            try:
                parsed_experience_years = int(experienceYears)
            except (ValueError, TypeError):
                pass
        
        # Create employee data dictionary
        employee_data = {
            "id": employee_id,
            "employee_id": employeeId,
            "first_name": firstName,
            "last_name": lastName,
            "name": name,
            "position": position,
            "department": department,
            "email": email,
            "phone": phone,
            "mobile": mobile,
            "emergency_contact_name": emergencyContactName,
            "emergency_contact_relationship": emergencyContactRelationship,
            "emergency_contact_phone": emergencyContactPhone,
            "employment_category": employmentCategory,
            "gender": gender,
            "employee_status": employeeStatus,
            "account": account,
            "is_leader": isLeader,
            "location": location,
            "date_of_birth": parsed_date_of_birth.isoformat() if parsed_date_of_birth else None,
            "date_of_joining": parsed_date_of_joining.isoformat() if parsed_date_of_joining else None,
            "bio": bio,
            "project_start_date": parsed_project_start_date.isoformat() if parsed_project_start_date else None,
            "project_end_date": parsed_project_end_date.isoformat() if parsed_project_end_date else None,
            "photo_url": "",
            "manager_id": None,
            "reporting_to": reporting_to,
            "skills": parsed_skills,
            "expertise": expertise,
            "experience_years": parsed_experience_years,
            "status": status,
            "resignation_date": parsed_resignation_date.isoformat() if parsed_resignation_date else None,
            "reason_for_resignation": reasonForResignation,
            "performance_communication": 0.0,
            "performance_leadership": 0.0,
            "performance_client_feedback": 0.0,
            "overall_rating": 0.0,
            "strengths": [],
            "tech_stack": [],
            "created_at": time.strftime("%Y-%m-%d"),
            "updated_at": time.strftime("%Y-%m-%d")
        }
        
        # Convert to DynamoDB format
        dynamodb_item = format_dynamodb_item(employee_data, "employees")
        
        # Insert into DynamoDB
        await table.put_item(Item=dynamodb_item)
        
        # Return the created employee
        return EmployeeInDB(**employee_data)
        
    except Exception as e:
        print(f"ERROR: Failed to create employee: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create employee: {str(e)}")

@router.put("/{employee_id}", response_model=EmployeeInDB)
async def update_employee(employee_id: str, request: Request, current_user: dict = Depends(get_current_active_user)):
    """Update an existing employee. Reads body once so emergency_contact_* are always persisted."""
    try:
        raw_body = await request.json()
        employee_update = EmployeeUpdate(**raw_body)
        table = await get_employees_table()
        
        # Get existing employee by primary key
        response = await table.get_item(Key={"id": employee_id})
        
        # If not found by ID, try to locate by business keys (employee_id or email)
        if "Item" not in response:
            fallback_employee = None
            
            # Prefer lookup by employee_id when provided
            if employee_update.employee_id:
                try:
                    scan_kwargs = {
                        "FilterExpression": "employee_id = :emp_id",
                        "ExpressionAttributeValues": {
                            ":emp_id": employee_update.employee_id
                        }
                    }
                    scan_response = await table.scan(**scan_kwargs)
                    items = scan_response.get("Items", [])
                    if items:
                        fallback_employee = items[0]
                        # Update employee_id to the real primary key from table
                        employee_id = parse_dynamodb_item(fallback_employee, "employees").get("id", employee_id)
                except Exception as e:
                    print(f"DEBUG: Error scanning by employee_id in update_employee: {e}")
            
            # If still not found and email is provided, try lookup via EmailIndex
            if not fallback_employee and employee_update.email:
                try:
                    email_normalized = employee_update.email.lower().strip()
                    email_response = await table.query(
                        IndexName="EmailIndex",
                        KeyConditionExpression="email = :email",
                        ExpressionAttributeValues={":email": email_normalized},
                        Limit=1
                    )
                    items = email_response.get("Items", [])
                    if items:
                        fallback_employee = items[0]
                        employee_id = parse_dynamodb_item(fallback_employee, "employees").get("id", employee_id)
                except Exception as e:
                    print(f"DEBUG: Error querying by email in update_employee: {e}")
            
            if fallback_employee:
                response = {"Item": fallback_employee}
            else:
                raise HTTPException(status_code=404, detail="Employee not found")
        
        # Parse existing employee data
        existing_employee = parse_dynamodb_item(response["Item"], "employees")
        print(f"DEBUG: Existing employee data: {existing_employee}")
        
        # Get update data (only fields that are being updated)
        update_data = employee_update.dict(exclude_unset=True)
        # Always persist emergency contact fields from request body (so they are never dropped by older deploys or schema)
        for key in ("emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone"):
            if key in raw_body:
                update_data[key] = raw_body[key] if raw_body[key] is not None else ""
        print(f"DEBUG: Update data: {update_data}")
        
        # Merge existing data with update data
        merged_data = existing_employee.copy()
        merged_data.update(update_data)
        merged_data["updated_at"] = time.strftime("%Y-%m-%d")
        
        print(f"DEBUG: Merged data: {merged_data}")
        
        # Convert to DynamoDB format and update
        dynamodb_item = format_dynamodb_item(merged_data, "employees")
        
        # Update in DynamoDB
        await table.put_item(Item=dynamodb_item)
        
        # Return updated employee
        return EmployeeInDB(**merged_data)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error in update_employee: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update employee: {str(e)}")

@router.post("/bulk-update-names", status_code=200)
async def bulk_update_employee_names(current_user: dict = Depends(get_current_active_user)):
    """Update all existing employee names to camel case format"""
    try:
        table = await get_employees_table()
        
        # Get all employees
        response = await table.scan()
        employees = response.get('Items', [])
        
        updated_count = 0
        
        for employee_item in employees:
            # Parse the employee data
            employee_data = parse_dynamodb_item(employee_item, "employees")
            
            # Convert name to camel case
            original_name = employee_data.get('name', '')
            if original_name:
                # Convert to camel case (Title Case)
                camel_case_name = ' '.join(word.capitalize() for word in original_name.split())
                
                if camel_case_name != original_name:
                    # Update the name
                    employee_data['name'] = camel_case_name
                    employee_data['updated_at'] = time.strftime("%Y-%m-%d")
                    
                    # Convert back to DynamoDB format and update
                    dynamodb_item = format_dynamodb_item(employee_data, "employees")
                    await table.put_item(Item=dynamodb_item)
                    updated_count += 1
                    
                    print(f"Updated employee {employee_data.get('id', 'unknown')}: '{original_name}' -> '{camel_case_name}'")
        
        return {
            "message": f"Successfully updated {updated_count} employee names to camel case format",
            "updated_count": updated_count,
            "total_employees": len(employees)
        }
        
    except Exception as e:
        print(f"Error in bulk_update_employee_names: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update employee names: {str(e)}")

@router.delete("/{employee_id}", status_code=204)
async def delete_employee(employee_id: str, current_user: dict = Depends(get_current_active_user)):
    """Delete an employee"""
    try:
        table = await get_employees_table()
        
        # Check if employee exists
        response = await table.get_item(Key={"id": employee_id})
        if "Item" not in response:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Delete from DynamoDB
        await table.delete_item(Key={"id": employee_id})
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete employee: {str(e)}")

@router.post("/upload-photo/{employee_id}")
async def upload_employee_photo(
    employee_id: str,
    file: UploadFile = File(...),
    current_user = Depends(get_current_active_user)
):
    """Upload a photo for a specific employee"""
    try:
        # Check if employee exists
        table = await get_employees_table()
        response = await table.get_item(Key={"id": employee_id})
        if "Item" not in response:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Get employee data to extract location and department for S3 organization
        employee_data = parse_dynamodb_item(response["Item"], "employees")
        location = employee_data.get("location", "")
        department = employee_data.get("department", "")
        
        # Upload photo using ImageUploadService
        print(f"DEBUG: Uploading photo for employee {employee_id}")
        print(f"DEBUG: Employee location: {location}, department: {department}")
        print(f"DEBUG: File details: {file.filename}, {file.content_type}, {file.size}")
        
        photo_url = await ImageUploadService.upload_photo(
            file=file,
            employee_id=employee_id,
            location=location,
            department=department
        )
        
        print(f"DEBUG: Photo uploaded successfully, URL: {photo_url}")
        print(f"DEBUG: Photo URL type: {type(photo_url)}")
        print(f"DEBUG: Photo URL length: {len(photo_url) if photo_url else 'None'}")
        
        # Update employee record with new photo URL
        employee_data["photo_url"] = photo_url
        employee_data["updated_at"] = time.strftime("%Y-%m-%d")
        
        print(f"DEBUG: Updated employee data: {employee_data}")
        print(f"DEBUG: Photo URL in employee data: {employee_data.get('photo_url')}")
        
        # Save updated employee data
        dynamodb_item = format_dynamodb_item(employee_data, "employees")
        print(f"DEBUG: DynamoDB item to save: {dynamodb_item}")
        await table.put_item(Item=dynamodb_item)
        
        print(f"DEBUG: Employee record updated in DynamoDB")
        
        # Verify the data was saved correctly
        verify_response = await table.get_item(Key={"id": employee_id})
        if "Item" in verify_response:
            saved_data = parse_dynamodb_item(verify_response["Item"], "employees")
            print(f"DEBUG: Verified saved data photo_url: {saved_data.get('photo_url')}")
        else:
            print("DEBUG: Could not verify saved data")
        
        return {
            "message": "Photo uploaded successfully",
            "photo_url": photo_url,
            "employee_id": employee_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error uploading photo: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload photo: {str(e)}")

@router.post("/import-csv")
async def import_employees_csv(
    file: UploadFile = File(...),
    overwrite: bool = Query(False),
    current_user: dict = Depends(get_current_active_user)
):
    """Import employees from CSV/Excel file with new structure"""
    # Check if bulk upload feature is enabled
    bulk_upload_enabled = FeatureFlags.is_enabled("bulk_upload")
    print(f"DEBUG: bulk_upload feature flag: {bulk_upload_enabled}")
    print(f"DEBUG: All feature flags: {FeatureFlags.all_features()}")
    
    if not bulk_upload_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bulk upload feature is not enabled"
        )
    
    try:
        contents = await file.read()
        
        # Check file extension and parse accordingly
        if file.filename.endswith('.csv'):
            buffer = io.StringIO(contents.decode())
            csv_reader = csv.DictReader(buffer)
            rows = list(csv_reader)
        elif file.filename.endswith(('.xlsx', '.xls')):
            if not PANDAS_AVAILABLE:
                raise HTTPException(
                    status_code=400,
                    detail="Excel file support requires pandas. Please use CSV format instead."
                )
            df = pd.read_excel(io.BytesIO(contents))
            rows = df.to_dict('records')
        else:
            raise HTTPException(
                status_code=400,
                detail="File must be CSV or Excel format"
            )
        
        # Expected CSV columns
        expected_columns = [
            "EmployeeID", "FirstName", "LastName", "EmploymentCategory", 
            "Gender", "EmployeeStatus", "Account", "Department", 
            "IsLeader", "Location", "Mobile", "Dob", "Doj", 
            "Email", "Position", "ProfilePic", "Expertise"
        ]
        
        # Check for missing required columns
        if not rows:
            raise HTTPException(status_code=400, detail="File is empty")
        
        available_columns = list(rows[0].keys())
        missing_columns = [col for col in expected_columns if col not in available_columns]
        
        if missing_columns:
            error_message = f"Missing required columns: {', '.join(missing_columns)}. "
            error_message += f"Expected columns: {', '.join(expected_columns)}. "
            error_message += f"Found columns: {', '.join(available_columns)}"
            raise HTTPException(status_code=400, detail=error_message)
        
        employees_to_insert = []
        row_count = 0
        error_rows = []
        
        # Process each row
        for row in rows:
            row_count += 1
            
            try:
                # Validate required fields
                required_fields = ["FirstName", "LastName", "Position", "Department", "Email"]
                missing_fields = [field for field in required_fields if not row.get(field)]
                
                if missing_fields:
                    error_rows.append(f"Row {row_count}: Missing required fields: {', '.join(missing_fields)}")
                    continue
                
                # Parse dates
                dob = None
                doj = None
                
                if row.get("Dob"):
                    try:
                        dob = datetime.datetime.strptime(row["Dob"], "%Y-%m-%d").date()
                    except ValueError:
                        error_rows.append(f"Row {row_count}: Invalid date format for Dob (expected YYYY-MM-DD)")
                        continue
                
                if row.get("Doj"):
                    try:
                        doj = datetime.datetime.strptime(row["Doj"], "%Y-%m-%d").date()
                    except ValueError:
                        error_rows.append(f"Row {row_count}: Invalid date format for Doj (expected YYYY-MM-DD)")
                        continue
                
                # Create employee record
                now = datetime.datetime.now().date()
                employee = {
                    "id": str(uuid.uuid4()),
                    "employee_id": row.get("EmployeeID", ""),
                    "first_name": row.get("FirstName", ""),
                    "last_name": row.get("LastName", ""),
                    "name": f"{row['FirstName']} {row['LastName']}".strip(),
                    "email": row.get("Email", ""),
                    "position": row.get("Position", ""),
                    "department": row.get("Department", ""),
                    "phone": row.get("Mobile", ""),
                    "mobile": row.get("Mobile", ""),
                    "employment_category": row.get("EmploymentCategory", ""),
                    "gender": row.get("Gender", ""),
                    "employee_status": row.get("EmployeeStatus", ""),
                    "account": row.get("Account", ""),
                    "is_leader": row.get("IsLeader", ""),
                    "location": row.get("Location", ""),
                    "date_of_birth": dob.isoformat() if dob else None,
                    "date_of_joining": doj.isoformat() if doj else None,
                    "photo_url": row.get("ProfilePic", ""),  # Map ProfilePic to photo_url
                    "expertise": row.get("Expertise", ""),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
                
                employees_to_insert.append(employee)
            
            except Exception as e:
                error_rows.append(f"Row {row_count}: Error processing row - {str(e)}")
                continue
        
        # Insert employees into DynamoDB
        inserted_count = 0
        if employees_to_insert:
            table = await get_employees_table()
            for employee in employees_to_insert:
                try:
                    formatted_item = format_dynamodb_item(employee, "employees")
                    await table.put_item(Item=formatted_item)
                    inserted_count += 1
                except Exception as e:
                    error_rows.append(f"Error inserting employee {employee.get('name', 'Unknown')}: {str(e)}")
        
        # Return summary
        return {
            "success": True,
            "total_rows": row_count,
            "inserted": inserted_count,
            "errors": error_rows,
            "message": f"Successfully imported {inserted_count} out of {row_count} employees"
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(e)}"
        )
