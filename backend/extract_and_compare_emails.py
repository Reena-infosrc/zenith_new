#!/usr/bin/env python3
"""
Script to extract emails from CSV and DynamoDB, then compare them.
1. Extract emails from CSV file (lowercase) -> Original Indian Employees.json
2. Download all emails from DynamoDB -> All employees.json
3. Download USA employees emails -> USA employees.json
4. Download Indian employees emails -> Indian employees.json
5. Compare Original Indian Employees.json with Indian employees.json
"""

import boto3
from boto3.dynamodb.conditions import Attr
from decimal import Decimal
import json
import csv
import os
from dotenv import load_dotenv
from typing import List, Set

# Load environment variables
load_dotenv()

# Initialize DynamoDB
region = os.getenv("AWS_REGION", "us-east-1")
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table('zenith-hr-employees')

def parse_dynamodb_item(item: dict) -> dict:
    """Convert DynamoDB item to regular Python dict (handle Decimal types)"""
    if isinstance(item, dict):
        parsed = {}
        for key, value in item.items():
            if isinstance(value, Decimal):
                parsed[key] = float(value)
            elif isinstance(value, dict):
                parsed[key] = parse_dynamodb_item(value)
            elif isinstance(value, list):
                parsed[key] = [parse_dynamodb_item(v) if isinstance(v, dict) else (float(v) if isinstance(v, Decimal) else v) for v in value]
            else:
                parsed[key] = value
        return parsed
    return item

def scan_table_with_filter(filter_expression=None):
    """Scan DynamoDB table with optional filter expression"""
    all_items = []
    last_evaluated_key = None
    
    while True:
        scan_kwargs = {}
        if filter_expression:
            scan_kwargs['FilterExpression'] = filter_expression
        
        if last_evaluated_key:
            scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
        
        response = table.scan(**scan_kwargs)
        all_items.extend(response.get('Items', []))
        
        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break
    
    return all_items

def extract_emails_from_csv(file_path: str) -> List[str]:
    """Extract emails from CSV file and lowercase them"""
    print(f"Reading emails from CSV file: {file_path}...")
    
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found!")
        return []
    
    emails = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Try reading as CSV first
            reader = csv.reader(f)
            for row in reader:
                # Handle both single column and multi-column CSV
                for cell in row:
                    cell = cell.strip()
                    if cell and '@' in cell:  # Basic email validation
                        emails.append(cell.lower().strip())
    except Exception as e:
        print(f"Error reading CSV: {e}")
        # Fallback: read as plain text (one email per line)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and '@' in line:
                        emails.append(line.lower().strip())
        except Exception as e2:
            print(f"Error reading as text file: {e2}")
            return []
    
    print(f"Extracted {len(emails)} emails from CSV file")
    return sorted(set(emails))  # Remove duplicates and sort

def get_all_emails_from_db() -> List[str]:
    """Get all emails from DynamoDB"""
    print("Scanning DynamoDB table for all employees...")
    
    all_items = scan_table_with_filter()
    emails = []
    
    for item in all_items:
        parsed_item = parse_dynamodb_item(item)
        email = parsed_item.get('email')
        if email:
            emails.append(email.lower().strip())
    
    print(f"Found {len(emails)} employees with emails")
    return sorted(set(emails))

def get_usa_emails_from_db() -> List[str]:
    """Get emails of employees with location = USA"""
    print("Scanning DynamoDB table for USA employees...")
    
    filter_expr = Attr('location').eq('USA')
    items = scan_table_with_filter(filter_expr)
    
    emails = []
    for item in items:
        parsed_item = parse_dynamodb_item(item)
        email = parsed_item.get('email')
        if email:
            emails.append(email.lower().strip())
    
    print(f"Found {len(emails)} USA employees with emails")
    return sorted(set(emails))

def get_indian_emails_from_db() -> List[str]:
    """Get emails of employees with location != USA"""
    print("Scanning DynamoDB table for Indian employees (location != USA)...")
    
    # Get all items and filter in Python (DynamoDB doesn't support != directly)
    all_items = scan_table_with_filter()
    
    emails = []
    for item in all_items:
        parsed_item = parse_dynamodb_item(item)
        location = parsed_item.get('location', '').strip()
        email = parsed_item.get('email')
        
        # Include if location is not USA (or empty/null)
        if email and location.upper() != 'USA':
            emails.append(email.lower().strip())
    
    print(f"Found {len(emails)} Indian employees with emails")
    return sorted(set(emails))

def save_json(data: List[str], filename: str):
    """Save list of emails to JSON file"""
    output = {
        "count": len(data),
        "emails": data
    }
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(data)} emails to {filename}")

def check_email_in_db(email: str) -> dict:
    """Check if an email exists in DB and return its details"""
    email_lower = email.lower().strip()
    
    # Scan all items to find the email
    all_items = scan_table_with_filter()
    
    for item in all_items:
        parsed_item = parse_dynamodb_item(item)
        db_email = parsed_item.get('email', '').lower().strip()
        
        if db_email == email_lower:
            return {
                "found": True,
                "email": db_email,
                "name": parsed_item.get('name', 'N/A'),
                "location": parsed_item.get('location', 'N/A'),
                "department": parsed_item.get('department', 'N/A'),
                "position": parsed_item.get('position', 'N/A')
            }
    
    return {"found": False, "email": email_lower}

