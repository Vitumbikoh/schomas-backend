import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, ILike, Repository } from 'typeorm';
import { Role } from '../user/enums/role.enum';
import { User } from '../user/entities/user.entity';
import { SendMessageDto } from './dto/send-message.dto';
import { Message } from './entities/message.entity';

type AuthUser = {
  id?: string;
  sub?: string;
  role?: Role | string;
  schoolId?: string | null;
};

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private getUserId(user: AuthUser): string {
    const id = user?.sub || user?.id;
    if (!id) {
      throw new ForbiddenException('Unauthorized user context');
    }
    return id;
  }

  private getDisplayName(user?: User | null): string {
    if (!user) return 'Unknown User';
    return user.username || user.email || 'Unknown User';
  }

  private canBypassSchoolScope(role?: Role | string): boolean {
    return String(role) === Role.SUPER_ADMIN;
  }

  private async resolveRecipient(to: string, currentUser: AuthUser): Promise<User> {
    const query = to.trim();
    if (!query) {
      throw new BadRequestException('Recipient is required');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query);

    const recipient = await this.userRepository.findOne({
      where: isUuid
        ? [{ id: query }, { email: query }, { username: query }]
        : [{ email: ILike(query) }, { username: ILike(query) }],
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found. Use username, email, or user ID.');
    }

    const currentUserId = this.getUserId(currentUser);
    if (recipient.id === currentUserId) {
      throw new BadRequestException('You cannot send a message to yourself');
    }

    if (!this.canBypassSchoolScope(currentUser.role)) {
      if (!currentUser.schoolId || !recipient.schoolId || recipient.schoolId !== currentUser.schoolId) {
        throw new ForbiddenException('Recipient must belong to your school');
      }
    }

    return recipient;
  }

  async getInbox(currentUser: AuthUser, search?: string) {
    const userId = this.getUserId(currentUser);

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.recipient', 'recipient')
      .where('message.recipientId = :userId', { userId });

    if (!this.canBypassSchoolScope(currentUser.role)) {
      qb.andWhere('message.schoolId = :schoolId', { schoolId: currentUser.schoolId });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('message.subject ILIKE :term', { term })
            .orWhere('message.content ILIKE :term', { term })
            .orWhere('sender.username ILIKE :term', { term })
            .orWhere('sender.email ILIKE :term', { term });
        }),
      );
    }

    const [messages, unreadCount] = await Promise.all([
      qb.orderBy('message.createdAt', 'DESC').getMany(),
      this.messageRepository.count({
        where: { recipientId: userId, isRead: false },
      }),
    ]);

    return {
      messages: messages.map((message) => ({
        id: message.id,
        from: this.getDisplayName(message.sender),
        to: this.getDisplayName(message.recipient),
        subject: message.subject,
        content: message.content,
        date: message.createdAt,
        read: message.isRead,
      })),
      unreadCount,
    };
  }

  async getSent(currentUser: AuthUser, search?: string) {
    const userId = this.getUserId(currentUser);

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.recipient', 'recipient')
      .where('message.senderId = :userId', { userId });

    if (!this.canBypassSchoolScope(currentUser.role)) {
      qb.andWhere('message.schoolId = :schoolId', { schoolId: currentUser.schoolId });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('message.subject ILIKE :term', { term })
            .orWhere('message.content ILIKE :term', { term })
            .orWhere('recipient.username ILIKE :term', { term })
            .orWhere('recipient.email ILIKE :term', { term });
        }),
      );
    }

    const messages = await qb.orderBy('message.createdAt', 'DESC').getMany();

    return messages.map((message) => ({
      id: message.id,
      from: this.getDisplayName(message.sender),
      to: this.getDisplayName(message.recipient),
      subject: message.subject,
      content: message.content,
      date: message.createdAt,
      read: message.isRead,
    }));
  }

  async send(currentUser: AuthUser, payload: SendMessageDto) {
    const senderId = this.getUserId(currentUser);
    const sender = await this.userRepository.findOne({ where: { id: senderId } });
    if (!sender) {
      throw new NotFoundException('Sender account not found');
    }

    const recipient = await this.resolveRecipient(payload.to, currentUser);

    const message = this.messageRepository.create({
      subject: payload.subject.trim(),
      content: payload.content.trim(),
      senderId: sender.id,
      recipientId: recipient.id,
      schoolId: this.canBypassSchoolScope(currentUser.role)
        ? sender.schoolId || recipient.schoolId || null
        : currentUser.schoolId || null,
      isRead: false,
    });

    const saved = await this.messageRepository.save(message);

    return {
      id: saved.id,
      from: this.getDisplayName(sender),
      to: this.getDisplayName(recipient),
      subject: saved.subject,
      content: saved.content,
      date: saved.createdAt,
      read: saved.isRead,
    };
  }

  async markAsRead(currentUser: AuthUser, messageId: string) {
    const userId = this.getUserId(currentUser);

    const message = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.recipientId !== userId) {
      throw new ForbiddenException('You can only mark your own inbox messages as read');
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await this.messageRepository.save(message);
    }

    return { id: message.id, read: message.isRead, readAt: message.readAt };
  }

  async searchRecipients(currentUser: AuthUser, query = '') {
    const userId = this.getUserId(currentUser);
    const q = query.trim();

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.id != :userId', { userId })
      .andWhere('user.isActive = true');

    if (!this.canBypassSchoolScope(currentUser.role)) {
      qb.andWhere('user.schoolId = :schoolId', { schoolId: currentUser.schoolId });
    }

    if (q) {
      const term = `%${q}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('user.username ILIKE :term', { term }).orWhere('user.email ILIKE :term', { term });
        }),
      );
    }

    const users = await qb.orderBy('user.username', 'ASC').take(10).getMany();

    return users.map((u) => ({
      id: u.id,
      label: u.username || u.email,
      email: u.email,
      username: u.username,
    }));
  }
}
