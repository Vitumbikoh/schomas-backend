import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { School } from '../../school/entities/school.entity';

@Entity()
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  author?: string;

  @Column({ nullable: true })
  isbn?: string;

  @Column({ type: 'int', default: 0 })
  totalCopies: number;

  @Column({ type: 'int', default: 0 })
  availableCopies: number;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
