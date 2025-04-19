// finance.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In } from 'typeorm';
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
  ) {}

  // Update the getDashboardData method
  async getDashboardData(userId: string) {
    const financeUser = await this.getFinanceUser(userId);

    const [pendingPayments, pendingBudgets, recentTransactions] =
      await Promise.all([
        this.paymentRepository.find({
          where: { status: 'pending' },
          take: 5,
          order: { createdAt: 'DESC' },
          relations: ['student'],
        }),
        this.budgetRepository.find({
          where: { status: 'pending' },
          take: 5,
          order: { createdAt: 'DESC' },
        }),
        this.paymentRepository.find({
          where: { status: In(['completed', 'processed']) }, // Updated to include both statuses
          take: 5,
          order: { processedAt: 'DESC' },
          relations: ['student'],
        }),
      ]);

    // Get accurate stats
    const totalProcessedPayments = await this.paymentRepository.count({
      where: { status: In(['completed', 'processed']) },
    });

    const totalRevenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status IN (:...statuses)', {
        statuses: ['completed', 'processed'],
      })
      .getRawOne();

    const totalRevenue = parseFloat(totalRevenueResult?.sum || '0');

    return {
      financeUser,
      pendingPayments: pendingPayments.map((p) => ({
        ...p,
        studentName: p.student?.lastName || 'Unknown',
      })),
      pendingBudgets,
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        studentName: t.student?.lastName || 'Unknown',
      })),
      stats: {
        totalProcessedPayments,
        totalApprovedBudgets: await this.budgetRepository.count({
          where: { status: 'approved' },
        }),
        totalRevenue: `$${totalRevenue.toFixed(2)}`, // Format as currency string
        pendingApprovals: pendingPayments.length + pendingBudgets.length,
      },
    };
  }

  async processPayment(userId: string, processPaymentDto: ProcessPaymentDto) {
    // 1. Verify the processing user exists and has proper role
    const processingUser = await this.userRepository.findOne({
      where: { id: userId, role: In([Role.ADMIN, Role.FINANCE]) },
    });

    if (!processingUser) {
      throw new NotFoundException(
        'Processing user not found or not authorized',
      );
    }

    // 2. Verify the student exists
    const student = await this.studentRepository.findOne({
      where: { id: processPaymentDto.studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // 3. Check if the user is a finance user or admin
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

    // 4. Create payment with proper relation references
    const payment = this.paymentRepository.create({
      amount: processPaymentDto.amount,
      referenceNumber: processPaymentDto.referenceNumber,
      notes: processPaymentDto.notes || '',
      status: 'completed',
      processedAt: new Date(),
      student: { id: student.id },
      ...(financeUser
        ? { processedBy: { id: financeUser.id } }
        : { processedByAdmin: { id: processingUser.id } }),
    });

    try {
      await this.paymentRepository.save(payment);
      return {
        success: true,
        payment: {
          ...payment,
          studentName: `${student.lastName} ${student.firstName}`,
          processedByName: processingUser.username,
        },
        message: 'Payment processed successfully',
      };
    } catch (error) {
      if (error.code === '23503') {
        throw new BadRequestException(
          'Invalid reference in payment processing',
        );
      }
      throw error;
    }
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

  async getTransactions(
    page: number,
    limit: number,
    search: string,
    dateRange?: { startDate?: Date; endDate?: Date },
  ) {
    const where: any = {};

    if (search) {
      where.referenceNumber = Like(`%${search}%`);
    }

    if (dateRange?.startDate && dateRange?.endDate) {
      where.processedAt = Between(dateRange.startDate, dateRange.endDate);
    }

    const [transactions, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['student'],
      skip: (page - 1) * limit,
      take: limit,
      order: { processedAt: 'DESC' },
    });

    return {
      transactions: transactions.map((t) => ({
        ...t,
        studentName: t.student?.lastName || 'Unknown',
      })),
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        itemsPerPage: limit,
        currentPage: page,
      },
    };
  }

  async generateFinancialReport(startDate: Date, endDate: Date) {
    const transactions = await this.paymentRepository.find({
      where: {
        processedAt: Between(startDate, endDate),
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
        studentName: t.student?.lastName || 'Unknown',
      })),
    };
  }

  // finance.service.ts
  private async getFinanceUser(userId: string): Promise<Finance | User> {
    // First try to find finance user
    const financeUser = await this.financeRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (financeUser) {
      return financeUser;
    }

    // If not found, check if it's an admin user
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.ADMIN },
    });

    if (user) {
      return user; // Return admin user directly
    }

    throw new NotFoundException('Finance user or admin not found');
  }

  async generateReceipt(transactionId: string): Promise<string> {
    const payment = await this.paymentRepository.findOne({
      where: { id: transactionId },
      relations: ['student', 'processedBy'],
    });

    if (!payment) {
      throw new NotFoundException('Transaction not found');
    }

    const fileName = `receipt_${payment.id}.pdf`;
    const filePath = `./receipts/${fileName}`;

    // Ensure receipts directory exists
    if (!fs.existsSync('./receipts')) {
      fs.mkdirSync('./receipts');
    }

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add receipt content
    doc.fontSize(20).text('Payment Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Receipt #: ${payment.referenceNumber}`);
    doc.text(`Date: ${payment.processedAt.toLocaleDateString()}`);
    doc.text(
      `Student: ${payment.student?.firstName || 'N/A'} ${payment.student?.lastName || 'N/A'}`,
    );
    doc.text(`Amount: $${payment.amount.toFixed(2)}`);
    doc.text(
      `Processed By: ${payment.processedBy?.user?.username || 'System'}`,
    );
    doc.moveDown();
    doc.text('Thank you for your payment!', { align: 'center' });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  // finance.service.ts
  // finance.service.ts
  async getFinancialStats() {
    // Get counts and sums with proper TypeORM syntax
    const totalProcessedPayments = await this.paymentRepository.count({
      where: { status: 'completed' },
    });

    const totalApprovedBudgets = await this.budgetRepository.count({
      where: { status: 'approved' },
    });

    // For sum, we need to use query builder
    const totalRevenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.status = :status', { status: 'completed' })
      .getRawOne();

    const totalRevenue = parseFloat(totalRevenueResult?.sum || '0');

    const pendingPayments = await this.paymentRepository.count({
      where: { status: 'pending' },
    });

    const pendingBudgets = await this.budgetRepository.count({
      where: { status: 'pending' },
    });

    return {
      totalProcessedPayments,
      totalApprovedBudgets,
      totalRevenue,
      pendingApprovals: pendingPayments + pendingBudgets,
    };
  }
  async getPaymentById(id: string) {
    return this.paymentRepository.findOne({
      where: { id },
      relations: ['student'],
    });
  }
}
