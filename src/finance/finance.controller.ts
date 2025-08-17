import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ProcessPaymentDto } from './dtos/process-payment.dto';
import { ApproveBudgetDto } from './dtos/approve-budget.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFinanceDto } from 'src/user/dtos/create-finance.dto';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Get('dashboard')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get finance dashboard overview' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
  })
  async getDashboard(@Request() req) {
    return this.financeService.getDashboardData(req.user.id);
  }

  @Get('dashboard-data')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get complete dashboard data with calculations' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data with calculations retrieved successfully',
  })
  async getDashboardData(@Request() req) {
    const data = await this.financeService.getDashboardCalculations();
    return {
      ...data,
      uiConfig: {
        title: 'Finance Management',
        description: 'Manage financial transactions and budgets',
        breadcrumbs: [
          { name: 'Dashboard', path: '/dashboard' },
          { name: 'Finance Management' },
        ],
      },
    };
  }

  @Post('payments')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Process a fee payment' })
  @ApiResponse({ status: 201, description: 'Payment processed successfully' })
  async processPayment(
    @Request() req,
    @Body() processPaymentDto: ProcessPaymentDto,
  ) {
    try {
  // Ensure the shape matches FinanceService expectation (id, role)
  const paymentResult = await this.financeService.processPayment(
    { id: req.user.sub || req.user.id, role: req.user.role },
    processPaymentDto,
    req,
  );
  const payment = paymentResult.payment; // unwrap
      await this.systemLoggingService.logAction({
        action: 'FEE_PAYMENT_CREATED_CONTROLLER',
        module: 'FINANCE',
        level: 'info',
        performedBy: req?.user ? { id: req.user.sub, email: req.user.email, role: req.user.role } : undefined,
        entityId: payment.id,
        entityType: 'FeePayment',
        newValues: {
          id: payment.id,
      amount: payment.amount,
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString() : undefined,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      studentName: payment.studentName,
        },
        metadata: { description: 'Fee payment processed via FinanceController' }
      });
    return paymentResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(error, 'FINANCE', 'FEE_PAYMENT_PROCESS_ERROR', { dto: processPaymentDto });
      throw error;
    }
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new finance user' })
  @ApiResponse({
    status: 201,
    description: 'Finance user created successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createFinanceUser(@Request() req, @Body() createFinanceDto: CreateFinanceDto) {
    try {
      const financeUserResult = await this.financeService.createFinanceUser(createFinanceDto);
      const financeUser = financeUserResult.financeProfile; // unwrap profile
      await this.systemLoggingService.logAction({
        action: 'FINANCE_USER_CREATED',
        module: 'FINANCE',
        level: 'info',
        performedBy: req?.user ? { id: req.user.sub, email: req.user.email, role: req.user.role } : undefined,
        entityId: financeUserResult.id,
        entityType: 'FinanceUser',
        newValues: {
          id: financeUserResult.id,
          firstName: financeUser.firstName,
          lastName: financeUser.lastName,
          department: financeUser.department,
          canApproveBudgets: financeUser.canApproveBudgets,
          canProcessPayments: financeUser.canProcessPayments
        },
        metadata: { description: 'Finance user created' }
      });
      return financeUserResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(error, 'FINANCE', 'FINANCE_USER_CREATE_ERROR', { dto: createFinanceDto });
      throw error;
    }
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all finance users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of finance users retrieved successfully',
  })
  async getAllFinanceUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
  ) {
    const { financeUsers, total } = await this.financeService.getAllFinanceUsers(
      Number(page),
      Number(limit),
      search,
    );

    const transformedFinanceOfficers = financeUsers.map((finance) => ({
      id: finance.id,
      firstName: finance.firstName,
      lastName: finance.lastName,
      email: finance.user?.email,
      phoneNumber: finance.phoneNumber,
      department: finance.department,
      canApproveBudgets: finance.canApproveBudgets,
      canProcessPayments: finance.canProcessPayments,
      status: finance.user?.isActive ? 'active' : 'inactive',
      hireDate: finance.user?.createdAt.toISOString(),
    }));

    return {
      financeOfficers: transformedFinanceOfficers,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  @Post('budgets/:id/approve')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Approve a budget proposal' })
  @ApiResponse({ status: 200, description: 'Budget approved successfully' })
  async approveBudget(
    @Request() req,
    @Param('id') budgetId: string,
    @Body() approveBudgetDto: ApproveBudgetDto,
  ) {
    try {
      const approvedResult = await this.financeService.approveBudget(
        req.user.id,
        budgetId,
        approveBudgetDto,
      );
      const approved = approvedResult.budget;
      await this.systemLoggingService.logAction({
        action: 'BUDGET_APPROVED',
        module: 'FINANCE',
        level: 'info',
        performedBy: req?.user ? { id: req.user.sub, email: req.user.email, role: req.user.role } : undefined,
        entityId: approved?.id,
        entityType: 'Budget',
        newValues: approved ? { id: approved.id, status: approved.status, totalAmount: approved.totalAmount } : undefined,
        metadata: { description: 'Budget approved' }
      });
      return approvedResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(error, 'FINANCE', 'BUDGET_APPROVE_ERROR', { budgetId, dto: approveBudgetDto });
      throw error;
    }
  }

  @Get('stats')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get financial statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getFinancialStats() {
    return this.financeService.getFinancialStats();
  }

  @Get('total-finances')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({
    summary: 'Get total financial metrics with optional date filtering',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTotalFinances(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const dateRange = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      };

      const stats = await this.financeService.getFinancialStats(dateRange);

      return {
        success: true,
        ...stats,
        totalRevenue: `$${stats.totalRevenue.toFixed(2)}`,
        dateRange: {
          start: dateRange.startDate?.toISOString(),
          end: dateRange.endDate?.toISOString(),
        },
      };
    } catch (error) {
      throw new Error(
        'Failed to fetch total financial metrics: ' + error.message,
      );
    }
  }

  @Get('transactions')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get financial transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  async getTransactions(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dateRange = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return this.financeService.getTransactions(
      Number(page),
      Number(limit),
      search,
      dateRange,
    );
  }

  @Get('fee-payments')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get all fee payments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of fee payments retrieved successfully',
  })
  async getFeePayments(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
  ) {
    const { payments, total } = await this.financeService.getAllPayments(
      Number(page),
      Number(limit),
      search,
    );

    const transformedPayments = payments.map((payment) => ({
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
    }));

    return {
      payments: transformedPayments,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  @Get('parent-payments')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Get fee payments for parent’s children' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of fee payments for parent’s children retrieved successfully',
  })
  async getParentPayments(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
  ) {
    return this.financeService.getParentPayments(
      req.user.id,
      Number(page),
      Number(limit),
      search,
    );
  }

  @Get('reports/summary')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Generate financial summary report' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateFinancialReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.financeService.generateFinancialReport(
      new Date(startDate),
      new Date(endDate),
    );
  }
}