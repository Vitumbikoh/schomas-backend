import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('inbox')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STUDENT, Role.TEACHER, Role.PARENT, Role.FINANCE)
  async inbox(@Request() req, @Query('search') search?: string) {
    const result = await this.messagesService.getInbox(req.user, search);
    return {
      success: true,
      messages: result.messages,
      unreadCount: result.unreadCount,
    };
  }

  @Get('sent')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STUDENT, Role.TEACHER, Role.PARENT, Role.FINANCE)
  async sent(@Request() req, @Query('search') search?: string) {
    const messages = await this.messagesService.getSent(req.user, search);
    return { success: true, messages };
  }

  @Get('recipients')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STUDENT, Role.TEACHER, Role.PARENT, Role.FINANCE)
  async recipients(@Request() req, @Query('search') search?: string) {
    const recipients = await this.messagesService.searchRecipients(req.user, search);
    return { success: true, recipients };
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STUDENT, Role.TEACHER, Role.PARENT, Role.FINANCE)
  async send(@Request() req, @Body() payload: SendMessageDto) {
    const message = await this.messagesService.send(req.user, payload);
    return {
      success: true,
      message,
      info: 'Message sent successfully',
    };
  }

  @Patch(':id/read')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STUDENT, Role.TEACHER, Role.PARENT, Role.FINANCE)
  async markAsRead(@Request() req, @Param('id') id: string) {
    const message = await this.messagesService.markAsRead(req.user, id);
    return {
      success: true,
      message,
      info: 'Message marked as read',
    };
  }
}
