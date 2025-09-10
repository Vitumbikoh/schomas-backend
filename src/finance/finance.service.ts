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
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { ProcessPaymentDto } from './dtos/process-payment.dto';
import { ApproveBudgetDto } from './dtos/approve-budget.dto';
import { Role } from 'src/user/enums/role.enum';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { CreateFinanceDto } from 'src/user/dtos/create-finance.dto';
import * as bcrypt from 'bcrypt';
import { SettingsService } from 'src/settings/settings.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Finance)
    private readonly financeRepository: Repository<Finance>,
    @InjectRepository(FeePayment)
    private readonly paymentRepository: Repository<FeePayment>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private settingsService: SettingsService,
    private systemLoggingService: SystemLoggingService,
  ) {}

  async getDashboardData(userId: string, schoolId?: string, superAdmin = false) {
    const financeUser = await this.getFinanceUser(userId);

    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm();
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

      const validPaymentTypes = [
        'tuition',
        'exam',
        'transport',
        'library',
        'hostel',
        'uniform',
        'other',
      ];
      if (!validPaymentTypes.includes(processPaymentDto.paymentType)) {
        throw new BadRequestException('Invalid payment type');
      }

      // Get current term
      const currentTerm = await this.settingsService.getCurrentTerm();
      if (!currentTerm) {
        throw new BadRequestException('No active term found. Please contact administration.');
      }

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

      const savedPayment = await this.paymentRepository.save(payment);
      
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

  async getDashboardCalculations(schoolId?: string, superAdmin = false): Promise<{
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: number;
    pendingApprovals: number;
    recentTransactions: FeePayment[];
    pendingPayments: FeePayment[];
    pendingBudgets: Budget[];
  }> {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm();
    const termFilter = currentTerm ? { termId: currentTerm.id } : {};

  const schoolScope = !superAdmin ? (schoolId ? { schoolId } : { schoolId: undefined }) : (schoolId ? { schoolId } : {});
  const [pendingPayments, pendingBudgets, recentTransactions] =
      await Promise.all([
        this.paymentRepository.find({
      where: { status: 'pending', ...termFilter, ...(schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {}) },
          take: 5,
          order: { createdAt: 'DESC' },
          relations: ['student', 'term'],
        }),
        this.budgetRepository.find({
      where: { status: 'pending', ...(schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {}) },
          take: 5,
          order: { createdAt: 'DESC' },
        }),
        this.paymentRepository.find({
      where: { status: 'completed', ...termFilter, ...(schoolScope.schoolId ? { schoolId: schoolScope.schoolId } : {}) },
          take: 5,
          order: { paymentDate: 'DESC' },
          relations: ['student', 'term'],
        }),
      ]);

  const stats = await this.getFinancialStats(undefined, schoolId, superAdmin);

    return {
      ...stats,
      recentTransactions,
      pendingPayments,
      pendingBudgets,
    };
  }

  async getFinancialStats(dateRange?: {
    startDate?: Date;
    endDate?: Date;
  }, schoolId?: string, superAdmin = false): Promise<{
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: number;
    pendingApprovals: number;
  fallbackUsed?: boolean;
  }> {
    // Get current term for filtering (with safe fallback)
    let currentTerm: any = null;
    try {
      currentTerm = await this.settingsService.getCurrentTerm();
    } catch (err) {
      await this.systemLoggingService.logSystemError(err, 'FINANCE', 'GET_CURRENT_TERM_FAILED');
    }
    
    const paymentWhere: any = { status: 'completed' };
    const budgetWhere: any = { status: 'approved' };

    if (!superAdmin) {
      if (schoolId) {
        paymentWhere.schoolId = schoolId;
        budgetWhere.schoolId = schoolId;
      } else {
        // No schoolId for non-super admin -> return zeros
        return { totalProcessedPayments: 0, totalApprovedBudgets: 0, totalRevenue: 0, pendingApprovals: 0 };
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
    let pendingPaymentsCount = 0;
    let pendingBudgetsCount = 0;
    try {
      [
        totalProcessedPayments,
        totalApprovedBudgets,
        totalRevenueResult,
        pendingPaymentsCount,
        pendingBudgetsCount,
      ] = await Promise.all([
        this.paymentRepository.count({ where: paymentWhere }),
        this.budgetRepository.count({ where: budgetWhere }),
        this.calculateTotalRevenue(paymentWhere, currentTerm, dateRange),
        this.paymentRepository.count({
          where: {
            status: 'pending',
            ...(currentTerm ? { termId: currentTerm.id } : {}),
            ...(paymentWhere.schoolId ? { schoolId: paymentWhere.schoolId } : {}),
          },
        }),
        this.budgetRepository.count({
          where: {
            status: 'pending',
            ...(budgetWhere.schoolId ? { schoolId: budgetWhere.schoolId } : {}),
          },
        }),
      ]);
    } catch (err) {
      await this.systemLoggingService.logSystemError(err, 'FINANCE', 'FINANCIAL_STATS_QUERY_FAILED', {
        paymentWhere,
        budgetWhere,
        dateRange: dateRange ? { start: dateRange.startDate, end: dateRange.endDate } : undefined,
      });
      return { totalProcessedPayments: 0, totalApprovedBudgets: 0, totalRevenue: 0, pendingApprovals: 0 };
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
        await this.systemLoggingService.logSystemError(fbErr, 'FINANCE', 'FINANCIAL_STATS_FALLBACK_FAILED', { schoolId });
      }
    }

    if (fallbackUsed) {
      await this.systemLoggingService.logAction({
        action: 'FINANCIAL_STATS_FALLBACK_APPLIED',
        module: 'FINANCE',
        level: 'warn',
        schoolId,
        metadata: { reason: 'Term mismatch produced zero totals; recalculated without term filter' },
      });
    } else {
      await this.systemLoggingService.logAction({
        action: 'FINANCIAL_STATS_CALCULATED',
        module: 'FINANCE',
        level: 'debug',
        schoolId,
        metadata: {
          totalProcessedPayments,
          totalApprovedBudgets,
          totalRevenue,
          pendingApprovals: pendingPaymentsCount + pendingBudgetsCount,
          termId: currentTerm?.id,
        },
      });
    }

    return {
      totalProcessedPayments,
      totalApprovedBudgets,
      totalRevenue,
      pendingApprovals: pendingPaymentsCount + pendingBudgetsCount,
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
  ) {
    // Get current term for filtering
    const currentTerm = await this.settingsService.getCurrentTerm();
    
    const where: any = {};

    // Add term filter if available
    if (currentTerm) {
      where.termId = currentTerm.id;
    }

    if (search) {
      where.receiptNumber = Like(`%${search}%`);
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      where.paymentDate = Between(dateRange.startDate, dateRange.endDate);
    }

    const [transactions, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['student', 'processedBy', 'processedByAdmin', 'term'],
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
        term: t.term ? `${t.term.academicCalendar.term} - ${t.term.period.name}` : 'N/A',
      })),
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        itemsPerPage: limit,
        currentPage: page,
      },
    };
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
}