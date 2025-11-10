"""
Script to clear all dummy data from the zenith-hr-goals DynamoDB table
Run this script to clean up the goals table before using the new API
"""
import asyncio
import os
from dotenv import load_dotenv
from app.database_dynamodb import dynamodb_service, parse_dynamodb_item

load_dotenv()

async def clear_goals_table():
    """Clear all items from the goals table"""
    try:
        async with dynamodb_service as db:
            table = await db.get_table("goals")
            
            # Scan all items
            print("Scanning goals table...")
            response = await table.scan()
            items = response.get("Items", [])
            
            print(f"Found {len(items)} items to delete")
            
            # Delete all items
            deleted_count = 0
            for item in items:
                goal_id = item.get("id")
                if goal_id:
                    await table.delete_item(Key={"id": goal_id})
                    deleted_count += 1
                    print(f"Deleted goal: {goal_id}")
            
            print(f"\n✅ Successfully deleted {deleted_count} goals from the table")
            print("Table is now ready for use with the new API")
            
    except Exception as e:
        print(f"❌ Error clearing goals table: {str(e)}")
        raise

if __name__ == "__main__":
    print("⚠️  WARNING: This will delete ALL data from the zenith-hr-goals table!")
    print("Press Ctrl+C to cancel, or wait 5 seconds to continue...")
    
    try:
        import time
        time.sleep(5)
    except KeyboardInterrupt:
        print("\n❌ Cancelled by user")
        exit(0)
    
    asyncio.run(clear_goals_table())

