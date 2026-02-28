import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { PaymentAllocation, AllocationReason } from '../entities/payment-allocation.entity';
import { FeePayment } from '../entities/fee-payment.entity';
import { Term } from '../../settings/entities/term.entity';
import { Student } from '../../user/entities/student.entity';
import { EnhancedFinanceService } from './enhanced-finance.service';

export interface AllocationRequest {
  paymentId: string;
  termId: string;
  amount: number;
  reason: AllocationReason;
  notes?: string;
  allocatedByUserId?: string;
}

export interface AllocationSuggestion {
  termId: string;
  termName: string;
  suggestedAmount: number;
  reason: AllocationReason;
  priority: number; // 1 = highest priority
  description: string;
}

/**
 * Service for managing payment allocations to specific terms.
 * Handles intelligent allocation suggestions and manual allocations.
 */
@Injectable()
export class PaymentAllocationService {
  private readonly logger = new Logger(PaymentAllocationService.name);

  constructor(
    @InjectRepository(PaymentAllocation)
    private allocationRepo: Repository<PaymentAllocation>,
    @InjectRepository(FeePayment)
    private paymentRepo: Repository<FeePayment>,
    @InjectRepository(Term)
    private termRepo: Repository<Term>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    private financeService: EnhancedFinanceService,
  ) {}

