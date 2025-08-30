# Student Promotion Implementation Documentation

## Overview
This implementation adds automatic student promotion functionality that triggers when an academic calendar is changed to a higher term. Students are automatically promoted from their current class to the next higher class (e.g., Form One to Form Two, Form Two to Form Three, etc.).

## Features Implemented

### 1. Automatic Student Promotion Service
**File**: `src/student/services/student-promotion.service.ts`

**Key Methods**:
- `promoteStudentsToNextClass(schoolId, queryRunner?)`: Promotes all students in a school to the next class level
- `getNextClass(currentClassId, schoolId)`: Gets the next class for a given class in the school hierarchy
- `previewPromotion(schoolId)`: Preview what the promotion would look like without executing it

**Features**:
- Multi-tenant support (school-specific promotions)
- Transaction support for data integrity
- Error handling for students without classes
- Graduation handling for students in the highest class
- Detailed logging and error reporting

### 2. Integration with Academic Calendar Activation
**File**: `src/settings/settings.service.ts`

**Updated Method**: `activateAcademicCalendar(id, schoolId)`

**Logic**:
1. Validates calendar activation permissions
2. Detects if we're moving to a new term (not just reactivating the same one)
3. If moving to a new term, automatically triggers student promotion
4. Handles promotion errors gracefully without failing calendar activation
5. Provides detailed logging of promotion results

### 3. Controller Endpoints
**File**: `src/settings/settings.controller.ts`

**New Endpoints**:
- `GET /api/v1/settings/student-promotion/preview`: Preview student promotions
- `POST /api/v1/settings/student-promotion/execute`: Manually execute student promotions

**Updated Endpoints**:
- `PATCH /api/v1/settings/academic-calendar/:id/activate`: Now includes automatic promotion
- `PATCH /api/v1/settings/set-active-academic-calendar/:id`: Now includes automatic promotion

## API Endpoints

### Preview Student Promotion
**GET** `/api/v1/settings/student-promotion/preview`

**Description**: Preview what student promotions would look like without executing them

**Authorization**: School Admin only

**Response**:
```json
{
  "promotions": [
    {
      "studentId": "STU001",
      "studentName": "John Doe",
      "currentClass": "Form One",
      "nextClass": "Form Two",
      "status": "promote"
    },
    {
      "studentId": "STU002",
      "studentName": "Jane Smith",
      "currentClass": "Form Four",
      "nextClass": null,
      "status": "graduate"
    }
  ],
  "summary": {
    "totalStudents": 150,
    "toPromote": 120,
    "toGraduate": 25,
    "errors": 5
  }
}
```

### Execute Student Promotion
**POST** `/api/v1/settings/student-promotion/execute`

**Description**: Manually execute student promotions for the school

**Authorization**: School Admin only

**Response**:
```json
{
  "promotedStudents": 120,
  "graduatedStudents": 25,
  "errors": [
    "Student STU003 has no class assigned",
    "Failed to promote student STU004: Database error"
  ]
}
```

## Promotion Logic

### Class Hierarchy
The system assumes classes are ordered by their `numericalName` field:
- Form One (numericalName: 1)
- Form Two (numericalName: 2)
- Form Three (numericalName: 3)
- Form Four (numericalName: 4)

### Promotion Rules
1. **Standard Promotion**: Students move from their current class to the next class in numerical order
2. **Graduation**: Students in the highest class (Form Four) are marked as graduated but remain in the same class
3. **Error Handling**: Students without assigned classes are logged as errors but don't stop the promotion process

### Term Detection
Automatic promotion only triggers when:
1. A new academic calendar is activated (not reactivation of the same calendar)
2. The new calendar represents a higher term than the current one
3. The calendar activation is successful

## Multi-Tenant Considerations

- **School Isolation**: Promotions only affect students within the specific school
- **Independent Operation**: Each school's promotions are handled separately
- **Security**: Only school administrators can preview or execute promotions for their school

## Error Handling

### Promotion Errors
- Students without assigned classes are logged but don't stop the process
- Database errors for individual students are logged but don't fail the entire promotion
- Calendar activation continues even if promotion fails

### Transaction Safety
- Academic calendar activation and student promotion happen in the same transaction
- If calendar activation fails, promotions are rolled back
- If promotion fails, calendar activation can still succeed (promotions are not critical)

## Logging

All promotion activities are logged with:
- **Action**: `STUDENT_PROMOTION_EXECUTED`
- **Module**: `SETTINGS`
- **User information**: ID, email, role
- **Promotion statistics**: Promoted count, graduated count, error count
- **School context**: School ID for audit purposes

## Testing Scenarios

### Scenario 1: Normal Term Progression
```
Current State: 2024-2025 term active
Action: Activate 2025-2026 term
Expected Result: All students promoted to next class

Example:
- Form One students → Form Two
- Form Two students → Form Three
- Form Three students → Form Four
- Form Four students → Marked as graduated (remain in Form Four)
```

### Scenario 2: Reactivating Same Term
```
Current State: 2024-2025 term active
Action: Reactivate 2024-2025 term
Expected Result: No student promotions (same term)
```

### Scenario 3: Manual Promotion
```
Current State: Any time during term
Action: POST /api/v1/settings/student-promotion/execute
Expected Result: Manual promotion executed regardless of calendar state
```

## Implementation Benefits

1. **Automated Workflow**: Reduces administrative burden by automating student promotions
2. **Data Integrity**: Ensures promotions happen consistently when terms change
3. **Flexibility**: Provides manual promotion options for special circumstances
4. **Audit Trail**: Comprehensive logging for accountability and debugging
5. **Error Resilience**: Handles errors gracefully without breaking the system
6. **Multi-Tenant Safe**: Proper isolation between different schools

## Configuration

### Required Class Setup
For the promotion system to work correctly:
1. Classes must have proper `numericalName` values (1, 2, 3, 4, etc.)
2. Classes must belong to the correct school (`schoolId`)
3. Students must be assigned to classes (`classId`)

### Academic Calendar Setup
1. Terms must follow the "YYYY-YYYY" format (e.g., "2024-2025")
2. Only one calendar can be active per school at a time
3. Calendar activation requires proper validation of term progression

## Monitoring and Maintenance

### Key Metrics to Monitor
- Number of students promoted per term change
- Promotion errors and their causes
- Time taken for promotion operations
- Academic calendar activation success rate

### Maintenance Tasks
- Regular validation of class hierarchy setup
- Monitoring of students without assigned classes
- Review of promotion error logs
- Validation of term format consistency

## Future Enhancements

### Potential Features
1. **Custom Promotion Rules**: Allow schools to define custom promotion criteria
2. **Conditional Promotion**: Promote students based on grades or attendance
3. **Bulk Class Management**: Tools to easily set up class hierarchies
4. **Promotion Reports**: Detailed reports of promotion activities
5. **Rollback Functionality**: Ability to undo promotions if needed

### Integration Opportunities
1. **Student Performance**: Integrate with grading system for merit-based promotion
2. **Parent Notifications**: Notify parents when their children are promoted
3. **Transcript Generation**: Automatically generate transcripts for graduated students
4. **Fee Structure Updates**: Automatically update fee structures based on new class levels
