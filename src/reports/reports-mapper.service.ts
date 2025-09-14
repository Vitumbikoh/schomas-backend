import { Injectable } from '@nestjs/common';
import { StudentsReportItem, TeachersReportItem, CoursesReportItem, EnrollmentsReportItem, FeePaymentsReportItem } from './dto/report-dtos';

@Injectable()
export class ReportsMapperService {
  private calcAge(dateOfBirth?: Date | string | null): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const diff = Date.now() - dob.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  mapStudent(s: any): StudentsReportItem {
    return {
      id: s.id,
  studentId: s.studentId || null,
  studentHumanId: s.studentId || s.humanId || s.studentHumanId || s.id || null,
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      firstName: s.firstName || null,
      lastName: s.lastName || null,
      email: s.user?.email || null,
      grade: s.gradeLevel || null,
      classId: s.classId || s.class?.id || null,
      className: s.class?.name || null,
      gender: s.gender || null,
      enrollmentDate: s.createdAt || null,
      status: 'active',
      age: this.calcAge(s.dateOfBirth),
      parentName: s.parent ? `${s.parent.firstName || ''} ${s.parent.lastName || ''}`.trim() : null,
      address: s.address || null,
      dateOfBirth: s.dateOfBirth || null,
      // Count active borrowings or return 'NO' if none
      owesBooks: (() => {
        const borrowArrays = s.borrowings || s.libraryBorrowings || s.bookBorrowings || [];
        if (!Array.isArray(borrowArrays) || borrowArrays.length === 0) return 'NO';
        const activeCount = borrowArrays.filter((b: any) => {
          if (b == null) return false;
          if (typeof b.returned === 'boolean') return !b.returned;
          if (b.returnedAt) return false;
          return !b.returnedAt && !b.returned;
        }).length;
        return activeCount > 0 ? `owes ${activeCount}` : 'NO';
      })(),
    };
  }

  mapTeacher(t: any): TeachersReportItem {
    return {
      id: t.id,
      name: `${t.firstName || ''} ${t.lastName || ''}`.trim(),
      firstName: t.firstName || null,
      lastName: t.lastName || null,
      email: t.user?.email || null,
      gender: t.gender || null,
      subjectSpecialization: t.subjectSpecialization || null,
      status: t.status || null,
      // Removed assignedClass mapping (relation not defined on Teacher entity)
      classId: null,
      className: null,
      phoneNumber: t.phoneNumber || null,
      qualification: t.qualification || null,
      yearsOfExperience: t.yearsOfExperience != null ? Number(t.yearsOfExperience) : null,
      address: t.address || null,
      dateOfBirth: t.dateOfBirth || null,
      hireDate: t.hireDate || null,
      joinDate: t.hireDate || null,
    };
  }

  mapCourse(c: any): CoursesReportItem {
    return {
      id: c.id,
      name: c.name,
      code: c.code || null,
      classId: c.classId || c.class?.id || null,
      className: c.class?.name || null,
      teacherId: c.teacherId || c.teacher?.id || null,
      teacherName: c.teacher ? `${c.teacher.firstName || ''} ${c.teacher.lastName || ''}`.trim() : null,
      department: c.department || c.subjectSpecialization || null,
      credits: c.credits || null,
      enrollmentCount: c.enrollmentCount || 0,
      status: c.status || null,
      active: c.status ? c.status === 'active' : null,
    };
  }

  mapEnrollment(e: any): EnrollmentsReportItem {
    const course = e.course;
    const student = e.student;
    return {
      id: e.id,
      enrollmentDate: e.enrollmentDate || e.createdAt || null,
      status: e.status || null,
  studentId: student?.id || null,
  studentHumanId: student?.studentId || null,
      studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : null,
      classId: student?.classId || student?.class?.id || course?.classId || course?.class?.id || null,
      className: student?.class?.name || course?.class?.name || null,
      courseId: course?.id || null,
      courseName: course?.name || null,
      teacherId: course?.teacher?.id || course?.teacherId || null,
      teacherName: course?.teacher ? `${course.teacher.firstName || ''} ${course.teacher.lastName || ''}`.trim() : null,
      termId: e.termId || e.term?.id || null,
      termName: e.term?.name || null,
      academicCalendarId: e.academicCalendarId || e.term?.academicCalendarId || null,
      academicYearName: e.academicCalendar?.name || null,
    };
  }

  mapPayment(p: any): FeePaymentsReportItem {
    const student = p.student;
    return {
      id: p.id,
      studentId: student?.id || null,
      studentHumanId: student?.studentId || null,
      studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : null,
      classId: student?.classId || student?.class?.id || null,
      className: student?.class?.name || null,
      amount: Number(p.amount) || 0,
      paymentType: p.paymentType || null,
      paymentMethod: p.paymentMethod || null,
      status: p.status || null,
      paymentDate: p.paymentDate || null,
      termId: p.termId || p.term?.id || null,
      termName: p.term?.name || null,
      academicCalendarId: p.term?.academicCalendarId || null,
    };
  }
}
