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
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';

// Enhanced services
import { EnhancedFinanceService } from './services/enhanced-finance.service';
import { PaymentAllocationService } from './services/payment-allocation.service';
import { CarryForwardService } from './services/carry-forward.service';

// DTOs
import { CreatePaymentDto, CreatePaymentAllocationDto, CarryForwardDto } from './dtos/enhanced-finance.dto';

@ApiTags('Enhanced Finance')
@ApiBearerAuth()
@Controller('finance/v2')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EnhancedFinanceController {
  constructor(
    private readonly financeService: EnhancedFinanceService,
    private readonly allocationService: PaymentAllocationService,
    private readonly carryForwardService: CarryForwardService,
  ) {}

  // =====================================================
  // SUMMARY & REPORTING ENDPOINTS
  // =====================================================

  @Get('summary')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get comprehensive finance summary for a term' })
  @ApiQuery({ name: 'termId', required: true, description: 'Term ID' })
  @ApiQuery({ name: 'academicCalendarId', required: false, description: 'Academic Calendar ID (optional for filtering)' })
  async getFinanceSummary(
    @Query('termId', ParseUUIDPipe) termId: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.financeService.getTermFinanceSummary(termId, schoolId);
  }

  @Get('fee-statuses')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get fee statuses for all students in a term' })
  @ApiQuery({ name: 'termId', required: true, description: 'Term ID' })
  @ApiQuery({ name: 'academicCalendarId', required: false, description: 'Academic Calendar ID (optional for filtering)' })
  async getFeeStatuses(
    @Query('termId', ParseUUIDPipe) termId: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.financeService.getTermStudentFeeStatuses(termId, schoolId);
  }

  @Get('student/:studentId/status')
  @Roles(Role.FINANCE, Role.ADMIN, Role.STUDENT)
  @ApiOperation({ summary: 'Get detailed fee status for a specific student in a term' })
  @ApiQuery({ name: 'termId', required: true, description: 'Term ID' })
  async getStudentFeeStatus(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId', ParseUUIDPipe) termId: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    // Additional authorization for students
    if (req?.user?.role === Role.STUDENT && req.user.id !== studentId) {
      throw new BadRequestException('Students can only view their own fee status');
    }
    
    return this.financeService.getStudentFeeStatus(studentId, termId, schoolId);
  }

  @Get('overdue-analysis')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get analysis of overdue amounts across all terms' })
  async getOverdueAnalysis(@Request() req?: any) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.financeService.getOverdueAnalysis(schoolId);
  }

  // =====================================================
  // PAYMENT & ALLOCATION ENDPOINTS
  // =====================================================

  @Post('payments')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new payment with automatic allocation' })
  @ApiBody({ type: CreatePaymentDto })
  async createPayment(
    @Body(ValidationPipe) createPaymentDto: CreatePaymentDto,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    // Implementation would create payment and auto-allocate
    // This is a placeholder for the actual payment creation logic
    throw new Error('Payment creation endpoint to be implemented with existing payment service integration');
  }

  @Get('payments/:paymentId/allocations')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get all allocations for a payment' })
  async getPaymentAllocations(
    @Param('paymentId', ParseUUIDPipe) paymentId: string
  ) {
    return this.allocationService.getPaymentAllocations(paymentId);
  }

  @Get('payments/:paymentId/allocation-suggestions')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get intelligent allocation suggestions for a payment' })
  async getAllocationSuggestions(
    @Param('paymentId', ParseUUIDPipe) paymentId: string
  ) {
    return this.allocationService.getAllocationSuggestions(paymentId);
  }

  @Post('payments/:paymentId/auto-allocate')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Auto-allocate a payment using intelligent suggestions' })
  async autoAllocatePayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string
  ) {
    return this.allocationService.autoAllocatePayment(paymentId);
  }

  @Post('allocations')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Create manual payment allocations' })
  @ApiBody({ type: [CreatePaymentAllocationDto] })
  async createAllocations(
    @Body(ValidationPipe) allocations: CreatePaymentAllocationDto[],
    @Request() req?: any
  ) {
    const requests = allocations.map(dto => ({
      paymentId: dto.paymentId,
      termId: dto.termId,
      amount: dto.amount,
      reason: dto.reason,
      notes: dto.notes,
      allocatedByUserId: req?.user?.id
    }));

    return this.allocationService.createAllocations(requests);
  }

  @Delete('allocations/:allocationId')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Remove a payment allocation' })
  async removeAllocation(
    @Param('allocationId', ParseUUIDPipe) allocationId: string
  ) {
    return this.allocationService.removeAllocation(allocationId);
  }

  @Get('terms/:termId/allocations')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get all payment allocations for a term' })
  async getTermAllocations(
    @Param('termId', ParseUUIDPipe) termId: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.allocationService.getTermAllocations(termId, schoolId);
  }

  // =====================================================
  // CARRY-FORWARD ENDPOINTS
  // =====================================================

  @Get('terms/:termId/outstanding-balances')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Calculate outstanding balances for a completed term' })
  async getOutstandingBalances(
    @Param('termId', ParseUUIDPipe) termId: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.carryForwardService.calculateOutstandingBalances(termId, schoolId);
  }

  @Post('carry-forward')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Carry forward outstanding balances from one term to another' })
  @ApiBody({ type: CarryForwardDto })
  async carryForwardBalances(
    @Body(ValidationPipe) carryForwardDto: CarryForwardDto,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.carryForwardService.carryForwardBalances(
      carryForwardDto.fromTermId,
      carryForwardDto.toTermId,
      schoolId
    );
  }

  @Get('students/:studentId/carry-forward-history')
  @Roles(Role.FINANCE, Role.ADMIN, Role.STUDENT)
  @ApiOperation({ summary: 'Get carry-forward history for a student' })
  async getStudentCarryForwardHistory(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    // Additional authorization for students
    if (req?.user?.role === Role.STUDENT && req.user.id !== studentId) {
      throw new BadRequestException('Students can only view their own carry-forward history');
    }
    
    return this.carryForwardService.getStudentCarryForwardHistory(studentId, schoolId);
  }

  @Delete('carry-forward/reverse')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Reverse carry-forward operations (for corrections)' })
  @ApiQuery({ name: 'termId', required: true, description: 'Term ID to reverse carry-forward for' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Student ID (optional, for specific student)' })
  async reverseCarryForward(
    @Query('termId', ParseUUIDPipe) termId: string,
    @Query('studentId', new ParseUUIDPipe({ optional: true })) studentId?: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    return this.carryForwardService.reverseCarryForward(termId, studentId, schoolId);
  }

  // =====================================================
  // TRANSACTION HISTORY (Enhanced)
  // =====================================================

  @Get('transactions')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get transaction history with allocation details' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'termId', required: false, description: 'Filter by term ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'academicCalendarId', required: false, description: 'Filter by academic calendar ID' })
  async getTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('termId', new ParseUUIDPipe({ optional: true })) termId?: string,
    @Query('studentId', new ParseUUIDPipe({ optional: true })) studentId?: string,
    @Query('academicCalendarId', new ParseUUIDPipe({ optional: true })) academicCalendarId?: string,
    @Request() req?: any
  ) {
    const schoolId = req?.user?.role === Role.ADMIN ? req.user.schoolId : undefined;
    
    // This would integrate with enhanced transaction service
    // For now, return placeholder
    return {
      transactions: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      },
      filters: { termId, studentId, academicCalendarId, schoolId }
    };
  }
}