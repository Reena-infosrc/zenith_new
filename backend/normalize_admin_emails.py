#!/usr/bin/env python3
"""
Script to normalize admin emails to lowercase in the zenith-hr-admin table
This fixes the issue where admin check existse fails due to case sensitivity
"""

import asyncio
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database_dynamodb import get_admins_table, parse_dynamodb_item, format_dynamodb_item

load_dotenv()

async def normalize_admin_emails():
    """Normalize all admin emails to lowercase"""
    try:
        table = await get_admins_table()
        
        print("="*80)
        print("Normalizing Admin Emails to Lowercase")
        print("="*80)
        
        # Scan all admins
        print("\n📥 Fetching all admins from database...")
        response = await table.scan()
        admins = response.get("Items", [])
        
        print(f"Found {len(admins)} admin records")
        
        updated_count = 0
        skipped_count = 0
        
        for item in admins:
            try:
                admin_data = parse_dynamodb_item(item)
                current_email = admin_data.get("email", "")
                
                # Check if email needs normalization
                if current_email != current_email.lower():
                    # Update the email to lowercase
                    normalized_email = current_email.lower().strip()
                    
                    print(f"\n🔄 Updating: {current_email} → {normalized_email}")
                    
                    # Update the item
                    await table.update_item(
                        Key={"id": admin_data.get("id")},
                        UpdateExpression="SET email = :email, updated_at = :updated_at",
                        ExpressionAttributeValues={
                            ":email": normalized_email,
                            ":updated_at": datetime.now().isoformat()
                        }
                    )
                    
                    updated_count += 1
                    print(f"   ✅ Updated successfully")
                else:
                    skipped_count += 1
                    print(f"✓ Already normalized: {current_email}")
                    
            except Exception as e:
                print(f"   ❌ Error processing admin: {str(e)}")
                continue
        
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        print(f"Total admins: {len(admins)}")
        print(f"Updated: {updated_count}")
        print(f"Already normalized: {skipped_count}")
        print("="*80)
        
        if updated_count > 0:
            print("\n✅ Admin emails have been normalized to lowercase")
            print("You can now test the admin check API")
        else:
            print("\n✅ All admin emails are already normalized")
            
    except Exception as e:
        print(f"\n❌ Error normalizing admin emails: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

async def main():
    """Main function"""
    await normalize_admin_emails()

if __name__ == "__main__":
    asyncio.run(main())

