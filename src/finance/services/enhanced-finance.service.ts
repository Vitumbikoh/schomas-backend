import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentAcademicRecord, StudentStatus } from '../entities/student-academic-record.entity';
import { ExpectedFee, FeeCategory } from '../entities/expected-fee.entity';
import { PaymentAllocation, AllocationReason } from '../entities/payment-allocation.entity';
import { FeePayment } from '../entities/fee-payment.entity';
import { Term } from '../../settings/entities/term.entity';
import { Student } from '../../user/entities/student.entity';

export interface StudentFeeStatus {
  studentId: string;
  studentName: string;
  humanId: string;
  termId: string;
  classId?: string;
  className?: string;
  expectedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  paymentPercentage: number;
  status: 'paid' | 'partial' | 'unpaid' | 'overpaid';
  isOverdue: boolean;
  lastPaymentDate?: Date;
  carryForwardAmount: number;
  currentTermFees: number;
  allocations: PaymentAllocation[];
}

export interface TermFinanceSummary {
  termId: string;
  termName: string;
  academicCalendar: string;
  totalStudents: number;
  expectedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  paymentPercentage: number;
  studentsFullyPaid: number;
  studentsPartiallyPaid: number;
  studentsUnpaid: number;
  studentsOverdue: number;
  totalCarryForwardAmount: number;
  currentTermFeesAmount: number;
  averagePaymentPerStudent: number;
  isTermCompleted: boolean;
  termEndDate: Date;
}

export interface OverdueAnalysis {
  studentId: string;
  studentName: string;
  totalOverdueAmount: number;
  overdueTerms: {
    termId: string;
    termName: string;
    amount: number;
    daysPastDue: number;
  }[];
}

/**
 * Enhanced finance calculation service using allocation-based logic.
 * All calculations derive from PaymentAllocation records for accuracy.
 */
@Injectable()
export class EnhancedFinanceService {
  private readonly logger = new Logger(EnhancedFinanceService.name);

  constructor(
    @InjectRepository(StudentAcademicRecord)
    private academicRecordRepo: Repository<StudentAcademicRecord>,
    @InjectRepository(ExpectedFee)
    private expectedFeeRepo: Repository<ExpectedFee>,
    @InjectRepository(PaymentAllocation)
    private allocationRepo: Repository<PaymentAllocation>,
    @InjectRepository(FeePayment)
    private paymentRepo: Repository<FeePayment>,
    @InjectRepository(Term)
    private termRepo: Repository<Term>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
  ) {}

  /**
   * Get comprehensive finance summary for a term
   */
  async getTermFinanceSummary(
    termId: string,
    schoolId?: string
  ): Promise<TermFinanceSummary> {
    this.logger.log(`Calculating finance summary for term ${termId}`);

    // Get term details
    const term = await this.termRepo.findOne({
      where: { id: termId },
      relations: ['academicCalendar']
    });

    if (!term) {
      throw new Error(`Term ${termId} not found`);
    }

    // Get all students who had academic records in this term
    const academicRecords = await this.academicRecordRepo.find({
      where: { 
        termId,
        ...(schoolId && { schoolId })
      },
      relations: ['student', 'class']
    });

    if (academicRecords.length === 0) {
      return this.createEmptyTermSummary(termId, term);
    }

    // Calculate totals
    let expectedAmount = 0;
    let paidAmount = 0;
    let carryForwardAmount = 0;
    let studentsFullyPaid = 0;
    let studentsPartiallyPaid = 0;
    let studentsUnpaid = 0;
    let studentsOverdue = 0;

    for (const record of academicRecords) {
      const studentStatus = await this.getStudentFeeStatus(record.studentId, termId, schoolId);
      
      expectedAmount += studentStatus.expectedAmount;
      paidAmount += studentStatus.paidAmount;
      carryForwardAmount += studentStatus.carryForwardAmount;

      // Categorize students
      if (studentStatus.outstandingAmount === 0) {
        studentsFullyPaid++;
      } else if (studentStatus.paidAmount > 0) {
        studentsPartiallyPaid++;
      } else {
        studentsUnpaid++;
      }

      if (studentStatus.isOverdue) {
        studentsOverdue++;
      }
    }

    const outstandingAmount = Math.max(0, expectedAmount - paidAmount);
    const paymentPercentage = expectedAmount > 0 ? (paidAmount / expectedAmount) * 100 : 0;
    const currentTermFeesAmount = expectedAmount - carryForwardAmount;
    
    // Calculate overdue amount (for completed terms)
    const now = new Date();
    const isTermCompleted = now > new Date(term.endDate);
    const overdueAmount = isTermCompleted ? outstandingAmount : 0;

    return {
      termId,
      termName: `Term ${term.termNumber}`,
      academicCalendar: term.academicCalendar.term,
      totalStudents: academicRecords.length,
      expectedAmount,
      paidAmount,
      outstandingAmount,
      overdueAmount,
      paymentPercentage,
      studentsFullyPaid,
      studentsPartiallyPaid,
      studentsUnpaid,
      studentsOverdue,
      totalCarryForwardAmount: carryForwardAmount,
      currentTermFeesAmount,
      averagePaymentPerStudent: academicRecords.length > 0 ? paidAmount / academicRecords.length : 0,
      isTermCompleted,
      termEndDate: term.endDate
    };
  }

