import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Course } from '../course/entities/course.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { Schedule } from 'src/schedule/entity/schedule.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Teacher) private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student) private studentRepository: Repository<Student>,
    @InjectRepository(Parent) private parentRepository: Repository<Parent>,
    @InjectRepository(Course) private courseRepository: Repository<Course>,
    @InjectRepository(Enrollment) private enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(Schedule) private scheduleRepository: Repository<Schedule>,
    // Removed Payment repository since it's not implemented yet
  ) {}

  async getAdminStats() {
    // Implement actual database queries here
    return {
      totalStudents: await this.studentRepository.count(),
      totalTeachers: await this.teacherRepository.count(),
      activeCourses: await this.courseRepository.count({ where: { status: 'active' } }),
      upcomingEvents: 8, // Hardcoded for now
      feeCollection: 12500, // Hardcoded instead of paymentRepository.sum()
      attendanceRate: 92, // Hardcoded for now
      performanceData: [
        { subject: 'Math', averageScore: 78 },
        { subject: 'Science', averageScore: 82 },
        { subject: 'English', averageScore: 85 },
        { subject: 'History', averageScore: 75 },
        { subject: 'Computer', averageScore: 88 }
      ],
      recentActivities: [
        { id: 1, user: 'Jane Cooper', action: 'submitted assignment', time: '2 hours ago' },
        { id: 2, user: 'Robert Fox', action: 'created event', time: '4 hours ago' },
        { id: 3, user: 'Leslie Alexander', action: 'updated curriculum', time: 'Yesterday' }
      ]
    };
  }

  async getTeacherStats(teacherId: string) {
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['courses'] // Removed 'classes' and 'schedules' if they don't exist
    });

    return {
      myStudents: await this.enrollmentRepository.count({
        where: { course: { teacher: { id: teacherId } } }
      }),
      myCourses: teacher?.courses?.length || 0,
      myClasses: 3, // Hardcoded instead of teacher?.classes?.length
      todaysClasses: await this.scheduleRepository.count({
        where: { 
          teacher: { id: teacherId },
          day: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        }
      }),
      attendance: [
        { class: 'Class 9A', present: 22, total: 24 },
        { class: 'Class 10B', present: 25, total: 26 },
        { class: 'Class 11A', present: 18, total: 20 }
      ],
      schedule: [] // Hardcoded empty array instead of teacher?.schedules
    };
  }

  async getStudentStats(studentId: string) {
    const student = await this.studentRepository.findOne({
      where: { id: studentId }
      // Removed 'courses' relation since it does not exist on Student
    });

    // If you want to count the number of courses a student is enrolled in, use the Enrollment repository
    const myCourses = await this.enrollmentRepository.count({
      where: { student: { id: studentId } }
    });

    return {
      myCourses,
      assignments: 5, // Hardcoded instead of student?.assignments?.length
      classRank: 3,
      todaysClasses: await this.scheduleRepository.count({
        where: { 
          class: { id: student?.class?.id },
          day: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        }
      }),
      performance: [
        { subject: 'Math', score: 85, average: 78 },
        { subject: 'Science', score: 82, average: 75 },
        { subject: 'English', score: 88, average: 82 }
      ], // Hardcoded instead of student?.grades
      assignmentStatus: {
        pending: 2, // Hardcoded
        submitted: 2, // Hardcoded
        graded: 1 // Hardcoded
      }
    };
  }

  async getParentStats(parentId: string) {
    const parent = await this.parentRepository.findOne({
      where: { id: parentId },
      relations: ['children'] // Removed 'children.grades' and 'children.attendance'
    });

    return {
      children: parent?.children?.map(child => ({
        name: child.firstName + ' ' + child.lastName, // Assuming these fields exist
        grade: child.class?.name || 'N/A',
        attendance: { present: 92, absent: 3, late: 2, total: 100 }, // Hardcoded
        courses: 5, // Hardcoded
        assignments: 5, // Hardcoded
        fees: { paid: 1200, pending: 450 }, // Hardcoded
        grades: [ // Hardcoded
          { course: 'Math', grade: 'A' },
          { course: 'Science', grade: 'B+' },
          { course: 'English', grade: 'A-' }
        ]
      })) || []
    };
  }

  async getFinanceStats() {
    return {
      monthlyRevenue: 12500, // Hardcoded
      outstandingFees: 4500, // Hardcoded
      paymentsToday: 12, // Hardcoded
      collectionRate: 94, // Hardcoded
      financialData: [
        { month: 'Jan', income: 45000, expenses: 38000 },
        { month: 'Feb', income: 52000, expenses: 41000 },
        { month: 'Mar', income: 48000, expenses: 39000 },
        { month: 'Apr', income: 61000, expenses: 45000 },
        { month: 'May', income: 55000, expenses: 42000 },
        { month: 'Jun', income: 67000, expenses: 48000 }
      ],
      outstandingPayments: [
        { student: 'Michael Brown', grade: '9', amount: 800, dueDate: 'Dec 15' },
        { student: 'Emily Davis', grade: '11', amount: 650, dueDate: 'Dec 20' },
        { student: 'Alex Wilson', grade: '7', amount: 450, dueDate: 'Dec 25' }
      ]
    };
  }

  private gradeToScore(grade: string): number {
    if (grade.startsWith('A')) return 90 + Math.floor(Math.random() * 10);
    if (grade.startsWith('B')) return 80 + Math.floor(Math.random() * 10);
    if (grade.startsWith('C')) return 70 + Math.floor(Math.random() * 10);
    if (grade.startsWith('D')) return 60 + Math.floor(Math.random() * 10);
    return 50 + Math.floor(Math.random() * 10);
  }
}