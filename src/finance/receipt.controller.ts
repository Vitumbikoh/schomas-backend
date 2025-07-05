import { Controller, Get, Param, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { FinanceService } from './finance.service';
import * as PDFDocument from 'pdfkit';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

@Controller('receipts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.FINANCE, Role.ADMIN)
export class ReceiptController {
  constructor(private readonly financeService: FinanceService) {}

  @Get(':id')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="receipt.pdf"')
  async generateReceipt(@Param('id') id: string, @Res() res: Response) {
    const tempFilePath = join(__dirname, '..', '..', 'temp', `receipt_${id}.pdf`);
    
    try {
      // Check if cached PDF exists
      if (existsSync(tempFilePath)) {
        const fileStream = createReadStream(tempFilePath);
        fileStream.pipe(res);
        return;
      }

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

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      
      // Pipe to both response and temp file
      const fileStream = require('fs').createWriteStream(tempFilePath);
      doc.pipe(fileStream);
      doc.pipe(res);

      // PDF Content
      doc.fontSize(20)
         .text('PAYMENT RECEIPT', { align: 'center' })
         .moveDown(0.5);
      
      doc.fontSize(12)
         .text(`Receipt #: ${payment.receiptNumber || id}`, { continued: true })
         .text(`Date: ${(payment.paymentDate || new Date()).toLocaleDateString()}`, { align: 'right' })
         .moveDown();
      
      doc.text(`Student: ${payment.student?.firstName || ''} ${payment.student?.lastName || ''}`.trim() || 'N/A')
         .moveDown();
      
      doc.text(`Amount: $${amount.toFixed(2)}`)
         .moveDown();
      
      doc.text(`Payment Type: ${payment.paymentType}`)
         .moveDown();
      
      doc.text(`Payment Method: ${payment.paymentMethod}`)
         .moveDown();
      
      doc.text(`Status: ${payment.status?.toUpperCase() || 'COMPLETED'}`)
         .moveDown(2);
      
      doc.text(`Processed By: ${payment.processedBy?.user?.username || payment.processedByAdmin?.username || 'System'}`)
         .moveDown();
      
      doc.text('Thank you for your payment!', { align: 'center' });

      doc.end();

      // Clean up temp file after 1 hour
      setTimeout(() => {
        if (existsSync(tempFilePath)) {
          unlinkSync(tempFilePath);
        }
      }, 3600000);

    } catch (error) {
      console.error('Receipt generation error:', error);
      
      // Clean up temp file if error occurred
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }

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