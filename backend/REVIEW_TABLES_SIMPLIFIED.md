# Simplified Review Tables Structure

## Overview

The review system now uses three separate tables with simplified schemas. The `isDraft` field is **no longer stored** in the database - it's determined by which table the data is in.

## Table Structures

### 1. `zenith-hr-review` (Submitted Reviews)
**Purpose**: All submitted reviews (submittedAt is set)

**Key Columns**:
- `pk` (HASH) - Cycle partition key: `CYCLE#{year}`
- `sk` (RANGE) - Review sort key: `REVIEW#{reviewId}`
- `reviewId` - Unique review identifier
- `cycleYear` - Review cycle year
- `employeeId` - Employee being reviewed
- `reviewerId` - Person conducting the review
- `reviewType` - Type: self, manager, peer, etc.
- `goalIds` - List of goal IDs
- `ratings` - Rating data
- `comments` - Review comments
- `strengths` - List of strengths
- `improvements` - List of improvements
- `attachments` - List of attachment URLs
- `metadata` - Additional structured data
- `submittedAt` - ISO timestamp when review was submitted
- `createdAt` - ISO timestamp when review was created
- `updatedAt` - ISO timestamp when review was last updated
- `createdBy` - User who created the review

**Note**: `isDraft` is NOT stored - reviews in this table are always submitted (isDraft=false)

### 2. `zenith-hr-review-draft` (Draft Reviews)
**Purpose**: All draft reviews (submittedAt is null/undefined)

**Key Columns**: Same as `zenith-hr-review` table

**Note**: `isDraft` is NOT stored - reviews in this table are always drafts (isDraft=true)

### 3. `zenith-hr-cycle` (Review Cycles)
**Purpose**: Review cycle metadata

**Key Columns**:
- `year` (HASH) - Primary key: 4-digit year (e.g., "2025")
- `name` - Cycle name
- `description` - Cycle description
- `status` - Cycle status: draft, open, locked, closed
- `startDate` - ISO date string
- `endDate` - ISO date string
- `metadata` - Additional cycle configuration
- `createdAt` - ISO timestamp
- `updatedAt` - ISO timestamp

## API Behavior

### Creating Reviews

**Draft Review** (goes to `zenith-hr-review-draft`):
```json
{
  "cycleYear": "2025",
  "employeeId": "...",
  "reviewerId": "...",
  "reviewType": "self",
  "submittedAt": null  // or omit the field
}
```

**Submitted Review** (goes to `zenith-hr-review`):
```json
{
  "cycleYear": "2025",
  "employeeId": "...",
  "reviewerId": "...",
  "reviewType": "self",
  "submittedAt": "2025-01-15T10:30:00Z"  // ISO timestamp
}
```

### Updating Reviews

**Submitting a Draft** (moves from draft table to review table):
```json
{
  "submittedAt": "2025-01-15T10:30:00Z"
}
```

**Unsubmitting a Review** (moves from review table to draft table):
```json
{
  "submittedAt": null
}
```

### API Response

The API response includes `isDraft` for backward compatibility, but it's computed based on which table the data came from:

```json
{
  "reviewId": "...",
  "cycleYear": "2025",
  "employeeId": "...",
  "isDraft": false,  // Computed: false if from reviews table, true if from review_drafts table
  "submittedAt": "2025-01-15T10:30:00Z",
  ...
}
```

## Migration Notes

1. **Old Data**: The migration script copies existing data but may include `isDraft` field in old records. This is fine - the API ignores it.

2. **New Data**: All new reviews created after migration will NOT have `isDraft` field stored.

3. **Frontend**: The frontend has been updated to not send `isDraft` - it only sends `submittedAt`.

## Benefits

1. **Simpler Schema**: No redundant `isDraft` field
2. **Clear Separation**: Table name indicates draft vs submitted
3. **Automatic Routing**: API automatically routes to correct table based on `submittedAt`
4. **Backward Compatible**: API still returns `isDraft` in responses for frontend compatibility

