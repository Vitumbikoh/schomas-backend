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

  async getFeeAnalytics(TermId?: string): Promise<FeeAnalytics> {
    this.logger.log('Generating fee analytics report...');

    try {
      // Get current term if not provided
      let currentTerm;
      if (TermId) {
        currentTerm = { id: TermId };
      } else {
        currentTerm = await this.settingsService.getCurrentTerm();
      }

      if (!currentTerm) {
        throw new Error('No term found');
      }

      this.logger.log(`Analyzing fees for term: ${currentTerm.id}`);

      // Get term details
      const termDetails = await this.settingsService.getCurrentTerm();

      // Get all students enrolled in current term
      const enrollments = await this.enrollmentRepository.find({
        where: { termId: currentTerm.id },
        relations: ['student', 'student.class', 'term'],
      });

      const enrolledStudents = enrollments.reduce((acc, enrollment) => {
        if (!acc.find(s => s.id === enrollment.student.id)) {
          acc.push(enrollment.student);
        }
        return acc;
      }, [] as Student[]);

      // Get total students (not necessarily enrolled)
      const totalStudents = await this.studentRepository.count();

      // Get fee structure for current term
      const feeStructures = await this.feeStructureRepository.find({
        where: { 
          termId: currentTerm.id,
          isActive: true 
        },
        relations: ['class']
      });

      // Calculate expected fees per student
      const feeStructureAnalysis = this.calculateFeeStructure(feeStructures);

      // Get all payments for current term
      const payments = await this.feePaymentRepository.find({
        where: { 
          termId: currentTerm.id,
          status: 'completed'
        },
        relations: ['student', 'Term']
      });

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
      this.logger.error('Failed to generate fee analytics', error.stack);
      throw new Error(`Failed to generate fee analytics: ${error.message}`);
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

  async getStudentFeeDetails(studentId: string, termId?: string) {
    this.logger.log(`Getting fee details for student: ${studentId}`);

    const currentTerm = termId 
      ? { id: termId }
      : await this.settingsService.getCurrentTerm();

    if (!currentTerm) {
      throw new Error('No term found');
    }

    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: ['class']
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Get fee structure
    const feeStructures = await this.feeStructureRepository.find({
      where: { 
        termId: currentTerm.id,
        isActive: true 
      }
    });

    // Get student payments
    const payments = await this.feePaymentRepository.find({
      where: { 
        student: { id: studentId },
        termId: currentTerm.id 
      },
      order: { paymentDate: 'DESC' }
    });

    const totalExpected = feeStructures.reduce((sum, fs) => sum + Number(fs.amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        className: student.class?.name || 'No Class'
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
