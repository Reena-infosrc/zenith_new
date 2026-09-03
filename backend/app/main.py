# from fastapi import FastAPI, Request
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.staticfiles import StaticFiles
# import os
# from dotenv import load_dotenv

# from .routers import auth, employees, goals, feedback, ai, employees_dashboard, feature_flags, admin
# from .database import initialize_dynamodb
# from .services.s3_service import initialize_s3
# from .services.bedrock_service import initialize_bedrock
# from .database_dynamodb import get_admins_table, parse_dynamodb_item
# from datetime import datetime
# import logging
# import urllib.parse
# from decimal import Decimal

# from mangum import Mangum

# logger = logging.getLogger(__name__)

# load_dotenv()

# # Get ROOT_PATH from environment for production deployment
# root_path = os.getenv("ROOT_PATH", "")

# app = FastAPI(title="ZenithHR API", root_path=root_path)

# # Configure CORS
# # cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")
# app.add_middleware(
#     CORSMiddleware,
#     # allow_origins=cors_origins,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Mount the uploads directory (for backward compatibility)
# if os.path.exists("uploads"):
#     app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# # Version check endpoint
# @app.get("/api/version-check")
# async def version_check():
#     """Check which version is running"""
#     return {
#         "version": "10.0.0-DEPLOYED",
#         "deployment_id": "clean-no-duplicates-v10.0",
#         "timestamp": datetime.now().isoformat(),
#         "message": "If you see this, the new code is deployed!"
#     }

# # Include routers
# app.include_router(auth.router)
# app.include_router(employees.router)
# app.include_router(employees_dashboard.router)
# app.include_router(goals.router)
# app.include_router(feedback.router)
# app.include_router(ai.router)
# app.include_router(feature_flags.router)
# app.include_router(admin.router)

# # Fallback admin endpoints - should use /api/employees/auth-admins instead
# @app.get("/api/auth/admins/")
# @app.get("/api/auth/admins")
# async def main_get_admins():
#     """Get all admins - main app endpoint for production"""
#     logger.info("Main app - get_admins called")
    
#     try:
#         table = await get_admins_table()
#         logger.info(f"Main app - Got admins table: {table.table_name}")
        
#         # Scan the table
#         response = await table.scan(Limit=100)
#         logger.info(f"Main app - Scan response count: {len(response.get('Items', []))}")
        
#         admins = []
#         for item in response.get("Items", []):
#             # Convert datetime objects to strings manually
#             parsed_item = {}
#             for key, value in item.items():
#                 if isinstance(value, datetime):
#                     parsed_item[key] = value.isoformat()
#                 elif hasattr(value, 'value'):  # Handle Decimal
#                     parsed_item[key] = float(value)
#                 else:
#                     parsed_item[key] = value
            
#             admins.append(parsed_item)
        
#         logger.info(f"Main app - Returning {len(admins)} admins")
#         return {
#             "admins": admins,
#             "count": len(admins),
#             "timestamp": datetime.now().isoformat(),
#             "deployment_id": "main-app-critical-fix-v8.0",
#             "source": "main_app",
#             "version": "8.0.0"
#         }
#     except Exception as e:
#         logger.error(f"Main app - Error fetching admins: {str(e)}")
#         return {
#             "admins": [],
#             "count": 0,
#             "error": str(e),
#             "timestamp": datetime.now().isoformat(),
#             "deployment_id": "main-app-critical-fix-v8.0",
#             "source": "main_app",
#             "version": "8.0.0"
#         }

# @app.get("/api/auth/admins/check/{email}")
# @app.get("/api/auth/admins/check/{email}/")
# async def main_check_admin_status(email: str):
#     """Check if a user is an admin by email - main app endpoint for production"""
#     try:
#         # URL decode the email parameter
#         decoded_email = urllib.parse.unquote(email)
#         logger.info(f"Main app - Checking admin status for email: {decoded_email}")
        
#         is_admin = await is_user_admin_main(decoded_email)
#         logger.info(f"Main app - Admin check result for {decoded_email}: {is_admin}")
        
