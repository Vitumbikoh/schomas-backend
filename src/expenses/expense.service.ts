import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In } from 'typeorm';
import { Expense, ExpenseStatus, ExpensePriority, ExpenseCategory } from './entities/expense.entity';
import { ExpenseApprovalHistory, ApprovalAction } from './entities/expense-approval-history.entity';
import { CreateExpenseDto, UpdateExpenseDto, ApproveExpenseDto, RejectExpenseDto, ExpenseFiltersDto, ExpenseAnalyticsDto } from './dtos/expense.dto';
import { User } from 'src/user/entities/user.entity';
import { Role } from 'src/user/enums/role.enum';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseApprovalHistory)
    private approvalHistoryRepository: Repository<ExpenseApprovalHistory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createExpenseDto: CreateExpenseDto, userId: string): Promise<Expense> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const expense = this.expenseRepository.create({
      ...createExpenseDto,
      requestedBy: user.username,
      requestedByUserId: userId,
      status: ExpenseStatus.PENDING,
      requestDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedExpense = await this.expenseRepository.save(expense);

    // Create initial approval history entry
    await this.createApprovalHistory(savedExpense.id, userId, ApprovalAction.SUBMITTED, 'Expense submitted for approval');

    return savedExpense;
  }

  async findAll(filters: ExpenseFiltersDto, userId: string): Promise<{ expenses: Expense[]; total: number }> {
    const queryBuilder = this.expenseRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.requestedByUser', 'requestedByUser')
      .leftJoinAndSelect('expense.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('expense.approvalHistory', 'approvalHistory')
      .leftJoinAndSelect('approvalHistory.performedByUser', 'performedByUser');

    // Apply filters
    if (filters.status) {
      queryBuilder.andWhere('expense.status = :status', { status: filters.status });
    }

    if (filters.category) {
      queryBuilder.andWhere('expense.category = :category', { category: filters.category });
    }

    if (filters.priority) {
      queryBuilder.andWhere('expense.priority = :priority', { priority: filters.priority });
    }

    if (filters.department) {
      queryBuilder.andWhere('expense.department ILIKE :department', { department: `%${filters.department}%` });
    }

    if (filters.requestedBy) {
      queryBuilder.andWhere('requestedByUser.username ILIKE :requestedBy', { requestedBy: `%${filters.requestedBy}%` });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere('expense.createdAt BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(expense.title ILIKE :search OR expense.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Pagination with defaults
    const page = filters.page ?? 0;
    const limit = filters.limit ?? 20;
    const total = await queryBuilder.getCount();
    const expenses = await queryBuilder
      .orderBy('expense.createdAt', 'DESC')
      .skip(page * limit)
      .take(limit)
      .getMany();

    return { expenses, total };
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['requestedByUser', 'approvedByUser', 'approvalHistory', 'approvalHistory.performedByUser'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(id: string, updateExpenseDto: UpdateExpenseDto, userId: string): Promise<Expense> {
    const expense = await this.findOne(id);

    // Only allow updates if expense is still pending
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Cannot update expense that is not pending');
    }

    // Only allow the requester to update their own expense
    if (expense.requestedByUserId !== userId) {
      throw new ForbiddenException('You can only update your own expenses');
    }

    const updatedExpense = await this.expenseRepository.save({
      ...expense,
      ...updateExpenseDto,
      updatedAt: new Date(),
    });

    await this.createApprovalHistory(id, userId, ApprovalAction.COMMENTED, 'Expense updated');

    return updatedExpense;
  }

  async approve(id: string, approveExpenseDto: ApproveExpenseDto, userId: string): Promise<Expense> {
    const expense = await this.findOne(id);

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Expense is not pending approval');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has approval permissions (simplified - in real app, check roles)
    if (!this.canApproveExpense(user, expense)) {
      throw new ForbiddenException('You do not have permission to approve this expense');
    }

    const approvedAmount = approveExpenseDto.approvedAmount || expense.amount;

    const updatedExpense = await this.expenseRepository.save({
      ...expense,
      status: ExpenseStatus.APPROVED,
      approvedBy: user.username,
      approvedByUserId: userId,
      approvedDate: new Date(),
      approvedAmount,
      updatedAt: new Date(),
    });

    await this.createApprovalHistory(
      id,
      userId,
      ApprovalAction.APPROVED,
      `Expense approved. ${approveExpenseDto.comments || ''}`.trim()
    );

    return updatedExpense;
  }

  async reject(id: string, rejectExpenseDto: RejectExpenseDto, userId: string): Promise<Expense> {
    const expense = await this.findOne(id);

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Expense is not pending approval');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has approval permissions
    if (!this.canApproveExpense(user, expense)) {
      throw new ForbiddenException('You do not have permission to reject this expense');
    }

    const updatedExpense = await this.expenseRepository.save({
      ...expense,
      status: ExpenseStatus.REJECTED,
      approvedBy: user.username,
      approvedByUserId: userId,
      approvedDate: new Date(),
      rejectionReason: rejectExpenseDto.reason,
      updatedAt: new Date(),
    });

    await this.createApprovalHistory(
      id,
      userId,
      ApprovalAction.REJECTED,
      `Expense rejected: ${rejectExpenseDto.reason}. ${rejectExpenseDto.comments || ''}`.trim()
    );

    return updatedExpense;
  }

  async delete(id: string, userId: string): Promise<void> {
    const expense = await this.findOne(id);

    // Only allow deletion if expense is pending
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Cannot delete expense that is not pending');
    }

    // Only allow the requester to delete their own expense
    if (expense.requestedByUserId !== userId) {
      throw new ForbiddenException('You can only delete your own expenses');
    }

    await this.expenseRepository.remove(expense);
  }

  async getAnalytics(analyticsDto: ExpenseAnalyticsDto): Promise<any> {
    const queryBuilder = this.expenseRepository.createQueryBuilder('expense');

    if (analyticsDto.startDate && analyticsDto.endDate) {
      queryBuilder.andWhere('expense.createdAt BETWEEN :startDate AND :endDate', {
        startDate: analyticsDto.startDate,
        endDate: analyticsDto.endDate,
      });
    }

    if (analyticsDto.department) {
      queryBuilder.andWhere('expense.department = :department', { department: analyticsDto.department });
    }

    if (analyticsDto.category) {
      queryBuilder.andWhere('expense.category = :category', { category: analyticsDto.category });
    }

    const expenses = await queryBuilder.getMany();

    // Calculate analytics
    const totalExpenses = expenses.length;
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const approvedAmount = expenses
      .filter(exp => exp.status === ExpenseStatus.APPROVED)
      .reduce((sum, exp) => sum + (exp.approvedAmount || exp.amount), 0);
    const pendingAmount = expenses
      .filter(exp => exp.status === ExpenseStatus.PENDING)
      .reduce((sum, exp) => sum + exp.amount, 0);

    // Category breakdown
    const categoryBreakdown = expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
      return acc;
    }, {} as Record<string, number>);

    // Monthly trend (simplified)
    const monthlyTrend = expenses.reduce((acc, exp) => {
      const month = exp.createdAt.toISOString().slice(0, 7); // YYYY-MM
      acc[month] = (acc[month] || 0) + exp.amount;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalExpenses,
      totalAmount,
      approvedAmount,
      pendingAmount,
      categoryBreakdown,
      monthlyTrend,
    };
  }

  private async createApprovalHistory(
    expenseId: string,
    userId: string,
    action: ApprovalAction,
    comments?: string
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const history = this.approvalHistoryRepository.create({
      expenseId,
      performedBy: user.username,
      performedByUserId: userId,
      action,
      comments,
      createdAt: new Date(),
    });

    await this.approvalHistoryRepository.save(history);
  }

  private canApproveExpense(user: User, expense: Expense): boolean {
    // Simplified approval logic - in real app, check user roles and approval limits
    // For now, allow any user to approve expenses under $1000
    // Higher amounts would require higher-level approval
    if (expense.amount <= 1000) {
      return true;
    }

    // For higher amounts, check if user has admin role or specific approval permissions
    // This is a placeholder - implement proper role-based access control
    return user.role === Role.ADMIN || user.role === Role.FINANCE || user.role === Role.SUPER_ADMIN;
  }
}
