import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { FinanceModule } from './finance/finance.module';
import { ParentsModule } from './parent/parents.module';
import { StudentsModule } from './student/student.module';
import { TeachersModule } from './teacher/teacher.module';
import { UsersModule } from './user/users.module';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { ExamModule } from './exams/exam.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ClassroomModule } from './classroom/classroom.module';
import { ClassModule } from './classes/class.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LearningMaterialsModule } from './learning-materials/learning-materials.module';
import { GradeModule } from './grades/grade.module';
import { GradeFormatModule } from './grades/grade-format.module';
import { ActivitiesModule } from './activity/activity.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SuperAdminsModule } from './super-admins/super-admins.module';
import { SchoolModule } from './school/school.module';
import { ProfileModule } from './profile/profile.module';
import { RoutesModule } from './routes/routes.module';
import { SystemModule } from './system/system.module';
import { AggregationModule } from './aggregation/aggregation.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    TeachersModule,
    StudentsModule,
    ParentsModule,
    FinanceModule,
    AdminsModule,
    EnrollmentModule,
    ExamModule,
    ScheduleModule,
    ClassroomModule,
    ClassModule,
    SettingsModule,
    ReportsModule,
    AttendanceModule,
    LearningMaterialsModule,
  GradeModule,
  GradeFormatModule,
    ActivitiesModule,
    AnalyticsModule,
    SuperAdminsModule,
    SchoolModule,
    ProfileModule,
  RoutesModule,
  SystemModule,
  AggregationModule,
  BillingModule,
  ],
})
export class AppModule {}