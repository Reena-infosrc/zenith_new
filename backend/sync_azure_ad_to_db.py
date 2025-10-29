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

def sync_users(json_file_path):
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
    
    # Process each user
    for user in azure_users:
        email = user.get('email', '')
        user_principal_name = user.get('user_principal_name', '')
        
        # Check if user should be excluded
        if email.lower() in excluded_set or (user_principal_name and user_principal_name.lower() in excluded_set):
            excluded_count += 1
            continue
        
        # Check if email already exists (case-insensitive)
        if check_email_exists_case_insensitive(table, email):
            print(f"Skipping existing user: {email} (already in database)")
            duplicate_count += 1
            continue
        
        # Map and insert
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
    print(f"  Total skipped: {skipped_count}")
    print("="*60)

if __name__ == "__main__":
    json_file = 'azure_ad_users.json'
    
    print("Azure AD to DynamoDB Sync")
    print("="*60)
    
    if not os.path.exists(json_file):
        print(f"Error: {json_file} not found")
        exit(1)
    
    sync_users(json_file)
    
    print("\nSync complete!")
