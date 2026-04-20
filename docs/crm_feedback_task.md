# CRM Feedback Fixes — Task Tracker

## Phase 1: Period Migration to Dedicated Table

- [x] Add `DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS` to `.env` and `.env.staging`
- [x] Add table mapping + accessor in `database_dynamodb.py`
- [x] Add CloudFormation resource in `serverless.yml`
- [x] Rewrite period CRUD in `client_rm_feedback.py` to use new table
- [x] Update `get_notification_summary()` to read periods from new table
- [x] Create migration script to move existing periods

## Phase 2: Context Snapshots

- [x] Add snapshot fields to Pydantic models
- [x] Add snapshot population logic in `create_submission()` and `upsert_active_draft()`
- [x] Update frontend read-only view with snapshot context
- [x] Update CSV export with snapshot columns

## Phase 3: Verification

- [x] Verify backend logic is updated correctly
- [x] Verify frontend handles new properties
