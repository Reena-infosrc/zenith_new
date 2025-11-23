"""
Verification script to check the migration status and table structures.
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
    parse_dynamodb_item,
)
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def verify_cycles_table():
    """Verify cycles table structure and data"""
    logger.info("=" * 60)
    logger.info("Verifying cycles table...")
    logger.info("=" * 60)
    
    cycles_table = await get_cycles_table()
    
    try:
        # Scan all cycles
        last_evaluated_key = None
        cycles = []
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await cycles_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                parsed = parse_dynamodb_item(item)
                cycles.append(parsed)
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        logger.info(f"Found {len(cycles)} cycles in cycles table")
        for cycle in cycles:
            logger.info(f"  - Year: {cycle.get('year')}, Name: {cycle.get('name')}, Status: {cycle.get('status')}")
        
        # Check for isDraft field (should not exist)
        has_is_draft = any("isDraft" in str(cycle) for cycle in cycles)
        if has_is_draft:
            logger.warning("⚠️  WARNING: Found 'isDraft' field in cycles table (should not exist)")
        else:
            logger.info("✅ No 'isDraft' field found in cycles (correct)")
        
        return len(cycles)
    except Exception as e:
        logger.error(f"Error verifying cycles table: {e}")
        return 0


async def verify_reviews_table():
    """Verify reviews table (submitted reviews)"""
    logger.info("=" * 60)
    logger.info("Verifying reviews table (submitted reviews)...")
    logger.info("=" * 60)
    
    reviews_table = await get_reviews_table()
    
    try:
        # Scan all reviews
        last_evaluated_key = None
        reviews = []
        has_is_draft_field = False
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await reviews_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                parsed = parse_dynamodb_item(item)
                reviews.append(parsed)
                if "isDraft" in parsed:
                    has_is_draft_field = True
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        logger.info(f"Found {len(reviews)} submitted reviews in reviews table")
        for review in reviews[:5]:  # Show first 5
            logger.info(f"  - ReviewId: {review.get('reviewId')}, Employee: {review.get('employeeId')}, "
                       f"Type: {review.get('reviewType')}, SubmittedAt: {review.get('submittedAt')}")
        
        if len(reviews) > 5:
            logger.info(f"  ... and {len(reviews) - 5} more reviews")
        
        # Check for isDraft field
        if has_is_draft_field:
            logger.warning("⚠️  WARNING: Found 'isDraft' field in reviews table (should not exist)")
        else:
            logger.info("✅ No 'isDraft' field found in reviews table (correct)")
        
        # Check that all have submittedAt
        missing_submitted_at = [r for r in reviews if not r.get("submittedAt")]
        if missing_submitted_at:
            logger.warning(f"⚠️  WARNING: {len(missing_submitted_at)} reviews missing submittedAt")
        else:
            logger.info("✅ All reviews have submittedAt (correct)")
        
        return len(reviews)
    except Exception as e:
        logger.error(f"Error verifying reviews table: {e}")
        return 0


async def verify_drafts_table():
    """Verify review_drafts table (draft reviews)"""
    logger.info("=" * 60)
    logger.info("Verifying review_drafts table (draft reviews)...")
    logger.info("=" * 60)
    
    drafts_table = await get_review_drafts_table()
    
    try:
        # Scan all drafts
        last_evaluated_key = None
        drafts = []
        has_is_draft_field = False
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
            response = await drafts_table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            for item in items:
                parsed = parse_dynamodb_item(item)
                drafts.append(parsed)
                if "isDraft" in parsed:
                    has_is_draft_field = True
            
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break
        
        logger.info(f"Found {len(drafts)} draft reviews in review_drafts table")
        for draft in drafts[:5]:  # Show first 5
            logger.info(f"  - ReviewId: {draft.get('reviewId')}, Employee: {draft.get('employeeId')}, "
                       f"Type: {draft.get('reviewType')}, SubmittedAt: {draft.get('submittedAt')}")
        
        if len(drafts) > 5:
            logger.info(f"  ... and {len(drafts) - 5} more drafts")
        
        # Check for isDraft field
        if has_is_draft_field:
            logger.warning("⚠️  WARNING: Found 'isDraft' field in review_drafts table (should not exist)")
        else:
            logger.info("✅ No 'isDraft' field found in review_drafts table (correct)")
        
        # Check that drafts don't have submittedAt
        has_submitted_at = [d for d in drafts if d.get("submittedAt")]
        if has_submitted_at:
            logger.warning(f"⚠️  WARNING: {len(has_submitted_at)} drafts have submittedAt (should be null)")
        else:
            logger.info("✅ All drafts have null/undefined submittedAt (correct)")
        
        return len(drafts)
    except Exception as e:
        logger.error(f"Error verifying review_drafts table: {e}")
        return 0


async def verify_old_table():
    """Check if old table structure still has data"""
    logger.info("=" * 60)
    logger.info("Checking old reviews table for remaining data...")
    logger.info("=" * 60)
    
    async with dynamodb_service as db:
        old_table = await db.get_table("reviews")
        
        try:
            # Check for cycles in old table
            response = await old_table.query(
                IndexName="EntityTypeIndex",
                KeyConditionExpression=Key("entityType").eq("cycle"),
                Limit=10
            )
            old_cycles = response.get("Items", [])
            
            # Check for reviews in old table
            response = await old_table.query(
                IndexName="EntityTypeIndex",
                KeyConditionExpression=Key("entityType").eq("review"),
                Limit=10
            )
            old_reviews = response.get("Items", [])
            
            if old_cycles or old_reviews:
                logger.warning(f"⚠️  WARNING: Old table still has data:")
                logger.warning(f"    - {len(old_cycles)} cycles")
                logger.warning(f"    - {len(old_reviews)} reviews")
                logger.warning("    Consider cleaning up old data after verifying migration")
            else:
                logger.info("✅ Old table appears to be empty (good)")
            
            return len(old_cycles), len(old_reviews)
        except Exception as e:
            logger.error(f"Error checking old table: {e}")
            return 0, 0


async def main():
    """Main verification function"""
    logger.info("=" * 60)
    logger.info("REVIEW TABLES MIGRATION VERIFICATION")
    logger.info("=" * 60)
    logger.info("")
    
    async with dynamodb_service:
        cycles_count = await verify_cycles_table()
        logger.info("")
        
        reviews_count = await verify_reviews_table()
        logger.info("")
        
        drafts_count = await verify_drafts_table()
        logger.info("")
        
        old_cycles, old_reviews = await verify_old_table()
        logger.info("")
        
        # Summary
        logger.info("=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Cycles in new table: {cycles_count}")
        logger.info(f"Submitted reviews in new table: {reviews_count}")
        logger.info(f"Draft reviews in new table: {drafts_count}")
        logger.info(f"Old cycles remaining: {old_cycles}")
        logger.info(f"Old reviews remaining: {old_reviews}")
        logger.info("")
        
        if cycles_count > 0 and (reviews_count > 0 or drafts_count > 0):
            logger.info("✅ Migration appears successful!")
        else:
            logger.warning("⚠️  Migration may be incomplete - check the counts above")
        
        if old_cycles > 0 or old_reviews > 0:
            logger.info("")
            logger.info("NOTE: Old table still has data. This is OK if you want to keep it as backup.")
            logger.info("      You can delete it later after confirming everything works.")


if __name__ == "__main__":
    asyncio.run(main())

