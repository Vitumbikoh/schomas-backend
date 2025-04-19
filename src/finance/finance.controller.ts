// finance.controller.ts
import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ProcessPaymentDto } from './dtos/process-payment.dto';
import { ApproveBudgetDto } from './dtos/approve-budget.dto';
import { Roles } from '../user/decorators/roles.decorator';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance') 
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.FINANCE, Role.ADMIN)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get finance dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(@Request() req) {
    return this.financeService.getDashboardData(req.user.id);
  }

  @Post('payments')
  @ApiOperation({ summary: 'Process a fee payment' })
  @ApiResponse({ status: 201, description: 'Payment processed successfully' })
  async processPayment(@Request() req, @Body() processPaymentDto: ProcessPaymentDto) {
    return this.financeService.processPayment(req.user.id, processPaymentDto);
  }

  @Post('budgets/:id/approve')
  @ApiOperation({ summary: 'Approve a budget proposal' })
  @ApiResponse({ status: 200, description: 'Budget approved successfully' })
  async approveBudget(
    @Request() req,
    @Param('id') budgetId: string,
    @Body() approveBudgetDto: ApproveBudgetDto
  ) {
    return this.financeService.approveBudget(req.user.id, budgetId, approveBudgetDto);
  }


  @Get('stats')
  @ApiOperation({ summary: 'Get financial statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getFinancialStats() {
    return this.financeService.getFinancialStats();
  }
  
  @Get('transactions')
  @ApiOperation({ summary: 'Get financial transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTransactions(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const dateRange = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };
    return this.financeService.getTransactions(
      Number(page),
      Number(limit),
      search,
      dateRange
    );
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Generate financial summary report' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateFinancialReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return this.financeService.generateFinancialReport(
      new Date(startDate),
      new Date(endDate)
    );
  }
}