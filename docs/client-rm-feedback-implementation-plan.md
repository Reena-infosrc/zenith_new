# Client Reporting Manager Feedback — Implementation Plan (Zenith HR Pulse)

## 1) Overview
### 1.1 Goal
Implement a new feature to collect **Client Reporting Manager performance feedback** for employees (reportees), submitted by Reporting Managers, and visible only to authorized viewers.

### 1.2 Placement (Frontend)
Add a new tab under **Performance** in the **User view**:

- `Overview | Goals & Timeline | Annual Review | Monthly feedback`

This tab must appear **immediately to the right** of **Annual Review**.

### 1.3 Professional naming (UI)
- **Tab label**: `Monthly feedback`
- **Form title**: `Monthly feedback` (short product name in-app; legacy form reference optional in copy)

### 1.4 Key requirements (non-negotiable)
- Only managers **with reportees** can submit/edit.
- Reportees must never see other employees’ feedback.
- Responses must be viewable by:
  - the submitting Reporting Manager
  - the respective reportee
  - HR Team
  - Leadership (subset of leadership only)
- Admin creates the period/form and a **notification indicator** is shown to eligible viewers.
- Maintain backend-only **change tracking** for context fields (client/project/manager mappings) even if they change later.

---

## 2) Current Zenith architecture notes (what we will leverage)
### 2.1 Role detection (existing)
Zenith determines manager vs user view using:
- `GET /api/employees/check-team-members`
  - Returns `has_team_members`, `view_mode`, and `team_count`
  - Uses `employees.reporting_to` and `ReportingToIndex`

This will be used to gate **editability** and drive **manager notifications**.

### 2.2 Auth / privileges (existing)
Backend uses JWT auth and includes a single strong privilege flag:
- `is_admin` (backed by the Admins DynamoDB table)

There is no first-class HR role or leadership subset role today; these must be added (recommended) or approximated via admin/whitelists (fastest).

---

## 3) Access control design (recommended)
### 3.1 Entities
- **Submitter**: Info Services Reporting Manager (internal RM)
- **Subject**: employee/reportee receiving feedback
- **HR**: privileged viewers across all employees
- **Leadership subset**: privileged viewers across all employees, restricted to an explicit allowed list

### 3.2 Authorization rules (server-side enforcement)
#### Create / Edit
Allowed only if ALL are true:
1) Requester is the employee’s **Info Services Reporting Manager**
2) Requester has at least one active direct report (`has_team_members=true`)
3) Employee is a **direct report** (`employee.reporting_to == managerEmployeeId`)
4) Period is **open** (if period workflow enabled; recommended)

#### View (read-only unless above)
- **Submitter Manager**: can view submissions they authored
- **Reportee**: can view submissions where `employeeId == myEmployeeId`
- **HR**: can view all submissions
- **Leadership subset**: can view all submissions only if explicitly granted

### 3.3 HR + Leadership implementation options
#### Option A (recommended): Add lightweight access-control table
Create a new DynamoDB table mapping `email` → roles/scopes, e.g.:
- roles: `HR_FEEDBACK_VIEWER`, `LEADERSHIP_FEEDBACK_VIEWER`
- optional scopes: department/client (future)

Pros: precise, auditable, future-proof.  
Cons: small extra build.

#### Option B (fastest): reuse admin for HR + leadership whitelist
- HR = `is_admin`
- Leadership subset = a stored list of allowed emails (DynamoDB config item)

Pros: fastest.  
Cons: weaker separation (admin too powerful), less maintainable.

---

## 4) Data model & DynamoDB design
### 4.1 New DynamoDB table (required)
Add a new table with Zenith naming:
- Env var: `DYNAMODB_TABLE_CLIENT_RM_FEEDBACK`
- Value (per env): `zenith-hr-client-rm-feedback-<env>` (e.g. `...-prod`)

Add this to:
- `backend/serverless.yml` (resources + env wiring)
- `backend/.env.prod` and `backend/env_sample.txt`
- `backend/app/database_dynamodb.py` (table registry + helper getter)

### 4.2 Data separation
All reads/writes must be filtered by server-side authorization (Section 3). The table design must support efficient, index-backed queries for:
- reportee self-view
- manager’s authored submissions
- HR/leadership period-wide reporting
- notification counts

