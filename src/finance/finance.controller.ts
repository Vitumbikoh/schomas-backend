import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../user/entities/student.entity';
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
import { StudentFeeExpectationService } from './student-fee-expectation.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { CreateFeeStructureDto } from './dtos/fees-structure.dto';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly systemLoggingService: SystemLoggingService,
    private readonly studentFeeExpectationService: StudentFeeExpectationService,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  @Get('dashboard')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get finance dashboard overview' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
  })
  async getDashboard(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getDashboardData(
      user.id || user.sub,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  // Explicit path to avoid clashing with other routes like /finance/transactions
  @Get('user/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get finance user details by ID' })
  @ApiResponse({ status: 200, description: 'Finance user details returned' })
  async getFinanceUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getFinanceUserDetails(
      id,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );
  }


  @Get('dashboard-data')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get complete dashboard data with calculations' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data with calculations retrieved successfully',
  })
  async getDashboardData(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    const data = await this.financeService.getDashboardCalculations(
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
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

  @Get('payment-methods-distribution')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get payment methods distribution analytics' })
  @ApiResponse({
    status: 200,
    description: 'Payment methods distribution data retrieved successfully',
  })
  async getPaymentMethodsDistribution(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getPaymentMethodDistribution(
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('outstanding-fees-breakdown')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get outstanding fees breakdown by amount ranges' })
  @ApiResponse({
    status: 200,
    description: 'Outstanding fees breakdown data retrieved successfully',
  })
  async getOutstandingFeesBreakdown(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getOutstandingFeesBreakdown(
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('outstanding-fees-last-month')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get outstanding fees from last month for comparison' })
  @ApiResponse({
    status: 200,
    description: 'Outstanding fees last month data retrieved successfully',
  })
  async getOutstandingFeesLastMonth(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getOutstandingFeesLastMonth(
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('revenue-trends')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get monthly revenue trends for the last 6 months' })
  @ApiResponse({
    status: 200,
    description: 'Revenue trends data retrieved successfully',
  })
  async getRevenueTrends(@Request() req) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.getRevenueTrends(
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
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
      const paymentResult = await this.financeService.processPayment(
        {
          id: req.user.sub || req.user.id,
          role: req.user.role,
          schoolId: req.user.schoolId,
        },
        processPaymentDto,
        req,
      );
      const payments = (paymentResult as any).payments || ((paymentResult as any).payment ? [(paymentResult as any).payment] : []);
      if (payments.length) {
        for (const payment of payments) {
          await this.systemLoggingService.logAction({
            action: 'FEE_PAYMENT_CREATED_CONTROLLER',
            module: 'FINANCE',
            level: 'info',
            schoolId: req.user.schoolId,
            performedBy: req?.user
              ? { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role }
              : undefined,
            entityId: payment.id,
            entityType: 'FeePayment',
            newValues: {
              id: payment.id,
              amount: payment.amount,
              paymentDate: payment.paymentDate
                ? new Date(payment.paymentDate).toISOString()
                : undefined,
              paymentMethod: payment.paymentMethod,
              status: payment.status,
              studentName: payment.studentName,
              schoolId: payment.schoolId,
            },
            metadata: {
              description: 'Fee payment processed via FinanceController',
            },
          });
        }
      } else {
        await this.systemLoggingService.logAction({
          action: 'FEE_PAYMENT_CREATED_CONTROLLER',
          module: 'FINANCE',
          level: 'info',
          schoolId: req.user.schoolId,
          performedBy: req?.user
            ? { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role }
            : undefined,
          metadata: {
            description: 'Fee payment processed via FinanceController (no entity returned)',
          },
        });
      }
      return paymentResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(
        error,
        'FINANCE',
        'FEE_PAYMENT_PROCESS_ERROR',
        { dto: processPaymentDto },
        req.user.schoolId,
      );
      throw error;
    }
  }

  @Get('credits')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List active credits (overpayments) for a student or school' })
  async listCredits(
    @Request() req,
    @Query('studentId') studentId?: string,
    @Query('status') status: 'active' | 'applied' | 'refunded' | 'all' = 'active',
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.financeService.listCredits({
      studentId,
      status,
      schoolId: superAdmin ? (req.query.schoolId || user.schoolId) : user.schoolId,
      superAdmin,
    });
  }

  // ---------------- Fee Structure Management ----------------

  @Post('fee-structure')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Create a new fee structure item' })
  @ApiResponse({
    status: 201,
    description: 'Fee structure item created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failed',
  })
  async createFeeStructureItem(
    @Request() req,
    @Body() dto: CreateFeeStructureDto,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';

    // Set defaults if not provided
    const feeStructureData = {
      ...dto,
      feeType: dto.feeType || 'Tuition',
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      isOptional: dto.isOptional || false,
      frequency: dto.frequency || 'per_period',
    };

    // Pass schoolId from authenticated user for multi-tenant isolation
    return this.studentFeeExpectationService.createFeeStructureItem(
      feeStructureData,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
    );
  }

  @Get('fee-structure')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get fee structure for term' })
  async getFeeStructure(
    @Request() req,
    @Query('termId') termId: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';

    return this.studentFeeExpectationService.getFeeStructureForTerm(
      termId,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('fee-types')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List active fee types for current or provided term' })
  async listActiveFeeTypes(
    @Request() req,
    @Query('termId') termId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    const items = await this.studentFeeExpectationService.getFeeStructureForTerm(
      termId || undefined,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );
    // Map unique feeType values (only active)
    const active = Array.isArray(items) ? items.filter((i:any)=> i.isActive) : [];
    const uniqueTypes = Array.from(new Set(active.map((i:any)=> i.feeType?.trim()))).filter(Boolean);
    return { feeTypes: uniqueTypes };
  }

  @Put('fee-structure/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Update a fee structure item' })
  @ApiResponse({
    status: 200,
    description: 'Fee structure item updated successfully',
  })
  async updateFeeStructureItem(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: Partial<CreateFeeStructureDto>,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';

    return this.studentFeeExpectationService.updateFeeStructureItem(
      id,
      dto,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Delete('fee-structure/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Delete a fee structure item' })
  @ApiResponse({
    status: 200,
    description: 'Fee structure item deleted successfully',
  })
  async deleteFeeStructureItem(@Request() req, @Param('id') id: string) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';

    return this.studentFeeExpectationService.deleteFeeStructureItem(
      id,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );
  }

  // ---------------- Fee Status and Summary ----------------

  @Get('fee-summary')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Summary of fee payment status for a term',
  })
  async feeSummary(
    @Request() req,
    @Query('termId') termId: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.studentFeeExpectationService.getFeeSummaryForTerm(
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('summary')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Get comprehensive finance summary for a term',
  })
  async getFinanceSummary(
    @Request() req,
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    if (!termId) {
      throw new BadRequestException('termId is required');
    }

    const summary = await this.studentFeeExpectationService.getFeeSummaryForTerm(
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );

    const statuses = await this.studentFeeExpectationService.listStudentFeeStatuses(
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );

    // Get term info for display
    const termInfo = await this.financeService.getTermInfo(termId);

    return {
      success: true,
      filters: {
        termId,
        academicCalendarId,
      },
      labels: {
        currentTermFigures: `${termInfo?.term || 'Current Term'} Figures`,
        outstandingFromPreviousTerms: 'Outstanding From Previous Terms',
      },
      summary: {
        totalFeesPaid: summary.totalFeesPaid || 0,
        expectedFees: summary.totalExpectedFees || 0,
        pending: summary.outstandingFees || 0,
        overdue: summary.overdueFees || 0,
      },
      statuses: statuses.map(status => ({
        ...status,
        termId,
        term: termInfo?.term || 'Current Term',
      })),
    };
  }

  @Get('fee-statuses')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'List per-student payment status for a term',
  })
  async feeStatuses(
    @Request() req,
    @Query('termId') termId: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.studentFeeExpectationService.listStudentFeeStatuses(
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('fee-status/:studentId')
  @Roles(Role.ADMIN, Role.FINANCE, Role.STUDENT)
  @ApiOperation({ summary: 'Get detailed fee status for a single student' })
  async studentFeeStatus(
    @Request() req,
    @Param('studentId') studentId: string,
    @Query('termId') termId: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    let actualStudentId = studentId;
    
    // If the user is a student, they can only access their own fee status
    // and we need to convert user ID to student ID
    if (user.role === 'STUDENT') {
      if (user.sub !== studentId) {
        throw new ForbiddenException('Students can only access their own fee status');
      }
      
      // Find the student record for this user
      const student = await this.studentRepository.findOne({
        where: { userId: user.sub }
      });
      
      if (!student) {
        throw new NotFoundException('Student record not found for this user');
      }
      
      actualStudentId = student.id;
    }
    
    return this.studentFeeExpectationService.getStudentFeeStatus(
      actualStudentId,
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  @Get('student-financial-details/:studentId')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get comprehensive financial details for a student including transaction history and multi-term breakdown' })
  async getStudentFinancialDetails(
    @Request() req,
    @Param('studentId') studentId: string,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    return this.financeService.getStudentFinancialDetails(
      studentId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
      academicCalendarId,
    );
  }

  @Get('fee-metrics')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary:
      'Aggregated fee metrics (expected, paid, pending, overdue) for dashboard cards',
  })
  async feeMetrics(
    @Request() req,
    @Query('termId') termId: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    return this.studentFeeExpectationService.getFeeSummaryForTerm(
      termId,
      superAdmin ? req.query.schoolId : user.schoolId,
      superAdmin,
    );
  }

  // ---------------- Finance User Management ----------------

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new finance user' })
  @ApiResponse({
    status: 201,
    description: 'Finance user created successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createFinanceUser(
    @Request() req,
    @Body() createFinanceDto: CreateFinanceDto,
    @Query('schoolId') schoolIdOverride?: string,
  ) {
    try {
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const schoolScope = isSuper
        ? schoolIdOverride || req.user?.schoolId
        : req.user?.schoolId;
      const financeUserResult = await this.financeService.createFinanceUser(
        createFinanceDto,
        schoolScope,
        isSuper,
      );
      const financeUser = financeUserResult.financeProfile;
      await this.systemLoggingService.logAction({
        action: 'FINANCE_USER_CREATED',
        module: 'FINANCE',
        level: 'info',
        performedBy: req?.user
          ? { id: req.user.sub, email: req.user.email, role: req.user.role }
          : undefined,
        entityId: financeUserResult.id,
        entityType: 'FinanceUser',
        newValues: {
          id: financeUserResult.id,
          firstName: financeUser.firstName,
          lastName: financeUser.lastName,
          department: financeUser.department,
          canApproveBudgets: financeUser.canApproveBudgets,
          canProcessPayments: financeUser.canProcessPayments,
        },
        metadata: { description: 'Finance user created' },
      });
      return financeUserResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(
        error,
        'FINANCE',
        'FINANCE_USER_CREATE_ERROR',
        { dto: createFinanceDto },
      );
      throw error;
    }
  }

  // ==================== FINANCE OFFICERS ENDPOINTS ====================

  @Get('officers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all finance officers with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Finance officers retrieved successfully' })
  async getAllFinanceOfficers(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Query('schoolId') schoolIdOverride?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper
      ? schoolIdOverride || req.user?.schoolId
      : req.user?.schoolId;

    const { financeUsers, total } = await this.financeService.getAllFinanceUsers(
      Number(page),
      Number(limit),
      search,
      schoolScope,
      isSuper,
    );

    const transformedFinanceOfficers = financeUsers.map((finance) => ({
      id: finance.id,
      firstName: finance.firstName,
      lastName: finance.lastName,
      username: finance.user?.username,
      email: finance.user?.email,
      phoneNumber: finance.phoneNumber,
      department: finance.department,
      canApproveBudgets: finance.canApproveBudgets,
      canProcessPayments: finance.canProcessPayments,
      status: finance.user?.isActive ? 'active' : 'inactive',
      hireDate: finance.user?.createdAt?.toISOString(),
    }));

    return {
      financeOfficers: transformedFinanceOfficers,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
      filters: { schoolId: schoolScope, search },
    };
  }

  @Get('officers/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get finance officer details by ID' })
  @ApiResponse({ status: 200, description: 'Finance officer details returned' })
  @ApiResponse({ status: 404, description: 'Finance officer not found' })
  async getFinanceOfficerById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    const financeUser = await this.financeService.getFinanceUserDetails(
      id,
      superAdmin ? req.query.schoolId || user.schoolId : user.schoolId,
      superAdmin,
    );

    // Add username at top level for easier access
    return {
      ...financeUser,
      username: financeUser.user?.username,
    };
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
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Query('schoolId') schoolIdOverride?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper
      ? schoolIdOverride || req.user?.schoolId
      : req.user?.schoolId;
    const { financeUsers, total } =
      await this.financeService.getAllFinanceUsers(
        Number(page),
        Number(limit),
        search,
        schoolScope,
        isSuper,
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
      filters: { schoolId: schoolScope, search },
    };
  }

  // ---------------- Budget Approval ----------------

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
        performedBy: req?.user
          ? { id: req.user.sub, email: req.user.email, role: req.user.role }
          : undefined,
        entityId: approved?.id,
        entityType: 'Budget',
        newValues: approved
          ? {
              id: approved.id,
              status: approved.status,
              totalAmount: approved.totalAmount,
            }
          : undefined,
        metadata: { description: 'Budget approved' },
      });
      return approvedResult;
    } catch (error) {
      await this.systemLoggingService.logSystemError(
        error,
        'FINANCE',
        'BUDGET_APPROVE_ERROR',
        { budgetId, dto: approveBudgetDto },
      );
      throw error;
    }
  }

  // ---------------- Financial Reports and Stats ----------------

  @Get('stats')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get financial statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getFinancialStats(
    @Request() req,
    @Query('schoolId') schoolIdOverride?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper
      ? schoolIdOverride || req.user?.schoolId
      : req.user?.schoolId;
    return this.financeService.getFinancialStats(
      undefined,
      schoolScope,
      isSuper,
    );
  }

  @Get('total-finances')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({
    summary: 'Get total financial metrics with trend data',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTotalFinances(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('schoolId') schoolIdOverride?: string,
  ): Promise<{
    success: boolean;
    totalProcessedPayments: number;
    totalApprovedBudgets: number;
    totalRevenue: string;
    pendingStudents: number;
    trend: { value: number; isPositive: boolean; hasComparativeData: boolean };
    monthlyRevenue: number;
    monthlyRevenueLastMonth: number;
    outstandingFees: number;
    paymentsToday: number;
    collectionRate: number;
    dateRange?: { start?: string; end?: string };
    filters: { schoolId?: string };
    fallbackUsed?: boolean;
  }> {
    try {
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const schoolScope = isSuper
        ? schoolIdOverride || req.user?.schoolId
        : req.user?.schoolId;
      
      // Get total financial stats and dashboard metrics
      const [totalStats, metrics] = await Promise.all([
        this.financeService.getFinancialStats(
          startDate || endDate ? {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
          } : undefined,
          schoolScope,
          isSuper,
        ),
        this.financeService.calculateDashboardMetrics(
          schoolScope,
          isSuper,
        ),
      ]);

      // If term filtered stats are zero, attempt simple fallback without term filter
      if (schoolScope && !isSuper && totalStats.totalProcessedPayments === 0 && Number(totalStats.totalRevenue) === 0) {
        const simple = await this.financeService.getSimpleTotalsForSchool(schoolScope);
        if (simple.rawTotal > 0) {
          totalStats.totalProcessedPayments = simple.count;
          totalStats.totalRevenue = simple.rawTotal;
          (totalStats as any).fallbackUsed = true;
        }
      }

      // Calculate trend percentage based on monthly comparison
      let trendValue = 0;
      let isPositive = true;

      if (metrics.monthlyRevenueLastMonth > 0) {
        // Normal case: compare this month vs last month
        trendValue = Math.round(
          ((metrics.monthlyRevenue - metrics.monthlyRevenueLastMonth) / metrics.monthlyRevenueLastMonth) * 100,
        );
        isPositive = trendValue >= 0;
      } else if (metrics.monthlyRevenueLastMonth === 0) {
        // Always provide a percentage even without previous data
        if (metrics.monthlyRevenue > 0) {
          trendValue = 100;
          isPositive = true;
        } else {
          trendValue = 0;
          isPositive = true;
        }
      }

      // Use total accumulated revenue for display, not just monthly
      const revenueNumber = Number(totalStats.totalRevenue) || 0;

      await this.systemLoggingService.logAction({
        action: 'FINANCE_TOTALS_QUERIED',
        module: 'FINANCE',
        level: 'debug',
        schoolId: schoolScope,
        metadata: {
          startDate: startDate,
          endDate: endDate,
          totalRevenue: totalStats.totalRevenue,
          monthlyRevenue: metrics.monthlyRevenue,
          monthlyRevenueLastMonth: metrics.monthlyRevenueLastMonth,
          outstandingFees: metrics.outstandingFees,
          paymentsToday: metrics.paymentsToday,
          collectionRate: metrics.collectionRate,
          trendValue,
          isPositive,
          fallbackUsed: totalStats.fallbackUsed || false,
        },
      });

      return {
        success: true,
        ...totalStats, // Include all the original stats (totalProcessedPayments, totalApprovedBudgets, pendingStudents)
        totalRevenue: `$${revenueNumber.toFixed(2)}`,
        trend: {
          value: Math.abs(trendValue),
          isPositive,
          hasComparativeData: true,
        },
        monthlyRevenue: metrics.monthlyRevenue,
        monthlyRevenueLastMonth: metrics.monthlyRevenueLastMonth,
        outstandingFees: metrics.outstandingFees,
        paymentsToday: metrics.paymentsToday,
        collectionRate: metrics.collectionRate,
        dateRange: startDate || endDate ? {
          start: startDate,
          end: endDate,
        } : undefined,
        filters: { schoolId: schoolScope },
        fallbackUsed: totalStats.fallbackUsed || false,
      };
    } catch (error) {
      await this.systemLoggingService.logSystemError(
        error,
        'FINANCE',
        'FINANCE_TOTALS_ERROR',
        {
          startDate,
          endDate,
          schoolIdOverride,
          userId: req.user?.sub || req.user?.id,
          role: req.user?.role,
        },
        req.user?.schoolId,
      );
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
  @ApiQuery({ name: 'termId', required: false, type: String })
  @ApiQuery({ name: 'academicCalendarId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  async getTransactions(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    const dateRange = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return this.financeService.getTransactions(
      Number(page),
      Number(limit),
      search,
      dateRange,
      {
        termId,
        academicCalendarId,
        schoolId: superAdmin ? req.query.schoolId : user.schoolId,
        superAdmin,
      },
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
  @ApiOperation({ summary: "Get fee payments for parent's children" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description:
      "List of fee payments for parent's children retrieved successfully",
  })
  async getParentPayments(
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
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
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
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

  @Get('reports/financial')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get combined financial report (fees by type + approved expenses)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'schoolId', required: false, type: String })
  async getCombinedFinancialReport(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('schoolId') schoolIdOverride?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper
      ? schoolIdOverride || req.user?.schoolId
      : req.user?.schoolId;

    const result = await this.financeService.getFinancialReportSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      schoolId: schoolScope,
      superAdmin: isSuper,
    });

    return {
      success: true,
      ...result,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        schoolId: schoolScope || null,
      },
    };
  }

  @Get('reports/term-based')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get term-based financial report with carry-forward balances' })
  @ApiQuery({ name: 'schoolId', required: false, type: String })
  @ApiQuery({ name: 'includeCarryForward', required: false, type: Boolean })
  async getTermBasedFinancialReport(
    @Request() req,
    @Query('schoolId') schoolIdOverride?: string,
    @Query('includeCarryForward') includeCarryForward?: boolean,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper
      ? schoolIdOverride || req.user?.schoolId
      : req.user?.schoolId;

    const result = await this.financeService.getTermBasedFinancialReport({
      schoolId: schoolScope,
      superAdmin: isSuper,
      includeCarryForward: includeCarryForward !== false, // Default to true
    });

    return {
      success: true,
      ...result,
    };
  }
}
