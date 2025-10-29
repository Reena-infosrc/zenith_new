#!/usr/bin/env python3
"""
Script to fix employee records in DynamoDB that are missing required fields or have invalid date formats
"""

import boto3
from dotenv import load_dotenv
import os
from datetime import datetime

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DYNAMODB_TABLE_EMPLOYEES = os.getenv("DYNAMODB_TABLE_EMPLOYEES", "zenith-hr-employees")

def fix_records():
    print(f"Connecting to DynamoDB table: {DYNAMODB_TABLE_EMPLOYEES}")
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    table = dynamodb.Table(DYNAMODB_TABLE_EMPLOYEES)
    
    # Get current date
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    
    # Scan all items
    print("Scanning table...")
    response = table.scan()
    items = response.get('Items', [])
    
    print(f"Found {len(items)} employees")
    
    fixed_count = 0
    updated_count = 0
    
    for item in items:
        needs_update = False
        update_expression_parts = []
        expression_attribute_values = {}
        expression_attribute_names = {}
        
        # Fix department
        if not item.get('department') or item.get('department') == '':
            update_expression_parts.append("#dept = :dept")
            expression_attribute_names['#dept'] = 'department'
            expression_attribute_values[':dept'] = 'Internal'
            needs_update = True
        
        # Fix position
        if not item.get('position') or item.get('position') == '':
            update_expression_parts.append("#pos = :pos")
            expression_attribute_names['#pos'] = 'position'
            expression_attribute_values[':pos'] = 'Employee'
            needs_update = True
        
        # Fix created_at and updated_at (convert datetime to date string)
        if 'created_at' in item:
            created_at = item['created_at']
            if isinstance(created_at, str) and 'T' in created_at:
                # Convert datetime string to date string
                date_only = created_at.split('T')[0]
                update_expression_parts.append("#created = :created")
                expression_attribute_names['#created'] = 'created_at'
                expression_attribute_values[':created'] = date_only
                needs_update = True
        
        if 'updated_at' in item:
            updated_at = item['updated_at']
            if isinstance(updated_at, str) and 'T' in updated_at:
                # Convert datetime string to date string
                date_only = updated_at.split('T')[0]
                update_expression_parts.append("#updated = :updated")
                expression_attribute_names['#updated'] = 'updated_at'
                expression_attribute_values[':updated'] = date_only
                needs_update = True
        
        if needs_update:
            # DynamoDB UpdateExpression needs SET keyword
            update_expression = 'SET ' + ', '.join(update_expression_parts)
            
            try:
                table.update_item(
                    Key={'id': item['id']},
                    UpdateExpression=update_expression,
                    ExpressionAttributeNames=expression_attribute_names if expression_attribute_names else None,
                    ExpressionAttributeValues=expression_attribute_values if expression_attribute_values else None
                )
                updated_count += 1
                if updated_count % 10 == 0:
                    print(f"Updated {updated_count} records...")
            except Exception as e:
                print(f"Error updating {item.get('email', 'unknown')}: {e}")
                fixed_count += 1
    
    print(f"\nFixed {fixed_count} records")
    print(f"Updated {updated_count} records")
    print("Done!")

if __name__ == "__main__":
    fix_records()

