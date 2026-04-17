import os
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
import re
from pathlib import Path
import aioboto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv, dotenv_values
import logging

load_dotenv()
# Local/dev convenience: read table names from explicit env files, but do not
# override process-level ENVIRONMENT/STAGE/security settings used by startup guards.
_backend_root = Path(__file__).resolve().parents[1]
_stage = (os.getenv("STAGE") or os.getenv("ENVIRONMENT") or "").strip().lower()
_employees_table = (os.getenv("DYNAMODB_TABLE_EMPLOYEES") or "").strip()
_staging_env = _backend_root / ".env.staging"
_prod_env = _backend_root / ".env.prod"

_selected_env_file = None
if _staging_env.exists() and (_stage in {"staging", "stage"} or _employees_table.endswith("-staging") or not _employees_table):
    _selected_env_file = _staging_env
elif _prod_env.exists() and (_stage in {"prod", "production"} or _employees_table.endswith("-prod") or not _employees_table):
    _selected_env_file = _prod_env

if _selected_env_file:
    _env_map = dotenv_values(_selected_env_file)
    _ddb_keys = {"AWS_REGION"} | {k for k in _env_map.keys() if str(k).startswith("DYNAMODB_TABLE_")}
    for _key in _ddb_keys:
        _value = _env_map.get(_key)
        if _value and not os.getenv(_key):
            os.environ[_key] = str(_value)

logger = logging.getLogger(__name__)

