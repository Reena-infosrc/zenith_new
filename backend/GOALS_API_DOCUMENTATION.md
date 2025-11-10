# Goals & Milestones API Documentation

## Overview
Complete REST API for managing Goals and Milestones using DynamoDB (`zenith-hr-goals` table). All endpoints require authentication via JWT token.

## Base URL
`/api/goals`

## Authentication
All endpoints require `Authorization: Bearer <token>` header.

---

## Goals Endpoints

### 1. Create Goal (POST)
**Endpoint:** `POST /api/goals/`

**Description:** Manager can set goals for their direct reports (team members).

**Request Body:**
```json
{
  "employeeId": "string",
  "title": "string",
  "description": "string (optional)",
  "category": "string",
  "targetDate": "2024-12-31",
  "milestones": [
    {
      "title": "string",
      "dueDate": "2024-06-15"
    }
  ]
}
```

**Response:** `201 Created` - Returns created goal with ID

**Permissions:** Manager must be the direct manager of the employee (checked via `reporting_to` field)

---

### 2. Get Goal (GET)
**Endpoint:** `GET /api/goals/{goal_id}`

**Description:** View a specific goal by ID.

**Response:** Returns goal details

**Permissions:** 
- User can view their own goals
- Manager can view goals of their team members

---

### 3. Get Employee Goals (GET)
**Endpoint:** `GET /api/goals/employee/{employee_id}`

**Description:** Get all goals for a specific employee.

**Response:** List of goals

**Permissions:**
- User can view their own goals
- Manager can view goals of their team members

---

### 4. Update Goal (PUT)
**Endpoint:** `PUT /api/goals/{goal_id}`

**Description:** Manager can edit goals they created for their team members.

**Request Body:**
```json
{
  "title": "string (optional)",
  "description": "string (optional)",
  "category": "string (optional)",
  "targetDate": "2024-12-31 (optional)",
  "status": "string (optional)",
  "completion": 0.0 (optional),
  "milestones": [...] (optional),
  "managerApproved": true/false (optional),
  "managerReopened": true/false (optional)
}
```

**Response:** Returns updated goal

**Permissions:** Manager must have created the goal or be manager of the employee

**Note:** Completion percentage is automatically recalculated when milestones are updated.

---

### 5. Delete Goal (DELETE)
**Endpoint:** `DELETE /api/goals/{goal_id}`

**Description:** Manager can delete goals they created.

**Response:** `204 No Content`

**Permissions:** Manager must have created the goal

---

## Milestone Endpoints

### 1. Create Milestone (POST)
**Endpoint:** `POST /api/goals/{goal_id}/milestones`

**Description:** User/Manager can create milestones for goals they have access to.

**Request Body:**
```json
{
  "title": "string",
  "dueDate": "2024-06-15"
}
```

**Response:** `201 Created` - Returns created milestone with ID

**Permissions:**
- User can add milestones to their own goals
- Manager can add milestones to team member goals

**Note:** Completion percentage is automatically recalculated.

---

### 2. Update Milestone (PUT)
**Endpoint:** `PUT /api/goals/{goal_id}/milestones/{milestone_id}`

**Description:** User/Manager can update milestones (mark as completed, add comments, evidence, etc.).

**Request Body:**
```json
{
  "title": "string (optional)",
  "completed": true/false (optional),
  "dueDate": "2024-06-15 (optional)",
  "evidence": "string (optional)",
  "completedDate": "2024-06-10 (optional)",
  "userComment": "string (optional)",
  "managerComment": "string (optional)",
  "managerApproved": true/false (optional),
  "managerReopened": true/false (optional)
}
```

**Response:** Returns updated milestone

**Permissions:**
- User can update milestones in their own goals
- Manager can update milestones in team member goals

**Note:** 
- When marking as completed, `completedDate` is automatically set
- When reopening, `completedDate` is cleared
- Completion percentage and goal status are automatically updated
- If all milestones are completed, goal status changes to `pending_manager_approval`

---

### 3. Delete Milestone (DELETE)
**Endpoint:** `DELETE /api/goals/{goal_id}/milestones/{milestone_id}`

**Description:** User can delete milestones from their own goals.

**Response:** `204 No Content`

**Permissions:** Only user can delete milestones from their own goals

**Note:** Completion percentage is automatically recalculated.

---

### 4. Get Milestones (GET)
**Endpoint:** `GET /api/goals/{goal_id}/milestones`

**Description:** Get all milestones for a goal.

**Response:** List of milestones

**Permissions:**
- User can view milestones of their own goals
- Manager can view milestones of team member goals

---

## Notification Endpoints

### 1. Check Due Milestones (POST)
**Endpoint:** `POST /api/goals/notifications/check-due-milestones?days_ahead=7`

**Description:** Check and send notifications for milestones due within specified days (default: 7 days).

**Query Parameters:**
- `days_ahead` (optional): Number of days to look ahead (1-30, default: 7)

**Response:**
```json
{
  "success": true,
  "notifications_sent": 5,
  "message": "Checked milestones due within 7 days"
}
```

**Usage:** This endpoint should be called periodically (e.g., daily via cron job or scheduled task).

---

### 2. Get Overdue Milestones (GET)
**Endpoint:** `GET /api/goals/notifications/overdue`

**Description:** Get all overdue milestones.

**Response:**
```json
{
  "overdue_count": 3,
  "overdue_milestones": [...]
}
```

---

## Data Models

### Goal
```json
{
  "id": "string",
  "employeeId": "string",
  "title": "string",
  "description": "string",
  "category": "string",
  "targetDate": "2024-12-31",
  "status": "in_progress | completed | pending | pending_manager_approval | manager_reopened",
  "completion": 0.0,
  "milestones": [...],
  "createdBy": "string",
  "managerApproved": true/false,
  "managerReopened": true/false,
  "created_at": "2024-01-15T10:00:00",
  "updated_at": "2024-01-15T10:00:00"
}
```

### Milestone
```json
{
  "id": "string",
  "title": "string",
  "completed": false,
  "dueDate": "2024-06-15",
  "evidence": "string (optional)",
  "completedDate": "2024-06-10 (optional)",
  "managerApproved": true/false (optional),
  "managerReopened": true/false (optional),
  "managerComment": "string (optional)",
  "userComment": "string (optional)"
}
```

---

## Setup Instructions

### 1. Clear Existing Data
Run the cleanup script to remove dummy data:
```bash
cd backend
python clear_goals_table.py
```

### 2. Table Structure
The `zenith-hr-goals` table is already configured in `database_dynamodb.py` with:
- Primary Key: `id`
- GSI: `EmployeeIndex` on `employeeId`

### 3. Notification Setup
To enable automatic notifications:
1. Set up a cron job or scheduled task to call `/api/goals/notifications/check-due-milestones` daily
2. Implement actual notification sending in `milestone_notification.py` (currently logs only)

---

## Security Features

1. **Authentication Required:** All endpoints require valid JWT token
2. **Manager Verification:** Checks if manager is direct manager via `reporting_to` field
3. **Employee ID Validation:** Verifies employee exists before creating goals
4. **Permission Checks:** Users can only access their own goals or goals of their direct reports

---

## Error Responses

- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User doesn't have permission
- `404 Not Found`: Goal or milestone not found
- `500 Internal Server Error`: Server error

---

## Notes

- All dates are in ISO format strings (e.g., "2024-06-15")
- Completion percentage is automatically calculated based on completed milestones
- Goal status automatically changes to `pending_manager_approval` when all milestones are completed
- Employee ID is referenced from the `zenith-hr-employees` table
- Manager relationship is determined by the `reporting_to` field in employee records