  /**
   * Get detailed fee status for a specific student in a term
   */
  async getStudentFeeStatus(
    studentId: string,
    termId: string,
    schoolId?: string
  ): Promise<StudentFeeStatus> {
    
    // Get student's academic record for this term
    const academicRecord = await this.academicRecordRepo.findOne({
      where: { 
        studentId, 
        termId,
        ...(schoolId && { schoolId })
      },
      relations: ['student', 'class', 'term', 'academicCalendar']
    });

    if (!academicRecord) {
      throw new Error(`No academic record found for student ${studentId} in term ${termId}`);
    }

    // Get expected fees for this student in this term
    const expectedFees = await this.expectedFeeRepo
      .createQueryBuilder('ef')
      .where('ef.termId = :termId', { termId })
      .andWhere('ef.isActive = true')
      .andWhere('(ef.classId IS NULL OR ef.classId = :classId)', { classId: academicRecord.classId })
      .andWhere(schoolId ? 'ef.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getMany();

    const expectedAmount = expectedFees
      .filter(fee => !fee.isOptional)
      .reduce((sum, fee) => sum + Number(fee.amount), 0);

    const carryForwardAmount = expectedFees
      .filter(fee => fee.isCarryForward)
      .reduce((sum, fee) => sum + Number(fee.amount), 0);

    const currentTermFees = expectedAmount - carryForwardAmount;

    // Get allocated payments for this student in this term
    const allocations = await this.allocationRepo
      .createQueryBuilder('pa')
      .innerJoin('pa.payment', 'p')
      .where('pa.termId = :termId', { termId })
      .andWhere('p.studentId = :studentId', { studentId })
      .andWhere('p.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'pa.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .orderBy('pa.allocatedAt', 'DESC')
      .getMany();

    const paidAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    const outstandingAmount = Math.max(0, expectedAmount - paidAmount);

    // Determine overdue status
    const term = academicRecord.term;
    const now = new Date();
    const isTermCompleted = now > new Date(term.endDate);
    const isOverdue = isTermCompleted && outstandingAmount > 0;
    const overdueAmount = isOverdue ? outstandingAmount : 0;

    // Calculate payment percentage
    const paymentPercentage = expectedAmount > 0 ? (paidAmount / expectedAmount) * 100 : 0;

    // Determine status
    let status: 'paid' | 'partial' | 'unpaid' | 'overpaid';
    if (paidAmount > expectedAmount) {
      status = 'overpaid';
    } else if (outstandingAmount === 0) {
      status = 'paid';
    } else if (paidAmount > 0) {
      status = 'partial';
    } else {
      status = 'unpaid';
    }

    // Get last payment date
    const lastPaymentDate = allocations.length > 0 ? allocations[0].allocatedAt : undefined;

    return {
      studentId,
      studentName: `${academicRecord.student.firstName} ${academicRecord.student.lastName}`,
      humanId: academicRecord.student.studentId || academicRecord.student.id,
      termId,
      classId: academicRecord.classId,
      className: academicRecord.class?.name,
      expectedAmount,
      paidAmount,
      outstandingAmount,
      overdueAmount,
      paymentPercentage,
      status,
      isOverdue,
      lastPaymentDate,
      carryForwardAmount,
      currentTermFees,
      allocations
    };
  }

  /**
   * Get fee statuses for all students in a term
   */
  async getTermStudentFeeStatuses(
    termId: string,
    schoolId?: string
  ): Promise<StudentFeeStatus[]> {
    
    const academicRecords = await this.academicRecordRepo.find({
      where: { 
        termId,
        ...(schoolId && { schoolId })
      },
      relations: ['student']
    });

    const statuses: StudentFeeStatus[] = [];
    
    for (const record of academicRecords) {
      try {
        const status = await this.getStudentFeeStatus(record.studentId, termId, schoolId);
        statuses.push(status);
      } catch (error) {
        this.logger.warn(`Failed to get fee status for student ${record.studentId}: ${error.message}`);
      }
    }

    // Sort by outstanding amount (highest first)
    return statuses.sort((a, b) => b.outstandingAmount - a.outstandingAmount);
  }

  /**
   * Get overdue analysis across all terms for students with outstanding balances
   */
  async getOverdueAnalysis(schoolId?: string): Promise<OverdueAnalysis[]> {
    const query = this.academicRecordRepo
      .createQueryBuilder('ar')
      .innerJoin('ar.student', 's')
      .innerJoin('ar.term', 't')
      .where('ar.status = :status', { status: StudentStatus.ACTIVE })
      .andWhere('t.endDate < :now', { now: new Date() })
      .andWhere(schoolId ? 'ar.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});

    const records = await query.getMany();
    
    const overdueMap = new Map<string, OverdueAnalysis>();

    for (const record of records) {
      try {
        const status = await this.getStudentFeeStatus(record.studentId, record.termId, schoolId);
        
        if (status.outstandingAmount > 0) {
          const key = record.studentId;
          
          if (!overdueMap.has(key)) {
            overdueMap.set(key, {
              studentId: record.studentId,
              studentName: status.studentName,
              totalOverdueAmount: 0,
              overdueTerms: []
            });
          }

          const analysis = overdueMap.get(key)!;
          analysis.totalOverdueAmount += status.outstandingAmount;
          
          const daysPastDue = Math.floor(
            (new Date().getTime() - new Date(record.term.endDate).getTime()) / (1000 * 60 * 60 * 24)
          );

          analysis.overdueTerms.push({
            termId: record.termId,
            termName: `Term ${record.term.termNumber}`,
            amount: status.outstandingAmount,
            daysPastDue
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to analyze overdue for student ${record.studentId} term ${record.termId}: ${error.message}`);
      }
    }

    return Array.from(overdueMap.values())
      .sort((a, b) => b.totalOverdueAmount - a.totalOverdueAmount);
  }

  private createEmptyTermSummary(termId: string, term: Term): TermFinanceSummary {
    return {
      termId,
      termName: `Term ${term.termNumber}`,
      academicCalendar: term.academicCalendar?.term || 'Unknown',
      totalStudents: 0,
      expectedAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      overdueAmount: 0,
      paymentPercentage: 0,
      studentsFullyPaid: 0,
      studentsPartiallyPaid: 0,
      studentsUnpaid: 0,
      studentsOverdue: 0,
      totalCarryForwardAmount: 0,
      currentTermFeesAmount: 0,
      averagePaymentPerStudent: 0,
      isTermCompleted: new Date() > new Date(term.endDate),
      termEndDate: term.endDate
    };
  }
}