### 4.3 Periods (admin-created)
To support “admin creates the form” and enable notification indicators, implement a **period lifecycle**:
- `draft` → `open` → `closed`

Periods represent the window (month/quarter/custom range) for which feedback is collected.

### 4.4 Item types (single-table pattern)
Store multiple entity types in `zenith-hr-client-rm-feedback-*` using a partition/sort key strategy.

#### A) Period item
- **PK**: `PERIOD#<periodId>`
- **SK**: `PERIOD`
- **Fields**: `periodId`, `label`, `startDate`, `endDate`, `status`, `createdAt`, `updatedAt`, `createdByEmail`

#### B) Submission item (the actual feedback response)
- **PK**: `EMPLOYEE#<employeeId>`
- **SK**: `PERIOD#<periodId>#SUBMISSION#<submissionId>`
- **Fields**:
  - **Submitter**: `managerEmployeeId`, `managerEmail`, `managerName`
  - **Subject**: `employeeId`, `employeeName`, `employeeCode` (your “Employee ID”)
  - **Context snapshot** (tracked over time): `billingStatus`, `clientName`, `projectName`, `clientReportingManagerName`, `infoServicesReportingManagerName`
  - **Form payload** (ratings + text): see Section 5.2
  - **System timestamps**: `startedAt`, `submittedAt`, `updatedAt` (+ derived `completionTime`)
  - **Visibility helpers**: `isSubmitted` (boolean), `isActive` (boolean)

#### C) Audit snapshot item (backend-only change tracking)
Whenever any context field changes after submission (client/project/RM/billing), append an immutable record:
- **PK**: `SUBMISSION#<submissionId>`
- **SK**: `SNAPSHOT#<ISO timestamp>`
- **Fields**: `changedAt`, `changedByEmail`, `before`, `after`, `reason` (optional)

This satisfies the “update tracking field in table but not on frontend”.

### 4.5 Indexes (GSIs)
Add GSIs to support query needs without table scans.

#### GSI1: Manager submissions
- **GSI1PK**: `MANAGER#<managerEmployeeId>`
- **GSI1SK**: `PERIOD#<periodId>#EMPLOYEE#<employeeId>#SUBMISSION#<submissionId>`

Use case: Manager listing all feedback they submitted.

#### GSI2: Period-wide listing (HR/leadership)
- **GSI2PK**: `PERIOD#<periodId>`
- **GSI2SK**: `EMPLOYEE#<employeeId>#SUBMISSION#<submissionId>`

Use case: HR/leadership dashboards, exports, and filters.

#### Optional GSI3: Notifications
If you want efficient badge counts without heavy reads:
- **GSI3PK**: `NOTIF#<viewerType>#<viewerId>`
- **GSI3SK**: `PERIOD#<periodId>#...`

Alternative (simpler): compute counts by querying GSIs + lightweight “seen state” table (Section 7.3).

---

## 5) Field-level specification
### 5.1 Frontend-visible fields (grouped)
#### A) Submission metadata (auto-filled, read-only)
- ID
- Start time
- Completion time
- Email (submitter)
- Name (submitter)
- Last modified time

#### B) Employee context (mostly auto-filled; tracked)
- Employee Name
- Employee ID
- Billing Status (enum)
  - Billable Resource
  - Non-billable Resource
  - Internal Resource
- Client Name
- Project Name
- Client Reporting Manager Name
- Info Services Reporting Manager Name
- Feedback Period Date (or period start/end)

#### C) Ratings (required)
Use a consistent 1–5 scale with labels (example):
1 = Needs Improvement, 2 = Developing, 3 = Meets Expectations, 4 = Exceeds, 5 = Outstanding

Required rating fields:
- Quality of Deliverables
- Adherence to Deadlines
- Technical Competency
- Problem-Solving Skills
- Productivity & Efficiency
- Accuracy and Attention to Detail
- Ability to Work Independently
- Understanding of Requirements
- Responsiveness to Work Assignments
- Clarity in Communication
- Responsiveness to Emails/Calls
- Understanding of Requirements2 (rename recommended → Business/Domain Understanding)
- Status Reporting and Updates
- Team Collaboration
- Participation in Discussions
- Overall Satisfaction with Employee Performance

#### D) Free text (optional)
- Any additional feedback or suggestions?

