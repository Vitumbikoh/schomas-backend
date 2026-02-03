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
  ) {}

  /**
   * Auto-allocate a payment to fee structures
   * This ensures all payments are properly allocated to fee types for accurate reporting
   */
  private async autoAllocatePayment(
    paymentId: string,
    studentId: string,
    termId: string,
    schoolId: string,
    paymentAmount: number
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
    const { startDate, endDate, schoolId, superAdmin = false } = params || {};

    // Build base where filters
    const feeWhere: any = { status: 'completed' };
    const expenseWhere: any = { status: 'Approved' as any };

    // Term scoping is already applied in some places, but for reports we'll honor date range primarily
    if (!superAdmin) {
      if (!schoolId) {
        return {
          totals: { totalFees: 0, totalByType: [], totalApprovedExpenses: 0, netBalance: 0 },
          trends: [],
        };
      }
      feeWhere.schoolId = schoolId;
      expenseWhere.schoolId = schoolId;
    } else if (schoolId) {
      feeWhere.schoolId = schoolId;
      expenseWhere.schoolId = schoolId;
    }

    if (startDate && endDate) {
      feeWhere.paymentDate = Between(startDate, endDate);
      expenseWhere.approvedDate = Between(startDate, endDate);
    }

    // Totals by paymentType
    const feeTotalsByTypeRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.paymentType', 'paymentType')
      .addSelect('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(feeWhere.schoolId ? 'payment.schoolId = :schoolId' : '1=1', feeWhere.schoolId ? { schoolId: feeWhere.schoolId } : {})
      .andWhere(startDate && endDate ? 'payment.paymentDate BETWEEN :start AND :end' : '1=1', startDate && endDate ? { start: startDate, end: endDate } : {})
      .groupBy('payment.paymentType')
      .getRawMany();

    const totalByType = feeTotalsByTypeRaw.map((r: any) => ({ type: r.paymentType || 'other', amount: parseFloat(r.sum || '0') }));
    const totalFees = totalByType.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    // Total approved expenses (use approvedAmount when present else amount)
    const approvedExpensesQb = this.expenseRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(COALESCE(expense.approvedAmount, expense.amount)), 0)', 'sum')
      .where('expense.status = :status', { status: 'Approved' })
      .andWhere(expenseWhere.schoolId ? 'expense.schoolId = :schoolId' : '1=1', expenseWhere.schoolId ? { schoolId: expenseWhere.schoolId } : {})
      .andWhere(startDate && endDate ? 'expense.approvedDate BETWEEN :start AND :end' : '1=1', startDate && endDate ? { start: startDate, end: endDate } : {});
    const approvedExpensesRaw = await approvedExpensesQb.getRawOne();
    const totalApprovedExpenses = parseFloat(approvedExpensesRaw?.sum || '0');

    const netBalance = totalFees - totalApprovedExpenses;

    // Monthly trends combining fees and expenses
    // Fees by month
    const feeTrendsRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .select("TO_CHAR(payment.paymentDate, 'YYYY-MM')", 'month')
      .addSelect('SUM(payment.amount)', 'fees')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(feeWhere.schoolId ? 'payment.schoolId = :schoolId' : '1=1', feeWhere.schoolId ? { schoolId: feeWhere.schoolId } : {})
      .andWhere(startDate && endDate ? 'payment.paymentDate BETWEEN :start AND :end' : '1=1', startDate && endDate ? { start: startDate, end: endDate } : {})
      .groupBy("TO_CHAR(payment.paymentDate, 'YYYY-MM')")
      .orderBy("TO_CHAR(payment.paymentDate, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Expenses by month (approved)
    const expenseTrendsRaw = await this.expenseRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.approvedDate, 'YYYY-MM')", 'month')
      .addSelect('SUM(COALESCE(expense.approvedAmount, expense.amount))', 'expenses')
      .where('expense.status = :status', { status: 'Approved' })
      .andWhere(expenseWhere.schoolId ? 'expense.schoolId = :schoolId' : '1=1', expenseWhere.schoolId ? { schoolId: expenseWhere.schoolId } : {})
      .andWhere(startDate && endDate ? 'expense.approvedDate BETWEEN :start AND :end' : '1=1', startDate && endDate ? { start: startDate, end: endDate } : {})
      .groupBy("TO_CHAR(expense.approvedDate, 'YYYY-MM')")
      .orderBy("TO_CHAR(expense.approvedDate, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Merge trends on month
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
      totals: {
        totalFees,
        totalByType,
        totalApprovedExpenses,
        netBalance,
      },
      trends,
    };
  }

  // Term-based financial report with carry-forward balances
  async getTermBasedFinancialReport(params: {
    schoolId?: string;
    superAdmin?: boolean;
    includeCarryForward?: boolean;
  }): Promise<{
    currentTerm: {
      termId: string;
      termName: string;
      startDate: Date;
      endDate: Date;
      revenue: number;
      expenses: number;
      profit: number;
      profitMargin: number;
    };
    previousTerms: Array<{
      termId: string;
      termName: string;
      startDate: Date;
      endDate: Date;
      revenue: number;
      expenses: number;
      profit: number;
      profitMargin: number;
    }>;
    cumulative: {
      totalRevenue: number;
      totalExpenses: number;
      totalProfit: number;
      totalProfitMargin: number;
      broughtForward: number;
    };
    carryForwardBalance: number;
  }> {
    const { schoolId, superAdmin = false, includeCarryForward = true } = params || {};

    if (!superAdmin && !schoolId) {
      throw new BadRequestException('School ID is required');
    }

    // Get all completed terms for the school, ordered by end date
    const terms = await this.financeRepository.manager
      .createQueryBuilder(Term, 'term')
      .leftJoinAndSelect('term.academicCalendar', 'calendar')
      .leftJoinAndSelect('term.period', 'period')
      .where('term.schoolId = :schoolId', { schoolId })
      .andWhere('term.isCompleted = :isCompleted', { isCompleted: true })
      .orderBy('term.endDate', 'ASC')
      .getMany();

    if (terms.length === 0) {
      return {
        currentTerm: null,
        previousTerms: [],
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

    // Get current term (latest incomplete term or latest completed term)
    const currentTerm = await this.financeRepository.manager
      .createQueryBuilder(Term, 'term')
      .leftJoinAndSelect('term.academicCalendar', 'calendar')
      .leftJoinAndSelect('term.period', 'period')
      .where('term.schoolId = :schoolId', { schoolId })
      .orderBy('term.endDate', 'DESC')
      .getOne();

    const previousTerms = terms.slice(0, -1); // All except the last one
    const lastCompletedTerm = terms[terms.length - 1];

    // Calculate financial data for each term
    const calculateTermFinancials = async (term: Term) => {
      // Revenue: completed payments within term dates
      const revenueResult = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'revenue')
        .where('payment.schoolId = :schoolId', { schoolId })
        .andWhere('payment.status = :status', { status: 'completed' })
        .andWhere('payment.paymentDate BETWEEN :start AND :end', {
          start: term.startDate,
          end: term.endDate,
        })
        .getRawOne();

      // Expenses: approved expenses within term dates
      const expenseResult = await this.expenseRepository
        .createQueryBuilder('expense')
        .select('COALESCE(SUM(COALESCE(expense.approvedAmount, expense.amount)), 0)', 'expenses')
        .where('expense.schoolId = :schoolId', { schoolId })
        .andWhere('expense.status = :status', { status: 'Approved' })
        .andWhere('expense.approvedDate BETWEEN :start AND :end', {
          start: term.startDate,
          end: term.endDate,
        })
        .getRawOne();

      const revenue = parseFloat(revenueResult?.revenue || '0');
      const expenses = parseFloat(expenseResult?.expenses || '0');
      const profit = revenue - expenses;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        termId: term.id,
        termName: `${term.academicCalendar?.term || 'Unknown'} Term ${term.termNumber}`,
        startDate: term.startDate,
        endDate: term.endDate,
        revenue,
        expenses,
        profit,
        profitMargin,
      };
    };

    // Calculate financials for all terms
    const previousTermsData = await Promise.all(
      previousTerms.map(calculateTermFinancials)
    );

    let currentTermData = null;
    if (currentTerm) {
      currentTermData = await calculateTermFinancials(currentTerm);
    }

    // Calculate cumulative data
    const allTermsData = [...previousTermsData];
    if (currentTermData) {
      allTermsData.push(currentTermData);
    }

    const totalRevenue = allTermsData.reduce((sum, term) => sum + term.revenue, 0);
    const totalExpenses = allTermsData.reduce((sum, term) => sum + term.expenses, 0);
    const totalProfit = totalRevenue - totalExpenses;
    const totalProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Calculate brought forward balance (cumulative profit from previous terms)
    const broughtForward = previousTermsData.reduce((sum, term) => sum + term.profit, 0);

    // Calculate carry-forward balance (what will be brought forward to next term)
    const carryForwardBalance = totalProfit;

    return {
      currentTerm: currentTermData,
      previousTerms: previousTermsData,
      cumulative: {
        totalRevenue,
        totalExpenses,
        totalProfit,
        totalProfitMargin,
        broughtForward,
      },
      carryForwardBalance,
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
      });

      if (!student) {
        throw new NotFoundException('Student not found or not accessible in your school');
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

      // Get current term scoped by school and validate payment type dynamically
      const currentTerm = await this.settingsService.getCurrentTerm(user.schoolId);
      if (!currentTerm) {
        throw new BadRequestException('No active term found. Please contact administration.');
      }

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
          creditCreated = true;
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

      // Auto-allocate the payment to fee structures
      await this.autoAllocatePayment(
        savedPayment.id,
        student.id,
        currentTerm.id,
        user.schoolId || savedPayment.schoolId,
        Number(processPaymentDto.amount)
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

      return {
        monthlyRevenue: parseFloat(currentMonthRevenue?.sum || '0'),
        monthlyRevenueLastMonth: parseFloat(lastMonthRevenue?.sum || '0'),
        outstandingFees: outstandingFees,
        outstandingFeesLastMonth: 0, // Will be calculated properly later
        paymentsToday,
        collectionRate,
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
      };
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
      relations: ['student', 'processedBy', 'processedByAdmin', 'term', 'term.academicCalendar', 'term.period'],
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
        processedByName: t.processedBy?.user?.username || t.processedByAdmin?.username || 'Unknown',
        term: t.term ? `Term ${t.term.termNumber}` : 'N/A',
        academicYear: t.term?.academicCalendar?.term || 'N/A',
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
  ) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm();

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.student', 'student')
      .leftJoinAndSelect('student.class', 'studentClass')
      .leftJoinAndSelect('payment.processedBy', 'processedBy')
      .leftJoinAndSelect('payment.processedByAdmin', 'processedByAdmin')
      .leftJoinAndSelect('payment.term', 'term')
      .orderBy('payment.paymentDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (currentTerm) {
      qb.andWhere('payment.termId = :termId', { termId: currentTerm.id });
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
        'school'
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

  async getRevenueTrends(schoolId?: string, superAdmin = false) {
    const trends: Array<{
      month: string;
      revenue: number;
      target: number;
      date: string;
    }> = [];

    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      date.setDate(1);

      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const revenueResult = await this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere('payment.paymentDate >= :startDate', { startDate: monthStart })
        .andWhere('payment.paymentDate <= :endDate', { endDate: monthEnd })
        .andWhere(!superAdmin && schoolId ? 'payment.schoolId = :schoolId' : '1=1', { schoolId })
        .getRawOne();

      const revenue = parseFloat(revenueResult?.sum || '0');

      trends.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        revenue: revenue,
        target: revenue * 0.9, // Simple target calculation - 90% of actual revenue
        date: monthStart.toISOString().split('T')[0] // YYYY-MM-DD format
      });
    }

    return trends;
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
      relations: ['class', 'user']
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get all terms for the academic calendar or current academic calendar
    let termsQuery = `
      SELECT t.id, t."termNumber", t."startDate", t."endDate", ac.term as academic_year
      FROM term t
      LEFT JOIN academic_calendar ac ON t."academicCalendarId" = ac.id
    `;
    
    const queryParams: any[] = [];
    if (academicCalendarId) {
      termsQuery += ` WHERE t."academicCalendarId"::uuid = $1`;
      queryParams.push(academicCalendarId);
    } else {
      termsQuery += ` WHERE ac."isActive" = true`;
    }

    if (!superAdmin && schoolId) {
      termsQuery += queryParams.length > 0 ? ` AND ` : ` WHERE `;
      termsQuery += `t."schoolId" = $${queryParams.length + 1}`;
      queryParams.push(schoolId);
    }

    termsQuery += ` ORDER BY t."termNumber" ASC`;
    
    const terms = await this.studentRepository.query(termsQuery, queryParams);

    // Build comprehensive financial summary
    const termFinancialData = [];
    let totalExpectedAllTerms = 0;
    let totalPaidAllTerms = 0;
    
    // Get all transactions for this student across all terms
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
      .andWhere(academicCalendarId ? 'academicCalendar.id = :acadId' : '1=1', { acadId: academicCalendarId })
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

      // Get payments for this term
      const termPayments = allTransactions.filter(payment => payment.termId === term.id);
      let totalPaid = termPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

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
        paymentCount: termPayments.length,
        lastPaymentDate: termPayments[0]?.paymentDate,
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
        termId: c.termId || source?.termId || null,
        termNumber: c.term?.termNumber || source?.term?.termNumber || null,
        academicYear: c.term?.academicCalendar?.term || source?.term?.academicCalendar?.term || null,
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
              termId: allocation.termId,
              termNumber: allocation.term?.termNumber,
              academicYear: allocation.term?.academicCalendar?.term,
              status: payment.status,
              processedBy:
                payment.processedBy?.user?.username ||
                payment.processedByAdmin?.username ||
                (payment.processedBy
                  ? `${payment.processedBy.firstName} ${payment.processedBy.lastName}`
                  : '-'),
              allocationReason: allocation.allocationReason,
              isAllocationDetail: true,
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
            termId: payment.termId,
            termNumber: payment.term?.termNumber,
            academicYear: payment.term?.academicCalendar?.term,
            status: payment.status,
            processedBy:
              payment.processedBy?.user?.username ||
              payment.processedByAdmin?.username ||
              (payment.processedBy
                ? `${payment.processedBy.firstName} ${payment.processedBy.lastName}`
                : '-'),
            isAllocationDetail: false,
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
}