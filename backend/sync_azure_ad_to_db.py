#!/usr/bin/env python3
"""
Script to sync Azure AD users from JSON to DynamoDB.
- Handles case-insensitive email comparison
- Prevents duplicate entries
- Normalizes emails to lowercase
"""

import boto3
from boto3.dynamodb.conditions import Attr, Key
from decimal import Decimal
from datetime import datetime
import json
import uuid
import os
from dotenv import load_dotenv
import argparse

# Load environment variables
load_dotenv()

# Initialize DynamoDB
region = os.getenv("AWS_REGION", "us-east-1")
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table('zenith-hr-employees')

def generate_id():
    """Generate a unique ID for new items"""
    return str(uuid.uuid4())

def format_dynamodb_item(item):
    """Format an item for DynamoDB (handle None, floats, dates)"""
    if item is None:
        return None
    if isinstance(item, dict):
        return {k: format_dynamodb_item(v) for k, v in item.items()}
    if isinstance(item, list):
        return [format_dynamodb_item(v) for v in item]
    if isinstance(item, float):
        return Decimal(str(item))
    if isinstance(item, datetime):
        return item.isoformat()
    return item

def check_email_exists_case_insensitive(table, email):
    """
    Check if an email exists in the database (case-insensitive).
    Returns True if exists, False otherwise.
    """
    if not email:
        return False
    
    email_lower = email.lower()
    
    try:
        # Query EmailIndex GSI
        response = table.query(
            IndexName='EmailIndex',
            KeyConditionExpression=Key('email').eq(email_lower),
            Limit=1
        )
        
        if response['Items']:
            return True
        
        # Fallback: Scan with filter (case-insensitive search)
        response = table.scan(
            FilterExpression=Attr('email').exists(),
            Limit=100
        )
        
        for item in response['Items']:
            if item.get('email', '').lower() == email_lower:
                return True
        
        # If we got all items and still no match, email doesn't exist
        return False
        
    except Exception as e:
        print(f"Error checking email existence for {email}: {str(e)}")
        return False

def get_employee_by_email(table, email_lower: str):
    """Fetch an employee item by case-normalized email using GSI, fallback to scan."""
    if not email_lower:
        return None
    try:
        # Try GSI first
        response = table.query(
            IndexName='EmailIndex',
            KeyConditionExpression=Key('email').eq(email_lower),
            Limit=1
        )
        if response.get('Items'):
            return response['Items'][0]

        # Fallback scan limited
        response = table.scan(
            FilterExpression=Attr('email').exists(),
            Limit=200
        )
        for item in response.get('Items', []):
            if item.get('email', '').lower() == email_lower:
                return item
    except Exception as e:
        print(f"Error fetching employee by email {email_lower}: {str(e)}")
    return None

def update_reporting_to_by_manager_email(table, employee_email_lower: str, manager_email_lower: str, skip_if_already_set: bool = True) -> bool:
    """
    Set reporting_to for the employee (by email) using manager's email.
    - Looks up manager by email to get manager id
    - Updates employee item setting reporting_to to manager id
    Returns True if updated, False if employee or manager not found or on error.
    """
    try:
        if not employee_email_lower or not manager_email_lower:
            return False

        # Find employee to update
        employee = get_employee_by_email(table, employee_email_lower)
        if not employee:
            # No employee with that email
            return False

        # Find manager by email
        manager = get_employee_by_email(table, manager_email_lower)
        if not manager:
            # Manager not found yet in DB
            return False

        manager_id = manager.get('id')
        if not manager_id:
            return False

        # Update reporting_to if changed or missing
        employee_id = employee.get('id')
        if not employee_id:
            return False

        current_reporting_to = employee.get('reporting_to')
        # If requested, skip when reporting_to already has any value
        if skip_if_already_set and current_reporting_to:
            return False
        # If it's already the manager_id, no-op counted as success
        if current_reporting_to == manager_id:
            return True

        table.update_item(
            Key={'id': employee_id},
            UpdateExpression='SET reporting_to = :mgr',
            ExpressionAttributeValues={':mgr': manager_id}
        )
        return True
    except Exception as e:
        print(f"Error updating reporting_to for {employee_email_lower} -> {manager_email_lower}: {str(e)}")
        return False

