import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In, Brackets, ILike } from 'typeorm';
import { Finance } from '../user/entities/finance.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { Budget } from './entities/budget.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Class } from '../classes/entity/class.entity';
import { ProcessPaymentDto } from './dtos/process-payment.dto';
import { ApproveBudgetDto } from './dtos/approve-budget.dto';
import { Role } from 'src/user/enums/role.enum';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { CreateFinanceDto } from 'src/user/dtos/create-finance.dto';
import * as bcrypt from 'bcrypt';
import { SettingsService } from 'src/settings/settings.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { Expense } from '../expenses/entities/expense.entity';
import { CreditLedger } from './entities/credit-ledger.entity';
import { StudentFeeExpectationService } from './student-fee-expectation.service';
import { Term } from '../settings/entities/term.entity';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Payment } from './entities/payment.entity';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Finance)
    private readonly financeRepository: Repository<Finance>,
    @InjectRepository(FeePayment)
    private readonly paymentRepository: Repository<FeePayment>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(FeeStructure)
    private readonly feeStructureRepository: Repository<FeeStructure>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  @InjectRepository(Expense)
  private readonly expenseRepository: Repository<Expense>,
  @InjectRepository(CreditLedger)
  private readonly creditRepository: Repository<CreditLedger>,
    private settingsService: SettingsService,
    private systemLoggingService: SystemLoggingService,
    private studentFeeExpectationService: StudentFeeExpectationService,
    @InjectRepository(Term)
    private readonly termRepository: Repository<Term>,
    @InjectRepository(AcademicCalendar)
    private readonly academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(PaymentAllocation)
    private readonly paymentAllocationRepository: Repository<PaymentAllocation>,
    @InjectRepository(Payment)
    private readonly paymentCaptureRepository: Repository<Payment>,
  ) {}
  /**
   * Monthly revenue trends for the last N months (defaults to 6)
   */
  async getRevenueTrends(schoolId?: string, superAdmin: boolean = false, months: number = 6): Promise<Array<{ month: string; total: number }>> {
    const qb = this.paymentRepository.createQueryBuilder('p')
      .select("to_char(date_trunc('month', p.paymentDate), 'YYYY-MM')", 'month')
      .addSelect('SUM(p.amount)', 'total')
      .where('p.status = :status', { status: 'completed' })
      .andWhere("p.paymentDate >= NOW() - INTERVAL :months", { months: `${months} months` })
      .groupBy("date_trunc('month', p.paymentDate)")
      .orderBy("date_trunc('month', p.paymentDate)", 'ASC');

    if (schoolId && !superAdmin) {
      qb.andWhere('p.schoolId = :schoolId', { schoolId });
    }

    const rows = await qb.getRawMany();
    return rows.map(r => ({ month: r.month, total: Number(r.total || 0) }));
  }

  /**
   * Monthly expense trends for the last N months (defaults to 6)
   */
  async getExpenseTrends(schoolId?: string, superAdmin: boolean = false, months: number = 6): Promise<Array<{ month: string; total: number }>> {
    const qb = this.expenseRepository.createQueryBuilder('e')
      .select("to_char(date_trunc('month', COALESCE(e.paidDate, e.approvedDate, e.requestDate)), 'YYYY-MM')", 'month')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.status = :status', { status: 'Paid' })
      .andWhere("COALESCE(e.paidDate, e.approvedDate, e.requestDate) >= NOW() - INTERVAL :months", { months: `${months} months` })
      .groupBy("date_trunc('month', COALESCE(e.paidDate, e.approvedDate, e.requestDate))")
      .orderBy("date_trunc('month', COALESCE(e.paidDate, e.approvedDate, e.requestDate))", 'ASC');

    if (schoolId && !superAdmin) {
      qb.andWhere('e.schoolId = :schoolId', { schoolId });
    }

    const rows = await qb.getRawMany();
    return rows.map(r => ({ month: r.month, total: Number(r.total || 0) }));
  }

  /**
   * Total expenses within a term date range (Paid expenses)
   */
  async getTermExpensesTotal(termId: string, schoolId?: string, superAdmin: boolean = false): Promise<{ termId: string; total: number }> {
    const term = await this.termRepository.findOne({ where: { id: termId } });
    if (!term) throw new NotFoundException('Term not found');

    const qb = this.expenseRepository.createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'total')
      .where('e.status = :paid', { paid: 'Paid' })
      .andWhere('COALESCE(e.paidDate, e.approvedDate, e.requestDate) BETWEEN :start AND :end', {
        start: term.startDate,
        end: term.endDate,
      });

    if (schoolId && !superAdmin) {
      qb.andWhere('e.schoolId = :schoolId', { schoolId });
    }

    const row = await qb.getRawOne();
    return { termId, total: Number(row?.total || 0) };
  }

  /**
   * Auto-allocate a payment to fee structures
   * This ensures all payments are properly allocated to fee types for accurate reporting
   */
  private async autoAllocatePayment(
    paymentId: string,
    studentId: string,
    termId: string,
    schoolId: string,
    paymentAmount: number,
    paymentType?: string
  ): Promise<void> {
    try {
      // Get term and academic calendar
      const term = await this.termRepository.findOne({
        where: { id: termId },
        relations: ['academicCalendar']
      });

      if (!term) {
        console.warn(`Term ${termId} not found for auto-allocation`);
        return;
      }

      // Get fee structures for this term
      const feeStructures = await this.feeStructureRepository.find({
        where: {
          termId,
          isActive: true,
          isOptional: false,
          ...(schoolId ? { schoolId } : {})
        },
        order: { amount: 'DESC' } // Allocate to larger fees first
      });

      if (feeStructures.length === 0) {
        console.warn(`No fee structures found for term ${termId}`);
        // Create a single allocation for the full amount as "Unallocated"
        await this.paymentAllocationRepository.save({
          paymentId,
          schoolId,
          termId,
          academicCalendarId: term.academicCalendar?.id,
          allocatedAmount: paymentAmount,
          feeType: 'Unallocated',
          allocationReason: 'term_fees' as any,
          isAutoAllocation: true,
          allocatedAt: new Date()
        });
        return;
      }

      // Check if this is a specific fee type payment (not "full" allocation)
      const isSpecificFeeType = paymentType && paymentType.toLowerCase() !== 'full';
      
      if (isSpecificFeeType) {
        // Allocate ONLY to the specific fee type selected
        const matchingFeeStructure = feeStructures.find(
          fs => fs.feeType.toLowerCase() === paymentType.toLowerCase()
        );
        
        if (matchingFeeStructure) {
          // Create allocation for this specific fee type only
          await this.paymentAllocationRepository.save({
            paymentId,
            schoolId,
            termId,
            academicCalendarId: term.academicCalendar?.id,
            allocatedAmount: paymentAmount,
            feeType: matchingFeeStructure.feeType,
            allocationReason: 'specific_fee' as any,
            isAutoAllocation: false,
            allocatedAt: new Date()
          });
          console.log(`Allocated ${paymentAmount} to specific fee type: ${matchingFeeStructure.feeType}`);
          return;
        } else {
          // Fee type doesn't match any structure, create as specified type
          await this.paymentAllocationRepository.save({
            paymentId,
            schoolId,
            termId,
            academicCalendarId: term.academicCalendar?.id,
            allocatedAmount: paymentAmount,
            feeType: paymentType,
            allocationReason: 'specific_fee' as any,
            isAutoAllocation: false,
            allocatedAt: new Date()
          });
          console.log(`Allocated ${paymentAmount} to payment type: ${paymentType} (no matching fee structure)`);
          return;
        }
      }

      // If payment type is "full" or not specified, do auto-allocation across fee structures

      // Get existing allocations for this student in this term
      const existingAllocations = await this.paymentAllocationRepository
        .createQueryBuilder('pa')
        .innerJoin('pa.payment', 'fp')
        .where('fp.studentId = :studentId', { studentId })
        .andWhere('pa.termId = :termId', { termId })
        .select('pa.feeType', 'feeType')
        .addSelect('SUM(pa.allocatedAmount)', 'total')
        .groupBy('pa.feeType')
        .getRawMany();

      const allocatedByType: Record<string, number> = {};
      existingAllocations.forEach(row => {
        allocatedByType[row.feeType] = parseFloat(row.total || '0');
      });

      // Allocate the payment amount
      let remainingAmount = paymentAmount;
      const allocations: any[] = [];

      // First, allocate to fee structures that haven't been fully paid
      for (const fs of feeStructures) {
        const feeAmount = Number(fs.amount);
        const alreadyAllocated = allocatedByType[fs.feeType] || 0;
        const stillOwed = feeAmount - alreadyAllocated;

        if (stillOwed > 0 && remainingAmount > 0) {
          const toAllocate = Math.min(stillOwed, remainingAmount);
          allocations.push({
            paymentId,
            schoolId,
            termId,
            academicCalendarId: term.academicCalendar?.id,
            allocatedAmount: toAllocate,
            feeType: fs.feeType,
            allocationReason: 'term_fees' as any,
            isAutoAllocation: true,
            allocatedAt: new Date()
          });
          remainingAmount -= toAllocate;
        }
      }

      // If there's remaining amount, it's an overpayment/credit balance
      if (remainingAmount > 0) {
        allocations.push({
          paymentId,
          schoolId,
          termId,
          academicCalendarId: term.academicCalendar?.id,
          allocatedAmount: remainingAmount,
          feeType: 'Credit Balance',
          allocationReason: 'advance_payment' as any,
          isAutoAllocation: true,
          allocatedAt: new Date()
        });
      }

      // Save all allocations
      if (allocations.length > 0) {
        await this.paymentAllocationRepository.save(allocations);
        console.log(`Auto-allocated payment ${paymentId}: ${allocations.length} allocations created`);
      }
    } catch (error) {
      console.error(`Failed to auto-allocate payment ${paymentId}:`, error.message);
      // Don't throw - allocation failure shouldn't block payment creation
    }
  }

  // Aggregated financial report: fees by type and approved expenses
  async getFinancialReportSummary(params: {
    startDate?: Date;
    endDate?: Date;
    academicCalendarId?: string;
    schoolId?: string;
    superAdmin?: boolean;
  }): Promise<{
    totals: {
      totalFees: number;
      totalByType: Array<{ type: string; amount: number }>;
      totalApprovedExpenses: number;
      netBalance: number;
    };
    trends: Array<{ month: string; fees: number; expenses: number }>;
  }> {
    const { startDate, endDate, academicCalendarId, schoolId, superAdmin = false } = params || {};

    if (!superAdmin && !schoolId) {
      return {
        totals: { totalFees: 0, totalByType: [], totalApprovedExpenses: 0, netBalance: 0 },
        trends: [],
      };
    }

    let calendarTermIds: string[] = [];
    if (academicCalendarId) {
      const termRows = await this.termRepository
        .createQueryBuilder('term')
        .where('term.id IS NOT NULL')
        .andWhere('term.academicCalendarId = :academicCalendarId', { academicCalendarId })
        .andWhere(schoolId ? 'term.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .getMany();
      calendarTermIds = termRows.map((t) => t.id);
      if (calendarTermIds.length === 0) {
        return {
          totals: { totalFees: 0, totalByType: [], totalApprovedExpenses: 0, netBalance: 0 },
          trends: [],
        };
      }
    }

    // Revenue by fee type (FeePayment) for category breakdown
    const feeTotalsByTypeQb = this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.paymentType', 'paymentType')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});

    if (calendarTermIds.length > 0) {
      feeTotalsByTypeQb.andWhere('payment.termId IN (:...termIds)', { termIds: calendarTermIds });
    }
    if (startDate) {
      feeTotalsByTypeQb.andWhere('payment.paymentDate >= :start', { start: startDate });
    }
    if (endDate) {
      feeTotalsByTypeQb.andWhere('payment.paymentDate <= :end', { end: endDate });
    }

    const feeTotalsByTypeRaw = await feeTotalsByTypeQb
      .groupBy('payment.paymentType')
      .getRawMany();
    const totalByType = feeTotalsByTypeRaw.map((r: any) => ({
      type: r.paymentType || 'other',
      amount: parseFloat(r.sum || '0'),
    }));

    // Total revenue from cashbook table (`payments`) = actual revenue
    const totalRevenueQb = this.paymentCaptureRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});
    if (calendarTermIds.length > 0) {
      totalRevenueQb.andWhere('payment.termId IN (:...termIds)', { termIds: calendarTermIds });
    }
    if (startDate) {
      totalRevenueQb.andWhere('payment.paymentDate >= :start', { start: startDate });
    }
    if (endDate) {
      totalRevenueQb.andWhere('payment.paymentDate <= :end', { end: endDate });
    }
    const totalRevenueRaw = await totalRevenueQb.getRawOne();
    const totalFees = parseFloat(totalRevenueRaw?.sum || '0');

    // Total approved/paid expenses
    const approvedExpensesQb = this.expenseRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(COALESCE(expense.approvedAmount, expense.amount)), 0)', 'sum')
      .where('expense.status IN (:...statuses)', { statuses: ['Approved', 'Paid'] })
      .andWhere(schoolId ? 'expense.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});
    if (calendarTermIds.length > 0) {
      approvedExpensesQb.andWhere('expense.termId IN (:...termIds)', { termIds: calendarTermIds });
    }
    if (startDate) {
      approvedExpensesQb.andWhere('COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate) >= :start', { start: startDate });
    }
    if (endDate) {
      approvedExpensesQb.andWhere('COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate) <= :end', { end: endDate });
    }
    const approvedExpensesRaw = await approvedExpensesQb.getRawOne();
    const totalApprovedExpenses = parseFloat(approvedExpensesRaw?.sum || '0');
    const netBalance = totalFees - totalApprovedExpenses;

    // Monthly revenue trends from cashbook (`payments`)
    const feeTrendsQb = this.paymentCaptureRepository
      .createQueryBuilder('payment')
      .select("TO_CHAR(payment.paymentDate, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'fees')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});
    if (calendarTermIds.length > 0) {
      feeTrendsQb.andWhere('payment.termId IN (:...termIds)', { termIds: calendarTermIds });
    }
    if (startDate) {
      feeTrendsQb.andWhere('payment.paymentDate >= :start', { start: startDate });
    }
    if (endDate) {
      feeTrendsQb.andWhere('payment.paymentDate <= :end', { end: endDate });
    }
    const feeTrendsRaw = await feeTrendsQb
      .groupBy("TO_CHAR(payment.paymentDate, 'YYYY-MM')")
      .orderBy("TO_CHAR(payment.paymentDate, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Monthly expense trends
    const expenseTrendsQb = this.expenseRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate), 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(COALESCE(expense.approvedAmount, expense.amount)), 0)', 'expenses')
      .where('expense.status IN (:...statuses)', { statuses: ['Approved', 'Paid'] })
      .andWhere(schoolId ? 'expense.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});
    if (calendarTermIds.length > 0) {
      expenseTrendsQb.andWhere('expense.termId IN (:...termIds)', { termIds: calendarTermIds });
    }
    if (startDate) {
      expenseTrendsQb.andWhere('COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate) >= :start', { start: startDate });
    }
    if (endDate) {
      expenseTrendsQb.andWhere('COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate) <= :end', { end: endDate });
    }
    const expenseTrendsRaw = await expenseTrendsQb
      .groupBy("TO_CHAR(COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate), 'YYYY-MM')")
      .orderBy("TO_CHAR(COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate), 'YYYY-MM')", 'ASC')
      .getRawMany();

    const monthMap = new Map<string, { fees: number; expenses: number }>();
    for (const r of feeTrendsRaw) {
      const m = r.month as string;
      monthMap.set(m, { fees: parseFloat(r.fees || '0'), expenses: 0 });
    }
    for (const r of expenseTrendsRaw) {
      const m = r.month as string;
      const existing = monthMap.get(m) || { fees: 0, expenses: 0 };
      existing.expenses = parseFloat(r.expenses || '0');
      monthMap.set(m, existing);
    }
    const trends = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, fees: v.fees, expenses: v.expenses }));

    return {
      totals: { totalFees, totalByType, totalApprovedExpenses, netBalance },
      trends,
    };
  }

  // Term-based financial report with carry-forward balances
  async getTermBasedFinancialReport(params: {
    schoolId?: string;
    academicCalendarId?: string;
    superAdmin?: boolean;
    includeCarryForward?: boolean;
  }): Promise<{
    academicCalendar: {
      id: string;
      name: string;
      startDate?: Date;
      endDate?: Date;
    } | null;
    calendarAnalysis: {
      totalRevenue: number;
      totalExpenses: number;
      netProfit: number;
      profitMargin: number;
      previousAcademicCalendarCarryForward: number;
    };
    currentTerm: {
      termId: string;
      termName: string;
      startDate: Date;
      endDate: Date;
      revenue: number;
      actualRevenue: number;
      expenses: number;
      baseProfit: number;
      profit: number;
      profitMargin: number;
      previousTermBroughtForward: number;
    } | null;
    previousTerm: {
      termId: string;
      termName: string;
      startDate: Date;
      endDate: Date;
      revenue: number;
      actualRevenue: number;
      expenses: number;
      baseProfit: number;
      profit: number;
      profitMargin: number;
    } | null;
    previousTerms: Array<{
      termId: string;
      termName: string;
      startDate: Date;
      endDate: Date;
      revenue: number;
      actualRevenue: number;
      expenses: number;
      baseProfit: number;
      profit: number;
      profitMargin: number;
    }>;
    previousTermsSummary: {
      broughtForwardProfit: number;
      totalRevenue: number;
      totalExpenses: number;
      cumulativeProfit: number;
      profitMargin: number;
    };
    cumulative: {
      totalRevenue: number;
      totalExpenses: number;
      totalProfit: number;
      totalProfitMargin: number;
      broughtForward: number;
    };
    carryForwardBalance: number;
  }> {
    const { schoolId, academicCalendarId, superAdmin = false, includeCarryForward = true } = params || {};

    if (!superAdmin && !schoolId) {
      throw new BadRequestException('School ID is required');
    }

    const calendarQb = this.academicCalendarRepository
      .createQueryBuilder('ac')
      .where(schoolId ? 'ac.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {});

    if (academicCalendarId) {
      calendarQb.andWhere('ac.id = :academicCalendarId', { academicCalendarId });
    } else {
      calendarQb.andWhere('ac.isActive = :isActive', { isActive: true });
    }

    const activeCalendar = await calendarQb.getOne();
    if (!activeCalendar) {
      return {
        academicCalendar: null,
        calendarAnalysis: {
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          profitMargin: 0,
          previousAcademicCalendarCarryForward: 0,
        },
        currentTerm: null,
        previousTerm: null,
        previousTerms: [],
        previousTermsSummary: {
          broughtForwardProfit: 0,
          totalRevenue: 0,
          totalExpenses: 0,
          cumulativeProfit: 0,
          profitMargin: 0,
        },
        cumulative: {
          totalRevenue: 0,
          totalExpenses: 0,
          totalProfit: 0,
          totalProfitMargin: 0,
          broughtForward: 0,
        },
        carryForwardBalance: 0,
      };
    }

    const termsInCalendarRaw = await this.termRepository
      .createQueryBuilder('term')
      .leftJoinAndSelect('term.academicCalendar', 'calendar')
      .leftJoinAndSelect('term.period', 'period')
      .where('term.academicCalendarId = :calendarId', { calendarId: activeCalendar.id })
      .andWhere(schoolId ? 'term.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .orderBy('term.termNumber', 'ASC')
      .addOrderBy('term.startDate', 'ASC')
      .getMany();

    // Normalize term sequence by termNumber (Term 1 oldest, then 2, then 3, ...).
    // This avoids relying on potentially inconsistent date metadata.
    const termsInCalendar = [...termsInCalendarRaw].sort((a, b) => {
      const aNum = Number(a.termNumber || 0);
      const bNum = Number(b.termNumber || 0);
      if (aNum !== bNum) return aNum - bNum;
      const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aStart - bStart;
    });

    const calculateTermFinancials = async (term: Term) => {
      const revenueResult = await this.paymentCaptureRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'revenue')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.termId = :termId', { termId: term.id })
        .andWhere(schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .getRawOne();

      const expenseResult = await this.expenseRepository
        .createQueryBuilder('expense')
        .select('COALESCE(SUM(COALESCE(expense.approvedAmount, expense.amount)), 0)', 'expenses')
        .where('expense.status IN (:...statuses)', { statuses: ['Approved', 'Paid'] })
        .andWhere(schoolId ? 'expense.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .andWhere(
          '(expense.termId = :termId OR (COALESCE(expense.paidDate, expense.approvedDate, expense.requestDate) BETWEEN :start AND :end))',
          { termId: term.id, start: term.startDate, end: term.endDate },
        )
        .getRawOne();

      const revenue = parseFloat(revenueResult?.revenue || '0');
      const expenses = parseFloat(expenseResult?.expenses || '0');
      const baseProfit = revenue - expenses;
      const profitMargin = revenue > 0 ? (baseProfit / revenue) * 100 : 0;

      return {
        termId: term.id,
        termName: `${term.academicCalendar?.term || activeCalendar.term} Term ${term.termNumber}`,
        startDate: term.startDate,
        endDate: term.endDate,
        revenue,
        actualRevenue: revenue,
        expenses,
        baseProfit,
        profit: baseProfit,
        profitMargin,
      };
    };

    const termFinancials = await Promise.all(termsInCalendar.map(calculateTermFinancials));

    const currentTermRaw =
      termsInCalendar.find((t) => t.isCurrent) ||
      (termsInCalendar.length ? termsInCalendar[termsInCalendar.length - 1] : null);
    const currentTermData = currentTermRaw
      ? termFinancials.find((f) => f.termId === currentTermRaw.id) || null
      : null;

    // Resolve previous term by ordered position within the same academic calendar.
    // This is more reliable than date comparisons when term boundaries touch.
    const currentTermIndex = currentTermRaw
      ? termsInCalendar.findIndex((t) => t.id === currentTermRaw.id)
      : -1;

    const previousTermRaw =
      currentTermIndex > 0 ? termsInCalendar[currentTermIndex - 1] : null;

    const previousTermData = previousTermRaw
      ? termFinancials.find((f) => f.termId === previousTermRaw.id) || null
      : null;

    const termIndexById = new Map(termsInCalendar.map((t, idx) => [t.id, idx]));
    const previousTerms =
      currentTermIndex > 0
        ? termFinancials.filter((f) => {
            const idx = termIndexById.get(f.termId);
            return typeof idx === 'number' && idx < currentTermIndex;
          })
        : currentTermRaw
          ? []
          : termFinancials.slice(0, Math.max(0, termFinancials.length - 1));

    // Previous academic calendar carry-forward (profit carried into current calendar)
    const calendarsOrdered = await this.academicCalendarRepository
      .createQueryBuilder('ac')
      .where(schoolId ? 'ac.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
      .orderBy('COALESCE(ac.startDate, ac.createdAt)', 'ASC')
      .addOrderBy('ac.createdAt', 'ASC')
      .getMany();
    const currentCalendarIndex = calendarsOrdered.findIndex((c) => c.id === activeCalendar.id);
    const previousCalendar = currentCalendarIndex > 0 ? calendarsOrdered[currentCalendarIndex - 1] : null;

    let previousCalendarCarryForward = 0;
    if (previousCalendar) {
      const previousCalendarTerms = await this.termRepository
        .createQueryBuilder('term')
        .leftJoinAndSelect('term.academicCalendar', 'calendar')
        .leftJoinAndSelect('term.period', 'period')
        .where('term.academicCalendarId = :calendarId', { calendarId: previousCalendar.id })
        .andWhere(schoolId ? 'term.schoolId = :schoolId' : '1=1', schoolId ? { schoolId } : {})
        .orderBy('term.termNumber', 'ASC')
        .addOrderBy('term.startDate', 'ASC')
        .getMany();

      const previousCalendarFinancials = await Promise.all(previousCalendarTerms.map(calculateTermFinancials));
      previousCalendarCarryForward = previousCalendarFinancials.reduce((sum, t) => sum + Number(t.baseProfit || 0), 0);
    }

    const calendarRevenue = termFinancials.reduce((sum, t) => sum + Number(t.revenue || 0), 0);
    const calendarExpenses = termFinancials.reduce((sum, t) => sum + Number(t.expenses || 0), 0);
    const calendarBaseProfit = calendarRevenue - calendarExpenses;
    const calendarNetProfit = calendarBaseProfit + (includeCarryForward ? previousCalendarCarryForward : 0);
    const calendarProfitMargin = calendarRevenue > 0 ? (calendarNetProfit / calendarRevenue) * 100 : 0;

    const previousTermProfit = Number(previousTermData?.baseProfit || 0);
    const currentTermWithCarry = currentTermData
      ? {
          ...currentTermData,
          previousTermBroughtForward: includeCarryForward ? previousTermProfit : 0,
          profit: Number(currentTermData.baseProfit || 0) + (includeCarryForward ? previousTermProfit : 0),
          profitMargin:
            Number(currentTermData.revenue || 0) > 0
              ? ((Number(currentTermData.baseProfit || 0) + (includeCarryForward ? previousTermProfit : 0)) /
                  Number(currentTermData.revenue || 0)) *
                100
              : 0,
        }
      : null;

    const previousTermsSummary = {
      broughtForwardProfit: includeCarryForward ? previousTermProfit : 0,
      totalRevenue: Number(previousTermData?.revenue || 0),
      totalExpenses: Number(previousTermData?.expenses || 0),
      cumulativeProfit: Number(previousTermData?.baseProfit || 0),
      profitMargin: Number(previousTermData?.profitMargin || 0),
    };

    return {
      academicCalendar: {
        id: activeCalendar.id,
        name: activeCalendar.term,
        startDate: activeCalendar.startDate,
        endDate: activeCalendar.endDate,
      },
      calendarAnalysis: {
        totalRevenue: calendarRevenue,
        totalExpenses: calendarExpenses,
        netProfit: calendarNetProfit,
        profitMargin: calendarProfitMargin,
        previousAcademicCalendarCarryForward: includeCarryForward ? previousCalendarCarryForward : 0,
      },
      currentTerm: currentTermWithCarry,
      previousTerm: previousTermData,
      previousTerms,
      previousTermsSummary,
      cumulative: {
        totalRevenue: calendarRevenue,
        totalExpenses: calendarExpenses,
        totalProfit: calendarBaseProfit,
        totalProfitMargin: calendarRevenue > 0 ? (calendarBaseProfit / calendarRevenue) * 100 : 0,
        broughtForward: includeCarryForward ? previousTermProfit : 0,
      },
      carryForwardBalance: includeCarryForward ? previousCalendarCarryForward : 0,
    };
  }

  async getDashboardData(userId: string, schoolId?: string, superAdmin = false) {
    const financeUser = await this.getFinanceUser(userId);

    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const termFilter = currentTerm ? { termId: currentTerm.id } : {};

  const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});

    const [pendingPayments, pendingBudgets, recentTransactions] = await Promise.all([
      this.paymentRepository.find({
        where: { status: 'pending', ...termFilter, ...schoolScope },
        take: 5,
        order: { createdAt: 'DESC' },
        relations: ['student', 'term'],
      }),
      this.budgetRepository.find({
        where: { status: 'pending', ...(schoolScope || {}) },
        take: 5,
        order: { createdAt: 'DESC' },
      }),
      this.paymentRepository.find({
        where: { status: 'completed', ...termFilter, ...schoolScope },
        take: 5,
        order: { paymentDate: 'DESC' },
        relations: ['student', 'term'],
      }),
    ]);

    const totalProcessedPayments = await this.paymentRepository.count({
      where: { status: 'completed', ...termFilter, ...schoolScope },
    });

    const totalRevenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
  .where('payment.status = :status', { status: 'completed' })
  .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
  .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    const totalRevenue = parseFloat(totalRevenueResult?.sum || '0');

    return {
      financeUser,
      pendingPayments: pendingPayments.map((p) => ({
        ...p,
        studentName: p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown',
      })),
      pendingBudgets,
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        studentName: t.student ? `${t.student.firstName} ${t.student.lastName}` : 'Unknown',
      })),
      stats: {
        totalProcessedPayments,
        totalApprovedBudgets: await this.budgetRepository.count({
          where: { status: 'approved' },
        }),
        totalRevenue: `$${totalRevenue.toFixed(2)}`,
        pendingApprovals: pendingPayments.length + pendingBudgets.length,
      },
    };
  }

  async listCredits(params: { studentId?: string; status?: 'active' | 'applied' | 'refunded' | 'all'; schoolId?: string; superAdmin?: boolean }) {
    const { studentId, status = 'active', schoolId, superAdmin = false } = params || {};
    const where: any = {};
    if (studentId) where.student = { id: studentId } as any;
    if (status && status !== 'all') where.status = status;
    if (!superAdmin) {
      if (!schoolId) return [];
      where.schoolId = schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }
    const credits = await this.creditRepository.find({
      where,
      relations: ['student', 'sourcePayment'],
      order: { createdAt: 'DESC' },
    });
    return credits.map((c: any) => ({
      id: c.id,
      studentId: c.student?.id,
      amount: Number(c.amount),
      remainingAmount: Number(c.remainingAmount),
      status: c.status,
      sourcePaymentId: c.sourcePayment?.id,
      createdAt: c.createdAt,
    }));
  }

  async processPayment(user: { id: string; role: Role; schoolId?: string }, processPaymentDto: ProcessPaymentDto, request?: any, superAdmin = false) {
    const startTime = Date.now();
    
    console.log('Processing payment with user data:', { 
      userId: user.id, 
      role: user.role, 
      schoolId: user.schoolId,
      studentId: processPaymentDto.studentId 
    });
    
    try {
      const processingUser = await this.userRepository.findOne({
        where: { id: user.id, role: In([Role.ADMIN, Role.FINANCE]) },
      });

      if (!processingUser) {
        throw new NotFoundException('Processing user not found or not authorized');
      }

      const student = await this.studentRepository.findOne({
        where: { 
          id: processPaymentDto.studentId,
          // Ensure student belongs to same school as processing user (multi-tenant security)
          ...(user.schoolId ? { schoolId: user.schoolId } : {})
        },
        relations: ['graduationTerm'], // Load graduation term to check if student is graduated
      });

      if (!student) {
        throw new NotFoundException('Student not found or not accessible in your school');
      }

      // Check if student is graduated
      const isGraduated = !!student.graduationTermId;
      if (isGraduated) {
        console.log(`Processing payment for graduated student ${student.firstName} ${student.lastName} (ID: ${student.id}), graduated in term: ${student.graduationTermId}`);
      }

      // Attempt to load finance profile when role is FINANCE; fall back gracefully if missing
      let financeUser: Finance | null = null;
      if (processingUser.role === Role.FINANCE) {
        financeUser = await this.financeRepository.findOne({
          where: { user: { id: processingUser.id } },
          relations: ['user'],
        });
        if (!financeUser) {
          // Instead of aborting, proceed treating the user like an admin processor
          await this.systemLoggingService.logAction({
            action: 'FINANCE_PROFILE_MISSING_FALLBACK',
            module: 'FINANCE',
            level: 'warn',
            performedBy: { id: processingUser.id, role: processingUser.role, email: processingUser.email ?? '' },
            metadata: { description: 'Finance user has FINANCE role but no finance profile; using admin processing fallback.' },
          });
        }
      }

      // Determine term for the payment date: prefer a term that has a holiday covering the payment date
      const paymentDate = new Date(processPaymentDto.paymentDate);
      let termForPayment = await this.settingsService.getTermForDate(user.schoolId, paymentDate);
      if (!termForPayment) {
        termForPayment = await this.settingsService.getCurrentTerm(user.schoolId);
      }

      if (!termForPayment) {
        throw new BadRequestException('No active term found. Please contact administration.');
      }

      // For graduated students, use graduation term as the payment term, not current term
      // This ensures payments don't get allocated to terms after graduation
      if (isGraduated && student.graduationTermId) {
        console.log(`Student graduated - using graduation term ${student.graduationTermId} instead of current term`);
        const graduationTerm = await this.termRepository.findOne({
          where: { id: student.graduationTermId },
          relations: ['academicCalendar']
        });
        
        if (graduationTerm) {
          termForPayment = graduationTerm;
          console.log(`Payment will be processed against graduation term: Term ${graduationTerm.termNumber} of ${graduationTerm.academicCalendar?.term} (${graduationTerm.id})`);
        } else {
          throw new BadRequestException('Graduation term not found for this student');
        }
      }

      // Keep the variable name `currentTerm` for downstream logic compatibility
      const currentTerm = termForPayment;

      const configuredFeeStructures = await this.feeStructureRepository.find({
        where: {
          isActive: true,
          termId: currentTerm.id,
          ...(user.schoolId ? { schoolId: user.schoolId } : {}),
        },
      });
      const configuredTypes = new Set(
        configuredFeeStructures
          .map((fs: any) => String((fs.feeType ?? fs.type ?? '').toLowerCase()))
          .filter((t: string) => !!t)
      );

      const incomingType = String(processPaymentDto.paymentType || '').toLowerCase();
      const isFullAllocation = incomingType === 'full';
      if (!isFullAllocation && !configuredTypes.has(incomingType)) {
        throw new BadRequestException('Invalid payment type for this school/term');
      }

      // Special case: Full payment allocation across configured fee types
      let savedPayment = null as any;
      let savedPayments: any[] = [];
      if (isFullAllocation) {
        // Compute expected fees per feeType for the student and term (scoped by school)
        const expected = await this.studentFeeExpectationService.computeExpectedFeesForStudent(
          student.id,
          currentTerm.id,
          user.schoolId,
          false
        );

        // Aggregate previous payments by feeType for this student + term + school
        const previousPayments = await this.paymentRepository
          .createQueryBuilder('payment')
          .select('payment.paymentType', 'paymentType')
          .addSelect('SUM(payment.amount)', 'total')
          .where('payment.studentId = :studentId', { studentId: student.id })
          .andWhere('payment.termId = :termId', { termId: currentTerm.id })
          .andWhere(user.schoolId ? 'payment.schoolId = :schoolId' : '1=1', user.schoolId ? { schoolId: user.schoolId } : {})
          .groupBy('payment.paymentType')
          .getRawMany();

        const paidMap: Record<string, number> = {};
        for (const row of previousPayments) {
          const key = String(row.paymentType || '').toLowerCase();
          paidMap[key] = Number(row.total || 0);
        }

        // Build outstanding per feeType (mandatory first, then optional)
        const itemsOrdered = [
          ...expected.mandatoryFees.map((f: any) => ({ feeType: String(f.feeType || '').toLowerCase(), amount: Number(f.amount || 0), optional: false })),
          ...expected.optionalFees.map((f: any) => ({ feeType: String(f.feeType || '').toLowerCase(), amount: Number(f.amount || 0), optional: true })),
        ];

        let remaining = Number(processPaymentDto.amount || 0);
        for (const item of itemsOrdered) {
          if (remaining <= 0) break;
          const alreadyPaid = paidMap[item.feeType] || 0;
          const outstanding = Math.max(0, item.amount - alreadyPaid);
          if (outstanding <= 0) continue;
          const alloc = Math.min(remaining, outstanding);
          remaining -= alloc;

          const allocPayment = this.paymentRepository.create({
            amount: alloc,
            receiptNumber: processPaymentDto.receiptNumber,
            paymentType: item.feeType,
            paymentMethod: processPaymentDto.paymentMethod,
            notes: processPaymentDto.notes,
            status: 'completed',
            paymentDate: new Date(processPaymentDto.paymentDate),
            student: { id: student.id },
            termId: currentTerm.id,
            schoolId: user.schoolId || undefined,
            ...(financeUser
              ? { processedBy: { id: financeUser.id } }
              : { processedByAdmin: { id: processingUser.id } }),
          });
          const saved = await this.paymentRepository.save(allocPayment);
          savedPayments.push(saved);
        }

        // If any remainder after allocation, create a credit
        let creditCreated = false;
        let creditAmount = 0;
        if (remaining > 0.009) {
          creditAmount = Number(remaining.toFixed(2));
          const referencePayment = savedPayments[savedPayments.length - 1];
          const credit = this.creditRepository.create({
            student: { id: student.id } as any,
            termId: currentTerm.id,
            schoolId: user.schoolId || null,
            sourcePayment: referencePayment ? ({ id: referencePayment.id } as any) : undefined,
            amount: creditAmount as any,
            remainingAmount: creditAmount as any,
            status: 'active',
            notes: referencePayment ? `Surplus from payment ${referencePayment.id}` : 'Surplus from full payment allocation',
          });
          await this.creditRepository.save(credit);
          await this.systemLoggingService.logAction({
            action: 'CREDIT_CAPTURED',
            module: 'FINANCE',
            level: 'debug',
            schoolId: user.schoolId,
            entityId: credit.id,
            entityType: 'CreditLedger',
            newValues: {
              studentId: student.id,
              termId: currentTerm.id,
              amount: creditAmount,
              sourcePaymentId: referencePayment?.id,
            },
            metadata: {
              description: 'Credit captured from overpayment',
            },
          });
          creditCreated = true;

          // Automatically apply credit to outstanding fees across all terms
          try {
            const autoApplyResult = await this.autoApplyCreditAcrossAllTerms(
              student.id,
              user.schoolId,
              superAdmin
            );
            console.log(`🔄 Auto-applied credit for student ${student.id}:`, autoApplyResult.message);
            await this.systemLoggingService.logAction({
              action: 'CREDIT_AUTO_APPLY_TRIGGERED',
              module: 'FINANCE',
              level: 'debug',
              schoolId: user.schoolId,
              performedBy: { id: processingUser.id, email: processingUser.email, role: processingUser.role },
              metadata: {
                studentId: student.id,
                termId: currentTerm.id,
                amount: creditAmount,
                message: autoApplyResult.message,
              },
            });
          } catch (error) {
            console.error('Error auto-applying credit after creation:', error);
            // Don't fail the payment if auto-apply fails
          }
        }

        // Create explicit allocations for each split payment to align with allocation-based calculations
        try {
          const termForAlloc = await this.termRepository.findOne({ where: { id: currentTerm.id }, relations: ['academicCalendar'] });
          const allocsToSave: any[] = [];
          for (const sp of savedPayments) {
            allocsToSave.push({
              paymentId: sp.id,
              schoolId: user.schoolId || sp.schoolId,
              termId: currentTerm.id,
              academicCalendarId: termForAlloc?.academicCalendar?.id,
              allocatedAmount: Number(sp.amount || 0),
              feeType: sp.paymentType,
              allocationReason: 'term_fees' as any,
              isAutoAllocation: true,
              allocatedAt: new Date()
            });
          }
          if (allocsToSave.length) {
            await this.paymentAllocationRepository.save(allocsToSave);
          }
        } catch (allocErr) {
          console.warn('Failed to create allocations for full payment split:', (allocErr as any)?.message);
        }

        // Log each allocated payment
        for (const sp of savedPayments) {
          await this.systemLoggingService.logFeePaymentProcessed(
            sp.id,
            student.id,
            sp.amount,
            {
              id: processingUser.id,
              email: processingUser.email,
              role: processingUser.role,
              name: financeUser ? `${financeUser.firstName} ${financeUser.lastName}` : processingUser.username
            },
            request,
            user.schoolId
          );
        }

        const duration = Date.now() - startTime;
        console.log(`Full payment allocated across ${savedPayments.length} fee types in ${duration}ms for student ${student.id}`);

        // ── Trap total cash collected in the `payments` table ──────────────────
        try {
          const capture = this.paymentCaptureRepository.create({
            amount: Number(processPaymentDto.amount),
            studentId: student.id,
            termId: currentTerm.id,
            schoolId: user.schoolId || null,
            paymentMethod: (processPaymentDto.paymentMethod || 'cash') as any,
            receiptNumber: processPaymentDto.receiptNumber || null,
            paymentDate: new Date(processPaymentDto.paymentDate),
            notes: processPaymentDto.notes || null,
            status: 'completed',
            feePaymentId: savedPayments[0]?.id || null,
          });
          await this.paymentCaptureRepository.save(capture);
        } catch (captureErr) {
          console.warn('Failed to write to payments table (full alloc):', (captureErr as any)?.message);
        }
        // ─────────────────────────────────────────────────────────────────────

        return {
          success: true,
          payments: savedPayments.map(sp => ({
            ...sp,
            studentName: `${student.firstName} ${student.lastName}`,
            processedByName: processingUser.username,
          })),
          credit: creditCreated ? { created: true, amount: creditAmount } : { created: false, amount: 0 },
          message: 'Full payment allocated successfully',
        };
      }

      // Normal single-type payment
      const payment = this.paymentRepository.create({
        amount: processPaymentDto.amount,
        receiptNumber: processPaymentDto.receiptNumber,
        paymentType: processPaymentDto.paymentType,
        paymentMethod: processPaymentDto.paymentMethod,
        notes: processPaymentDto.notes,
        status: 'completed',
        paymentDate: new Date(processPaymentDto.paymentDate),
        student: { id: student.id },
        termId: currentTerm.id,
        schoolId: user.schoolId || undefined,
        ...(financeUser
          ? { processedBy: { id: financeUser.id } }
          : { processedByAdmin: { id: processingUser.id } }),
      });
      console.log('Payment object created with schoolId:', payment.schoolId);
      savedPayment = await this.paymentRepository.save(payment);

      // ── Trap cash collected in the `payments` table ────────────────────────
      try {
        const capture = this.paymentCaptureRepository.create({
          amount: Number(processPaymentDto.amount),
          studentId: student.id,
          termId: currentTerm.id,
          schoolId: user.schoolId || null,
          paymentMethod: (processPaymentDto.paymentMethod || 'cash') as any,
          receiptNumber: processPaymentDto.receiptNumber || null,
          paymentDate: new Date(processPaymentDto.paymentDate),
          notes: processPaymentDto.notes || null,
          status: 'completed',
          feePaymentId: savedPayment.id,
        });
        await this.paymentCaptureRepository.save(capture);
      } catch (captureErr) {
        console.warn('Failed to write to payments table:', (captureErr as any)?.message);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Auto-allocate the payment to fee structures
      await this.autoAllocatePayment(
        savedPayment.id,
        student.id,
        currentTerm.id,
        user.schoolId || savedPayment.schoolId,
        Number(processPaymentDto.amount),
        processPaymentDto.paymentType
      );

      // Overpayment handling: compute outstanding for the student and term
      let creditCreated = false;
      let creditAmount = 0;
      try {
        const feeStatus = await this.studentFeeExpectationService.getStudentFeeStatus(student.id, currentTerm.id, user.schoolId, superAdmin);
        const outstanding = Number(feeStatus?.outstanding || 0);
        const paidNow = Number(processPaymentDto.amount || 0);
        if (paidNow > outstanding) {
          creditAmount = Number((paidNow - outstanding).toFixed(2));
          if (creditAmount > 0) {
            const credit = this.creditRepository.create({
              student: { id: student.id } as any,
              termId: currentTerm.id,
              schoolId: user.schoolId || null,
              sourcePayment: { id: savedPayment.id } as any,
              amount: creditAmount as any,
              remainingAmount: creditAmount as any,
              status: 'active',
              notes: `Surplus from payment ${savedPayment.id}`,
            });
            await this.creditRepository.save(credit);
            creditCreated = true;

            // Automatically apply credit to outstanding fees across all terms
            try {
              const autoApplyResult = await this.autoApplyCreditAcrossAllTerms(
                student.id,
                user.schoolId,
                superAdmin
              );
              console.log(`🔄 Auto-applied credit for student ${student.id}:`, autoApplyResult.message);
            } catch (error) {
              console.error('Error auto-applying credit after creation:', error);
              // Don't fail the payment if auto-apply fails
            }
          }
        }
      } catch (e) {
        // Log but do not fail payment if credit computation fails
        await this.systemLoggingService.logAction({
          action: 'CREDIT_COMPUTE_FAILED',
          module: 'FINANCE',
          level: 'warn',
          performedBy: { id: processingUser.id, role: processingUser.role, email: processingUser.email ?? '' },
          metadata: { error: (e as Error)?.message, studentId: student.id, termId: currentTerm.id },
          schoolId: user.schoolId,
        });
      }
      
      // Enhanced logging
      await this.systemLoggingService.logFeePaymentProcessed(
        savedPayment.id,
        student.id,
        processPaymentDto.amount,
        {
          id: processingUser.id,
          email: processingUser.email,
          role: processingUser.role,
          name: financeUser ? `${financeUser.firstName} ${financeUser.lastName}` : processingUser.username
        },
        request,
        user.schoolId
      );

      const duration = Date.now() - startTime;
      console.log(`Payment processed successfully in ${duration}ms for student ${student.id}`);
      
      return {
        success: true,
        payment: {
          ...savedPayment,
          studentName: `${student.firstName} ${student.lastName}`,
          processedByName: processingUser.username,
        },
        credit: creditCreated ? { created: true, amount: creditAmount } : { created: false, amount: 0 },
        message: 'Payment processed successfully',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.systemLoggingService.logSystemError(
        error,
        'FINANCE',
        'PROCESS_PAYMENT_FAILED',
        {
          studentId: processPaymentDto.studentId,
          amount: processPaymentDto.amount,
          duration
        },
        user.schoolId
      );
      
      if (error.code === '23503') {
        throw new BadRequestException('Invalid reference in payment processing');
      }
      throw new BadRequestException(`Failed to process payment: ${error.message}`);
    }
  }

  async getAllFinanceUsers(page: number, limit: number, search: string, schoolId?: string, superAdmin = false) {
    if (!superAdmin && !schoolId) {
      return { financeUsers: [], total: 0 };
    }

    const qb = this.financeRepository.createQueryBuilder('finance')
      .leftJoinAndSelect('finance.user', 'user')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('finance.firstName', 'ASC');

    if (!superAdmin) {
      qb.andWhere('finance.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('finance.schoolId = :schoolId', { schoolId });
    }

    if (search) {
      qb.andWhere(new Brackets(qb2 => {
        qb2.where('LOWER(finance.firstName) LIKE :s', { s: `%${search.toLowerCase()}%` })
          .orWhere('LOWER(finance.lastName) LIKE :s', { s: `%${search.toLowerCase()}%` })
          .orWhere('LOWER(finance.department) LIKE :s', { s: `%${search.toLowerCase()}%` })
          .orWhere('LOWER(user.username) LIKE :s', { s: `%${search.toLowerCase()}%` })
          .orWhere('LOWER(user.email) LIKE :s', { s: `%${search.toLowerCase()}%` });
      }));
    }

    const [financeUsers, total] = await qb.getManyAndCount();
    return { financeUsers, total };
  }

  async approveBudget(
    userId: string,
    budgetId: string,
    approveBudgetDto: ApproveBudgetDto,
  ) {
    const approver = await this.getFinanceUser(userId);
    const budget = await this.budgetRepository.findOne({
      where: { id: budgetId },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    if (approver instanceof Finance) {
      budget.approvedBy = approver;
    } else {
      budget.approvedByAdmin = approver;
    }

    budget.status = approveBudgetDto.approved ? 'approved' : 'rejected';
    budget.approvalDate = new Date();
    budget.approvalNotes = approveBudgetDto.notes || '';

    await this.budgetRepository.save(budget);

    return {
      success: true,
      budget,
      message: `Budget ${approveBudgetDto.approved ? 'approved' : 'rejected'} successfully`,
    };
  }

// Duplicate getDashboardCalculations removed here; the consolidated implementation
// appears later in this file (single authoritative definition is retained).

  async calculateDashboardMetrics(schoolId?: string, superAdmin = false): Promise<{
    monthlyRevenue: number;
    monthlyRevenueLastMonth: number;
    outstandingFees: number;
    outstandingFeesLastMonth: number;
    paymentsToday: number;
    collectionRate: number;
    currentTermRevenue: number;
    currentTermOverpayments: number;
  }> {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Base where conditions
    const baseWhere: any = { status: 'completed' };
    if (!superAdmin && schoolId) {
      baseWhere.schoolId = schoolId;
    }

    try {
      // Determine current term for the school (if available)
      let currentTermForSchool: any = null;
      try {
        currentTermForSchool = await this.settingsService.getCurrentTerm(schoolId);
      } catch (err) {
        currentTermForSchool = null;
      }

      // Calculate monthly revenue (current month)
      const currentMonthRevenue = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.paymentDate >= :startDate', { startDate: currentMonth })
        .andWhere('payment.paymentDate < :endDate', { endDate: nextMonth })
        .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();

      // Calculate last month revenue
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const lastMonthRevenue = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.paymentDate >= :startDate', { startDate: lastMonthStart })
        .andWhere('payment.paymentDate < :endDate', { endDate: lastMonthEnd })
        .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();

      // Calculate outstanding fees (pending payments)
      const outstandingFeesResult = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'pending' })
        .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();

      const outstandingFees = parseFloat(outstandingFeesResult?.sum || '0');

      // Calculate payments today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const paymentsToday = await this.paymentRepository.count({
        where: {
          status: 'completed',
          paymentDate: Between(today, tomorrow),
          ...(schoolId && !superAdmin ? { schoolId } : {}),
        },
      });

      // Calculate collection rate
      // This is a simplified calculation: (completed payments / total payments) * 100
      const totalPayments = await this.paymentRepository.count({
        where: {
          ...(schoolId && !superAdmin ? { schoolId } : {}),
        },
      });

      const completedPayments = await this.paymentRepository.count({
        where: {
          status: 'completed',
          ...(schoolId && !superAdmin ? { schoolId } : {}),
        },
      });

      const collectionRate = totalPayments > 0 ? Math.round((completedPayments / totalPayments) * 100) : 0;

      // Calculate current term revenue (if current term available)
      // Sum ALL payments received during the current term (by termId or paymentDate within term range)
      // This includes payments for current term fees, overpayments, and payments applied to previous terms
      let currentTermRevenue = 0;
      try {
        if (currentTermForSchool && currentTermForSchool.id) {
          const termDetails = await this.termRepository.findOne({ where: { id: currentTermForSchool.id } });
          
          const termRevenueQb = this.paymentRepository
            .createQueryBuilder('payment')
            .select('SUM(payment.amount)', 'sum')
            .where('payment.status = :status', { status: 'completed' })
            .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId });

          // Match payments by explicit termId or by paymentDate window inside the term
          termRevenueQb.andWhere(new Brackets((qb) => {
            qb.where('payment.termId = :termId', { termId: currentTermForSchool.id });
            if (termDetails?.startDate && termDetails?.endDate) {
              qb.orWhere('payment.paymentDate BETWEEN :start AND :end', {
                start: termDetails.startDate,
                end: termDetails.endDate,
              });
            }
          }));

          const termRevenueRes = await termRevenueQb.getRawOne();
          currentTermRevenue = parseFloat(termRevenueRes?.sum || '0');
        }
      } catch (err) {
        currentTermRevenue = 0;
      }

      // Calculate current term overpayments (excess payments that became credits)
      // Only sum REMAINING amounts from ACTIVE credits - when credits are applied, this reduces
      // current-term overpayments calculation breakdown
      let currentTermOverpayments = 0;
      let sumCredits = 0;
      let sumAppliedToPrevious = 0;
      try {
        if (currentTermForSchool && currentTermForSchool.id) {
          const termDetails = await this.termRepository.findOne({ where: { id: currentTermForSchool.id } });

          // Sum remainingAmount of active credits only (not total amount)
          // This ensures that when credits are applied, overpayments decrease
          const overpaymentQb = this.creditRepository
            .createQueryBuilder('credit')
            .select('COALESCE(SUM(credit.remainingAmount), 0)', 'sum')
            .where('credit.status = :status', { status: 'active' })
            .andWhere(!superAdmin && schoolId ? 'credit.schoolId = :schoolId' : '1=1', { schoolId });

          // Match credits by explicit termId or by createdAt window inside the term
          overpaymentQb.andWhere(new Brackets((qb) => {
            qb.where('credit.termId = :termId', { termId: currentTermForSchool.id });
            if (termDetails?.startDate && termDetails?.endDate) {
              qb.orWhere('credit.createdAt BETWEEN :start AND :end', {
                start: termDetails.startDate,
                end: termDetails.endDate,
              });
            }
          }));

          const overpaymentRes = await overpaymentQb.getRawOne();
          sumCredits = parseFloat(overpaymentRes?.sum || '0');

          // Sum allocations from current-term payments applied to previous terms
          if (termDetails?.startDate && termDetails?.endDate) {
            const appliedPrevRes = await this.paymentAllocationRepository
              .createQueryBuilder('alloc')
              .innerJoin('alloc.payment', 'pay')
              .select('COALESCE(SUM(alloc.allocatedAmount), 0)', 'sum')
              .where('pay.status = :status', { status: 'completed' })
              .andWhere(!superAdmin && schoolId ? 'pay.schoolId = :schoolId' : '1=1', { schoolId })
              .andWhere(new Brackets(qb => {
                qb.where('pay.termId = :termId', { termId: currentTermForSchool.id })
                  .orWhere('pay.paymentDate BETWEEN :start AND :end', { start: termDetails.startDate, end: termDetails.endDate });
              }))
              .andWhere('alloc.termId != :termId', { termId: currentTermForSchool.id })
              .andWhere('alloc.allocationReason IN (:...reasons)', { reasons: ['historical_settlement', 'carry_forward_settlement'] })
              .getRawOne();

            sumAppliedToPrevious = parseFloat(appliedPrevRes?.sum || '0');
          }

          currentTermOverpayments = sumCredits + sumAppliedToPrevious;
        }
      } catch (err) {
        currentTermOverpayments = 0;
        sumCredits = 0;
        sumAppliedToPrevious = 0;
      }

      // Log overpayments calculation breakdown for debugging
      try {
        await this.systemLoggingService.logAction({
          action: 'OVERPAYMENTS_CALCULATION',
          module: 'FINANCE',
          level: 'debug',
          schoolId: schoolId,
          metadata: {
            currentTermId: currentTermForSchool?.id,
            sumCredits,
            sumAppliedToPrevious,
            currentTermOverpayments,
          },
        });
      } catch {}

      return {
        monthlyRevenue: parseFloat(currentMonthRevenue?.sum || '0'),
        monthlyRevenueLastMonth: parseFloat(lastMonthRevenue?.sum || '0'),
        outstandingFees: outstandingFees,
        outstandingFeesLastMonth: 0, // Will be calculated properly later
        paymentsToday,
        collectionRate,
        currentTermRevenue,
        currentTermOverpayments,
      };
    } catch (error) {
      // Return default values if calculation fails
      console.error('Error calculating dashboard metrics:', error);
      return {
        monthlyRevenue: 0,
        monthlyRevenueLastMonth: 0,
        outstandingFees: 0,
        outstandingFeesLastMonth: 0,
        paymentsToday: 0,
        collectionRate: 0,
        currentTermRevenue: 0,
        currentTermOverpayments: 0,
      };
    }
  }

  /**
   * Direct, lightweight query: total cash collected for the current term.
   * Reads straight from the payments (cashbook) table filtered by termId only.
   * Used by the dashboard "Fee Collection" card to avoid the heavy
   * calculateDashboardMetrics path.
   */
  async getDirectTermRevenue(schoolId?: string, superAdmin = false): Promise<number> {
    try {
      const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
      if (!currentTerm?.id) return 0;

      const result = await this.paymentCaptureRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.termId = :termId', { termId: currentTerm.id })
        .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();

      return parseFloat(result?.total || '0');
    } catch {
      return 0;
    }
  }

  async getFinancialStats(dateRange?: {
    startDate?: Date;
    endDate?: Date;
  }, schoolId?: string, superAdmin = false): Promise<{
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: number;
    pendingStudents: number;
  fallbackUsed?: boolean;
  }> {
    // Get current term for filtering (with safe fallback)
    let currentTerm: any = null;
    try {
      currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    } catch (err) {
      // await this.systemLoggingService.logSystemError(err, 'FINANCE', 'GET_CURRENT_TERM_FAILED');
    }
    
    const paymentWhere: any = { status: 'completed' };
    const budgetWhere: any = { status: 'approved' };

    if (!superAdmin) {
      if (schoolId) {
        paymentWhere.schoolId = schoolId;
        budgetWhere.schoolId = schoolId;
      } else {
        // No schoolId for non-super admin -> return zeros
        return { totalProcessedPayments: 0, totalApprovedBudgets: 0, totalRevenue: 0, pendingStudents: 0 };
      }
    } else if (schoolId) {
      paymentWhere.schoolId = schoolId;
      budgetWhere.schoolId = schoolId;
    }
    
    // Add term filter if available
    if (currentTerm) {
      paymentWhere.termId = currentTerm.id;
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      paymentWhere.paymentDate = Between(
        dateRange.startDate,
        dateRange.endDate,
      );
      budgetWhere.approvalDate = Between(
        dateRange.startDate,
        dateRange.endDate,
      );
    }

    let totalProcessedPayments = 0;
    let totalApprovedBudgets = 0;
    let totalRevenueResult: any = { sum: '0' };
    let pendingStudentsCount = 0;
    try {
      [
        totalProcessedPayments,
        totalApprovedBudgets,
        totalRevenueResult,
        pendingStudentsCount,
      ] = await Promise.all([
        this.paymentRepository.count({ where: paymentWhere }),
        this.budgetRepository.count({ where: budgetWhere }),
        this.calculateTotalRevenue(paymentWhere, currentTerm, dateRange),
        this.getStudentsWithOutstandingFees(schoolId, superAdmin),
      ]);
    } catch (err) {
      // await this.systemLoggingService.logSystemError(err, 'FINANCE', 'FINANCIAL_STATS_QUERY_FAILED', {
      //   paymentWhere,
      //   budgetWhere,
      //   dateRange: dateRange ? { start: dateRange.startDate, end: dateRange.endDate } : undefined,
      // });
      return { totalProcessedPayments: 0, totalApprovedBudgets: 0, totalRevenue: 0, pendingStudents: 0 };
    }

    let totalRevenue = parseFloat(totalRevenueResult?.sum || '0');
    let fallbackUsed = false;

    // Fallback: if term filtered result is zero but there are payments for the school overall,
    // attempt recalculation without term constraint (could indicate misaligned current term).
    if (schoolId && totalProcessedPayments === 0 && totalRevenue === 0) {
      try {
        const overallRevenueResult = await this.paymentRepository
          .createQueryBuilder('payment')
          .select('SUM(payment.amount)', 'sum')
          .where('payment.status = :status', { status: 'completed' })
          .andWhere('payment.schoolId = :schoolId', { schoolId })
          .getRawOne();
        const overallCount = await this.paymentRepository.count({ where: { status: 'completed', schoolId } });
        if (overallCount > 0 && parseFloat(overallRevenueResult?.sum || '0') > 0) {
          totalProcessedPayments = overallCount;
          totalRevenue = parseFloat(overallRevenueResult.sum || '0');
          fallbackUsed = true;
        }
      } catch (fbErr) {
        // await this.systemLoggingService.logSystemError(fbErr, 'FINANCE', 'FINANCIAL_STATS_FALLBACK_FAILED', { schoolId });
      }
    }

    if (fallbackUsed) {
      // await this.systemLoggingService.logAction({
      //   action: 'FINANCIAL_STATS_FALLBACK_APPLIED',
      //   module: 'FINANCE',
      //   level: 'warn',
      //   schoolId,
      //   metadata: { reason: 'Term mismatch produced zero totals; recalculated without term filter' },
      // });
    } else {
      // await this.systemLoggingService.logAction({
      //   action: 'FINANCIAL_STATS_CALCULATED',
      //   module: 'FINANCE',
      //   level: 'debug',
      //   schoolId,
      //   metadata: {
      //     totalProcessedPayments,
      //     totalApprovedBudgets,
      //     totalRevenue,
      //     pendingApprovals: pendingPaymentsCount + pendingBudgetsCount,
      //     termId: currentTerm?.id,
      //   },
      // });
    }

    return {
      totalProcessedPayments,
      totalApprovedBudgets,
      totalRevenue,
      pendingStudents: pendingStudentsCount,
      fallbackUsed,
    };
  }

  private async calculateTotalRevenue(
    paymentWhere: any,
    currentTerm: any,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<{ sum: string }> {
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' });

    if (currentTerm) {
      qb.andWhere('payment.termId = :termId', { 
        termId: currentTerm.id 
      });
    }

    if (paymentWhere.schoolId) {
      qb.andWhere('payment.schoolId = :schoolId', { 
        schoolId: paymentWhere.schoolId 
      });
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      qb.andWhere('payment.paymentDate BETWEEN :startDate AND :endDate', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    }

    const result = await qb.getRawOne();
    return result || { sum: '0' };
  }

  // Simple raw totals ignoring term (diagnostic / fallback)
  async getSimpleTotalsForSchool(schoolId: string): Promise<{ rawTotal: number; count: number }> {
    if (!schoolId) return { rawTotal: 0, count: 0 };
    const revenueResult = await this.paymentRepository
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount),0)', 'sum')
      .where('p.status = :status', { status: 'completed' })
      .andWhere('p.schoolId = :schoolId', { schoolId })
      .getRawOne();
    const rawTotal = parseFloat(revenueResult?.sum || '0');
    const count = await this.paymentRepository.count({ where: { status: 'completed', schoolId } });
    return { rawTotal, count };
  }

  async getTransactions(
    page: number,
    limit: number,
    search: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    filters?: {
      termId?: string;
      academicCalendarId?: string;
      schoolId?: string;
      superAdmin?: boolean;
    },
  ) {
    const where: any = {};

    // Apply school filter for multi-tenancy
    if (filters?.schoolId && !filters.superAdmin) {
      where.schoolId = filters.schoolId;
    } else if (filters?.schoolId && filters.superAdmin) {
      where.schoolId = filters.schoolId;
    }

    // Apply term filter if provided
    if (filters?.termId) {
      where.termId = filters.termId;
    } else {
      // Fallback to current term for filtering if no termId provided
      const currentTerm = await this.settingsService.getCurrentTerm(filters?.schoolId);
      if (currentTerm) {
        where.termId = currentTerm.id;
      }
    }

    if (search) {
      where.receiptNumber = Like(`%${search}%`);
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      where.paymentDate = Between(dateRange.startDate, dateRange.endDate);
    }

    const [transactions, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['student', 'processedBy', 'processedByAdmin', 'term', 'term.academicCalendar', 'term.period', 'allocations', 'allocations.term', 'allocations.term.academicCalendar'],
      skip: (page - 1) * limit,
      take: limit,
      order: { paymentDate: 'DESC' },
    });

        return {
      transactions: transactions.map((t) => ({
        ...t,
        studentName: t.student ? `${t.student.firstName} ${t.student.lastName}` : 'Unknown',
        studentId: t.student ? t.student.studentId : undefined,
        paymentDate: t.paymentDate?.toISOString(),
        // Ensure there's always a readable processedByName; fallback to any existing property or 'System'
        processedByName: t.processedBy?.user?.username || t.processedByAdmin?.username || (t as any).processedByName || 'System',
        term: t.term ? `Term ${t.term.termNumber}` : 'N/A',
        academicYear: t.term?.academicCalendar?.term || 'N/A',
        // Populate for-term values when allocations exist (use first allocation as representative)
        forTermId: t.allocations && t.allocations.length > 0 ? t.allocations[0].termId : undefined,
        forTermNumber: t.allocations && t.allocations.length > 0 ? t.allocations[0].term?.termNumber : undefined,
        forAcademicYear: t.allocations && t.allocations.length > 0 ? t.allocations[0].term?.academicCalendar?.term : undefined,
      })),
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        itemsPerPage: limit,
        currentPage: page,
      },
    };
  }

  async getTermInfo(termId: string) {
    const term = await this.termRepository.findOne({
      where: { id: termId },
      relations: ['academicCalendar', 'period'],
    });
    return term ? {
      id: term.id,
      term: `Term ${term.termNumber}`,
      academicYear: term.academicCalendar?.term,
      period: term.period?.name,
    } : null;
  }

