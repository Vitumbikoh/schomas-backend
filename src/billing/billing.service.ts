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

  private async countActiveStudentsForTerm(termId: string) {
    // Count enrollments for the given term with active status.
    // We avoid filtering by schoolId because some historical enrollments may have null schoolId;
    // termId is sufficient to scope to a school via Term->School relation.
    const count = await this.enrollmentRepo.count({ where: { termId, status: 'active' as any } });
    return count;
  }

  private async countActiveStudentsForAcademicCalendar(academicCalendarId: string, schoolId: string) {
    const terms = await this.termRepo.find({ where: { schoolId, academicCalendar: { id: academicCalendarId } as any } });
    if (!terms.length) return 0;
    const termIds = terms.map(t => t.id);
    const qb = this.enrollmentRepo.createQueryBuilder('en')
      .where('en.status = :status', { status: 'active' })
      .andWhere('en.termId IN (:...termIds)', { termIds });
    const total = await qb.getCount();
    // Unique students across terms: approximate by counting distinct studentId
    const distinct = await this.enrollmentRepo.createQueryBuilder('en')
      .select('COUNT(DISTINCT en.studentId)', 'cnt')
      .where('en.status = :status', { status: 'active' })
      .andWhere('en.termId IN (:...termIds)', { termIds })
      .getRawOne();
    return Number(distinct?.cnt || total || 0);
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
      activeStudents = await this.countActiveStudentsForTerm(term.id);
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
    return this.invoiceRepo.save(invoice);
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
    if (newPaid >= Number(invoice.totalAmount)) status = 'paid';
    await this.invoiceRepo.update(invoice.id, { amountPaid: newPaid, status });
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
    return this.calendarRepo.find({ where: { schoolId }, order: { createdAt: 'DESC' } });
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