def derive_location_from_teams(azure_user: dict) -> str | None:
    """
    Determine location based on teams.manager.joined_teams[].displayName.
    Priority: Team-Chn -> Chennai; Team-Hyd -> Hyderabad; Info Services US Employees -> USA;
    Info Services India Employees -> Remote
    """
    try:
        teams = azure_user.get('teams') or {}
        manager = teams.get('manager') or {}
        joined = manager.get('joined_teams') or []
        # Collect display names in a normalized form
        names = [str(t.get('displayName', '')).strip() for t in joined if isinstance(t, dict)]
        # Priority order checks
        for n in names:
            if n == 'Team-Chn':
                return 'Chennai'
        for n in names:
            if n == 'Team-Hyd':
                return 'Hyderabad'
        for n in names:
            if n == 'Info Services US Employees':
                return 'USA'
        for n in names:
            if n == 'Info Services India Employees':
                return 'Remote'
    except Exception:
        pass
    return None

def normalize_location_from_signals(azure_user: dict, current_location: str) -> str | None:
    """
    Normalize to one of: Chennai, Hyderabad, USA, Remote using broader signals:
    - Prefer explicit city keywords in any signal
    - If any US signal detected (US/USA/United States/state names), map to USA
    - If country is India (or empty) and not Chennai/Hyderabad, map to Remote
    Signals checked (in order):
      current_location, azure office_location, address.country, address.city
    """
    def text(*parts: str) -> str:
        return (" ".join([p for p in parts if p])).lower()

    signals = []
    signals.append(current_location)
    signals.append(str((azure_user.get('office_location') or '')).strip())
    addr = azure_user.get('address') or {}
    signals.append(str(addr.get('city') or '').strip())
    signals.append(str(addr.get('country') or '').strip())
    blob = text(*signals)

    if 'chennai' in blob:
        return 'Chennai'
    if 'hyd' in blob or 'hyderabad' in blob:
        return 'Hyderabad'

    us_keywords = [
        'usa','united states','us ',' us',' texas',' georgia',' jersey',' michigan',' new york',' ny',' ga',' tx',' nj',' mi',' ca',' california',
        'rochester','houston','springfield','livonia','cumming','georgia','texas','new jersey'
    ]
    if any(k in blob for k in us_keywords):
        return 'USA'

    country = str(addr.get('country') or '').lower()
    if country == 'india' or 'india' in blob:
        return 'Remote'

    # If nothing matches, try to coerce common variants
    if current_location.lower() == 'us':
        return 'USA'
    if current_location.lower() == 'home office':
        return 'Remote'
    return None

def update_location_from_azure_teams(table, employee_email_lower: str, azure_user: dict) -> tuple[bool, str]:
    """
    Update the employee's location based on teams.manager.joined_teams rules.
    - Skip entirely if the current DB location is "Remote"
    - Apply priority mapping to set location if different
    Returns (changed: bool, reason: str)
    """
    try:
        emp = get_employee_by_email(table, employee_email_lower)
        if not emp:
            return (False, 'employee-not-found')
        current_location = (emp.get('location') or '').strip()
        # If DB has empty location, set to USA directly
        if not current_location:
            table.update_item(
                Key={'id': emp.get('id')},
                UpdateExpression='SET #location = :loc',
                ExpressionAttributeNames={'#location': 'location'},
                ExpressionAttributeValues={':loc': 'USA'}
            )
            return (True, 'USA')
        if current_location == 'Remote':
            return (False, 'skip-remote')
        # 1) Attempt derive from teams (priority rules)
        derived = derive_location_from_teams(azure_user)
        # 2) Fall back to broader normalization rules to force into the 4 canonical buckets
        if not derived:
            derived = normalize_location_from_signals(azure_user, current_location)
        if not derived:
            return (False, 'no-derived')
        # Even if derived equals current, perform the update to normalize/store consistently
        table.update_item(
            Key={'id': emp.get('id')},
            UpdateExpression='SET #location = :loc',
            ExpressionAttributeNames={'#location': 'location'},
            ExpressionAttributeValues={':loc': derived}
        )
        return (True, derived)
    except Exception as e:
        print(f"Error updating location for {employee_email_lower}: {str(e)}")
        return (False, 'error')

