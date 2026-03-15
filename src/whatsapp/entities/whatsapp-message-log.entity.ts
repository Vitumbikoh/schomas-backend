import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('whatsapp_message_log')
export class WhatsAppMessageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sender_phone', type: 'varchar', length: 20 })
  senderPhone: string;

  @Column({ name: 'message_type', type: 'varchar', length: 20 })
  messageType: string;

  @Column({ name: 'message_body', type: 'text', nullable: true })
  messageBody: string | null;

  @CreateDateColumn({
    name: 'timestamp',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  timestamp: Date;
}
