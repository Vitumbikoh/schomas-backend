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

  async findAll(page: number = 1, limit: number = 10, schoolId?: string): Promise<{ notifications: Notification[]; total: number }> {
    const whereCondition = schoolId ? { schoolId } : {};
    
    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: whereCondition,
      relations: ['school'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { notifications, total };
  }

  async findById(id: string): Promise<Notification> {
    return this.notificationRepository.findOne({
      where: { id },
      relations: ['school'],
    });
  }

  async markAsRead(id: string): Promise<Notification> {
    const notification = await this.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.read = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(schoolId?: string): Promise<void> {
    const whereCondition = schoolId ? { read: false, schoolId } : { read: false };
    await this.notificationRepository.update(
      whereCondition,
      { read: true, readAt: new Date() }
    );
  }

  async getUnreadCount(schoolId?: string): Promise<number> {
    const whereCondition = schoolId ? { read: false, schoolId } : { read: false };
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