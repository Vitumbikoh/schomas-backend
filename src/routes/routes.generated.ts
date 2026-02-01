// AUTO-GENERATED ROUTES MAP
// Generated at: 2025-09-05T17:08:13.760Z
// Do NOT edit manually.

export interface GeneratedRouteMeta {
  method: string;
  path: string;
  controller: string;
  handler: string;
  roles: string[];
}

export const ROUTES_GENERATED: GeneratedRouteMeta[] = [
  {
    "method": "GET",
    "path": "/api/v1/activities/recent",
    "controller": "ActivitiesController",
    "handler": "getRecentActivities",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/admin/grading-formats",
    "controller": "GradeFormatController",
    "handler": "list",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/admin/grading-formats",
    "controller": "GradeFormatController",
    "handler": "create",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/admin/grading-formats/:id",
    "controller": "GradeFormatController",
    "handler": "delete",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/admin/grading-formats/:id",
    "controller": "GradeFormatController",
    "handler": "update",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/admin/grading-formats/initialize",
    "controller": "GradeFormatController",
    "handler": "initialize",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/admin/reports",
    "controller": "ReportsController",
    "handler": "getReportData",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/admins",
    "controller": "AdminsController",
    "handler": "createAdmin",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/admins/:id",
    "controller": "AdminsController",
    "handler": "updateAdmin",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/attendance-by-class",
    "controller": "AnalyticsController",
    "handler": "attendanceByClass",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/attendance-overview",
    "controller": "AnalyticsController",
    "handler": "attendanceOverview",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/class-performance",
    "controller": "AnalyticsController",
    "handler": "classPerformance",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/course-averages",
    "controller": "AnalyticsController",
    "handler": "courseAverages",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/current-term",
    "controller": "AnalyticsController",
    "handler": "currentTerm",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/dashboard-summary",
    "controller": "AnalyticsController",
    "handler": "dashboardSummary",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/analytics/fee-collection-status",
    "controller": "AnalyticsController",
    "handler": "feeCollectionStatus",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/api/admin/grading-formats",
    "controller": "GradeFormatLegacyController",
    "handler": "list",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/api/admin/grading-formats",
    "controller": "GradeFormatLegacyController",
    "handler": "create",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/api/admin/grading-formats/:id",
    "controller": "GradeFormatLegacyController",
    "handler": "delete",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/api/admin/grading-formats/:id",
    "controller": "GradeFormatLegacyController",
    "handler": "update",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/api/admin/grading-formats/initialize",
    "controller": "GradeFormatLegacyController",
    "handler": "initialize",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/auth/login",
    "controller": "AuthController",
    "handler": "login",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/auth/validate-token",
    "controller": "AuthController",
    "handler": "validateToken",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/auth/verify",
    "controller": "AuthController",
    "handler": "verifyToken",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/classes",
    "controller": "ClassController",
    "handler": "getAllClasses",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/classes",
    "controller": "ClassController",
    "handler": "createClass",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/classrooms",
    "controller": "ClassroomController",
    "handler": "findAll",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/classrooms",
    "controller": "ClassroomController",
    "handler": "create",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/classrooms/:id",
    "controller": "ClassroomController",
    "handler": "remove",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/classrooms/:id",
    "controller": "ClassroomController",
    "handler": "findOne",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/classrooms/:id",
    "controller": "ClassroomController",
    "handler": "update",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/classrooms/available/:date/:time",
    "controller": "ClassroomController",
    "handler": "findAvailable",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/classrooms/building/:buildingName",
    "controller": "ClassroomController",
    "handler": "findByBuilding",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course",
    "controller": "CourseController",
    "handler": "getAllCourses",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/courses",
    "controller": "CourseController",
    "handler": "getAllCourses",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/course",
    "controller": "CourseController",
    "handler": "createCourse",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/course/:courseId/assign-teacher",
    "controller": "CourseController",
    "handler": "assignTeacherToCourse",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/:courseId/enrollable-students",
    "controller": "CourseController",
    "handler": "getEnrollableStudents",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/:courseId/enrollments",
    "controller": "CourseController",
    "handler": "getCourseEnrollments",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/course/:id",
    "controller": "CourseController",
    "handler": "deleteCourse",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/:id",
    "controller": "CourseController",
    "handler": "getCourse",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/course/:id",
    "controller": "CourseController",
    "handler": "updateCourse",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/course-management",
    "controller": "CourseController",
    "handler": "getCourseManagementDashboard",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/course/stats/total-courses",
    "controller": "CourseController",
    "handler": "getTotalCoursesStats",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/enrollments",
    "controller": "EnrollmentController",
    "handler": "getAllEnrollments",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/enrollments/:courseId/eligible-students",
    "controller": "EnrollmentController",
    "handler": "getEligibleStudents",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/enrollments/:courseId/enroll/:studentId",
    "controller": "EnrollmentController",
    "handler": "unenrollStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/enrollments/:courseId/enroll/:studentId",
    "controller": "EnrollmentController",
    "handler": "enrollStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/enrollments/course/:courseId/enrollments/:enrollmentId",
    "controller": "EnrollmentController",
    "handler": "deleteEnrollmentById",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/enrollments/recent",
    "controller": "EnrollmentController",
    "handler": "getRecentEnrollments",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/exams",
    "controller": "ExamController",
    "handler": "findAll",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/exams",
    "controller": "ExamController",
    "handler": "create",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/exams/:id",
    "controller": "ExamController",
    "handler": "findOne",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/exams/debug/data",
    "controller": "ExamController",
    "handler": "debugExamData",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/exams/statistics",
    "controller": "ExamController",
    "handler": "getStatistics",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/finance",
    "controller": "FinanceController",
    "handler": "getAllFinanceUsers",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/finance",
    "controller": "FinanceController",
    "handler": "createFinanceUser",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/finance/budgets/:id/approve",
    "controller": "FinanceController",
    "handler": "approveBudget",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/dashboard",
    "controller": "FinanceController",
    "handler": "getDashboard",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/dashboard-data",
    "controller": "FinanceController",
    "handler": "getDashboardData",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-metrics",
    "controller": "FinanceController",
    "handler": "feeMetrics",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-payments",
    "controller": "FinanceController",
    "handler": "getFeePayments",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-status/:studentId",
    "controller": "FinanceController",
    "handler": "studentFeeStatus",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-statuses",
    "controller": "FinanceController",
    "handler": "feeStatuses",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/student-financial-details/:studentId",
    "controller": "FinanceController",
    "handler": "getStudentFinancialDetails",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-structure",
    "controller": "FinanceController",
    "handler": "getFeeStructure",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/finance/fee-structure",
    "controller": "FinanceController",
    "handler": "createFeeStructureItem",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/finance/fee-structure/:id",
    "controller": "FinanceController",
    "handler": "deleteFeeStructureItem",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/finance/fee-structure/:id",
    "controller": "FinanceController",
    "handler": "updateFeeStructureItem",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/fee-summary",
    "controller": "FinanceController",
    "handler": "feeSummary",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/parent-payments",
    "controller": "FinanceController",
    "handler": "getParentPayments",
    "roles": [
      "PARENT"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/finance/payments",
    "controller": "FinanceController",
    "handler": "processPayment",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/reports/summary",
    "controller": "FinanceController",
    "handler": "generateFinancialReport",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/stats",
    "controller": "FinanceController",
    "handler": "getFinancialStats",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/total-finances",
    "controller": "FinanceController",
    "handler": "getTotalFinances",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/transactions",
    "controller": "FinanceController",
    "handler": "getTransactions",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/finance/user/:id",
    "controller": "FinanceController",
    "handler": "getFinanceUser",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/grades",
    "controller": "GradeController",
    "handler": "createGrades",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/class/:classId",
    "controller": "GradeController",
    "handler": "getClassGrades",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/classes",
    "controller": "GradeController",
    "handler": "getAllClasses",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/classes/:classId/students",
    "controller": "GradeController",
    "handler": "getClassStudents",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/report",
    "controller": "GradeController",
    "handler": "getGradesReport",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/student/:studentId",
    "controller": "GradeController",
    "handler": "getStudentGrades",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/grades/students",
    "controller": "GradeController",
    "handler": "getStudentOwnGrades",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/learning-materials",
    "controller": "LearningMaterialsController",
    "handler": "createLearningMaterial",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/parents",
    "controller": "ParentsController",
    "handler": "findAll",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/parents/:id",
    "controller": "ParentsController",
    "handler": "remove",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/parents/:id",
    "controller": "ParentsController",
    "handler": "findOne",
    "roles": []
  },
  {
    "method": "PUT",
    "path": "/api/v1/parents/:id",
    "controller": "ParentsController",
    "handler": "update",
    "roles": [
      "ADMIN",
      "PARENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/parents/:id/children",
    "controller": "ParentsController",
    "handler": "getChildren",
    "roles": [
      "PARENT",
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/parents/profile/:id",
    "controller": "ParentsController",
    "handler": "getProfile",
    "roles": [
      "PARENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/profile",
    "controller": "ProfileController",
    "handler": "getProfile",
    "roles": []
  },
  {
    "method": "PUT",
    "path": "/api/v1/profile",
    "controller": "ProfileController",
    "handler": "updateProfile",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/receipts/:id",
    "controller": "ReceiptController",
    "handler": "generateReceipt",
    "roles": [
      "FINANCE",
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/routes",
    "controller": "RoutesController",
    "handler": "list",
    "roles": [
      "ADMIN",
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schedules",
    "controller": "ScheduleController",
    "handler": "findAll",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/schedules",
    "controller": "ScheduleController",
    "handler": "create",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/schedules/:id",
    "controller": "ScheduleController",
    "handler": "remove",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schedules/:id",
    "controller": "ScheduleController",
    "handler": "findOne",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/schedules/:id",
    "controller": "ScheduleController",
    "handler": "update",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schedules/course/:courseId",
    "controller": "ScheduleController",
    "handler": "findByCourse",
    "roles": [
      "ADMIN",
      "TEACHER",
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schedules/dashboard",
    "controller": "ScheduleController",
    "handler": "getDashboardOverview",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schedules/teacher/:teacherId",
    "controller": "ScheduleController",
    "handler": "findByTeacher",
    "roles": [
      "ADMIN",
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schools",
    "controller": "SchoolsController",
    "handler": "findAll",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/schools",
    "controller": "SchoolsController",
    "handler": "create",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schools/:id",
    "controller": "SchoolsController",
    "handler": "findOne",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PATCH",
    "path": "/api/v1/schools/:id",
    "controller": "SchoolsController",
    "handler": "update",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PATCH",
    "path": "/api/v1/schools/:id/activate",
    "controller": "SchoolsController",
    "handler": "activate",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schools/:id/credentials",
    "controller": "SchoolsController",
    "handler": "getSchoolCredentials",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PATCH",
    "path": "/api/v1/schools/:id/credentials/reset-password",
    "controller": "SchoolsController",
    "handler": "resetAdminPassword",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "PATCH",
    "path": "/api/v1/schools/:id/suspend",
    "controller": "SchoolsController",
    "handler": "suspend",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/schools/credentials/all",
    "controller": "SchoolsController",
    "handler": "getAllSchoolCredentials",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/settings",
    "controller": "SettingsController",
    "handler": "getSettings",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings",
    "controller": "SettingsController",
    "handler": "updateSettings",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/academic-calendar",
    "controller": "SettingsController",
    "handler": "getAcademicCalendars",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/academic-calendar",
    "controller": "SettingsController",
    "handler": "createAcademicCalendar",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/academic-calendar/:id/activate",
    "controller": "SettingsController",
    "handler": "activateAcademicCalendar",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/academic-calendar/:id/closure-preview",
    "controller": "SettingsController",
    "handler": "previewAcademicCalendarClosure",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/academic-calendars",
    "controller": "SettingsController",
    "handler": "getAllAcademicCalendars",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/active-academic-calendar",
    "controller": "SettingsController",
    "handler": "getActiveAcademicCalendar",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/calendar-completion-status",
    "controller": "SettingsController",
    "handler": "getCalendarCompletionStatus",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/can-activate-calendar/:id",
    "controller": "SettingsController",
    "handler": "canActivateNewCalendar",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/close-academic-calendar/:id",
    "controller": "SettingsController",
    "handler": "closeAcademicCalendar",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/holidays/:id",
    "controller": "SettingsController",
    "handler": "updateTermHoliday",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/holidays/:id/activate",
    "controller": "SettingsController",
    "handler": "activateTermHoliday",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/holidays/:id/complete",
    "controller": "SettingsController",
    "handler": "completeTermHoliday",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/periods",
    "controller": "SettingsController",
    "handler": "getPeriods",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/periods",
    "controller": "SettingsController",
    "handler": "createPeriod",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/periods/:id",
    "controller": "SettingsController",
    "handler": "updatePeriod",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/periods/available",
    "controller": "SettingsController",
    "handler": "getAvailablePeriods",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/periods/term",
    "controller": "SettingsController",
    "handler": "getTermPeriods",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/periods/term",
    "controller": "SettingsController",
    "handler": "createTermPeriod",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/periods/term/:id",
    "controller": "SettingsController",
    "handler": "updateTermPeriod",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/periods/term/:id/activate",
    "controller": "SettingsController",
    "handler": "activateTermPeriod",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/periods/term/:id/complete",
    "controller": "SettingsController",
    "handler": "completeTerm",
    "roles": []
  },
  {
    "method": "PATCH",
    "path": "/api/v1/settings/set-active-academic-calendar/:id",
    "controller": "SettingsController",
    "handler": "setActiveAcademicCalendar",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/terms",
    "controller": "SettingsController",
    "handler": "listTerms",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/terms/:termId/enter-exam-period",
    "controller": "SettingsController",
    "handler": "enterExamPeriod",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/settings/terms/:termId/holidays",
    "controller": "SettingsController",
    "handler": "listTermHolidays",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/terms/:termId/holidays",
    "controller": "SettingsController",
    "handler": "createTermHoliday",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/settings/terms/:termId/publish-results",
    "controller": "SettingsController",
    "handler": "publishTermResults",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/student/:id/courses",
    "controller": "StudentController",
    "handler": "getStudentCourses",
    "roles": [
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/:id/materials",
    "controller": "StudentController",
    "handler": "getStudentMaterials",
    "roles": [
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/my-schedules",
    "controller": "StudentController",
    "handler": "getMySchedules",
    "roles": [
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/profile",
    "controller": "StudentController",
    "handler": "getMyProfile",
    "roles": [
      "STUDENT"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/student-management",
    "controller": "StudentController",
    "handler": "getStudentManagementDashboard",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/students",
    "controller": "StudentController",
    "handler": "getAllStudents",
    "roles": [
      "ADMIN",
      "FINANCE"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/student/students",
    "controller": "StudentController",
    "handler": "createStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "DELETE",
    "path": "/api/v1/student/students/:id",
    "controller": "StudentController",
    "handler": "deleteStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/students/:id",
    "controller": "StudentController",
    "handler": "getStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "PUT",
    "path": "/api/v1/student/students/:id",
    "controller": "StudentController",
    "handler": "updateStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/student/total-students",
    "controller": "StudentController",
    "handler": "getTotalStudentsCount",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/super-admins",
    "controller": "SuperAdminsController",
    "handler": "create",
    "roles": [
      "SUPER_ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/super-admins/bootstrap",
    "controller": "SuperAdminsController",
    "handler": "bootstrap",
    "roles": []
  },
  {
    "method": "POST",
    "path": "/api/v1/teacher/attendance",
    "controller": "AttendanceController",
    "handler": "createAttendance",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/exams-for-grading",
    "controller": "TeacherController",
    "handler": "getExamsForGrading",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-attendance-today",
    "controller": "TeacherController",
    "handler": "getMyAttendanceToday",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-classes",
    "controller": "TeacherController",
    "handler": "getMyClasses",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-classes-with-courses",
    "controller": "TeacherController",
    "handler": "getMyClassesWithCourses",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-courses",
    "controller": "TeacherController",
    "handler": "getMyCourses",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-courses/by-class/:classId",
    "controller": "TeacherController",
    "handler": "getMyCoursesByClass",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-courses/count",
    "controller": "TeacherController",
    "handler": "getMyCoursesCount",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-schedules",
    "controller": "TeacherController",
    "handler": "getMySchedules",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-students",
    "controller": "TeacherController",
    "handler": "getMyStudents",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-students-by-class/:classId",
    "controller": "TeacherController",
    "handler": "getMyStudentsByClass",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-students/by-course/:courseId",
    "controller": "TeacherController",
    "handler": "getMyStudentsByCourse",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-students/count",
    "controller": "TeacherController",
    "handler": "getMyStudentsCount",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/my-upcoming-classes",
    "controller": "TeacherController",
    "handler": "getMyUpcomingClasses",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/teacher/submit-grades",
    "controller": "TeacherController",
    "handler": "submitGrades",
    "roles": [
      "TEACHER"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/teacher-management",
    "controller": "TeacherController",
    "handler": "getTeacherManagementDashboard",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/teachers",
    "controller": "TeacherController",
    "handler": "getAllTeachers",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/teacher/teachers",
    "controller": "TeacherController",
    "handler": "createTeacher",
    "roles": []
  },
  {
    "method": "DELETE",
    "path": "/api/v1/teacher/teachers/:id",
    "controller": "TeacherController",
    "handler": "deleteTeacher",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/teachers/:id",
    "controller": "TeacherController",
    "handler": "getTeacher",
    "roles": []
  },
  {
    "method": "PUT",
    "path": "/api/v1/teacher/teachers/:id",
    "controller": "TeacherController",
    "handler": "updateTeacher",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/teacher/total-teachers",
    "controller": "TeacherController",
    "handler": "getTotalTeachers",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/users/:id",
    "controller": "UsersController",
    "handler": "findOne",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/users/finance",
    "controller": "UsersController",
    "handler": "findAllFinance",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/users/finance",
    "controller": "UsersController",
    "handler": "createFinance",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "PATCH",
    "path": "/api/v1/users/me/change-password",
    "controller": "UsersController",
    "handler": "changeMyPassword",
    "roles": []
  },
  {
    "method": "GET",
    "path": "/api/v1/users/parents",
    "controller": "UsersController",
    "handler": "findAllParents",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/users/parents",
    "controller": "UsersController",
    "handler": "createParent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/users/students",
    "controller": "UsersController",
    "handler": "findAllStudents",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/users/students",
    "controller": "UsersController",
    "handler": "createStudent",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "GET",
    "path": "/api/v1/users/teachers",
    "controller": "UsersController",
    "handler": "findAllTeachers",
    "roles": [
      "ADMIN"
    ]
  },
  {
    "method": "POST",
    "path": "/api/v1/users/teachers",
    "controller": "UsersController",
    "handler": "createTeacher",
    "roles": [
      "ADMIN"
    ]
  }
];
