import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AcademicCalendar } from './academic-calendar.entity';
import { Term } from './term.entity';

@Entity()
export class AcademicYear {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => AcademicCalendar, { eager: true })
    @JoinColumn()
    academicCalendar: AcademicCalendar;

    @ManyToOne(() => Term, { eager: true })
    @JoinColumn()
    term: Term;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column({ default: false })
    isCurrent: boolean;
}