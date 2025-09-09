import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Term } from '../../settings/entities/term.entity';
import { Teacher } from '../../user/entities/teacher.entity';
import { School } from '../../school/entities/school.entity';
import { CourseTermGradeComponent } from '../aggregation.entity';
// Use forward ref style import to avoid resolution race

@Entity('course_term_grade_scheme')
@Unique(['courseId','termId'])
export class CourseTermGradeScheme {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) courseId: string;
  @ManyToOne(()=>Course,{ onDelete:'CASCADE'}) @JoinColumn({name:'courseId'}) course: Course;
  @Column({ type:'uuid' }) termId: string;
  @ManyToOne(()=>Term,{ onDelete:'CASCADE'}) @JoinColumn({name:'termId'}) term: Term;
  @Column({ type:'uuid', nullable:true }) teacherId: string | null; // last editor
  @ManyToOne(()=>Teacher,{ onDelete:'SET NULL'}) @JoinColumn({name:'teacherId'}) teacher: Teacher;
  @Column({ type:'uuid', nullable:true }) schoolId: string | null;
  @ManyToOne(()=>School,{ onDelete:'CASCADE'}) @JoinColumn({name:'schoolId'}) school: School;
  @OneToMany(() => CourseTermGradeComponent, (c) => c.scheme, { cascade: true, eager: true }) components: CourseTermGradeComponent[];
  @Column({ type:'int', default:0 }) totalWeight: number;
  @Column({ type:'int', nullable:true }) passThreshold: number | null; // percentage based
  @Column({ default:false }) isLocked: boolean;
  @Column({ type:'int', default:1 }) version: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
