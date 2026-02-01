import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { PaymentAllocation, AllocationReason } from '../entities/payment-allocation.entity';
import { FeePayment } from '../entities/fee-payment.entity';
import { Term } from '../../settings/entities/term.entity';
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
          academicCalendarId: term.academicCalendarId,
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