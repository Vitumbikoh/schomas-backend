import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { StudentClassPromotion } from '../entities/student-class-promotion.entity';
import { Term } from 'src/settings/entities/term.entity';

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
  }): Promise<{
    studentId: string;
    fromClassId: string | null;
    toClassId: string | null;
    addedCourseIds: string[];
    removedCourseIds: string[];
    retainedCourseIds: string[];
    dryRun: boolean;
  }> {
    const { studentId, targetClassId, triggeredByUserId, schoolId, dryRun = false, note } = options;
    return this.dataSource.transaction(async (manager) => {
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
        return {
          studentId,
          fromClassId: currentClass.id,
          toClassId: destinationClass.id,
          addedCourseIds: [],
          removedCourseIds: [],
          retainedCourseIds: [],
          dryRun,
        };
      }
      // current term context for enrollment operations
  // fetch current term directly to avoid service circular dependency
  const currentTerm = await this.termRepository.findOne({ where: { isCurrent: true }, select: ['id'] });
  const termId = currentTerm?.id || null;
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
        for (const course of coursesToAdd) {
          const enrollment = manager.create(Enrollment, {
            courseId: course.id,
            studentId: student.id,
            enrollmentDate: new Date(),
            status: 'active',
            termId: termId || undefined,
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
    });
  }

  /**
   * Promotes all students in a school to the next class level when academic calendar changes
   * @param schoolId - The school ID where the promotion should happen
   * @param queryRunner - Optional query runner for transaction management
   */
  async promoteStudentsToNextClass(
    schoolId: string,
    queryRunner?: QueryRunner,
  ): Promise<{
    promotedStudents: number;
    graduatedStudents: number;
    errors: string[];
  }> {
    this.logger.log(`Starting student promotion for school: ${schoolId}`);

    const isExternalTransaction = !!queryRunner;
    if (!queryRunner) {
      queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Get all classes for this school ordered by numerical level
      const classes = await queryRunner.manager.find(Class, {
        where: { schoolId },
        order: { numericalName: 'ASC' },
      });

      if (classes.length === 0) {
        this.logger.warn(`No classes found for school: ${schoolId}`);
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

          const nextClassId = classPromotionMap.get(student.class.id);
          if (nextClassId) {
            // Use single-student promotion logic for consistency & history
            const result = await this.promoteSingleStudent({
              studentId: student.id,
              targetClassId: nextClassId,
              schoolId,
            });
            if (result.toClassId) {
              promotedCount++;
              this.logger.log(`Promoted student ${student.studentId} from ${student.class.name} to next class`);
            }
          } else {
            // Highest class - considered graduated
            graduatedCount++;
            this.logger.log(`Student ${student.studentId} in highest class (${student.class.name}) - considered graduated`);
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
    const classes = await this.classRepository.find({
      where: { schoolId },
      order: { numericalName: 'ASC' },
    });

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
}
