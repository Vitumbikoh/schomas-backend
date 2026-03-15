import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { User } from '../user/entities/user.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { ExpectedFee } from '../finance/entities/expected-fee.entity';
import { Term } from '../settings/entities/term.entity';
import { ConfigService } from '../config/config.service';
import { Role } from '../user/enums/role.enum';

type SupportedCommand =
  | 'hi'
  | 'help'
  | 'menu'
  | 'results'
  | 'balance'
  | 'attendance'
  | 'announcements';

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client | null = null;
  private clientReady = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private pairingCodeRequested = false;
  private lastKnownState = 'INITIALIZING';
  private lastEventAt: Date | null = null;
  private processedMessageIds = new Map<string, number>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(ExamResultAggregate)
    private readonly examResultRepository: Repository<ExamResultAggregate>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(FeePayment)
    private readonly feePaymentRepository: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private readonly feeStructureRepository: Repository<FeeStructure>,
    @InjectRepository(ExpectedFee)
    private readonly expectedFeeRepository: Repository<ExpectedFee>,
    @InjectRepository(Term)
    private readonly termRepository: Repository<Term>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.isFeatureEnabled()) {
      this.logger.warn('WhatsApp integration is disabled. Set WHATSAPP_ENABLED=true to enable.');
      return;
    }

    await this.initializeClient();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    if (this.client) {
      try {
        await this.client.destroy();
      } catch (error) {
        this.logger.warn(`Failed to destroy WhatsApp client cleanly: ${error?.message || error}`);
      }
      this.client = null;
      this.clientReady = false;
      this.lastKnownState = 'DESTROYED';
    }
  }

  getStatus() {
    return {
      enabled: this.isFeatureEnabled(),
      ready: this.clientReady,
      hasClient: !!this.client,
      state: this.lastKnownState,
      lastEventAt: this.lastEventAt,
    };
  }

  isClientReady(): boolean {
    return this.clientReady;
  }

  async sendWhatsAppMessage(phone: string, message: string): Promise<{ to: string; messageId: string }> {
    if (!this.client || !this.clientReady) {
      throw new ServiceUnavailableException('WhatsApp client is not ready. Scan QR and wait for READY state.');
    }

    const jid = this.toWhatsAppJid(phone);
    const result = await this.client.sendMessage(jid, message);

    return {
      to: jid,
      messageId: String(result.id?._serialized || ''),
    };
  }

  async sendResultsPublishedNotification(phone: string, studentName?: string) {
    const name = (studentName || 'Student').trim();
    const text = [
      'EduNexus Notification',
      '',
      `Hello ${name},`,
      '',
      'Your exam results are now available on EduNexus.',
      'Please log in to view your full performance report.',
    ].join('\n');

    return this.sendWhatsAppMessage(phone, text);
  }

  async sendFeeReminderNotification(phone: string, studentName?: string, customMessage?: string) {
    const name = (studentName || 'Student').trim();
    const text = customMessage?.trim()
      ? customMessage.trim()
      : [
          'EduNexus Fee Reminder',
          '',
          `Hello ${name},`,
          '',
          'This is a reminder to clear your outstanding school fees balance.',
          'Contact the finance office for assistance if needed.',
        ].join('\n');

    return this.sendWhatsAppMessage(phone, text);
  }

  async sendAttendanceAlertNotification(phone: string, studentName?: string, customMessage?: string) {
    const name = (studentName || 'Student').trim();
    const text = customMessage?.trim()
      ? customMessage.trim()
      : [
          'EduNexus Attendance Alert',
          '',
          `Hello ${name},`,
          '',
          'Your attendance has fallen below the expected threshold.',
          'Please contact your class teacher for guidance.',
        ].join('\n');

    return this.sendWhatsAppMessage(phone, text);
  }

  async sendAnnouncement(message: string, schoolId?: string, targetRoles?: string[]) {
    const roles = (targetRoles || []).map((role) => role.toUpperCase()).filter(Boolean);

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.parent', 'parent')
      .leftJoinAndSelect('user.finance', 'finance')
      .where('user.isActive = :active', { active: true });

    if (schoolId) {
      qb.andWhere('user.schoolId = :schoolId', { schoolId });
    }

    if (roles.length > 0) {
      qb.andWhere('user.role IN (:...roles)', { roles });
    }

    const users = await qb.getMany();
    const recipients = users
      .map((user) => ({ user, phone: this.extractUserPhone(user) }))
      .filter((entry) => !!entry.phone);

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await this.sendWhatsAppMessage(recipient.phone, `EduNexus Announcement\n\n${message}`);
        sent += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Failed to send broadcast to ${recipient.user.id}: ${error?.message || error}`);
      }
    }

    return {
      totalRecipients: recipients.length,
      sent,
      failed,
    };
  }

  private async initializeClient(): Promise<void> {
    const authPath = this.getOptionalConfig('WHATSAPP_AUTH_PATH') || '.wwebjs_auth';
    const clientId = this.getOptionalConfig('WHATSAPP_CLIENT_ID') || 'edunexus';
    const isHeadless = this.getOptionalConfig('WHATSAPP_HEADLESS') !== 'false';

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId,
        dataPath: authPath,
      }),
      puppeteer: {
        headless: isHeadless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.logger.log('Registering WhatsApp client event listeners...');

    this.client.on('qr', async (qr: string) => {
      this.touchEvent('QR');
      this.logger.warn('WhatsApp QR generated. Scan with your phone to authenticate.');
      this.renderQr(qr);

      const pairingPhone = this.normalizePhoneDigits(this.getOptionalConfig('WHATSAPP_PAIRING_NUMBER') || '');
      if (pairingPhone && !this.pairingCodeRequested) {
        this.pairingCodeRequested = true;
        try {
          const code = await (this.client as any)?.requestPairingCode?.(pairingPhone);
          if (code) {
            this.logger.warn(`WhatsApp pairing code (alternative to QR): ${code}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to generate pairing code: ${error?.message || error}`);
        }
      }
    });

    this.client.on('ready', () => {
      this.touchEvent('READY');
      this.clientReady = true;
      this.lastKnownState = 'CONNECTED';
      this.logger.log('WhatsApp client is ready.');
      this.startHealthChecks();
    });

    this.client.on('authenticated', () => {
      this.touchEvent('AUTHENTICATED');
      this.logger.log('WhatsApp client authenticated successfully.');
    });

    this.client.on('auth_failure', (msg: string) => {
      this.touchEvent('AUTH_FAILURE');
      this.clientReady = false;
      this.lastKnownState = 'AUTH_FAILURE';
      this.logger.error(`WhatsApp authentication failed: ${msg}`);
    });

    this.client.on('change_state', (state: string) => {
      this.touchEvent(`STATE_${state}`);
      this.lastKnownState = state;
      this.logger.log(`WhatsApp state changed: ${state}`);
    });

    this.client.on('disconnected', (reason: string) => {
      this.touchEvent('DISCONNECTED');
      this.clientReady = false;
      this.lastKnownState = 'DISCONNECTED';
      this.logger.warn(`WhatsApp disconnected: ${reason}`);
      this.scheduleReconnect();
    });

    this.client.on('message', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message, 'message');
      } catch (error) {
        this.logger.error(`Failed handling incoming WhatsApp command: ${error?.message || error}`);
      }
    });

    this.client.on('message_create', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message, 'message_create');
      } catch (error) {
        this.logger.error(`Failed handling incoming WhatsApp command via message_create: ${error?.message || error}`);
      }
    });

    await this.client.initialize();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.logger.log('Attempting WhatsApp reconnect...');
      await this.onModuleDestroy();
      await this.initializeClient();
    }, 7000);
  }

  private startHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    this.healthTimer = setInterval(async () => {
      if (!this.client) {
        return;
      }

      try {
        const state = await (this.client as any).getState?.();
        if (state) {
          this.lastKnownState = String(state);
        }
        this.logger.log(`WhatsApp heartbeat: ready=${this.clientReady} state=${this.lastKnownState}`);
      } catch (error) {
        this.logger.warn(`WhatsApp heartbeat failed: ${error?.message || error}`);
      }
    }, 60_000);
  }

  private touchEvent(eventName: string): void {
    this.lastEventAt = new Date();
    this.logger.debug(`WhatsApp event: ${eventName}`);
  }

  private renderQr(qr: string): void {
    const small = this.getOptionalConfig('WHATSAPP_QR_SMALL') !== 'false';

    qrcode.generate(qr, { small }, (qrText: string) => {
      // eslint-disable-next-line no-console
      console.log(`\n${qrText}\n`);
    });

    this.logger.warn('If QR appears wrapped, increase terminal width or use WHATSAPP_PAIRING_NUMBER for pairing code mode.');
  }

  private async handleIncomingMessage(message: Message, source: 'message' | 'message_create'): Promise<void> {
    this.touchEvent(`INBOUND_${source}`);

    this.logger.debug(
      `[${source}] inbound envelope from=${message.from} to=${message.to} fromMe=${message.fromMe} type=${(message as any)?.type || 'unknown'} body=${JSON.stringify(String(message.body || ''))}`,
    );

    const allowSelfMessages = this.getOptionalConfig('WHATSAPP_ALLOW_SELF_MESSAGES') === 'true';

    const messageId = String(message.id?._serialized || '');
    if (messageId) {
      const seenAt = this.processedMessageIds.get(messageId);
      if (seenAt && Date.now() - seenAt < 5 * 60 * 1000) {
        this.logger.debug(`[${source}] skipped duplicate message id=${messageId}`);
        return;
      }
      this.processedMessageIds.set(messageId, Date.now());
    }

    if (this.processedMessageIds.size > 5000) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [id, ts] of this.processedMessageIds.entries()) {
        if (ts < cutoff) {
          this.processedMessageIds.delete(id);
        }
      }
    }

    if (message.fromMe && !allowSelfMessages) {
      this.logger.debug(`[${source}] ignored fromMe message (set WHATSAPP_ALLOW_SELF_MESSAGES=true to test self-chat).`);
      return;
    }

    if (!this.isSupportedPersonalAddress(message.from)) {
      this.logger.debug(`[${source}] ignored non-personal chat: ${message.from}`);
      return;
    }

    const senderIdentifiers = await this.extractSenderIdentifiers(message);
    this.logger.debug(`[${source}] sender identifiers: ${senderIdentifiers.join(', ')}`);

    const incomingPhone = senderIdentifiers[0] || message.from.split('@')[0] || '';
    this.logger.log(`[${source}] Incoming WhatsApp message from ${incomingPhone}: ${String(message.body || '').trim()}`);

    const user = await this.resolveUserByIdentifiers(senderIdentifiers);

    if (!user) {
      this.logger.warn(`No registered EduNexus user matched incoming number: ${incomingPhone}`);
      await message.reply('This number is not registered in EduNexus.');
      return;
    }

    const command = this.parseCommand(message.body);

    let reply = '';
    switch (command) {
      case 'hi':
      case 'help':
      case 'menu':
        reply = this.buildMenuMessage(user);
        break;
      case 'results':
        reply = await this.buildResultsMessage(user);
        break;
      case 'balance':
        reply = await this.buildBalanceMessage(user);
        break;
      case 'attendance':
        reply = await this.buildAttendanceMessage(user);
        break;
      case 'announcements':
        reply = await this.buildAnnouncementsMessage(user);
        break;
      default:
        reply = ['Unknown command.', '', this.buildMenuMessage(user)].join('\n');
    }

    await message.reply(reply);
  }

  private parseCommand(raw: string): SupportedCommand | '' {
    const command = String(raw || '').trim().toLowerCase();
    if (['1', 'results'].includes(command)) return 'results';
    if (['2', 'balance'].includes(command)) return 'balance';
    if (['3', 'attendance'].includes(command)) return 'attendance';
    if (['4', 'announcements'].includes(command)) return 'announcements';
    if (['hi', 'hello', 'hie'].includes(command)) return 'hi';
    if (['help'].includes(command)) return 'help';
    if (['menu'].includes(command)) return 'menu';
    return '';
  }

  private isSupportedPersonalAddress(address: string): boolean {
    return address.endsWith('@c.us') || address.endsWith('@lid');
  }

  private async extractSenderIdentifiers(message: Message): Promise<string[]> {
    const set = new Set<string>();

    const fromId = String(message.from || '').split('@')[0] || '';
    if (fromId) {
      set.add(fromId);
    }

    // For @lid addresses, contact.number often carries the original phone number.
    try {
      const contact: any = await (message as any).getContact?.();
      const possibleValues = [
        contact?.number,
        contact?.phoneNumber,
        contact?.id?.user,
        contact?.userid,
      ];

      for (const value of possibleValues) {
        const normalized = String(value || '').trim();
        if (normalized) {
          set.add(normalized);
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to read contact details for sender resolution: ${error?.message || error}`);
    }

    return Array.from(set);
  }

  private async resolveUserByIdentifiers(identifiers: string[]): Promise<User | null> {
    for (const candidate of identifiers) {
      const user = await this.resolveUserByPhone(candidate);
      if (user) {
        return user;
      }
    }
    return null;
  }

  private buildMenuMessage(user: User): string {
    const name = this.getUserDisplayName(user);
    return [
      'Welcome to EduNexus WhatsApp Assistant',
      '',
      `Hello ${name}`,
      '',
      'Reply with a command:',
      '1 results',
      '2 balance',
      '3 attendance',
      '4 announcements',
    ].join('\n');
  }

  private async buildResultsMessage(user: User): Promise<string> {
    const student = await this.resolveStudentForUser(user);
    if (!student) {
      return 'Results are available for student-linked accounts only.';
    }

    const results = await this.examResultRepository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.course', 'course')
      .leftJoinAndSelect('result.term', 'term')
      .where('result.studentId = :studentId', { studentId: student.id })
      .andWhere('result.schoolId = :schoolId', { schoolId: student.schoolId })
      .andWhere('term.resultsPublished = true')
      .orderBy('term.endDate', 'DESC')
      .addOrderBy('course.name', 'ASC')
      .take(8)
      .getMany();

    if (!results.length) {
      return [
        'EduNexus Results',
        '',
        `Hello ${student.firstName},`,
        '',
        'No published results are available yet.',
      ].join('\n');
    }

    const lines = results.map((row) => {
      const score = row.finalPercentage ? Number(row.finalPercentage).toFixed(0) : 'N/A';
      return `${row.course?.name || 'Course'}: ${score}`;
    });

    return [
      'EduNexus Notification',
      '',
      `Hello ${student.firstName} ${student.lastName}`,
      '',
      'Your latest results:',
      ...lines,
    ].join('\n');
  }

  private async buildBalanceMessage(user: User): Promise<string> {
    const student = await this.resolveStudentForUser(user);
    if (!student) {
      return 'Balance lookup is available for student-linked accounts only.';
    }

    // Prefer historical rollup totals used by financial details screens.
    try {
      const hist = await this.studentRepository.query(
        `
          SELECT
            COALESCE(SUM(sah.total_expected_fees), 0) AS total_expected,
            COALESCE(SUM(sah.total_paid_fees), 0) AS total_paid,
            COALESCE(SUM(sah.outstanding_fees), 0) AS total_outstanding
          FROM student_academic_history sah
          WHERE sah.student_id::uuid = $1
            AND ($2::uuid IS NULL OR sah.school_id::uuid = $2)
        `,
        [student.id, student.schoolId || null],
      );

      const histRow = hist?.[0] || {};
      const histExpected = Number(histRow.total_expected || 0);
      const histPaid = Number(histRow.total_paid || 0);
      const histOutstanding = Number(histRow.total_outstanding || 0);

      if (histExpected > 0 || histPaid > 0 || histOutstanding > 0) {
        return [
          'EduNexus Fee Status',
          '',
          `Hello ${student.firstName} ${student.lastName},`,
          '',
          `Your current school fees balance is MK ${Math.max(histOutstanding, 0).toLocaleString()}.`,
        ].join('\n');
      }
    } catch (error) {
      this.logger.warn(`Historical balance lookup failed, falling back to term-only calculation: ${error?.message || error}`);
    }

    // If historical snapshots are missing/stale, compute overall outstanding using
    // term-filtered expected fees (from enrollment onwards) minus total completed payments.
    const allTermOutstanding = await this.computeAllTermOutstanding(student);
    if (allTermOutstanding !== null) {
      return [
        'EduNexus Fee Status',
        '',
        `Hello ${student.firstName} ${student.lastName},`,
        '',
        `Your current school fees balance is MK ${allTermOutstanding.toLocaleString()}.`,
      ].join('\n');
    }

    const term = await this.resolveReferenceTerm(student.schoolId);
    if (!term) {
      return 'No active or historical term was found for your school.';
    }

    const expectedRaw = await this.expectedFeeRepository
      .createQueryBuilder('fee')
      .select('COALESCE(SUM(fee.amount), 0)', 'totalExpected')
      .where('fee.schoolId = :schoolId', { schoolId: student.schoolId })
      .andWhere('fee.termId = :termId', { termId: term.id })
      .andWhere('fee.isActive = :isActive', { isActive: true })
      .andWhere('(fee.classId IS NULL OR fee.classId = :classId)', { classId: student.classId || null })
      .getRawOne<{ totalExpected: string }>();

    const paidRaw = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'totalPaid')
      .where('payment.studentId = :studentId', { studentId: student.id })
      .andWhere('payment.termId = :termId', { termId: term.id })
      .andWhere('payment.status = :status', { status: 'completed' })
      .getRawOne<{ totalPaid: string }>();

    const totalExpected = Number(expectedRaw?.totalExpected || 0);
    const totalPaid = Number(paidRaw?.totalPaid || 0);
    const outstanding = Math.max(totalExpected - totalPaid, 0);

    return [
      'EduNexus Fee Status',
      '',
      `Hello ${student.firstName} ${student.lastName},`,
      '',
      `Your current school fees balance is MK ${outstanding.toLocaleString()}.`,
    ].join('\n');
  }

  private async computeAllTermOutstanding(student: Student): Promise<number | null> {
    if (!student.schoolId) {
      return null;
    }

    const terms = await this.termRepository
      .createQueryBuilder('term')
      .leftJoinAndSelect('term.academicCalendar', 'ac')
      .where('term.schoolId = :schoolId', { schoolId: student.schoolId })
      .orderBy('COALESCE(ac.startDate, term.startDate)', 'ASC')
      .addOrderBy('term.termNumber', 'ASC')
      .getMany();

    if (!terms.length) {
      return null;
    }

    let filteredTerms = terms;

    if (student.enrollmentTermId) {
      const enrollmentIndex = terms.findIndex((term) => term.id === student.enrollmentTermId);
      if (enrollmentIndex >= 0) {
        filteredTerms = filteredTerms.filter((_, index) => index >= enrollmentIndex);
      }
    }

    if (student.graduationTermId) {
      const graduationIndex = filteredTerms.findIndex((term) => term.id === student.graduationTermId);
      if (graduationIndex >= 0) {
        filteredTerms = filteredTerms.filter((_, index) => index <= graduationIndex);
      }
    }

    if (!filteredTerms.length) {
      return null;
    }

    const termIds = filteredTerms.map((term) => term.id);

    const expectedRaw = await this.feeStructureRepository
      .createQueryBuilder('fee')
      .select('COALESCE(SUM(fee.amount), 0)', 'totalExpected')
      .where('fee.isActive = :isActive', { isActive: true })
      .andWhere('fee.isOptional = :isOptional', { isOptional: false })
      .andWhere('fee.termId IN (:...termIds)', { termIds })
      .andWhere('(fee.classId IS NULL OR fee.classId = :classId)', { classId: student.classId || null })
      .andWhere('fee.schoolId = :schoolId', { schoolId: student.schoolId })
      .getRawOne<{ totalExpected: string }>();

    const paidRaw = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'totalPaid')
      .where('payment.studentId = :studentId', { studentId: student.id })
      .andWhere('payment.status = :status', { status: 'completed' })
      .andWhere('payment.schoolId = :schoolId', { schoolId: student.schoolId })
      .getRawOne<{ totalPaid: string }>();

    const totalExpected = Number(expectedRaw?.totalExpected || 0);
    const totalPaid = Number(paidRaw?.totalPaid || 0);
    const outstanding = Math.max(totalExpected - totalPaid, 0);

    this.logger.debug(
      `All-term balance fallback student=${student.id} expected=${totalExpected} paid=${totalPaid} outstanding=${outstanding} terms=${termIds.length}`,
    );

    return outstanding;
  }

  private async buildAttendanceMessage(user: User): Promise<string> {
    const fromDate = new Date();
    fromDate.setDate(1);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    const records = await this.attendanceRepository.find({
      where: {
        student: { id: user.id },
        date: Between(fromDate, toDate),
      },
      order: { date: 'DESC' },
    });

    if (!records.length) {
      return 'No attendance records found for this month.';
    }

    const present = records.filter((entry) => entry.isPresent).length;
    const total = records.length;

    return ['EduNexus Attendance', '', `You attended ${present} out of ${total} classes this month.`].join('\n');
  }

  private async buildAnnouncementsMessage(user: User): Promise<string> {
    const role = String(user.role || '').toUpperCase();
    const announcements = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.schoolId = :schoolId', { schoolId: user.schoolId })
      .andWhere('(n.targetRoles IS NULL OR n.targetRoles @> :role::jsonb)', {
        role: JSON.stringify([role]),
      })
      .orderBy('n.createdAt', 'DESC')
      .take(3)
      .getMany();

    if (!announcements.length) {
      return 'No announcements are available right now.';
    }

    const lines = announcements.map((item, index) => `${index + 1}. ${item.title}`);
    return ['EduNexus Announcements', '', ...lines].join('\n');
  }

  private async resolveUserByPhone(incomingPhone: string): Promise<User | null> {
    const normalized = this.normalizePhoneDigits(incomingPhone);
    if (!normalized) {
      return null;
    }

    const candidates = this.expandPhoneCandidates(normalized);

    const userByDirectFields = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.parent', 'parent')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.finance', 'finance')
      .where('user.isActive = :active', { active: true })
      .andWhere(
        `(
          REGEXP_REPLACE(COALESCE(user.phone, ''), '[^0-9]', '', 'g') IN (:...phones)
          OR REGEXP_REPLACE(COALESCE(student.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)
          OR REGEXP_REPLACE(COALESCE(parent.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)
          OR REGEXP_REPLACE(COALESCE(teacher.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)
          OR REGEXP_REPLACE(COALESCE(finance.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)
        )`,
        { phones: candidates },
      )
      .getOne();

    if (userByDirectFields) {
      return userByDirectFields;
    }

    const studentByPhone = await this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .where(`REGEXP_REPLACE(COALESCE(student.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .andWhere('user.isActive = :active', { active: true })
      .getOne();

    if (studentByPhone?.user?.id) {
      return this.userRepository.findOne({
        where: { id: studentByPhone.user.id },
        relations: ['student', 'parent', 'teacher', 'finance'],
      });
    }

    const parentByPhone = await this.parentRepository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.user', 'user')
      .where(`REGEXP_REPLACE(COALESCE(parent.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .andWhere('user.isActive = :active', { active: true })
      .getOne();

    if (parentByPhone?.user?.id) {
      return this.userRepository.findOne({
        where: { id: parentByPhone.user.id },
        relations: ['student', 'parent', 'teacher', 'finance'],
      });
    }

    return null;
  }

  private async resolveStudentForUser(user: User): Promise<Student | null> {
    if (String(user.role) === Role.STUDENT) {
      if (user.student?.id) {
        return user.student;
      }

      // Fallback for records where one-to-one relation is not hydrated correctly.
      const studentByUserId = await this.studentRepository.findOne({
        where: { userId: user.id },
      });
      if (studentByUserId) {
        return studentByUserId;
      }

      const directPhone = this.normalizePhoneDigits(this.extractUserPhone(user));
      if (directPhone) {
        const studentByPhone = await this.studentRepository
          .createQueryBuilder('student')
          .where(`REGEXP_REPLACE(COALESCE(student.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
            phones: this.expandPhoneCandidates(directPhone),
          })
          .andWhere('student.schoolId = :schoolId', { schoolId: user.schoolId || null })
          .getOne();

        if (studentByPhone) {
          return studentByPhone;
        }
      }

      this.logger.warn(`Student role user ${user.id} has no resolvable Student profile link.`);
      return null;
    }

    if (String(user.role) === Role.PARENT) {
      const parent = await this.parentRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['children'],
      });
      if (parent?.children?.length) {
        return parent.children[0];
      }
    }

    if (user.student?.id) {
      return this.studentRepository.findOne({ where: { id: user.student.id } });
    }

    const studentByUserId = await this.studentRepository.findOne({
      where: { userId: user.id },
    });
    if (studentByUserId) {
      return studentByUserId;
    }

    return null;
  }

  private async resolveReferenceTerm(schoolId?: string): Promise<Term | null> {
    if (!schoolId) {
      return null;
    }

    const currentTerm = await this.termRepository.findOne({
      where: { schoolId, isCurrent: true },
      order: { endDate: 'DESC' },
    });

    if (currentTerm) {
      return currentTerm;
    }

    return this.termRepository.findOne({
      where: { schoolId },
      order: { endDate: 'DESC' },
    });
  }

  private extractUserPhone(user: User): string {
    return (
      user.phone ||
      user.student?.phoneNumber ||
      user.teacher?.phoneNumber ||
      user.parent?.phoneNumber ||
      user.finance?.phoneNumber ||
      ''
    );
  }

  private getUserDisplayName(user: User): string {
    return (
      [user.student?.firstName, user.student?.lastName].filter(Boolean).join(' ') ||
      [user.parent?.firstName, user.parent?.lastName].filter(Boolean).join(' ') ||
      [user.teacher?.firstName, user.teacher?.lastName].filter(Boolean).join(' ') ||
      [user.finance?.firstName, user.finance?.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'User'
    );
  }

  private toWhatsAppJid(phone: string): string {
    const normalized = this.normalizePhoneDigits(phone);
    if (!normalized) {
      throw new Error('Invalid phone number.');
    }
    return `${normalized}@c.us`;
  }

  private normalizePhoneDigits(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) {
      return '';
    }

    if (digits.startsWith('0')) {
      const countryCode = (this.getOptionalConfig('WHATSAPP_DEFAULT_COUNTRY_CODE') || '265').replace(/\D/g, '');
      return `${countryCode}${digits.slice(1)}`;
    }

    return digits;
  }

  private expandPhoneCandidates(digits: string): string[] {
    const set = new Set<string>();
    set.add(digits);

    const countryCode = (this.getOptionalConfig('WHATSAPP_DEFAULT_COUNTRY_CODE') || '265').replace(/\D/g, '');
    if (digits.startsWith(countryCode) && digits.length > countryCode.length) {
      set.add(`0${digits.slice(countryCode.length)}`);
      set.add(digits.slice(countryCode.length));
    }

    if (digits.startsWith('0')) {
      set.add(`${countryCode}${digits.slice(1)}`);
      set.add(digits.slice(1));
    }

    return Array.from(set);
  }

  private isFeatureEnabled(): boolean {
    const value = this.getOptionalConfig('WHATSAPP_ENABLED');
    if (!value) {
      return true;
    }
    return String(value).toLowerCase() === 'true';
  }

  private getOptionalConfig(key: string): string | undefined {
    try {
      const value = this.configService.get(key);
      return value === undefined || value === null || value === '' ? undefined : value;
    } catch {
      return undefined;
    }
  }
}
