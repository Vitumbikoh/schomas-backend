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

  async getDashboardData(userId: string) {
    const financeUser = await this.getFinanceUser(userId);

    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    const academicYearFilter = currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {};

    const [pendingPayments, pendingBudgets, recentTransactions] =
      await Promise.all([
        this.paymentRepository.find({
          where: { status: 'pending', ...academicYearFilter },
          take: 5,
          order: { createdAt: 'DESC' },
          relations: ['student', 'academicYear'],
        }),
        this.budgetRepository.find({
          where: { status: 'pending' },
          take: 5,
          order: { createdAt: 'DESC' },
        }),
        this.paymentRepository.find({
          where: { status: 'completed', ...academicYearFilter },
          take: 5,
          order: { paymentDate: 'DESC' },
          relations: ['student', 'academicYear'],
        }),
      ]);

    const totalProcessedPayments = await this.paymentRepository.count({
      where: { status: 'completed', ...academicYearFilter },
    });

    const totalRevenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .andWhere(currentAcademicYear ? 'payment.academicYearId = :academicYearId' : '1=1', 
        currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {})
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

  async processPayment(user: { id: string; role: Role }, processPaymentDto: ProcessPaymentDto, request?: any) {
    const startTime = Date.now();
    
    try {
      const processingUser = await this.userRepository.findOne({
        where: { id: user.id, role: In([Role.ADMIN, Role.FINANCE]) },
      });

      if (!processingUser) {
        throw new NotFoundException('Processing user not found or not authorized');
      }

      const student = await this.studentRepository.findOne({
        where: { id: processPaymentDto.studentId },
      });

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      let financeUser: Finance | null = null;
      if (processingUser.role === Role.FINANCE) {
        financeUser = await this.financeRepository.findOne({
          where: { user: { id: processingUser.id } },
          relations: ['user'],
        });
        if (!financeUser) {
          throw new NotFoundException('Finance user record not found');
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

      // Get current academic year
      const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
      if (!currentAcademicYear) {
        throw new BadRequestException('No active academic year found. Please contact administration.');
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
        academicYearId: currentAcademicYear.id,
        ...(financeUser
          ? { processedBy: { id: financeUser.id } }
          : { processedByAdmin: { id: processingUser.id } }),
      });

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
        request
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
        }
      );
      
      if (error.code === '23503') {
        throw new BadRequestException('Invalid reference in payment processing');
      }
      throw new BadRequestException(`Failed to process payment: ${error.message}`);
    }
  }

  async getAllFinanceUsers(page: number, limit: number, search: string) {
    const financeUsers = await this.financeRepository.find({
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      where: search
        ? [
            { firstName: ILike(`%${search}%`) },
            { lastName: ILike(`%${search}%`) },
            { department: ILike(`%${search}%`) },
            { user: { username: ILike(`%${search}%`) } },
            { user: { email: ILike(`%${search}%`) } },
          ]
        : undefined,
    });

    const total = await this.financeRepository.count({
      where: search
        ? [
            { firstName: ILike(`%${search}%`) },
            { lastName: ILike(`%${search}%`) },
            { department: ILike(`%${search}%`) },
            { user: { username: ILike(`%${search}%`) } },
            { user: { email: ILike(`%${search}%`) } },
          ]
        : undefined,
    });

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

  async getDashboardCalculations(): Promise<{
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: number;
    pendingApprovals: number;
    recentTransactions: FeePayment[];
    pendingPayments: FeePayment[];
    pendingBudgets: Budget[];
  }> {
    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    const academicYearFilter = currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {};

    const [pendingPayments, pendingBudgets, recentTransactions] =
      await Promise.all([
        this.paymentRepository.find({
          where: { status: 'pending', ...academicYearFilter },
          take: 5,
          order: { createdAt: 'DESC' },
          relations: ['student', 'academicYear'],
        }),
        this.budgetRepository.find({
          where: { status: 'pending' },
          take: 5,
          order: { createdAt: 'DESC' },
        }),
        this.paymentRepository.find({
          where: { status: 'completed', ...academicYearFilter },
          take: 5,
          order: { paymentDate: 'DESC' },
          relations: ['student', 'academicYear'],
        }),
      ]);

    const stats = await this.getFinancialStats();

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
  }): Promise<{
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: number;
    pendingApprovals: number;
  }> {
    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    
    const paymentWhere: any = { status: 'completed' };
    const budgetWhere: any = { status: 'approved' };
    
    // Add academic year filter if available
    if (currentAcademicYear) {
      paymentWhere.academicYearId = currentAcademicYear.id;
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

    const [
      totalProcessedPayments,
      totalApprovedBudgets,
      totalRevenueResult,
      pendingPaymentsCount,
      pendingBudgetsCount,
    ] = await Promise.all([
      this.paymentRepository.count({ where: paymentWhere }),
      this.budgetRepository.count({ where: budgetWhere }),
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'sum')
        .where('payment.status = :status', { status: 'completed' })
        .andWhere(currentAcademicYear ? 'payment.academicYearId = :academicYearId' : '1=1', 
          currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {})
        .andWhere(
          dateRange?.startDate && dateRange?.endDate
            ? 'payment.paymentDate BETWEEN :startDate AND :endDate'
            : '1=1',
          {
            startDate: dateRange?.startDate,
            endDate: dateRange?.endDate,
          },
        )
        .getRawOne(),
      this.paymentRepository.count({ 
        where: { 
          status: 'pending', 
          ...(currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {})
        } 
      }),
      this.budgetRepository.count({ where: { status: 'pending' } }),
    ]);

    return {
      totalProcessedPayments,
      totalApprovedBudgets,
      totalRevenue: parseFloat(totalRevenueResult?.sum || '0'),
      pendingApprovals: pendingPaymentsCount + pendingBudgetsCount,
    };
  }

  async getTransactions(
    page: number,
    limit: number,
    search: string,
    dateRange?: { startDate?: Date; endDate?: Date },
  ) {
    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    
    const where: any = {};

    // Add academic year filter if available
    if (currentAcademicYear) {
      where.academicYearId = currentAcademicYear.id;
    }

    if (search) {
      where.receiptNumber = Like(`%${search}%`);
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      where.paymentDate = Between(dateRange.startDate, dateRange.endDate);
    }

    const [transactions, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
      skip: (page - 1) * limit,
      take: limit,
      order: { paymentDate: 'DESC' },
    });

    return {
      transactions: transactions.map((t) => ({
        ...t,
        studentName: t.student ? `${t.student.firstName} ${t.student.lastName}` : 'Unknown',
        paymentDate: t.paymentDate?.toISOString(),
        processedByName: t.processedBy?.user?.username || t.processedByAdmin?.username || 'Unknown',
        academicYear: t.academicYear ? `${t.academicYear.academicCalendar.academicYear} - ${t.academicYear.term.name}` : 'N/A',
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

  // Get current academic year for filtering
  const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();

  const where: any = {
    student: { id: In(studentIds) },
  };

  // Add academic year filter if available
  if (currentAcademicYear) {
    where.academicYearId = currentAcademicYear.id;
  }

  if (search) {
    where.receiptNumber = Like(`%${search}%`);
  }

  const [payments, total] = await this.paymentRepository.findAndCount({
    where,
    relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
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
      academicYear: payment.academicYear ? `${payment.academicYear.academicCalendar.academicYear} - ${payment.academicYear.term.name}` : 'N/A',
    })),
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      itemsPerPage: limit,
    },
  };
}

  async createFinanceUser(createFinanceDto: CreateFinanceDto) {
    const existingUser = await this.userRepository.findOne({
      where: [
        { username: createFinanceDto.username },
        { email: createFinanceDto.email },
      ],
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(createFinanceDto.password, 10);

    const user = this.userRepository.create({
      username: createFinanceDto.username,
      email: createFinanceDto.email,
      password: hashedPassword,
      role: Role.FINANCE,
      isActive: true,
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
      relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
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
      `Academic Year: ${payment.academicYear ? `${payment.academicYear.academicCalendar.academicYear} - ${payment.academicYear.term.name}` : 'N/A'}`,
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

  async getAllPayments(page: number = 1, limit: number = 10, search: string = '') {
    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    
    const where: any = {};

    // Add academic year filter if available
    if (currentAcademicYear) {
      where.academicYearId = currentAcademicYear.id;
    }

    if (search) {
      where.receiptNumber = Like(`%${search}%`);
    }

    const [payments, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
      skip: (page - 1) * limit,
      take: limit,
      order: { paymentDate: 'DESC' },
    });

    return { payments, total };
  }

  async getPaymentById(id: string) {
    return this.paymentRepository.findOne({
      where: { id },
      relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
    });
  }

  async getRecentPayments(limit: number): Promise<any[]> {
    // Get current academic year for filtering
    const currentAcademicYear = await this.settingsService.getCurrentAcademicYear();
    
    return this.paymentRepository.find({
      where: { 
        status: 'completed',
        ...(currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {})
      },
      take: limit,
      order: { paymentDate: 'DESC' },
      relations: ['student', 'processedBy', 'processedByAdmin', 'academicYear'],
    });
  }
}