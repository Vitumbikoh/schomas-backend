import { Controller, Get, Param, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { FinanceService } from './finance.service';
import * as PDFDocument from 'pdfkit';

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

      // Extract additional information with better formatting
      const schoolName = payment.school?.name || 'School Management System';
      const schoolAbout = payment.school?.metadata?.about || payment.school?.metadata?.description || 'Excellence in Education • Nurturing Future Leaders';
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
      
      // Create PDF document with professional layout
      const doc = new PDFDocument({ 
        margin: 40,
        size: 'A4'
      });
      
      // Pipe directly to response - no caching
      doc.pipe(res);

      // Professional Header with border
      const headerHeight = 100;
      doc.rect(40, 40, doc.page.width - 80, headerHeight)
         .fillAndStroke('#f8f9fa', '#ddd');
      
      // School logo area (placeholder circle)
      doc.circle(70, 80, 20)
         .fillAndStroke('#007bff', '#005bb5');
      
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(schoolName, 110, 65);
      
      doc.fontSize(10)
         .font('Helvetica-Oblique')
         .fillColor('#6c757d')
         .text(schoolAbout, 110, 90);
      
      // Academic info bar
      doc.rect(40, 150, doc.page.width - 80, 25)
         .fillAndStroke('#e9ecef', '#dee2e6');
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#495057')
         .text(`Academic Year: ${academicYear}`, 60, 160);
      doc.text(`${termName}`, doc.page.width - 180, 160);

      // Receipt Title Section
      doc.moveDown(3);
      const titleY = 200;
      
      // Title background
      doc.rect(40, titleY, doc.page.width - 80, 40)
         .fillAndStroke('#007bff', '#0056b3');
      
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('white')
         .text('PAYMENT RECEIPT', 40, titleY + 12, { 
           align: 'center',
           width: doc.page.width - 80
         });

      // Main content area
      const contentY = titleY + 60;
      doc.rect(40, contentY, doc.page.width - 80, 320)
         .stroke('#dee2e6');

      // Receipt details with professional formatting
      const leftColumn = 70;
      const rightColumn = 320;
      const lineHeight = 28; // Increased from 22 for better readability
      let currentY = contentY + 30;

      // Helper function for labeled rows with better readability
      const addRow = (label: string, value: string, isBold = false) => {
        doc.fontSize(12) // Increased from 11 for better readability
           .font('Helvetica-Bold')
           .fillColor('#495057')
           .text(label, leftColumn, currentY);
        
        doc.fontSize(12) // Increased from 11 for better readability
           .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(isBold ? '#2c3e50' : '#495057')
           .text(value, rightColumn, currentY);
        
        // Add subtle separator line
        if (!isBold) {
          doc.strokeColor('#f1f3f4')
             .moveTo(leftColumn, currentY + 22)
             .lineTo(doc.page.width - 70, currentY + 22)
             .stroke();
        }
        
        currentY += lineHeight;
      };

      // Receipt Information Section
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text('RECEIPT DETAILS', leftColumn, currentY);
      currentY += 25;

      addRow('Receipt Number:', receiptNumber);
      addRow('Issue Date:', formattedDate);
      addRow('Issue Time:', formattedTime);
      
      currentY += 20; // Increased spacing between sections

      // Student Information Section
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text('STUDENT INFORMATION', leftColumn, currentY);
      currentY += 30; // Increased spacing

      addRow('Student Name:', studentFullName, true);
      addRow('Student ID:', humanStudentId);
      addRow('Academic Year:', academicYear);
      addRow('Term:', termName);

      currentY += 20; // Increased spacing between sections

      // Payment Information Section
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text('PAYMENT INFORMATION', leftColumn, currentY);
      currentY += 30; // Increased spacing

      addRow('Payment Type:', paymentType);
      addRow('Payment Method:', paymentMethod);
      addRow('Transaction Status:', paymentStatus, true);

      // Amount section with prominent styling
      currentY += 20;
      const amountBoxY = currentY;
      doc.rect(leftColumn - 15, amountBoxY - 10, doc.page.width - 110, 50)
         .fillAndStroke('#28a745', '#1e7e34');
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('white')
         .text('TOTAL AMOUNT PAID', leftColumn, amountBoxY + 5);
      
      doc.fontSize(18)
         .text(`$${amount.toFixed(2)}`, rightColumn, amountBoxY + 5);

      // Authorization section
      currentY += 80;
      const authBy = payment.processedBy?.user?.username || payment.processedByAdmin?.username || 'System Administrator';
      const processedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const processedTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#6c757d')
         .text(`Authorized by: ${authBy}`, leftColumn, currentY);
      
      doc.text(`Processing Date: ${processedDate}`, leftColumn, currentY + 15);
      doc.text(`Processing Time: ${processedTime}`, leftColumn, currentY + 30);

      // Professional Footer
      const footerY = doc.page.height - 120;
      
      // Footer separator
      doc.strokeColor('#dee2e6')
         .moveTo(40, footerY)
         .lineTo(doc.page.width - 40, footerY)
         .stroke();
      
      // Important notice
      doc.rect(40, footerY + 10, doc.page.width - 80, 30)
         .fillAndStroke('#fff3cd', '#ffeaa7');
      
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#856404')
         .text('IMPORTANT: This receipt serves as official proof of payment. Please retain for your records.', 
               50, footerY + 22, { 
                 align: 'center',
                 width: doc.page.width - 100 
               });

      // Thank you message
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#007bff')
         .text('Thank you for choosing our institution!', 40, footerY + 55, { 
           align: 'center',
           width: doc.page.width - 80 
         });

      // Watermark-style school name
      doc.fontSize(60)
         .font('Helvetica-Bold')
         .fillColor('#f8f9fa')
         .text(schoolName, 0, 300, {
           align: 'center',
           width: doc.page.width,
           angle: -45
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