  /**
   * Create payment allocations based on requests
   */
  async createAllocations(
    requests: AllocationRequest[],
    queryRunner?: QueryRunner
  ): Promise<PaymentAllocation[]> {
    const shouldManageTransaction = !queryRunner;
    if (shouldManageTransaction) {
      queryRunner = this.allocationRepo.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      const allocations: PaymentAllocation[] = [];
      const eligibilityCache = new Map<string, Set<string>>();

      for (const request of requests) {
        // Validate payment exists and get details
        const payment = await queryRunner!.manager.findOne(FeePayment, {
          where: { id: request.paymentId },
          relations: ['student']
        });

        if (!payment) {
          throw new BadRequestException(`Payment ${request.paymentId} not found`);
        }

        // Validate term exists
        const term = await queryRunner!.manager.findOne(Term, {
          where: { id: request.termId },
          relations: ['academicCalendar']
        });

        if (!term) {
          throw new BadRequestException(`Term ${request.termId} not found`);
        }

        // Enforce enrollment/graduation term boundaries for any manual/auto allocation writes
        let allowedTermIds = eligibilityCache.get(payment.studentId);
        if (!allowedTermIds) {
          const studentWithBoundaries = await this.studentRepo.findOne({
            where: { id: payment.studentId },
          });
          if (!studentWithBoundaries) {
            throw new BadRequestException(`Student ${payment.studentId} not found`);
          }

          const eligibleTerms = await this.resolveEligibleTermsForStudent(
            studentWithBoundaries,
            payment.schoolId,
            payment.termId,
          );
          allowedTermIds = new Set(eligibleTerms.map((t) => t.id));
          eligibilityCache.set(payment.studentId, allowedTermIds);
        }

        if (!allowedTermIds.has(request.termId)) {
          throw new BadRequestException(
            `Allocation term ${request.termId} is outside the student's enrollment window`,
          );
        }

        // Check if allocation would exceed payment amount
        const existingAllocations = await queryRunner!.manager.find(PaymentAllocation, {
          where: { paymentId: request.paymentId }
        });

        const totalExistingAllocated = existingAllocations.reduce(
          (sum, alloc) => sum + Number(alloc.allocatedAmount), 0
        );

        const totalNewAllocated = requests
          .filter(r => r.paymentId === request.paymentId)
          .reduce((sum, r) => sum + r.amount, 0);

        if (totalExistingAllocated + totalNewAllocated > Number(payment.amount)) {
          throw new BadRequestException(
            `Total allocations (${totalExistingAllocated + totalNewAllocated}) exceed payment amount (${payment.amount})`
          );
        }

        // Create allocation
        const allocation = queryRunner!.manager.create(PaymentAllocation, {
          schoolId: payment.schoolId,
          paymentId: request.paymentId,
          academicCalendarId: term.academicCalendar?.id,
          termId: request.termId,
          allocatedAmount: request.amount,
          allocationReason: request.reason,
          notes: request.notes,
          allocatedByUserId: request.allocatedByUserId,
          isAutoAllocation: !request.allocatedByUserId
        });

        const savedAllocation = await queryRunner!.manager.save(allocation);
        allocations.push(savedAllocation);

        this.logger.log(`Created allocation: ${request.amount} from payment ${request.paymentId} to term ${request.termId}`);
      }

      // Update payment allocation summary
      await this.updatePaymentAllocationSummary(
        requests.map(r => r.paymentId),
        queryRunner!
      );

      if (shouldManageTransaction) {
        await queryRunner!.commitTransaction();
      }

      return allocations;

    } catch (error) {
      if (shouldManageTransaction) {
        await queryRunner!.rollbackTransaction();
      }
      this.logger.error(`Failed to create allocations: ${error.message}`, error.stack);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        await queryRunner!.release();
      }
    }
  }

  /**
   * Get intelligent allocation suggestions for a payment
   */
  async getAllocationSuggestions(paymentId: string): Promise<AllocationSuggestion[]> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['student', 'term']
    });

    if (!payment) {
      throw new BadRequestException(`Payment ${paymentId} not found`);
    }

    // Get existing allocations
    const existingAllocations = await this.allocationRepo.find({
      where: { paymentId },
      relations: ['term']
    });

    const totalAllocated = existingAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.allocatedAmount), 0
    );

    const remainingAmount = Number(payment.amount) - totalAllocated;

    if (remainingAmount <= 0) {
      return []; // Payment fully allocated
    }

    const suggestions: AllocationSuggestion[] = [];
    
    // Get student's academic history to suggest allocation priorities
    const academicRecords = await this.financeService['academicRecordRepo'].find({
      where: { 
        studentId: payment.studentId,
        schoolId: payment.schoolId
      },
      relations: ['term', 'academicCalendar'],
      order: { term: { startDate: 'ASC' } }
    });

    let priority = 1;

    // Priority 1: Outstanding balances from previous terms (oldest first)
    for (const record of academicRecords) {
      const termEndDate = new Date(record.term.endDate);
      const isTermCompleted = new Date() > termEndDate;

      if (isTermCompleted && record.term.id !== payment.termId) {
        try {
          const status = await this.financeService.getStudentFeeStatus(
            payment.studentId,
            record.termId,
            payment.schoolId
          );

          if (status.outstandingAmount > 0) {
            const suggestedAmount = Math.min(remainingAmount, status.outstandingAmount);
            
            suggestions.push({
              termId: record.termId,
              termName: `Term ${record.term.termNumber} (${record.academicCalendar.term})`,
              suggestedAmount,
              reason: AllocationReason.HISTORICAL_SETTLEMENT,
              priority: priority++,
              description: `Overdue balance from ${record.academicCalendar.term}`
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to get status for historical term ${record.termId}: ${error.message}`);
        }
      }
    }

    // Priority 2: Current term (term when payment was made)
    try {
      const currentTermStatus = await this.financeService.getStudentFeeStatus(
        payment.studentId,
        payment.termId,
        payment.schoolId
      );

      if (currentTermStatus.outstandingAmount > 0) {
        const suggestedAmount = Math.min(remainingAmount, currentTermStatus.outstandingAmount);
        
        suggestions.push({
          termId: payment.termId,
          termName: `Term ${currentTermStatus.termId} (Current)`,
          suggestedAmount,
          reason: AllocationReason.TERM_FEES,
          priority: priority++,
          description: 'Current term fees'
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to get current term status: ${error.message}`);
    }

    // Priority 3: Future terms (if there's still remaining amount)
    // This is typically for advance payments

    return suggestions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get all terms where student has outstanding fees (for pre-allocation planning)
   * Returns terms sorted by priority: previous terms first (oldest to newest), then current term
   */
  async getStudentOutstandingTerms(
    studentId: string,
    currentTermId?: string,
    schoolId?: string
  ): Promise<Array<{
    termId: string;
    termName: string;
    termNumber: number;
    expectedAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    reason: AllocationReason;
    priority: number;
    isPreviousTerm: boolean;
    isCurrentTerm: boolean;
  }>> {
    this.logger.log(`=== Getting outstanding terms for student ${studentId} ===`);
    this.logger.log(`Parameters: currentTermId=${currentTermId}, schoolId=${schoolId}`);

    // Get student with relations
    const student = await this.studentRepo.findOne({
      where: { 
        id: studentId,
        ...(schoolId && { schoolId })
      },
      relations: ['enrollmentTerm', 'enrollmentTerm.academicCalendar', 'graduationTerm']
    });

    if (!student) {
      this.logger.warn(`Student ${studentId} not found`);
      return [];
    }

    this.logger.log(`Found student: ${student.id}, schoolId=${student.schoolId}, enrollmentTermId=${student.enrollmentTermId}`);

    const allTerms = await this.getOrderedTermsForSchool(student.schoolId);

    if (allTerms.length === 0) {
      this.logger.warn(`No terms found for school ${student.schoolId}`);
      return [];
    }

    this.logger.log(`Found ${allTerms.length} total terms for school ${student.schoolId}`);

    const applicableTerms = await this.resolveEligibleTermsForStudent(
      student,
      student.schoolId,
      currentTermId,
      allTerms,
    );

    this.logger.log(`Using ${applicableTerms.length} eligible term(s) after enrollment/graduation boundary checks`);

    const outstandingTerms = [];
    let priority = 1;

    this.logger.log(`Processing ${applicableTerms.length} applicable terms...`);

    // Process each applicable term
    for (const term of applicableTerms) {
      this.logger.log(`\n--- Processing term ${term.id} (Term ${term.termNumber}, ${term.academicCalendar?.term || 'N/A'}) ---`);
      try {
        const status = await this.financeService.getStudentFeeStatus(
          studentId,
          term.id,
          schoolId
        );

        const outstandingAmount = Number(status.outstandingAmount || 0);
        
        this.logger.log(`Fee Status: Expected=${status.expectedAmount}, Paid=${status.paidAmount}, Outstanding=${outstandingAmount}`);
        this.logger.log(`Status object: ${JSON.stringify(status)}`);
        
        // Only include terms with outstanding balances
        if (outstandingAmount > 0) {
          this.logger.log(`✓ Term ${term.termNumber} has outstanding balance, adding to results`);
          const termEndDate = new Date(term.endDate);
          const isTermCompleted = new Date() > termEndDate;
          const isCurrentTerm = term.id === currentTermId;
          const isPreviousTerm = isTermCompleted && !isCurrentTerm;

          // Determine allocation reason
          let reason: AllocationReason;
          if (isPreviousTerm) {
            reason = AllocationReason.HISTORICAL_SETTLEMENT;
          } else if (isCurrentTerm) {
            reason = AllocationReason.TERM_FEES;
          } else {
            reason = AllocationReason.ADVANCE_PAYMENT;
          }

          outstandingTerms.push({
            termId: term.id,
            termName: `${term.academicCalendar.term} - Term ${term.termNumber}`,
            termNumber: term.termNumber,
            expectedAmount: Number(status.expectedAmount || 0),
            paidAmount: Number(status.paidAmount || 0),
            outstandingAmount,
            reason,
            priority: priority++,
            isPreviousTerm,
            isCurrentTerm
          });
        } else {
          this.logger.log(`✗ Term ${term.termNumber} has no outstanding balance (outstanding=${outstandingAmount}), skipping`);
        }
      } catch (error) {
        this.logger.error(`Failed to get fee status for term ${term.id}: ${error.message}`, error.stack);
      }
    }

    // Sort: previous terms first (oldest to newest), then current term
    outstandingTerms.sort((a, b) => {
      if (a.isPreviousTerm && !b.isPreviousTerm) return -1;
      if (!a.isPreviousTerm && b.isPreviousTerm) return 1;
      if (a.isCurrentTerm && !b.isCurrentTerm) return 1;
      if (!a.isCurrentTerm && b.isCurrentTerm) return -1;
      return a.termNumber - b.termNumber;
    });

    // Update priorities after sorting
    outstandingTerms.forEach((term, index) => {
      term.priority = index + 1;
    });

    this.logger.log(`Found ${outstandingTerms.length} terms with outstanding balances for student ${studentId}`);
    outstandingTerms.forEach(term => {
      this.logger.log(`  - ${term.termName}: Outstanding MK ${term.outstandingAmount.toLocaleString()}`);
    });
    
    return outstandingTerms;
  }

  private async getOrderedTermsForSchool(schoolId: string): Promise<Term[]> {
    const allTerms = await this.termRepo.find({
      where: { schoolId },
      relations: ['academicCalendar'],
      order: { startDate: 'ASC' },
    });

    return [...allTerms].sort((a, b) => {
      const aCalendarStart = a.academicCalendar?.startDate
        ? new Date(a.academicCalendar.startDate).getTime()
        : 0;
      const bCalendarStart = b.academicCalendar?.startDate
        ? new Date(b.academicCalendar.startDate).getTime()
        : 0;

      if (aCalendarStart !== bCalendarStart) {
        return aCalendarStart - bCalendarStart;
      }

      const aTermNum = Number(a.termNumber || 0);
      const bTermNum = Number(b.termNumber || 0);
      if (aTermNum !== bTermNum) {
        return aTermNum - bTermNum;
      }

      const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aStart - bStart;
    });
  }

  private async resolveEligibleTermsForStudent(
    student: Student,
    schoolId?: string,
    currentTermId?: string,
    preloadedTerms?: Term[],
  ): Promise<Term[]> {
    const terms = preloadedTerms || await this.getOrderedTermsForSchool(student.schoolId);
    if (terms.length === 0) {
      return [];
    }

    let filtered = terms;
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
      const enrollmentTermIndex = filtered.findIndex((term) => term.id === enrollmentCutoffTermId);
      if (enrollmentTermIndex >= 0) {
        filtered = filtered.filter((_, index) => index >= enrollmentTermIndex);
      }
    }

    if (student.graduationTermId) {
      const graduationTermIndex = filtered.findIndex((term) => term.id === student.graduationTermId);
      if (graduationTermIndex >= 0) {
        filtered = filtered.filter((_, index) => index <= graduationTermIndex);
      }
    }

    if (!student.enrollmentTermId && !enrollmentCutoffTermId) {
      this.logger.warn(
        `Student ${student.id} has no enrollmentTermId and no inferred enrollment term. Using all terms.`,
      );
    }

    if (schoolId && student.schoolId !== schoolId) {
      this.logger.warn(`Student ${student.id} school mismatch: student.schoolId=${student.schoolId}, request.schoolId=${schoolId}`);
    }

    return filtered;
  }

  /**
   * Auto-allocate payment using intelligent suggestions
   */
  async autoAllocatePayment(paymentId: string): Promise<PaymentAllocation[]> {
    this.logger.log(`Auto-allocating payment ${paymentId}`);

    const suggestions = await this.getAllocationSuggestions(paymentId);
    
    if (suggestions.length === 0) {
      this.logger.log(`No allocation suggestions for payment ${paymentId}`);
      return [];
    }

    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId }
    });

    if (!payment) {
      throw new BadRequestException(`Payment ${paymentId} not found`);
    }

    const existingAllocations = await this.allocationRepo.find({
      where: { paymentId }
    });

    const totalAllocated = existingAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.allocatedAmount), 0
    );

    let remainingAmount = Number(payment.amount) - totalAllocated;
    const allocationRequests: AllocationRequest[] = [];

    // Allocate to suggestions in priority order
    for (const suggestion of suggestions) {
      if (remainingAmount <= 0) break;

      const amountToAllocate = Math.min(remainingAmount, suggestion.suggestedAmount);

      allocationRequests.push({
        paymentId,
        termId: suggestion.termId,
        amount: amountToAllocate,
        reason: suggestion.reason,
        notes: `Auto-allocated: ${suggestion.description}`
      });

      remainingAmount -= amountToAllocate;
    }

    if (allocationRequests.length === 0) {
      this.logger.log(`No allocations needed for payment ${paymentId}`);
      return [];
    }

    const allocations = await this.createAllocations(allocationRequests);
    this.logger.log(`Auto-allocated payment ${paymentId} across ${allocations.length} terms`);
    
    return allocations;
  }

  /**
   * Remove allocation (for corrections)
   */
  async removeAllocation(allocationId: string): Promise<void> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId }
    });

    if (!allocation) {
      throw new BadRequestException(`Allocation ${allocationId} not found`);
    }

    await this.allocationRepo.remove(allocation);
    
    // Update payment summary
    await this.updatePaymentAllocationSummary([allocation.paymentId]);
    
    this.logger.log(`Removed allocation ${allocationId}`);
  }

  /**
   * Update payment's allocation summary fields
   */
  private async updatePaymentAllocationSummary(
    paymentIds: string[],
    queryRunner?: QueryRunner
  ): Promise<void> {
    const repo = queryRunner ? queryRunner.manager.getRepository(FeePayment) : this.paymentRepo;
    const allocationRepo = queryRunner ? queryRunner.manager.getRepository(PaymentAllocation) : this.allocationRepo;

    for (const paymentId of paymentIds) {
      const allocations = await allocationRepo.find({
        where: { paymentId }
      });

      const totalAllocated = allocations.reduce(
        (sum, alloc) => sum + Number(alloc.allocatedAmount), 0
      );

      const payment = await repo.findOne({ where: { id: paymentId } });
      if (payment) {
        payment.totalAllocated = totalAllocated;
        payment.isFullyAllocated = totalAllocated >= Number(payment.amount);
        await repo.save(payment);
      }
    }
  }

  /**
   * Get all allocations for a payment
   */
  async getPaymentAllocations(paymentId: string): Promise<PaymentAllocation[]> {
    return this.allocationRepo.find({
      where: { paymentId },
      relations: ['term', 'academicCalendar', 'allocatedBy'],
      order: { allocatedAt: 'DESC' }
    });
  }

  /**
   * Get all allocations for a term
   */
  async getTermAllocations(termId: string, schoolId?: string): Promise<PaymentAllocation[]> {
    return this.allocationRepo.find({
      where: { 
        termId,
        ...(schoolId && { schoolId })
      },
      relations: ['payment', 'payment.student', 'allocatedBy'],
      order: { allocatedAt: 'DESC' }
    });
  }
}