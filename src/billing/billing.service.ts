import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolBillingPlan } from './entities/school-billing-plan.entity';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingPayment } from './entities/billing-payment.entity';
import { SetSchoolBillingPlanDto } from './dtos/set-plan.dto';
import { GenerateInvoiceDto, RecordBillingPaymentDto } from './dtos/generate-invoice.dto';
import { Term } from '../settings/entities/term.entity';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { School } from '../school/entities/school.entity';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Role } from '../user/enums/role.enum';
import { Class } from '../classes/entity/class.entity';
import { Expense, ExpenseStatus, ExpenseCategory, ExpensePriority } from '../expenses/entities/expense.entity';
import { ExpenseApprovalHistory, ApprovalAction } from '../expenses/entities/expense-approval-history.entity';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType, NotificationPriority } from '../notifications/entities/notification.entity';
import PDFDocument = require('pdfkit');
import { PassThrough } from 'stream';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(SchoolBillingPlan) private planRepo: Repository<SchoolBillingPlan>,
    @InjectRepository(BillingInvoice) private invoiceRepo: Repository<BillingInvoice>,
    @InjectRepository(BillingPayment) private paymentRepo: Repository<BillingPayment>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(AcademicCalendar) private calendarRepo: Repository<AcademicCalendar>,
    @InjectRepository(Enrollment) private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(School) private schoolRepo: Repository<School>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Class) private classRepo: Repository<Class>,
    @InjectRepository(Expense) private expenseRepo: Repository<Expense>,
    @InjectRepository(ExpenseApprovalHistory) private approvalHistoryRepo: Repository<ExpenseApprovalHistory>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notificationService: NotificationService,
  ) {}

  async setSchoolPlan(dto: SetSchoolBillingPlanDto, actor: { role: string; schoolId?: string }) {
    // For SUPER_ADMIN, schoolId must come from DTO; for ADMIN, it comes from their token
    const resolvedSchoolId = actor.role === 'SUPER_ADMIN' ? dto.schoolId : actor.schoolId;
    
    if (!resolvedSchoolId) {
      throw new ForbiddenException('Missing school scope - SUPER_ADMIN must provide schoolId, ADMIN must be associated with a school');
    }
    
    // Only check cross-school access for non-super admins
    if (actor.role !== 'SUPER_ADMIN' && dto.schoolId && dto.schoolId !== actor.schoolId) {
      throw new ForbiddenException('Not allowed to set plan for another school');
    }
    
    if (dto.ratePerStudent <= 0) throw new BadRequestException('ratePerStudent must be > 0');
    let plan = await this.planRepo.findOne({ where: { schoolId: resolvedSchoolId, isActive: true } });
    if (plan) {
      plan.ratePerStudent = dto.ratePerStudent;
      plan.currency = dto.currency || plan.currency || 'MWK';
      plan.cadence = (dto.cadence as any) || plan.cadence || 'per_term';
      plan.effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : plan.effectiveFrom;
    } else {
      plan = this.planRepo.create({
        schoolId: resolvedSchoolId,
        ratePerStudent: dto.ratePerStudent,
        currency: dto.currency || 'MWK',
        cadence: (dto.cadence as any) || 'per_term',
        isActive: true,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      });
    }
    return this.planRepo.save(plan);
  }

  private async getActivePlanOrThrow(schoolId: string) {
    const plan = await this.planRepo.findOne({ where: { schoolId, isActive: true } });
    if (!plan) throw new NotFoundException('Active billing plan not found for school');
    return plan;
  }

  private async countActiveStudentsForTerm(termId: string, schoolId: string) {
    // Count actual students enrolled in classes for this school (excluding graduated and inactive students)
    // Get the Graduated class ID first
    const graduatedClass = await this.classRepo.findOne({ 
      where: { schoolId, numericalName: 999 } 
    });
    
    const qb = this.studentRepo.createQueryBuilder('student')
      .where('student.schoolId = :schoolId', { schoolId });

    // Exclude inactive students explicitly
    qb.andWhere('student.isActive = true');
    
    // Exclude graduated students
    if (graduatedClass) {
      qb.andWhere('student.classId != :graduatedClassId', { graduatedClassId: graduatedClass.id });
    }
    
    const count = await qb.getCount();
    return count;
  }

  private async countActiveStudentsForAcademicCalendar(academicCalendarId: string, schoolId: string) {
    // Count actual students enrolled in classes for this school (excluding graduated and inactive students)
    // Get the Graduated class ID first
    const graduatedClass = await this.classRepo.findOne({ 
      where: { schoolId, numericalName: 999 } 
    });
    
    const qb = this.studentRepo.createQueryBuilder('student')
      .where('student.schoolId = :schoolId', { schoolId });

    // Exclude inactive students explicitly
    qb.andWhere('student.isActive = true');
    
    // Exclude graduated students
    if (graduatedClass) {
      qb.andWhere('student.classId != :graduatedClassId', { graduatedClassId: graduatedClass.id });
    }
    
    const count = await qb.getCount();
    return count;
  }

  private generateInvoiceNumber(prefix: string) {
    const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `${prefix}-${rand}`;
  }

  async generateInvoice(dto: GenerateInvoiceDto, actor: { role: string; schoolId?: string }) {
  // Resolve target school: prefer explicit dto.schoolId (super admin selects school),
  // otherwise fall back to actor scope. Non-super admins cannot target another school.
  const schoolId = (dto as any).schoolId ?? actor.schoolId;

  // Debug logs for visibility during generation
  // eslint-disable-next-line no-console
  console.debug('[BillingService.generateInvoice] actor=', actor, ' dto=', dto, ' resolvedSchoolId=', schoolId);

    if (!schoolId) {
      // Super admin must provide a target schoolId; admins must be associated with a school
  // eslint-disable-next-line no-console
  console.debug('[BillingService.generateInvoice] Missing schoolId. actor=', actor, ' dto=', dto);
  throw new ForbiddenException('Missing school scope: provide schoolId or use a scoped account');
    }

    // Only enforce cross-school restriction for non-super admins
    if (actor.role !== 'SUPER_ADMIN' && (dto as any).schoolId && (dto as any).schoolId !== actor.schoolId) {
  // eslint-disable-next-line no-console
  console.debug('[BillingService.generateInvoice] Cross-school attempt blocked. actor=', actor, ' dto=', dto);
  throw new ForbiddenException('Not allowed to generate invoice for another school');
    }
    
    const plan = await this.getActivePlanOrThrow(schoolId);

    if (!dto.termId && !dto.academicCalendarId) {
      throw new BadRequestException('Provide termId or academicCalendarId');
    }

    let activeStudents = 0;
    let invoiceNumberPrefix = `SCH-${schoolId.slice(0, 6)}`;
    let termId: string | undefined;
    let academicCalendarId: string | undefined;

    if (dto.termId) {
      const term = await this.termRepo.findOne({ where: { id: dto.termId, schoolId } });
      if (!term) throw new NotFoundException('Term not found for school');
      const existing = await this.invoiceRepo.findOne({ where: { schoolId, termId: term.id } });
      if (existing) return existing;
      activeStudents = await this.countActiveStudentsForTerm(term.id, schoolId);
      termId = term.id;
      invoiceNumberPrefix += `-T${term.termNumber}`;
    } else if (dto.academicCalendarId) {
      const cal = await this.calendarRepo.findOne({ where: { id: dto.academicCalendarId, schoolId } });
      if (!cal) throw new NotFoundException('Academic calendar not found for school');
      const existing = await this.invoiceRepo.findOne({ where: { schoolId, academicCalendarId: cal.id } });
      if (existing) return existing;
      activeStudents = await this.countActiveStudentsForAcademicCalendar(cal.id, schoolId);
      academicCalendarId = cal.id;
      invoiceNumberPrefix += `-AY`;
    }

    if (!activeStudents || activeStudents <= 0) {
      throw new BadRequestException('No active students in the selected scope');
    }

    const subtotal = Number(plan.ratePerStudent) * Number(activeStudents);
    const discount = 0;
    const totalAmount = subtotal - discount;
    const invoice = this.invoiceRepo.create({
      invoiceNumber: this.generateInvoiceNumber(invoiceNumberPrefix),
      schoolId,
      termId: termId || null,
      academicCalendarId: academicCalendarId || null,
      activeStudentsCount: activeStudents,
      ratePerStudent: plan.ratePerStudent,
      subtotal,
      discount,
      totalAmount,
      amountPaid: 0,
      status: 'issued',
      issueDate: new Date(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      notes: dto.notes,
      currency: plan.currency,
    });
    const savedInvoice = await this.invoiceRepo.save(invoice);

    // --- Automatically create a PENDING expense for the school admin to review ---
    try {
      await this.createInvoiceExpense(savedInvoice, schoolId);
    } catch (error) {
      console.error('[BillingService] Failed to create invoice expense entry:', error);
    }

    // Create notification for school admin (school-scoped so school admin sees it)
    try {
      const periodLabel = termId
        ? `Term ${(await this.termRepo.findOne({ where: { id: termId } }))?.termNumber ?? ''}`
        : (academicCalendarId
            ? (await this.calendarRepo.findOne({ where: { id: academicCalendarId } }))?.term ?? 'Academic Year'
            : 'Selected Period');

      await this.notificationService.create({
        title: 'New Billing Invoice Received',
        message: `A Schomas platform invoice (${savedInvoice.invoiceNumber}) has been issued for ${periodLabel}. Amount: ${savedInvoice.currency} ${Number(savedInvoice.totalAmount).toLocaleString()}. Please review and approve in Expenses.`,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.HIGH,
        schoolId,
        metadata: {
          invoiceId: savedInvoice.id,
          invoiceNumber: savedInvoice.invoiceNumber,
          amount: savedInvoice.totalAmount,
          currency: savedInvoice.currency,
          isBillingInvoice: true,
        },
      });
    } catch (error) {
      console.error('[BillingService] Failed to create invoice notification:', error);
    }

    return savedInvoice;
  }

  /** Generate a unique EXP-YYYY-NNNN number for auto-created invoice expenses */
  private async generateInvoiceExpenseNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.expenseRepo
      .createQueryBuilder('e')
      .where('e.expenseNumber LIKE :pattern', { pattern: `EXP-${year}-%` })
      .orderBy('e.expenseNumber', 'DESC')
      .getOne();
    let next = 1;
    if (last?.expenseNumber) {
      const parts = last.expenseNumber.split('-');
      if (parts.length === 3) {
        const n = parseInt(parts[2], 10);
        if (!isNaN(n)) next = n + 1;
      }
    }
    return `EXP-${year}-${next.toString().padStart(4, '0')}`;
  }

  /** Create a PENDING expense so the school admin can review/approve the billing invoice */
  private async createInvoiceExpense(invoice: BillingInvoice, schoolId: string): Promise<void> {
    // Find the school admin (ADMIN role) for this school to act as the requester reference
    const adminUser = await this.userRepo.findOne({
      where: { role: Role.ADMIN, schoolId, isActive: true },
    });

    // Determine a term for the expense (for grouping in finance reports)
    const currentTerm = await this.termRepo.findOne({
      where: { schoolId, isCurrent: true },
      select: ['id'],
    });

    const expenseNumber = await this.generateInvoiceExpenseNumber();

    // Build a human-readable due date (30 days from now if not on the invoice)
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate as any)
      : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })();

    const expense = this.expenseRepo.create({
      expenseNumber,
      title: `Schomas Platform Invoice – ${invoice.invoiceNumber}`,
      description:
        `Schomas platform subscription invoice for ${invoice.activeStudentsCount} active students ` +
        `at ${invoice.currency} ${Number(invoice.ratePerStudent).toFixed(2)} per student. ` +
        `Invoice number: ${invoice.invoiceNumber}.`,
      amount: Number(invoice.totalAmount),
      category: ExpenseCategory.ADMINISTRATIVE,
      department: 'Schomas Billing',
      requestedBy: 'Schomas System',
      requestedByUserId: adminUser?.id ?? null,
      schoolId,
      termId: currentTerm?.id ?? null,
      status: ExpenseStatus.PENDING,
      priority: ExpensePriority.HIGH,
      budgetCode: invoice.invoiceNumber,
      dueDate: dueDate,
      requestDate: new Date(),
      isBillingInvoice: true,
      billingInvoiceId: invoice.id,
      notes: `Auto-generated from Schomas billing invoice ${invoice.invoiceNumber}. Please approve to acknowledge receipt.`,
    });

    const savedExpense = await this.expenseRepo.save(expense);

    // Record initial submission in approval history
    const systemUserId = adminUser?.id ?? null;
    const history = this.approvalHistoryRepo.create({
      expenseId: savedExpense.id,
      performedBy: 'Schomas System',
      performedByUserId: systemUserId,
      action: ApprovalAction.SUBMITTED,
      comments: `Invoice ${invoice.invoiceNumber} submitted for school admin review.`,
      newStatus: ExpenseStatus.PENDING,
    });
    await this.approvalHistoryRepo.save(history);
  }

  async listInvoices(schoolId: string) {
  return this.invoiceRepo.find({ where: { schoolId }, order: { createdAt: 'DESC' } });
  }

  async getInvoice(id: string, schoolId: string) {
    const inv = await this.invoiceRepo.findOne({ where: { id, schoolId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  async recordPayment(dto: RecordBillingPaymentDto, actor: { role: string; schoolId?: string; userId?: string }) {
    const invoice = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const schoolId = actor.role === 'SUPER_ADMIN' ? invoice.schoolId : actor.schoolId;
    if (!schoolId || schoolId !== invoice.schoolId) throw new ForbiddenException('Scope mismatch');
    const amount = Number(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    const payment = this.paymentRepo.create({
      invoiceId: invoice.id,
      schoolId,
      amount,
      method: dto.method || 'manual',
      reference: dto.reference,
      processedById: actor.userId || null,
    });
    await this.paymentRepo.save(payment);
    const newPaid = Number(invoice.amountPaid) + amount;
    let status: BillingInvoice['status'] = 'partial';
    const isPaidInFull = newPaid >= Number(invoice.totalAmount);
    if (isPaidInFull) status = 'paid';
    await this.invoiceRepo.update(invoice.id, { amountPaid: newPaid, status });

    // Create notification for payment
    try {
      const notificationTitle = isPaidInFull ? 'Invoice Paid in Full' : 'Partial Payment Received';
      await this.notificationService.create({
        title: notificationTitle,
        message: `Payment of ${invoice.currency} ${amount} received for invoice ${invoice.invoiceNumber}${isPaidInFull ? ' - Invoice now fully paid' : ''}`,
        type: NotificationType.SYSTEM,
        priority: isPaidInFull ? NotificationPriority.MEDIUM : NotificationPriority.LOW,
        schoolId,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentAmount: amount,
          totalPaid: newPaid,
          totalAmount: invoice.totalAmount,
          currency: invoice.currency,
          isPaidInFull
        }
      });
    } catch (error) {
      console.error('Failed to create payment notification:', error);
    }

    return this.getInvoice(invoice.id, schoolId);
  }

  // --- Lookups to support admin UI dropdowns ---
  async listPlans(schoolId?: string) {
    const where: any = { isActive: true };
    if (schoolId) where.schoolId = schoolId;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async listSchools(search?: string) {
    const qb = this.schoolRepo.createQueryBuilder('s').orderBy('s.name', 'ASC');
    if (search) {
      qb.where('LOWER(s.name) LIKE :q OR LOWER(s.code) LIKE :q', { q: `%${search.toLowerCase()}%` });
    }
    return qb.select(['s.id', 's.name', 's.code', 's.status']).getMany();
  }

  async listAcademicCalendarsForSchool(schoolId: string) {
    // Include school-specific calendars and global/independent calendars (schoolId IS NULL)
    const qb = this.calendarRepo.createQueryBuilder('c');
    qb.where('c.schoolId = :schoolId', { schoolId }).orWhere('c.schoolId IS NULL');
    qb.orderBy('c.createdAt', 'DESC');
    return qb.getMany();
  }

  async listTermsForSchool(schoolId: string, academicCalendarId?: string) {
    const where: any = { schoolId };
    if (academicCalendarId) where.academicCalendar = { id: academicCalendarId } as any;
    return this.termRepo.find({ where, order: { startDate: 'ASC' as any } });
  }

  // --- PDF generation ---
  async getInvoicePdfStream(id: string, schoolIdFromToken?: string, role?: string) {
    // Load invoice and ensure scope (admins must match, super admin can access any)
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (role !== 'SUPER_ADMIN' && (!schoolIdFromToken || schoolIdFromToken !== inv.schoolId)) {
      throw new ForbiddenException('Scope mismatch');
    }

    const school = await this.schoolRepo.findOne({ where: { id: inv.schoolId } });
    
    // Load term and calendar info for friendly names
  let termInfo: Term | null = null;
  let calendarInfo: AcademicCalendar | null = null;
    if (inv.termId) {
      termInfo = await this.termRepo.findOne({ where: { id: inv.termId } });
    }
    if (inv.academicCalendarId) {
      calendarInfo = await this.calendarRepo.findOne({ where: { id: inv.academicCalendarId } });
    }

    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 60,
      info: {
        Title: `Invoice ${inv.invoiceNumber}`,
        Author: 'Schomas Management System',
        Subject: 'School Billing Invoice',
        Creator: 'Schomas Billing'
      }
    });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Colors
    const primaryColor = '#1e40af';   // Professional blue
    const accentColor = '#3b82f6';    // Lighter blue
    const textColor = '#1f2937';      // Dark gray
    const lightGray = '#f3f4f6';      // Light background

    // Page dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 60;
    const contentWidth = pageWidth - (margin * 2);

    // Professional Header with letterhead design
    doc.rect(0, 0, pageWidth, 120).fill(primaryColor);
    
    // Company branding
    doc.fill('#ffffff')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text('SCHOMAS', margin, 35, { align: 'left' });
    
    doc.fontSize(12)
       .font('Helvetica')
       .text('School Management & Billing System', margin, 65);
    
    doc.fontSize(10)
       .text('Professional Educational Solutions', margin, 82);

    // Invoice title in header
    doc.fontSize(32)
       .font('Helvetica-Bold')
       .text('INVOICE', 0, 40, { align: 'right', width: pageWidth - margin });

    // Reset position after header
    doc.y = 150;
    doc.fill(textColor);

    // Invoice metadata section with elegant styling
    const metaY = doc.y;
    doc.rect(margin, metaY, contentWidth, 90).fill(lightGray).stroke('#e5e7eb');
    
    doc.fill(textColor)
       .fontSize(11)
       .font('Helvetica-Bold')
       .text('Invoice Details', margin + 20, metaY + 15);

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Invoice Number:`, margin + 20, metaY + 35)
       .font('Helvetica-Bold')
       .text(inv.invoiceNumber, margin + 120, metaY + 35);

    doc.font('Helvetica')
       .text(`Issue Date:`, margin + 20, metaY + 50)
       .font('Helvetica-Bold')
       .text(new Date(inv.issueDate).toLocaleDateString('en-US', { 
         year: 'numeric', month: 'long', day: 'numeric' 
       }), margin + 120, metaY + 50);

    if (inv.dueDate) {
      doc.font('Helvetica')
         .text(`Due Date:`, margin + 20, metaY + 65)
         .font('Helvetica-Bold')
         .text(new Date(inv.dueDate as any).toLocaleDateString('en-US', { 
           year: 'numeric', month: 'long', day: 'numeric' 
         }), margin + 120, metaY + 65);
    }

    // Status badge
    const statusColor = inv.status === 'paid' ? '#10b981' : 
                       inv.status === 'partial' ? '#f59e0b' : '#ef4444';
    doc.rect(pageWidth - margin - 80, metaY + 15, 70, 25)
       .fill(statusColor)
       .stroke();
    doc.fill('#ffffff')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text(inv.status.toUpperCase(), pageWidth - margin - 75, metaY + 22, { 
         width: 60, align: 'center' 
       });

    doc.y = metaY + 110;

    // Bill To section
    doc.fill(textColor)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('BILL TO', margin, doc.y + 10);

    doc.rect(margin, doc.y + 5, contentWidth / 2 - 10, 80)
       .stroke('#e5e7eb');

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(school?.name || 'School Name Not Available', margin + 15, doc.y + 20);

    doc.fontSize(11)
       .font('Helvetica')
       .text(`School Code: ${school?.code || 'N/A'}`, margin + 15, doc.y + 45);

    doc.text(`Status: ${school?.status || 'ACTIVE'}`, margin + 15, doc.y + 60);

    // Billing period info (right side)
    const rightX = margin + contentWidth / 2 + 10;
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('BILLING PERIOD', rightX, doc.y - 50);

    doc.rect(rightX, doc.y - 45, contentWidth / 2 - 10, 80)
       .stroke('#e5e7eb');

    let periodY = doc.y - 30;
  if (termInfo) {
      doc.fontSize(11)
         .font('Helvetica')
         .text('Term:', rightX + 15, periodY)
         .font('Helvetica-Bold')
     .text(`Term ${termInfo.termNumber}`, rightX + 50, periodY);
      periodY += 20;
    }

  if (calendarInfo) {
      doc.font('Helvetica')
         .text('Academic Year:', rightX + 15, periodY)
     .font('Helvetica-Bold')
     .text(calendarInfo.term || calendarInfo.id, rightX + 90, periodY);
    }

    doc.y += 50;

    // Services/Items table with professional styling
    const tableY = doc.y + 20;
    const tableHeaders = ['Description', 'Rate', 'Quantity', 'Amount'];
    const colWidths = [250, 80, 80, 100];
    const rowHeight = 35;

    // Table header
    doc.rect(margin, tableY, contentWidth, rowHeight)
       .fill(accentColor);

    let currentX = margin;
    doc.fill('#ffffff')
       .fontSize(11)
       .font('Helvetica-Bold');

    tableHeaders.forEach((header, i) => {
      doc.text(header, currentX + 10, tableY + 12, { 
        width: colWidths[i] - 20, 
        align: i === 0 ? 'left' : 'center' 
      });
      currentX += colWidths[i];
    });

    // Table row
    const serviceY = tableY + rowHeight;
    doc.rect(margin, serviceY, contentWidth, rowHeight)
       .fill('#ffffff')
       .stroke('#e5e7eb');

    currentX = margin;
    doc.fill(textColor)
       .fontSize(10)
       .font('Helvetica');

    // Service description
    const description = termInfo ? 
      `Educational Services - Term ${termInfo.termNumber}` : 
      (calendarInfo ? `Educational Services - ${calendarInfo.term}` : 'Educational Services - Academic Period');
    
    doc.text(description, currentX + 10, serviceY + 8, { 
      width: colWidths[0] - 20 
    });
    doc.fontSize(9)
       .fill('#6b7280')
       .text('Student enrollment and educational platform access', currentX + 10, serviceY + 22, { 
         width: colWidths[0] - 20 
       });

    currentX += colWidths[0];

    // Rate
    doc.fill(textColor)
       .fontSize(10)
       .font('Helvetica')
       .text(`${inv.currency} ${parseFloat(inv.ratePerStudent as any).toFixed(2)}`, 
              currentX + 10, serviceY + 12, { 
                width: colWidths[1] - 20, align: 'center' 
              });

    currentX += colWidths[1];

    // Quantity
    doc.text(inv.activeStudentsCount.toString(), currentX + 10, serviceY + 12, { 
      width: colWidths[2] - 20, align: 'center' 
    });

    currentX += colWidths[2];

    // Amount
    doc.font('Helvetica-Bold')
       .text(`${inv.currency} ${parseFloat(inv.subtotal as any).toFixed(2)}`, 
              currentX + 10, serviceY + 12, { 
                width: colWidths[3] - 20, align: 'center' 
              });

    // Totals section
    const totalsY = serviceY + rowHeight + 30;
    const totalsX = pageWidth - margin - 200;

    // Subtotal
    doc.fontSize(11)
       .font('Helvetica')
       .text('Subtotal:', totalsX, totalsY)
       .font('Helvetica-Bold')
       .text(`${inv.currency} ${parseFloat(inv.subtotal as any).toFixed(2)}`, 
              totalsX + 100, totalsY);

    // Discount
    if (parseFloat(inv.discount as any) > 0) {
      doc.font('Helvetica')
         .text('Discount:', totalsX, totalsY + 20)
         .font('Helvetica-Bold')
         .text(`-${inv.currency} ${parseFloat(inv.discount as any).toFixed(2)}`, 
                totalsX + 100, totalsY + 20);
    }

    // Total line
    doc.rect(totalsX, totalsY + 35, 150, 1).fill('#e5e7eb');

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('TOTAL:', totalsX, totalsY + 45)
       .text(`${inv.currency} ${parseFloat(inv.totalAmount as any).toFixed(2)}`, 
              totalsX + 100, totalsY + 45);

    // Amount paid
    if (parseFloat(inv.amountPaid as any) > 0) {
      doc.fontSize(11)
         .font('Helvetica')
         .text('Amount Paid:', totalsX, totalsY + 70)
         .font('Helvetica-Bold')
         .text(`${inv.currency} ${parseFloat(inv.amountPaid as any).toFixed(2)}`, 
                totalsX + 100, totalsY + 70);

      const balance = parseFloat(inv.totalAmount as any) - parseFloat(inv.amountPaid as any);
      doc.text('Balance Due:', totalsX, totalsY + 85)
         .text(`${inv.currency} ${balance.toFixed(2)}`, 
                totalsX + 100, totalsY + 85);
    }

    // Notes section
    if (inv.notes) {
      doc.y = totalsY + 120;
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Notes:', margin, doc.y);
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(inv.notes, margin, doc.y + 20, { 
           width: contentWidth, 
           lineGap: 3 
         });
    }

    // Professional footer
    const footerY = pageHeight - 100;
    doc.rect(0, footerY, pageWidth, 100).fill(lightGray);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fill(textColor)
       .text('Thank you for choosing Schomas!', 0, footerY + 20, { 
         align: 'center', width: pageWidth 
       });

    doc.fontSize(9)
       .font('Helvetica')
       .fill('#6b7280')
       .text('This invoice was generated automatically by Schomas Management System', 
              0, footerY + 40, { align: 'center', width: pageWidth });

    doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    })}`, 0, footerY + 55, { align: 'center', width: pageWidth });

    doc.end();

    const filename = `Invoice-${inv.invoiceNumber}.pdf`;
    return { stream, filename };
  }

  async updateInvoice(id: string, updateData: any, actor: { role: string; schoolId?: string }) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    
    // Check permissions
    if (actor.role !== 'SUPER_ADMIN') {
      if (!actor.schoolId || actor.schoolId !== inv.schoolId) {
        throw new ForbiddenException('Scope mismatch');
      }
    }

    // Update allowed fields
    if (updateData.status !== undefined) {
      inv.status = updateData.status;
    }
    if (updateData.amountPaid !== undefined) {
      inv.amountPaid = updateData.amountPaid.toString();
    }
    if (updateData.notes !== undefined) {
      inv.notes = updateData.notes;
    }

    await this.invoiceRepo.save(inv);
    return inv;
  }

  async deleteInvoice(id: string, actor: { role: string; schoolId?: string }) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (actor.role !== 'SUPER_ADMIN') {
      if (!actor.schoolId || actor.schoolId !== inv.schoolId) {
        throw new ForbiddenException('Scope mismatch');
      }
    }
    await this.invoiceRepo.delete(inv.id);
    return { success: true };
  }
}
