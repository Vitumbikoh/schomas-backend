# SCHOMAS Backend API Endpoints Documentation

This document provides a comprehensive list of all API endpoints in the SCHOMAS (School Management System) backend with detailed descriptions of their functionality.

## Table of Contents
1. [Authentication & Authorization](#authentication--authorization)
2. [User Management](#user-management)
3. [Student Management](#student-management)
4. [Teacher Management](#teacher-management)
5. [Course Management](#course-management)
6. [Class & Classroom Management](#class--classroom-management)
7. [Finance Management](#finance-management)
8. [Academic Management](#academic-management)
9. [Scheduling & Attendance](#scheduling--attendance)
10. [Reports & Analytics](#reports--analytics)
11. [Settings & Configuration](#settings--configuration)
12. [Parent Portal](#parent-portal)
13. [Learning Materials](#learning-materials)
14. [Activities & Miscellaneous](#activities--miscellaneous)

---

## Authentication & Authorization

### Auth Controller (`/auth`)
- **POST /auth/login** - User authentication login endpoint
  - Validates user credentials and returns JWT token
  - Used by all user types (admin, teacher, student, parent, finance)

- **GET /auth/verify** - Token verification endpoint  
  - Validates JWT token and returns user information
  - Used for session validation on protected routes

- **POST /auth/validate-token** - Token validation endpoint
  - Validates provided JWT token without requiring authentication
  - Returns token validity status and user data

---

## User Management

### Users Controller (`/users`)
- **POST /users/teachers** - Create new teacher user account
  - Admin-only endpoint to register new teachers
  - Creates user account and teacher profile simultaneously
  - Logs teacher creation activity

- **POST /users/students** - Create new student user account
  - Admin-only endpoint to register new students
  - Creates user account with student profile and assigns student ID
  - Logs student creation activity

- **POST /users/parents** - Create new parent user account
  - Admin-only endpoint to register new parents
  - Creates user account with parent profile information
  - Logs parent creation activity

- **POST /users/finance** - Create new finance user account
  - Admin-only endpoint to register finance personnel
  - Creates user account with finance permissions and department assignment
  - Logs finance user creation activity

- **GET /users/teachers** - Retrieve all teachers list
  - Admin-only endpoint to fetch all registered teachers
  - Returns paginated list with basic teacher information

- **GET /users/students** - Retrieve all students list
  - Admin-only endpoint to fetch all registered students
  - Returns paginated list with basic student information

- **GET /users/parents** - Retrieve all parents list
  - Admin-only endpoint to fetch all registered parents
  - Returns paginated list with basic parent information

- **GET /users/finance** - Retrieve all finance users list
  - Admin-only endpoint to fetch all finance personnel
  - Returns paginated list with finance user information

- **GET /users/:id** - Get specific user by ID
  - Admin-only endpoint to fetch detailed user information
  - Returns complete user profile data

---

## Student Management

### Student Controller (`/student`)
- **GET /student/student-management** - Student management dashboard
  - Admin-only dashboard showing student statistics and overview
  - Returns student counts, recent registrations, and management UI config

- **POST /student/students** - Create new student profile
  - Admin-only endpoint to create detailed student profile
  - Handles student registration with academic information
  - Logs student creation with comprehensive metadata

- **GET /student/total-students** - Get total students count
  - Admin-only endpoint returning total/active student counts
  - Supports filtering by active status

- **GET /student/students** - Get all students with pagination
  - Admin/Finance accessible endpoint for student listings
  - Supports search, pagination, and filtering capabilities

- **GET /student/profile** - Get logged-in student's profile
  - Student-only endpoint for self-profile access
  - Returns complete student profile and academic information

- **GET /student/my-schedules** - Get logged-in student's schedules
  - Student-only endpoint for personal schedule access
  - Returns paginated list of student's class schedules

- **GET /student/:id/courses** - Get courses for specific student
  - Student-only endpoint (self-access) for enrolled courses
  - Returns list of courses student is enrolled in

- **GET /student/:id/materials** - Get learning materials for student
  - Student-only endpoint for accessing course materials
  - Supports filtering by course ID

- **GET /student/students/:id** - Get specific student details
  - Admin-only endpoint for detailed student information
  - Returns complete student profile and academic data

- **PUT /student/students/:id** - Update student information
  - Admin-only endpoint for modifying student profiles
  - Logs update operations with before/after values

- **DELETE /student/students/:id** - Delete student record
  - Admin-only endpoint for removing student accounts
  - Logs deletion operations for audit purposes

---

## Teacher Management

### Teacher Controller (`/teacher`)
- **GET /teacher/teacher-management** - Teacher management dashboard
  - Dashboard showing teacher statistics, hiring trends, and overview
  - Returns teacher counts, experience metrics, and management UI

- **POST /teacher/teachers** - Create new teacher profile
  - Creates detailed teacher profile with qualifications
  - Logs teacher creation with professional information

- **GET /teacher/teachers** - Get all teachers with pagination
  - Admin-only endpoint for teacher listings
  - Supports search, pagination, and filtering

- **GET /teacher/my-schedules** - Get logged-in teacher's schedules
  - Teacher-only endpoint for personal schedule access
  - Returns teaching schedules and assigned classes

- **GET /teacher/my-classes** - Get teacher's assigned classes
  - Teacher-only endpoint for viewing assigned classes
  - Returns class lists with student information

- **GET /teacher/my-students** - Get students taught by teacher
  - Teacher-only endpoint for accessing student lists
  - Returns students across all assigned classes

- **POST /teacher/submit-grades** - Submit grades for students
  - Teacher-only endpoint for grade submission
  - Handles bulk grade entry for exams and assignments
  - Logs grade submission activities

- **GET /teacher/teachers/:id** - Get specific teacher details
  - Admin-only endpoint for detailed teacher information
  - Returns complete teacher profile and assignments

- **PUT /teacher/teachers/:id** - Update teacher information
  - Admin-only endpoint for modifying teacher profiles
  - Logs update operations with change tracking

- **DELETE /teacher/teachers/:id** - Delete teacher record
  - Admin-only endpoint for removing teacher accounts
  - Logs deletion operations for audit purposes

---

## Course Management

### Course Controller (`/course`)
- **GET /course/course-management** - Course management dashboard
  - Admin/Teacher dashboard showing course statistics and overview
  - Returns course counts, enrollment metrics, and management UI

- **GET /course/courses** or **GET /course** - Get all courses
  - Admin/Teacher accessible endpoint for course listings
  - Supports pagination, search, and class filtering
  - Returns courses with teacher assignments and enrollment data

- **POST /course/courses** - Create new course
  - Admin-only endpoint for adding new courses to curriculum
  - Creates course with basic information and requirements
  - Logs course creation activities

- **GET /course/stats/total-courses** - Get course statistics
  - Admin/Teacher endpoint for course metrics
  - Returns total courses, trends, and statistical data

- **POST /course/:courseId/assign-teacher** - Assign teacher to course
  - Admin-only endpoint for teacher-course assignments
  - Links qualified teachers to specific courses
  - Logs teacher assignment activities

- **PUT /course/courses/:id** - Update course information
  - Admin/Teacher endpoint for modifying course details
  - Updates course content, requirements, and metadata
  - Logs course update operations

- **DELETE /course/courses/:id** - Delete course
  - Admin-only endpoint for removing courses from curriculum
  - Handles course deletion with dependency checking
  - Logs course deletion activities

---

## Class & Classroom Management

### Class Controller (`/classes`)
- **POST /classes** - Create new class
  - Admin-only endpoint for creating new class groups
  - Sets up class structure with grade level and capacity
  - Logs class creation activities

- **GET /classes** - Get all classes
  - Returns list of all class groups with student counts
  - Used for enrollment and scheduling purposes

### Classroom Controller (`/classrooms`)
- **POST /classrooms** - Create new classroom
  - Admin-only endpoint for adding physical classroom spaces
  - Sets up classroom with capacity and equipment information
  - Logs classroom creation activities

- **GET /classrooms** - Get all classrooms
  - Admin/Teacher/Student accessible for viewing available rooms
  - Supports filtering by building and active status

- **GET /classrooms/:id** - Get specific classroom details
  - Returns detailed classroom information and current utilization

- **PUT /classrooms/:id** - Update classroom information
  - Admin-only endpoint for modifying classroom details
  - Updates capacity, equipment, and availability
  - Logs classroom update operations

- **DELETE /classrooms/:id** - Remove classroom
  - Admin-only endpoint for deactivating classroom spaces
  - Logs classroom deletion activities

- **GET /classrooms/building/:buildingName** - Get classrooms by building
  - Returns all classrooms within a specific building
  - Used for location-based scheduling

- **GET /classrooms/available/:date/:time** - Check classroom availability
  - Admin/Teacher endpoint for finding available rooms
  - Returns unbooked classrooms for specific date/time slots

---

## Finance Management

### Finance Controller (`/finance`)
- **GET /finance/dashboard** - Finance dashboard overview
  - Finance/Admin dashboard showing financial metrics and pending items
  - Returns payment summaries, budget status, and financial UI

- **GET /finance/dashboard-data** - Complete dashboard data with calculations
  - Comprehensive financial dashboard with detailed calculations
  - Returns revenue trends, payment analytics, and budget utilization

- **POST /finance/payments** - Process fee payment
  - Finance/Admin endpoint for recording student fee payments
  - Handles various payment types (tuition, exam, transport, etc.)
  - Generates receipts and logs payment processing

- **POST /finance** - Create finance user profile
  - Admin-only endpoint for registering finance personnel
  - Sets up finance user with department and permission settings
  - Logs finance user creation activities

- **GET /finance** - Get all finance users
  - Admin-only endpoint for finance personnel management
  - Returns paginated list with search capabilities

- **POST /finance/budgets/:id/approve** - Approve budget proposal
  - Finance/Admin endpoint for budget approval workflow
  - Handles budget review and approval process
  - Logs budget approval decisions

- **GET /finance/stats** - Get financial statistics
  - Finance/Admin endpoint for comprehensive financial metrics
  - Returns revenue, expenses, and trend analysis

- **GET /finance/total-finances** - Get total financial metrics
  - Finance/Admin endpoint with date range filtering
  - Returns aggregated financial data for reporting

- **GET /finance/transactions** - Get financial transactions
  - Finance/Admin endpoint for transaction history
  - Supports pagination, search, and date filtering

- **GET /finance/fee-payments** - Get all fee payments
  - Finance/Admin endpoint for payment record management
  - Returns paginated payment history with student information

- **GET /finance/parent-payments** - Get parent's children payments
  - Parent-only endpoint for viewing child payment history
  - Returns payment records for all children

- **GET /finance/reports/summary** - Generate financial summary report
  - Finance/Admin endpoint for comprehensive financial reporting
  - Returns detailed financial analysis for specified date ranges

### Receipt Controller (`/receipts`)
- **GET /receipts/:id** - Generate payment receipt PDF
  - Finance/Admin endpoint for receipt generation
  - Creates PDF receipt for specific payment transactions
  - Handles caching and cleanup of temporary files

### Fee Analytics Controller (`/fee-analytics`)
- **GET /fee-analytics/dashboard/:academicYearId** - Fee analytics dashboard
  - Admin/Finance endpoint for fee collection analytics
  - Returns payment trends and collection metrics by academic year

- **GET /fee-analytics/student/:studentId** - Student fee details
  - Admin/Finance endpoint for individual student payment analysis
  - Returns detailed payment history and outstanding balances

- **GET /fee-analytics/summary/:academicYearId** - Payment summary
  - Admin/Finance endpoint for academic year payment summaries
  - Returns aggregated payment data and collection rates

---

## Academic Management

### Enrollment Controller (`/enrollments`)
- **GET /enrollments** - Get all enrollments
  - Admin-only endpoint for enrollment management
  - Returns paginated list with search capabilities

- **GET /enrollments/recent** - Get recent enrollments
  - Admin-only endpoint for monitoring new enrollments
  - Returns latest enrollment activities

- **POST /enrollments/:courseId/enroll/:studentId** - Enroll student in course
  - Admin-only endpoint for student course enrollment
  - Creates enrollment relationship between student and course
  - Logs enrollment activities

- **DELETE /enrollments/:courseId/enroll/:studentId** - Unenroll student from course
  - Admin-only endpoint for removing student from course
  - Handles course withdrawal and cleanup
  - Logs unenrollment activities

### Exams Controller (`/exams`)
- **GET /exams** - Get all exams
  - Returns list of all scheduled exams with filtering options
  - Supports search by class, teacher, and academic year

- **POST /exams** - Create new exam
  - Creates new exam with course, class, and date assignments
  - Sets up exam scheduling and requirements
  - Logs exam creation activities

- **GET /exams/:id** - Get specific exam details
  - Returns detailed exam information and requirements

### Grades Controller (`/grades`)
- **POST /grades** - Create/submit grades
  - Teacher endpoint for submitting student grades
  - Handles grade entry for exams and assignments

- **GET /grades/classes** - Get all classes for grading
  - Teacher endpoint for accessing assigned classes
  - Returns classes where teacher can submit grades

- **GET /grades/classes/:classId/students** - Get students in class
  - Teacher endpoint for viewing class roster for grading
  - Returns student list with grade entry capabilities

- **GET /grades/class/:classId** - Get grades for class
  - Teacher endpoint for viewing submitted grades by class
  - Returns grade summaries and statistics

- **GET /grades/student/:studentId** - Get student grades
  - Teacher endpoint for individual student grade history
  - Returns comprehensive grade records

- **GET /grades/students** - Get student's own grades
  - Student-only endpoint for self-grade access
  - Returns personal academic performance data

---

## Scheduling & Attendance

### Schedule Controller (`/schedules`)
- **POST /schedules** - Create new schedule
  - Admin/Teacher endpoint for creating class schedules
  - Sets up time slots, classroom assignments, and course scheduling
  - Logs schedule creation activities

- **GET /schedules/dashboard** - Schedule dashboard overview
  - Admin/Teacher dashboard for schedule management
  - Returns scheduling statistics and overview

- **GET /schedules** - Get all schedules
  - Admin/Teacher/Student accessible for viewing schedules
  - Supports search and filtering capabilities

- **GET /schedules/:id** - Get specific schedule details
  - Returns detailed schedule information and assignments

- **PUT /schedules/:id** - Update schedule
  - Admin/Teacher endpoint for modifying existing schedules
  - Updates time slots, rooms, and assignments
  - Logs schedule update operations

- **DELETE /schedules/:id** - Delete schedule
  - Admin-only endpoint for removing schedules
  - Logs schedule deletion activities

### Attendance Controller (`/teacher/attendance`)
- **POST /teacher/attendance** - Record attendance
  - Teacher endpoint for marking student attendance
  - Records presence/absence for specific classes and dates
  - Links attendance to courses, classes, and teachers

---

## Reports & Analytics

### Reports Controller (`/admin/reports`)
- **GET /admin/reports** - Comprehensive report data
  - Admin-only endpoint for detailed institutional analytics
  - Returns student demographics, enrollment trends, financial summaries
  - Supports filtering by age groups, classes, subjects, and other criteria
  - Provides data for dashboard charts and administrative decision-making

---

## Settings & Configuration

### Settings Controller (`/settings`)
- **GET /settings** - Get system settings
  - Authenticated users can access current system configuration
  - Returns academic calendar, term settings, and system preferences

- **PATCH /settings** - Update system settings
  - Admin endpoint for modifying system-wide configurations
  - Updates academic settings and system parameters
  - Logs settings modification activities

- **POST /settings/academic-calendar** - Create academic calendar
  - Admin-only endpoint for setting up academic year calendar
  - Defines start/end dates and active academic periods
  - Logs calendar creation activities

- **GET /settings/academic-calendar** - Get academic calendar
  - Admin-only endpoint for viewing current academic calendar
  - Returns active academic year configuration

- **POST /settings/terms** - Create academic terms
  - Admin-only endpoint for setting up academic terms
  - Defines semester/quarter structure within academic year

- **GET /settings/terms** - Get academic terms
  - Returns list of academic terms and their configurations

- **POST /settings/academic-year-terms** - Create academic year term structure
  - Admin-only endpoint for complex academic year setup
  - Links terms to specific academic years

### Admins Controller (`/admins`)
- **POST /admins** - Create admin user
  - Creates new administrative user accounts
  - Sets up admin permissions and access levels

- **PATCH /admins/:id** - Update admin user
  - Modifies existing admin user configurations
  - Updates permissions and account settings

---

## Dashboard & Overview

### App Controller (`/`)
- **GET /** - Application health check
  - Basic endpoint returning application status
  - Used for health monitoring and service verification

---

## Parent Portal

### Parents Controller (`/parents`)
- **GET /parents** - Get all parents
  - Admin/Teacher accessible endpoint for parent information
  - Returns list of registered parents

- **GET /parents/:id** - Get specific parent details
  - Returns detailed parent profile and contact information

- **PUT /parents/:id** - Update parent information
  - Admin/Parent endpoint for modifying parent profiles
  - Updates contact details and preferences

- **DELETE /parents/:id** - Remove parent account
  - Admin-only endpoint for deactivating parent accounts

- **GET /parents/profile/:id** - Get parent profile
  - Parent-only endpoint for self-profile access
  - Returns personal profile and children information

- **GET /parents/:id/children** - Get parent's children
  - Parent/Admin/Teacher endpoint for viewing parent-child relationships
  - Returns list of children with academic information

---

## Learning Materials

### Learning Materials Controller (`/learning-materials`)
- **POST /learning-materials** - Upload learning material
  - Teacher-only endpoint for uploading course materials
  - Handles file uploads (PDFs, documents, etc.) up to 10MB
  - Associates materials with specific courses and classes
  - Logs material upload activities

---

## Activities & Miscellaneous

### Activities Controller (`/activities`)
- **GET /activities/recent** - Get recent system activities
  - Authenticated users can view recent system activities
  - Returns timeline of recent actions and events

### App Controller (`/`)
- **GET /** - Application health check
  - Basic endpoint returning application status
  - Used for health monitoring and service verification

### Protected Controller (`/protected`)
- Additional protected endpoints for testing authentication flows

---

## Security & Access Control

### Role-Based Access Control (RBAC)
The system implements comprehensive role-based access control with the following roles:

- **ADMIN**: Full system access, user management, settings configuration
- **TEACHER**: Class management, grade submission, schedule viewing, material uploads
- **STUDENT**: Personal profile access, grade viewing, schedule access, material downloads
- **PARENT**: Children information access, payment history, communication
- **FINANCE**: Payment processing, financial reporting, budget management

### Authentication Requirements
- Most endpoints require JWT authentication via `@UseGuards(AuthGuard('jwt'))`
- Role-specific access controlled via `@Roles()` decorator
- Public endpoints are marked with `@Public()` decorator (login, token validation)

### Logging & Audit Trail
- All significant operations are logged using `SystemLoggingService`
- Create, Update, Delete operations generate audit logs
- User actions tracked with IP address, user agent, and metadata
- Error logging for failed operations and system issues

### Input Validation
- DTOs used for request validation via `@Body()` with `ValidationPipe`
- UUID validation for entity IDs via `ParseUUIDPipe`
- File upload validation with size limits and type checking

This comprehensive endpoint documentation provides complete coverage of the SCHOMAS backend API, enabling developers to understand system capabilities and integration requirements.
