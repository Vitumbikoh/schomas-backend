// // src/settings/entities/academic-year.entity.ts
// import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
// import { AcademicCalendar } from './academic-calendar.entity';
// import { Term } from './term.entity';

// @Entity()
// export class AcademicYear {
//   @PrimaryGeneratedColumn('uuid')
//   id: string;

//   @ManyToOne(() => AcademicCalendar)
//   @JoinColumn()
//   academicCalendar: AcademicCalendar;

//   @ManyToOne(() => Term)
//   @JoinColumn()
//   term: Term;

//   @Column({ type: 'date' })
//   startDate: Date;

//   @Column({ type: 'date' })
//   endDate: Date;

//   @Column({ default: false })
//   isCurrent: boolean;
// }