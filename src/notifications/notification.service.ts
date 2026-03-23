import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Notification, NotificationType, NotificationPriority } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { NotificationDeliveryService } from './notification-delivery.service';

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
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private parentRepository: Repository<Parent>,
    private notificationDeliveryService: NotificationDeliveryService,
  ) {}

  private async getStudentClassIdByUserId(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const student = await this.studentRepository.findOne({
      where: { userId },
      select: ['classId'],
    });
    return student?.classId ?? null;
  }

  private async getParentChildrenClassIdsByUserId(userId?: string): Promise<string[]> {
    if (!userId) return [];
    const parent = await this.parentRepository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.user', 'user')
      .leftJoinAndSelect('parent.children', 'children')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!parent?.children?.length) {
      return [];
    }

    return Array.from(
      new Set(parent.children.map((child) => child.classId).filter(Boolean)),
    );
  }

  private async applyContextAudienceFilter(
    qb: SelectQueryBuilder<Notification>,
    userRole?: string,
    userId?: string,
  ): Promise<void> {
    if (userId) {
      qb.andWhere(
        `(n.metadata->>'targetUserId' IS NULL OR n.metadata->>'targetUserId' = :targetUserId)`,
        { targetUserId: userId },
      );
    }

    const normalizedRole = userRole?.toUpperCase();
    if (normalizedRole === 'PARENT') {
      const parentClassIds = await this.getParentChildrenClassIdsByUserId(userId);
      if (parentClassIds.length) {
        qb.andWhere(
          `(n.metadata->>'classId' IS NULL OR n.metadata->>'classId' IN (:...parentClassIds))`,
          { parentClassIds },
        );
        return;
      }

      qb.andWhere(`n.metadata->>'classId' IS NULL`);
      return;
    }

    if (normalizedRole !== 'STUDENT') {
      return;
    }

    const studentClassId = await this.getStudentClassIdByUserId(userId);
    if (studentClassId) {
      qb.andWhere(
        `(n.metadata->>'classId' IS NULL OR n.metadata->>'classId' = :studentClassId)`,
        { studentClassId },
      );
      return;
    }

    qb.andWhere(`n.metadata->>'classId' IS NULL`);
  }

  private async isBrowserNotificationsEnabled(userId?: string): Promise<boolean> {
    if (!userId) return true;

    const settings = await this.userSettingsRepository
      .createQueryBuilder('settings')
      .leftJoin('settings.user', 'user')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!settings?.notifications) return true;
    return settings.notifications.browser !== false;
  }

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    console.log('🔔 NotificationService.create called with:', createNotificationDto);
    try {
      const notification = this.notificationRepository.create(createNotificationDto);
      const savedNotification = await this.notificationRepository.save(notification);
      const deliveryReport = await this.notificationDeliveryService.deliver(savedNotification);

      const mergedMetadata = {
        ...(savedNotification.metadata || {}),
        deliveryReport,
        deliveryUpdatedAt: new Date().toISOString(),
      };

      await this.notificationRepository.update(savedNotification.id, {
        metadata: mergedMetadata as any,
      });

      savedNotification.metadata = mergedMetadata;
      console.log('📨 Notification delivery report:', {
        notificationId: savedNotification.id,
        recipientsResolved: deliveryReport.recipientsResolved,
        email: deliveryReport.email,
        whatsapp: deliveryReport.whatsapp,
      });
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
  private readonly principalRole = 'PRINCIPAL';
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
    if (normalizedRole === this.adminRole || normalizedRole === this.principalRole) {
      qb.andWhere(
        `(n."targetRoles" IS NULL OR n."targetRoles" @> :adminRole::jsonb OR n."targetRoles" @> :principalRole::jsonb)`,
        {
          adminRole: JSON.stringify([this.adminRole]),
          principalRole: JSON.stringify([this.principalRole]),
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

    if (!(await this.isBrowserNotificationsEnabled(userId))) {
      return { notifications: [], total: 0 };
    }

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
      qb.where('n.schoolId IS NULL');
    } else {
      qb.where('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);
    await this.applyContextAudienceFilter(qb, userRole, userId);

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
    if (!(await this.isBrowserNotificationsEnabled(userId))) {
      return null;
    }

    if (userRole !== 'SUPER_ADMIN' && !schoolId) {
      return null;
    }

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.school', 'school')
      .where('n.id = :id', { id });

    if (userRole === 'SUPER_ADMIN') {
      qb.andWhere('n.schoolId IS NULL');
    } else {
      qb.andWhere('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);
    await this.applyContextAudienceFilter(qb, userRole, userId);

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
    if (!(await this.isBrowserNotificationsEnabled(userId))) return;
    if (userRole !== 'SUPER_ADMIN' && !schoolId) return;

    const qb = this.notificationRepository.createQueryBuilder('n').select('n.id', 'id');
    if (userRole === 'SUPER_ADMIN') {
      qb.where('n.schoolId IS NULL');
    } else {
      qb.where('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);
    await this.applyContextAudienceFilter(qb, userRole, userId);

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
    if (!(await this.isBrowserNotificationsEnabled(userId))) return 0;
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
      qb.andWhere('n.schoolId IS NULL');
    } else {
      qb.andWhere('n.schoolId = :schoolId', { schoolId });
    }

    this.applyRoleAudienceFilter(qb, userRole);
    await this.applyContextAudienceFilter(qb, userRole, userId);

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
