import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeePayment } from '../entities/fee-payment.entity';
import { FeeStructure } from '../entities/fee-structure.entity';
import { Student } from '../../user/entities/student.entity';
import { Enrollment } from '../../enrollment/entities/enrollment.entity';
import { SettingsService } from '../../settings/settings.service';

export interface FeeAnalytics {
  Term: {
    id: string;
    name: string;
    period: string;
  };
  totalStudents: number;
  totalEnrolledStudents: number;
  feeStructure: {
    totalExpectedAmount: number;
    mandatoryFees: number;
    optionalFees: number;
    feeTypes: Array<{
      type: string;
      amount: number;
      isOptional: boolean;
      frequency: string;
    }>;
  };
  paymentSummary: {
    totalPaid: number;
    totalOutstanding: number;
    totalExpected: number;
    paymentPercentage: number;
  };
  studentPaymentStatus: Array<{
    studentId: string;
    studentName: string;
    className: string;
    totalExpected: number;
    totalPaid: number;
    outstanding: number;
    paymentStatus: 'paid' | 'partial' | 'outstanding';
    lastPaymentDate?: string;
  }>;
  paymentTrends: {
    byMonth: Array<{ month: string; amount: number; count: number }>;
    byFeeType: Array<{ feeType: string; totalPaid: number; percentage: number }>;
  };
  noData?: boolean;
  message?: string;
}

@Injectable()
export class FeeAnalyticsService {
  private readonly logger = new Logger(FeeAnalyticsService.name);

