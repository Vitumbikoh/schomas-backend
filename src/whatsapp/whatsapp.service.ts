import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { Between, Repository } from 'typeorm';
import { ConfigService } from '../config/config.service';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { WhatsAppMessageLog } from './entities/whatsapp-message-log.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { Schedule } from '../schedule/entity/schedule.entity';
import { Term } from '../settings/entities/term.entity';
import { Notification } from '../notifications/entities/notification.entity';

type CloudApiInboundMessage = {
  from?: string;
  type?: string;
  text?: {
    body?: string;
  };
};

type CloudApiStatusEvent = {
  id?: string;
  status?: string;
  recipient_id?: string;
};

type StudentIntent = 'balance' | 'results' | 'attendance' | 'timetable' | 'payments' | 'announcements';

type ConversationStage = 'awaiting_student_id' | 'awaiting_student_selection' | 'awaiting_menu';

type SessionState = {
  stage: ConversationStage;
  selectedStudentId?: string;
  candidateStudentIds?: string[];
  updatedAt: number;
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly unregisteredNumberReply = 'This number is not registered in EduNexus.';
  private readonly expiredSessionReply = 'Please send a new message to start a session.';
  private readonly sessionMap = new Map<string, SessionState>();
  private readonly webhookQueue: unknown[] = [];
  private queueProcessing = false;

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(WhatsAppMessageLog)
    private readonly messageLogRepository: Repository<WhatsAppMessageLog>,
    @InjectRepository(FeePayment)
    private readonly feePaymentRepository: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private readonly feeStructureRepository: Repository<FeeStructure>,
    @InjectRepository(ExamResultAggregate)
    private readonly examResultRepository: Repository<ExamResultAggregate>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(Term)
    private readonly termRepository: Repository<Term>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly configService: ConfigService,
  ) {}

  verifyWebhookToken(mode?: string, token?: string): boolean {
    const expectedToken = this.getRequiredConfig('WHATSAPP_VERIFY_TOKEN');
    return mode === 'subscribe' && token === expectedToken;
  }

  isClientReady(): boolean {
    return Boolean(this.getOptionalConfig('WHATSAPP_API_TOKEN') || this.getOptionalConfig('WHATSAPP_ACCESS_TOKEN'));
  }

  async sendWhatsAppMessage(phone: string, message: string): Promise<{ to: string; messageId?: string }> {
    const result = await this.sendMessage({
      to: phone,
      text: message,
      enforceSessionWindow: true,
    });

    return {
      to: this.normalizePhoneDigits(phone),
      messageId: result.messageId,
    };
  }

  enqueueWebhookPayload(payload: unknown): void {
    this.webhookQueue.push(payload);
    if (!this.queueProcessing) {
      void this.processWebhookQueue();
    }
  }

  private async processWebhookQueue(): Promise<void> {
    this.queueProcessing = true;

    while (this.webhookQueue.length > 0) {
      const payload = this.webhookQueue.shift();
      try {
        await this.handleWebhookPayload(payload);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        this.logger.error(`Webhook queue worker failed: ${details}`);
      }
    }

    this.queueProcessing = false;
  }

  async handleWebhookPayload(payload: unknown): Promise<void> {
    const messages = this.extractIncomingMessages(payload);
    const statuses = this.extractStatusEvents(payload);

    if (messages.length === 0) {
      if (statuses.length > 0) {
        const statusSummary = statuses
          .map((status) => `${status.status || 'unknown'}:${status.recipient_id || 'unknown'}`)
          .join(', ');
        this.logger.log(`Webhook status update(s): ${statusSummary}`);
      } else {
        this.logger.log('Webhook received without inbound user messages (non-message event).');
      }
      return;
    }

    this.logger.log(`Webhook received ${messages.length} inbound WhatsApp message(s).`);

    for (const item of messages) {
      const from = this.normalizePhoneDigits(item.from || '');
      if (!from) {
        this.logger.warn('Skipping webhook message with missing sender phone.');
        continue;
      }

      const query: UserQueryDto = {
        from,
        text: String(item.text?.body || '').trim(),
        messageType: String(item.type || 'unknown').toLowerCase(),
      };

      this.logger.log(`Processing inbound message from ${from} of type ${query.messageType}.`);
      await this.handleIncomingUserQuery(query);
    }
  }

  async handleIncomingUserQuery(query: UserQueryDto): Promise<void> {
    const senderPhone = this.normalizePhoneDigits(query.from);
    const messageType = query.messageType || 'unknown';
    const text = query.text || '';

    await this.logMessage(senderPhone, this.toMessageType(messageType, 'incoming'), text || '[non-text-message]');

    const registered = await this.isRegisteredPhoneNumber(senderPhone);
    if (!registered) {
      this.logger.warn(`Inbound sender ${senderPhone} is not registered in student/parent records.`);
      await this.sendPlainTextReply(senderPhone, this.unregisteredNumberReply, false);
      return;
    }

    const hasActiveSession = await this.hasActiveSessionWindow(senderPhone);
    if (!hasActiveSession) {
      this.logger.warn(`Inbound sender ${senderPhone} is outside the 24-hour active session.`);
      await this.sendPlainTextReply(senderPhone, this.expiredSessionReply, false);
      return;
    }

    const reply = await this.routeConversation(senderPhone, text);
    await this.sendPlainTextReply(senderPhone, reply, false);
  }

  async sendMessage(dto: SendWhatsAppMessageDto): Promise<{ success: boolean; messageId?: string }> {
    const to = this.normalizePhoneDigits(dto.to);
    const enforceWindow = dto.enforceSessionWindow !== false;

    if (!to) {
      throw new Error('A valid destination phone number is required.');
    }

    if (enforceWindow) {
      const hasSession = await this.hasActiveSessionWindow(to);
      if (!hasSession) {
        await this.logMessage(to, 'outbound_failed', this.expiredSessionReply);
        return { success: false };
      }
    }

    const payload = this.buildOutboundPayload(dto, to);
    this.logger.log(`Sending outbound WhatsApp ${dto.templateName ? 'template' : 'text'} message to ${to}.`);

    try {
      const response = await this.postToCloudApi(payload);
      const messageId = response?.messages?.[0]?.id as string | undefined;
      this.logger.log(`Outbound WhatsApp send succeeded for ${to}. Message ID: ${messageId || 'n/a'}`);

      await this.logMessage(to, 'outgoing_api', dto.text || dto.templateName || '[template-message]');
      return { success: true, messageId };
    } catch (error) {
      const details = axios.isAxiosError(error)
        ? `HTTP ${error.response?.status || 'n/a'} ${JSON.stringify(error.response?.data || {})}`
        : error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(`Outbound WhatsApp send failed for ${to}: ${details}`);
      await this.logMessage(to, 'outbound_failed', details.slice(0, 1000));
      throw error;
    }
  }

  private async routeConversation(senderPhone: string, incomingText: string): Promise<string> {
    this.cleanupStaleSession(senderPhone);

    const text = String(incomingText || '').trim();
    const normalized = text.toLowerCase();
    const linkedStudents = await this.resolveStudentsForSender(senderPhone);

    if (!linkedStudents.length) {
      return this.unregisteredNumberReply;
    }

    if (this.isGreeting(normalized)) {
      this.sessionMap.set(senderPhone, {
        stage: 'awaiting_student_id',
        updatedAt: Date.now(),
      });
      return this.buildStudentIdPrompt();
    }

    const session = this.sessionMap.get(senderPhone);

    if (normalized === '0') {
      if (session?.selectedStudentId) {
        this.sessionMap.set(senderPhone, {
          stage: 'awaiting_menu',
          selectedStudentId: session.selectedStudentId,
          updatedAt: Date.now(),
        });
        return this.buildMenuMessage();
      }

      this.sessionMap.set(senderPhone, {
        stage: 'awaiting_student_id',
        updatedAt: Date.now(),
      });
      return this.buildStudentIdPrompt();
    }

    if (!session) {
      this.sessionMap.set(senderPhone, {
        stage: 'awaiting_student_id',
        updatedAt: Date.now(),
      });
      return this.buildStudentIdPrompt();
    }

    if (session.stage === 'awaiting_student_selection') {
      return this.handleStudentSelectionStep(senderPhone, text, linkedStudents, session);
    }

    if (session.stage === 'awaiting_student_id') {
      return this.handleStudentIdStep(senderPhone, text, linkedStudents);
    }

    return this.handleMenuStep(senderPhone, normalized, linkedStudents, session);
  }

  private async handleStudentIdStep(senderPhone: string, text: string, linkedStudents: Student[]): Promise<string> {
    const student = this.findStudentByStudentId(text, linkedStudents);

    if (!student) {
      if (linkedStudents.length > 1) {
        const candidateIds = linkedStudents.map((item) => item.id);
        this.sessionMap.set(senderPhone, {
          stage: 'awaiting_student_selection',
          candidateStudentIds: candidateIds,
          updatedAt: Date.now(),
        });

        return [
          'The Student ID you entered is invalid. Please try again.',
          '',
          'Multiple students found for this phone number. Please select:',
          ...linkedStudents.map((item, index) => `${index + 1}. ${item.firstName} ${item.lastName} (${item.studentId})`),
          '',
          'Reply with the number or enter Student ID again.',
        ].join('\n');
      }

      return 'The Student ID you entered is invalid. Please try again.';
    }

    this.sessionMap.set(senderPhone, {
      stage: 'awaiting_menu',
      selectedStudentId: student.id,
      updatedAt: Date.now(),
    });

    return [
      this.buildPersonalizedWelcome(student),
      '',
      this.buildMenuMessage(),
    ].join('\n');
  }

  private async handleStudentSelectionStep(
    senderPhone: string,
    text: string,
    linkedStudents: Student[],
    session: SessionState,
  ): Promise<string> {
    const selectedByIndex = this.findStudentBySelectionNumber(text, linkedStudents, session.candidateStudentIds || []);
    const selectedById = this.findStudentByStudentId(text, linkedStudents);
    const selectedStudent = selectedByIndex || selectedById;

    if (!selectedStudent) {
      return [
        'Invalid selection. Please choose a valid student.',
        ...linkedStudents.map((item, index) => `${index + 1}. ${item.firstName} ${item.lastName} (${item.studentId})`),
        '',
        'Reply with the number or enter Student ID again.',
      ].join('\n');
    }

    this.sessionMap.set(senderPhone, {
      stage: 'awaiting_menu',
      selectedStudentId: selectedStudent.id,
      updatedAt: Date.now(),
    });

    return [
      this.buildPersonalizedWelcome(selectedStudent),
      '',
      this.buildMenuMessage(),
    ].join('\n');
  }

  private async handleMenuStep(
    senderPhone: string,
    normalizedText: string,
    linkedStudents: Student[],
    session: SessionState,
  ): Promise<string> {
    const student = linkedStudents.find((item) => item.id === session.selectedStudentId);

    if (!student) {
      this.sessionMap.set(senderPhone, {
        stage: 'awaiting_student_id',
        updatedAt: Date.now(),
      });
      return this.buildStudentIdPrompt();
    }

    const intent = this.parseNumericIntent(normalizedText);
    if (!intent) {
      return [
        'Invalid option. Please reply with a number between 1 and 6.',
        '',
        this.buildMenuMessage(),
      ].join('\n');
    }

    this.sessionMap.set(senderPhone, {
      stage: 'awaiting_menu',
      selectedStudentId: student.id,
      updatedAt: Date.now(),
    });

    const response = await this.buildIntentResponse(intent, student);
    return this.appendExitToMainMenuHint(response);
  }

  private findStudentByStudentId(input: string, students: Student[]): Student | null {
    const target = String(input || '').trim().toUpperCase();
    if (!target) {
      return null;
    }

    for (const student of students) {
      if (String(student.studentId || '').trim().toUpperCase() === target) {
        return student;
      }
    }

    return null;
  }

  private findStudentBySelectionNumber(input: string, students: Student[], candidateStudentIds: string[]): Student | null {
    const selectedIndex = Number.parseInt(String(input || '').trim(), 10);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 1) {
      return null;
    }

    const ordered = students.filter((item) => candidateStudentIds.includes(item.id));
    return ordered[selectedIndex - 1] || null;
  }

  private buildStudentIdPrompt(): string {
    return [
      'Welcome to EduNexus Smart School System',
      'Please enter your Student ID to proceed.',
    ].join('\n');
  }

  private buildPersonalizedWelcome(student: Student): string {
    const schoolName = student.school?.name || 'EduNexus School';
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    return `Welcome to ${schoolName}, ${studentName}`;
  }

  private isGreeting(normalized: string): boolean {
    return ['hi', 'hello', 'hie', 'hey', 'menu', 'help'].includes(normalized);
  }

  private async buildIntentResponse(intent: StudentIntent, student: Student): Promise<string> {
    switch (intent) {
      case 'balance':
        return this.buildOutstandingBalanceMessage(student);
      case 'results':
        return this.buildExamResultsMessage(student);
      case 'attendance':
        return this.buildAttendanceMessage(student);
      case 'timetable':
        return this.buildTimetableMessage(student);
      case 'payments':
        return this.buildPaymentHistoryMessage(student);
      case 'announcements':
        return this.buildAnnouncementsMessage(student);
      default:
        return this.buildMenuMessage();
    }
  }

  private async buildPaymentHistoryMessage(student: Student): Promise<string> {
    const payments = await this.feePaymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.term', 'term')
      .where('payment.studentId = :studentId', { studentId: student.id })
      .andWhere('payment.schoolId = :schoolId', { schoolId: student.schoolId || null })
      .andWhere('payment.status = :status', { status: 'completed' })
      .orderBy('payment.paymentDate', 'DESC')
      .take(5)
      .getMany();

    if (!payments.length) {
      return [
        'Payment History',
        '',
        `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
        'No completed payment records found.',
      ].join('\n');
    }

    const lines = payments.map((payment) => {
      const amount = Number(payment.amount || 0).toLocaleString();
      const date = payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : 'n/a';
      const termLabel = payment.term?.termNumber ? `T${payment.term.termNumber}` : 'Term';
      const method = payment.paymentMethod || 'payment';
      return `${date} ${termLabel}: MWK ${amount} via ${method}`;
    });

    return [
      'Payment History (Latest 5)',
      '',
      `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
      ...lines,
    ].join('\n');
  }

  private async buildAnnouncementsMessage(student: Student): Promise<string> {
    const announcements = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.schoolId = :schoolId', { schoolId: student.schoolId || null })
      .andWhere('(n.targetRoles IS NULL OR n.targetRoles @> :studentRole::jsonb OR n.targetRoles @> :parentRole::jsonb)', {
        studentRole: JSON.stringify(['STUDENT']),
        parentRole: JSON.stringify(['PARENT']),
      })
      .orderBy('n.createdAt', 'DESC')
      .take(3)
      .getMany();

    if (!announcements.length) {
      return ['Latest Announcements', '', 'No announcements are available right now.'].join('\n');
    }

    const lines = announcements.map((item, index) => {
      const message = String(item.message || '').trim();
      const compact = message.length > 100 ? `${message.slice(0, 97)}...` : message;
      return `${index + 1}. ${item.title}${compact ? ` - ${compact}` : ''}`;
    });

    return ['Latest Announcements', '', ...lines].join('\n');
  }

  private async buildOutstandingBalanceMessage(student: Student): Promise<string> {
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

      const row = hist?.[0] || {};
      const expected = Number(row.total_expected || 0);
      const paid = Number(row.total_paid || 0);
      const outstanding = Number(row.total_outstanding || 0);

      if (expected > 0 || paid > 0 || outstanding > 0) {
        return [
          'Outstanding Balance',
          '',
          `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
          `Total Expected: MWK ${Math.max(expected, 0).toLocaleString()}`,
          `Total Paid: MWK ${Math.max(paid, 0).toLocaleString()}`,
          `Outstanding: MWK ${Math.max(outstanding, 0).toLocaleString()}`,
        ].join('\n');
      }
    } catch (error) {
      this.logger.warn(
        `Historical balance lookup failed, using computed fallback: ${error instanceof Error ? error.message : error}`,
      );
    }

    const computedOutstanding = await this.computeAllTermOutstanding(student);

    return [
      'Outstanding Balance',
      '',
      `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
      `Outstanding: MWK ${Math.max(computedOutstanding, 0).toLocaleString()}`,
    ].join('\n');
  }

  private async computeAllTermOutstanding(student: Student): Promise<number> {
    if (!student.schoolId) {
      return 0;
    }

    const terms = await this.termRepository
      .createQueryBuilder('term')
      .leftJoinAndSelect('term.academicCalendar', 'ac')
      .where('term.schoolId = :schoolId', { schoolId: student.schoolId })
      .orderBy('COALESCE(ac.startDate, term.startDate)', 'ASC')
      .addOrderBy('term.termNumber', 'ASC')
      .getMany();

    if (!terms.length) {
      return 0;
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

    const termIds = filteredTerms.map((term) => term.id);
    if (!termIds.length) {
      return 0;
    }

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

    return Math.max(totalExpected - totalPaid, 0);
  }

  private async buildExamResultsMessage(student: Student): Promise<string> {
    const results = await this.examResultRepository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.course', 'course')
      .leftJoinAndSelect('result.term', 'term')
      .where('result.studentId = :studentId', { studentId: student.id })
      .andWhere('result.schoolId = :schoolId', { schoolId: student.schoolId || null })
      .andWhere('term.resultsPublished = true')
      .orderBy('term.endDate', 'DESC')
      .addOrderBy('course.name', 'ASC')
      .take(8)
      .getMany();

    if (!results.length) {
      return [
        'Exam Results',
        '',
        `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
        'No published results found yet.',
      ].join('\n');
    }

    const lines = results.map((row) => {
      const score = row.finalPercentage ? Number(row.finalPercentage).toFixed(0) : 'N/A';
      const grade = row.finalGradeCode || '-';
      const term = row.term?.termNumber ? `T${row.term.termNumber}` : 'Term';
      return `${term} ${row.course?.name || 'Course'}: ${score}% (${grade})`;
    });

    return ['Exam Results', '', `Student: ${student.firstName} ${student.lastName} (${student.studentId})`, ...lines].join(
      '\n',
    );
  }

  private async buildAttendanceMessage(student: Student): Promise<string> {
    const fromDate = new Date();
    fromDate.setDate(1);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    const records = await this.attendanceRepository.find({
      where: {
        student: { id: student.userId },
        date: Between(fromDate, toDate),
      },
      order: { date: 'DESC' },
    });

    if (!records.length) {
      return [
        'Attendance',
        '',
        `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
        'No attendance records found for this month.',
      ].join('\n');
    }

    const present = records.filter((entry) => entry.isPresent).length;
    const total = records.length;
    const percentage = Math.round((present / total) * 100);

    return [
      'Attendance',
      '',
      `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
      `Present: ${present}/${total} (${percentage}%)`,
    ].join('\n');
  }

  private async buildTimetableMessage(student: Student): Promise<string> {
    if (!student.classId) {
      return [
        'Timetable',
        '',
        `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
        'No class is currently assigned for this student.',
      ].join('\n');
    }

    const rows = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('class.id = :classId', { classId: student.classId })
      .andWhere('schedule.isActive = :active', { active: true })
      .orderBy('schedule.day', 'ASC')
      .addOrderBy('schedule.startTime', 'ASC')
      .take(8)
      .getMany();

    if (!rows.length) {
      return [
        'Timetable',
        '',
        `Student: ${student.firstName} ${student.lastName} (${student.studentId})`,
        'No active timetable entries found.',
      ].join('\n');
    }

    const lines = rows.map((row) => `${row.day} ${row.startTime}-${row.endTime}: ${row.course?.name || 'Course'}`);

    return ['Timetable', '', `Student: ${student.firstName} ${student.lastName} (${student.studentId})`, ...lines].join('\n');
  }

  private parseNumericIntent(normalized: string): StudentIntent | null {
    if (normalized === '1') return 'balance';
    if (normalized === '2') return 'results';
    if (normalized === '3') return 'attendance';
    if (normalized === '4') return 'timetable';
    if (normalized === '5') return 'payments';
    if (normalized === '6') return 'announcements';
    return null;
  }

  private buildMenuMessage(): string {
    return [
      'Reply with a number only:',
      '1. Outstanding balance (all terms)',
      '2. Exam results',
      '3. Attendance',
      '4. Timetable',
      '5. Payment history',
      '6. Latest announcements',
      '',
      'Reply 0 at any time to return to this main menu.',
    ].join('\n');
  }

  private appendExitToMainMenuHint(message: string): string {
    return [message, '', 'Reply 0 to return to the main menu.'].join('\n');
  }

  private cleanupStaleSession(senderPhone: string): void {
    const state = this.sessionMap.get(senderPhone);
    if (!state) {
      return;
    }

    const ageMs = Date.now() - state.updatedAt;
    if (ageMs > 30 * 60 * 1000) {
      this.sessionMap.delete(senderPhone);
    }
  }

  private async resolveStudentsForSender(phone: string): Promise<Student[]> {
    const candidates = this.expandPhoneCandidates(phone);

    const directStudents = await this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.class', 'class')
      .leftJoinAndSelect('student.school', 'school')
      .where(`REGEXP_REPLACE(COALESCE(student.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .andWhere('student.isActive = :isActive', { isActive: true })
      .getMany();

    const parentLinkedStudents = await this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.parent', 'parent')
      .leftJoinAndSelect('student.class', 'class')
      .leftJoinAndSelect('student.school', 'school')
      .where(`REGEXP_REPLACE(COALESCE(parent.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .andWhere('student.isActive = :isActive', { isActive: true })
      .getMany();

    const unique = new Map<string, Student>();
    for (const student of [...directStudents, ...parentLinkedStudents]) {
      unique.set(student.id, student);
    }

    return Array.from(unique.values());
  }

  private buildOutboundPayload(dto: SendWhatsAppMessageDto, to: string): Record<string, unknown> {
    const messagingProduct = 'whatsapp';

    if (dto.templateName) {
      const templateVariables = (dto.templateVariables || []).map((value) => ({
        type: 'text',
        text: value,
      }));

      return {
        messaging_product: messagingProduct,
        to,
        type: 'template',
        template: {
          name: dto.templateName,
          language: {
            code: dto.languageCode || 'en_US',
          },
          components: templateVariables.length
            ? [
                {
                  type: 'body',
                  parameters: templateVariables,
                },
              ]
            : [],
        },
      };
    }

    if (!dto.text || !dto.text.trim()) {
      throw new Error('Either text or templateName must be provided.');
    }

    return {
      messaging_product: messagingProduct,
      to,
      type: 'text',
      text: {
        body: dto.text.trim(),
      },
    };
  }

  private async sendPlainTextReply(to: string, message: string, enforceSessionWindow: boolean): Promise<void> {
    await this.sendMessage({
      to,
      text: message,
      enforceSessionWindow,
    });
  }

  private async postToCloudApi(payload: Record<string, unknown>): Promise<any> {
    const url = this.buildCloudApiUrl();
    const token = this.getApiToken();

    const config: AxiosRequestConfig<Record<string, unknown>> = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    };

    const response = await axios.post(url, payload, config);
    return response.data;
  }

  private buildCloudApiUrl(): string {
    const baseUrl = this.getOptionalConfig('WHATSAPP_API_URL') || this.getLegacyApiBaseUrl();
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const phoneId = this.getOptionalConfig('WHATSAPP_PHONE_ID') || this.getOptionalConfig('WHATSAPP_PHONE_NUMBER_ID');

    if (!phoneId) {
      throw new Error('Missing WhatsApp phone id. Set WHATSAPP_PHONE_ID.');
    }

    return `${normalizedBase}/${phoneId}/messages`;
  }

  private getApiToken(): string {
    return this.getOptionalConfig('WHATSAPP_API_TOKEN') || this.getRequiredConfig('WHATSAPP_ACCESS_TOKEN');
  }

  private getLegacyApiBaseUrl(): string {
    const legacyBase = this.getOptionalConfig('WHATSAPP_API_BASE_URL') || 'https://graph.facebook.com';
    const legacyVersion = this.getOptionalConfig('WHATSAPP_API_VERSION') || 'v22.0';
    return `${legacyBase.replace(/\/$/, '')}/${legacyVersion}`;
  }

  private extractIncomingMessages(payload: unknown): CloudApiInboundMessage[] {
    const body = payload as any;
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const results: CloudApiInboundMessage[] = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
        for (const message of messages) {
          results.push(message as CloudApiInboundMessage);
        }
      }
    }

    return results;
  }

  private extractStatusEvents(payload: unknown): CloudApiStatusEvent[] {
    const body = payload as any;
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const results: CloudApiStatusEvent[] = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
        for (const status of statuses) {
          results.push(status as CloudApiStatusEvent);
        }
      }
    }

    return results;
  }

  private async isRegisteredPhoneNumber(phone: string): Promise<boolean> {
    const candidates = this.expandPhoneCandidates(phone);

    const studentCount = await this.studentRepository
      .createQueryBuilder('student')
      .where(`REGEXP_REPLACE(COALESCE(student.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .getCount();

    if (studentCount > 0) {
      return true;
    }

    const parentCount = await this.parentRepository
      .createQueryBuilder('parent')
      .where(`REGEXP_REPLACE(COALESCE(parent.phoneNumber, ''), '[^0-9]', '', 'g') IN (:...phones)`, {
        phones: candidates,
      })
      .getCount();

    return parentCount > 0;
  }

  private async hasActiveSessionWindow(phone: string): Promise<boolean> {
    const lastIncoming = await this.messageLogRepository
      .createQueryBuilder('log')
      .where('log.sender_phone = :phone', { phone })
      .andWhere("log.message_type LIKE 'incoming_%'")
      .orderBy('log.timestamp', 'DESC')
      .getOne();

    if (!lastIncoming) {
      return true;
    }

    const ageMs = Date.now() - new Date(lastIncoming.timestamp).getTime();
    return ageMs <= 24 * 60 * 60 * 1000;
  }

  private toMessageType(sourceType: string, direction: 'incoming' | 'outgoing'): string {
    const normalized = sourceType || 'unknown';
    return `${direction}_${normalized}`.slice(0, 20);
  }

  private async logMessage(senderPhone: string, messageType: string, messageBody: string): Promise<void> {
    try {
      const record = this.messageLogRepository.create({
        senderPhone,
        messageType: messageType.slice(0, 20),
        messageBody,
      });
      await this.messageLogRepository.save(record);
    } catch (error) {
      this.logger.error(`Failed to write WhatsApp message log: ${error instanceof Error ? error.message : error}`);
    }
  }

  private normalizePhoneDigits(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) {
      return '';
    }

    if (digits.startsWith('0')) {
      const code = (this.getOptionalConfig('WHATSAPP_DEFAULT_COUNTRY_CODE') || '254').replace(/\D/g, '');
      return `${code}${digits.slice(1)}`;
    }

    return digits;
  }

  private expandPhoneCandidates(phoneDigits: string): string[] {
    const set = new Set<string>();
    set.add(phoneDigits);

    const countryCode = (this.getOptionalConfig('WHATSAPP_DEFAULT_COUNTRY_CODE') || '254').replace(/\D/g, '');

    if (phoneDigits.startsWith(countryCode) && phoneDigits.length > countryCode.length) {
      const local = phoneDigits.slice(countryCode.length);
      set.add(local);
      set.add(`0${local}`);
    }

    if (phoneDigits.startsWith('0')) {
      const withoutZero = phoneDigits.slice(1);
      set.add(withoutZero);
      set.add(`${countryCode}${withoutZero}`);
    }

    return Array.from(set);
  }

  private getRequiredConfig(key: string): string {
    return this.configService.get(key);
  }

  private getOptionalConfig(key: string): string | undefined {
    try {
      const value = this.configService.get(key);
      if (!value) {
        return undefined;
      }
      return value;
    } catch {
      return undefined;
    }
  }
}
