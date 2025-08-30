# Academic Calendar Management Endpoints

## Overview
These endpoints allow school administrators to manage academic calendars with proper multi-tenant isolation. Each school can have multiple academic calendars, but only one can be active at a time.

## Endpoints

### 1. Get Active Academic Calendar
**GET** `/api/v1/settings/active-academic-calendar`

**Description**: Returns the currently active academic calendar for the authenticated admin's school.

**Authorization**: School Admin only

**Response**:
```json
{
  "id": "uuid",
  "Term": "2024-2025",
  "startDate": "2024-09-01T00:00:00.000Z",
  "endDate": "2025-06-30T00:00:00.000Z",
  "isActive": true
}
```

**Response when no active calendar**: `null`

### 2. Set Active Academic Calendar
**PATCH** `/api/v1/settings/set-active-academic-calendar/:id`

**Description**: Sets a specific academic calendar as active for the admin's school. Automatically deactivates all other calendars for that school.

**Authorization**: School Admin only

**Parameters**:
- `id` (path): UUID of the academic calendar to activate

**Response**:
```json
{
  "success": true,
  "message": "Academic calendar for 2024-2025 is now active",
  "activeCalendar": {
    "id": "uuid",
    "Term": "2024-2025",
    "startDate": "2024-09-01T00:00:00.000Z",
    "endDate": "2025-06-30T00:00:00.000Z",
    "isActive": true
  }
}
```

### 3. Create Academic Calendar
**POST** `/api/v1/settings/academic-calendar`

**Description**: Creates a new academic calendar for the admin's school.

**Authorization**: School Admin only

**Request Body**:
```json
{
  "Term": "2024-2025",
  "startDate": "2024-09-01",
  "endDate": "2025-06-30",
  "isActive": true
}
```

**Response**:
```json
{
  "id": "uuid",
  "Term": "2024-2025",
  "startDate": "2024-09-01T00:00:00.000Z",
  "endDate": "2025-06-30T00:00:00.000Z",
  "isActive": true
}
```

### 4. Get All Academic Calendars
**GET** `/api/v1/settings/academic-calendars`

**Description**: Returns all academic calendars for the admin's school, ordered by creation date (newest first).

**Authorization**: School Admin only

**Response**:
```json
[
  {
    "id": "uuid1",
    "Term": "2024-2025",
    "startDate": "2024-09-01T00:00:00.000Z",
    "endDate": "2025-06-30T00:00:00.000Z",
    "isActive": true
  },
  {
    "id": "uuid2",
    "Term": "2023-2024",
    "startDate": "2023-09-01T00:00:00.000Z",
    "endDate": "2024-06-30T00:00:00.000Z",
    "isActive": false
  }
]
```

### 5. Activate Existing Academic Calendar
**PATCH** `/api/v1/settings/academic-calendar/:id/activate`

**Description**: Alternative endpoint to activate an academic calendar (same functionality as #2).

**Authorization**: School Admin only

**Parameters**:
- `id` (path): UUID of the academic calendar to activate

## Multi-Tenant Security

### School Isolation
- ✅ Each school's academic calendars are completely isolated
- ✅ Admins can only see and manage calendars for their own school
- ✅ Calendar activation only affects the admin's school
- ✅ SUPER_ADMIN users cannot access individual school calendars

### Access Control
- ✅ Only users with ADMIN role can access these endpoints
- ✅ Admin must have a valid schoolId (must be associated with a school)
- ✅ All operations are scoped to the admin's school

### Database Changes
- ✅ `academic_calendar` table now includes `schoolId` column
- ✅ Foreign key relationship to `school` table with CASCADE delete
- ✅ Removed global unique constraint on `Term` (now unique per school)

## Usage Example

1. **Create a new academic calendar**:
   ```bash
   POST /api/v1/settings/academic-calendar
   {
     "Term": "2024-2025",
     "startDate": "2024-09-01",
     "endDate": "2025-06-30",
     "isActive": true
   }
   ```

2. **Get the currently active calendar**:
   ```bash
   GET /api/v1/settings/active-academic-calendar
   ```

3. **Switch to a different calendar**:
   ```bash
   PATCH /api/v1/settings/set-active-academic-calendar/calendar-uuid
   ```

4. **List all calendars for the school**:
   ```bash
   GET /api/v1/settings/academic-calendars
   ```

## Logging
All calendar activation actions are logged with:
- Action: `ACADEMIC_CALENDAR_ACTIVATED`
- Module: `SETTINGS`
- User information (ID, email, role)
- Calendar ID and term
- School ID for audit purposes
