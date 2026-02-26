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

  /** Roles that have a restricted (audience-scoped) view of notifications. */
  private readonly roleScopedRoles = ['STUDENT', 'TEACHER', 'PARENT', 'FINANCE'];

  async findAll(page: number = 1, limit: number = 10, schoolId?: string, userRole?: string): Promise<{ notifications: Notification[]; total: number }> {
    console.log('🔔 NotificationService.findAll - userRole:', userRole, 'schoolId:', schoolId);

    // Non-admin roles must have a schoolId
    if (userRole !== 'SUPER_ADMIN' && !schoolId) {
      return { notifications: [], total: 0 };
    }

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.school', 'school')
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) qb.where('n.schoolId = :schoolId', { schoolId });
    } else {
      qb.where('n.schoolId = :schoolId', { schoolId });
    }

    // Students, teachers, parents, and finance users only see notifications
    // explicitly addressed to their role via the targetRoles array.
    if (userRole && this.roleScopedRoles.includes(userRole)) {
      qb.andWhere(`n."targetRoles" @> :roles::jsonb`, {
        roles: JSON.stringify([userRole]),
      });
    }

    const [notifications, total] = await qb.getManyAndCount();
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
    if (userRole !== 'SUPER_ADMIN' && !schoolId) return;

    // For role-scoped users, only mark notifications targeted at their role
    if (userRole && this.roleScopedRoles.includes(userRole)) {
      await this.notificationRepository
        .createQueryBuilder()
        .update()
        .set({ read: true, readAt: new Date() })
        .where('read = :read', { read: false })
        .andWhere(schoolId ? '"schoolId" = :schoolId' : '1=1', { schoolId })
        .andWhere(`"targetRoles" @> :roles::jsonb`, {
          roles: JSON.stringify([userRole]),
        })
        .execute();
      return;
    }

    const whereCondition: any = { read: false };
    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) whereCondition.schoolId = schoolId;
    } else {
      whereCondition.schoolId = schoolId;
    }

    console.log('🔔 NotificationService.markAllAsRead - whereCondition:', whereCondition, 'userRole:', userRole);
    await this.notificationRepository.update(whereCondition, { read: true, readAt: new Date() });
  }

  async getUnreadCount(schoolId?: string, userRole?: string): Promise<number> {
    if (userRole !== 'SUPER_ADMIN' && !schoolId) return 0;

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.read = :read', { read: false });

    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) qb.andWhere('n.schoolId = :schoolId', { schoolId });
    } else {
      qb.andWhere('n.schoolId = :schoolId', { schoolId });
    }

    if (userRole && this.roleScopedRoles.includes(userRole)) {
      qb.andWhere(`n."targetRoles" @> :roles::jsonb`, {
        roles: JSON.stringify([userRole]),
      });
    }

    return qb.getCount();
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