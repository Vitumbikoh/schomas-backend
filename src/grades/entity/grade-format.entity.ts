import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index, JoinColumn } from 'typeorm';
import { School } from 'src/school/entities/school.entity';

// A grading scale row either global (schoolId null) or school-specific.
// Percentage range is inclusive (minPercentage <= mark <= maxPercentage)
@Entity('grade_formats')
@Index(['schoolId', 'grade'], { unique: true })
export class GradeFormat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Letter grade e.g. A+, A, B
  @Column({ length: 10 })
  grade: string;

  @Column({ length: 255 })
  description: string;

  @Column({ type: 'int' })
  minPercentage: number;

  @Column({ type: 'int' })
  maxPercentage: number;

  // GPA point value for this letter grade
  @Column({ type: 'numeric', precision: 3, scale: 2 })
  gpa: number;

  @Column({ default: true })
  isActive: boolean;

  // When null => global / default scale
  @Column({ type: 'uuid', nullable: true })
  schoolId?: string | null;

  @ManyToOne(() => School, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school?: School | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