#         return {
#             "is_admin": is_admin,
#             "email": decoded_email,
#             "timestamp": datetime.now().isoformat(),
#             "deployment_id": "main-app-critical-fix-v8.0",
#             "source": "main_app",
#             "version": "8.0.0"
#         }
#     except Exception as e:
#         logger.error(f"Main app - Error checking admin status for {email}: {str(e)}")
#         return {
#             "is_admin": False,
#             "email": email,
#             "error": str(e),
#             "timestamp": datetime.now().isoformat(),
#             "deployment_id": "main-app-critical-fix-v8.0",
#             "source": "main_app",
#             "version": "8.0.0"
#         }

# # Helper function for admin status check in main app
# async def is_user_admin_main(email: str) -> bool:
#     """Check if a user is an admin by email - main app version"""
#     try:
#         table = await get_admins_table()
        
#         # Query by email using GSI
#         response = await table.query(
#             IndexName="EmailIndex",
#             KeyConditionExpression="email = :email",
#             ExpressionAttributeValues={":email": email}
#         )
        
#         if response.get("Items"):
#             admin_data = parse_dynamodb_item(response["Items"][0])
#             return admin_data.get("is_active", True)
        
#         return False
#     except Exception as e:
#         logger.error(f"Main app - Error checking admin status: {str(e)}")
#         return False

# @app.on_event("startup")
# async def startup_event():
#     """Initialize AWS services on startup"""
#     print("Initializing AWS services...")
    
#     # Initialize DynamoDB
#     await initialize_dynamodb()
    
#     # Initialize S3
#     await initialize_s3()
    
#     # Initialize Bedrock
#     await initialize_bedrock()
    
#     print("AWS services initialization completed")

# @app.get("/")
# async def root():
#     return {"message": "ZenithHR API is running with AWS services"}

# @app.get("/health")
# async def health_check():
#     """Health check endpoint"""
#     return {
#         "status": "healthy",
#         "services": {
#             "dynamodb": "initialized",
#             "s3": "initialized", 
#             "bedrock": "initialized"
#         },
#         "admin_endpoints": {
#             "auth_router": True,
#             "employees_router": True,
#             "admin_router": True
#         },
#         "deployment_id": "router-only-prod-fix-v6.0",
#         "version": "6.0.0",
#         "root_path": root_path
#     }

# lambda_handler = Mangum(app)

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

from datetime import datetime
import logging
import importlib

from mangum import Mangum
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from .rate_limit import limiter

logger = logging.getLogger(__name__)

load_dotenv()

root_path = os.getenv("ROOT_PATH", "")


def _cors_settings() -> tuple:
    """CORS: cannot use allow_origins=['*'] with allow_credentials=True (browser rejects)."""
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        origins = [o.strip().strip('"').strip("'") for o in raw.split(",") if o.strip()]
        return origins, True
    return (
        [
            "https://zenith-hr-staging.apps.infoservices.com",
            "https://zenith-hr-prod.apps.infoservices.com",
            "https://zenith-api.apps.infoservices.com",
            "https://dc1u4ql4m6dcl.cloudfront.net",
            "http://localhost:3000",
            "http://localhost:8080",
        ],
        True,
    )


_cors_origins, _cors_credentials = _cors_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .security_config import validate_security_at_startup
    from .services.field_crypto import validate_field_encryption_config

    validate_security_at_startup()
    validate_field_encryption_config()
    yield


