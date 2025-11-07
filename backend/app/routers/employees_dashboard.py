from fastapi import APIRouter, HTTPException, Depends
from typing import List
import datetime

from ..database_dynamodb import get_employees_table, parse_dynamodb_item
from ..security import get_current_active_user

router = APIRouter(
    prefix="/api/employees-dashboard",
    tags=["employees-dashboard"],
    responses={404: {"description": "Not found"}},
)

@router.get("/")
async def get_employees_dashboard(current_user: dict = Depends(get_current_active_user)):
    """Get comprehensive employee analytics data for dashboard visualization"""
    try:
        # Get all employees - use parallel queries for better performance
        table = await get_employees_table()
        
        # For dashboard, we need all employees, so we'll use scan but with better pagination
        # In a production environment, consider using parallel scans or caching
        response = await table.scan(
            Limit=1000  # Limit initial scan to avoid timeout
        )
        
        if "Items" not in response:
            return {
                "total_employees": 0,
                "monthly_headcount": [],
                "by_account": {},
                "by_location": {},
                "by_employee_status": {},
                "by_employment_category": {},
                "by_is_leader": {},
                "by_expertise": {},
                "by_department": {},
                "by_gender": {},
                "employees": []
            }
        
        employees = []
        for item in response["Items"]:
            employee = parse_dynamodb_item(item)
            employees.append(employee)
        
        # Calculate monthly headcount data
        monthly_headcount = []
        current_year = datetime.datetime.now().year
        
        for month in range(1, 13):
            month_date = datetime.datetime(current_year, month, 1)
            end_date = datetime.datetime(current_year, month + 1, 1) if month < 12 else datetime.datetime(current_year + 1, 1, 1)
            
            # Count active employees who joined before or during this month
            count = 0
            for emp in employees:
                # Only count active employees - default to "active" if status field doesn't exist
                emp_status = emp.get("status", "active")
                if emp_status == "inactive":
                    continue
                    
                join_date_str = emp.get("date_of_joining") or emp.get("created_at")
                if join_date_str:
                    try:
                        join_date = datetime.datetime.fromisoformat(join_date_str.replace('Z', '+00:00'))
                        if join_date <= end_date:
                            count += 1
                    except:
                        # If date parsing fails, count as joined
                        count += 1
            
            monthly_headcount.append({
                "month": month_date.strftime("%b"),
                "count": count,
                "month_number": month
            })
        
        # Calculate distribution data
        by_account = {}
        by_location = {}
        by_employee_status = {}
        by_employment_category = {}
        by_is_leader = {}
        by_expertise = {}
        by_department = {}
        by_gender = {}
        by_status = {}
        
        for emp in employees:
            # Skip inactive employees for distribution calculations
            # Default to "active" if status field doesn't exist
            emp_status = emp.get("status", "active")
            if emp_status == "inactive":
                continue
                
            # Account distribution
            account = emp.get("account", "Unknown")
            by_account[account] = by_account.get(account, 0) + 1
            
            # Location distribution - consolidate remote locations
            location = emp.get("location", "Unknown")
            normalized_location = location.lower().strip()
            
            # Consolidate remote locations
            if normalized_location.startswith('remote -') or normalized_location == 'remote':
                consolidated_location = 'Remote'
            else:
                consolidated_location = location
            
            by_location[consolidated_location] = by_location.get(consolidated_location, 0) + 1
            
            # Employee status distribution
            status = emp.get("employee_status", "Unknown")
            by_employee_status[status] = by_employee_status.get(status, 0) + 1
            
            # Employment category distribution
            category = emp.get("employment_category", "Unknown")
            by_employment_category[category] = by_employment_category.get(category, 0) + 1
            
            # Is leader distribution
            is_leader = emp.get("is_leader", "No")
            by_is_leader[is_leader] = by_is_leader.get(is_leader, 0) + 1
            
            # Expertise distribution
            expertise = emp.get("expertise", "Unknown")
            by_expertise[expertise] = by_expertise.get(expertise, 0) + 1
            
            # Department distribution
            department = emp.get("department", "Unknown")
            by_department[department] = by_department.get(department, 0) + 1
            
            # Gender distribution
            gender = emp.get("gender", "Unknown")
            by_gender[gender] = by_gender.get(gender, 0) + 1
            
            # Status distribution
            status = emp.get("status", "active")
            by_status[status] = by_status.get(status, 0) + 1
        
        # Count only active employees - default to "active" if status field doesn't exist
        active_employees = [emp for emp in employees if emp.get("status", "active") != "inactive"]
        
        return {
            "total_employees": len(active_employees),
            "monthly_headcount": monthly_headcount,
            "by_account": by_account,
            "by_location": by_location,
            "by_employee_status": by_employee_status,
            "by_employment_category": by_employment_category,
            "by_is_leader": by_is_leader,
            "by_expertise": by_expertise,
            "by_department": by_department,
            "by_gender": by_gender,
            "by_status": by_status,
            "employees": employees  # Include full employee data for filtering
        }
        
    except Exception as e:
        print(f"Error getting dashboard data: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get dashboard data: {str(e)}"
        )