### 5.2 Backend payload structure (suggested)
Store ratings in a structured object for easy reporting:
- `ratings: { qualityOfDeliverables: number, adherenceToDeadlines: number, ... }`
- `comments: { additionalFeedback?: string }`

---

## 6) Backend API design (FastAPI)
Create a new router:
- `backend/app/routers/client_rm_feedback.py`

### 6.1 Period endpoints (Admin/HR only)
- `POST /api/client-rm-feedback/periods`
  - Create a period (draft/open/closed), label, dates
- `GET /api/client-rm-feedback/periods`
  - List periods (for UI and selection)
- `PUT /api/client-rm-feedback/periods/{periodId}`
  - Change status (open/close), update metadata

### 6.2 Submission endpoints
- `POST /api/client-rm-feedback/submissions`
  - Create/submit feedback for `employeeId` + `periodId`
  - Server derives/validates manager relationship and period status
- `PUT /api/client-rm-feedback/submissions/{submissionId}`
  - Edit submission (authorized manager only; policy-based)
- `GET /api/client-rm-feedback/submissions`
  - Supported filters (server will restrict results):
    - `employeeId` (reportee self view)
    - `managerEmployeeId` (manager authored view)
    - `periodId` (HR/leadership view)
    - `clientName`, `projectName` (optional filters)

### 6.3 Notification endpoints
- `GET /api/client-rm-feedback/notifications/summary`
  - Manager: count of direct reportees missing submission in active period
  - Reportee: count of unread submissions about them
  - HR/Leadership: count of new submissions since last seen (optional)

---

## 7) Frontend implementation plan
### 7.1 UI placement (required)
Modify `src/components/performance/UserPerformanceView.tsx` tab list:
- Add `TabsTrigger value="client-rm-feedback"` immediately after `annual-review`.

### 7.2 Screens/components (suggested)
- `ClientRMFeedbackTab`
  - `ClientRMFeedbackList` (role-aware list)
  - `ClientRMFeedbackDetails` (read-only details)
  - `ClientRMFeedbackForm` (manager-only create/edit)

### 7.3 Notification indicator behavior
Add a badge/glow on the tab label:
- Call `GET /api/client-rm-feedback/notifications/summary`
- Display:
  - Manager: pending count
  - Reportee: unread count
  - HR/Leadership: new submissions count (optional)

To support “unread” without leaking data:
- Maintain a viewer-specific “seen state”:
  - **Option 1**: new DynamoDB table `zenith-hr-client-rm-feedback-reads-*`
  - **Option 2**: store seen markers in the main table under `PK=VIEWER#...`

---

## 8) Rollout plan
### 8.1 Feature flag (recommended)
Add a feature flag entry (module `performance`, category appropriate) so this can be enabled progressively.

### 8.2 Environments
- Add env vars and tables for dev/staging/prod
- Deploy backend endpoints first, then frontend

---

## 9) Test plan (minimum)
### 9.1 Authorization tests
- Reportee cannot fetch another employee’s submissions (must return 403/empty)
- Manager cannot submit for non-direct-report employee
- Manager with `has_team_members=false` cannot submit/edit
- HR can view all submissions
- Leadership subset can view only when allowed; denied otherwise

### 9.2 Data integrity tests
- Submission stores context snapshot correctly
- Context change produces audit snapshot item
- Period open/close enforced on create/edit (if policy enabled)

### 9.3 UI tests (manual)
- Tab is visible and positioned to the right of Annual Review
- Badge appears after admin opens a period and pending/unread exists
- Reportee sees only their data

---

## 10) Implementation phases (high-level)
### Phase 0: Discovery & policy decisions
- Confirm where client/project/client RM fields come from (employees table vs resource mappings)
- Decide edit policy (allowed until submit? until period closed?)
- Choose HR/leadership access approach (Section 3.3)

### Phase 1: Backend + DynamoDB foundations
- Add table + GSIs in `serverless.yml`
- Add env vars in `.env.prod` and sample files
- Add table getter to `database_dynamodb.py`
- Implement router endpoints + authorization helpers

### Phase 2: Frontend tab + forms
- Add tab to `UserPerformanceView`
- Implement list + details + manager form
- Implement notification badge via summary endpoint

### Phase 3: Audit tracking + unread state
- Implement context snapshot diffs to audit items
- Implement seen/unseen tracking if required for notifications

### Phase 4: QA + rollout
- Run authorization and data tests
- Enable feature flag per environment