  constructor(
    @InjectRepository(FeePayment)
    private feePaymentRepository: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private feeStructureRepository: Repository<FeeStructure>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Enrollment)
    private enrollmentRepository: Repository<Enrollment>,
    private settingsService: SettingsService,
  ) {}

  async getFeeAnalytics(TermId?: string, schoolId?: string, superAdmin = false): Promise<FeeAnalytics> {
    this.logger.log(`Generating fee analytics report for term: ${TermId}, school: ${schoolId}, superAdmin: ${superAdmin}`);

    try {
      // Get current term if not provided
      let currentTerm;
      if (TermId) {
        currentTerm = { id: TermId };
      } else {
        currentTerm = await this.settingsService.getCurrentTerm(schoolId);
      }

      if (!currentTerm) {
        // Graceful response when there is no current term configured
        return {
          Term: { id: '', name: 'No current term', period: '' },
          totalStudents: 0,
          totalEnrolledStudents: 0,
          feeStructure: { totalExpectedAmount: 0, mandatoryFees: 0, optionalFees: 0, feeTypes: [] },
          paymentSummary: { totalPaid: 0, totalOutstanding: 0, totalExpected: 0, paymentPercentage: 0 },
          studentPaymentStatus: [],
          paymentTrends: { byMonth: [], byFeeType: [] },
          noData: true,
          message: 'No current term configured. Set up a term to view fee analytics.'
        };
      }

      this.logger.log(`Analyzing fees for term: ${currentTerm.id}`);

      // Get term details
      const termDetails = await this.settingsService.getCurrentTerm();

      // Get all students enrolled in current term with school filtering
      const enrollmentQuery: any = { termId: currentTerm.id };
      const studentQuery: any = {};
      
      // Apply school filtering
      if (!superAdmin) {
        if (!schoolId) {
          this.logger.warn('No schoolId provided for non-super-admin user, returning empty analytics');
          return {
            Term: { id: currentTerm.id, name: 'Access Restricted', period: '' },
            totalStudents: 0,
            totalEnrolledStudents: 0,
            feeStructure: { totalExpectedAmount: 0, mandatoryFees: 0, optionalFees: 0, feeTypes: [] },
            paymentSummary: { totalPaid: 0, totalOutstanding: 0, totalExpected: 0, paymentPercentage: 0 },
            studentPaymentStatus: [],
            paymentTrends: { byMonth: [], byFeeType: [] },
            noData: true,
            message: 'Access restricted. You can only view data for your school.'
          };
        }
        studentQuery.schoolId = schoolId;
      } else if (schoolId) {
        studentQuery.schoolId = schoolId;
      }

      const enrollments = await this.enrollmentRepository
        .createQueryBuilder('enrollment')
        .leftJoinAndSelect('enrollment.student', 'student')
        .leftJoinAndSelect('student.class', 'class')
        .leftJoinAndSelect('enrollment.term', 'term')
        .where('enrollment.termId = :termId', { termId: currentTerm.id })
        .andWhere(Object.keys(studentQuery).length > 0 ? 'student.schoolId = :schoolId' : '1=1', studentQuery.schoolId ? { schoolId: studentQuery.schoolId } : {})
        .getMany();

      const enrolledStudents = enrollments.reduce((acc, enrollment) => {
        if (!acc.find(s => s.id === enrollment.student.id)) {
          acc.push(enrollment.student);
        }
        return acc;
      }, [] as Student[]);

      // Get total students (not necessarily enrolled) with school filtering
      const totalStudents = await this.studentRepository.count({ where: studentQuery });

      // Get fee structure for current term with school filtering
      const feeStructureQuery: any = { 
        termId: currentTerm.id,
        isActive: true 
      };
      
      // Apply school filtering to fee structures
      if (!superAdmin && schoolId) {
        feeStructureQuery.schoolId = schoolId;
      } else if (schoolId) {
        feeStructureQuery.schoolId = schoolId;
      }

      const feeStructures = await this.feeStructureRepository.find({
        where: feeStructureQuery,
        relations: ['class']
      });

      // Calculate expected fees per student
      const feeStructureAnalysis = this.calculateFeeStructure(feeStructures);

      // Get all payments for current term with school filtering
      const payments = await this.feePaymentRepository
        .createQueryBuilder('payment')
        .leftJoinAndSelect('payment.student', 'student')
        .leftJoinAndSelect('payment.term', 'term')
        .where('payment.termId = :termId', { termId: currentTerm.id })
        .andWhere('payment.status = :status', { status: 'completed' })
        .andWhere(Object.keys(studentQuery).length > 0 ? 'payment.schoolId = :schoolId' : '1=1', studentQuery.schoolId ? { schoolId: studentQuery.schoolId } : {})
        .getMany();

      // Calculate payment summary
      const paymentSummary = this.calculatePaymentSummary(
        enrolledStudents,
        feeStructureAnalysis.totalExpectedAmount,
        payments
      );

      // Get student payment statuses
      const studentPaymentStatus = await this.calculateStudentPaymentStatus(
        enrolledStudents,
        feeStructureAnalysis.totalExpectedAmount,
        payments
      );

      // Calculate payment trends
      const paymentTrends = this.calculatePaymentTrends(payments);

      this.logger.log('Fee analytics report generated successfully');

      return {
        Term: {
          id: currentTerm.id,
          name: termDetails ? 'Current Term' : 'N/A',
          period: 'Current Period'
        },
        totalStudents,
        totalEnrolledStudents: enrolledStudents.length,
        feeStructure: feeStructureAnalysis,
        paymentSummary,
        studentPaymentStatus,
        paymentTrends
      };

    } catch (error) {
      this.logger.error('Failed to generate fee analytics', (error as any)?.stack);
      // Return a safe, friendly payload rather than 500 for known soft failures
      return {
        Term: { id: '', name: 'Unavailable', period: '' },
        totalStudents: 0,
        totalEnrolledStudents: 0,
        feeStructure: { totalExpectedAmount: 0, mandatoryFees: 0, optionalFees: 0, feeTypes: [] },
        paymentSummary: { totalPaid: 0, totalOutstanding: 0, totalExpected: 0, paymentPercentage: 0 },
        studentPaymentStatus: [],
        paymentTrends: { byMonth: [], byFeeType: [] },
        noData: true,
        message: 'Failed to generate fee analytics. Please try again later.'
      };
    }
  }

  private calculateFeeStructure(feeStructures: FeeStructure[]) {
    const mandatoryFees = feeStructures
      .filter(fs => !fs.isOptional)
      .reduce((sum, fs) => sum + Number(fs.amount), 0);

    const optionalFees = feeStructures
      .filter(fs => fs.isOptional)
      .reduce((sum, fs) => sum + Number(fs.amount), 0);

    return {
      totalExpectedAmount: mandatoryFees + optionalFees,
      mandatoryFees,
      optionalFees,
      feeTypes: feeStructures.map(fs => ({
        type: fs.feeType,
        amount: Number(fs.amount),
        isOptional: fs.isOptional,
        frequency: fs.frequency
      }))
    };
  }

  private calculatePaymentSummary(
    enrolledStudents: Student[],
    expectedAmountPerStudent: number,
    payments: FeePayment[]
  ) {
    const totalExpected = enrolledStudents.length * expectedAmountPerStudent;
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const totalOutstanding = totalExpected - totalPaid;
    const paymentPercentage = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

    return {
      totalExpected,
      totalPaid,
      totalOutstanding,
      paymentPercentage: Math.round(paymentPercentage * 100) / 100
    };
  }

  private async calculateStudentPaymentStatus(
    enrolledStudents: Student[],
    expectedAmountPerStudent: number,
    payments: FeePayment[]
  ): Promise<FeeAnalytics['studentPaymentStatus']> {
    const studentPaymentMap = new Map<string, { total: number; lastDate: Date | null }>();

    // Group payments by student
    payments.forEach(payment => {
      const studentId = payment.student.id;
      const existing = studentPaymentMap.get(studentId) || { total: 0, lastDate: null };
      existing.total += Number(payment.amount);
      
      if (!existing.lastDate || payment.paymentDate > existing.lastDate) {
        existing.lastDate = payment.paymentDate;
      }
      
      studentPaymentMap.set(studentId, existing);
    });

    return enrolledStudents.map(student => {
      const paymentInfo = studentPaymentMap.get(student.id) || { total: 0, lastDate: null };
      const outstanding = expectedAmountPerStudent - paymentInfo.total;
      
      let paymentStatus: 'paid' | 'partial' | 'outstanding';
      if (paymentInfo.total >= expectedAmountPerStudent) {
        paymentStatus = 'paid';
      } else if (paymentInfo.total > 0) {
        paymentStatus = 'partial';
      } else {
        paymentStatus = 'outstanding';
      }

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        className: student.class?.name || 'No Class',
        totalExpected: expectedAmountPerStudent,
        totalPaid: paymentInfo.total,
        outstanding: Math.max(0, outstanding),
        paymentStatus,
        lastPaymentDate: paymentInfo.lastDate?.toISOString()
      };
    });
  }

  private calculatePaymentTrends(payments: FeePayment[]) {
    // By month
    const monthlyData = new Map<string, { amount: number; count: number }>();
    payments.forEach(payment => {
      const month = payment.paymentDate.toISOString().slice(0, 7); // YYYY-MM
      const existing = monthlyData.get(month) || { amount: 0, count: 0 };
      existing.amount += Number(payment.amount);
      existing.count += 1;
      monthlyData.set(month, existing);
    });

    const byMonth = Array.from(monthlyData.entries()).map(([month, data]) => ({
      month,
      amount: data.amount,
      count: data.count
    })).sort((a, b) => a.month.localeCompare(b.month));

    // By fee type
    const feeTypeData = new Map<string, number>();
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    
    payments.forEach(payment => {
      const existing = feeTypeData.get(payment.paymentType) || 0;
      feeTypeData.set(payment.paymentType, existing + Number(payment.amount));
    });

    const byFeeType = Array.from(feeTypeData.entries()).map(([feeType, totalPaid]) => ({
      feeType,
      totalPaid,
      percentage: totalPaid > 0 ? Math.round((totalPaid / totalPaid) * 10000) / 100 : 0
    }));

    return { byMonth, byFeeType };
  }

  async getStudentFeeDetails(studentId: string, termId?: string, schoolId?: string, superAdmin = false) {
    this.logger.log(`Getting fee details for student: ${studentId}, school: ${schoolId}, superAdmin: ${superAdmin}`);

    const currentTerm = termId 
      ? { id: termId }
      : await this.settingsService.getCurrentTerm(schoolId);

    if (!currentTerm) {
      throw new Error('No term found');
    }

    // Build student query with school filtering
    const studentQuery: any = { id: studentId };
    if (!superAdmin && schoolId) {
      studentQuery.schoolId = schoolId;
    } else if (schoolId) {
      studentQuery.schoolId = schoolId;
    }

    const student = await this.studentRepository.findOne({
      where: studentQuery,
      relations: ['class']
    });

    if (!student) {
      throw new Error('Student not found or access denied');
    }

    // Get fee structure with school filtering
    const feeStructureQuery: any = { 
      termId: currentTerm.id,
      isActive: true 
    };
    if (!superAdmin && schoolId) {
      feeStructureQuery.schoolId = schoolId;
    } else if (schoolId) {
      feeStructureQuery.schoolId = schoolId;
    }

    const feeStructures = await this.feeStructureRepository.find({
      where: feeStructureQuery
    });

    // Get student payments with school filtering
    const payments = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .where('payment.studentId = :studentId', { studentId })
      .andWhere('payment.termId = :termId', { termId: currentTerm.id })
      .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
      .orderBy('payment.paymentDate', 'DESC')
      .getMany();

    const totalExpected = feeStructures.reduce((sum, fs) => sum + Number(fs.amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        className: student.class?.name || 'No Class',
        isActive: student.isActive,
        inactivationReason: student.inactivationReason || null,
        inactivatedAt: student.inactivatedAt || null
      },
      feeStructure: feeStructures.map(fs => ({
        type: fs.feeType,
        amount: Number(fs.amount),
        isOptional: fs.isOptional
      })),
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        type: p.paymentType,
        method: p.paymentMethod,
        date: p.paymentDate.toISOString(),
        receiptNumber: p.receiptNumber,
        status: p.status
      })),
      summary: {
        totalExpected,
        totalPaid,
        outstanding: Math.max(0, totalExpected - totalPaid),
        paymentStatus: totalPaid >= totalExpected ? 'paid' : totalPaid > 0 ? 'partial' : 'outstanding'
      }
    };
  }
}
