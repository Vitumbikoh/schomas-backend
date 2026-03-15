import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { Notification } from './entities/notification.entity';
import { User } from '../user/entities/user.entity';
import { ConfigService } from '../config/config.service';
import { SchoolSettings } from '../settings/entities/school-settings.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

interface EmailIdentity {
  from: string;
  replyTo?: string;
}

export interface NotificationChannelReport {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface NotificationDeliveryReport {
  recipientsResolved: number;
  email: NotificationChannelReport;
  whatsapp: NotificationChannelReport;
  notes: string[];
}

@Injectable()
export class NotificationDeliveryService {
  private mailTransporter?: nodemailer.Transporter;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SchoolSettings)
    private readonly schoolSettingsRepository: Repository<SchoolSettings>,
    private readonly configService: ConfigService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  private getOptionalConfig(key: string): string | undefined {
    try {
      const value = this.configService.get(key);
      return value === undefined || value === null || value === '' ? undefined : value;
    } catch {
      return undefined;
    }
  }

  async deliver(notification: Notification): Promise<NotificationDeliveryReport> {
    const recipients = await this.resolveRecipients(notification);
    const emailIdentity = await this.resolveEmailIdentity(notification);

    const report: NotificationDeliveryReport = {
      recipientsResolved: recipients.length,
      email: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
      whatsapp: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
      notes: [],
    };

    if (!recipients.length) {
      report.notes.push('No recipients resolved for this notification.');
      return report;
    }

    const emailProviderConfigured = this.isEmailProviderConfigured();
    const whatsappProviderConfigured = this.whatsAppService.isClientReady();

    if (!emailProviderConfigured) {
      report.notes.push('Email provider not configured (missing SMTP_* variables).');
    }
    if (!whatsappProviderConfigured) {
      report.notes.push('WhatsApp provider not configured (web client not ready/authenticated).');
    }

    await Promise.all(
      recipients.map(async (recipient) => {
        const tasks: Promise<void>[] = [];

        if (recipient.emailEnabled) {
          report.email.attempted += 1;

          if (!emailProviderConfigured) {
            report.email.skipped += 1;
          } else if (!recipient.email) {
            report.email.skipped += 1;
          } else {
            tasks.push(
              this.sendEmail(recipient.email, notification, emailIdentity)
                .then(() => {
                  report.email.sent += 1;
                })
                .catch((error) => {
                  report.email.failed += 1;
                  report.notes.push(
                    `Email failed for user ${recipient.id}: ${error?.message || error}`,
                  );
                }),
            );
          }
        }

        if (recipient.whatsappEnabled) {
          report.whatsapp.attempted += 1;

          if (!whatsappProviderConfigured) {
            report.whatsapp.skipped += 1;
          } else if (!recipient.phone) {
            report.whatsapp.skipped += 1;
          } else {
            tasks.push(
              this.sendWhatsapp(recipient.phone, notification)
                .then(() => {
                  report.whatsapp.sent += 1;
                })
                .catch((error) => {
                  report.whatsapp.failed += 1;
                  report.notes.push(
                    `WhatsApp failed for user ${recipient.id}: ${error?.message || error}`,
                  );
                }),
            );
          }
        }

        if (tasks.length) {
          await Promise.all(tasks);
        }
      }),
    );

    return report;
  }