app = FastAPI(title="ZenithHR API", root_path=root_path, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Baseline headers on API responses (CSP is best set on the static site CDN)."""
    from .services.field_crypto import clear_dek_request_cache

    clear_dek_request_cache()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

def _debug_endpoints_enabled() -> bool:
    return (os.getenv("ENABLE_DEBUG_ENDPOINTS") or "").strip().lower() in ("1", "true", "yes", "on")


@app.get("/api/version-check")
async def version_check():
    if not _debug_endpoints_enabled():
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")
    return {
        "version": "10.0.0-DEPLOYED",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/routes-debug")
async def routes_debug():
    if not _debug_endpoints_enabled():
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")
    routes = []
    for route in app.router.routes:
        try:
            if hasattr(route, "path") and "/admin" in route.path:
                routes.append(
                    {
                        "path": route.path,
                        "methods": getattr(route, "methods", []),
                        "name": getattr(route, "name", "unknown"),
                    }
                )
        except Exception as e:
            routes.append({"error": str(e)})
    admin_auth_loaded = admin_auth is not None
    return {
        "admin_routes": routes,
        "admin_auth_module_loaded": admin_auth_loaded,
        "all_routes_count": len(app.router.routes),
        "timestamp": datetime.now().isoformat(),
    }

# Static import attempts (keep for local / dev)
try:
    from .routers import auth, employees, goals, feedback, ai, employees_dashboard, feature_flags, admin, admin_auth, reviews, client_rm_feedback
    logger.info("✅ Successfully imported all routers statically")
except Exception as import_error:
    # if static import fails, we will try dynamic loader below
    logger.error(f"❌ Failed to import routers statically: {import_error}", exc_info=True)
    auth = employees = goals = feedback = ai = employees_dashboard = feature_flags = admin = admin_auth = reviews = client_rm_feedback = None

# dynamic router loader with per-module error logging
router_names = [
    ("auth", "auth"),
    ("employees", "employees"),
    ("employees_dashboard", "employees_dashboard"),
    ("goals", "goals"),
    ("feedback", "feedback"),
    ("ai", "ai"),
    ("feature_flags", "feature_flags"),
    ("admin", "admin"),
    ("admin_auth", "admin_auth"),
    ("reviews", "reviews"),
    ("client_rm_feedback", "client_rm_feedback"),
]

for name, module_name in router_names:
    try:
        if name == "auth" and auth:
            app.include_router(auth.router)
            logger.info("Included router: auth (static)")
            continue
        if name == "employees" and employees:
            app.include_router(employees.router)
            logger.info("Included router: employees (static)")
            continue
        if name == "employees_dashboard" and employees_dashboard:
            app.include_router(employees_dashboard.router)
            logger.info("Included router: employees_dashboard (static)")
            continue
        if name == "goals" and goals:
            app.include_router(goals.router)
            logger.info("Included router: goals (static)")
            continue
        if name == "feedback" and feedback:
            app.include_router(feedback.router)
            logger.info("Included router: feedback (static)")
            continue
        if name == "ai" and ai:
            app.include_router(ai.router)
            logger.info("Included router: ai (static)")
            continue
        if name == "feature_flags" and feature_flags:
            app.include_router(feature_flags.router)
            logger.info("Included router: feature_flags (static)")
            continue
        if name == "admin" and admin:
            app.include_router(admin.router)
            logger.info("Included router: admin (static)")
            continue
        if name == "admin_auth" and admin_auth:
            app.include_router(admin_auth.router)
            logger.info("Included router: admin_auth (static)")
            continue
        if name == "reviews" and reviews:
            app.include_router(reviews.router)
            logger.info("Included router: reviews (static)")
            continue
        if name == "client_rm_feedback" and client_rm_feedback:
            app.include_router(client_rm_feedback.router)
            logger.info("Included router: client_rm_feedback (static)")
            continue

        module = importlib.import_module(f"{__package__}.routers.{module_name}")
        if hasattr(module, "router"):
            app.include_router(module.router)
            logger.info(f"Included router: {module_name} (dynamic)")
        else:
            logger.warning(f"Module {module_name} has no attribute 'router'")
    except Exception as e:
        logger.error(f"Failed to load router {module_name}: {e}", exc_info=True)

# fallback endpoints (left commented out in your source — keep commented)
# ...

# Unauthenticated duplicate /api/auth/admins/* routes removed — use routers under
# `auth` and `admin_auth` (authenticated) instead.

# startup init (kept commented out if originally commented)
# @app.on_event("startup")
# async def startup_event():
#     print("Initializing AWS services...")
#     await initialize_dynamodb()
#     await initialize_s3()
#     await initialize_bedrock()
#     print("AWS services initialization completed")

@app.get("/health")
async def health_check():
    from .services.field_crypto import describe_status
    return {
        "status": "healthy",
        "services": {
            "dynamodb": "initialized",
            "s3": "initialized",
            "bedrock": "initialized",
        },
        "field_encryption": describe_status(),
        "deployment_id": "router-only-prod-fix-v6.0",
        "version": "6.0.0",
        "root_path": root_path,
    }

# print registered routes at startup for diagnostics
logger.info("Registered routes:")
for r in app.router.routes:
    try:
        logger.info(f" - {r.path}")
    except Exception:
        pass

lambda_handler = Mangum(app)
