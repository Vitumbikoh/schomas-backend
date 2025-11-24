import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType, NotificationPriority } from './entities/notification.entity';

export interface CreateNotificationDto {
  title: string;
  message?: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  schoolId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    console.log('🔔 NotificationService.create called with:', createNotificationDto);
    try {
      const notification = this.notificationRepository.create(createNotificationDto);
      const savedNotification = await this.notificationRepository.save(notification);
      console.log('✅ Notification saved successfully:', savedNotification.id);
      return savedNotification;
    } catch (error) {
      console.error('❌ Error saving notification:', error);
      throw error;
    }
  }

  async findAll(page: number = 1, limit: number = 10, schoolId?: string, userRole?: string): Promise<{ notifications: Notification[]; total: number }> {
    let whereCondition: any = {};
    
    if (userRole === 'SUPER_ADMIN') {
      // Super admin can see all notifications, optionally filtered by schoolId
      if (schoolId) {
        whereCondition = { schoolId };
      }
      // If no schoolId provided, show all notifications (no filter)
    } else {
      // Regular admin users can only see their school's notifications
      if (!schoolId) {
        // If no schoolId, return empty results for security
        return { notifications: [], total: 0 };
      }
      whereCondition = { schoolId };
    }
    
    console.log('🔔 NotificationService.findAll - whereCondition:', whereCondition, 'userRole:', userRole, 'schoolId:', schoolId);
    
    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: whereCondition,
      relations: ['school'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { notifications, total };
  }

  async findById(id: string, schoolId?: string, userRole?: string): Promise<Notification> {
    let whereCondition: any = { id };
    
    if (userRole === 'SUPER_ADMIN') {
      // Super admin can access any notification
      whereCondition = { id };
    } else {
      // Regular admin users can only access their school's notifications
      if (!schoolId) {
        return null; // No access if no schoolId provided
      }
      whereCondition = { id, schoolId };
    }
    
    console.log('🔔 NotificationService.findById - whereCondition:', whereCondition, 'userRole:', userRole);
    
    return this.notificationRepository.findOne({
      where: whereCondition,
      relations: ['school'],
    });
  }

  async markAsRead(id: string, schoolId?: string, userRole?: string): Promise<Notification> {
    const notification = await this.findById(id, schoolId, userRole);
    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    notification.read = true;
    notification.readAt = new Date();
    console.log('🔔 NotificationService.markAsRead - marking notification as read:', id, 'by user role:', userRole);
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(schoolId?: string, userRole?: string): Promise<void> {
    let whereCondition: any = { read: false };
    
    if (userRole === 'SUPER_ADMIN') {
      // Super admin can mark all notifications as read, optionally filtered by schoolId
      if (schoolId) {
        whereCondition = { read: false, schoolId };
      }
      // If no schoolId provided, mark all unread notifications
    } else {
      // Regular admin users can only mark their school's notifications as read
      if (!schoolId) {
        console.log('🔔 NotificationService.markAllAsRead - No schoolId provided for non-super-admin user, no action taken');
        return; // No action if no schoolId provided
      }
      whereCondition = { read: false, schoolId };
    }
    
    console.log('🔔 NotificationService.markAllAsRead - whereCondition:', whereCondition, 'userRole:', userRole);
    
    await this.notificationRepository.update(
      whereCondition,
      { read: true, readAt: new Date() }
    );
  }

  async getUnreadCount(schoolId?: string, userRole?: string): Promise<number> {
    let whereCondition: any = { read: false };
    
    if (userRole === 'SUPER_ADMIN') {
      // Super admin can see count of all unread notifications, optionally filtered by schoolId
      if (schoolId) {
        whereCondition = { read: false, schoolId };
      }
      // If no schoolId provided, count all unread notifications
    } else {
      // Regular admin users can only see count of their school's unread notifications
      if (!schoolId) {
        return 0; // No notifications if no schoolId provided
      }
      whereCondition = { read: false, schoolId };
    }
    
    return this.notificationRepository.count({ where: whereCondition });
  }

  // Helper method to create credential notifications when new school credentials are generated
  async createCredentialNotification(schoolId: string, schoolName: string, schoolCode: string, credentials: any): Promise<Notification> {
    return this.create({
      title: `New credentials for ${schoolName}`,
      message: `School credentials have been generated for ${schoolName} (${schoolCode})`,
      type: NotificationType.CREDENTIALS,
      priority: NotificationPriority.MEDIUM,
      schoolId,
      metadata: {
        credentials,
        schoolName,
        schoolCode,
      },
    });
  }
}