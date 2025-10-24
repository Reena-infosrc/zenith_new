from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Union
from datetime import datetime

class AdminBase(BaseModel):
    """Base admin model"""
    employee_id: str
    email: EmailStr
    name: str
    department: Optional[str] = None
    position: Optional[str] = None

class AdminCreate(AdminBase):
    """Admin creation model"""
    pass

class AdminUpdate(BaseModel):
    """Admin update model"""
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None

class AdminInDB(AdminBase):
    """Admin model as stored in database"""
    id: str
    created_at: Union[datetime, str]
    updated_at: Union[datetime, str]
    created_by: Optional[str] = None
    is_active: bool = True

    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                return v
        return v

class Admin(AdminBase):
    """Admin model for API responses"""
    id: str
    created_at: Union[datetime, str]
    updated_at: Union[datetime, str]
    created_by: Optional[str] = None
    is_active: bool = True

    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                return v
        return v

    class Config:
        from_attributes = True
