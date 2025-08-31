import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AcademicCalendar } from './academic-calendar.entity';
import { Period } from './period.entity';
import { School } from '../../school/entities/school.entity';

@Entity()
export class Term {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Multi-tenancy: Each term belongs to a specific school
    @Column({ type: 'uuid' })
    schoolId: string;

    @ManyToOne(() => School, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schoolId' })
    school: School;

    @ManyToOne(() => AcademicCalendar, { eager: true })
    @JoinColumn()
    academicCalendar: AcademicCalendar;

    @ManyToOne(() => Period, { eager: true })
    @JoinColumn()
    period: Period;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column({ default: false })
    isCurrent: boolean;

    @Column({ default: false })
    isCompleted: boolean;

    @Column({ type: 'int' })
    termNumber: number; // 1, 2, or 3

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}
