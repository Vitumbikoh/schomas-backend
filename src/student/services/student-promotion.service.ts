import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { StudentClassPromotion } from '../entities/student-class-promotion.entity';
import { Term } from 'src/settings/entities/term.entity';
import { ExamResultAggregate, DefaultWeightingScheme } from 'src/aggregation/aggregation.entity';
import { SchoolSettings } from 'src/settings/entities/school-settings.entity';

@Injectable()
export class StudentPromotionService {
  private readonly logger = new Logger(StudentPromotionService.name);

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
  @InjectRepository(StudentClassPromotion)
  private readonly promotionHistoryRepository: Repository<StudentClassPromotion>,
  @InjectRepository(Term)
  private readonly termRepository: Repository<Term>,
  private readonly dataSource: DataSource,
  ) {}

  /**
   * Promote a single student to a target class (or next automatically) with course enrollment reconciliation and history snapshot.
   */
  async promoteSingleStudent(options: {
    studentId: string;
    targetClassId?: string; // if omitted derive next
    triggeredByUserId?: string;
    schoolId: string;
    dryRun?: boolean;
    note?: string;
    manager?: any; // Optional manager for transaction reuse
    executionId?: string;
    executionAt?: Date;
    progressionId?: string;
  }): Promise<{
    studentId: string;
    fromClassId: string | null;
    toClassId: string | null;
    addedCourseIds: string[];
    removedCourseIds: string[];
    retainedCourseIds: string[];
    dryRun: boolean;
  }> {
    const { studentId, targetClassId, triggeredByUserId, schoolId, dryRun = false, note, manager: providedManager, executionId, executionAt, progressionId } = options;

    // If a manager is provided, use it directly; otherwise create a transaction
    if (providedManager) {
      return this.promoteSingleStudentWithManager(providedManager, { studentId, targetClassId, triggeredByUserId, schoolId, dryRun, note, executionId, executionAt, progressionId });
    }

    return this.dataSource.transaction(async (manager) => {
      return this.promoteSingleStudentWithManager(manager, { studentId, targetClassId, triggeredByUserId, schoolId, dryRun, note, executionId, executionAt, progressionId });
    });
  }

  /**
   * Internal method to promote a single student using a provided manager
   */
  private async promoteSingleStudentWithManager(manager: any, options: {
    studentId: string;
    targetClassId?: string;
    triggeredByUserId?: string;
    schoolId: string;
    dryRun: boolean;
    note?: string;
    executionId?: string;
    executionAt?: Date;
    progressionId?: string;
  }): Promise<{
    studentId: string;
    fromClassId: string | null;
    toClassId: string | null;
    addedCourseIds: string[];
    removedCourseIds: string[];
    retainedCourseIds: string[];
    dryRun: boolean;
  }> {
    const { studentId, targetClassId, triggeredByUserId, schoolId, dryRun = false, note, executionId, executionAt, progressionId } = options;
    const student = await manager.findOne(Student, { where: { id: studentId, schoolId }, relations: ['class'] });
    if (!student) {
      throw new Error('Student not found');
    }
    const classes = await manager.find(Class, { where: { schoolId }, order: { numericalName: 'ASC' } });
    const currentClass = student.class || null;
    let destinationClass: Class | null = null;
    if (targetClassId) {
      destinationClass = classes.find(c => c.id === targetClassId) || null;
    } else if (currentClass) {
      destinationClass = classes.find(c => c.numericalName === currentClass.numericalName + 1) || null;
    }
    if (!destinationClass) {
      // nothing to promote to (maybe graduate)
      return {
        studentId,
        fromClassId: currentClass?.id || null,
        toClassId: null,
        addedCourseIds: [],
        removedCourseIds: [],
        retainedCourseIds: [],
        dryRun,
      };
    }
    if (currentClass && currentClass.id === destinationClass.id) {
      // No effective change; do not record history, signal no-op with toClassId null
      return {
        studentId,
        fromClassId: currentClass.id,
        toClassId: null,
        addedCourseIds: [],
        removedCourseIds: [],
        retainedCourseIds: [],
        dryRun,
      };
    }
    // current term context for enrollment operations
    // fetch current term directly to avoid service circular dependency
    let currentTerm = await this.termRepository.findOne({ where: { isCurrent: true }, select: ['id'] });
    let termId = currentTerm?.id || null;
    // fetch enrollments (active only) with their courses
    const currentEnrollments = await manager.find(Enrollment, {
      where: { studentId },
      relations: { course: true },
    });
    const previousSnapshot = currentEnrollments.map(e => ({
      courseId: e.courseId,
      courseName: e.course?.name || '',
      classId: e.course?.classId || null,
      termId: e.termId || null,
    }));
    // courses available in destination class
    const destinationCourses = await manager.find(Course, { where: { classId: destinationClass.id, schoolId } });
    const destinationCourseIds = new Set(destinationCourses.map(c => c.id));
    const currentCourseIds = new Set(currentEnrollments.map(e => e.courseId));
    // Determine removals: enrollment whose course belongs to old class and not in destination class
    const enrollmentsToRemove = currentEnrollments.filter(e => e.course?.classId && e.course.classId !== destinationClass.id);
    // Determine additions: destination class courses not already enrolled
    const coursesToAdd = destinationCourses.filter(c => !currentCourseIds.has(c.id));
    const retainedCourseIds = currentEnrollments
      .filter(e => !enrollmentsToRemove.includes(e))
      .map(e => e.courseId);
    if (!dryRun) {
      // update class
      await manager.update(Student, { id: student.id }, { classId: destinationClass.id });
      // remove enrollments
      if (enrollmentsToRemove.length) {
        await manager.delete(Enrollment, enrollmentsToRemove.map(e => e.id));
        // decrement enrollmentCount for affected courses
        for (const e of enrollmentsToRemove) {
          if (e.course) {
            await manager.decrement(Course, { id: e.courseId }, 'enrollmentCount', 1);
          }
        }
      }
      // add new enrollments
      // Determine effective termId for new enrollments (fallback chain):
      // 1. Current active term (isCurrent)
      // 2. Any termId from previous enrollments (last snapshot)
      // 3. Latest term for the school (by startDate desc / createdAt desc)
      if (!termId) {
        const previousTermId = previousSnapshot.find(s => s.termId)?.termId || null;
        if (previousTermId) {
          termId = previousTermId;
        } else {
          const latestTerm = await manager.findOne(Term, {
            where: { schoolId },
            order: { startDate: 'DESC' },
          });
          termId = latestTerm?.id || null;
        }
        if (!termId) {
          this.logger.warn(`No term context found for student ${student.studentId} during promotion; new course enrollments will be skipped.`);
        }
      }

      for (const course of coursesToAdd) {
        if (!termId) {
          // Skip adding new enrollment if we cannot satisfy NOT NULL constraint
          continue;
        }
        const enrollment = manager.create(Enrollment, {
          courseId: course.id,
          studentId: student.id,
          enrollmentDate: new Date(),
          status: 'active',
          termId: termId,
          schoolId,
        });
        await manager.save(enrollment);
        await manager.increment(Course, { id: course.id }, 'enrollmentCount', 1);
      }
      // build new snapshot after changes
      const newEnrollments = await manager.find(Enrollment, { where: { studentId }, relations: { course: true } });
      const newSnapshot = newEnrollments.map(e => ({
        courseId: e.courseId,
        courseName: e.course?.name || '',
        classId: e.course?.classId || null,
        termId: e.termId || null,
      }));
      // persist history
      const history = manager.create(StudentClassPromotion, {
        studentId: student.id,
        fromClassId: currentClass?.id || null,
        toClassId: destinationClass.id,
        triggeredByUserId: triggeredByUserId || null,
        previousEnrollments: previousSnapshot,
        newEnrollments: newSnapshot,
        changes: {
          added: coursesToAdd.map(c => c.id),
          removed: enrollmentsToRemove.map(e => e.courseId),
          retained: retainedCourseIds,
        },
        note: note || null,
        schoolId,
        executionId: executionId || null,
        executionAt: executionAt || null,
        progressionId: progressionId || null,
      });
      await manager.save(history);
    }
    return {
      studentId: student.id,
      fromClassId: currentClass?.id || null,
      toClassId: destinationClass.id,
      addedCourseIds: coursesToAdd.map(c => c.id),
      removedCourseIds: enrollmentsToRemove.map(e => e.courseId),
      retainedCourseIds,
      dryRun,
    };
  }

  /**
   * Promotes all students in a school to the next class level when academic calendar changes
   * @param schoolId - The school ID where the promotion should happen
   * @param queryRunner - Optional query runner for transaction management
   */
  async promoteStudentsToNextClass(
    schoolId: string,
    queryRunner?: QueryRunner,
    options?: { executionId?: string; executionAt?: Date; progressionId?: string }
  ): Promise<{
    promotedStudents: number;
    graduatedStudents: number;
    errors: string[];
  }> {
    this.logger.log(`Starting student promotion for school: ${schoolId}`);
    const executionId = options?.executionId;
    const executionAt = options?.executionAt;
    const progressionId = options?.progressionId;
    const isExternalTransaction = !!queryRunner;
    if (!queryRunner) {
      queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Get school's progression settings
      const schoolSettings = await queryRunner.manager.findOne(SchoolSettings, {
        where: { schoolId }
      });
      const progressionMode = schoolSettings?.progressionMode || 'automatic';

      // Get progression term (current Term 3 or completed Term 3)
      let progressionTerm = await queryRunner.manager.findOne(Term, {
        where: { schoolId, isCurrent: true }
      });

      if (!progressionTerm || progressionTerm.termNumber !== 3) {
        progressionTerm = await queryRunner.manager.findOne(Term, {
          where: { schoolId, termNumber: 3, isCompleted: true }
        });
      }

      if (!progressionTerm) {
        throw new Error('No valid progression term found (Term 3 current or completed)');
      }

      // Get pass threshold for exam-based progression
      const defaultScheme = await queryRunner.manager.findOne(DefaultWeightingScheme, {
        where: { schoolId }
      });
      const passThreshold = defaultScheme?.passThreshold || 50;

      // Get all classes for this school ordered by numerical level
      let classes = await queryRunner.manager.find(Class, {
        where: { schoolId },
        order: { numericalName: 'ASC' },
      });

      // Fallback: legacy data may have classes with NULL schoolId but students referencing them while student rows have schoolId
      if (classes.length === 0) {
        this.logger.warn(`No classes found with schoolId=${schoolId}. Attempting legacy fallback via students->class relation.`);
        const studentsForFallback = await queryRunner.manager.find(Student, { where: { schoolId }, relations: ['class'] });
        const derivedClasses = studentsForFallback
          .map(s => s.class)
          .filter(c => !!c) as Class[];
        // De-duplicate by id
        const classMap = new Map<string, Class>();
        for (const c of derivedClasses) {
          if (!classMap.has(c.id)) classMap.set(c.id, c);
        }
        classes = Array.from(classMap.values()).sort((a, b) => a.numericalName - b.numericalName);
        if (classes.length) {
          this.logger.warn(`Fallback recovered ${classes.length} classes for promotion (ids: ${classes.map(c => c.id).join(', ')})`);
        }
      }

      if (classes.length === 0) {
        this.logger.warn(`Promotion aborted: still no classes resolvable for school ${schoolId}`);
        return { promotedStudents: 0, graduatedStudents: 0, errors: [] };
      }

      // Create a map of current class to next class
      const classPromotionMap = new Map<string, string>();
      const maxClassLevel = Math.max(...classes.map(c => c.numericalName));

      for (let i = 0; i < classes.length - 1; i++) {
        const currentClass = classes[i];
        const nextClass = classes[i + 1];
        classPromotionMap.set(currentClass.id, nextClass.id);
      }

      // Get all students in this school with their current classes
      let students = await queryRunner.manager.find(Student, {
        where: { schoolId },
        relations: ['class'],
      });

      // Fallback: if no students returned (some legacy rows might have null schoolId but class belongs to school)
      if (students.length === 0) {
        const classIds = (await queryRunner.manager.find(Class, { where: { schoolId }, select: ['id'] })).map(c => c.id);
        if (classIds.length) {
          students = await queryRunner.manager.find(Student, {
            where: classIds.map(cid => ({ classId: cid })),
            relations: ['class'],
          });
          // Filter to ensure class.schoolId matches
          students = students.filter(s => s.class && classIds.includes(s.class.id));
          this.logger.warn(`Promotion fallback used: fetched ${students.length} students via class linkage for school ${schoolId}`);
        }
      }

      let promotedCount = 0;
      let graduatedCount = 0;
      const errors: string[] = [];

      for (const student of students) {
        try {
          if (!student.class) {
            this.logger.warn(`Student ${student.studentId} has no class assigned`);
            errors.push(`Student ${student.studentId} has no class assigned`);
            continue;
          }

          // Check if student should be promoted based on progression mode
          let shouldPromote = true;

          if (progressionMode === 'exam_based') {
            // Get student's exam results for progression term
            const examResults = await queryRunner.manager.find(ExamResultAggregate, {
              where: {
                studentId: student.id,
                termId: progressionTerm.id,
                schoolId
              }
            });

            if (examResults.length === 0) {
              // Student hasn't written any exams - retain
              shouldPromote = false;
            } else {
              // Calculate average percentage across all courses
              const validResults = examResults.filter(r => r.finalPercentage !== null);
              if (validResults.length === 0) {
                // Student wrote exams but has no valid results - retain
                shouldPromote = false;
              } else {
                const averagePercentage = validResults.reduce((sum, result) => {
                  return sum + parseFloat(result.finalPercentage);
                }, 0) / validResults.length;

                if (averagePercentage < passThreshold) {
                  shouldPromote = false;
                }
              }
            }
          }

          const nextClassId = classPromotionMap.get(student.class.id);
          if (nextClassId && shouldPromote) {
            // Use single-student promotion logic for consistency & history
            const result = await this.promoteSingleStudent({
              studentId: student.id,
              targetClassId: nextClassId,
              schoolId,
              manager: queryRunner.manager,
              executionId: executionId,
              executionAt: executionAt,
              progressionId: progressionId,
            });
            if (result.toClassId) {
              promotedCount++;
              this.logger.log(`Promoted student ${student.studentId} from ${student.class.name} to next class`);
            }
          } else if (nextClassId && !shouldPromote) {
            // Student should be retained in current class
            this.logger.log(`Student ${student.studentId} retained in ${student.class.name} (did not meet promotion criteria)`);
          } else if (!nextClassId) {
            // Highest class - move to graduated class
            const graduatedClass = await queryRunner.manager.findOne(Class, {
              where: { schoolId, name: 'Graduated' }
            });

            if (graduatedClass) {
              // Move student to graduated class
              const result = await this.promoteSingleStudent({
                studentId: student.id,
                targetClassId: graduatedClass.id,
                schoolId,
                manager: queryRunner.manager,
                executionId: executionId,
                executionAt: executionAt,
                progressionId: progressionId,
              });
              if (result.toClassId) {
                graduatedCount++;
                this.logger.log(`Student ${student.studentId} moved from ${student.class.name} to Graduated class`);
              }
            } else {
              this.logger.error(`Graduated class not found for school ${schoolId}. Student ${student.studentId} cannot be graduated.`);
              errors.push(`Graduated class not found for school ${schoolId}`);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to promote student ${student.studentId}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      if (!isExternalTransaction) {
        await queryRunner.commitTransaction();
      }

      this.logger.log(
        `Promotion completed for school ${schoolId}: ${promotedCount} promoted, ${graduatedCount} graduated, ${errors.length} errors`
      );

      return {
        promotedStudents: promotedCount,
        graduatedStudents: graduatedCount,
        errors,
      };
    } catch (error) {
      if (!isExternalTransaction) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Failed to promote students for school ${schoolId}:`, error.stack);
      throw error;
    } finally {
      if (!isExternalTransaction) {
        await queryRunner.release();
      }
    }
  }

  /**
   * Gets the next class for a given class in the school hierarchy
   * @param currentClassId - Current class ID
   * @param schoolId - School ID
   */
  async getNextClass(currentClassId: string, schoolId: string): Promise<Class | null> {
    const classes = await this.classRepository.find({
      where: { schoolId },
      order: { numericalName: 'ASC' },
    });

    const currentClass = classes.find(c => c.id === currentClassId);
    if (!currentClass) {
      return null;
    }

    return classes.find(c => c.numericalName === currentClass.numericalName + 1) || null;
  }

  /**
   * Preview what the promotion would look like without actually doing it
   * @param schoolId - The school ID
   */
  async previewPromotion(schoolId: string): Promise<{
    promotions: Array<{
      studentId: string;
      studentName: string;
      currentClass: string;
      nextClass: string | null;
      status: 'promote' | 'graduate' | 'error';
    }>;
    summary: {
      totalStudents: number;
      toPromote: number;
      toGraduate: number;
      errors: number;
    };
  }> {
    this.logger.log(`Previewing promotion for school: ${schoolId}`);

    // Get all classes for this school ordered by numerical level
    let classes = await this.classRepository.find({
      where: { schoolId },
      order: { numericalName: 'ASC' },
    });

    if (classes.length === 0) {
      // Fallback similar to promote operation: derive from students' current classes (legacy null schoolId on classes)
      const studentsForFallback = await this.studentRepository.find({ where: { schoolId }, relations: ['class'] });
      const classMap = new Map<string, Class>();
      for (const s of studentsForFallback) {
        if (s.class && !classMap.has(s.class.id)) classMap.set(s.class.id, s.class);
      }
      classes = Array.from(classMap.values()).sort((a, b) => a.numericalName - b.numericalName);
      if (classes.length) {
        this.logger.warn(`previewPromotion fallback recovered ${classes.length} classes (ids: ${classes.map(c => c.id).join(', ')})`);
      }
    }

    if (classes.length === 0) {
      return {
        promotions: [],
        summary: { totalStudents: 0, toPromote: 0, toGraduate: 0, errors: 0 },
      };
    }

    // Create a map of current class to next class
    const classPromotionMap = new Map<string, Class>();
    for (let i = 0; i < classes.length - 1; i++) {
      const currentClass = classes[i];
      const nextClass = classes[i + 1];
      classPromotionMap.set(currentClass.id, nextClass);
    }

    // Get all students in this school with their current classes
    const students = await this.studentRepository.find({
      where: { schoolId },
      relations: ['class'],
    });

    const promotions = students.map(student => {
      if (!student.class) {
        return {
          studentId: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          currentClass: 'No class assigned',
          nextClass: null,
          status: 'error' as const,
        };
      }

      const nextClass = classPromotionMap.get(student.class.id);
      
      return {
        studentId: student.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        currentClass: student.class.name,
        nextClass: nextClass?.name || null,
        status: nextClass ? ('promote' as const) : ('graduate' as const),
      };
    });

    const summary = {
      totalStudents: promotions.length,
      toPromote: promotions.filter(p => p.status === 'promote').length,
      toGraduate: promotions.filter(p => p.status === 'graduate').length,
      errors: promotions.filter(p => p.status === 'error').length,
    };

    return { promotions, summary };
  }

  /**
   * Revert student promotions by moving students back to their previous classes
   * This should only be called when progression has been executed
   */
  async revertStudentPromotions(
    schoolId: string,
    queryRunner?: QueryRunner,
    executionId?: string,
    progressionId?: string,
  ): Promise<{
    revertedStudents: number;
    errors: string[];
  }> {
    this.logger.log(`Starting student promotion revert for school: ${schoolId} (executionId=${executionId}, progressionId=${progressionId})`);

    const isExternalTransaction = !!queryRunner;
    if (!queryRunner) {
      queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Get promotion records for the given execution if provided (prevents reverting older promotions accidentally)
      const whereCondition: any = { schoolId };
      if (executionId) whereCondition.executionId = executionId;
      if (progressionId) whereCondition.progressionId = progressionId;

      const recentPromotions = await queryRunner.manager.find(StudentClassPromotion, {
        where: whereCondition,
        relations: ['student', 'fromClass', 'toClass'],
        order: { createdAt: 'DESC' },
      });

      if (recentPromotions.length === 0) {
        this.logger.warn(`No promotion records found to revert for school ${schoolId} and executionId=${executionId}`);
        return { revertedStudents: 0, errors: [] };
      }

      // Group promotions by student to get the most recent one for each student
      const studentPromotions = new Map<string, StudentClassPromotion>();
      for (const promotion of recentPromotions) {
        if (!studentPromotions.has(promotion.studentId)) {
          studentPromotions.set(promotion.studentId, promotion);
        }
      }

      let revertedCount = 0;
      const errors: string[] = [];

      for (const promotion of studentPromotions.values()) {
        try {
          const student = promotion.student;
          if (!student) {
            this.logger.warn(`Student not found for promotion ${promotion.id}`);
            errors.push(`Student not found for promotion ${promotion.id}`);
            continue;
          }

          // Move student back to their previous class
          if (promotion.fromClass) {
            await queryRunner.manager.update(Student, student.id, {
              classId: promotion.fromClass.id,
              updatedAt: new Date(),
            });

            // Handle course enrollments - remove courses from new class and restore courses from old class
            // This is a simplified version - in a real implementation, you'd need more sophisticated logic
            // to properly manage enrollments based on the class requirements

            revertedCount++;
            this.logger.log(`Reverted student ${student.studentId} from ${promotion.toClass?.name || 'graduated'} back to ${promotion.fromClass.name}`);
          } else {
            this.logger.warn(`No fromClass found for promotion ${promotion.id} - cannot revert`);
            errors.push(`No previous class found for student ${student.studentId}`);
          }

          // Note: We don't update the promotion record itself as it's a historical record
          // The revert action is logged separately in the system logs

        } catch (error) {
          const errorMsg = `Failed to revert student ${promotion.studentId}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      if (!isExternalTransaction) {
        await queryRunner.commitTransaction();
      }

      this.logger.log(
        `Promotion revert completed for school ${schoolId}: ${revertedCount} reverted, ${errors.length} errors`
      );

      return {
        revertedStudents: revertedCount,
        errors,
      };
    } catch (error) {
      if (!isExternalTransaction) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Failed to revert student promotions for school ${schoolId}:`, error.stack);
      throw error;
    } finally {
      if (!isExternalTransaction) {
        await queryRunner.release();
      }
    }
  }
}
