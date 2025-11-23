# Review Tables Migration Guide

## Overview

The review system has been refactored from a single table (`zenith-hr-review`) into three separate tables for better organization and performance:

1. **`zenith-hr-review`** - Stores all submitted reviews (isDraft=false)
2. **`zenith-hr-review-draft`** - Stores all draft reviews (isDraft=true)  
3. **`zenith-hr-cycle`** - Stores review cycles

## Database Schema Changes

### New Tables

#### 1. zenith-hr-review (Submitted Reviews)
- **Primary Key**: `pk` (HASH), `sk` (RANGE)
- **GSIs**:
  - `ReviewIdIndex` - Query by reviewId
  - `EmployeeIndex` - Query by employeeId
  - `ReviewerIndex` - Query by reviewerId
- **Purpose**: All submitted reviews (isDraft=false)

#### 2. zenith-hr-review-draft (Draft Reviews)
- **Primary Key**: `pk` (HASH), `sk` (RANGE)
- **GSIs**: Same as reviews table
- **Purpose**: All draft reviews (isDraft=true)

#### 3. zenith-hr-cycle (Review Cycles)
- **Primary Key**: `year` (HASH)
- **Purpose**: Review cycle metadata

## API Changes

### Backward Compatibility

**All API endpoints remain the same!** The frontend does not need any changes. The API automatically routes requests to the correct table based on the `isDraft` status.

### Internal Changes

- **Cycle Endpoints**: Now use `zenith-hr-cycle` table
- **Review Endpoints**: Automatically route to:
  - `zenith-hr-review` for submitted reviews (isDraft=false)
  - `zenith-hr-review-draft` for draft reviews (isDraft=true)
- **Review Updates**: When `isDraft` status changes, the review is automatically moved between tables

## Migration Process

### Step 1: Create New Tables

The tables will be automatically created when the application starts (via `create_tables_if_not_exist()`).

### Step 2: Run Migration Script

```bash
cd backend
python -m app.scripts.migrate_reviews_to_three_tables
```

This script will:
1. Read all cycles from the old table and write to `zenith-hr-cycle`
2. Read all reviews from the old table and:
   - Write to `zenith-hr-review` if isDraft=false
   - Write to `zenith-hr-review-draft` if isDraft=true

### Step 3: Verify Migration

After migration, verify that:
- All cycles are in `zenith-hr-cycle` table
- All submitted reviews are in `zenith-hr-review` table
- All draft reviews are in `zenith-hr-review-draft` table

### Step 4: Update Environment Variables (Optional)

You can customize table names via environment variables:
```bash
DYNAMODB_TABLE_REVIEWS=zenith-hr-review
DYNAMODB_TABLE_REVIEW_DRAFTS=zenith-hr-review-draft
DYNAMODB_TABLE_CYCLES=zenith-hr-cycle
```

## Code Changes Summary

### Backend Files Modified

1. **`backend/app/database_dynamodb.py`**
   - Added three new table definitions
   - Added helper functions: `get_review_drafts_table()`, `get_cycles_table()`, `get_review_table_by_draft_status()`

2. **`backend/app/routers/reviews.py`**
   - Updated cycle endpoints to use `zenith-hr-cycle` table
   - Updated review endpoints to route to appropriate table based on `isDraft`
   - Added logic to move reviews between tables when draft status changes

### Frontend Changes

**No changes required!** The API endpoints and response formats remain identical.

## Benefits

1. **Better Organization**: Clear separation between submitted reviews, drafts, and cycles
2. **Improved Performance**: Smaller tables with focused indexes
3. **Easier Maintenance**: Each table has a specific purpose
4. **Scalability**: Can scale each table independently based on usage patterns

## Rollback Plan

If you need to rollback:
1. The old table structure is still supported (if data exists)
2. You can modify the code to read from the old table structure
3. Migration script can be reversed to copy data back

## Testing

After migration, test the following:
1. Create a new cycle
2. Create a draft review
3. Submit a review (move from draft to submitted)
4. Query reviews by employeeId
5. Query reviews by reviewerId
6. Update a review
7. Delete a review

All operations should work seamlessly with the new table structure.

