import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Notification, NotificationType, NotificationPriority } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';

export interface CreateNotificationDto {
  title: string;
  message?: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  schoolId?: string;
  targetRoles?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private notificationReadRepository: Repository<NotificationRead>,
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

  async createForRoles(
    roles: string[],
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    return this.create({
      ...createNotificationDto,
      targetRoles: roles,
    });
  }

  /** Roles that have a restricted (audience-scoped) view of notifications. */
  private readonly roleScopedRoles = ['STUDENT', 'TEACHER', 'PARENT', 'FINANCE'];
  private readonly adminRole = 'ADMIN';
  private readonly superAdminRole = 'SUPER_ADMIN';

  private applyRoleAudienceFilter(
    qb: SelectQueryBuilder<Notification>,
    userRole?: string,
  ): void {
    const normalizedRole = userRole?.toUpperCase();
    if (!normalizedRole || normalizedRole === this.superAdminRole) {
      return;
    }

    // Admins see admin notices plus legacy notices with no explicit targets.
    if (normalizedRole === this.adminRole) {
      qb.andWhere(
        `(n."targetRoles" IS NULL OR n."targetRoles" @> :adminRole::jsonb)`,
        {
          adminRole: JSON.stringify([this.adminRole]),
        },
      );
      return;
    }

    // Role-scoped users only see notifications explicitly targeted to their role.
    if (this.roleScopedRoles.includes(normalizedRole)) {
      qb.andWhere(`n."targetRoles" @> :role::jsonb`, {
        role: JSON.stringify([normalizedRole]),
      });
      return;
    }

    // Unknown/custom roles default to explicit targeting only.
    qb.andWhere(`n."targetRoles" @> :role::jsonb`, {
      role: JSON.stringify([normalizedRole]),
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    schoolId?: string,
    userRole?: string,
    userId?: string,
  ): Promise<{ notifications: Notification[]; total: number }> {
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

    this.applyRoleAudienceFilter(qb, userRole);

    const [notifications, total] = await qb.getManyAndCount();

    if (!notifications.length || !userId) {
      return { notifications, total };
    }

    const reads = await this.notificationReadRepository.find({
      where: {
        userId,
        notificationId: In(notifications.map((n) => n.id)),
      },
    });
    const readByNotification = new Map(
      reads.map((r) => [r.notificationId, r.readAt]),
    );

    const hydrated = notifications.map((n) => {
      const readAt = readByNotification.get(n.id);
      return {
        ...n,
        read: !!readAt,
        readAt: readAt ?? null,
      } as Notification;
    });

    return { notifications: hydrated, total };
  }

  async findById(
    id: string,
    schoolId?: string,
    userRole?: string,
    userId?: string,
  ): Promise<Notification> {
    if (userRole !== 'SUPER_ADMIN' && !schoolId) {
      return null;
    }

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.school', 'school')
      .where('n.id = :id', { id });

    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) qb.andWhere('n.schoolId = :schoolId', { schoolId });
    } else {
      qb.andWhere('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);

    const notification = await qb.getOne();
    if (!notification || !userId) {
      return notification;
    }

    const readRecord = await this.notificationReadRepository.findOne({
      where: { notificationId: id, userId },
    });

    return {
      ...notification,
      read: !!readRecord,
      readAt: readRecord?.readAt ?? null,
    } as Notification;
  }

  async markAsRead(
    id: string,
    userId?: string,
    schoolId?: string,
    userRole?: string,
  ): Promise<Notification> {
    if (!userId) {
      throw new Error('User context missing');
    }

    const notification = await this.findById(id, schoolId, userRole, userId);
    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    const existing = await this.notificationReadRepository.findOne({
      where: { notificationId: id, userId },
    });

    if (!existing) {
      await this.notificationReadRepository.save(
        this.notificationReadRepository.create({
          notificationId: id,
          userId,
          schoolId,
        }),
      );
    }

    notification.read = true;
    notification.readAt = existing?.readAt ?? new Date();
    console.log('🔔 NotificationService.markAsRead - marking notification as read:', id, 'by user role:', userRole);
    return notification;
  }

  async markAllAsRead(
    userId?: string,
    schoolId?: string,
    userRole?: string,
  ): Promise<void> {
    if (!userId) return;
    if (userRole !== 'SUPER_ADMIN' && !schoolId) return;

    const qb = this.notificationRepository.createQueryBuilder('n').select('n.id', 'id');
    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) qb.where('n.schoolId = :schoolId', { schoolId });
    } else {
      qb.where('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);

    const rows = await qb.getRawMany<{ id: string }>();
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (!ids.length) return;

    const existing = await this.notificationReadRepository.find({
      where: { userId, notificationId: In(ids) },
    });
    const existingIds = new Set(existing.map((r) => r.notificationId));

    const toInsert = ids
      .filter((id) => !existingIds.has(id))
      .map((notificationId) => ({
        notificationId,
        userId,
        schoolId,
      }));

    if (!toInsert.length) return;

    await this.notificationReadRepository
      .createQueryBuilder()
      .insert()
      .into(NotificationRead)
      .values(toInsert)
      .orIgnore()
      .execute();
  }

  async getUnreadCount(
    userId?: string,
    schoolId?: string,
    userRole?: string,
  ): Promise<number> {
    if (!userId) return 0;
    if (userRole !== 'SUPER_ADMIN' && !schoolId) return 0;

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .leftJoin(
        NotificationRead,
        'nr',
        'nr.notificationId = n.id AND nr.userId = :userId',
        { userId },
      )
      .where('nr.id IS NULL');

    if (userRole === 'SUPER_ADMIN') {
      if (schoolId) qb.andWhere('n.schoolId = :schoolId', { schoolId });
    } else {
      qb.andWhere('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);

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
      targetRoles: [this.adminRole],
      metadata: {
        credentials,
        schoolName,
        schoolCode,
      },
    });
  }
}