def insert_employee(table, employee_data):
    """Insert a new employee into DynamoDB"""
    try:
        # Normalize email to lowercase
        if 'email' in employee_data:
            employee_data['email'] = employee_data['email'].lower()
        
        formatted_item = format_dynamodb_item(employee_data)
        table.put_item(Item=formatted_item)
        return True
    except Exception as e:
        print(f"Error inserting employee: {str(e)}")
        return False

def map_azure_user_to_employee(azure_user):
    """
    Map Azure AD user data to employee schema.
    All emails are normalized to lowercase.
    """
    # Extract fields from Azure user
    display_name = azure_user.get('display_name', '')
    email = azure_user.get('email', '').lower()  # Normalize to lowercase
    department = azure_user.get('department', '')
    job_title = azure_user.get('job_title', '')
    office_location = azure_user.get('office_location', '')
    employee_id = azure_user.get('employee_id', '')
    
    # Current date in YYYY-MM-DD format
    current_date = datetime.now().strftime('%Y-%m-%d')
    
    # Map to employee schema
    employee_data = {
        'id': generate_id(),
        'employee_id': employee_id,
        'name': display_name,
        'email': email,  # Already lowercase
        'department': department if department else 'Internal',  # Default to 'Internal'
        'position': job_title if job_title else 'Employee',  # Default to 'Employee'
        'location': office_location if office_location else '',
        'phone': '',
        'photo_url': '',
        'manager_email': '',
        'status': 'active',
        'hire_date': '',
        'created_at': current_date,  # YYYY-MM-DD format
        'updated_at': current_date,  # YYYY-MM-DD format
    }
    
    return employee_data

