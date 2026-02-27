import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.STUDENT,
    Role.TEACHER,
    Role.PARENT,
    Role.FINANCE,
  )
  async getAllNotifications(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    
    // Filter by school for ADMINs, show all for SUPER_ADMIN
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.schoolId;
    const userRole = req.user?.role;
    const userId = req.user?.sub || req.user?.id;
    
    console.log('🔔 NotificationController.getAllNotifications - User:', req.user?.id, 'Role:', userRole, 'SchoolId:', schoolId);
    
    const { notifications, total } = await this.notificationService.findAll(
      pageNum,
      limitNum,
      schoolId,
      userRole,
      userId,
    );
    
    return {
      success: true,
      notifications,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };
  }

  @Get('stats')
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.STUDENT,
    Role.TEACHER,
    Role.PARENT,
    Role.FINANCE,
  )
  async getNotificationStats(@Request() req) {
    // Filter by school for ADMINs, show all for SUPER_ADMIN
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.schoolId;
    const userRole = req.user?.role;
    const userId = req.user?.sub || req.user?.id;
    
    console.log('🔔 NotificationController.getNotificationStats - User:', req.user?.id, 'Role:', userRole, 'SchoolId:', schoolId);
    
    const { notifications, total } = await this.notificationService.findAll(
      1,
      1000,
      schoolId,
      userRole,
      userId,
    ); // Get all for stats
    const unreadCount = await this.notificationService.getUnreadCount(
      userId,
      schoolId,
      userRole,
    );
    
    return {
      success: true,
      stats: {
        total,
        unread: unreadCount,
        read: total - unreadCount,
        byType: {
          credentials: notifications.filter(n => n.type === 'credentials').length,
          system: notifications.filter(n => n.type === 'system').length,
          alert: notifications.filter(n => n.type === 'alert').length,
        },
      },
    };
  }

  @Patch(':id/read')
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.STUDENT,
    Role.TEACHER,
    Role.PARENT,
    Role.FINANCE,
  )
  async markAsRead(@Param('id') id: string, @Request() req) {
    try {
      const schoolId = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.schoolId;
      const userRole = req.user?.role;
      const userId = req.user?.sub || req.user?.id;
      
      console.log('🔔 NotificationController.markAsRead - User:', req.user?.id, 'Role:', userRole, 'SchoolId:', schoolId, 'NotificationId:', id);
      
      const notification = await this.notificationService.markAsRead(
        id,
        userId,
        schoolId,
        userRole,
      );
      return {
        success: true,
        notification,
        message: 'Notification marked as read',
      };
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Patch('read-all')
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.STUDENT,
    Role.TEACHER,
    Role.PARENT,
    Role.FINANCE,
  )
  async markAllAsRead(@Request() req) {
    try {
      // Filter by school for ADMINs, mark all for SUPER_ADMIN
      const schoolId = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.schoolId;
      const userRole = req.user?.role;
      const userId = req.user?.sub || req.user?.id;
      
      console.log('🔔 NotificationController.markAllAsRead - User:', req.user?.id, 'Role:', userRole, 'SchoolId:', schoolId);
      
      await this.notificationService.markAllAsRead(userId, schoolId, userRole);
      return {
        success: true,
        message: 'All notifications marked as read',
      };
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}