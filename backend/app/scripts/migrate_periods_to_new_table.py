"""Migrate monthly feedback periods from the shared client-rm-feedback table
to the new dedicated monthly-feedback-periods table.

Usage (from backend/):
    python -m app.scripts.migrate_periods_to_new_table

Environment variables required:
    DYNAMODB_TABLE_CLIENT_RM_FEEDBACK   — source table
    DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS — destination table
    AWS_REGION (default: us-east-1)

The script is idempotent: re-running it will skip periods that already exist
in the destination table (put_item with ConditionExpression).
"""

import asyncio
import logging
import sys
import os

# Ensure the backend package is importable when invoked via ``python -m``.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.database_dynamodb import (       # noqa: E402
    get_client_rm_feedback_table,
    get_monthly_feedback_periods_table,
    format_dynamodb_item,
    parse_dynamodb_item,
    dynamodb_service,
)
from boto3.dynamodb.conditions import Attr  # noqa: E402
from botocore.exceptions import ClientError  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
logger = logging.getLogger(__name__)


async def _scan_full(table, **kwargs):
    items = []
    while True:
        response = await table.scan(**kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


async def migrate():
    await dynamodb_service.initialize()

    src_table = await get_client_rm_feedback_table()
    dst_table = await get_monthly_feedback_periods_table()

    src_name = os.getenv("DYNAMODB_TABLE_CLIENT_RM_FEEDBACK", "?")
    dst_name = os.getenv("DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS", "?")
    logger.info("Source table : %s", src_name)
    logger.info("Destination  : %s", dst_name)

    # 1. Scan source for entity_type=period
    raw_items = await _scan_full(src_table, FilterExpression=Attr("entity_type").eq("period"))
    logger.info("Found %d period(s) in source table", len(raw_items))

    migrated = 0
    skipped = 0
    errors = 0

    for raw in raw_items:
        parsed = parse_dynamodb_item(raw)
        period_id = parsed.get("period_id")
        if not period_id:
            logger.warning("Skipping period without period_id: %s", parsed.get("id"))
            skipped += 1
            continue

        # Build the new item — strip entity_type and legacy 'id' (period_id is now the PK).
        new_item = {
            "period_id": period_id,
            "label": parsed.get("label", ""),
            "start_date": parsed.get("start_date", ""),
            "end_date": parsed.get("end_date", ""),
            "period_status": parsed.get("period_status", "draft"),
            "created_at": parsed.get("created_at", ""),
            "updated_at": parsed.get("updated_at", ""),
            "created_by_email": parsed.get("created_by_email", ""),
        }

        try:
            await dst_table.put_item(
                Item=format_dynamodb_item(new_item),
                ConditionExpression="attribute_not_exists(period_id)",
            )
            migrated += 1
            logger.info("  ✅ Migrated period %s (%s)", period_id, new_item.get("label"))
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                skipped += 1
                logger.info("  ⏭️  Already exists: %s (%s)", period_id, new_item.get("label"))
            else:
                errors += 1
                logger.error("  ❌ Error migrating %s: %s", period_id, exc)

    logger.info("")
    logger.info("Migration complete: %d migrated, %d skipped, %d errors", migrated, skipped, errors)
    logger.info("")
    logger.info("Next steps:")
    logger.info("  1. Verify the periods appear via GET /api/client-rm-feedback/periods")
    logger.info("  2. Once confirmed, you can optionally clean up old period rows from the source table")
    logger.info("     (they will be ignored by the updated code since it no longer reads entity_type=period from that table)")

    await dynamodb_service.close()


if __name__ == "__main__":
    asyncio.run(migrate())
