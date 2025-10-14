from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os

from backend.app.config import config
from backend.app.routers import employees, recruitment
from backend.app.feature_flags import FeatureFlags
from backend.database import init_db
from backend.database.recruitment_db import recruitment_db

from mangum import Mangum

# Create FastAPI app
app = FastAPI(
    title=config.get("app.name"),
    description=config.get("app.description"),
    version=config.get("app.version")
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("cors.allow_origins", ["*"]),
    allow_credentials=True,
    allow_methods=config.get("cors.allow_methods", ["*"]),
    allow_headers=config.get("cors.allow_headers", ["*"])
)

# Include routers
app.include_router(employees.router)
app.include_router(recruitment.router)

# Health check endpoint
@app.get("/api/health", tags=["health"])
async def health_check():
    return {"status": "healthy"}

# Root endpoint
@app.get("/", tags=["root"])
async def root():
    return {"message": f"Welcome to {config.get('app.name')}"}

# Add global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred"}
    )

@app.on_event("startup")
async def startup_event():
    """Initialize database connections on startup."""
    await init_db()
    await recruitment_db.connect_to_database()

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connections on shutdown."""
    await recruitment_db.close_database_connection()

lambda_handler = Mangum(app)

if __name__ == "__main__":
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=config.get("app.debug", False)
    ) 