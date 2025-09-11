import { Controller, Post, Body, UseGuards, Request, Get, Param, Query, Res, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { BillingService } from './billing.service';
import { SetSchoolBillingPlanDto } from './dtos/set-plan.dto';
import { GenerateInvoiceDto, RecordBillingPaymentDto } from './dtos/generate-invoice.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List billing plans (SUPER_ADMIN can filter by schoolId, ADMIN sees their own)' })
  async listPlans(@Request() req, @Query('schoolId') schoolIdParam?: string) {
    let schoolId = req.user?.schoolId;
    if (req.user?.role === 'SUPER_ADMIN' && schoolIdParam) {
      schoolId = schoolIdParam;
    }
    return this.billingService.listPlans(schoolId);
  }

  @Post('plans/set')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Set or update the billing plan for a school (SUPER_ADMIN or ADMIN scoped)' })
  async setPlan(@Request() req, @Body() dto: SetSchoolBillingPlanDto) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.billingService.setSchoolPlan(dto, actor);
  }

  @Post('invoices/generate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Generate invoice per term or academic year based on active student usage' })
  async generateInvoice(@Request() req, @Body() dto: GenerateInvoiceDto) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.billingService.generateInvoice(dto, actor);
  }

  @Get('invoices')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List invoices for current scope school' })
  async listInvoices(@Request() req, @Query('schoolId') schoolIdParam?: string) {
    let schoolId = req.user?.schoolId;
    if (req.user?.role === 'SUPER_ADMIN' && schoolIdParam) schoolId = schoolIdParam;
    return this.billingService.listInvoices(schoolId);
  }

  @Get('invoices/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async getInvoice(@Request() req, @Param('id') id: string) {
    const schoolId = req.user?.schoolId;
    return this.billingService.getInvoice(id, schoolId);
  }

  @Get('invoices/:id/pdf')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Download invoice as branded PDF' })
  async getInvoicePdf(@Request() req, @Param('id') id: string, @Res() res) {
    const schoolId = req.user?.schoolId;
    const { stream, filename } = await this.billingService.getInvoicePdfStream(id, schoolId, req.user?.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }

  @Delete('invoices/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete an invoice' })
  async deleteInvoice(@Request() req, @Param('id') id: string) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.billingService.deleteInvoice(id, actor);
  }

  @Post('payments')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Record a payment against an invoice (SUPER_ADMIN)' })
  async recordPayment(@Request() req, @Body() dto: RecordBillingPaymentDto) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId, userId: req.user?.sub || req.user?.id };
    return this.billingService.recordPayment(dto, actor);
  }

  // --- Lookups to support UI selectors ---
  @Get('schools')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List schools (SUPER_ADMIN)' })
  async listSchools(@Query('search') search?: string) {
    return this.billingService.listSchools(search);
  }

  @Get('schools/:schoolId/academic-calendars')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List academic calendars for a school' })
  async listCalendars(@Request() req, @Param('schoolId') schoolId: string) {
    if (req.user?.role !== 'SUPER_ADMIN') schoolId = req.user?.schoolId;
    return this.billingService.listAcademicCalendarsForSchool(schoolId);
  }

  @Get('schools/:schoolId/terms')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List terms for a school (optionally filter by academicCalendarId)' })
  async listTerms(
    @Request() req,
    @Param('schoolId') schoolId: string,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    if (req.user?.role !== 'SUPER_ADMIN') schoolId = req.user?.schoolId;
    return this.billingService.listTermsForSchool(schoolId, academicCalendarId);
  }

  // Simplified endpoints for frontend convenience
  @Get('calendars')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List academic calendars for a school (query param)' })
  async listCalendarsSimple(@Request() req, @Query('schoolId') schoolIdParam?: string) {
    let schoolId = req.user?.schoolId;
    if (req.user?.role === 'SUPER_ADMIN' && schoolIdParam) {
      schoolId = schoolIdParam;
    }
    return this.billingService.listAcademicCalendarsForSchool(schoolId);
  }

  @Get('terms')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List terms for a school (query param)' })
  async listTermsSimple(
    @Request() req,
    @Query('schoolId') schoolIdParam?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    let schoolId = req.user?.schoolId;
    if (req.user?.role === 'SUPER_ADMIN' && schoolIdParam) {
      schoolId = schoolIdParam;
    }
    return this.billingService.listTermsForSchool(schoolId, academicCalendarId);
  }
}
