#!/usr/bin/env python3
"""
Script to clean up duplicate email addresses from the database.
- Finds duplicates (case-insensitive email comparison)
- Removes newer entries, keeps the oldest one (based on updated_at)
- Normalizes all emails to lowercase
"""

import boto3
from datetime import datetime
from collections import defaultdict
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize DynamoDB
region = os.getenv("AWS_REGION", "us-east-1")
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table('zenith-hr-employees')

def parse_date(date_str):
    """Parse date string in various formats"""
    if not date_str:
        return datetime.min
    try:
        # Try YYYY-MM-DD format
        return datetime.strptime(date_str.split('T')[0], '%Y-%m-%d')
    except:
        try:
            # Try full ISO format
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return datetime.min

def cleanup_duplicates():
    """Find and remove duplicate emails"""
    print("Scanning database for all employees...")
    
    # Scan all items
    response = table.scan()
    items = response['Items']
    
    # Paginate if necessary
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])
    
    print(f"Found {len(items)} total employees")
    
    # Group by lowercase email
    email_groups = defaultdict(list)
    
    for item in items:
        email = item.get('email', '').lower() if item.get('email') else ''
        if email:
            email_groups[email].append(item)
    
    # Find duplicates
    duplicates_found = []
    to_delete = []
    
    for email, items_group in email_groups.items():
        if len(items_group) > 1:
            duplicates_found.append(email)
            print(f"\nDuplicate found: {email} ({len(items_group)} entries)")
            
            # Sort by updated_at, keeping the oldest
            items_group.sort(key=lambda x: parse_date(x.get('updated_at', '')))
            
            # Keep the first (oldest), delete the rest
            for i, item in enumerate(items_group[1:], 1):
                to_delete.append({
                    'email': email,
                    'item': item,
                    'name': item.get('name', 'N/A'),
                    'employee_id': item.get('employee_id', 'N/A'),
                    'updated_at': item.get('updated_at', 'N/A')
                })
                print(f"  Will delete #{i+1}: {item.get('name')} (ID: {item.get('employee_id')}, Updated: {item.get('updated_at')})")
    
    print(f"\n\nSummary:")
    print(f"Total employees: {len(items)}")
    print(f"Unique emails: {len(email_groups)}")
    print(f"Duplicate email groups: {len(duplicates_found)}")
    print(f"Items to delete: {len(to_delete)}")
    
    if not to_delete:
        print("\nNo duplicates found to delete.")
        return
    
    # Confirm deletion
    print("\n" + "="*80)
    response = input(f"\nDo you want to delete {len(to_delete)} duplicate entries? (yes/no): ")
    
    if response.lower() != 'yes':
        print("Operation cancelled.")
        return
    
    # Delete duplicates
    deleted_count = 0
    errors = []
    
    for entry in to_delete:
        try:
            item = entry['item']
            table.delete_item(
                Key={
                    'id': item['id']
                }
            )
            print(f"✓ Deleted: {entry['name']} ({entry['email']})")
            deleted_count += 1
        except Exception as e:
            error_msg = f"Error deleting {entry['name']}: {str(e)}"
            print(f"✗ {error_msg}")
            errors.append(error_msg)
    
    print("\n" + "="*80)
    print(f"Deletion complete!")
    print(f"Successfully deleted: {deleted_count}")
    if errors:
        print(f"Errors: {len(errors)}")
        for error in errors:
            print(f"  - {error}")

