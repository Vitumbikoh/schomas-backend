import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { StudentAcademicRecord, StudentStatus } from '../entities/student-academic-record.entity';
import { ExpectedFee, FeeCategory } from '../entities/expected-fee.entity';
import { PaymentAllocation, AllocationReason } from '../entities/payment-allocation.entity';
import { Term } from '../../settings/entities/term.entity';
import { AcademicCalendar } from '../../settings/entities/academic-calendar.entity';

export interface CarryForwardBalance {
  studentId: string;
  originalTermId: string;
  targetTermId: string;
  outstandingAmount: number;
  reason: string;
}

export interface CarryForwardSummary {
  totalStudents: number;
  totalAmountCarriedForward: number;
  balances: CarryForwardBalance[];
  createdFeeRecords: number;
}

/**
 * Service responsible for carrying forward outstanding balances from one term to the next.
 * This maintains financial integrity while allowing debt settlement across terms.
 */
@Injectable()
export class CarryForwardService {
  private readonly logger = new Logger(CarryForwardService.name);

  constructor(
    @InjectRepository(StudentAcademicRecord)
    private academicRecordRepo: Repository<StudentAcademicRecord>,
    @InjectRepository(ExpectedFee)
    private expectedFeeRepo: Repository<ExpectedFee>,
    @InjectRepository(PaymentAllocation)
    private allocationRepo: Repository<PaymentAllocation>,
    @InjectRepository(Term)
    private termRepo: Repository<Term>,
  ) {}

  /**
   * Calculate outstanding balances for students in a completed term
   */
  async calculateOutstandingBalances(
    termId: string, 
    schoolId?: string
  ): Promise<CarryForwardBalance[]> {
    this.logger.log(`Calculating outstanding balances for term ${termId}`);

    // Get all academic records for the term
    const academicRecords = await this.academicRecordRepo.find({
      where: { 
        termId, 
        status: StudentStatus.ACTIVE,
        ...(schoolId && { schoolId })
      },
      relations: ['student', 'term', 'academicCalendar']
    });

    const balances: CarryForwardBalance[] = [];

    for (const record of academicRecords) {
      const balance = await this.calculateStudentOutstanding(
        record.studentId,
        termId,
        schoolId
      );

      if (balance.outstandingAmount > 0) {
        balances.push({
          studentId: record.studentId,
          originalTermId: termId,
          targetTermId: '', // To be set by caller
          outstandingAmount: balance.outstandingAmount,
          reason: `Outstanding balance from ${record.term.termNumber} - ${record.academicCalendar.term}`
        });
      }
    }

    this.logger.log(`Found ${balances.length} students with outstanding balances`);
    return balances;
  }

