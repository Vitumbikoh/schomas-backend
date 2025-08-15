import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Student } from '../user/entities/student.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { Class } from '../classes/entity/class.entity';

export interface FeeAnalyticsData {
  academicYear: string;
  totalStudents: number;
  totalExpectedFees: number;
  totalPaidFees: number;
  outstandingFees: number;
  paymentRate: number;
  feeTypeBreakdown: {
    feeType: string;
    expected: number;
    paid: number;
    outstanding: number;
  }[];
  classWiseAnalytics: {
    className: string;
    studentsCount: number;
    expectedFees: number;
    paidFees: number;
    outstandingFees: number;
  }[];
  paymentTrends: {
    month: string;
    totalPayments: number;
    amount: number;
  }[];
}

export interface StudentFeeDetails {
  studentId: string;
  studentName: string;
  className: string;
  totalExpected: number;
  totalPaid: number;
  outstanding: number;
  paymentHistory: {
    id: string;
    amount: number;
    paymentType: string;
    paymentDate: Date;
    receiptNumber: string | null;
  }[];
}

@Injectable()
export class FeeAnalyticsService {
  constructor(
    @InjectRepository(FeePayment)
    private feePaymentRepository: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private feeStructureRepository: Repository<FeeStructure>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Enrollment)
    private enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(AcademicYear)
    private academicYearRepository: Repository<AcademicYear>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
  ) {}

  async getFeeAnalytics(academicYearId: string): Promise<FeeAnalyticsData> {
    // Get academic year details
    const academicYear = await this.academicYearRepository.findOne({
      where: { id: academicYearId },
    });

    if (!academicYear) {
      throw new Error('Academic year not found');
    }

    // Get all enrollments for this academic year
    const enrollments = await this.enrollmentRepository.find({
      where: { academicYearId },
      relations: ['student', 'course', 'course.class'],
    });

    const totalStudents = enrollments.length;

    // Get fee structures for this academic year
    const feeStructures = await this.feeStructureRepository.find({
      where: { academicYearId },
      relations: ['class'],
    });

    // Calculate expected fees
    let totalExpectedFees = 0;
    const feeTypeBreakdown: { [key: string]: { expected: number; paid: number } } = {};

    for (const enrollment of enrollments) {
      const applicableFees = feeStructures.filter(
        (fee) => !fee.classId || fee.classId === enrollment.course?.class?.id
      );

      for (const fee of applicableFees) {
        totalExpectedFees += fee.amount;
        
        if (!feeTypeBreakdown[fee.feeType]) {
          feeTypeBreakdown[fee.feeType] = { expected: 0, paid: 0 };
        }
        feeTypeBreakdown[fee.feeType].expected += fee.amount;
      }
    }

    // Get all payments for this academic year
    const payments = await this.feePaymentRepository.find({
      where: { academicYearId },
      relations: ['student'],
    });

    // Calculate total paid fees and fee type breakdown
    let totalPaidFees = 0;
    for (const payment of payments) {
      totalPaidFees += payment.amount;
      
      if (feeTypeBreakdown[payment.paymentType]) {
        feeTypeBreakdown[payment.paymentType].paid += payment.amount;
      }
    }

    const outstandingFees = totalExpectedFees - totalPaidFees;
    const paymentRate = totalExpectedFees > 0 ? (totalPaidFees / totalExpectedFees) * 100 : 0;

    // Format fee type breakdown
    const feeTypeBreakdownArray = Object.entries(feeTypeBreakdown).map(([feeType, data]) => ({
      feeType,
      expected: data.expected,
      paid: data.paid,
      outstanding: data.expected - data.paid,
    }));

    // Class-wise analytics
    const classWiseAnalytics = await this.getClassWiseAnalytics(academicYearId, enrollments, feeStructures, payments);

    // Payment trends (monthly)
    const paymentTrends = await this.getPaymentTrends(academicYearId);

    return {
      academicYear: `Academic Year ${academicYear.startDate.getFullYear()}-${academicYear.endDate.getFullYear()}`,
      totalStudents,
      totalExpectedFees,
      totalPaidFees,
      outstandingFees,
      paymentRate: Math.round(paymentRate * 100) / 100,
      feeTypeBreakdown: feeTypeBreakdownArray,
      classWiseAnalytics,
      paymentTrends,
    };
  }

  private async getClassWiseAnalytics(
    academicYearId: string,
    enrollments: any[],
    feeStructures: any[],
    payments: any[]
  ) {
    const classMap = new Map();

    // Initialize class data
    for (const enrollment of enrollments) {
      const classId = enrollment.course?.class?.id;
      const className = enrollment.course?.class?.name || 'Unknown Class';

      if (!classMap.has(classId)) {
        classMap.set(classId, {
          className,
          studentsCount: 0,
          expectedFees: 0,
          paidFees: 0,
        });
      }

      const classData = classMap.get(classId);
      classData.studentsCount++;

      // Calculate expected fees for this student in this class
      const applicableFees = feeStructures.filter(
        (fee) => !fee.classId || fee.classId === classId
      );

      for (const fee of applicableFees) {
        classData.expectedFees += fee.amount;
      }
    }

    // Add paid fees by class (based on student enrollments)
    for (const payment of payments) {
      const studentEnrollment = enrollments.find(e => e.student.id === payment.student.id);
      if (studentEnrollment) {
        const classId = studentEnrollment.course?.class?.id;
        const classData = classMap.get(classId);
        if (classData) {
          classData.paidFees += payment.amount;
        }
      }
    }

    return Array.from(classMap.values()).map(classData => ({
      ...classData,
      outstandingFees: classData.expectedFees - classData.paidFees,
    }));
  }

  private async getPaymentTrends(academicYearId: string) {
    const payments = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .select([
        'EXTRACT(YEAR FROM payment.paymentDate) as year',
        'EXTRACT(MONTH FROM payment.paymentDate) as month',
        'COUNT(*) as totalPayments',
        'SUM(payment.amount) as amount',
      ])
      .where('payment.academicYearId = :academicYearId', { academicYearId })
      .groupBy('EXTRACT(YEAR FROM payment.paymentDate), EXTRACT(MONTH FROM payment.paymentDate)')
      .orderBy('year, month')
      .getRawMany();

    return payments.map(p => ({
      month: `${p.year}-${String(p.month).padStart(2, '0')}`,
      totalPayments: parseInt(p.totalPayments),
      amount: parseFloat(p.amount),
    }));
  }

  async getStudentFeeDetails(studentId: string, academicYearId: string): Promise<StudentFeeDetails> {
    // Get student details
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Get student enrollment for the academic year
    const enrollment = await this.enrollmentRepository.findOne({
      where: { studentId, academicYearId },
      relations: ['course', 'course.class'],
    });

    if (!enrollment) {
      throw new Error('Student not enrolled for this academic year');
    }

    // Get applicable fee structures
    const feeStructures = await this.feeStructureRepository.find({
      where: [
        { academicYearId, classId: enrollment.course?.class?.id },
        { academicYearId, classId: undefined }, // General fees
      ],
    });

    // Calculate total expected fees
    const totalExpected = feeStructures.reduce((sum, fee) => sum + fee.amount, 0);

    // Get payment history
    const payments = await this.feePaymentRepository.find({
      where: { student: { id: studentId }, academicYearId },
      order: { paymentDate: 'DESC' },
    });

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = totalExpected - totalPaid;

    const paymentHistory = payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      paymentType: payment.paymentType,
      paymentDate: payment.paymentDate,
      receiptNumber: payment.receiptNumber,
    }));

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      className: enrollment.course?.class?.name || 'Unknown Class',
      totalExpected,
      totalPaid,
      outstanding,
      paymentHistory,
    };
  }

  async calculatePaymentSummary(academicYearId: string) {
    const [
      totalStudents,
      totalExpected,
      totalPaid,
      pendingPayments,
    ] = await Promise.all([
      this.enrollmentRepository.count({ where: { academicYearId } }),
      this.calculateTotalExpectedFees(academicYearId),
      this.calculateTotalPaidFees(academicYearId),
      this.getPendingPaymentCount(academicYearId),
    ]);

    const outstanding = totalExpected - totalPaid;
    const paymentRate = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

    return {
      totalStudents,
      totalExpected,
      totalPaid,
      outstanding,
      paymentRate: Math.round(paymentRate * 100) / 100,
      pendingPayments,
    };
  }

  private async calculateTotalExpectedFees(academicYearId: string): Promise<number> {
    const enrollments = await this.enrollmentRepository.find({
      where: { academicYearId },
      relations: ['course', 'course.class'],
    });

    const feeStructures = await this.feeStructureRepository.find({
      where: { academicYearId },
    });

    let total = 0;
    for (const enrollment of enrollments) {
      const applicableFees = feeStructures.filter(
        (fee) => !fee.classId || fee.classId === enrollment.course?.class?.id
      );
      total += applicableFees.reduce((sum, fee) => sum + fee.amount, 0);
    }

    return total;
  }

  private async calculateTotalPaidFees(academicYearId: string): Promise<number> {
    const result = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'total')
      .where('payment.academicYearId = :academicYearId', { academicYearId })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  private async getPendingPaymentCount(academicYearId: string): Promise<number> {
    // This would require additional logic to determine "pending" payments
    // For now, we'll return the count of students who haven't made any payments
    const studentsWithPayments = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .select('DISTINCT payment.studentId')
      .where('payment.academicYearId = :academicYearId', { academicYearId })
      .getRawMany();

    const totalStudents = await this.enrollmentRepository.count({
      where: { academicYearId },
    });

    return totalStudents - studentsWithPayments.length;
  }
}
