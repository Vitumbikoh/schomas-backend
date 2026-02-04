import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { GraduateFeesService } from '../services/graduate-fees.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Role } from '../../user/enums/role.enum';
import { GraduatePaymentDto, WaiveGraduateFeeDto, GraduateFiltersDto } from '../dtos/graduate-fees.dto';

@Controller('finance/graduates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GraduateFeesController {
  private readonly logger = new Logger(GraduateFeesController.name);

  constructor(private readonly graduateFeesService: GraduateFeesService) {}

  /**
   * GET /finance/graduates
   * Get paginated list of graduates with outstanding fees
   */
  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  async listGraduates(
    @Query() filters: GraduateFiltersDto,
    @Request() req,
  ) {
    this.logger.log(
      `Listing graduates: User ${req.user.username}, School ${req.user.schoolId}`,
    );

    const schoolId =
      req.user.role === 'super_admin' ? filters.schoolId : req.user.schoolId;

    const result = await this.graduateFeesService.getGraduatesList(
      filters,
      schoolId,
    );

    return {
      success: true,
      message: 'Graduates retrieved successfully',
      data: result,
    };
  }

  /**
   * GET /finance/graduates/report/summary
   * Get summary statistics for graduate fees
   */
  @Get('report/summary')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  async getGraduateSummary(@Request() req) {
    this.logger.log(
      `Getting graduate summary: User ${req.user.username}`,
    );

    const schoolId =
      req.user.role === 'super_admin' ? undefined : req.user.schoolId;

    const summary = await this.graduateFeesService.getGraduateSummary(schoolId);

    return {
      success: true,
      message: 'Graduate summary retrieved successfully',
      data: summary,
    };
  }

  /**
   * GET /finance/graduates/:studentId
   * Get detailed information for a specific graduate
   */
  @Get(':studentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  async getGraduateDetails(
    @Param('studentId') studentId: string,
    @Request() req,
  ) {
    this.logger.log(
      `Getting graduate details: Student ${studentId}, User ${req.user.username}`,
    );

    const schoolId =
      req.user.role === 'super_admin' ? undefined : req.user.schoolId;

    const details = await this.graduateFeesService.getGraduateDetails(
      studentId,
      schoolId,
    );

    return {
      success: true,
      message: 'Graduate details retrieved successfully',
      data: details,
    };
  }

  /**
   * POST /finance/graduates/:studentId/payment
   * Record payment from a graduated student
   */
  @Post(':studentId/payment')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  @HttpCode(HttpStatus.CREATED)
  async recordGraduatePayment(
    @Param('studentId') studentId: string,
    @Body() paymentDto: GraduatePaymentDto,
    @Request() req,
  ) {
    this.logger.log(
      `Recording graduate payment: Student ${studentId}, Amount MK ${paymentDto.amount}`,
    );

    const schoolId =
      req.user.role === 'super_admin' ? undefined : req.user.schoolId;

    const result = await this.graduateFeesService.processGraduatePayment(
      studentId,
      paymentDto,
      req.user.id,
      schoolId,
    );

    return {
      success: true,
      message: `Payment of MK ${paymentDto.amount} recorded successfully`,
      data: result,
    };
  }

  /**
   * PATCH /finance/graduates/:studentId/waive
   * Waive outstanding fees for a graduate (admin only)
   */
  @Patch(':studentId/waive')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async waiveGraduateFees(
    @Param('studentId') studentId: string,
    @Body() waiveDto: WaiveGraduateFeeDto,
    @Request() req,
  ) {
    this.logger.log(
      `Waiving graduate fees: Student ${studentId}, Amount MK ${waiveDto.amount}`,
    );

    const schoolId =
      req.user.role === 'super_admin' ? undefined : req.user.schoolId;

    const result = await this.graduateFeesService.waiveGraduateFees(
      studentId,
      waiveDto,
      req.user.id,
      schoolId,
    );

    return {
      success: true,
      message: `Fees waived successfully: MK ${waiveDto.amount}`,
      data: result,
    };
  }

  /**
   * POST /finance/graduates/:studentId/snapshot
   * Manually create/refresh graduate outstanding snapshot
   * Useful for data corrections or re-snapshotting
   */
  @Post(':studentId/snapshot')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createSnapshot(
    @Param('studentId') studentId: string,
    @Query('terminId') termId: string,
    @Request() req,
  ) {
    this.logger.log(
      `Creating graduate snapshot: Student ${studentId}, User ${req.user.username}`,
    );

    const snapshot = await this.graduateFeesService.snapshotGraduateOutstanding(
      studentId,
      termId,
    );

    return {
      success: true,
      message: 'Graduate outstanding snapshot created successfully',
      data: snapshot,
    };
  }
}
