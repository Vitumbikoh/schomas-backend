# Enhanced Schedule Module API Documentation

## Overview
The enhanced Schedule Module provides comprehensive timetable management with multi-tenant awareness, conflict detection, and professional export capabilities.

## Key Features ✅

### ✅ Multi-Tenant Awareness
- All operations are scoped by `schoolId`
- Automatic school-level data isolation
- Prevents cross-school data access

### ✅ Weekly Timetable Management
- Monday-Friday (configurable) weekly grids
- Class-based schedule organization
- Time slot management with conflict detection

### ✅ Advanced Conflict Detection
- **Teacher Conflicts**: Prevents double-booking teachers
- **Class Conflicts**: Prevents overlapping class schedules
- **Room Conflicts**: Prevents room double-booking
- **Time Validation**: Ensures end time > start time

### ✅ Bulk Operations
- Weekly grid upsert (create/update/delete in one operation)
- Excel/CSV import with validation
- Conflict validation before saving

### ✅ Professional Exports
- CSV export for classes/teachers
- Filterable by days of the week
- Ready for PDF integration

## API Endpoints

### 1. Weekly Grid Management

#### **POST** `/schedules/grid-upsert`
Bulk create/update/delete schedules for a class's weekly grid.

**Role Required**: `ADMIN`

**Request Body**:
```json
{
  "classId": "uuid",
  "replaceAll": false,
  "schedules": [
    {
      "id": "uuid", // Optional for updates, null for creates
      "day": "Monday",
      "startTime": "08:00",
      "endTime": "09:00",
      "courseId": "uuid",
      "teacherId": "uuid",
      "classroomId": "uuid", // Optional
      "isActive": true
    }
  ]
}
```

**Response**:
```json
{
  "created": 2,
  "updated": 1,
  "deleted": 0,
  "errors": []
}
```

### 2. Conflict Validation

#### **POST** `/schedules/validate-conflicts`
Validate schedule conflicts without saving.

**Role Required**: `ADMIN`

**Request Body**:
```json
{
  "classId": "uuid",
  "schedules": [
    {
      "day": "Monday",
      "startTime": "08:00",
      "endTime": "09:00",
      "courseId": "uuid",
      "teacherId": "uuid",
      "classroomId": "uuid"
    }
  ]
}
```

**Response**:
```json
[
  {
    "item": { /* schedule item */ },
    "validation": {
      "isValid": false,
      "conflicts": [
        {
          "type": "teacher",
          "message": "Teacher is already scheduled at this time in class Mathematics A",
          "existingSchedule": {
            "id": "uuid",
            "day": "Monday",
            "startTime": "08:00",
            "endTime": "09:00",
            "className": "Mathematics A",
            "teacherName": "John Doe"
          }
        }
      ]
    }
  }
]
```

### 3. CSV Export

#### **GET** `/schedules/class/:classId/export.csv`
Export class schedule as CSV.

**Role Required**: `ADMIN`, `TEACHER`

**Query Parameters**:
- `days` (optional): Comma-separated days (e.g., "Monday,Tuesday,Wednesday")

**Response**:
```json
{
  "content": "Class,Day,Start Time,End Time,Course,Teacher,Room\n...",
  "filename": "schedule-class-uuid-2025-09-15.csv",
  "contentType": "text/csv"
}
```

#### **GET** `/schedules/teacher/:teacherId/export.csv`
Export teacher schedule as CSV.

**Role Required**: `ADMIN`, `TEACHER`

### 4. Enhanced Weekly View

#### **GET** `/schedules/class/:classId/weekly`
Get formatted weekly timetable (enhanced from existing).

**Role Required**: `ADMIN`, `TEACHER`, `STUDENT`

**Response**:
```json
{
  "classId": "uuid",
  "days": [
    {
      "day": "Monday",
      "items": [
        {
          "id": "uuid",
          "startTime": "08:00",
          "endTime": "09:00",
          "course": { "id": "uuid", "name": "Mathematics" },
          "teacher": { "id": "uuid", "name": "John Doe" },
          "classroom": { "id": "uuid", "name": "Room 101" }
        }
      ]
    }
  ]
}
```

## Usage Examples

### Example 1: Creating a Weekly Schedule

```typescript
// Create a full weekly schedule for a class
const weeklySchedule = {
  classId: "class-uuid",
  replaceAll: true, // Replace existing schedules
  schedules: [
    // Monday
    {
      day: "Monday",
      startTime: "08:00",
      endTime: "09:00",
      courseId: "math-course-uuid",
      teacherId: "john-doe-uuid",
      classroomId: "room-101-uuid"
    },
    {
      day: "Monday", 
      startTime: "09:00",
      endTime: "10:00",
      courseId: "english-course-uuid",
      teacherId: "jane-smith-uuid",
      classroomId: "room-102-uuid"
    },
    // Tuesday...
    // etc.
  ]
};

const result = await fetch('/schedules/grid-upsert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(weeklySchedule)
});
```

### Example 2: Validating Before Save

```typescript
// Validate conflicts before creating schedules
const validation = await fetch('/schedules/validate-conflicts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    classId: "class-uuid",
    schedules: [/* schedule items */]
  })
});

const results = await validation.json();
const hasConflicts = results.some(r => !r.validation.isValid);

if (hasConflicts) {
  // Show conflicts to user
  console.log('Conflicts detected:', results);
} else {
  // Proceed with save
  await createSchedules();
}
```

### Example 3: Exporting Class Schedule

```typescript
// Export class schedule as CSV
const response = await fetch(`/schedules/class/${classId}/export.csv?days=Monday,Tuesday,Wednesday,Thursday,Friday`);
const exportData = await response.json();

// Download the CSV
const blob = new Blob([exportData.content], { type: 'text/csv' });
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = exportData.filename;
a.click();
```

## Integration Notes

### Frontend Integration
- Use the weekly grid view for drag-and-drop schedule editing
- Implement real-time conflict validation during grid editing
- Use CSV export for backup and sharing schedules

### Excel/CSV Import Format
The existing bulk upload endpoint expects columns:
- `classId`: UUID of the class
- `day`: Day of week (Monday, Tuesday, etc.)
- `startTime`: HH:mm format
- `endTime`: HH:mm format  
- `courseId`: UUID of the course
- `teacherId`: UUID of the teacher
- `classroomId`: UUID of the classroom (optional)
- `isActive`: true/false

### Error Handling
- Conflict validation returns detailed error information
- Bulk operations return success/error counts
- All operations respect school-level data isolation

## Next Steps Available

1. **Schedule Templates**: Save and reuse schedule patterns
2. **PDF Export**: Professional printable schedules
3. **Real-time Notifications**: Alert users to schedule changes
4. **Advanced Reporting**: Analytics on schedule utilization
5. **Mobile App Integration**: Teacher/student mobile access

The enhanced schedule module provides a solid foundation for professional timetable management while maintaining flexibility for future enhancements.