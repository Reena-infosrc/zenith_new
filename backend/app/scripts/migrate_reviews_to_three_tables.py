"""
Migration script to split zenith-hr-review table into three tables:
1. zenith-hr-review (submitted reviews)
2. zenith-hr-review-draft (draft reviews)
3. zenith-hr-cycle (review cycles)

This script reads from the old table structure and writes to the new tables.
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
    get_cycles_table,
    format_dynamodb_item,
    parse_dynamodb_item,
)
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CYCLE_PK_PREFIX = "CYCLE#"
REVIEW_SK_PREFIX = "REVIEW#"
CYCLE_SK_VALUE = "CYCLE"
ENTITY_TYPE_CYCLE = "cycle"
ENTITY_TYPE_REVIEW = "review"


def _cycle_pk(year: str) -> str:
    return f"{CYCLE_PK_PREFIX}{year}"


def _review_sk(review_id: str) -> str:
    return f"{REVIEW_SK_PREFIX}{review_id}"


async def migrate_cycles(old_table):
    """Migrate cycles from old table to new cycles table"""
    logger.info("Starting cycle migration...")
    async with dynamodb_service:
        cycles_table = await get_cycles_table()
    
    # Query all cycles using EntityTypeIndex
    last_evaluated_key = None
    migrated_count = 0
    
    while True:
        query_kwargs = {
            "IndexName": "EntityTypeIndex",
            "KeyConditionExpression": Key("entityType").eq(ENTITY_TYPE_CYCLE),
        }
        if last_evaluated_key:
            query_kwargs["ExclusiveStartKey"] = last_evaluated_key
        
        response = await old_table.query(**query_kwargs)
        items = response.get("Items", [])
        
        for item in items:
            parsed = parse_dynamodb_item(item)
            if parsed.get("sk") == CYCLE_SK_VALUE:
                # This is a cycle item
                cycle_item = {
                    "year": parsed.get("year"),
                    "name": parsed.get("name"),
                    "description": parsed.get("description"),
                    "status": parsed.get("status", "draft"),
                    "startDate": parsed.get("startDate"),
                    "endDate": parsed.get("endDate"),
                    "metadata": parsed.get("metadata", {}),
                    "createdAt": parsed.get("createdAt"),
                    "updatedAt": parsed.get("updatedAt"),
                }
                
                try:
                    await cycles_table.put_item(
                        Item=format_dynamodb_item(cycle_item),
                        ConditionExpression="attribute_not_exists(#year)",
                        ExpressionAttributeNames={"#year": "year"},
                    )
                    migrated_count += 1
                    logger.info(f"Migrated cycle: {parsed.get('year')}")
                except ClientError as e:
                    if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                        logger.warning(f"Cycle {parsed.get('year')} already exists, skipping")
                    else:
                        logger.error(f"Error migrating cycle {parsed.get('year')}: {e}")
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
    
    logger.info(f"Cycle migration complete. Migrated {migrated_count} cycles.")


async def migrate_reviews(old_table):
    """Migrate reviews from old table to new review/review-draft tables"""
    logger.info("Starting review migration...")
    async with dynamodb_service:
        reviews_table = await get_reviews_table()
        drafts_table = await get_review_drafts_table()
    
    # Query all reviews using EntityTypeIndex
    last_evaluated_key = None
    migrated_reviews = 0
    migrated_drafts = 0
    
    while True:
        query_kwargs = {
            "IndexName": "EntityTypeIndex",
            "KeyConditionExpression": Key("entityType").eq(ENTITY_TYPE_REVIEW),
        }
        if last_evaluated_key:
            query_kwargs["ExclusiveStartKey"] = last_evaluated_key
        
        response = await old_table.query(**query_kwargs)
        items = response.get("Items", [])
        
        for item in items:
            parsed = parse_dynamodb_item(item)
            if parsed.get("sk", "").startswith(REVIEW_SK_PREFIX):
                # This is a review item
                is_draft = parsed.get("isDraft", False)
                target_table = drafts_table if is_draft else reviews_table
                
                # Create review item (remove entityType and isDraft - not stored in new structure)
                review_item = {k: v for k, v in parsed.items() if k not in ["entityType", "isDraft"]}
                
                # Ensure submittedAt is set correctly
                if not is_draft and not review_item.get("submittedAt"):
                    # If it's not a draft but has no submittedAt, set it to createdAt
                    review_item["submittedAt"] = parsed.get("submittedAt") or parsed.get("createdAt")
                elif is_draft:
                    # Ensure drafts don't have submittedAt
                    review_item.pop("submittedAt", None)
                
                try:
                    await target_table.put_item(Item=format_dynamodb_item(review_item))
                    if is_draft:
                        migrated_drafts += 1
                    else:
                        migrated_reviews += 1
                    logger.info(f"Migrated {'draft' if is_draft else 'review'}: {parsed.get('reviewId')}")
                except ClientError as e:
                    logger.error(f"Error migrating review {parsed.get('reviewId')}: {e}")
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
    
    logger.info(f"Review migration complete. Migrated {migrated_reviews} reviews and {migrated_drafts} drafts.")


async def main():
    """Main migration function"""
    logger.info("Starting migration from old table structure to new three-table structure...")
    
    try:
        async with dynamodb_service as db:
            # Get old reviews table
            old_table = await db.get_table("reviews")
            
            # Migrate cycles first
            await migrate_cycles(old_table)
            
            # Then migrate reviews
            await migrate_reviews(old_table)
        
        logger.info("Migration complete!")
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(main())

