from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
from ..models.feature_flag import FeatureFlagCreate, FeatureFlagUpdate, FeatureFlagInDB, FeatureFlagStatus
from ..database_dynamodb import get_feature_flags_table, parse_dynamodb_item
from ..security import get_current_active_user
import uuid
from datetime import datetime
import time

router = APIRouter(
    prefix="/api/feature-flags",
    tags=["feature-flags"],
    responses={404: {"description": "Not found"}},
)

# In-memory cache for feature flags (TTL: 5 minutes)
_feature_flags_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 300  # 5 minutes
}

_feature_flags_status_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 300  # 5 minutes
}

@router.get("/", response_model=List[FeatureFlagInDB])
async def get_all_feature_flags(current_user: dict = Depends(get_current_active_user)):
    """Get all feature flags (cached for 5 minutes)"""
    try:
        # Check cache first
        current_time = time.time()
        if (_feature_flags_cache["data"] is not None and 
            current_time - _feature_flags_cache["timestamp"] < _feature_flags_cache["ttl"]):
            return _feature_flags_cache["data"]
        
        table = await get_feature_flags_table()
        response = await table.scan()
        
        feature_flags = []
        for item in response.get('Items', []):
            parsed_item = parse_dynamodb_item(item)
            feature_flags.append(FeatureFlagInDB(**parsed_item))
        
        # Update cache
        _feature_flags_cache["data"] = feature_flags
        _feature_flags_cache["timestamp"] = current_time
        
        return feature_flags
    except Exception as e:
        print(f"Error getting feature flags: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get feature flags: {str(e)}"
        )

@router.get("/by-category/{category}", response_model=List[FeatureFlagInDB])
async def get_feature_flags_by_category(category: str, current_user: dict = Depends(get_current_active_user)):
    """Get feature flags by category"""
    try:
        table = await get_feature_flags_table()
        response = await table.query(
            IndexName='category-index',
            KeyConditionExpression='category = :category',
            ExpressionAttributeValues={':category': category}
        )
        
        feature_flags = []
        for item in response.get('Items', []):
            parsed_item = parse_dynamodb_item(item)
            feature_flags.append(FeatureFlagInDB(**parsed_item))
        
        return feature_flags
    except Exception as e:
        print(f"Error getting feature flags by category: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get feature flags by category: {str(e)}"
        )

@router.get("/by-module/{module}", response_model=List[FeatureFlagInDB])
async def get_feature_flags_by_module(module: str, current_user: dict = Depends(get_current_active_user)):
    """Get feature flags by module"""
    try:
        table = await get_feature_flags_table()
        response = await table.query(
            IndexName='module-index',
            KeyConditionExpression='#module = :module',
            ExpressionAttributeNames={'#module': 'module'},
            ExpressionAttributeValues={':module': module}
        )
        
        feature_flags = []
        for item in response.get('Items', []):
            parsed_item = parse_dynamodb_item(item)
            feature_flags.append(FeatureFlagInDB(**parsed_item))
        
        return feature_flags
    except Exception as e:
        print(f"Error getting feature flags by module: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get feature flags by module: {str(e)}"
        )

@router.get("/status", response_model=Dict[str, str])
async def get_feature_flag_status(current_user: dict = Depends(get_current_active_user)):
    """Get all feature flags as a simple status map (cached for 5 minutes)"""
    try:
        # Check cache first
        current_time = time.time()
        if (_feature_flags_status_cache["data"] is not None and 
            current_time - _feature_flags_status_cache["timestamp"] < _feature_flags_status_cache["ttl"]):
            return _feature_flags_status_cache["data"]
        
        table = await get_feature_flags_table()
        response = await table.scan()
        
        status_map = {}
        for item in response.get('Items', []):
            parsed_item = parse_dynamodb_item(item)
            status_map[parsed_item['name']] = parsed_item['status']
        
        # Update cache
        _feature_flags_status_cache["data"] = status_map
        _feature_flags_status_cache["timestamp"] = current_time
        
        return status_map
    except Exception as e:
        print(f"Error getting feature flag status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get feature flag status: {str(e)}"
        )