def normalize_emails_to_lowercase():
    """Normalize all email addresses to lowercase in the database"""
    print("\n" + "="*80)
    print("Normalizing email addresses to lowercase...")
    
    # Scan all items
    response = table.scan()
    items = response['Items']
    
    # Paginate if necessary
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])
    
    # Find items with non-lowercase emails
    to_update = []
    
    for item in items:
        email = item.get('email', '')
        if email and email != email.lower():
            to_update.append(item)
            print(f"Found: {item.get('name')} ({email} -> {email.lower()})")
    
    if not to_update:
        print("All emails are already lowercase.")
        return
    
    print(f"\nFound {len(to_update)} emails to normalize")
    
    # Confirm update
    response = input(f"\nDo you want to normalize these emails to lowercase? (yes/no): ")
    
    if response.lower() != 'yes':
        print("Operation cancelled.")
        return
    
    # Update emails
    updated_count = 0
    errors = []
    
    for item in to_update:
        try:
            email_lower = item.get('email', '').lower()
            table.update_item(
                Key={'id': item['id']},
                UpdateExpression='SET email = :email, updated_at = :updated_at',
                ExpressionAttributeValues={
                    ':email': email_lower,
                    ':updated_at': datetime.now().strftime('%Y-%m-%d')
                }
            )
            print(f"✓ Updated: {item.get('name')} -> {email_lower}")
            updated_count += 1
        except Exception as e:
            error_msg = f"Error updating {item.get('name')}: {str(e)}"
            print(f"✗ {error_msg}")
            errors.append(error_msg)
    
    print("\n" + "="*80)
    print(f"Email normalization complete!")
    print(f"Successfully updated: {updated_count}")
    if errors:
        print(f"Errors: {len(errors)}")
        for error in errors:
            print(f"  - {error}")

def delete_excluded_users():
    """Delete users from excluded_users.json from the database"""
    print("\n" + "="*80)
    print("Deleting excluded users from database...")
    
    # Load excluded users
    with open('excluded_users.json', 'r') as f:
        excluded_users = json.load(f)
    
    # Convert to lowercase set for case-insensitive matching
    excluded_set = {email.lower() for email in excluded_users}
    
    print(f"Loaded {len(excluded_set)} excluded users")
    
    # Scan all items
    response = table.scan()
    items = response['Items']
    
    # Paginate if necessary
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])
    
    # Find items to delete
    to_delete = []
    
    for item in items:
        email = item.get('email', '')
        user_principal_name = item.get('user_principal_name', '')
        
        # Check if email or user_principal_name is in excluded list
        if email and email.lower() in excluded_set:
            to_delete.append({
                'item': item,
                'reason': f"excluded email: {email}"
            })
        elif user_principal_name and user_principal_name.lower() in excluded_set:
            to_delete.append({
                'item': item,
                'reason': f"excluded UPN: {user_principal_name}"
            })
    
    if not to_delete:
        print("No excluded users found in database.")
        return
    
    print(f"\nFound {len(to_delete)} users to delete:")
    for entry in to_delete:
        item = entry['item']
        print(f"  - {item.get('name')} ({item.get('email')}): {entry['reason']}")
    
    # Confirm deletion
    response = input(f"\nDo you want to delete these {len(to_delete)} users? (yes/no): ")
    
    if response.lower() != 'yes':
        print("Operation cancelled.")
        return
    
    # Delete users
    deleted_count = 0
    errors = []
    
    for entry in to_delete:
        try:
            item = entry['item']
            table.delete_item(
                Key={'id': item['id']}
            )
            print(f"✓ Deleted: {item.get('name')} ({item.get('email')})")
            deleted_count += 1
        except Exception as e:
            error_msg = f"Error deleting {item.get('name')}: {str(e)}"
            print(f"✗ {error_msg}")
            errors.append(error_msg)
    
    print("\n" + "="*80)
    print(f"Deletion complete!")
    print(f"Successfully deleted: {deleted_count}")
    if errors:
        print(f"Errors: {len(errors)}")
        for error in errors:
            print(f"  - {error}")

if __name__ == "__main__":
    print("实体 Database Cleanup Script")
    print("="*80)
    
    # Step 1: Delete excluded users
    delete_excluded_users()
    
    # Step 2: Normalize emails to lowercase
    normalize_emails_to_lowercase()
    
    # Step 3: Clean up duplicates
    cleanup_duplicates()
    
    print("\n" + "="*80)
    print("All cleanup operations complete!")
    print("="*80)