async getParentPayments(
  parentId: string,
  page: number,
  limit: number,
  search: string,
) {
  const parent = await this.userRepository.findOne({
    where: { id: parentId, role: Role.PARENT },
    relations: ['parentProfile', 'parentProfile.children'],
  });

  if (!parent || !parent.parent?.children?.length) {
    throw new NotFoundException('Parent or associated students not found');
  }

  const studentIds = parent.parent.children.map((child) => child.id);

  // Get current term for filtering
  const currentTerm = await this.settingsService.getCurrentTerm();

  const where: any = {
    student: { id: In(studentIds) },
  };

  // Add term filter if available
  if (currentTerm) {
    where.termId = currentTerm.id;
  }

  if (search) {
    where.receiptNumber = Like(`%${search}%`);
  }

  const [payments, total] = await this.paymentRepository.findAndCount({
    where,
    relations: ['student', 'processedBy', 'processedByAdmin', 'term'],
    skip: (page - 1) * limit,
    take: limit,
    order: { paymentDate: 'DESC' },
  });

  return {
    payments: payments.map((payment) => ({
      id: payment.id,
      studentName: payment.student
        ? `${payment.student.firstName} ${payment.student.lastName}`
        : 'Unknown',
      amount: payment.amount,
      paymentDate: payment.paymentDate?.toISOString(),
      paymentType: payment.paymentType,
      paymentMethod: payment.paymentMethod,
      receiptNumber: payment.receiptNumber,
      status: payment.status,
      notes: payment.notes,
      term: payment.term ? `${payment.term.academicCalendar.term} - ${payment.term.period.name}` : 'N/A',
    })),
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      itemsPerPage: limit,
    },
  };
}

  async createFinanceUser(createFinanceDto: CreateFinanceDto, schoolId?: string, superAdmin = false) {
    // Auto-generate username if missing
    let providedUsername = createFinanceDto.username?.trim().toLowerCase();
    const norm = (s: string) => (s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['`’]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();

    if (!providedUsername) {
      const f = norm(createFinanceDto.firstName).slice(0, 10);
      const l = norm(createFinanceDto.lastName).slice(0, 10);
      const base = (f + l) || 'finance';
      const suffix = '@finance';
      let candidate = base + suffix;
      let counter = 2;
      while (await this.userRepository.findOne({ where: { username: candidate } })) {
        candidate = `${base}${counter}${suffix}`;
        counter++;
        if (counter > 9999) {
          candidate = base.slice(0, 12) + Date.now().toString(36) + suffix;
          break;
        }
      }
      providedUsername = candidate;
    } else {
      const existingUserName = await this.userRepository.findOne({ where: { username: providedUsername } });
      if (existingUserName) {
        throw new ConflictException('Username already exists');
      }
    }

    const existingEmail = await this.userRepository.findOne({ where: { email: createFinanceDto.email } });
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createFinanceDto.password, 10);

    if (!superAdmin && !schoolId) {
      throw new BadRequestException('Missing school scope for finance user creation');
    }

    const user = this.userRepository.create({
      username: providedUsername,
      email: createFinanceDto.email,
      password: hashedPassword,
      role: Role.FINANCE,
      isActive: true,
      schoolId: schoolId || undefined,
    });

    await this.userRepository.save(user);

    const finance = this.financeRepository.create({
      firstName: createFinanceDto.firstName,
      lastName: createFinanceDto.lastName,
      phoneNumber: createFinanceDto.phoneNumber,
      address: createFinanceDto.address,
      dateOfBirth: createFinanceDto.dateOfBirth,
      gender: createFinanceDto.gender,
      department: createFinanceDto.department,
      canApproveBudgets: createFinanceDto.canApproveBudgets ?? false,
      canProcessPayments: createFinanceDto.canProcessPayments ?? true,
      user: user,
      schoolId: schoolId || user.schoolId || null,
    });

    await this.financeRepository.save(finance);

    const { password, ...result } = user;
    return {
      ...result,
      financeProfile: {
        ...finance,
        user: undefined,
      },
    };
  }

  async generateFinancialReport(startDate: Date, endDate: Date) {
    const transactions = await this.paymentRepository.find({
      where: {
        paymentDate: Between(startDate, endDate),
        status: 'completed',
      },
      relations: ['student'],
    });

    const totalIncome = transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );

    return {
      startDate,
      endDate,
      summary: {
        totalIncome,
        totalTransactions: transactions.length,
      },
      transactions: transactions.map((t) => ({
        ...t,
        studentName: t.student ? `${t.student.firstName} ${t.student.lastName}` : 'Unknown',
        paymentDate: t.paymentDate?.toISOString(),
      })),
    };
  }

  async getFinanceUserDetails(id: string, schoolScopedId?: string, superAdmin = false) {
    // Finance profile joined with user
    const finance = await this.financeRepository.findOne({
      where: { id, ...(superAdmin ? {} : (schoolScopedId ? { schoolId: schoolScopedId } : {})) },
      relations: ['user']
    });
    if (!finance) {
      throw new NotFoundException('Finance user not found');
    }
    return {
      id: finance.id,
      firstName: finance.firstName,
      lastName: finance.lastName,
      username: finance.user?.username, // Add username at top level for easier access
      phoneNumber: finance.phoneNumber,
      address: finance.address,
      dateOfBirth: finance.dateOfBirth,
      gender: finance.gender,
      department: finance.department,
      canApproveBudgets: finance.canApproveBudgets,
      canProcessPayments: finance.canProcessPayments,
      schoolId: finance.schoolId,
      user: finance.user ? {
        id: finance.user.id,
        username: finance.user.username,
        email: finance.user.email,
        role: finance.user.role,
        isActive: finance.user.isActive,
      } : null,
    };
  }

  private async getFinanceUser(userId: string): Promise<Finance | User> {
    const financeUser = await this.financeRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (financeUser) {
      return financeUser;
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.ADMIN },
    });

    if (user) {
      return user;
    }

    throw new NotFoundException('Finance user or admin not found');
  }

  async generateReceipt(transactionId: string): Promise<string> {
    const payment = await this.paymentRepository.findOne({
      where: { id: transactionId },
      relations: ['student', 'processedBy', 'processedByAdmin', 'Term'],
    });

    if (!payment) {
      throw new NotFoundException('Transaction not found');
    }

    const fileName = `receipt_${payment.id}.pdf`;
    const filePath = `./receipts/${fileName}`;

    if (!fs.existsSync('./receipts')) {
      fs.mkdirSync('./receipts');
    }

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Payment Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Receipt #: ${payment.receiptNumber || 'N/A'}`);
    doc.text(`Date: ${payment.paymentDate.toLocaleDateString()}`);
    doc.text(
      `Student: ${payment.student?.firstName || 'N/A'} ${payment.student?.lastName || 'N/A'}`,
    );
    doc.text(`Amount: $${payment.amount.toFixed(2)}`);
    doc.text(`Payment Type: ${payment.paymentType}`);
    doc.text(`Payment Method: ${payment.paymentMethod}`);
    doc.text(
      `Term: ${payment.term ? `${payment.term.academicCalendar.term} - ${payment.term.period.name}` : 'N/A'}`,
    );
    doc.text(
      `Processed By: ${payment.processedBy?.user?.username || payment.processedByAdmin?.username || 'System'}`,
    );
    doc.moveDown();
    doc.text('Thank you for your payment!', { align: 'center' });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  async getAllPayments(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    schoolId?: string,
    superAdmin = false,
    termId?: string,
  ) {
    // Get current term for filtering (only if termId not explicitly provided)
    const currentTerm = termId ? null : await this.settingsService.getCurrentTerm();
    const effectiveTermId = termId || currentTerm?.id;

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.student', 'student')
      .leftJoinAndSelect('student.class', 'studentClass')
      .leftJoinAndSelect('payment.processedBy', 'processedBy')
      .leftJoinAndSelect('payment.processedByAdmin', 'processedByAdmin')
      .leftJoinAndSelect('payment.term', 'term')
      .leftJoinAndSelect('term.academicCalendar', 'academicCalendar')
      .orderBy('payment.paymentDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (effectiveTermId) {
      qb.andWhere('payment.termId = :termId', { termId: effectiveTermId });
    }

    if (!superAdmin) {
      if (!schoolId) {
        return { payments: [], total: 0 };
      }
      qb.andWhere('payment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      // Allow super admin optional narrowing
      qb.andWhere('payment.schoolId = :schoolId', { schoolId });
    }

    if (search) {
      qb.andWhere('LOWER(payment.receiptNumber) LIKE :search', { search: `%${search.toLowerCase()}%` });
    }

    const [payments, total] = await qb.getManyAndCount();
    return { payments, total };
  }

  async getPaymentById(id: string) {
    return this.paymentRepository.findOne({
      where: { id },
      relations: [
        'student',
        'processedBy',
        'processedByAdmin',
        'term',
        'term.academicCalendar',
        'term.period',
        'school',
        'allocations',
        'allocations.term',
        'allocations.term.academicCalendar'
      ],
    });
  }

  async getRecentPayments(limit: number, schoolId?: string, superAdmin = false): Promise<any[]> {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm();

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.student', 'student')
      .leftJoinAndSelect('payment.processedBy', 'processedBy')
      .leftJoinAndSelect('payment.processedByAdmin', 'processedByAdmin')
      .leftJoinAndSelect('payment.term', 'term')
      .where('payment.status = :status', { status: 'completed' })
      .orderBy('payment.paymentDate', 'DESC')
      .take(limit);

    if (currentTerm) {
      qb.andWhere('payment.termId = :termId', { termId: currentTerm.id });
    }

    if (!superAdmin) {
      if (!schoolId) return [];
      qb.andWhere('payment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('payment.schoolId = :schoolId', { schoolId });
    }

    return qb.getMany();
  }

  async getDashboardCalculations(schoolId?: string, superAdmin = false) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const termFilter = currentTerm ? { termId: currentTerm.id } : {};

    const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});
    // Get current month and last month dates
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Today's date range
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Calculate monthly revenue (current month)
    const monthlyRevenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere('payment.paymentDate >= :startDate', { startDate: currentMonthStart })
      .andWhere('payment.paymentDate <= :endDate', { endDate: currentMonthEnd })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    // Calculate monthly revenue (last month)
    const monthlyRevenueLastMonthResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere('payment.paymentDate >= :startDate', { startDate: lastMonthStart })
      .andWhere('payment.paymentDate <= :endDate', { endDate: lastMonthEnd })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    // Calculate outstanding fees (expected fees - paid fees)
    // First get expected fees from fee structures
    const feeStructures = await this.feeStructureRepository.find({
      where: { isActive: true, ...termFilter, ...schoolScope },
    });

    const students = await this.studentRepository.count({
      where: { ...termFilter, ...schoolScope },
    });

    const expectedFees = feeStructures
      .filter(fs => !fs.isOptional)
      .reduce((sum, fs) => sum + (parseFloat(fs.amount.toString()) * students), 0);

    // Get total paid fees
    const paidFeesResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    const paidFees = parseFloat(paidFeesResult?.sum || '0');
    const outstandingFees = Math.max(0, expectedFees - paidFees);

    // Count payments today
    const paymentsToday = await this.paymentRepository.count({
      where: {
        status: 'completed',
        paymentDate: Between(todayStart, todayEnd),
        ...termFilter,
        ...schoolScope,
      },
    });

    // Calculate collection rate (completed payments vs total expected)
    // This is a simplified calculation - you might want to get expected fees from fee expectations
    const totalCompletedPayments = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    // For collection rate, we need expected fees. Let's get it from fee expectations or use a default
    // This is a simplified version - you might want to calculate based on student fee expectations
    const expectedFeesResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status IN (:...statuses)', { statuses: ['completed', 'pending'] })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    const totalExpected = parseFloat(expectedFeesResult?.sum || '0');
    const totalCollected = parseFloat(totalCompletedPayments?.sum || '0');
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    return {
      monthlyRevenue: parseFloat(monthlyRevenueResult?.sum || '0'),
      monthlyRevenueLastMonth: parseFloat(monthlyRevenueLastMonthResult?.sum || '0'),
      outstandingFees: outstandingFees,
      paymentsToday,
      collectionRate,
    };
  }

  /**
   * Set the processor (admin user) for a payment record.
   * Used to ensure `processedByAdminId` is populated when payments are created
   * by controllers that have the authenticated user available.
   */
  async setPaymentProcessor(paymentId: string, adminUserId: string) {
    if (!paymentId || !adminUserId) return;
    try {
      await this.paymentRepository.query(
        'UPDATE fee_payment SET "processedByAdminId" = $1 WHERE id = $2',
        [adminUserId, paymentId]
      );
    } catch (err) {
      // Log but do not fail the main flow
      try { console.error('Failed to set payment processor for', paymentId, err.message); } catch {}
    }
  }

  async getPaymentMethodDistribution(schoolId?: string, superAdmin = false) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});

    const paymentMethodsResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.paymentMethod', 'method')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(payment.amount)', 'total')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .groupBy('payment.paymentMethod')
      .getRawMany();

    const totalPayments = paymentMethodsResult.reduce((sum, item) => sum + parseInt(item.count), 0);

    return paymentMethodsResult.map(item => ({
      method: item.method,
      count: parseInt(item.count),
      total: parseFloat(item.total || '0'),
      percentage: totalPayments > 0 ? Math.round((parseInt(item.count) / totalPayments) * 100) : 0,
    }));
  }

  async getOutstandingFeesBreakdown(schoolId?: string, superAdmin = false) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const termFilter = currentTerm ? { termId: currentTerm.id } : {};
    const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});

    // Get all classes for the school/term
    const classes = await this.classRepository.find({
      where: {
        ...schoolScope,
      },
      order: { numericalName: 'ASC' },
    });

    // Get fee structures for the term
    const feeStructures = await this.feeStructureRepository.find({
      where: { isActive: true, ...termFilter, ...schoolScope },
    });

    const classBreakdown: Array<{
      class: string;
      outstandingFees: number;
      expectedFees: number;
      paidFees: number;
      studentCount: number;
    }> = [];

    for (const classEntity of classes) {
      // Get students in this class
      const studentsInClass = await this.studentRepository.count({
        where: {
          class: { id: classEntity.id },
          ...termFilter,
          ...schoolScope,
        },
      });

      if (studentsInClass === 0) continue; // Skip classes with no students

      // Calculate expected fees for this class
      // Fee structures can be class-specific or apply to all classes
      const applicableFeeStructures = feeStructures.filter(fs =>
        !fs.classId || fs.classId === classEntity.id
      );

      const expectedFees = applicableFeeStructures
        .filter(fs => !fs.isOptional)
        .reduce((sum, fs) => sum + (parseFloat(fs.amount.toString()) * studentsInClass), 0);

      // Get paid fees for students in this class
      const paidFeesResult = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .leftJoin('payment.student', 'student')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('student.classId = :classId', { classId: classEntity.id })
        .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
        .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
        .getRawOne();

      const paidFees = parseFloat(paidFeesResult?.sum || '0');
      const outstandingFees = Math.max(0, expectedFees - paidFees);

      classBreakdown.push({
        class: classEntity.name,
        outstandingFees: outstandingFees,
        expectedFees: expectedFees,
        paidFees: paidFees,
        studentCount: studentsInClass,
      });
    }

    // Calculate total outstanding fees for percentages
    const totalOutstandingFees = classBreakdown.reduce((sum, item) => sum + item.outstandingFees, 0);

    return classBreakdown.map(item => ({
      range: item.class, // Keep 'range' for frontend compatibility
      amount: item.outstandingFees,
      percentage: totalOutstandingFees > 0 ? Math.round((item.outstandingFees / totalOutstandingFees) * 100) : 0,
    }));
  }

  async getOutstandingFeesLastMonth(schoolId?: string, superAdmin = false) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});

    // Get last month dates
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const lastMonthOutstandingResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'pending' })
      .andWhere('payment.createdAt >= :startDate', { startDate: lastMonthStart })
      .andWhere('payment.createdAt <= :endDate', { endDate: lastMonthEnd })
      .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
      .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
      .getRawOne();

    return parseFloat(lastMonthOutstandingResult?.sum || '0');
  }

  async getStudentsWithOutstandingFees(schoolId?: string, superAdmin = false): Promise<number> {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
    const termFilter = currentTerm ? { termId: currentTerm.id } : {};
    const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});

    // Get all students for the school/term
    const students = await this.studentRepository.find({
      where: {
        ...schoolScope,
        ...termFilter,
      },
      relations: ['class'],
    });

    let studentsWithOutstandingFees = 0;

    for (const student of students) {
      // Get fee structures applicable to this student
      const feeStructures = await this.feeStructureRepository
        .createQueryBuilder('fee_structure')
        .where('fee_structure.isActive = :isActive', { isActive: true })
        .andWhere(currentTerm ? 'fee_structure.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
        .andWhere(schoolScope.schoolId ? 'fee_structure.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
        .andWhere('(fee_structure.classId IS NULL OR fee_structure.classId = :classId)', { classId: student.class?.id })
        .getMany();

      // Calculate expected fees for this student
      const expectedFees = feeStructures
        .filter(fs => !fs.isOptional)
        .reduce((sum, fs) => sum + parseFloat(fs.amount.toString()), 0);

      // Get paid fees for this student
      const paidFeesResult = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.studentId = :studentId', { studentId: student.id })
        .andWhere(currentTerm ? 'payment.termId = :termId' : '1=1', currentTerm ? { termId: currentTerm.id } : {})
        .andWhere(schoolScope.schoolId ? 'payment.schoolId = :schoolId' : '1=1', schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {})
        .getRawOne();

      const paidFees = parseFloat(paidFeesResult?.sum || '0');
      const outstandingFees = Math.max(0, expectedFees - paidFees);

      if (outstandingFees > 0) {
        studentsWithOutstandingFees++;
      }
    }

    return studentsWithOutstandingFees;
  }

  /**
   * Get comprehensive financial details for a student including multi-term transaction history
   */
  async getStudentFinancialDetails(
    studentId: string, 
    schoolId?: string, 
    superAdmin = false,
    academicCalendarId?: string
  ) {
    // Get student with class information
    const studentQuery: any = { id: studentId };
    if (!superAdmin && schoolId) {
      studentQuery.schoolId = schoolId;
    }

    const student = await this.studentRepository.findOne({
      where: studentQuery,
      relations: ['class', 'user', 'enrollmentTerm', 'enrollmentTerm.academicCalendar', 'graduationTerm', 'graduationTerm.academicCalendar']
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get all terms - for proper historical tracking, we need ALL terms, not just active calendar
    // We'll filter by enrollment date later for active students
    let termsQuery = `
      SELECT t.id, t."termNumber", t."startDate", t."endDate", ac.term as academic_year,
             ac.id as academic_calendar_id, ac."startDate" as academic_calendar_start_date
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
    `;
    
    const queryParams: any[] = [];
    let hasWhereClause = false;
    
    // If specific academic calendar requested, filter to that
    if (academicCalendarId) {
      termsQuery += ` WHERE t."academicCalendarId"::uuid = $1`;
      queryParams.push(academicCalendarId);
      hasWhereClause = true;
    } else {
      // Otherwise, get ALL terms across all calendars (we'll filter by enrollment later)
      // This is important for students who enrolled in previous academic years
      termsQuery += ` WHERE 1=1`;
      hasWhereClause = true;
    }

    if (!superAdmin && schoolId) {
      termsQuery += hasWhereClause ? ` AND ` : ` WHERE `;
      termsQuery += `t."schoolId" = $${queryParams.length + 1}`;
      queryParams.push(schoolId);
    }

    termsQuery += ` ORDER BY COALESCE(ac."startDate", t."startDate") ASC, t."termNumber" ASC`;
    
    let terms = await this.studentRepository.query(termsQuery, queryParams);

    let enrollmentCutoffTermId = student.enrollmentTermId;
    if (!enrollmentCutoffTermId) {
      try {
        const earliestAcademicRecord = await this.studentRepository.query(
          `SELECT x."termId" FROM (
             SELECT e."termId"
             FROM enrollment e
             WHERE e."studentId"::uuid = $1
             ${!superAdmin && schoolId ? 'AND e."schoolId"::uuid = $2' : ''}
             UNION
             SELECT sar."termId"
             FROM student_academic_records sar
             WHERE sar."studentId"::uuid = $1
             ${!superAdmin && schoolId ? 'AND sar."schoolId"::uuid = $2' : ''}
             UNION
             SELECT sah.term_id as "termId"
             FROM student_academic_history sah
             WHERE sah.student_id::uuid = $1
             ${!superAdmin && schoolId ? 'AND sah.school_id::uuid = $2' : ''}
           ) x
           INNER JOIN term t ON x."termId" = t.id
           LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
           ORDER BY COALESCE(ac."startDate", t."startDate", t."createdAt") ASC, t."termNumber" ASC
           LIMIT 1`,
          !superAdmin && schoolId ? [studentId, schoolId] : [studentId],
        );

        if (earliestAcademicRecord?.length > 0 && earliestAcademicRecord[0]?.termId) {
          enrollmentCutoffTermId = earliestAcademicRecord[0].termId;
          console.log(`ℹ️  Enrollment cutoff inferred from earliest academic record: ${enrollmentCutoffTermId}`);
        }
      } catch (error) {
        console.log(`⚠️  Failed to infer enrollment cutoff from academic records: ${error?.message || error}`);
      }
    }

    // Check if student is graduated based on class name
    const isGraduated = student.class?.name && /graduated|alumni|leavers/i.test(student.class.name);

    if (isGraduated) {
      // For graduated students, filter terms from enrollment to graduation
      
      // Filter to terms from enrollment term onwards using term sequence (not dates)
      if (enrollmentCutoffTermId) {
        const enrollmentTermIndex = terms.findIndex(
          (term: any) => term.id === enrollmentCutoffTermId,
        );
        if (enrollmentTermIndex >= 0) {
          terms = terms.filter((_: any, index: number) => index >= enrollmentTermIndex);
        } else {
          console.log(`⚠️  Enrollment cutoff term ${enrollmentCutoffTermId} not found in term list. Keeping all terms.`);
        }
      }
      
      // Use graduationTermId if set (preferred method)
      if (student.graduationTermId && student.graduationTerm) {
        const graduationTermIndex = terms.findIndex(
          (term: any) => term.id === student.graduationTermId,
        );
        if (graduationTermIndex >= 0) {
          // Only include terms up to and including graduation term
          terms = terms.filter((_: any, index: number) => index <= graduationTermIndex);
        } else {
          console.log(`⚠️  Graduation term ${student.graduationTermId} not found in term list. Keeping post-enrollment terms.`);
        }
        
        console.log(`🎓 Graduated student ${student.firstName} ${student.lastName}. Calculating fees for ${terms.length} terms (enrollment to graduation: ${student.graduationTerm.termNumber} of ${student.graduationTerm.academicCalendar?.term}).`);
      } else {
        // Fallback: Try to get academic records to determine graduation cutoff
        console.log(`⚠️  No graduationTermId set for ${student.firstName} ${student.lastName}. Attempting to infer from academic records...`);
        
        const academicRecords = await this.studentRepository.query(
          `SELECT sar."termId", sar.status, t."endDate"
           FROM student_academic_records sar 
           LEFT JOIN term t ON sar."termId" = t.id
           WHERE sar."studentId"::uuid = $1 
           ${!superAdmin && schoolId ? 'AND sar."schoolId"::uuid = $2' : ''}
           ORDER BY t."endDate" DESC`,
          !superAdmin && schoolId ? [studentId, schoolId] : [studentId]
        );
        
        if (academicRecords.length > 0) {
          const lastRecord = academicRecords[0];
          const inferredGraduationTermIndex = terms.findIndex(
            (term: any) => term.id === lastRecord.termId,
          );
          if (inferredGraduationTermIndex >= 0) {
            terms = terms.filter((_: any, index: number) => index <= inferredGraduationTermIndex);
          }
          
          console.log(`   → Inferred graduation from last academic record. Calculating fees for ${terms.length} terms.`);
        } else {
          // No graduation term or academic records found, use all terms from enrollment
          console.log(`   → WARNING: No academic records found. Using all ${terms.length} terms from enrollment (may be incorrect).`);
        }
      }
    } else {
      // For active students, filter terms to only include those from enrollment term onwards
      // using term sequence (not dates)
      if (enrollmentCutoffTermId) {
        const enrollmentTermIndex = terms.findIndex(
          (term: any) => term.id === enrollmentCutoffTermId,
        );
        if (enrollmentTermIndex >= 0) {
          terms = terms.filter((_: any, index: number) => index >= enrollmentTermIndex);
        } else {
          console.log(`⚠️  Enrollment cutoff term ${enrollmentCutoffTermId} not found in term list. Keeping all terms.`);
        }

        const enrollmentLabel = student.enrollmentTerm
          ? `Term ${student.enrollmentTerm.termNumber} (${student.enrollmentTerm.academicCalendar?.term})`
          : `termId cutoff (${student.termId})`;
        console.log(`✅ Student ${student.firstName} ${student.lastName} enrollment cutoff: ${enrollmentLabel}. Charging fees for ${terms.length} terms from cutoff onwards (across all academic years).`);
      } else {
        console.log(`⚠️  Student ${student.firstName} ${student.lastName} has NO enrollment term set. Charging for all ${terms.length} terms (this may be incorrect).`);
      }
    }

    // Build comprehensive financial summary
    const termFinancialData = [];
    let totalExpectedAllTerms = 0;
    let totalPaidAllTerms = 0;
    
    // Get all transactions for this student across ALL academic calendars
    // (Do NOT filter by academicCalendarId here - we want to show all payment history)
    // Only filter TERMS by enrollment date, not transactions
    const allTransactions = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.term', 'term')
      .leftJoinAndSelect('term.academicCalendar', 'academicCalendar')
      .leftJoinAndSelect('payment.processedByAdmin', 'processedByAdmin')
      .leftJoinAndSelect('payment.processedBy', 'processedBy')
      .leftJoinAndSelect('payment.allocations', 'allocations')
      .leftJoinAndSelect('allocations.term', 'allocationTerm')
      .leftJoinAndSelect('allocationTerm.academicCalendar', 'allocationAcademicCalendar')
      .where('payment.studentId = :studentId', { studentId })
      .andWhere('payment.status = :status', { status: 'completed' })
      .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
      // NOTE: Removed academicCalendarId filter here so ALL payment history shows
      .orderBy('payment.paymentDate', 'DESC')
      .getMany();

    // Process each term
    for (const term of terms) {
      // Get fee structures for this term
      const feeStructures = await this.feeStructureRepository.find({
        where: {
          termId: term.id,
          isActive: true,
          ...(schoolId && !superAdmin ? { schoolId } : {})
        }
      });

      // Calculate expected fees for this term
      const expectedMandatory = feeStructures
        .filter(fs => !fs.isOptional && (!fs.classId || fs.classId === student.class?.id))
        .reduce((sum, fs) => sum + Number(fs.amount), 0);
      
      const expectedOptional = feeStructures
        .filter(fs => fs.isOptional && (!fs.classId || fs.classId === student.class?.id))
        .reduce((sum, fs) => sum + Number(fs.amount), 0);

      // Calculate total paid for this term by summing allocations (not just payments)
      // This ensures we count credits that were auto-applied to previous terms
      let totalPaid = 0;
      
      for (const payment of allTransactions) {
        if (payment.allocations && payment.allocations.length > 0) {
          // Sum allocations for this specific term.
          // Exclude 'Credit Balance' allocations - these represent surplus/overpayment
          // that is tracked in the credit ledger and applied separately as a new
          // credit_application payment.  Including them would double-count money
          // that has already been credited to another term.
          const termAllocations = payment.allocations.filter(
            alloc => alloc.termId === term.id && alloc.feeType !== 'Credit Balance'
          );
          totalPaid += termAllocations.reduce((sum, alloc) => sum + Number(alloc.allocatedAmount), 0);
        } else {
          // No allocations - count payment if it belongs to this term.
          // Skip credit_application payments that have no allocations to avoid
          // double-counting (they will be caught via PaymentAllocation in other cases).
          if (payment.termId === term.id && payment.paymentType !== 'credit_application') {
            totalPaid += Number(payment.amount);
          }
        }
      }

      // Include legacy/orphan active credits (credits without a source payment) for this term
      // so that Paid reflects the whole amount the school received even if credit rows were created
      // without a corresponding FeePayment record historically.
      try {
        const orphanCredits = await this.creditRepository.createQueryBuilder('credit')
          .select('SUM(credit.remainingAmount)', 'sum')
          .where('credit.studentId = :studentId', { studentId })
          .andWhere('credit.termId = :termId', { termId: term.id })
          .andWhere('credit.status = :status', { status: 'active' })
          .andWhere('credit.sourcePaymentId IS NULL')
          .andWhere(!superAdmin && schoolId ? 'credit.schoolId = :schoolId' : '1=1', { schoolId })
          .getRawOne();
        const orphanSum = Number(orphanCredits?.sum || 0);
        if (orphanSum > 0) totalPaid += orphanSum;
      } catch {}
      
      const outstanding = Math.max(0, expectedMandatory - totalPaid);
      const isCurrentTerm = term.id === (await this.settingsService.getCurrentTerm(schoolId))?.id;
      const isPastTerm = new Date() > new Date(term.endDate);

      // Count payments that have allocations to this term (for accurate payment count)
      const paymentCount = allTransactions.filter(payment => {
        if (payment.allocations && payment.allocations.length > 0) {
          return payment.allocations.some(alloc => alloc.termId === term.id);
        }
        return payment.termId === term.id;
      }).length;
      
      // Get last payment date from payments with allocations to this term
      const relevantPayments = allTransactions.filter(payment => {
        if (payment.allocations && payment.allocations.length > 0) {
          return payment.allocations.some(alloc => alloc.termId === term.id);
        }
        return payment.termId === term.id;
      });

      termFinancialData.push({
        termId: term.id,
        termNumber: term.termNumber,
        academicYear: term.academic_year,
        startDate: term.startDate,
        endDate: term.endDate,
        expectedMandatory,
        expectedOptional,
        totalExpected: expectedMandatory + expectedOptional,
        totalPaid,
        outstanding,
        status: outstanding === 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
        isCurrentTerm,
        isPastTerm,
        paymentCount,
        lastPaymentDate: relevantPayments[0]?.paymentDate,
        feeStructures: feeStructures.map(fs => ({
          feeType: fs.feeType,
          amount: Number(fs.amount),
          isOptional: fs.isOptional,
          frequency: fs.frequency
        }))
      });

      totalExpectedAllTerms += expectedMandatory + expectedOptional;
      totalPaidAllTerms += totalPaid;
    }

    // Get credit balance
    const creditBalance = await this.creditRepository
      .createQueryBuilder('credit')
      .select('SUM(credit.remainingAmount)', 'balance')
      .where('credit.studentId = :studentId', { studentId })
      .andWhere('credit.status = :status', { status: 'active' })
      .andWhere(!superAdmin && schoolId ? 'credit.schoolId = :schoolId' : '1=1', { schoolId })
      .getRawOne();

    // Also account for legacy orphan credits (no source payment across any term) in totalPaidAllTerms
    try {
      const orphanAll = await this.creditRepository.createQueryBuilder('credit')
        .select('SUM(credit.remainingAmount)', 'sum')
        .where('credit.studentId = :studentId', { studentId })
        .andWhere('credit.status = :status', { status: 'active' })
        .andWhere('credit.sourcePaymentId IS NULL')
        .andWhere(!superAdmin && schoolId ? 'credit.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();
      const orphanSumAll = Number(orphanAll?.sum || 0);
      if (orphanSumAll > 0) {
        totalPaidAllTerms += orphanSumAll;
      }
    } catch {}

    // Get historical data if available
    const historicalQuery = `
      SELECT 
        sah.term_id,
        sah.total_expected_fees AS total_expected,
        sah.total_paid_fees AS total_paid,
        sah.outstanding_fees AS outstanding_amount,
        sah.status,
        t."termNumber",
        ac.term as academic_year
      FROM student_academic_history sah
      LEFT JOIN term t ON sah.term_id::uuid = t.id
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
      WHERE sah.student_id::uuid = $1
      ${!superAdmin && schoolId ? 'AND sah.school_id = $2' : ''}
      ORDER BY t."termNumber" ASC
    `;

    const historyParams = [studentId];
    if (!superAdmin && schoolId) historyParams.push(schoolId);
    
    const historicalData = await this.studentRepository.query(historicalQuery, historyParams);

    // Fetch active credits to append as distinct transaction rows (Credit Balance)
    const activeCredits = await this.creditRepository.find({
      where: {
        student: { id: studentId } as any,
        status: 'active',
        ...(schoolId && !superAdmin ? { schoolId } : {}),
      },
      relations: [
        'sourcePayment',
        'sourcePayment.processedBy',
        'sourcePayment.processedByAdmin',
        'sourcePayment.term',
        'sourcePayment.term.academicCalendar',
        'term',
        'term.academicCalendar'
      ],
      order: { createdAt: 'DESC' as any },
    });

    const creditEntries = activeCredits.map((c: any) => {
      let source = c.sourcePayment;
      if (!source) {
        // Fallback to closest payment by timestamp from already-fetched allTransactions
        let best = null as any;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const p of allTransactions) {
          const diff = Math.abs(new Date(p.paymentDate).getTime() - new Date(c.createdAt).getTime());
          if (diff < bestDiff) {
            best = p;
            bestDiff = diff;
          }
        }
        // Use best match only if within same day (to avoid mismatches)
        if (best) {
          const sameDay = new Date(best.paymentDate).toDateString() === new Date(c.createdAt).toDateString();
          if (sameDay) source = best;
        }
      }

      return {
        id: `credit-${c.id}`,
        paymentId: source?.id || null,
        amount: Number((c.remainingAmount ?? c.amount) as any),
        paymentDate: source?.paymentDate || c.createdAt,
        paymentType: 'Credit Balance',
        paymentMethod: source?.paymentMethod || '-',
        receiptNumber: source?.receiptNumber || null,
        // capture term (where the payment was captured)
        termId: source?.termId || c.termId || null,
        termNumber: source?.term?.termNumber || c.term?.termNumber || null,
        academicYear: source?.term?.academicCalendar?.term || c.term?.academicCalendar?.term || null,
        // for-term: the term the credit is intended for (carry-forward/target)
        forTermId: c.termId || source?.termId || null,
        forTermNumber: c.term?.termNumber || source?.term?.termNumber || null,
        forAcademicYear: c.term?.academicCalendar?.term || source?.term?.academicCalendar?.term || null,
        status: 'completed',
        processedBy:
          source?.processedBy?.user?.username ||
          source?.processedByAdmin?.username ||
          (source?.processedBy
            ? `${source.processedBy.firstName} ${source.processedBy.lastName}`
            : '-'),
        isAllocationDetail: false,
        isCreditEntry: true,
      };
    });

    // Calculate actual debit/credit balance
    const balanceDifference = totalPaidAllTerms - totalExpectedAllTerms;
    const debitBalance = balanceDifference < 0 ? Math.abs(balanceDifference) : 0; // Student owes school
    const creditBalanceCalculated = balanceDifference > 0 ? balanceDifference : 0; // Student overpaid
    const creditBalanceFromLedger = Number(creditBalance?.balance || 0);
    const summaryCreditBalance = Math.max(creditBalanceCalculated, creditBalanceFromLedger);

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        email: student.user?.email,
        className: student.class?.name || 'No Class'
      },
      summary: {
        totalExpectedAllTerms,
        totalPaidAllTerms,
        totalOutstandingAllTerms: Math.max(0, totalExpectedAllTerms - totalPaidAllTerms),
        debitBalance: debitBalance, // Amount student owes
        creditBalance: summaryCreditBalance, // Prefer ledger when present, fallback to calculated
        paymentPercentage: totalExpectedAllTerms > 0 ? Math.round((totalPaidAllTerms / totalExpectedAllTerms) * 100) : 0
      },
      termBreakdown: termFinancialData,
      transactionHistory: (() => {
        const paymentRows = allTransactions.flatMap(payment => {
        // If payment has allocations, expand into separate entries
          if (payment.allocations && payment.allocations.length > 0) {
            return payment.allocations.map(allocation => ({
              id: `${payment.id}-${allocation.id}`,
              paymentId: payment.id,
              amount: Number(allocation.allocatedAmount),
              paymentDate: payment.paymentDate,
              paymentType: allocation.feeType || payment.paymentType,
              paymentMethod: payment.paymentMethod,
              receiptNumber: payment.receiptNumber,
              // `termId` represents the capture/collection term (where the transaction occurred)
              termId: payment.termId,
              termNumber: payment.term?.termNumber,
              academicYear: payment.term?.academicCalendar?.term,
              // `forTerm*` fields indicate the term the allocation applies to
              forTermId: allocation.termId,
              forTermNumber: allocation.term?.termNumber,
              forAcademicYear: allocation.term?.academicCalendar?.term,
              status: payment.status,
              notes: payment.notes,
              processedBy:
                payment.processedBy?.user?.username ||
                payment.processedByAdmin?.username ||
                (payment.processedBy
                  ? `${payment.processedBy.firstName} ${payment.processedBy.lastName}`
                  : '-'),
              allocationReason: allocation.allocationReason,
              isAllocationDetail: true,
              isCreditEntry: false,
            }));
          }
          // Otherwise show the payment as-is
          return [{
            id: payment.id,
            paymentId: payment.id,
            amount: Number(payment.amount),
            paymentDate: payment.paymentDate,
            paymentType: payment.paymentType,
            paymentMethod: payment.paymentMethod,
            receiptNumber: payment.receiptNumber,
            // capture/collection term
            termId: payment.termId,
            termNumber: payment.term?.termNumber,
            academicYear: payment.term?.academicCalendar?.term,
            // for-term is same as capture term for simple payments
            forTermId: payment.termId,
            forTermNumber: payment.term?.termNumber,
            forAcademicYear: payment.term?.academicCalendar?.term,
            status: payment.status,
            notes: payment.notes,
            processedBy:
              payment.processedBy?.user?.username ||
              payment.processedByAdmin?.username ||
              (payment.processedBy
                ? `${payment.processedBy.firstName} ${payment.processedBy.lastName}`
                : '-'),
            isAllocationDetail: false,
            isCreditEntry: false,
          }];
        });

        const combined = [...paymentRows, ...creditEntries].sort((a, b) => {
          // Put credit entries first
          if (!!a.isCreditEntry !== !!b.isCreditEntry) {
            return a.isCreditEntry ? -1 : 1;
          }
          // Then sort by date desc
          return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime();
        });
        return combined;
      })(),
      historicalData: historicalData.map((row: any) => ({
        termId: row.term_id,
        termNumber: row.termNumber,
        academicYear: row.academic_year,
        totalExpected: Number(row.total_expected || 0),
        totalPaid: Number(row.total_paid || 0),
        outstandingAmount: Number(row.outstanding_amount || 0),
        status: row.status
      })),
      metadata: {
        lastUpdated: new Date().toISOString(),
        academicCalendarId,
        schoolId: superAdmin ? schoolId : student.schoolId
      }
    };
  }

  /**
   * Auto-apply credit balance across all terms with outstanding fees
   * Applies to past overdue terms first, then current term
   */
  async autoApplyCreditAcrossAllTerms(
    studentId: string,
    schoolId?: string,
    superAdmin = false
  ): Promise<{
    success: boolean;
    totalCreditApplied: number;
    termsProcessed: number;
    applications: Array<{
      termId: string;
      termName: string;
      creditApplied: number;
      outstandingBefore: number;
      outstandingAfter: number;
    }>;
    remainingCredit: number;
    message: string;
  }> {
    console.log('\n\n========================================');
    console.log('🚀🚀🚀 AUTO-APPLY CREDIT - LATEST VERSION 🚀🚀🚀');
    console.log(`Student ID: ${studentId}`);
    console.log(`School ID: ${schoolId}`);
    console.log(`Super Admin: ${superAdmin}`);
    console.log('========================================\n');
    
    try {
      // Get all active credits for the student
      console.log('STEP 1: Fetching active credits...');
      const activeCredits = await this.creditRepository.find({
        where: {
          student: { id: studentId } as any,
          status: 'active',
          ...(schoolId && !superAdmin ? { schoolId } : {})
        },
        order: { createdAt: 'ASC' }
      });

      const totalCreditAvailable = activeCredits.reduce(
        (sum, credit) => sum + Number(credit.remainingAmount),
        0
      );

      console.log(`   Found ${activeCredits.length} active credits, Total: MK ${totalCreditAvailable}`);

      if (totalCreditAvailable <= 0) {
        console.log('   ❌ No credit available - returning early');
        return {
          success: false,
          totalCreditApplied: 0,
          termsProcessed: 0,
          applications: [],
          remainingCredit: 0,
          message: 'No credit balance available'
        };
      }

      // Get student information first to determine their school
      console.log('STEP 2: Fetching student information...');
      const student = await this.studentRepository.findOne({
        where: { id: studentId },
        relations: ['class', 'school', 'enrollmentTerm', 'enrollmentTerm.academicCalendar', 'graduationTerm']
      });

      if (!student) {
        throw new Error('Student not found');
      }

      console.log(`   Student: ${student.firstName} ${student.lastName}`);
      console.log(`   Class: ${student.class?.name || 'N/A'} (${student.classId || 'N/A'})`);
      console.log(`   School: ${student.schoolId}`);
      
      // Check if student is graduated
      const isGraduated = !!student.graduationTermId;
      if (isGraduated) {
        console.log(`   🎓 GRADUATED STUDENT - Graduation Term: ${student.graduationTermId}`);
        if (student.graduationTerm) {
          console.log(`      Graduation Term: Term ${student.graduationTerm.termNumber} (${student.graduationTerm.academicCalendar?.term})`);
          console.log(`      Graduation End Date: ${student.graduationTerm.endDate}`);
        }
        console.log(`   ⚠️  Credits will NOT be applied to terms after graduation!`);
      }
      
      let enrollmentCutoffTermId = student.enrollmentTermId;
      if (!enrollmentCutoffTermId) {
        try {
          const earliestAcademicRecord = await this.studentRepository.query(
            `SELECT x."termId" FROM (
               SELECT e."termId"
               FROM enrollment e
               WHERE e."studentId"::uuid = $1
               ${!superAdmin && schoolId ? 'AND e."schoolId"::uuid = $2' : ''}
               UNION
               SELECT sar."termId"
               FROM student_academic_records sar
               WHERE sar."studentId"::uuid = $1
               ${!superAdmin && schoolId ? 'AND sar."schoolId"::uuid = $2' : ''}
               UNION
               SELECT sah.term_id as "termId"
               FROM student_academic_history sah
               WHERE sah.student_id::uuid = $1
               ${!superAdmin && schoolId ? 'AND sah.school_id::uuid = $2' : ''}
             ) x
             INNER JOIN term t ON x."termId" = t.id
             LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
             ORDER BY COALESCE(ac."startDate", t."startDate", t."createdAt") ASC, t."termNumber" ASC
             LIMIT 1`,
            !superAdmin && schoolId ? [studentId, schoolId] : [studentId],
          );

          if (earliestAcademicRecord?.length > 0 && earliestAcademicRecord[0]?.termId) {
            enrollmentCutoffTermId = earliestAcademicRecord[0].termId;
            console.log(`   ℹ️  Enrollment cutoff inferred from earliest academic record: ${enrollmentCutoffTermId}`);
          }
        } catch (error) {
          console.log(`   ⚠️  Failed to infer enrollment cutoff from academic records: ${error?.message || error}`);
        }
      }
      if (enrollmentCutoffTermId) {
        if (student.enrollmentTerm) {
          console.log(`   📅 Enrollment Term: Term ${student.enrollmentTerm.termNumber} (${student.enrollmentTerm.academicCalendar?.term})`);
          console.log(`   Enrollment Start: ${student.enrollmentTerm.startDate}`);
        } else {
          console.log(`   Enrollment Cutoff Term ID: ${enrollmentCutoffTermId}`);
        }
      } else {
        console.log(`   ⚠️  NO ENROLLMENT TERM SET - Will apply credits to ALL terms (may be incorrect)`);
      }

      // Always use the student's school for term queries
      const studentSchoolId = superAdmin && schoolId ? schoolId : student.schoolId;

      console.log(`STEP 3: Fetching ALL terms for school ${studentSchoolId}...`);
      // Get ALL terms for the student's school (including current and past)
      let terms = await this.termRepository.find({
        where: { schoolId: studentSchoolId },
        relations: ['academicCalendar'],
        order: { startDate: 'ASC' }
      });

      terms = [...terms].sort((a, b) => {
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

      console.log(`   ✅ Fetched ${terms.length} terms before enrollment filter`);
      
      // Filter terms to only include those from enrollment term onwards (term sequence)
      if (enrollmentCutoffTermId) {
        const termsBeforeFilter = terms.length;

        const enrollmentTermIndex = terms.findIndex(
          (term: any) => term.id === enrollmentCutoffTermId,
        );
        if (enrollmentTermIndex >= 0) {
          terms = terms.filter((_: any, index: number) => index >= enrollmentTermIndex);
        } else {
          console.log(`   ⚠️  Enrollment cutoff term ${enrollmentCutoffTermId} not found in school term list. Keeping all terms.`);
        }
        
        console.log(`   🔍 Enrollment Filter Applied:`);
        console.log(`      - Terms before filter: ${termsBeforeFilter}`);
        console.log(`      - Terms after filter: ${terms.length}`);
        console.log(`      - Filtered out: ${termsBeforeFilter - terms.length} terms (before enrollment)`);
        console.log(`   ✅ Student will ONLY be charged/credited for fees from Term ${student.enrollmentTerm.termNumber} onwards`);
      }
      
      // For graduated students, also filter out terms after graduation (term sequence)
      if (isGraduated && student.graduationTerm) {
        const termsBeforeGraduationFilter = terms.length;

        const graduationTermIndex = terms.findIndex(
          (term: any) => term.id === student.graduationTermId,
        );
        if (graduationTermIndex >= 0) {
          terms = terms.filter((_: any, index: number) => index <= graduationTermIndex);
        } else {
          console.log(`   ⚠️  Graduation term ${student.graduationTermId} not found in school term list. Keeping post-enrollment terms.`);
        }
        
        console.log(`   🎓 Graduation Filter Applied:`);
        console.log(`      - Terms before graduation filter: ${termsBeforeGraduationFilter}`);
        console.log(`      - Terms after graduation filter: ${terms.length}`);
        console.log(`      - Filtered out: ${termsBeforeGraduationFilter - terms.length} terms (after graduation)`);
        console.log(`   ✅ Credits will ONLY be applied to fees up to graduation term (Term ${student.graduationTerm.termNumber} of ${student.graduationTerm.academicCalendar?.term})`);
      }
      
      if (terms.length > 0) {
        console.log(`   Terms list (after enrollment and graduation filters):`);
        terms.forEach(t => {
          console.log(`      - Term ${t.termNumber} (${t.academicCalendar?.term}): ID=${t.id.substring(0, 8)}..., isCurrent=${t.isCurrent}`);
        });
      }

      if (terms.length === 0) {
        console.log(`   ❌ ERROR: No terms found for school ${studentSchoolId} after enrollment filter`);
        return {
          success: false,
          totalCreditApplied: 0,
          termsProcessed: 0,
          applications: [],
          remainingCredit: totalCreditAvailable,
          message: 'No terms found for student (after enrollment term filter)'
        };
      }
      // Get current term
      console.log(`STEP 4: Finding current term...`);
      const currentTerm = await this.termRepository.findOne({
        where: { 
          isCurrent: true,
          schoolId: studentSchoolId
        }
      });

      if (currentTerm) {
        console.log(`   ✅ Current term: Term ${currentTerm.termNumber} (${currentTerm.academicCalendar?.term})`);
        console.log(`      ID: ${currentTerm.id}`);
      } else {
        console.log(`   ⚠️  WARNING: No current term found!`);
      }

      // Check each term for outstanding fees and apply credit
      const applications: Array<{
        termId: string;
        termName: string;
        creditApplied: number;
        outstandingBefore: number;
        outstandingAfter: number;
      }> = [];

      let totalCreditApplied = 0;
      let remainingCredit = totalCreditAvailable;

      // Separate past terms from current term
      // Past terms = ALL terms that are not the current term
      console.log(`\nSTEP 5: Filtering past terms...`);
      console.log(`   Current term ID for comparison: ${currentTerm?.id || 'NONE'}`);
      console.log(`   Filtering logic: t.id !== currentTerm?.id && !t.isCurrent`);
      
      const pastTerms = terms.filter(t => {
        const isNotCurrent = t.id !== currentTerm?.id && !t.isCurrent;
        console.log(`      - Term ${t.termNumber}: isCurrent=${t.isCurrent}, ID matches currentTerm=${t.id === currentTerm?.id} => Include in pastTerms: ${isNotCurrent}`);
        return isNotCurrent;
      });
      
      console.log(`   ✅ Result: ${pastTerms.length} past terms to check`);
      if (pastTerms.length > 0) {
        console.log(`   Past terms: ${pastTerms.map(t => `Term ${t.termNumber} (${t.academicCalendar?.term})`).join(', ')}`);
      } else {
        console.log(`   ⚠️  WARNING: No past terms found! All ${terms.length} terms may be current.`);
      }
      
      // Sort past terms by start date (oldest first) to prioritize older debts
      pastTerms.sort((a, b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );

      console.log(`\nSTEP 6: Processing past terms (oldest first)...`);
      console.log(`   Credit available: MK ${totalCreditAvailable}`);
      console.log(`   Terms to process: ${pastTerms.length}\n`);

      if (!student) {
        throw new Error('Student not found');
      }

      for (const term of pastTerms) {
        if (remainingCredit <= 0) {
          console.log(`   ⏭️  Skipping remaining terms - no credit left`);
          break;
        }

        try {
          console.log(`   📅 Processing Term ${term.termNumber} (${term.academicCalendar?.term})...`);
          console.log(`      Term ID: ${term.id}`);
          console.log(`      Remaining credit: MK ${remainingCredit}`);
          
          // Calculate outstanding by directly querying fee structures and payments
          console.log(`      Fetching fee structures...`);
          const feeStructures = await this.feeStructureRepository.find({
            where: {
              termId: term.id,
              isActive: true,
              schoolId: studentSchoolId
            }
          });

          console.log(`      Found ${feeStructures.length} fee structures:`);
          feeStructures.forEach(fs => {
            const applies = !fs.classId || fs.classId === student.classId;
            console.log(`         - ${fs.feeType}: MK ${fs.amount} ${fs.isOptional ? '[OPTIONAL]' : '[MANDATORY]'} ${applies ? '✓ Applies to student' : '✗ Other class'}`);
          });

          const expectedMandatory = feeStructures
            .filter(fs => !fs.isOptional && (!fs.classId || fs.classId === student.class?.id))
            .reduce((sum, fs) => sum + Number(fs.amount), 0);

          // Calculate paid amount using allocations TO this term (not raw payments).
          // Exclude 'Credit Balance' allocations - those represent overpayment surplus
          // and would cause double-counting when credits are later applied as new payments.
          console.log(`      Calculating paid via allocations...`);
          const allocationsToTerm = await this.paymentAllocationRepository
            .createQueryBuilder('pa')
            .innerJoin('pa.payment', 'p')
            .select('COALESCE(SUM(pa.allocatedAmount), 0)', 'sum')
            .where('pa.termId = :termId', { termId: term.id })
            .andWhere('p.studentId = :studentId', { studentId })
            .andWhere('p.status = :status', { status: 'completed' })
            .andWhere('p.schoolId = :schoolId', { schoolId: studentSchoolId })
            .andWhere("pa.feeType != 'Credit Balance'")
            .getRawOne();

          const totalPaid = parseFloat(allocationsToTerm?.sum || '0');
          console.log(`      Found allocations to this term: MK ${totalPaid}`);
          
          const outstanding = Math.max(0, expectedMandatory - totalPaid);

          console.log(`      Expected (Mandatory): MK ${expectedMandatory}`);
          console.log(`      Total Paid: MK ${totalPaid}`);
          console.log(`      Outstanding: MK ${outstanding}`);
          
          if (outstanding > 0) {
            console.log(`      ✓ Outstanding found! Applying credit...`);
            console.log(`      Calling autoApplyCreditToOutstandingFees for Term ${term.termNumber}...`);
            
            const result = await this.autoApplyCreditToOutstandingFees(
              studentId,
              term.id,
              schoolId,
              superAdmin
            );

            console.log(`      Result: success=${result.success}, creditApplied=MK ${result.creditApplied}`);

            if (result.success && result.creditApplied > 0) {
              console.log(`      ✅ Applied MK ${result.creditApplied} to Term ${term.termNumber}`);
              console.log(`      Outstanding after: MK ${result.outstandingAfterCredit}`);
              console.log(`      Remaining credit: MK ${result.remainingCredit}`);
              
              applications.push({
                termId: term.id,
                termName: `Term ${term.termNumber} - ${term.academicCalendar?.term}`,
                creditApplied: result.creditApplied,
                outstandingBefore: outstanding,
                outstandingAfter: result.outstandingAfterCredit
              });

              totalCreditApplied += result.creditApplied;
              remainingCredit = result.remainingCredit;
            } else {
              console.log(`      ⚠️  Credit application returned success=false or creditApplied=0`);
            }
          } else {
            console.log(`      ⊘ No outstanding fees for this term`);
          }
        } catch (error) {
          console.error(`      ✗ Error applying credit to term ${term.id}:`, error.message);
          console.error(error.stack);
        }
      }

      console.log(`\nSTEP 7: Checking current term (if credit remains)...`);
      // Then apply to current term if there's still credit remaining
      // BUT: Skip current term if student is graduated and current term is after graduation
      if (currentTerm && remainingCredit > 0) {
        // Check if current term is after graduation for graduated students (term sequence)
        if (isGraduated && student.graduationTerm) {
          const currentTermIndex = terms.findIndex((term: any) => term.id === currentTerm.id);
          const graduationTermIndex = terms.findIndex((term: any) => term.id === student.graduationTermId);

          if (
            currentTermIndex >= 0 &&
            graduationTermIndex >= 0 &&
            currentTermIndex > graduationTermIndex
          ) {
            console.log(`   ⊘ SKIPPING current term - student graduated in Term ${student.graduationTerm.termNumber} of ${student.graduationTerm.academicCalendar?.term}`);
            console.log(`      Current term (Term ${currentTerm.termNumber} of ${currentTerm.academicCalendar?.term}) is after graduation term`);
            console.log(`      Remaining credit: MK ${remainingCredit} will NOT be applied to current term`);
            
            // Return with remaining credit - do not apply to current term
            console.log('\n========================================');
            console.log(`✅ AUTO-APPLY CREDIT COMPLETE (Graduated Student)`);
            console.log(`   Total Credit Applied: MK ${totalCreditApplied}`);
            console.log(`   Terms Processed: ${applications.length}`);
            console.log(`   Remaining Credit: MK ${remainingCredit} (not applied to current term - student graduated)`);
            console.log('========================================\n\n');
            
            return {
              success: true,
              totalCreditApplied,
              termsProcessed: applications.length,
              applications,
              remainingCredit,
              message: `Applied MK ${totalCreditApplied} to ${applications.length} term(s) up to graduation. Remaining MK ${remainingCredit} not applied (student graduated).`
            };
          }
        }
        
        try {
          console.log(`   Processing Current Term ${currentTerm.termNumber}...`);
          console.log(`   Remaining credit: MK ${remainingCredit}`);
          
          // Calculate outstanding by directly querying fee structures and allocations
          const feeStructures = await this.feeStructureRepository.find({
            where: {
              termId: currentTerm.id,
              isActive: true,
              schoolId: studentSchoolId
            }
          });

          const expectedMandatory = feeStructures
            .filter(fs => !fs.isOptional && (!fs.classId || fs.classId === student.class?.id))
            .reduce((sum, fs) => sum + Number(fs.amount), 0);

          // Calculate paid amount using allocations TO current term (not raw payments).
          // Exclude 'Credit Balance' allocations to prevent double-counting.
          const allocationsToCurrentTerm = await this.paymentAllocationRepository
            .createQueryBuilder('pa')
            .innerJoin('pa.payment', 'p')
            .select('COALESCE(SUM(pa.allocatedAmount), 0)', 'sum')
            .where('pa.termId = :termId', { termId: currentTerm.id })
            .andWhere('p.studentId = :studentId', { studentId })
            .andWhere('p.status = :status', { status: 'completed' })
            .andWhere('p.schoolId = :schoolId', { schoolId: studentSchoolId })
            .andWhere("pa.feeType != 'Credit Balance'")
            .getRawOne();

          const totalPaid = parseFloat(allocationsToCurrentTerm?.sum || '0');
          const outstanding = Math.max(0, expectedMandatory - totalPaid);

          console.log(`     Expected: MK ${expectedMandatory}, Paid: MK ${totalPaid}`);
          console.log(`     Outstanding: MK ${outstanding}`);
          
          if (outstanding > 0) {
            console.log(`     ✓ Applying credit to Current Term ${currentTerm.termNumber}...`);
            
            const result = await this.autoApplyCreditToOutstandingFees(
              studentId,
              currentTerm.id,
              schoolId,
              superAdmin
            );

            console.log(`   Result: success=${result.success}, creditApplied=MK ${result.creditApplied}`);

            if (result.success && result.creditApplied > 0) {
              console.log(`   ✅ Applied MK ${result.creditApplied} to Current Term`);
              console.log(`   Outstanding after: MK ${result.outstandingAfterCredit}`);
              console.log(`   Remaining credit: MK ${result.remainingCredit}`);
              
              applications.push({
                termId: currentTerm.id,
                termName: `Term ${currentTerm.termNumber} - ${currentTerm.academicCalendar?.term} (Current)`,
                creditApplied: result.creditApplied,
                outstandingBefore: outstanding,
                outstandingAfter: result.outstandingAfterCredit
              });

              totalCreditApplied += result.creditApplied;
              remainingCredit = result.remainingCredit;
            } else {
              console.log(`   ⚠️  Credit application returned success=false or creditApplied=0`);
            }
          } else {
            console.log(`   ⊘ No outstanding fees in current term`);
          }
        } catch (error) {
          console.error(`   ✗ Error applying credit to current term:`, error.message);
          console.error(error.stack);
        }
      } else {
        if (!currentTerm) {
          console.log(`   ⚠️  No current term to check`);
        }
        if (remainingCredit <= 0) {
          console.log(`   ⚠️  No remaining credit to apply`);
        }
      }

      console.log(`\n========================================`);
      console.log(`📊 FINAL SUMMARY`);
      console.log(`========================================`);
      console.log(`Total Credit Applied: MK ${totalCreditApplied}`);
      console.log(`Terms Processed: ${applications.length}`);
      console.log(`Remaining Credit: MK ${remainingCredit}`);
      if (applications.length > 0) {
        console.log(`\nApplications:`);
        applications.forEach((app, i) => {
          console.log(`  ${i + 1}. ${app.termName}:`);
          console.log(`     Applied: MK ${app.creditApplied}`);
          console.log(`     Outstanding Before: MK ${app.outstandingBefore}`);
          console.log(`     Outstanding After: MK ${app.outstandingAfter}`);
        });
      }
      console.log(`========================================\n`);

      return {
        success: applications.length > 0,
        totalCreditApplied,
        termsProcessed: applications.length,
        applications,
        remainingCredit,
        message: applications.length > 0
          ? `Applied MK ${totalCreditApplied.toLocaleString()} credit to ${applications.length} term(s). Remaining credit: MK ${remainingCredit.toLocaleString()}`
          : 'No outstanding fees found to apply credit to'
      };

    } catch (error) {
      console.error('Error auto-applying credit across terms:', error);
      throw error;
    }
  }

  /**
   * Auto-apply credit balance to outstanding fees for a student in a specific term
   */
  async autoApplyCreditToOutstandingFees(
    studentId: string,
    termId: string,
    schoolId?: string,
    superAdmin = false
  ): Promise<{
    success: boolean;
    creditApplied: number;
    paymentCreated: boolean;
    remainingCredit: number;
    outstandingAfterCredit: number;
    message: string;
  }> {
    try {
      const activeCredits = await this.creditRepository.find({
        where: {
          student: { id: studentId } as any,
          status: 'active',
          ...(schoolId && !superAdmin ? { schoolId } : {})
        },
        order: { createdAt: 'ASC' }
      });

      const totalCreditAvailable = activeCredits.reduce(
        (sum, credit) => sum + Number(credit.remainingAmount),
        0
      );

      if (totalCreditAvailable <= 0) {
        return {
          success: false,
          creditApplied: 0,
          paymentCreated: false,
          remainingCredit: 0,
          outstandingAfterCredit: 0,
          message: 'No credit balance available'
        };
      }

      const feeStatus = await this.studentFeeExpectationService.getStudentFeeStatus(
        studentId,
        termId,
        schoolId,
        superAdmin
      );

      const outstandingAmount = Number(feeStatus.outstanding || 0);

      if (outstandingAmount <= 0) {
        return {
          success: false,
          creditApplied: 0,
          paymentCreated: false,
          remainingCredit: totalCreditAvailable,
          outstandingAfterCredit: 0,
          message: 'No outstanding fees to apply credit to'
        };
      }

      const creditToApply = Math.min(totalCreditAvailable, outstandingAmount);

      const student = await this.studentRepository.findOne({
        where: { id: studentId },
        relations: ['class']
      });

      const term = await this.termRepository.findOne({
        where: { id: termId }
      });

      if (!student || !term) {
        throw new Error('Student or term not found');
      }

      // Determine if this is a historical term
      const currentAcademicCalendar = await this.termRepository.manager.getRepository('AcademicCalendar').findOne({
        where: { isActive: true, ...(schoolId && !superAdmin ? { schoolId: schoolId || student.schoolId } : {}) }
      });
      const isHistoricalTerm = term.academicCalendar && currentAcademicCalendar && term.academicCalendar.id !== currentAcademicCalendar.id;
      
      const termLabel = `Term ${term.termNumber} (${term.academicCalendar?.term || 'Unknown Year'})`;
      const historicalNote = isHistoricalTerm ? ' [HISTORICAL TERM - Previous Academic Year]' : '';
      
      const creditPayment = this.paymentRepository.create({
        studentId: studentId,
        amount: creditToApply,
        paymentDate: new Date(),
        paymentType: 'credit_application',
        paymentMethod: 'bank_transfer',
        status: 'completed',
        termId: termId,
        schoolId: schoolId || student.schoolId,
        receiptNumber: `CREDIT-${Date.now()}-${studentId.substring(0, 8)}`,
        notes: `Auto-applied MK ${creditToApply.toLocaleString()} credit to ${termLabel} outstanding fees${historicalNote}. Outstanding before: MK ${outstandingAmount.toLocaleString()}, Outstanding after: MK ${(outstandingAmount - creditToApply).toLocaleString()}`
      });

      await this.paymentRepository.save(creditPayment);

      await this.autoAllocatePayment(
        creditPayment.id,
        studentId,
        termId,
        schoolId || student.schoolId,
        creditToApply,
        'full'
      );

      // If this was a historical term, update/create the student_academic_history record
      if (isHistoricalTerm) {
        try {
          // Check if historical record exists
          const historicalRecord = await this.studentRepository.query(
            `SELECT * FROM student_academic_history 
             WHERE student_id::uuid = $1 AND term_id::uuid = $2`,
            [studentId, termId]
          );

          if (historicalRecord && historicalRecord.length > 0) {
            // Update existing record
            await this.studentRepository.query(
              `UPDATE student_academic_history 
               SET total_paid_fees = COALESCE(total_paid_fees, 0) + $1,
                   outstanding_fees = GREATEST(0, COALESCE(total_expected_fees, 0) - (COALESCE(total_paid_fees, 0) + $1)),
                   last_payment_date = $2,
                   notes = COALESCE(notes, '') || $3
               WHERE student_id::uuid = $4 AND term_id::uuid = $5`,
              [
                creditToApply,
                new Date(),
                `\nCredit applied: MK ${creditToApply.toLocaleString()} on ${new Date().toLocaleDateString()}`,
                studentId,
                termId
              ]
            );
          } else {
            // Create new historical record
            const feeStatus = await this.studentFeeExpectationService.getStudentFeeStatus(
              studentId,
              termId,
              schoolId,
              superAdmin
            );
            
            await this.studentRepository.query(
              `INSERT INTO student_academic_history (
                student_id, term_id, term_number, academic_calendar_id, academic_year,
                school_id, class_id, class_name, student_number,
                total_expected_fees, total_paid_fees, outstanding_fees,
                status, last_payment_date, notes, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
              ON CONFLICT (student_id, term_id) DO UPDATE SET
                total_paid_fees = EXCLUDED.total_paid_fees,
                outstanding_fees = EXCLUDED.outstanding_fees,
                last_payment_date = EXCLUDED.last_payment_date,
                notes = student_academic_history.notes || EXCLUDED.notes,
                updated_at = NOW()`,
              [
                studentId,
                termId,
                term.termNumber,
                term.academicCalendar?.id,
                term.academicCalendar?.term || 'Unknown',
                schoolId || student.schoolId,
                student.class?.id,
                student.class?.name || 'Unknown',
                student.studentId,
                feeStatus.totalExpected,
                creditToApply,
                Math.max(0, feeStatus.totalExpected - creditToApply),
                creditToApply >= feeStatus.totalExpected ? 'completed' : 'in_progress',
                new Date(),
                `Credit applied: MK ${creditToApply.toLocaleString()} on ${new Date().toLocaleDateString()}`
              ]
            );
          }
          console.log(`✅ Updated historical record for ${termLabel}`);
        } catch (error) {
          console.error('Error updating historical record:', error);
          // Don't fail the credit application if historical record update fails
        }
      }

      let remainingToDeduct = creditToApply;
      for (const credit of activeCredits) {
        if (remainingToDeduct <= 0) break;

        const creditRemaining = Number(credit.remainingAmount);
        const deductAmount = Math.min(remainingToDeduct, creditRemaining);

        credit.remainingAmount = creditRemaining - deductAmount;
        
        if (credit.remainingAmount <= 0) {
          credit.status = 'applied';
          credit.notes = (credit.notes || '') + ` | Fully applied to Term ${term.termNumber} on ${new Date().toISOString()}`;
        } else {
          credit.notes = (credit.notes || '') + ` | Partially applied MK ${deductAmount} to Term ${term.termNumber} on ${new Date().toISOString()}`;
        }

        await this.creditRepository.save(credit);
        remainingToDeduct -= deductAmount;
      }

      const remainingCredit = totalCreditAvailable - creditToApply;
      const outstandingAfterCredit = outstandingAmount - creditToApply;

      return {
        success: true,
        creditApplied: creditToApply,
        paymentCreated: true,
        remainingCredit,
        outstandingAfterCredit,
        message: `Successfully applied MK ${creditToApply.toLocaleString()} credit to outstanding fees. Remaining credit: MK ${remainingCredit.toLocaleString()}, Remaining outstanding: MK ${outstandingAfterCredit.toLocaleString()}`
      };

    } catch (error) {
      console.error('Error auto-applying credit:', error);
      throw error;
    }
  }

  async autoApplyCreditsForTerm(
    termId: string,
    schoolId?: string,
    superAdmin = false
  ): Promise<{
    success: boolean;
    studentsProcessed: number;
    totalCreditApplied: number;
    results: Array<{
      studentId: string;
      studentName: string;
      creditApplied: number;
      success: boolean;
      message: string;
    }>;
  }> {
    try {
      const studentsWithCredits = await this.creditRepository
        .createQueryBuilder('credit')
        .select('DISTINCT credit.studentId', 'studentId')
        .where('credit.status = :status', { status: 'active' })
        .andWhere('credit.remainingAmount > 0')
        .andWhere(schoolId && !superAdmin ? 'credit.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawMany();

      const results: Array<{
        studentId: string;
        studentName: string;
        creditApplied: number;
        success: boolean;
        message: string;
      }> = [];

      let totalCreditApplied = 0;

      for (const { studentId } of studentsWithCredits) {
        try {
          const student = await this.studentRepository.findOne({
            where: { id: studentId }
          });

          const result = await this.autoApplyCreditToOutstandingFees(
            studentId,
            termId,
            schoolId,
            superAdmin
          );

          if (result.success) {
            totalCreditApplied += result.creditApplied;
          }

          results.push({
            studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            creditApplied: result.creditApplied,
            success: result.success,
            message: result.message
          });

        } catch (error) {
          results.push({
            studentId,
            studentName: 'Unknown',
            creditApplied: 0,
            success: false,
            message: `Error: ${error.message}`
          });
        }
      }

      return {
        success: true,
        studentsProcessed: studentsWithCredits.length,
        totalCreditApplied,
        results
      };

    } catch (error) {
      console.error('Error auto-applying credits for term:', error);
      throw error;
    }
  }
}