@router.get("/{flag_id}", response_model=FeatureFlagInDB)
async def get_feature_flag(flag_id: str, current_user: dict = Depends(get_current_active_user)):
    """Get a specific feature flag by ID"""
    try:
        table = await get_feature_flags_table()
        response = await table.get_item(Key={'id': flag_id})
        
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Feature flag not found")
        
        parsed_item = parse_dynamodb_item(response['Item'])
        return FeatureFlagInDB(**parsed_item)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting feature flag: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get feature flag: {str(e)}"
        )

@router.post("/", response_model=FeatureFlagInDB)
async def create_feature_flag(feature_flag: FeatureFlagCreate, current_user: dict = Depends(get_current_active_user)):
    """Create a new feature flag"""
    try:
        table = await get_feature_flags_table()
        
        flag_id = f"ff_{uuid.uuid4().hex[:8]}"
        now = datetime.utcnow().isoformat()
        
        item = {
            'id': flag_id,
            'name': feature_flag.name,
            'display_name': feature_flag.display_name,
            'description': feature_flag.description,
            'status': feature_flag.status.value,
            'module': feature_flag.module,
            'category': feature_flag.category,
            'is_core_feature': feature_flag.is_core_feature,
            'created_by': feature_flag.created_by,
            'updated_by': feature_flag.updated_by,
            'created_at': now,
            'updated_at': now
        }
        
        await table.put_item(Item=item)
        
        # Invalidate cache
        _feature_flags_cache["data"] = None
        _feature_flags_status_cache["data"] = None
        
        return FeatureFlagInDB(**item)
    except Exception as e:
        print(f"Error creating feature flag: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create feature flag: {str(e)}"
        )

@router.put("/{flag_id}", response_model=FeatureFlagInDB)
async def update_feature_flag(flag_id: str, feature_flag_update: FeatureFlagUpdate, current_user: dict = Depends(get_current_active_user)):
    """Update a feature flag"""
    try:
        table = await get_feature_flags_table()
        
        # Get existing feature flag
        response = await table.get_item(Key={'id': flag_id})
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Feature flag not found")
        
        existing_item = parse_dynamodb_item(response['Item'])
        
        # Update fields
        update_data = {}
        if feature_flag_update.display_name is not None:
            update_data['display_name'] = feature_flag_update.display_name
        if feature_flag_update.description is not None:
            update_data['description'] = feature_flag_update.description
        if feature_flag_update.status is not None:
            update_data['status'] = feature_flag_update.status.value
        if feature_flag_update.updated_by is not None:
            update_data['updated_by'] = feature_flag_update.updated_by
        
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        # Update the item - handle reserved keywords
        update_expressions = []
        expression_attribute_values = {}
        
        for key, value in update_data.items():
            if key == "status":
                update_expressions.append("#status = :status_value")
                expression_attribute_values[":status_value"] = value
            else:
                update_expressions.append(f"{key} = :{key}")
                expression_attribute_values[f":{key}"] = value
        
        update_expression = "SET " + ", ".join(update_expressions)
        
        # Add expression attribute names for reserved keywords
        expression_attribute_names = {}
        if "status" in update_data:
            expression_attribute_names["#status"] = "status"
        
        update_kwargs = {
            'Key': {'id': flag_id},
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_attribute_values
        }
        
        if expression_attribute_names:
            update_kwargs['ExpressionAttributeNames'] = expression_attribute_names
        
        await table.update_item(**update_kwargs)
        
        # Invalidate cache
        _feature_flags_cache["data"] = None
        _feature_flags_status_cache["data"] = None
        
        # Return updated item
        updated_item = {**existing_item, **update_data}
        return FeatureFlagInDB(**updated_item)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating feature flag: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update feature flag: {str(e)}"
        )

@router.delete("/{flag_id}")
async def delete_feature_flag(flag_id: str, current_user: dict = Depends(get_current_active_user)):
    """Delete a feature flag"""
    try:
        table = await get_feature_flags_table()
        
        # Check if feature flag exists
        response = await table.get_item(Key={'id': flag_id})
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Feature flag not found")
        
        await table.delete_item(Key={'id': flag_id})
        
        # Invalidate cache
        _feature_flags_cache["data"] = None
        _feature_flags_status_cache["data"] = None
        
        return {"message": "Feature flag deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting feature flag: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete feature flag: {str(e)}"
        )
