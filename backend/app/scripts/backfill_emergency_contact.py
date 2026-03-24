import os
import boto3

from boto3.dynamodb.conditions import Attr
from dotenv import load_dotenv


# Resolve .env from backend/app/scripts/ → up 2 levels → backend/.env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, "..", "..", ".env")  # backend/.env
load_dotenv(dotenv_path=dotenv_path)

TABLE_NAME = os.getenv("DYNAMODB_TABLE_EMPLOYEES", "zenith-hr-employees-staging")
REGION = os.getenv("AWS_REGION", "us-east-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def backfill_emergency_contact():
    """Add only the 3 emergency-contact attributes where missing; no other item data is changed."""
    scan_kwargs = {}
    processed = 0
    skipped = 0

    while True:
        resp = table.scan(**scan_kwargs)
        items = resp.get("Items", [])

        for item in items:
            key = {"id": item["id"]}
            update_needed = any(
                attr not in item
                for attr in [
                    "emergency_contact_name",
                    "emergency_contact_relationship",
                    "emergency_contact_phone",
                ]
            )
            if not update_needed:
                skipped += 1
                continue

            expr = []
            values = {}
            if "emergency_contact_name" not in item:
                expr.append("emergency_contact_name = :ecn")
                values[":ecn"] = ""
            if "emergency_contact_relationship" not in item:
                expr.append("emergency_contact_relationship = :ecr")
                values[":ecr"] = ""
            if "emergency_contact_phone" not in item:
                expr.append("emergency_contact_phone = :ecp")
                values[":ecp"] = ""

            try:
                table.update_item(
                    Key=key,
                    UpdateExpression="SET " + ", ".join(expr),
                    ExpressionAttributeValues=values,
                    ConditionExpression=Attr("id").exists(),  # item must still exist
                )
                processed += 1
            except table.meta.client.exceptions.ConditionalCheckFailedException:
                # Item was deleted between scan and update; safe to skip
                print(f"  [WARN] Item {item['id']} no longer exists, skipping.")

        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    print(f"Done. Backfilled: {processed} items | Already complete (skipped): {skipped} items.")


if __name__ == "__main__":
    backfill_emergency_contact()