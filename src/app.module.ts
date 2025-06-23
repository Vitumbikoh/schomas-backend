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
import { DashboardModule } from './dashboard-add/dashboard.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { ExamModule } from './exams/exam.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ClassroomModule } from './classroom/classroom.module';
import { ClassModule } from './classes/class.module';
import { SettingsModule } from './settings/settings.module';

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
    DashboardModule,
    EnrollmentModule,
    ExamModule,
    ScheduleModule,
    ClassroomModule,
    ClassModule,
    SettingsModule
  ],
})
export class AppModule {}