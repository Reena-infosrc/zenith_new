# Refactored Architecture: Client RM Feedback

The Client RM Feedback feature architecture has been updated to improve performance and data integrity for production.

## 1. Separated Monthly Periods

Previously, the lightweight monthly feedback periods (~12 items per year) were stored in the same DynamoDB table as the high-volume submissions and drafts. They have now been cleanly extracted to their own table.

- **New Table Details:** `zenith-hr-monthly-feedback-periods-{stage}` was added to `serverless.yml`.
- **API Performance:** The backend router `client_rm_feedback.py` was rewritten to interact with this dedicated table. `period_id` is now the partition key, which allows the use of an efficient `get_item` operation instead of scanning the full table for period operations. A GSI was also added for querying open periods.
- **Migration:** A migration script (`backend/app/scripts/migrate_periods_to_new_table.py`) was created to move existing periods safely and idempotently to the new table.

## 2. Point-in-Time Organizational Snapshots

Submitted feedback is treated as immutable, but historically the system only tracked *who* pressed submit, missing crucial changes if the firm's structure shifted. Submissions now record an organizational snapshot.

- **Backend Update:** Whenever a submission or draft is saved, a snapshot of the employee's `reporting_to`, `department`, `position`, and `account` is grabbed from the directory and injected into the payload.
- **Why this matters:** If an employee changes departments or their manager changes in month B, month A's immutable record will accurately reflect the historical alignment.
- **Frontend Enhancements:** 
  - The read-only report view has been enhanced. If the `reporting_to` differs from the physical submitter, the UI explicitly displays the historical reporting line.
  - The Monthly Feedback CSV export table now includes these snapshot statuses (Position, Department, Account, Reporting To).

## Next Steps for Deployment
- Apply changes via `serverless deploy` (this will create the new table).
- Run the migration script against the deployed environment.
