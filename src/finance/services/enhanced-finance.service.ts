import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { StudentAcademicRecord, StudentStatus } from '../entities/student-academic-record.entity';
import { ExpectedFee, FeeCategory } from '../entities/expected-fee.entity';
import { PaymentAllocation, AllocationReason } from '../entities/payment-allocation.entity';
import { FeePayment } from '../entities/fee-payment.entity';
import { Payment } from '../entities/payment.entity';
import { FeeStructure } from '../entities/fee-structure.entity';
import { Term } from '../../settings/entities/term.entity';
import { Student } from '../../user/entities/student.entity';
import { CreditLedger } from '../entities/credit-ledger.entity';
import { CreatePaymentWithAllocationsDto } from '../dtos/enhanced-finance.dto';

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
  creditBalance?: number;
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
    @InjectRepository(Payment)
    private paymentCaptureRepo: Repository<Payment>,
    @InjectRepository(FeeStructure)
    private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Term)
    private termRepo: Repository<Term>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(CreditLedger)
    private creditRepo: Repository<CreditLedger>,
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

    // Check if this is a historical term
    const currentTerm = await this.termRepo.findOne({
      where: { isCurrent: true, ...(schoolId && { schoolId }) }
    });

    const isHistoricalTerm = (term.isCompleted === true) || (currentTerm && term.id !== currentTerm.id);

    let academicRecords: StudentAcademicRecord[] = [];

    if (isHistoricalTerm) {
      // For historical terms, query from student_academic_history
      // Exclude graduated students from fee expectations
      this.logger.log(`Term ${termId} is historical, fetching from academic history`);
      
      const historicalQuery = `
        SELECT DISTINCT 
          sah.student_id as "studentId",
          sah.class_id as "classId",
          s.first_name || ' ' || s.last_name as "studentName",
          s.human_id as "humanId",
          c.name as "className"
        FROM student_academic_history sah
        LEFT JOIN student s ON s.id = sah.student_id
        LEFT JOIN class c ON c.id = sah.class_id
        WHERE sah.term_id::uuid = $1
        AND s."graduationTermId" IS NULL
        AND s."isActive" = true
        AND COALESCE(s."inactivationReason", '') != 'graduated'
        ${schoolId ? 'AND sah.school_id::uuid = $2' : ''}
      `;

      const queryParams = [termId];
      if (schoolId) queryParams.push(schoolId);

      const historicalStudents = await this.studentRepo.query(historicalQuery, queryParams);
      
      // Convert to academic record-like structure for processing
      academicRecords = historicalStudents.map(row => ({
        studentId: row.studentId,
        termId: termId,
        schoolId: schoolId,
        classId: row.classId,
        student: {
          id: row.studentId,
          firstName: row.studentName ? row.studentName.split(' ')[0] : '',
          lastName: row.studentName ? row.studentName.split(' ').slice(1).join(' ') : '',
          humanId: row.humanId
        },
        class: row.className ? { id: row.classId, name: row.className } : null
      })) as any[];

      this.logger.log(`Found ${academicRecords.length} students in historical records (excluding graduated)`);
    } else {
      // Get all students who have academic records in this current term
      // Exclude graduated students
      const qb = this.academicRecordRepo
        .createQueryBuilder('ar')
        .leftJoinAndSelect('ar.student', 'student')
        .leftJoinAndSelect('ar.class', 'class')
        .where('ar.termId = :termId', { termId })
        .andWhere('ar.status != :graduatedStatus', { graduatedStatus: StudentStatus.GRADUATED })
        .andWhere('student.graduationTermId IS NULL')
        .andWhere('student.isActive = :isActive', { isActive: true });
      
      if (schoolId) {
        qb.andWhere('ar.schoolId = :schoolId', { schoolId });
      }
      
      academicRecords = await qb.getMany();

      this.logger.log(`Found ${academicRecords.length} students in current term records (excluding graduated)`);
    }

    if (academicRecords.length === 0) {
      return this.createEmptyTermSummary(termId, term);
    }

    // Calculate totals
    let expectedAmount = 0;
    let paidAmount = 0;
    let carryForwardAmount = 0;
    let overdueAmount = 0;
    let studentsFullyPaid = 0;
    let studentsPartiallyPaid = 0;
    let studentsUnpaid = 0;
    let studentsOverdue = 0;

    for (const record of academicRecords) {
      const studentStatus = await this.getStudentFeeStatus(record.studentId, termId, schoolId);
      
      expectedAmount += studentStatus.expectedAmount;
      paidAmount += studentStatus.paidAmount;
      carryForwardAmount += studentStatus.carryForwardAmount;
      overdueAmount += Number(studentStatus.overdueAmount || 0);

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
    
    const isTermCompleted = new Date() > new Date(term.endDate);

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
    
    // Try to get student's academic record for this term
    const academicRecord = await this.academicRecordRepo.findOne({
      where: { 
        studentId, 
        termId,
        ...(schoolId && { schoolId })
      },
      relations: ['student', 'class', 'term', 'academicCalendar']
    });

    let classId: string | undefined;
    let term: any;

    if (!academicRecord) {
      // Fallback: Get student and term directly (without academic record requirement)
      const student = await this.studentRepo.findOne({
        where: { id: studentId },
        relations: ['class']
      });
      
      if (!student) {
        throw new Error(`Student ${studentId} not found`);
      }
      
      term = await this.termRepo.findOne({
        where: { id: termId },
        relations: ['academicCalendar']
      });
      
      if (!term) {
        throw new Error(`Term ${termId} not found`);
      }
      
      classId = student.class?.id;
      this.logger.log(`No academic record for student ${studentId} in term ${termId}, using fee structures fallback with classId=${classId}`);
    } else {
      classId = academicRecord.classId;
      term = academicRecord.term;
    }

    // Get expected fees for this student in this term from ExpectedFee table
    const expectedFees = await this.expectedFeeRepo
      .createQueryBuilder('ef')
      .where('ef.termId = :termId', { termId })
      .andWhere('ef.isActive = true')
      .andWhere('(ef.classId IS NULL OR ef.classId = :classId)', { classId })
      .andWhere(schoolId ? 'ef.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getMany();

    let expectedAmount = 0;
    let carryForwardAmount = 0;
    
    if (expectedFees.length > 0) {
      // Use ExpectedFee table if available
      expectedAmount = expectedFees
        .filter(fee => !fee.isOptional)
        .reduce((sum, fee) => sum + Number(fee.amount), 0);

      carryForwardAmount = expectedFees
        .filter(fee => fee.isCarryForward)
        .reduce((sum, fee) => sum + Number(fee.amount), 0);
    } else {
      // Fallback to FeeStructure table
      const feeStructures = await this.feeStructureRepo.find({
        where: {
          termId,
          isActive: true,
          ...(schoolId && { schoolId })
        }
      });
      
      expectedAmount = feeStructures
        .filter(fs => !fs.isOptional && (!fs.classId || fs.classId === classId))
        .reduce((sum, fs) => sum + Number(fs.amount), 0);
      
      this.logger.log(`Using fee structures fallback: expectedAmount=${expectedAmount} from ${feeStructures.length} structures`);
    }

    const currentTermFees = expectedAmount - carryForwardAmount;

    // Get allocated payments TO this term (this includes credit applications)
    // This is the correct way to calculate what has been paid FOR this term
    const allocations = await this.allocationRepo
      .createQueryBuilder('pa')
      .innerJoin('pa.payment', 'p')
      .where('pa.termId = :termId', { termId })
      .andWhere('p.studentId = :studentId', { studentId })
      .andWhere('p.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'pa.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .orderBy('pa.allocatedAt', 'DESC')
      .getMany();

    // Calculate paidAmount from allocations TO this term (not from payments RECEIVED in this term)
    // This includes credit applications, historical settlements, and current term fees
    const paidAmount = allocations.reduce((sum, alloc) => sum + Number(alloc.allocatedAmount), 0);
    const outstandingAmount = Math.max(0, expectedAmount - paidAmount);

    // Determine overdue status strictly from configured fee due dates
    const overdueAmount = await this.calculateStudentOverdueByFeeDueDate({
      termId,
      classId,
      paidAmount,
      expectedAmount,
      schoolId,
    });
    const isOverdue = overdueAmount > 0;

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

    // Get student details if not from academic record
    let student: any;
    let className: string | undefined;
    
    if (academicRecord) {
      student = academicRecord.student;
      className = academicRecord.class?.name;
    } else {
      student = await this.studentRepo.findOne({
        where: { id: studentId },
        relations: ['class']
      });
      className = student?.class?.name;
    }

    // Compute active credit balance for this student (sum of remainingAmount in credit_ledger)
    let creditBalance = 0;
    try {
      const creditRow = await this.creditRepo
        .createQueryBuilder('cl')
        .select('COALESCE(SUM(cl.remainingAmount), 0)', 'sum')
        .where('cl.studentId = :studentId', { studentId })
        .andWhere('cl.status = :status', { status: 'active' })
        .andWhere(schoolId ? 'cl.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .getRawOne();
      creditBalance = parseFloat(creditRow?.sum || '0');
    } catch (err) {
      this.logger.warn(`Failed to load credit balance for student ${studentId}: ${err.message}`);
      creditBalance = 0;
    }

    return {
      studentId,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
      humanId: student?.studentId || studentId,
      termId,
      classId,
      className,
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
      ,
      creditBalance
    };
  }

  /**
   * Get fee statuses for all students in a term
   * Excludes graduated students (they are handled in the Graduated Outstanding section)
   */
  async getTermStudentFeeStatuses(
    termId: string,
    schoolId?: string
  ): Promise<StudentFeeStatus[]> {
    
    // Query builder to filter out graduated students
    const qb = this.academicRecordRepo
      .createQueryBuilder('ar')
      .leftJoinAndSelect('ar.student', 'student')
      .where('ar.termId = :termId', { termId })
      .andWhere('ar.status != :graduatedStatus', { graduatedStatus: StudentStatus.GRADUATED })
      .andWhere('student.graduationTermId IS NULL') // Additional check for student-level graduation
      .andWhere("COALESCE(student.inactivationReason, '') != :gradReason", { gradReason: 'graduated' })
      .andWhere('student.isActive = :isActive', { isActive: true });
    if (schoolId) {
      qb.andWhere('ar.schoolId = :schoolId', { schoolId });
    }
    
    let academicRecords = await qb.getMany();

    // Fallback: if no academic records exist (common for historical terms),
    // derive student list from historical snapshots or current student-term mapping.
    if (academicRecords.length === 0) {
      try {
        const term = await this.termRepo.findOne({
          where: { id: termId },
          relations: ['academicCalendar'],
        });
        const currentTerm = await this.termRepo.findOne({
          where: { isCurrent: true, ...(schoolId && { schoolId }) },
          relations: ['academicCalendar'],
        });
        const isHistoricalTerm = !!term && ((term.isCompleted === true) || (currentTerm && term.id !== currentTerm.id));

        if (isHistoricalTerm) {
          const historicalRows = await this.studentRepo.query(
            `SELECT DISTINCT sah.student_id as "studentId"
             FROM student_academic_history sah
             INNER JOIN student s ON s.id = sah.student_id
             WHERE sah.term_id::uuid = $1
               AND s."isActive" = true
               AND s."graduationTermId" IS NULL
               AND COALESCE(s."inactivationReason", '') != 'graduated'
               ${schoolId ? 'AND sah.school_id::uuid = $2' : ''}`,
            schoolId ? [termId, schoolId] : [termId]
          );
          academicRecords = historicalRows.map((r: any) => ({ studentId: r.studentId, termId } as any));
        } else {
          const studentQb = this.studentRepo
            .createQueryBuilder('s')
            .select(['s.id'])
            .where('s.termId = :termId', { termId })
            .andWhere('s.isActive = :isActive', { isActive: true })
            .andWhere('s.graduationTermId IS NULL')
            .andWhere("COALESCE(s.inactivationReason, '') != :gradReason", { gradReason: 'graduated' });
          if (schoolId) {
            studentQb.andWhere('s.schoolId = :schoolId', { schoolId });
          }
          const studentRows = await studentQb.getMany();
          academicRecords = studentRows.map((s: any) => ({ studentId: s.id, termId } as any));
        }
      } catch (error) {
        this.logger.warn(`Fallback student lookup failed for term ${termId}: ${error.message}`);
      }
    }

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
      .andWhere('s.isActive = :isActive', { isActive: true })
      .andWhere("COALESCE(s.inactivationReason, '') != :gradReason", { gradReason: 'graduated' })
      .andWhere(schoolId ? 'ar.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});

    const records = await query.getMany();
    
    const overdueMap = new Map<string, OverdueAnalysis>();

    for (const record of records) {
      try {
        const status = await this.getStudentFeeStatus(record.studentId, record.termId, schoolId);
        
        if (status.overdueAmount > 0) {
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
          analysis.totalOverdueAmount += status.overdueAmount;
          
          const daysPastDue = Math.max(0, Math.floor(
            (new Date().getTime() - new Date(record.term.endDate).getTime()) / (1000 * 60 * 60 * 24)
          ));

          analysis.overdueTerms.push({
            termId: record.termId,
            termName: `Term ${record.term.termNumber}`,
            amount: status.overdueAmount,
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

  private async calculateStudentOverdueByFeeDueDate(params: {
    termId: string;
    classId?: string;
    paidAmount: number;
    expectedAmount: number;
    schoolId?: string;
  }): Promise<number> {
    const { termId, classId, paidAmount, expectedAmount, schoolId } = params;

    const feeStructures = await this.feeStructureRepo.find({
      where: {
        termId,
        isActive: true,
        isOptional: false,
        ...(schoolId ? { schoolId } : {}),
      },
    });

    const applicableFees = feeStructures
      .filter((fs) => !fs.classId || (classId && fs.classId === classId))
      .filter((fs) => fs.dueDate)
      .map((fs) => {
        const due = new Date(fs.dueDate as any);
        due.setHours(23, 59, 59, 999);
        return { amount: Number(fs.amount || 0), dueTs: due.getTime() };
      })
      .filter((item) => item.amount > 0)
      .sort((a, b) => a.dueTs - b.dueTs);

    // No due dates configured => nothing is overdue yet by due-date rule.
    if (!applicableFees.length) return 0;

    const nowTs = Date.now();
    let remainingPaid = Number(paidAmount || 0);
    let overdueAmount = 0;

    for (const feeItem of applicableFees) {
      const covered = Math.min(remainingPaid, feeItem.amount);
      const itemOutstanding = Math.max(0, feeItem.amount - covered);
      remainingPaid = Math.max(0, remainingPaid - covered);

      if (nowTs > feeItem.dueTs) {
        overdueAmount += itemOutstanding;
      }
    }

    // Safety cap: overdue can never exceed the student's outstanding balance.
    return Math.max(0, Math.min(overdueAmount, Math.max(0, expectedAmount - paidAmount)));
  }

  private async calculateTermOverdueByFeeDueDate(term: Term, schoolId?: string): Promise<number> {
    const statuses = await this.getTermStudentFeeStatuses(term.id, schoolId);
    if (!statuses.length) return 0;

    const feeStructures = await this.feeStructureRepo.find({
      where: {
        termId: term.id,
        isActive: true,
        isOptional: false,
        ...(schoolId ? { schoolId } : {}),
      },
    });

    const nowTs = Date.now();
    let totalOverdue = 0;

    for (const status of statuses) {
      const paidAmount = Number(status.paidAmount || 0);
      const outstandingAmount = Math.max(0, Number(status.outstandingAmount || 0));

      const applicableFees = feeStructures
        .filter((fs) => !fs.classId || (status.classId && fs.classId === status.classId))
        .filter((fs) => fs.dueDate)
        .map((fs) => {
          const due = new Date(fs.dueDate as any);
          due.setHours(23, 59, 59, 999);
          return { amount: Number(fs.amount || 0), dueTs: due.getTime() };
        })
        .filter((item) => item.amount > 0)
        .sort((a, b) => a.dueTs - b.dueTs);

      // No configured due dates => not overdue under due-date policy.
      if (!applicableFees.length) continue;

      let remainingPaid = paidAmount;
      for (const feeItem of applicableFees) {
        const covered = Math.min(remainingPaid, feeItem.amount);
        const itemOutstanding = Math.max(0, feeItem.amount - covered);
        remainingPaid = Math.max(0, remainingPaid - covered);

        if (nowTs > feeItem.dueTs) {
          totalOverdue += itemOutstanding;
        }
      }
    }

    return totalOverdue;
  }

  /**
   * Create a payment and allocate portions across terms in a single transaction.
   * Credits are created for any unallocated remainder.
   */
  async createPaymentWithAllocations(
    dto: CreatePaymentWithAllocationsDto,
    schoolId?: string
  ): Promise<{ payments: FeePayment[]; allocations: PaymentAllocation[]; credit?: { created: boolean; amount: number } }> {
    const queryRunner = this.paymentRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const student = await this.studentRepo.findOne({ where: { id: dto.studentId, ...(schoolId ? { schoolId } : {}) } });
      if (!student) throw new BadRequestException('Student not found');

      const paymentTerm = await this.termRepo.findOne({ where: { id: dto.termId }, relations: ['academicCalendar'] });
      if (!paymentTerm) throw new BadRequestException('Payment term not found');

      // Enforce enrollment/graduation term boundaries for any submitted allocations.
      // This prevents charging terms before student joined even if client payload is edited.
      const allTerms = await this.termRepo.find({
        where: { schoolId: student.schoolId },
        relations: ['academicCalendar'],
        order: { startDate: 'ASC' },
      });

      const orderedTerms = [...allTerms].sort((a, b) => {
        const aCalendarStart = a.academicCalendar?.startDate
          ? new Date(a.academicCalendar.startDate).getTime()
          : 0;
        const bCalendarStart = b.academicCalendar?.startDate
          ? new Date(b.academicCalendar.startDate).getTime()
          : 0;
        if (aCalendarStart !== bCalendarStart) return aCalendarStart - bCalendarStart;

        const aTermNum = Number(a.termNumber || 0);
        const bTermNum = Number(b.termNumber || 0);
        if (aTermNum !== bTermNum) return aTermNum - bTermNum;

        const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
        return aStart - bStart;
      });

      let eligibleTerms = orderedTerms;
      let enrollmentCutoffTermId = student.enrollmentTermId;
      if (!enrollmentCutoffTermId) {
        try {
          const earliestAcademicRecord = await this.studentRepo.query(
            `SELECT x."termId" FROM (
               SELECT e."termId"
               FROM enrollment e
               WHERE e."studentId"::uuid = $1
               ${schoolId ? 'AND e."schoolId"::uuid = $2' : ''}
               UNION
               SELECT sar."termId"
               FROM student_academic_records sar
               WHERE sar."studentId"::uuid = $1
               ${schoolId ? 'AND sar."schoolId"::uuid = $2' : ''}
               UNION
               SELECT sah.term_id as "termId"
               FROM student_academic_history sah
               WHERE sah.student_id::uuid = $1
               ${schoolId ? 'AND sah.school_id::uuid = $2' : ''}
             ) x
             INNER JOIN term t ON x."termId" = t.id
             LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
             ORDER BY COALESCE(ac."startDate", t."startDate", t."createdAt") ASC, t."termNumber" ASC
             LIMIT 1`,
            schoolId ? [student.id, schoolId] : [student.id],
          );

          if (earliestAcademicRecord?.length > 0 && earliestAcademicRecord[0]?.termId) {
            enrollmentCutoffTermId = earliestAcademicRecord[0].termId;
          }
        } catch (error) {
          this.logger.warn(`Failed to infer enrollment cutoff for student ${student.id}: ${error.message}`);
        }
      }
      if (enrollmentCutoffTermId) {
        const enrollmentIndex = eligibleTerms.findIndex((term) => term.id === enrollmentCutoffTermId);
        if (enrollmentIndex >= 0) {
          eligibleTerms = eligibleTerms.filter((_, index) => index >= enrollmentIndex);
        }
      }

      if (student.graduationTermId) {
        const graduationIndex = eligibleTerms.findIndex((term) => term.id === student.graduationTermId);
        if (graduationIndex >= 0) {
          eligibleTerms = eligibleTerms.filter((_, index) => index <= graduationIndex);
        }
      }

      const eligibleTermIds = new Set(eligibleTerms.map((term) => term.id));

      const totalAllocations = (dto.allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
      if (totalAllocations > Number(dto.amount)) {
        throw new BadRequestException('Allocations exceed payment amount');
      }

      // ── Trap the full cash amount in the dedicated `payments` table ──────────
      // One record per payment session regardless of how the money is allocated.
      const capturedPayment = this.paymentCaptureRepo.create({
        amount: Number(dto.amount),
        studentId: student.id,
        termId: paymentTerm.id,
        schoolId: schoolId || (student as any)?.schoolId || null,
        paymentMethod: (dto.paymentMethod || 'cash') as any,
        receiptNumber: dto.receiptNumber || null,
        paymentDate: new Date(dto.paymentDate),
        notes: dto.notes || null,
        status: 'completed',
        feePaymentId: null, // will be updated after first FeePayment is saved below
      });
      const savedCapture = await this.paymentCaptureRepo.save(capturedPayment);
      // ─────────────────────────────────────────────────────────────────────────

      // Create one FeePayment per allocation so each allocation has its own receipt/transaction entry
      const createdPayments: FeePayment[] = [];
      const allocations: PaymentAllocation[] = [];

      for (let i = 0; i < (dto.allocations || []).length; i++) {
        const a = dto.allocations![i];

        if (!eligibleTermIds.has(a.termId)) {
          throw new BadRequestException(
            `Allocation term ${a.termId} is outside the student's enrollment window`,
          );
        }

        const term = await queryRunner.manager.findOne(Term, { where: { id: a.termId }, relations: ['academicCalendar'] });
        if (!term) throw new BadRequestException(`Allocation term ${a.termId} not found`);

        const receiptForAlloc = dto.receiptNumber ? `${dto.receiptNumber}-${i + 1}` : null;

        const allocPayment = queryRunner.manager.create(FeePayment, {
          amount: Number(a.amount),
          receiptNumber: receiptForAlloc,
          paymentType: 'allocation',
          paymentMethod: (dto.paymentMethod || 'cash') as any,
          notes: dto.notes || a.notes || null,
          status: 'completed',
          paymentDate: new Date(dto.paymentDate),
          student: { id: student.id } as any,
          // Record the payment under the term where it was captured (paymentTerm)
          // so the receipt appears in the transaction history for the capture term,
          // even if the allocation applies to a different term.
          termId: paymentTerm.id,
          schoolId: schoolId || (student as any)?.schoolId || null,
          autoAllocateToCurrentTerm: false,
        });

        const savedAllocPayment = await queryRunner.manager.save(allocPayment);
        createdPayments.push(savedAllocPayment);

        // Link capture record to the first FeePayment for traceability
        if (createdPayments.length === 1 && savedCapture.feePaymentId === null) {
          await this.paymentCaptureRepo.update(savedCapture.id, { feePaymentId: savedAllocPayment.id });
        }

        const alloc = queryRunner.manager.create(PaymentAllocation, {
          schoolId: savedAllocPayment.schoolId as any,
          paymentId: savedAllocPayment.id,
          academicCalendarId: term.academicCalendar?.id,
          termId: term.id,
          allocatedAmount: Number(a.amount),
          allocationReason: a.reason,
          notes: a.notes,
          isAutoAllocation: false,
        });
        const savedAlloc = await queryRunner.manager.save(alloc);
        allocations.push(savedAlloc);
      }

      // If there is any remainder, create a credit PAYMENT (so it appears in transactions) and a CreditLedger entry
      let creditCreated = false;
      let creditAmount = 0;
      const totalAllocated = allocations.reduce((s, al) => s + Number(al.allocatedAmount || 0), 0);
      const remainder = Number(dto.amount) - totalAllocated;
      if (remainder > 0.009) {
        creditAmount = Number(remainder.toFixed(2));
        const receiptForCredit = dto.receiptNumber ? `${dto.receiptNumber}-CR` : null;
        const creditPayment = queryRunner.manager.create(FeePayment, {
          amount: creditAmount,
          receiptNumber: receiptForCredit,
          paymentType: 'credit_application',
          paymentMethod: (dto.paymentMethod || 'cash') as any,
          notes: dto.notes || `Surplus from allocations`,
          status: 'completed',
          paymentDate: new Date(dto.paymentDate),
          student: { id: student.id } as any,
          termId: paymentTerm.id,
          schoolId: schoolId || (student as any)?.schoolId || null,
          autoAllocateToCurrentTerm: false,
        });

        const savedCreditPayment = await queryRunner.manager.save(creditPayment);
        createdPayments.push(savedCreditPayment);

        const credit = queryRunner.manager.create(CreditLedger, {
          student: { id: student.id } as any,
          termId: paymentTerm.id,
          schoolId: savedCreditPayment.schoolId as any,
          sourcePayment: { id: savedCreditPayment.id } as any,
          amount: creditAmount as any,
          remainingAmount: creditAmount as any,
          status: 'active',
          notes: `Surplus from payment ${savedCreditPayment.id}`,
        });
        await queryRunner.manager.save(credit);
        creditCreated = true;
      }

      await queryRunner.commitTransaction();
      return { payments: createdPayments, allocations, credit: { created: creditCreated, amount: creditAmount } };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Aggregated totals for a term using strict term-based accounting:
   * - totalCollected: payments RECEIVED in this term (cashbook view)
   * - actualRevenue/totalPaid: allocations APPLIED to this term (term performance view)
   * - allocatedToPreviousTerms / allocatedToFutureTerms: where same-term collections were redirected
   * - credits: remaining active credit/unallocated from collections in this term
   */
  async getTermAggregatedTotals(termId: string, schoolId?: string): Promise<{
    totalCollected: number;
    totalPaid: number;
    pending: number;
    overdue: number;
    overdueFromPreviousTerms: number;
    credits: number;
    /** Raw cash physically collected in this term (from `payments` table). */
    actualRevenue: number;
    /** Portion of collected cash applied to THIS term's expected fees (allocation-based). */
    termFeesApplied: number;
    allocatedToPreviousTerms: number;
    allocatedToFutureTerms: number;
  }> {
    const term = await this.termRepo.findOne({ where: { id: termId } });
    if (!term) throw new BadRequestException('Term not found');

    // 1) Cash PHYSICALLY RECEIVED in this term (from the dedicated `payments` table)
    const cashCollectedRow = await this.paymentCaptureRepo
      .createQueryBuilder('pm')
      .select('COALESCE(SUM(pm.amount), 0)', 'sum')
      .where('pm.termId = :termId', { termId })
      .andWhere('pm.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'pm.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getRawOne();
    const actualRevenue = parseFloat(cashCollectedRow?.sum || '0');

    // 2) Portion of payments APPLIED to this term via allocations (term fees paid)
    const termFeesAppliedRow = await this.allocationRepo
      .createQueryBuilder('pa')
      .innerJoin('pa.payment', 'p')
      .select('COALESCE(SUM(pa.allocatedAmount), 0)', 'sum')
      .where('pa.termId = :termId', { termId })
      .andWhere('p.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'pa.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getRawOne();
    const termFeesApplied = parseFloat(termFeesAppliedRow?.sum || '0');

    // 3) Expected/pending for selected term — Pending = Expected - termFeesApplied
    let pending = 0;
    try {
      const statuses = await this.getTermStudentFeeStatuses(termId, schoolId);
      const expected = statuses.reduce((s, st) => s + Number(st.expectedAmount || 0), 0);
      pending = Math.max(0, expected - termFeesApplied);
    } catch {
      pending = 0;
    }

    // Backward-compatible overdue: only selected-term overdue after term end.
    const overdue = await this.calculateTermOverdueByFeeDueDate(term, schoolId);

    // 4) Money RECEIVED in this term (from fee_payment table — for allocation breakdown)
    const paymentsInTerm = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: 'completed' })
      .andWhere('p.termId = :termId', { termId })
      .andWhere(schoolId ? 'p.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getMany();

    const totalCollected = actualRevenue; // same value - cash physically collected in term
    const paymentIds = paymentsInTerm.map((p) => p.id);

    // 4) Track how same-term collections were allocated (current vs previous vs future terms)
    let allocatedToPreviousTerms = 0;
    let allocatedToFutureTerms = 0;
    let totalAllocatedFromCollectedPayments = 0;

    if (paymentIds.length > 0) {
      const allocationsFromCollected = await this.allocationRepo
        .createQueryBuilder('pa')
        .leftJoinAndSelect('pa.term', 'allocTerm')
        .where('pa.paymentId IN (:...paymentIds)', { paymentIds })
        .getMany();

      for (const allocation of allocationsFromCollected) {
        const amount = Number(allocation.allocatedAmount || 0);
        totalAllocatedFromCollectedPayments += amount;

        if (allocation.termId === termId) continue;

        const allocTermStart = allocation.term?.startDate ? new Date(allocation.term.startDate) : null;
        if (allocTermStart && allocTermStart < new Date(term.startDate)) {
          allocatedToPreviousTerms += amount;
        } else {
          allocatedToFutureTerms += amount;
        }
      }
    }

    // 5) Credits/unallocated - Get ALL available credits (not just current term)
    // This ensures we show all overpayments that can be used
    const allActiveCreditsRow = await this.creditRepo
      .createQueryBuilder('cl')
      .select('COALESCE(SUM(cl.remainingAmount), 0)', 'sum')
      .where('cl.status = :status', { status: 'active' })
      .andWhere(schoolId ? 'cl.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getRawOne();
    const credits = parseFloat(allActiveCreditsRow?.sum || '0');

    // 6) Overdue across all terms (school-wide, active students only).
    // A term is overdue when now > configured fee due date (if present), else now > term end date.
    let overdueFromPreviousTerms = 0;
    try {
      const allTerms = await this.termRepo
        .createQueryBuilder('t')
        .andWhere(schoolId ? 't.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .getMany();

      for (const scopedTerm of allTerms) {
        try {
          const termOutstanding = await this.calculateTermOverdueByFeeDueDate(scopedTerm, schoolId);
          overdueFromPreviousTerms += termOutstanding;
        } catch (err) {
          this.logger.warn(`Failed to calculate overdue outstanding for term ${scopedTerm.id}: ${err.message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Unable to load overdue totals across terms for term ${termId}: ${error.message}`);
    }

    // totalPaid retained for compatibility with existing frontend expectations.
    const totalPaid = termFeesApplied;
    return {
      totalCollected,
      totalPaid,
      pending,
      overdue,
      overdueFromPreviousTerms,
      credits,
      actualRevenue,
      termFeesApplied,
      allocatedToPreviousTerms,
      allocatedToFutureTerms,
    };
  }
}