def compare_emails(original_file: str, indian_file: str):
    """Compare Original Indian Employees.json with Indian employees.json"""
    print("\n" + "="*60)
    print("COMPARING EMAIL LISTS")
    print("="*60)
    
    # Load original Indian employees
    with open(original_file, 'r', encoding='utf-8') as f:
        original_data = json.load(f)
    original_emails = set(original_data.get('emails', []))
    
    # Load Indian employees from DB
    with open(indian_file, 'r', encoding='utf-8') as f:
        indian_data = json.load(f)
    indian_emails = set(indian_data.get('emails', []))
    
    # Also load all employees to check if emails exist but are marked as USA
    all_emails_file = "All employees.json"
    all_emails_set = set()
    if os.path.exists(all_emails_file):
        with open(all_emails_file, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
            all_emails_set = set(all_data.get('emails', []))
    
    # Find differences
    in_original_not_in_db = original_emails - indian_emails
    in_db_not_in_original = indian_emails - original_emails
    in_both = original_emails & indian_emails
    
    print(f"\nOriginal Indian Employees: {len(original_emails)}")
    print(f"Indian Employees in DB: {len(indian_emails)}")
    print(f"Emails in both: {len(in_both)}")
    
    # Check if emails in "in_original_not_in_db" actually exist in all employees
    print(f"\n{'='*60}")
    print(f"Emails in ORIGINAL but NOT in Indian DB: {len(in_original_not_in_db)}")
    print(f"{'='*60}")
    if in_original_not_in_db:
        emails_in_all_db = []
        emails_not_in_any_db = []
        
        for email in sorted(in_original_not_in_db):
            if all_emails_set and email in all_emails_set:
                # Email exists in DB but might be marked as USA
                details = check_email_in_db(email)
                if details.get('found'):
                    emails_in_all_db.append((email, details))
                    print(f"  - {email} (EXISTS in DB but location={details.get('location', 'N/A')})")
                else:
                    emails_not_in_any_db.append(email)
                    print(f"  - {email} (NOT FOUND in DB)")
            else:
                emails_not_in_any_db.append(email)
                print(f"  - {email} (NOT FOUND in DB)")
        
        if emails_in_all_db:
            print(f"\n⚠️  Found {len(emails_in_all_db)} emails that exist in DB but are marked as USA:")
            for email, details in emails_in_all_db:
                print(f"    - {email}: location='{details.get('location')}', name='{details.get('name')}'")
    else:
        print("  (None)")
    
    print(f"\n{'='*60}")
    print(f"Emails in DB but NOT in ORIGINAL: {len(in_db_not_in_original)}")
    print(f"{'='*60}")
    if in_db_not_in_original:
        for email in sorted(in_db_not_in_original):
            print(f"  - {email}")
    else:
        print("  (None)")
    
    # Save comparison results
    comparison_results = {
        "summary": {
            "original_count": len(original_emails),
            "db_indian_count": len(indian_emails),
            "in_both_count": len(in_both),
            "in_original_not_in_db_count": len(in_original_not_in_db),
            "in_db_not_in_original_count": len(in_db_not_in_original)
        },
        "in_original_not_in_db": sorted(list(in_original_not_in_db)),
        "in_db_not_in_original": sorted(list(in_db_not_in_original)),
        "in_both": sorted(list(in_both))
    }
    
    # Add detailed info for emails that exist but are marked as USA
    if in_original_not_in_db and all_emails_set:
        emails_in_db_but_usa = []
        for email in in_original_not_in_db:
            if email in all_emails_set:
                details = check_email_in_db(email)
                if details.get('found'):
                    emails_in_db_but_usa.append({
                        "email": email,
                        "location": details.get('location'),
                        "name": details.get('name'),
                        "department": details.get('department'),
                        "position": details.get('position')
                    })
        if emails_in_db_but_usa:
            comparison_results["emails_in_db_but_marked_as_usa"] = emails_in_db_but_usa
    
    comparison_file = "Email_Comparison_Results.json"
    with open(comparison_file, 'w', encoding='utf-8') as f:
        json.dump(comparison_results, f, indent=2, ensure_ascii=False)
    
    print(f"\nComparison results saved to {comparison_file}")

def main():
    """Main function"""
    print("="*60)
    print("EMAIL EXTRACTION AND COMPARISON SCRIPT")
    print("="*60)
    
    # Step 1: Extract emails from CSV file
    csv_file_path = "/Users/jagadeesh/Documents/zenith-hr-pulse/public/Active emails(Sheet1).csv"
    original_indian_emails = extract_emails_from_csv(csv_file_path)
    save_json(original_indian_emails, "Original Indian Employees.json")
    
    # Step 2: Get all emails from DB
    all_emails = get_all_emails_from_db()
    save_json(all_emails, "All employees.json")
    
    # Step 3: Get USA employees emails
    usa_emails = get_usa_emails_from_db()
    save_json(usa_emails, "USA employees.json")
    
    # Step 4: Get Indian employees emails (location != USA)
    indian_emails = get_indian_emails_from_db()
    save_json(indian_emails, "Indian employees.json")
    
    # Step 5: Compare Original Indian Employees with Indian employees from DB
    compare_emails("Original Indian Employees.json", "Indian employees.json")
    
    print("\n" + "="*60)
    print("SCRIPT COMPLETED SUCCESSFULLY")
    print("="*60)

if __name__ == "__main__":
    main()

