import { Controller, Get, Param, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { FinanceService } from './finance.service';
import PDFDocument = require('pdfkit');

@Controller('receipts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.FINANCE, Role.ADMIN)
export class ReceiptController {
  constructor(private readonly financeService: FinanceService) {}

  @Get(':id')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="receipt.pdf"')
  async generateReceipt(@Param('id') id: string, @Res() res: Response) {
    try {
      const payment = await this.financeService.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({
          statusCode: 404,
          message: 'Payment not found',
        });
      }

      // Validate amount
      const amount = Number(payment.amount);
      if (isNaN(amount)) {
        throw new Error('Invalid amount format');
      }

      // Extract school information dynamically - no hardcoded fallbacks
      const schoolName = payment.school?.name || 'School Management System';
      const schoolMotto = payment.school?.metadata?.motto || '';
      const schoolEmail = payment.school?.metadata?.email || '';
      const schoolPhone = payment.school?.metadata?.phone || '';
      const schoolWebsite = payment.school?.metadata?.website || '';
      const schoolAddress = payment.school?.metadata?.address || '';
      
      // Student information
      const studentFullName = `${payment.student?.firstName || ''} ${payment.student?.lastName || ''}`.trim() || 'Unknown Student';
      const humanStudentId = payment.student?.studentId || 'N/A';
      
      // Term and Academic Calendar info - fixed to show "Term" instead of "Period"
      const termNumber = payment.term?.termNumber || 1;
      const termName = `Term ${termNumber}`;
      const academicYear = payment.term?.academicCalendar?.term || new Date().getFullYear().toString();
      
      // Payment method formatting
      const paymentMethod = payment.paymentMethod?.toUpperCase() || 'CASH';
      const paymentType = payment.paymentType?.replace('_', ' ').toUpperCase() || 'TUITION FEE';
      const paymentStatus = (payment.status || 'COMPLETED').toUpperCase();
      
      // Receipt number formatting
      const receiptNumber = payment.receiptNumber || `REC-${id.slice(-8).toUpperCase()}`;
      
      // Payment date formatting
      const paymentDate = payment.paymentDate || new Date();
      const formattedDate = paymentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const formattedTime = paymentDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      // Create PDF document with professional layout optimized for one page
      const doc = new PDFDocument({ 
        margin: 30,
        size: 'A4'
      });
      
      // Pipe directly to response - no caching
      doc.pipe(res);

      // Add watermark first (behind all content)
      doc.fontSize(60)
         .font('Helvetica-Bold')
         .fillColor('#fafafa')
         .text(schoolName.split(' ')[0] || 'RECEIPT', 0, 350, {
           align: 'center',
           width: doc.page.width,
           angle: -45
         });

      // Clean Header with system consistency
      const headerHeight = 80;
      
      // Simple header border
      doc.rect(40, 40, doc.page.width - 80, headerHeight)
         .stroke('#e0e0e0');
      
      // School logo area (simple circle)
      doc.circle(70, 75, 15)
         .fillAndStroke('#6b7280', '#4b5563');
      
      // School initials
      const initials = schoolName.split(' ').map(word => word[0]).join('').substring(0, 2);
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('white')
         .text(initials, initials.length === 1 ? 67 : 64, 71);
      
      // School name
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#374151')
         .text(schoolName, 100, 55);
      
      // School information section below school name
      let infoY = 75;
      
      // School motto/about (only if exists)
      if (schoolMotto) {
        doc.fontSize(9)
           .font('Helvetica-Oblique')
           .fillColor('#6b7280')
           .text(schoolMotto, 100, infoY);
        infoY += 12;
      }
      
      // Email (if exists)
      if (schoolEmail) {
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#9ca3af')
           .text(`Email: ${schoolEmail}`, 100, infoY);
        infoY += 10;
      }
      
      // Phone (if exists)
      if (schoolPhone) {
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#9ca3af')
           .text(`Phone: ${schoolPhone}`, 100, infoY);
        infoY += 10;
      }
      
      // Website (if exists)
      if (schoolWebsite) {
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#9ca3af')
           .text(`Website: ${schoolWebsite}`, 100, infoY);
        infoY += 10;
      }
      
      // Address (if exists)
      if (schoolAddress) {
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#9ca3af')
           .text(`Address: ${schoolAddress}`, 100, infoY);
        infoY += 10;
      }
      
      // Receipt number in top right (properly positioned)
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#374151')
         .text('Receipt No:', doc.page.width - 150, 50);
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#1f2937')
         .text(receiptNumber, doc.page.width - 150, 62);
      
      // Date
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#6b7280')
         .text(formattedDate, doc.page.width - 150, 76);
      
         // Academic calendar info (properly visible)
         doc.fontSize(8)
             .font('Helvetica-Bold')
             .fillColor('#374151')
             .text(`Academic Year: ${academicYear}`, doc.page.width - 150, 95);
      
         doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#6b7280')
             .text(termName, doc.page.width - 150, 107);

         // Determine For Term label from allocations (if any)
         let forTermLabel = '-';
         try {
            if (Array.isArray((payment as any).allocations) && (payment as any).allocations.length > 0) {
               const allocs = (payment as any).allocations;
               // If any allocation is a credit balance, treat as 'Credit'
               const hasCredit = allocs.some((a: any) => String(a.feeType).toLowerCase().includes('credit'));
               if (hasCredit && allocs.length === 1) {
                  forTermLabel = 'Credit';
               } else {
                  // Map allocation terms to readable labels, dedupe
                  const labels = allocs.map((a: any) => {
                     const tn = a.term?.termNumber || a.termNumber || a.termId ? `Term ${a.term?.termNumber || a.termNumber}` : null;
                     const ay = a.term?.academicCalendar?.term || a.forAcademicYear || a.term?.academicCalendar || '';
                     return tn ? `${tn} - ${ay}` : null;
                  }).filter((l: any) => !!l);
                  const unique = Array.from(new Set(labels));
                  if (unique.length > 0) forTermLabel = unique.join(', ');
               }
            } else if ((payment as any).paymentType && String((payment as any).paymentType).toLowerCase().includes('credit')) {
               forTermLabel = 'Credit';
            }
         } catch (e) {
            // ignore and fallback to '-'
         }

      // Clean Title Section
      const titleY = 140;
      
      // Simple title background
      doc.rect(40, titleY, doc.page.width - 80, 30)
         .fillAndStroke('#f9fafb', '#e5e7eb');
      
      // Title with system-consistent styling
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#374151')
         .text('PAYMENT RECEIPT', 40, titleY + 8, { 
           align: 'center',
           width: doc.page.width - 80
         });

      // Clean content area
      const contentY = titleY + 45;
      
      // Simple content border
      doc.rect(40, contentY, doc.page.width - 80, 400)
         .stroke('#e5e7eb');

      // Receipt details with clean formatting
      const leftColumn = 60;
      const rightColumn = 300;
      const lineHeight = 18;
      let currentY = contentY + 20;

      // Clean row styling function
      const addRow = (label: string, value: string, isBold = false) => {
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#374151')
           .text(label, leftColumn, currentY);
        
        doc.fontSize(10)
           .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(isBold ? '#1f2937' : '#4b5563')
           .text(value, rightColumn, currentY);
        
        // Simple separator line
        doc.strokeColor('#f3f4f6')
           .moveTo(leftColumn, currentY + 15)
           .lineTo(doc.page.width - 60, currentY + 15)
           .stroke();
        
        currentY += lineHeight;
      };

      // Clean section headers
      const addSectionHeader = (title: string) => {
        doc.rect(leftColumn - 10, currentY - 2, doc.page.width - 100, 20)
           .fillAndStroke('#f8f9fa', '#dee2e6');
        
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#495057')
           .text(title, leftColumn, currentY + 3);
        
        currentY += 25;
      };

      // STUDENT & TRANSACTION DETAILS
      addSectionHeader('STUDENT & TRANSACTION DETAILS');
      
      addRow('Student Name:', studentFullName, true);
      addRow('Student ID:', humanStudentId);
      addRow('Transaction Date:', paymentDate.toISOString().slice(0,10).replace(/-/g,'/'));
      addRow('Transaction Time:', formattedTime);
      
      currentY += 10;

      // ACADEMIC INFORMATION
      addSectionHeader('ACADEMIC INFORMATION');
      
      addRow('Academic Year:', academicYear);
      addRow('Academic Term:', termName);
      addRow('For Term:', forTermLabel);
      addRow('Fee Category:', paymentType, true);
      addRow('Payment Method:', paymentMethod);
      addRow('Payment Status:', paymentStatus, true);

      currentY += 10;

      // Clean amount section
      const amountBoxY = currentY;
      
      // Simple amount box
      doc.rect(leftColumn - 10, amountBoxY - 5, doc.page.width - 100, 40)
         .fillAndStroke('#f8f9fa', '#6c757d');
      
      // Amount label
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#495057')
         .text('TOTAL AMOUNT PAID', leftColumn, amountBoxY + 8);
      
      // Amount display with currency
      const currency = 'MK'; // Malawi Kwacha
      const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
      
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#212529')
         .text(`${currency} ${formattedAmount}`, rightColumn, amountBoxY + 8);

      currentY += 55;

      // Clean verification section
      const authBy = payment.processedBy?.user?.username || payment.processedByAdmin?.username || 'System Administrator';
      const processedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const processedTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      // Simple verification box
      doc.rect(leftColumn - 10, currentY - 5, doc.page.width - 100, 50)
         .fillAndStroke('#f8f9fa', '#dee2e6');
      
      // Security header
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#495057')
         .text('VERIFICATION & AUTHORIZATION', leftColumn, currentY + 5);
      
      // Verification details
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#6c757d')
         .text('Authorized by:', leftColumn, currentY + 20);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#495057')
         .text(authBy, leftColumn + 65, currentY + 20);
      
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#6c757d')
         .text('Transaction ID:', leftColumn, currentY + 30);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#495057')
         .text(id.slice(0, 8).toUpperCase(), leftColumn + 65, currentY + 30);
      
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#6c757d')
         .text('Processed:', rightColumn - 60, currentY + 20);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#495057')
         .text(`${processedDate} ${processedTime}`, rightColumn - 10, currentY + 20);

      currentY += 75;

      // Clean footer section
      const footerY = currentY;
      
      // Elegant footer separator with gradient effect
      doc.strokeColor('#1976d2')
         .lineWidth(2)
         .moveTo(25, footerY)
         .lineTo(doc.page.width - 25, footerY)
         .stroke()
         .lineWidth(1);
      
      // Important notice
      doc.rect(40, footerY + 10, doc.page.width - 80, 20)
         .fillAndStroke('#f8f9fa', '#6c757d');
      
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#495057')
         .text('IMPORTANT: This receipt serves as official proof of payment. Please retain for your records.', 
               45, footerY + 18, { 
                 align: 'center',
                 width: doc.page.width - 90 
               });

      // Thank you message
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#6c757d')
         .text('Thank you for your payment!', 40, footerY + 40, {
           align: 'center',
           width: doc.page.width - 80 
         });



      doc.end();

    } catch (error) {
      console.error('Receipt generation error:', error);

      if (!res.headersSent) {
        return res.status(500).json({
          statusCode: 500,
          message: 'Error generating receipt',
          error: error.message,
        });
      }
    }
  }
}