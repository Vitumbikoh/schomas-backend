import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import { Roles } from '../user/decorators/roles.decorator';
import { WhatsAppService } from './whatsapp.service';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { SendAnnouncementDto } from './dto/send-announcement.dto';
import { EventNotificationDto } from './dto/event-notification.dto';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  getStatus() {
    return {
      success: true,
      data: this.whatsappService.getStatus(),
    };
  }

  @Post('send')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  async sendMessage(@Body() payload: SendWhatsAppMessageDto) {
    const response = await this.whatsappService.sendWhatsAppMessage(payload.phone, payload.message);

    return {
      success: true,
      data: response,
    };
  }

  @Post('announce')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async sendAnnouncement(@Request() req, @Body() payload: SendAnnouncementDto) {
    const targetSchoolId = req.user?.role === Role.SUPER_ADMIN ? payload.schoolId : req.user?.schoolId;

    const report = await this.whatsappService.sendAnnouncement(
      payload.message,
      targetSchoolId,
      payload.targetRoles,
    );

    return {
      success: true,
      data: report,
    };
  }

  @Post('notify/results-published')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async sendResultsPublished(@Body() payload: EventNotificationDto) {
    const response = await this.whatsappService.sendResultsPublishedNotification(payload.phone, payload.studentName);

    return { success: true, data: response };
  }

  @Post('notify/fee-reminder')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  async sendFeeReminder(@Body() payload: EventNotificationDto) {
    const response = await this.whatsappService.sendFeeReminderNotification(payload.phone, payload.studentName, payload.customMessage);

    return { success: true, data: response };
  }

  @Post('notify/attendance-alert')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  async sendAttendanceAlert(@Body() payload: EventNotificationDto) {
    const response = await this.whatsappService.sendAttendanceAlertNotification(payload.phone, payload.studentName, payload.customMessage);

    return { success: true, data: response };
  }
}
