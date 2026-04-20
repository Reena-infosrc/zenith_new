# Client RM Feedback: Period Migration & Context Snapshot Fixes

## Problem Statement

Two architectural issues in the Client RM Feedback feature:

1. **Period data mixed with feedback data**: Monthly feedback periods (lightweight metadata — ~12 per year) are stored in the same `zenith-hr-client-rm-feedback` table as individual employee submissions and drafts (potentially thousands of rows). This pollutes scan results and wastes GSI capacity.

2. **Missing point-in-time snapshots**: Submissions capture `manager_name` and `manager_email` at submit time, but don't adequately snapshot _contextual metadata_ that can change month-to-month:
   - **Billable employee context**: Client name and client manager details can change (employee switches project/client mid-quarter). Each submission should be an immutable snapshot of the state at submission time.
   - **Reporting manager changes**: If an employee's manager changes (April feedback by Manager A, May by Manager B), each submission must record who the org-chart manager was at that time, in addition to who submitted.

---

## Proposed Changes

### Phase 1: Migrate Periods to a Dedicated Table

The existing `zenith-hr-cycle` table uses `year` (String) as its sole primary key — it stores yearly review cycles. Monthly feedback periods can't use `year` as PK since there are multiple periods per year.

**Recommendation: Create a new dedicated `zenith-hr-monthly-feedback-periods-{stage}` table.**

This is cleaner than hacking periods into the cycle table, avoids coupling monthly feedback lifecycle to annual reviews, and will have negligible DynamoDB costs (~12 items/year).

**Table schema:**
- **PK**: `period_id` (String, UUID)
- **GSI `StatusIndex`**: PK = `period_status` — enables efficient "find open periods" query

**Period item shape (unchanged from current):**
```json
{
  "period_id": "uuid",
  "label": "April 2026",
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "period_status": "draft | open | closed",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "created_by_email": "admin@company.com"
}
```

No `entity_type` field needed — this table stores only periods.

#### Backend Changes

**`database_dynamodb.py`**:
- Add `DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS` to the table mapping
- Add `get_monthly_feedback_periods_table()` accessor function

**`client_rm_feedback.py`** (period endpoints):
- `create_period()`: Use new table, `period_id` as PK, no `entity_type` / `id` fields needed
- `list_periods()`: Scan the new (small) table — only ~12 items, so scan is fine here
- `update_period()`: Direct `get_item(Key={"period_id": period_id})` instead of filter scan
- `get_notification_summary()`: Read periods from new table instead of scanning feedback table

**.env files**:
- Add `DYNAMODB_TABLE_MONTHLY_FEEDBACK_PERIODS=zenith-hr-monthly-feedback-periods[-staging]`

**`serverless.yml`**:
- Add CloudFormation resource for the new table with StatusIndex GSI

#### Frontend Changes
- **None** — the `/periods` API contract (response shape) stays identical.

---

### Phase 2: Point-in-Time Context Snapshots on Submissions

Each submission already stores manager info (`manager_employee_id`, `manager_name`, `manager_email`). We will enhance this to capture a complete **organizational context snapshot** at the moment of submission.

#### New snapshot fields on submissions and drafts

| Field | Source | Purpose |
|---|---|---|
| `snapshot_reporting_to_id` | `employee.reporting_to` | Org-chart manager ID at submit time |
| `snapshot_reporting_to_name` | Resolved from directory | Org-chart manager name at submit time |
| `snapshot_reporting_to_email` | Resolved from directory | Org-chart manager email at submit time |
| `snapshot_employee_department` | `employee.department` | Employee's department at submit time |
| `snapshot_employee_position` | `employee.position` | Employee's title at submit time |
| `snapshot_employee_account` | `employee.account` | Employee's client account at submit time |

The existing fields `billing_status`, `client_name`, `client_manager_name`, `client_manager_email`, and `info_services_reporting_manager_name` already serve as per-submission snapshots — no structural changes needed for those.

#### Backend Changes

**`models/client_rm_feedback.py`**:
- Add optional snapshot fields to `ClientRMFeedbackSubmissionCreate` and `ClientRMFeedbackDraftUpsert`
- Backend auto-populates these from the directory at submit time (frontend doesn't need to send them)

**`client_rm_feedback.py`** — `create_submission()`:
```python
# After fetching subject_employee:
reporting_to_id = subject_employee.get("reporting_to", "")
reporting_to_employee = await _get_employee_by_id(reporting_to_id) if reporting_to_id else None

item["snapshot_reporting_to_id"] = reporting_to_id
item["snapshot_reporting_to_name"] = reporting_to_employee.get("name", "") if reporting_to_employee else ""
item["snapshot_reporting_to_email"] = _normalize_email(reporting_to_employee.get("email", "")) if reporting_to_employee else ""
item["snapshot_employee_department"] = subject_employee.get("department", "")
item["snapshot_employee_position"] = subject_employee.get("position", "")
item["snapshot_employee_account"] = subject_employee.get("account", "")
```

Same for `upsert_active_draft()`.

#### Why this design handles all the edge cases

**Scenario: Manager change between months**
- April: Manager A submits for Employee X
  - `manager_employee_id=A`, `manager_name="Manager A"`, `snapshot_reporting_to_id=A`
- May: Employee X's `reporting_to` changes to Manager B in the directory
- Manager A no longer sees Employee X in their reportees
- Manager B now sees Employee X and submits May feedback
  - `manager_employee_id=B`, `manager_name="Manager B"`, `snapshot_reporting_to_id=B`
- April's record remains immutable and accurate

**Scenario: Client change for billable employee**
- April: billable on Client Alpha → `client_name=Alpha`, `client_manager_name=PM1`, `client_manager_email=pm1@alpha.com`
- May: moves to Client Beta → `client_name=Beta`, `client_manager_name=PM2`, `client_manager_email=pm2@beta.com`
- Each submission is an independent snapshot (this already works, just documenting)

**Scenario: Submitter ≠ org-chart manager (e.g., skip-level or delegate)**
- `manager_employee_id` = who submitted
- `snapshot_reporting_to_id` = who the directory says the employee reports to
- If different, the system captures both for audit trail

#### Frontend Changes

**`ClientRMFeedbackTab.tsx`** — Read-only view (submission history cards):
- Show `snapshot_reporting_to_name` when it differs from `manager_name`
- Display department/position if available

**`MonthlyFeedbackManagement.tsx`** — CSV export:
- Add 4 new columns: `Reporting To (at time)`, `Department (at time)`, `Position (at time)`, `Account (at time)`

---

## Open Questions

1. **New table vs cycle table**: The plan recommends a dedicated `zenith-hr-monthly-feedback-periods` table. Do you agree, or prefer to use the existing cycle table with a workaround?

2. **Existing period data migration**: There are existing period records in the `zenith-hr-client-rm-feedback` table. Should I write a migration script to move them to the new table? Or is it safe to start fresh?

3. **Employee `account` field**: Should we include the `account` field from the employee directory in snapshots? (Is it actively maintained in your directory data?)

---

## Verification Plan

### Automated Tests
- Start backend locally, test each endpoint:
  - `POST /periods` → verify period created in new table
  - `GET /periods` → verify periods returned from new table  
  - `PUT /periods/{id}` → verify update works with direct `get_item`
  - `POST /submissions` → verify snapshot fields populated
  - `GET /submissions` → verify snapshot fields returned
  - `GET /notifications/summary` → verify period count uses new table

### Manual Verification
- Frontend: verify feedback form flow works end-to-end
- CSV export: verify new snapshot columns appear
- Admin: verify period creation/closing from dashboard
