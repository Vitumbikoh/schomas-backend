import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('webhook')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verified = this.whatsappService.verifyWebhookToken(mode, verifyToken);
    if (!verified) {
      throw new HttpException('Webhook verification failed', HttpStatus.FORBIDDEN);
    }

    return res.status(HttpStatus.OK).send(challenge);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(@Body() payload: unknown) {
    try {
      this.whatsappService.enqueueWebhookPayload(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed processing WhatsApp webhook payload: ${message}`);
      // Always ACK webhook to avoid repeated retries from Meta while we inspect logs.
    }

    return { success: true };
  }
}
