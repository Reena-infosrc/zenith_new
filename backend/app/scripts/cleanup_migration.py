"""
Cleanup script to remove isDraft field and fix data issues after migration.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database_dynamodb import (
    dynamodb_service,
    get_reviews_table,
    get_review_drafts_table,
    format_dynamodb_item,
    parse_dynamodb_item,
)
from botocore.exceptions import ClientError
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def cleanup_reviews_table():
    """Remove isDraft field and fix submittedAt in reviews table"""
    logger.info("=" * 60)
    logger.info("Cleaning up reviews table (submitted reviews)...")
    logger.info("=" * 60)
    
    reviews_table = await get_reviews_table()
    
    try:
        last_evaluated_key = None
        cleaned = 0
        fixed_submitted_at = 0
        moved_to_drafts = 0
        drafts_table = await get_review_drafts_table()
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await reviews_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                parsed = parse_dynamodb_item(item)
                needs_update = False
                update_expression_parts = []
                expression_attribute_names = {}
                expression_attribute_values = {}
                
                # Remove isDraft if it exists
                if "isDraft" in parsed:
                    needs_update = True
                    update_expression_parts.append("REMOVE #isDraft")
                    expression_attribute_names["#isDraft"] = "isDraft"
                    logger.info(f"  Removing isDraft from review: {parsed.get('reviewId')}")
                
                # Fix missing submittedAt - if it's in reviews table, it should have submittedAt
                if not parsed.get("submittedAt"):
                    # If no submittedAt, this might be a draft that was migrated incorrectly
                    # Check if it has isDraft=True (from old data)
                    if parsed.get("isDraft", False):
                        # Move to drafts table
                        logger.info(f"  Moving review {parsed.get('reviewId')} to drafts table (has isDraft=True, no submittedAt)")
                        await drafts_table.put_item(Item=format_dynamodb_item(parsed))
                        await reviews_table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
                        moved_to_drafts += 1
                        continue
                    else:
                        # Set submittedAt to createdAt if available
                        submitted_at = parsed.get("createdAt") or parsed.get("updatedAt")
                        if submitted_at:
                            needs_update = True
                            update_expression_parts.append("SET #submittedAt = :submittedAt")
                            expression_attribute_names["#submittedAt"] = "submittedAt"
                            expression_attribute_values[":submittedAt"] = submitted_at
                            logger.info(f"  Setting submittedAt for review: {parsed.get('reviewId')}")
                            fixed_submitted_at += 1
                
                if needs_update:
                    update_kwargs = {
                        "Key": {"pk": item["pk"], "sk": item["sk"]},
                        "UpdateExpression": " ".join(update_expression_parts),
                        "ExpressionAttributeNames": expression_attribute_names,
                    }
                    if expression_attribute_values:
                        update_kwargs["ExpressionAttributeValues"] = expression_attribute_values
                    
                    await reviews_table.update_item(**update_kwargs)
                    cleaned += 1
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        logger.info(f"✅ Cleaned {cleaned} reviews")
        logger.info(f"✅ Fixed submittedAt for {fixed_submitted_at} reviews")
        logger.info(f"✅ Moved {moved_to_drafts} reviews to drafts table")
        
    except Exception as e:
        logger.error(f"Error cleaning reviews table: {e}")


async def cleanup_drafts_table():
    """Remove isDraft field and ensure submittedAt is null in drafts table"""
    logger.info("=" * 60)
    logger.info("Cleaning up review_drafts table (draft reviews)...")
    logger.info("=" * 60)
    
    drafts_table = await get_review_drafts_table()
    
    try:
        last_evaluated_key = None
        cleaned = 0
        fixed_submitted_at = 0
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await drafts_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                parsed = parse_dynamodb_item(item)
                needs_update = False
                update_expression_parts = []
                expression_attribute_names = {}
                expression_attribute_values = {}
                
                # Remove isDraft if it exists
                if "isDraft" in parsed:
                    needs_update = True
                    update_expression_parts.append("REMOVE #isDraft")
                    expression_attribute_names["#isDraft"] = "isDraft"
                    logger.info(f"  Removing isDraft from draft: {parsed.get('reviewId')}")
                
                # Ensure submittedAt is null/undefined (drafts shouldn't have it)
                if parsed.get("submittedAt"):
                    needs_update = True
                    update_expression_parts.append("REMOVE #submittedAt")
                    expression_attribute_names["#submittedAt"] = "submittedAt"
                    logger.info(f"  Removing submittedAt from draft: {parsed.get('reviewId')}")
                    fixed_submitted_at += 1
                
                if needs_update:
                    update_kwargs = {
                        "Key": {"pk": item["pk"], "sk": item["sk"]},
                        "UpdateExpression": " ".join(update_expression_parts),
                        "ExpressionAttributeNames": expression_attribute_names,
                    }
                    if expression_attribute_values:
                        update_kwargs["ExpressionAttributeValues"] = expression_attribute_values
                    
                    await drafts_table.update_item(**update_kwargs)
                    cleaned += 1
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        logger.info(f"✅ Cleaned {cleaned} drafts")
        logger.info(f"✅ Removed submittedAt from {fixed_submitted_at} drafts")
        
    except Exception as e:
        logger.error(f"Error cleaning drafts table: {e}")


async def main():
    """Main cleanup function"""
    logger.info("=" * 60)
    logger.info("REVIEW TABLES CLEANUP")
    logger.info("=" * 60)
    logger.info("This script will:")
    logger.info("  1. Remove 'isDraft' field from all records")
    logger.info("  2. Fix missing submittedAt in reviews table")
    logger.info("  3. Ensure drafts don't have submittedAt")
    logger.info("=" * 60)
    logger.info("")
    
    async with dynamodb_service:
        await cleanup_reviews_table()
        logger.info("")
        await cleanup_drafts_table()
        logger.info("")
        logger.info("=" * 60)
        logger.info("✅ Cleanup complete!")
        logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