  private formatDisplayName(value?: string | null): string {
    const text = String(value || '').trim().replace(/[\r\n"]/g, '');
    return text || 'edunexus Notifications';
  }

  private parseEmailAddress(value?: string | null): string | undefined {
    const candidate = String(value || '').trim();
    if (!candidate) {
      return undefined;
    }

    const bracketMatch = candidate.match(/<([^>]+)>/);
    const email = (bracketMatch?.[1] || candidate).trim().toLowerCase();
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return basicEmailRegex.test(email) ? email : undefined;
  }

  private async resolveEmailIdentity(notification: Notification): Promise<EmailIdentity> {
    const configuredFrom = this.getOptionalConfig('SMTP_FROM') || this.getOptionalConfig('SMTP_USER');
    const smtpUser = this.parseEmailAddress(this.getOptionalConfig('SMTP_USER'));
    const configuredFromEmail = this.parseEmailAddress(configuredFrom) || smtpUser;

    if (!configuredFromEmail) {
      return { from: 'edunexus Notifications' };
    }

    const platformName = this.formatDisplayName(this.getOptionalConfig('SMTP_FROM_NAME') || 'edunexus Notifications');
    const defaultIdentity: EmailIdentity = {
      from: `${platformName} <${configuredFromEmail}>`,
    };

    if (!notification.schoolId) {
      return defaultIdentity;
    }

    const schoolSettings = await this.schoolSettingsRepository.findOne({
      where: { schoolId: notification.schoolId },
      select: ['schoolName', 'schoolEmail'],
    });

    if (!schoolSettings) {
      return defaultIdentity;
    }

    const schoolName = this.formatDisplayName(schoolSettings.schoolName || platformName);
    const schoolEmail = this.parseEmailAddress(schoolSettings.schoolEmail);

    return {
      from: `${schoolName} via edunexus <${configuredFromEmail}>`,
      replyTo: schoolEmail,
    };
  }

  private async resolveRecipients(notification: Notification): Promise<
    Array<{
      id: string;
      email?: string | null;
      phone?: string | null;
      emailEnabled: boolean;
      whatsappEnabled: boolean;
    }>
  > {
    const targetUserId = notification.metadata?.targetUserId as string | undefined;
    const targetRoles = (notification.targetRoles || [])
      .map((role) => String(role || '').toUpperCase())
      .filter(Boolean);

    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.settings', 'settings')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('student.parent', 'studentParent')
      .leftJoinAndSelect('studentParent.user', 'studentParentUser')
      .leftJoinAndSelect('user.parent', 'parentProfile')
      .leftJoinAndSelect('user.finance', 'finance')
      .where('user.isActive = :isActive', { isActive: true });

    if (targetUserId) {
      query.andWhere('user.id = :targetUserId', { targetUserId });
      if (notification.schoolId) {
        query.andWhere('(user.schoolId = :schoolId OR user.role = :superAdminRole)', {
          schoolId: notification.schoolId,
          superAdminRole: 'SUPER_ADMIN',
        });
      }
    } else if (targetRoles.length > 0) {
      query.andWhere('user.role IN (:...targetRoles)', { targetRoles });
      if (notification.schoolId) {
        query.andWhere('user.schoolId = :schoolId', { schoolId: notification.schoolId });
      }
    } else if (notification.schoolId) {
      query
        .andWhere('user.role = :adminRole', { adminRole: 'ADMIN' })
        .andWhere('user.schoolId = :schoolId', { schoolId: notification.schoolId });
    } else {
      query.andWhere('user.role = :superAdminRole', { superAdminRole: 'SUPER_ADMIN' });
    }

    const users = await query.getMany();

    const unique = new Map<string, (typeof users)[number]>();
    for (const user of users) {
      unique.set(user.id, user);
    }

    return Array.from(unique.values()).map((user) => {
      const settings = user.settings?.notifications;
      const emailEnabled = settings?.email !== false;
      const whatsappEnabled = settings?.whatsapp === true;
      const fallbackParentUser = user.student?.parent?.user;
      const phone =
        user.phone ||
        user.teacher?.phoneNumber ||
        user.student?.phoneNumber ||
        user.student?.parent?.phoneNumber ||
        user.parent?.phoneNumber ||
        fallbackParentUser?.phone ||
        user.finance?.phoneNumber ||
        null;

      return {
        id: user.id,
        email: user.email || fallbackParentUser?.email || null,
        phone,
        emailEnabled,
        whatsappEnabled,
      };
    });
  }

  private isEmailProviderConfigured(): boolean {
    return !!(
      this.getOptionalConfig('SMTP_HOST') &&
      this.getOptionalConfig('SMTP_PORT') &&
      this.getOptionalConfig('SMTP_USER') &&
      this.getOptionalConfig('SMTP_PASS')
    );
  }

  private getOrCreateMailTransporter(): nodemailer.Transporter | null {
    if (this.mailTransporter) {
      return this.mailTransporter;
    }

    const host = this.getOptionalConfig('SMTP_HOST');
    const port = Number(this.getOptionalConfig('SMTP_PORT') || '587');
    const user = this.getOptionalConfig('SMTP_USER');
    const pass = this.getOptionalConfig('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      return null;
    }

    this.mailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: String(this.getOptionalConfig('SMTP_SECURE') || 'false').toLowerCase() === 'true',
      auth: {
        user,
        pass,
      },
    });

    return this.mailTransporter;
  }

  private async sendEmail(
    to: string,
    notification: Notification,
    identity: EmailIdentity,
  ): Promise<void> {
    const transporter = this.getOrCreateMailTransporter();
    if (!transporter) {
      throw new Error('SMTP provider not configured.');
    }

    const from = identity.from || this.getOptionalConfig('SMTP_FROM') || this.getOptionalConfig('SMTP_USER');
    if (!from) {
      throw new Error('SMTP sender not configured (SMTP_FROM/SMTP_USER).');
    }

    await transporter.sendMail({
      from,
      replyTo: identity.replyTo,
      to,
      subject: notification.title,
      text: notification.message || notification.title,
      html: `<div><h3>${notification.title}</h3><p>${notification.message || ''}</p></div>`,
    });
  }

  private async sendWhatsapp(phone: string, notification: Notification): Promise<void> {
    await this.whatsAppService.sendWhatsAppMessage(
      phone,
      `${notification.title}\n${notification.message || ''}`.trim(),
    );
  }
}
