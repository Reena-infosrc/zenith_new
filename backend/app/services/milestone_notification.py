"""
Milestone Notification Service
Sends notifications to users and managers when milestones are approaching due dates
"""
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging
from ..database_dynamodb import get_goals_table, get_employees_table, parse_dynamodb_item
from boto3.dynamodb.conditions import Key

logger = logging.getLogger(__name__)

async def get_upcoming_milestones(days_ahead: int = 7) -> List[Dict[str, Any]]:
    """
    Get all milestones that are due within the specified number of days
    Returns list of milestones with goal and employee information
    """
    try:
        goals_table = await get_goals_table()
        employees_table = await get_employees_table()
        
        # Scan all goals (in production, you might want to use a GSI for better performance)
        response = await goals_table.scan()
        
        upcoming_milestones = []
        today = datetime.utcnow().date()
        target_date = today + timedelta(days=days_ahead)
        
        for item in response.get("Items", []):
            goal = parse_dynamodb_item(item, "goals")
            milestones = goal.get("milestones", [])
            
            for milestone in milestones:
                # Skip completed milestones
                if milestone.get("completed", False):
                    continue
                
                try:
                    due_date = datetime.fromisoformat(milestone.get("dueDate", "")).date()
                    
                    # Check if milestone is due within the specified days
                    if today <= due_date <= target_date:
                        # Get employee information
                        employee_id = goal.get("employeeId")
                        employee_info = None
                        manager_info = None
                        
                        if employee_id:
                            emp_response = await employees_table.get_item(Key={"id": employee_id})
                            if "Item" in emp_response:
                                employee_info = parse_dynamodb_item(emp_response["Item"], "employees")
                                
                                # Get manager information
                                reporting_to = employee_info.get("reporting_to")
                                if reporting_to:
                                    mgr_response = await employees_table.get_item(Key={"id": reporting_to})
                                    if "Item" in mgr_response:
                                        manager_info = parse_dynamodb_item(mgr_response["Item"], "employees")
                        
                        upcoming_milestones.append({
                            "goal": goal,
                            "milestone": milestone,
                            "employee": employee_info,
                            "manager": manager_info,
                            "days_until_due": (due_date - today).days
                        })
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error parsing milestone due date: {str(e)}")
                    continue
        
        return upcoming_milestones
        
    except Exception as e:
        logger.error(f"Error fetching upcoming milestones: {str(e)}")
        return []

async def send_milestone_notifications(days_ahead: int = 7):
    """
    Send notifications for milestones due within the specified days
    This function should be called periodically (e.g., daily via cron job or scheduled task)
    """
    try:
        upcoming_milestones = await get_upcoming_milestones(days_ahead)
        
        notifications_sent = []
        
        for item in upcoming_milestones:
            goal = item["goal"]
            milestone = item["milestone"]
            employee = item["employee"]
            manager = item["manager"]
            days_until_due = item["days_until_due"]
            
            # Prepare notification data
            notification_data = {
                "type": "milestone_due_soon",
                "goal_id": goal.get("id"),
                "goal_title": goal.get("title"),
                "milestone_id": milestone.get("id"),
                "milestone_title": milestone.get("title"),
                "due_date": milestone.get("dueDate"),
                "days_until_due": days_until_due,
                "employee_id": goal.get("employeeId"),
                "employee_email": employee.get("email") if employee else None,
                "employee_name": employee.get("name") if employee else None,
                "manager_email": manager.get("email") if manager else None,
                "manager_name": manager.get("name") if manager else None,
            }
            
            # TODO: Implement actual notification sending
            # This could be:
            # 1. Email notification via SES
            # 2. In-app notification stored in a notifications table
            # 3. Push notification
            # 4. Slack/Teams integration
            
            # For now, just log the notification
            logger.info(f"Milestone notification: {notification_data}")
            
            notifications_sent.append(notification_data)
        
        return {
            "notifications_sent": len(notifications_sent),
            "notifications": notifications_sent
        }
        
    except Exception as e:
        logger.error(f"Error sending milestone notifications: {str(e)}")
        return {
            "notifications_sent": 0,
            "error": str(e)
        }

async def check_overdue_milestones():
    """
    Check for overdue milestones and send notifications
    """
    try:
        goals_table = await get_goals_table()
        employees_table = await get_employees_table()
        
        response = await goals_table.scan()
        
        overdue_milestones = []
        today = datetime.utcnow().date()
        
        for item in response.get("Items", []):
            goal = parse_dynamodb_item(item, "goals")
            milestones = goal.get("milestones", [])
            
            for milestone in milestones:
                if milestone.get("completed", False):
                    continue
                
                try:
                    due_date = datetime.fromisoformat(milestone.get("dueDate", "")).date()
                    
                    if due_date < today:
                        # Get employee and manager info
                        employee_id = goal.get("employeeId")
                        employee_info = None
                        manager_info = None
                        
                        if employee_id:
                            emp_response = await employees_table.get_item(Key={"id": employee_id})
                            if "Item" in emp_response:
                                employee_info = parse_dynamodb_item(emp_response["Item"], "employees")
                                
                                reporting_to = employee_info.get("reporting_to")
                                if reporting_to:
                                    mgr_response = await employees_table.get_item(Key={"id": reporting_to})
                                    if "Item" in mgr_response:
                                        manager_info = parse_dynamodb_item(mgr_response["Item"], "employees")
                        
                        overdue_milestones.append({
                            "goal": goal,
                            "milestone": milestone,
                            "employee": employee_info,
                            "manager": manager_info,
                            "days_overdue": (today - due_date).days
                        })
                except (ValueError, TypeError):
                    continue
        
        return overdue_milestones
        
    except Exception as e:
        logger.error(f"Error checking overdue milestones: {str(e)}")
        return []