class DynamoDBService:
    """DynamoDB service for handling all database operations"""
    
    def __init__(self):
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.tables = {
            "employees": os.getenv("DYNAMODB_TABLE_EMPLOYEES"),
            "users": os.getenv("DYNAMODB_TABLE_USERS"),
            "admin": os.getenv("DYNAMODB_TABLE_ADMIN"),
            "review": os.getenv("DYNAMODB_TABLE_REVIEW"),
            "reviewDraft": os.getenv("DYNAMODB_TABLE_REVIEW_DRAFT"),
            "clientSatisfaction": os.getenv("DYNAMODB_TABLE_CLIENT_SATISFACTION"),
            "clients": os.getenv("DYNAMODB_TABLE_CLIENTS"),
            "competencies": os.getenv("DYNAMODB_TABLE_COMPETENCIES"),
            "cycle": os.getenv("DYNAMODB_TABLE_CYCLE"),
            "engagementActivities": os.getenv("DYNAMODB_TABLE_ENGAGEMENT_ACTIVITIES"),
            "resourceMappings": os.getenv("DYNAMODB_TABLE_RESOURCE_MAPPINGS"),
            "revenueForecasts": os.getenv("DYNAMODB_TABLE_REVENUE_FORECASTS"),
            "goals": os.getenv("DYNAMODB_TABLE_GOALS"),
            "feedback": os.getenv("DYNAMODB_TABLE_FEEDBACK"),
            "recruitment": os.getenv("DYNAMODB_TABLE_RECRUITMENT"),
            "features": os.getenv("DYNAMODB_TABLE_FEATURES"),
            "clientRmFeedback": os.getenv("DYNAMODB_TABLE_CLIENT_RM_FEEDBACK"),
            "leadershipAccess": os.getenv("DYNAMODB_TABLE_LEADERSHIP_ACCESS"),
        }
        self.session = None
        self.dynamodb = None
        self._context_managers = []
        self._resolved_table_names: Dict[str, str] = {}
        self._table_name_hints: Dict[str, List[str]] = self._load_table_name_hints()

    @staticmethod
    def _logical_to_env_key(logical_table_name: str) -> str:
        """Convert logical key like `clientRmFeedback` -> `DYNAMODB_TABLE_CLIENT_RM_FEEDBACK`."""
        snake = re.sub(r"(?<!^)(?=[A-Z])", "_", logical_table_name).upper()
        return f"DYNAMODB_TABLE_{snake}"
    
    async def initialize(self):
        """Initialize DynamoDB service - should be called once at startup"""
        try:
            self.session = aioboto3.Session()
            # Create context manager but don't exit it yet
            self.dynamodb = await self.session.resource('dynamodb', region_name=self.region).__aenter__()
            logger.info("✅ DynamoDB service initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize DynamoDB service: {e}")
            raise
    
    async def close(self):
        """Close DynamoDB service - should be called at shutdown"""
        try:
            if self.dynamodb:
                # Close the DynamoDB resource context manager
                await self.dynamodb.__aexit__(None, None, None)
                self.dynamodb = None
            if self.session:
                self.session = None
            logger.info("✅ DynamoDB service closed successfully")
        except Exception as e:
            logger.error(f"❌ Error closing DynamoDB service: {e}")
    
    async def __aenter__(self):
        """Async context manager entry - for legacy code"""
        if not self.dynamodb:
            await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - for legacy code"""
        # Don't close on individual request - only close at app shutdown
        pass
    
    async def get_table(self, table_name: str):
        """Get DynamoDB table resource"""
        if not self.dynamodb:
            await self.initialize()
        configured_name = self.tables.get(table_name)
        if not configured_name:
            raise ValueError(f"DynamoDB table name is not configured for logical key: {table_name}")

        resolved_name = self._resolved_table_names.get(table_name)
        if not resolved_name:
            resolved_name = await self._resolve_existing_table_name(table_name, configured_name)
            self._resolved_table_names[table_name] = resolved_name
            if resolved_name != configured_name:
                logger.warning(
                    "Using DynamoDB table fallback for '%s': '%s' -> '%s'",
                    table_name,
                    configured_name,
                    resolved_name,
                )

        return await self.dynamodb.Table(resolved_name)

    async def _resolve_existing_table_name(self, logical_table_name: str, configured_name: str) -> str:
        """Resolve a usable table name, allowing local fallback from env-suffixed names."""
        candidates = [configured_name]
        candidates.extend(self._table_name_hints.get(logical_table_name, []))

        # If caller passed unsuffixed names, also try common environment suffixed names.
        if re.search(r"-(staging|prod|production|dev|development|qa|test)$", configured_name, flags=re.IGNORECASE) is None:
            candidates.extend(
                [
                    f"{configured_name}-staging",
                    f"{configured_name}-prod",
                    f"{configured_name}-production",
                ]
            )

        # Common local/dev fallback: production/staging suffix may not exist in personal accounts.
        stripped = re.sub(r"-(staging|prod|production|dev|development|qa|test)$", "", configured_name, flags=re.IGNORECASE)
        if stripped != configured_name:
            candidates.append(stripped)

        # Preserve order while deduplicating.
        seen = set()
        ordered_candidates = []
        for name in candidates:
            if name not in seen:
                seen.add(name)
                ordered_candidates.append(name)

        for candidate in ordered_candidates:
            if await self._table_exists(candidate):
                return candidate

        # Keep previous behavior if nothing resolves: first operation will raise ResourceNotFoundException.
        return configured_name

    def _load_table_name_hints(self) -> Dict[str, List[str]]:
        """Collect possible table names from env files to recover from polluted shell env vars."""
        env_paths = [_backend_root / ".env.staging", _backend_root / ".env.prod"]
        hints: Dict[str, List[str]] = {}

        for logical in self.tables.keys():
            env_key = self._logical_to_env_key(logical)
            values: List[str] = []
            for env_path in env_paths:
                if not env_path.exists():
                    continue
                env_map = dotenv_values(env_path)
                raw = str(env_map.get(env_key) or "").strip()
                if raw:
                    values.append(raw)
            # Deduplicate while preserving order.
            deduped: List[str] = []
            seen = set()
            for value in values:
                if value not in seen:
                    seen.add(value)
                    deduped.append(value)
            hints[logical] = deduped
        return hints

    async def _table_exists(self, table_name: str) -> bool:
        try:
            await self.dynamodb.meta.client.describe_table(TableName=table_name)
            return True
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "")
            if code == "ResourceNotFoundException":
                return False
            # For access or transient errors, do not hide failures.
            raise

# Global DynamoDB service instance
dynamodb_service = DynamoDBService()

# Helper functions for common operations
async def get_employees_table():
    """Get employees table"""
    return await dynamodb_service.get_table("employees")

async def get_users_table():
    """Get users table"""
    return await dynamodb_service.get_table("users")

async def get_admin_table():
    """Get admin table"""
    return await dynamodb_service.get_table("admin")

async def get_review_table():
    """Get review table"""
    return await dynamodb_service.get_table("review")

async def get_review_draft_table():
    """Get review draft table"""
    return await dynamodb_service.get_table("reviewDraft")

async def get_client_satisfaction_table():
    """Get client satisfaction table"""
    return await dynamodb_service.get_table("clientSatisfaction")

async def get_clients_table():
    """Get clients table"""
    return await dynamodb_service.get_table("clients")

async def get_competencies_table():
    """Get competencies table"""
    return await dynamodb_service.get_table("competencies")

async def get_cycle_table():
    """Get cycle table"""
    return await dynamodb_service.get_table("cycle")

async def get_engagement_activities_table():
    """Get engagement activities table"""
    return await dynamodb_service.get_table("engagementActivities")

async def get_resource_mappings_table():
    """Get resource mappings table"""
    return await dynamodb_service.get_table("resourceMappings")

async def get_revenue_forecasts_table():
    """Get revenue forecasts table"""
    return await dynamodb_service.get_table("revenueForecasts")

async def get_goals_table():
    """Get goals table"""
    return await dynamodb_service.get_table("goals")

async def get_feedback_table():
    """Get feedback table"""
    return await dynamodb_service.get_table("feedback")

async def get_recruitment_table():
    """Get recruitment table"""
    return await dynamodb_service.get_table("recruitment")

async def get_admins_table():
    """Get admins table (alias for admin table)"""
    return await dynamodb_service.get_table("admin")

async def get_reviews_table():
    """Get reviews table (alias for review table)"""
    return await dynamodb_service.get_table("review")

async def get_review_drafts_table():
    """Get review drafts table (alias for reviewDraft table)"""
    return await dynamodb_service.get_table("reviewDraft")

async def get_cycles_table():
    """Get cycles table (alias for cycle table)"""
    return await dynamodb_service.get_table("cycle")

async def get_feature_flags_table():
    """Get feature flags table"""
    return await dynamodb_service.get_table("features")


async def get_client_rm_feedback_table():
    """Get client reporting manager feedback table"""
    return await dynamodb_service.get_table("clientRmFeedback")


async def get_leadership_access_table():
    """Get leadership access table"""
    return await dynamodb_service.get_table("leadershipAccess")

async def get_review_table_by_draft_status(is_draft: bool):
    """Get review table based on draft status"""
    return await get_review_drafts_table() if is_draft else await get_reviews_table()

# Utility functions for DynamoDB operations
def generate_id() -> str:
    """Generate a unique ID for DynamoDB items"""
    import uuid
    return str(uuid.uuid4())

def format_dynamodb_item(item: Dict[str, Any], table_logical_name: Optional[str] = None) -> Dict[str, Any]:
    """Format item for DynamoDB storage.

    If ``table_logical_name`` is set and field encryption is enabled (see ``field_crypto``),
    configured fields are encrypted to ``*_enc`` attributes before write. Nested dicts/lists
    do not receive table context (only top-level attributes are encrypted). Callers that omit
    ``table_logical_name`` behave exactly as before (no encryption).
    """
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
            # Recursively format list items (no table context for nested structures)
            formatted_item[key] = [format_dynamodb_item({"item": v}, None)["item"] if isinstance(v, dict) else (Decimal(str(v)) if isinstance(v, float) else (v.isoformat() if isinstance(v, datetime) else v)) for v in value]
        elif isinstance(value, dict):
            formatted_item[key] = format_dynamodb_item(value, None)
        elif isinstance(value, datetime):
            formatted_item[key] = value.isoformat()
        else:
            formatted_item[key] = str(value)
    if table_logical_name:
        from .services.field_crypto import encrypt_item_for_write
        return encrypt_item_for_write(table_logical_name, formatted_item)
    return formatted_item

def parse_dynamodb_item(item: Dict[str, Any], table_logical_name: Optional[str] = None) -> Dict[str, Any]:
    """Parse item from DynamoDB storage.

    If ``table_logical_name`` is set and field encryption is active, ``*_enc`` attributes
    are decrypted and merged into plain field names. Omitted ``table_logical_name`` preserves
    legacy behavior.
    """
    parsed_item = {}
    # Fields that should remain as strings (not converted to datetime)
    string_date_fields = ['created_at', 'updated_at', 'targetDate', 'dueDate', 'completedDate', 
                          'startDate', 'endDate', 'createdAt', 'updatedAt', 'submittedAt']
    # Boolean fields that may come as strings and need explicit conversion
    boolean_fields = ['is_active', 'is_deleted', 'is_verified', 'is_approved', 'is_complete']
    
    for key, value in item.items():
        # Handle boolean fields - convert string representations to actual booleans
        if key in boolean_fields:
            if isinstance(value, bool):
                parsed_item[key] = value
            elif isinstance(value, str):
                parsed_item[key] = value.lower() in ("true", "1", "yes")
            elif isinstance(value, int):
                parsed_item[key] = bool(value)
            else:
                parsed_item[key] = bool(value)
        # Keep specific date fields as strings for Pydantic compatibility
        elif key in string_date_fields:
            if isinstance(value, datetime):
                # Convert datetime to ISO string for date fields that should be strings
                parsed_item[key] = value.isoformat()
            elif isinstance(value, str):
                # Keep as string
                parsed_item[key] = value
            else:
                # Convert to string if it's something else
                parsed_item[key] = str(value)
        elif isinstance(value, str) and ('date' in key.lower() or 'time' in key.lower()):
            try:
                # Try to parse as datetime for other date fields
                parsed_item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                parsed_item[key] = value
        elif isinstance(value, datetime):
            # Handle datetime objects directly - convert to ISO string
            parsed_item[key] = value.isoformat()
        elif isinstance(value, Decimal):
            # Convert Decimal back to float for API compatibility
            parsed_item[key] = float(value)
        elif isinstance(value, dict):
            parsed_item[key] = parse_dynamodb_item(value, None)
        elif isinstance(value, list):
            # Recursively parse list items
            parsed_item[key] = [parse_dynamodb_item({"item": v}, None)["item"] if isinstance(v, dict) else (float(v) if isinstance(v, Decimal) else v) for v in value]
        else:
            parsed_item[key] = value
    if table_logical_name:
        from .services.field_crypto import decrypt_item_after_read
        return decrypt_item_after_read(table_logical_name, parsed_item)
    return parsed_item

# Initialize tables on startup
async def initialize_dynamodb():
    """Initialize DynamoDB tables"""
    try:
        # DynamoDB service will be initialized on app startup via the startup event
        logger.info("DynamoDB initialization handled by app startup event")
    except Exception as e:
        logger.error(f"DynamoDB initialization failed: {e}")