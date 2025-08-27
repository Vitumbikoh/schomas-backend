# Academic Calendar Validation Implementation

## Overview
This implementation adds validation to prevent schools from setting previous academic calendars as active. The validation ensures academic integrity by maintaining a forward progression of academic years.

## Features Implemented

### 1. Academic Calendar Validation Utility
**File**: `src/settings/utils/academic-calendar.utils.ts`

**Key Methods**:
- `extractStartYear(academicYear: string)`: Extracts start year from "YYYY-YYYY" format
- `extractEndYear(academicYear: string)`: Extracts end year from "YYYY-YYYY" format
- `canActivateCalendar(targetYear, currentActiveYear)`: Validates if a calendar can be activated
- `compareAcademicYears(year1, year2)`: Compares two academic years
- `getNextAcademicYear(currentYear)`: Gets the next academic year
- `getPreviousAcademicYear(currentYear)`: Gets the previous academic year

### 2. Service Layer Validation
**File**: `src/settings/settings.service.ts`

**Updated Method**: `activateAcademicCalendar(id: string, schoolId: string)`

**Validation Logic**:
1. Retrieves the target calendar to be activated
2. Gets the currently active calendar (if any)
3. Validates using `AcademicCalendarUtils.canActivateCalendar()`
4. Throws `BadRequestException` if validation fails
5. Proceeds with activation if validation passes

### 3. Controller Layer Validation
**File**: `src/settings/settings.controller.ts`

**Updated Methods**:
- `activateAcademicCalendar()`: PATCH `/academic-calendar/:id/activate`
- `setActiveAcademicCalendar()`: PATCH `/set-active-academic-calendar/:id`

Both methods now include the same validation logic before attempting to activate a calendar.

## Validation Rules

### ✅ Allowed Operations
1. **First Calendar**: Setting any calendar as active when no calendar is currently active
2. **Same Year**: Reactivating the currently active calendar
3. **Future Years**: Setting calendars from future years as active (e.g., 2025-2026 when 2024-2025 is active)

### ❌ Blocked Operations
1. **Previous Years**: Setting calendars from previous years as active (e.g., cannot set 2023-2024 as active when 2024-2025 is active)
2. **Invalid Formats**: Academic years not in "YYYY-YYYY" format

## Example Scenarios

### Scenario 1: Valid Progression
```
Current State: 2024-2025 (active)
Available Calendars: 2023-2024, 2024-2025, 2025-2026, 2026-2027

✅ Can activate: 2025-2026, 2026-2027
❌ Cannot activate: 2023-2024
✅ Can reactivate: 2024-2025
```

### Scenario 2: No Active Calendar
```
Current State: No active calendar
Available Calendars: 2023-2024, 2024-2025, 2025-2026

✅ Can activate: Any calendar (2023-2024, 2024-2025, 2025-2026)
```

### Scenario 3: Error Messages
```
When trying to activate 2023-2024 while 2025-2026 is active:
Error: "Cannot set academic calendar 2023-2024 as active because it is from a previous year. Current active calendar: 2025-2026"
```

## API Response Changes

### Error Response (HTTP 400)
```json
{
  "statusCode": 400,
  "message": "Cannot set academic calendar 2023-2024 as active because it is from a previous year. Current active calendar: 2025-2026",
  "error": "Bad Request"
}
```

### Success Response (unchanged)
```json
{
  "success": true,
  "message": "Academic calendar for 2025-2026 is now active",
  "activeCalendar": {
    "id": "uuid",
    "academicYear": "2025-2026",
    "startDate": "2025-09-01T00:00:00.000Z",
    "endDate": "2026-06-30T00:00:00.000Z",
    "isActive": true
  }
}
```

## Multi-Tenant Considerations

- **School Isolation**: Validation is performed within each school's calendar scope
- **Independent Operation**: Each school can have different active calendars
- **Security**: Validation only applies to calendars belonging to the requesting admin's school

## Testing

Comprehensive test suite included in:
- `src/settings/utils/academic-calendar.utils.spec.ts`

Test coverage includes:
- Year extraction functions
- Validation logic with various scenarios
- Edge cases and error handling
- Academic year comparison and navigation

## Implementation Benefits

1. **Data Integrity**: Prevents accidental setting of outdated calendars
2. **Academic Continuity**: Ensures forward progression of academic years
3. **User Experience**: Clear error messages explaining why activation failed
4. **Flexibility**: Still allows activation of future calendars for planning
5. **Backward Compatibility**: Existing API endpoints unchanged, only validation added

## Logging

All calendar activation attempts are logged with:
- Action: `ACADEMIC_CALENDAR_ACTIVATED`
- Module: `SETTINGS`
- User information
- Calendar details
- School context

Failed activation attempts will be logged through the standard error handling mechanism.