  /**
   * Calculate outstanding balance for a specific student in a term
   */
  async calculateStudentOutstanding(
    studentId: string, 
    termId: string, 
    schoolId?: string
  ): Promise<{ expectedAmount: number; paidAmount: number; outstandingAmount: number }> {
    
    // Get expected fees for student in this term
    const expectedFees = await this.expectedFeeRepo
      .createQueryBuilder('ef')
      .innerJoin('ef.term', 't')
      .innerJoin('student_academic_records', 'sar', 'sar.termId = ef.termId AND sar.studentId = :studentId')
      .leftJoin('ef.class', 'c')
      .where('ef.termId = :termId', { termId })
      .andWhere('ef.isActive = true')
      .andWhere('sar.studentId = :studentId', { studentId })
      .andWhere('(ef.classId IS NULL OR ef.classId = sar.classId)')
      .andWhere(schoolId ? 'ef.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getMany();

    const expectedAmount = expectedFees
      .filter(fee => !fee.isOptional)
      .reduce((sum, fee) => sum + Number(fee.amount), 0);

    // Get allocated payments for this student in this term
    const allocations = await this.allocationRepo
      .createQueryBuilder('pa')
      .innerJoin('pa.payment', 'p')
      .where('pa.termId = :termId', { termId })
      .andWhere('p.studentId = :studentId', { studentId })
      .andWhere('p.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'pa.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .getMany();

    const paidAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    const outstandingAmount = Math.max(0, expectedAmount - paidAmount);

    return { expectedAmount, paidAmount, outstandingAmount };
  }

  /**
   * Carry forward outstanding balances from one term to the next
   */
  async carryForwardBalances(
    fromTermId: string,
    toTermId: string,
    schoolId?: string,
    queryRunner?: QueryRunner
  ): Promise<CarryForwardSummary> {
    this.logger.log(`Carrying forward balances from ${fromTermId} to ${toTermId}`);

    const shouldManageTransaction = !queryRunner;
    if (shouldManageTransaction) {
      queryRunner = this.expectedFeeRepo.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Calculate outstanding balances
      const outstandingBalances = await this.calculateOutstandingBalances(fromTermId, schoolId);
      
      // Get target term details
      const targetTerm = await this.termRepo.findOne({
        where: { id: toTermId },
        relations: ['academicCalendar']
      });

      if (!targetTerm) {
        throw new Error(`Target term ${toTermId} not found`);
      }

      let createdFeeRecords = 0;
      const carriedBalances: CarryForwardBalance[] = [];

      for (const balance of outstandingBalances) {
        // Create carry-forward fee record in target term
        const carryForwardFee = this.expectedFeeRepo.create({
          schoolId: schoolId || balance.studentId, // Fallback, should be properly set
          academicCalendarId: targetTerm.academicCalendar?.id,
          termId: toTermId,
          classId: null, // Carry-forward fees apply to student regardless of class
          feeCategory: FeeCategory.CARRY_FORWARD,
          description: `Carried forward from previous term - ${balance.reason}`,
          amount: balance.outstandingAmount,
          isOptional: false,
          isActive: true,
          originalTermId: fromTermId,
          carryForwardReason: balance.reason,
          frequency: 'once',
          applicableInstances: 1,
          isCarryForward: true,
          isSystemGenerated: true
        });

        await queryRunner!.manager.save(carryForwardFee);
        createdFeeRecords++;

        carriedBalances.push({
          ...balance,
          targetTermId: toTermId
        });
      }

      if (shouldManageTransaction) {
        await queryRunner!.commitTransaction();
      }

      const summary: CarryForwardSummary = {
        totalStudents: carriedBalances.length,
        totalAmountCarriedForward: carriedBalances.reduce((sum, b) => sum + b.outstandingAmount, 0),
        balances: carriedBalances,
        createdFeeRecords
      };

      this.logger.log(`Carry-forward completed: ${summary.totalStudents} students, ${summary.totalAmountCarriedForward} total amount`);
      return summary;

    } catch (error) {
      if (shouldManageTransaction) {
        await queryRunner!.rollbackTransaction();
      }
      this.logger.error(`Carry-forward failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        await queryRunner!.release();
      }
    }
  }

  /**
   * Get carry-forward history for a student
   */
  async getStudentCarryForwardHistory(
    studentId: string,
    schoolId?: string
  ): Promise<ExpectedFee[]> {
    return this.expectedFeeRepo.find({
      where: {
        isCarryForward: true,
        ...(schoolId && { schoolId })
      },
      relations: ['term', 'originalTerm', 'academicCalendar'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Reverse carry-forward (if needed for corrections)
   */
  async reverseCarryForward(
    termId: string,
    studentId?: string,
    schoolId?: string
  ): Promise<{ removedFees: number; totalAmount: number }> {
    this.logger.warn(`Reversing carry-forward for term ${termId}${studentId ? ` student ${studentId}` : ''}`);

    const conditions: any = {
      termId,
      isCarryForward: true,
      isSystemGenerated: true,
      ...(studentId && { studentId }),
      ...(schoolId && { schoolId })
    };

    const feesToRemove = await this.expectedFeeRepo.find({ where: conditions });
    const totalAmount = feesToRemove.reduce((sum, fee) => sum + Number(fee.amount), 0);
    
    await this.expectedFeeRepo.remove(feesToRemove);

    this.logger.log(`Reversed ${feesToRemove.length} carry-forward fees totaling ${totalAmount}`);
    return { removedFees: feesToRemove.length, totalAmount };
  }
}