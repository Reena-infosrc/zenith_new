from typing import List, Optional, Union
from pydantic import BaseModel, Field, validator
from datetime import date

class SkillModel(BaseModel):
    name: str
    level: Optional[int] = Field(None, ge=1, le=5)

class EmployeeBase(BaseModel):
    # Core employee information
    employee_id: Optional[str] = None  # EmployeeID from CSV
    first_name: Optional[str] = None   # FirstName from CSV
    last_name: Optional[str] = None    # LastName from CSV
    name: str                         # Computed from first_name + last_name
    email: Optional[str] = None
    position: str
    department: str
    phone: Optional[str] = None
    mobile: Optional[str] = None      # Mobile from CSV
    
    # Additional fields from CSV
    employment_category: Optional[str] = None  # EmploymentCategory
    gender: Optional[str] = None               # Gender
    employee_status: Optional[str] = None      # EmployeeStatus
    account: Optional[str] = None              # Account
    is_leader: Optional[str] = None            # IsLeader
    location: Optional[str] = None             # Location
    date_of_birth: Optional[date] = None       # Dob
    date_of_joining: Optional[date] = None     # Doj
    
    # Employee status management
    status: Optional[str] = "active"            # active/inactive
    resignation_date: Optional[date] = None    # Resignation_Date
    reason_for_resignation: Optional[str] = None  # Reason_for_Resignation
    
    # Legacy fields for backward compatibility
    bio: Optional[str] = None
    start_date: Optional[date] = None
    photo_url: Optional[str] = None
    manager_id: Optional[str] = None
    reporting_to: Optional[str] = None  # Employee ID of the person they report to
    skills: Optional[List[str]] = []
    expertise: Optional[str] = None      # Employee's area of expertise
    experience_years: Optional[int] = None  # Years of experience
    performance_communication: Optional[float] = 0.0
    performance_leadership: Optional[float] = 0.0
    performance_client_feedback: Optional[float] = 0.0
    overall_rating: Optional[float] = 0.0
    strengths: Optional[List[str]] = []
    tech_stack: Optional[List[dict]] = []
    
class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    # Core fields
    employee_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    
    # Additional fields
    employment_category: Optional[str] = None
    gender: Optional[str] = None
    employee_status: Optional[str] = None
    account: Optional[str] = None
    is_leader: Optional[str] = None
    location: Optional[str] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    
    # Employee status management
    status: Optional[str] = None
    resignation_date: Optional[date] = None
    reason_for_resignation: Optional[str] = None
    
    # Legacy fields
    bio: Optional[str] = None
    start_date: Optional[date] = None
    photo_url: Optional[str] = None
    manager_id: Optional[str] = None
    reporting_to: Optional[str] = None
    skills: Optional[List[str]] = None
    expertise: Optional[str] = None
    experience_years: Optional[int] = None

class EmployeeInDB(EmployeeBase):
    id: str
    manager_name: Optional[str] = None
    created_at: Union[date, str]
    updated_at: Union[date, str]

    @validator('created_at', 'updated_at', pre=True)
    def parse_date(cls, v):
        if isinstance(v, date):
            return v
        if isinstance(v, str):
            try:
                return date.fromisoformat(v)
            except Exception:
                pass
        raise ValueError('Invalid date format for created_at/updated_at')

    class Config:
        json_schema_extra = {
            "example": {
                "id": "5f8d0d55b54764421b71cc2d",
                "name": "John Doe",
                "email": "john.doe@example.com",
                "position": "Software Developer",
                "department": "Engineering",
                "phone": "+1 555-123-4567",
                "bio": "Full-stack developer with 5 years of experience.",
                "start_date": "2020-01-15",
                "photo_url": "https://example.com/photos/john-doe.jpg",
                "manager_id": "5f8d0d55b54764421b71cc2c",
                "manager_name": "Jane Smith",
                "skills": ["Python", "React", "MongoDB"],
                "performance_communication": 85.0,
                "performance_leadership": 90.0,
                "performance_client_feedback": 80.0,
                "overall_rating": 85.0,
                "strengths": ["Leadership", "Communication"],
                "tech_stack": [
                    {"name": "Python", "logo_url": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", "percent": 90},
                    {"name": "AWS S3", "logo_url": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/amazonwebservices/amazonwebservices-original.svg", "percent": 80}
                ],
                "created_at": "2023-01-01",
                "updated_at": "2023-10-01"
            }
        } 