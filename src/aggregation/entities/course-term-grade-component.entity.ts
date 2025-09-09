import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { CourseTermGradeScheme } from './course-term-grade-scheme.entity';
import { AssessmentComponentType } from '../enums';

@Entity('course_term_grade_component')
@Unique(['schemeId','componentType'])
export class CourseTermGradeComponent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) schemeId: string;
  @ManyToOne(()=>CourseTermGradeScheme, s=>s.components, { onDelete:'CASCADE'}) @JoinColumn({name:'schemeId'}) scheme: CourseTermGradeScheme;
  @Column({ type:'enum', enum: AssessmentComponentType }) componentType: AssessmentComponentType;
  @Column({ type:'int' }) weight: number; // must sum to 100 in scheme
  @Column({ type:'boolean', default:true }) required: boolean;
}
