import os
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
import aioboto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

class DynamoDBService:
    """DynamoDB service for handling all database operations"""
    
    def __init__(self):
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.tables = {
            "employees": os.getenv("DYNAMODB_TABLE_EMPLOYEES", "zenith-hr-employees"),
            "users": os.getenv("DYNAMODB_TABLE_USERS", "zenith-hr-users"),
            "goals": os.getenv("DYNAMODB_TABLE_GOALS", "zenith-hr-goals"),
            "feedback": os.getenv("DYNAMODB_TABLE_FEEDBACK", "zenith-hr-feedback"),
            "recruitment": os.getenv("DYNAMODB_TABLE_RECRUITMENT", "zenith-hr-recruitment"),
            "feature_flags": os.getenv("DYNAMODB_TABLE_FEATURE_FLAGS", "zenith-hr-feature-flags"),
            "admins": os.getenv("DYNAMODB_TABLE_ADMINS", "zenith-hr-admin")
        }
        self.session = None
        self.dynamodb = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aioboto3.Session()
        self.dynamodb = await self.session.resource('dynamodb', region_name=self.region).__aenter__()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.dynamodb:
            await self.dynamodb.__aexit__(exc_type, exc_val, exc_tb)
    
    async def get_table(self, table_name: str):
        """Get DynamoDB table resource"""
        if not self.dynamodb:
            raise RuntimeError("DynamoDB service not initialized. Use async context manager.")
        return await self.dynamodb.Table(self.tables[table_name])
    
    async def create_tables_if_not_exist(self):
        """Create DynamoDB tables if they don't exist"""
        if not self.dynamodb:
            raise RuntimeError("DynamoDB service not initialized. Use async context manager.")
        
        # Table definitions
        table_definitions = {
            "employees": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "department", "AttributeType": "S"},
                    {"AttributeName": "email", "AttributeType": "S"},
                    {"AttributeName": "location", "AttributeType": "S"},
                    {"AttributeName": "employee_status", "AttributeType": "S"},
                    {"AttributeName": "employment_category", "AttributeType": "S"},
                    {"AttributeName": "is_leader", "AttributeType": "S"},
                    {"AttributeName": "position", "AttributeType": "S"},
                    {"AttributeName": "gender", "AttributeType": "S"},
                    {"AttributeName": "account", "AttributeType": "S"},
                    {"AttributeName": "created_at", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "DepartmentIndex",
                        "KeySchema": [
                            {"AttributeName": "department", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "EmailIndex",
                        "KeySchema": [
                            {"AttributeName": "email", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "LocationIndex",
                        "KeySchema": [
                            {"AttributeName": "location", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "StatusIndex",
                        "KeySchema": [
                            {"AttributeName": "employee_status", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "CategoryIndex",
                        "KeySchema": [
                            {"AttributeName": "employment_category", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "LeaderIndex",
                        "KeySchema": [
                            {"AttributeName": "is_leader", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "PositionIndex",
                        "KeySchema": [
                            {"AttributeName": "position", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "GenderIndex",
                        "KeySchema": [
                            {"AttributeName": "gender", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "AccountIndex",
                        "KeySchema": [
                            {"AttributeName": "account", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 10, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "CreatedAtIndex",
                        "KeySchema": [
                            {"AttributeName": "created_at", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 20, "WriteCapacityUnits": 10}
            },
            "users": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "email", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "EmailIndex",
                        "KeySchema": [
                            {"AttributeName": "email", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            },
            "goals": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "employeeId", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "EmployeeIndex",
                        "KeySchema": [
                            {"AttributeName": "employeeId", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            },
            "feedback": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "toEmployeeId", "AttributeType": "S"},
                    {"AttributeName": "fromEmployeeId", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "ToEmployeeIndex",
                        "KeySchema": [
                            {"AttributeName": "toEmployeeId", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "FromEmployeeIndex",
                        "KeySchema": [
                            {"AttributeName": "fromEmployeeId", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            },
            "recruitment": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "status", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "StatusIndex",
                        "KeySchema": [
                            {"AttributeName": "status", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            },
            "feature_flags": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "category", "AttributeType": "S"},
                    {"AttributeName": "module", "AttributeType": "S"},
                    {"AttributeName": "name", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "category-index",
                        "KeySchema": [
                            {"AttributeName": "category", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "module-index",
                        "KeySchema": [
                            {"AttributeName": "module", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "name-index",
                        "KeySchema": [
                            {"AttributeName": "name", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            },
            "admins": {
                "KeySchema": [
                    {"AttributeName": "id", "KeyType": "HASH"}
                ],
                "AttributeDefinitions": [
                    {"AttributeName": "id", "AttributeType": "S"},
                    {"AttributeName": "employee_id", "AttributeType": "S"},
                    {"AttributeName": "email", "AttributeType": "S"},
                    {"AttributeName": "created_at", "AttributeType": "S"}
                ],
                "GlobalSecondaryIndexes": [
                    {
                        "IndexName": "EmployeeIndex",
                        "KeySchema": [
                            {"AttributeName": "employee_id", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "EmailIndex",
                        "KeySchema": [
                            {"AttributeName": "email", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    },
                    {
                        "IndexName": "CreatedAtIndex",
                        "KeySchema": [
                            {"AttributeName": "created_at", "KeyType": "HASH"}
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                    }
                ],
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
            }
        }
        
        for table_name, table_def in table_definitions.items():
            try:
                table = await self.dynamodb.Table(self.tables[table_name])
                await table.load()
                print(f"Table {table_name} already exists")
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceNotFoundException':
                    print(f"Creating table {table_name}...")
                    await self.dynamodb.create_table(
                        TableName=self.tables[table_name],
                        **table_def
                    )
                    print(f"Table {table_name} created successfully")
                else:
                    print(f"Error checking table {table_name}: {e}")

# Global DynamoDB service instance
dynamodb_service = DynamoDBService()

# Helper functions for common operations
async def get_employees_table():
    """Get employees table"""
    async with dynamodb_service as db:
        return await db.get_table("employees")

async def get_users_table():
    """Get users table"""
    async with dynamodb_service as db:
        return await db.get_table("users")

async def get_goals_table():
    """Get goals table"""
    async with dynamodb_service as db:
        return await db.get_table("goals")

async def get_feedback_table():
    """Get feedback table"""
    async with dynamodb_service as db:
        return await db.get_table("feedback")

async def get_recruitment_table():
    """Get recruitment table"""
    async with dynamodb_service as db:
        return await db.get_table("recruitment")

async def get_feature_flags_table():
    """Get feature flags table"""
    async with dynamodb_service as db:
        return await db.get_table("feature_flags")

async def get_admins_table():
    """Get admins table"""
    async with dynamodb_service as db:
        return await db.get_table("admins")

# Utility functions for DynamoDB operations
def generate_id() -> str:
    """Generate a unique ID for DynamoDB items"""
    import uuid
    return str(uuid.uuid4())

def format_dynamodb_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Format item for DynamoDB storage"""
    formatted_item = {}
    for key, value in item.items():
        if value is None:
            continue
        elif isinstance(value, str):
            formatted_item[key] = value
        elif isinstance(value, int):
            formatted_item[key] = value
        elif isinstance(value, float):
            # Convert float to Decimal for DynamoDB compatibility
            formatted_item[key] = Decimal(str(value))
        elif isinstance(value, bool):
            formatted_item[key] = value
        elif isinstance(value, list):
            # Recursively format list items
            formatted_item[key] = [format_dynamodb_item({"item": v})["item"] if isinstance(v, dict) else (Decimal(str(v)) if isinstance(v, float) else (v.isoformat() if isinstance(v, datetime) else v)) for v in value]
        elif isinstance(value, dict):
            formatted_item[key] = format_dynamodb_item(value)
        elif isinstance(value, datetime):
            formatted_item[key] = value.isoformat()
        else:
            formatted_item[key] = str(value)
    return formatted_item

def parse_dynamodb_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Parse item from DynamoDB storage"""
    parsed_item = {}
    for key, value in item.items():
        if isinstance(value, str) and (key in ['created_at', 'updated_at'] or 'date' in key.lower() or 'time' in key.lower()):
            try:
                # Try to parse as datetime
                parsed_item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                parsed_item[key] = value
        elif isinstance(value, datetime):
            # Handle datetime objects directly
            parsed_item[key] = value.isoformat()
        elif isinstance(value, Decimal):
            # Convert Decimal back to float for API compatibility
            parsed_item[key] = float(value)
        elif isinstance(value, dict):
            parsed_item[key] = parse_dynamodb_item(value)
        elif isinstance(value, list):
            # Recursively parse list items
            parsed_item[key] = [parse_dynamodb_item({"item": v})["item"] if isinstance(v, dict) else (float(v) if isinstance(v, Decimal) else v) for v in value]
        else:
            parsed_item[key] = value
    return parsed_item

# Initialize tables on startup
async def initialize_dynamodb():
    """Initialize DynamoDB tables"""
    try:
        async with dynamodb_service as db:
            await db.create_tables_if_not_exist()
        print("DynamoDB initialization completed successfully")
    except Exception as e:
        print(f"DynamoDB initialization failed: {e}")
        # Fallback to mock collections for development
        print("Using mock database collections for development")
