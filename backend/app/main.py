from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

from .routers import auth, employees, goals, feedback, ai, employees_dashboard, feature_flags, admin
from .database import initialize_dynamodb
from .services.s3_service import initialize_s3
from .services.bedrock_service import initialize_bedrock
from .database_dynamodb import get_admins_table, parse_dynamodb_item
from datetime import datetime
import logging
import urllib.parse
from decimal import Decimal

from mangum import Mangum

logger = logging.getLogger(__name__)

load_dotenv()

# Get ROOT_PATH from environment for production deployment
root_path = os.getenv("ROOT_PATH", "")

app = FastAPI(title="ZenithHR API", root_path=root_path)

# Configure CORS
# cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")
app.add_middleware(
    CORSMiddleware,
    # allow_origins=cors_origins,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the uploads directory (for backward compatibility)
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(employees_dashboard.router)
app.include_router(goals.router)
app.include_router(feedback.router)
app.include_router(ai.router)
app.include_router(feature_flags.router)
app.include_router(admin.router)

# Production admin endpoints - added directly to main app for production compatibility
# This follows the same pattern that made /clients endpoint work in production
@app.get("/api/auth/admins/check/{email}")
async def main_check_admin_status(email: str):
    """Check if a user is an admin by email - main app endpoint for production"""
    try:
        # URL decode the email parameter
        decoded_email = urllib.parse.unquote(email)
        logger.info(f"Main app - Checking admin status for email: {decoded_email}")
        
        is_admin = await is_user_admin_main(decoded_email)
        logger.info(f"Main app - Admin check result for {decoded_email}: {is_admin}")
        
        return {
            "is_admin": is_admin,
            "email": decoded_email,
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "main-app-prod-fix-v3.0",
            "source": "main_app"
        }
    except Exception as e:
        logger.error(f"Main app - Error checking admin status for {email}: {str(e)}")
        return {
            "is_admin": False,
            "email": email,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "main-app-prod-fix-v3.0",
            "source": "main_app"
        }

@app.get("/api/auth/admins/")
@app.get("/api/auth/admins")
async def main_get_admins():
    """Get all admins - main app endpoint for production"""
    logger.info("Main app - get_admins called")
    
    try:
        table = await get_admins_table()
        logger.info(f"Main app - Got admins table: {table.table_name}")
        
        # Scan the table
        response = await table.scan(Limit=100)
        logger.info(f"Main app - Scan response count: {len(response.get('Items', []))}")
        
        admins = []
        for item in response.get("Items", []):
            # Convert datetime objects to strings manually
            parsed_item = {}
            for key, value in item.items():
                if isinstance(value, datetime):
                    parsed_item[key] = value.isoformat()
                elif hasattr(value, 'value'):  # Handle Decimal
                    parsed_item[key] = float(value)
                else:
                    parsed_item[key] = value
            
            admins.append(parsed_item)
        
        logger.info(f"Main app - Returning {len(admins)} admins")
        return {
            "admins": admins,
            "count": len(admins),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "main-app-prod-fix-v3.0",
            "source": "main_app"
        }
    except Exception as e:
        logger.error(f"Main app - Error fetching admins: {str(e)}")
        return {
            "admins": [],
            "count": 0,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "deployment_id": "main-app-prod-fix-v3.0",
            "source": "main_app"
        }

# Helper function for admin status check in main app
async def is_user_admin_main(email: str) -> bool:
    """Check if a user is an admin by email - main app version"""
    try:
        table = await get_admins_table()
        
        # Query by email using GSI
        response = await table.query(
            IndexName="EmailIndex",
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={":email": email}
        )
        
        if response.get("Items"):
            admin_data = parse_dynamodb_item(response["Items"][0])
            return admin_data.get("is_active", True)
        
        return False
    except Exception as e:
        logger.error(f"Main app - Error checking admin status: {str(e)}")
        return False

@app.on_event("startup")
async def startup_event():
    """Initialize AWS services on startup"""
    print("Initializing AWS services...")
    
    # Initialize DynamoDB
    await initialize_dynamodb()
    
    # Initialize S3
    await initialize_s3()
    
    # Initialize Bedrock
    await initialize_bedrock()
    
    print("AWS services initialization completed")

@app.get("/")
async def root():
    return {"message": "ZenithHR API is running with AWS services"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "services": {
            "dynamodb": "initialized",
            "s3": "initialized", 
            "bedrock": "initialized"
        },
        "admin_endpoints": {
            "main_app": True,
            "auth_router": True,
            "employees_router": True
        },
        "deployment_id": "main-app-prod-fix-v3.0"
    }

lambda_handler = Mangum(app)