def sync_users(json_file_path, update_reporting_only: bool = False, update_location_only: bool = False):
    """Main function to sync users from JSON to DynamoDB"""
    
    # Load excluded users
    excluded_users_path = os.path.join(os.path.dirname(json_file_path), 'excluded_users.json')
    excluded_set = set()
    
    if os.path.exists(excluded_users_path):
        with open(excluded_users_path, 'r') as f:
            excluded_list = json.load(f)
            excluded_set = {email.lower() for email in excluded_list}
        print(f"Loaded {len(excluded_set)} excluded users")
    
    # Load Azure AD users from JSON
    print(f"Loading users from {json_file_path}...")
    with open(json_file_path, 'r') as f:
        azure_users = json.load(f)
    
    print(f"Found {len(azure_users)} users in JSON file")
    
    # Track stats
    skipped_count = 0
    added_count = 0
    excluded_count = 0
    duplicate_count = 0
    updated_reporting_count = 0
    updated_location_count = 0
    skipped_location_remote = 0
    skipped_location_nochange = 0
    skipped_reporting_already_set = 0
    
    # Process each user
    total = len(azure_users)
    for idx, user in enumerate(azure_users, start=1):
        # Use user_principal_name as authoritative email for matching (lowercased), fallback to email
        user_principal_name = (user.get('user_principal_name') or '').strip()
        email = (user.get('email') or '').strip()
        effective_email_lower = (user_principal_name or email).lower()
        
        # Check if user should be excluded
        print(f"[{idx}/{total}] Processing: upn/email={user_principal_name or email} -> key={effective_email_lower}", flush=True)
        if (email.lower() in excluded_set) or (user_principal_name and user_principal_name.lower() in excluded_set):
            excluded_count += 1
            print(f"  - Skipped (excluded): {user_principal_name or email}", flush=True)
            continue
        
        # If the employee exists, update fields based on mode flags
        if check_email_exists_case_insensitive(table, effective_email_lower):
            duplicate_count += 1
            # reporting_to (skip if location-only)
            if not update_location_only:
                manager_email = (
                    (user.get('organization') or {}).get('manager', {})
                ).get('manager_email') or ''
                manager_email_lower = manager_email.lower()
                if manager_email_lower:
                    updated = update_reporting_to_by_manager_email(
                        table,
                        effective_email_lower,
                        manager_email_lower,
                        skip_if_already_set=True
                    )
                    if updated:
                        updated_reporting_count += 1
                        print(f"  - Updated reporting_to -> manager_email={manager_email_lower}", flush=True)
                    else:
                        # Determine if skipped because already set
                        existing = get_employee_by_email(table, effective_email_lower)
                        if existing and existing.get('reporting_to'):
                            skipped_reporting_already_set += 1
                            print(f"  - Skipped (reporting_to already set)", flush=True)
                        else:
                            print(f"  - Skipped (manager not found or no change): manager_email={manager_email_lower}", flush=True)
                else:
                    print(f"  - No manager_email found in JSON", flush=True)

            # Update location from teams mapping with priority, respecting remote skip
            changed, reason = update_location_from_azure_teams(table, effective_email_lower, user)
            if changed:
                updated_location_count += 1
                print(f"  - Updated location -> {reason}", flush=True)
            else:
                if reason == 'skip-remote':
                    skipped_location_remote += 1
                    print(f"  - Skipped location (already Remote)", flush=True)
                elif reason in ('no-change', 'no-derived'):
                    skipped_location_nochange += 1
                else:
                    print(f"  - Skipped location ({reason})", flush=True)
            # In reporting-only or location-only mode, do not attempt insert logic for existing users
            if update_reporting_only or update_location_only:
                continue
            # If not reporting-only, we still skip inserts for existing users
            continue
        
        # Map and insert
        if update_reporting_only or update_location_only:
            # In these modes, we do not create new employees
            skipped_count += 1
            continue
        employee_data = map_azure_user_to_employee(user)
        employee_data['email'] = employee_data['email'].lower()  # Ensure lowercase
        
        if insert_employee(table, employee_data):
            print(f"Added: {employee_data['name']} ({employee_data['email']})")
            added_count += 1
        else:
            print(f"Failed to add: {employee_data['name']}")
    
    # Summary
    print("\n" + "="*60)
    print("Sync Summary:")
    print(f"  Total users processed: {len(azure_users)}")
    print(f"  New users added: {added_count}")
    print(f"  Skipped (excluded): {excluded_count}")
    print(f"  Skipped (duplicates): {duplicate_count}")
    print(f"  Updated reporting_to: {updated_reporting_count}")
    print(f"  Skipped (reporting_to already set): {skipped_reporting_already_set}")
    print(f"  Updated location: {updated_location_count}")
    print(f"  Skipped location (already Remote): {skipped_location_remote}")
    print(f"  Skipped location (no change/undetermined): {skipped_location_nochange}")
    print(f"  Total skipped: {skipped_count}")
    print("="*60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Azure AD users to DynamoDB")
    parser.add_argument("--json", dest="json_file", default="azure_ad_users.json", help="Path to azure_ad_users.json")
    parser.add_argument("--update-reporting-only", action="store_true", help="Only update reporting_to based on manager_email; do not insert new users")
    parser.add_argument("--update-location-only", action="store_true", help="Only update location from teams membership; do not insert or update reporting_to")
    args = parser.parse_args()

    json_file = args.json_file

    print("Azure AD to DynamoDB Sync")
    print("="*60)

    if not os.path.exists(json_file):
        print(f"Error: {json_file} not found")
        exit(1)

    sync_users(json_file, update_reporting_only=args.update_reporting_only, update_location_only=args.update_location_only)

    print("\nSync complete!")
