import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';

@Injectable()
export class StudentPromotionService {
  private readonly logger = new Logger(StudentPromotionService.name);

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    private readonly dataSource: DataSource,
  ) {}

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
      const students = await queryRunner.manager.find(Student, {
        where: { schoolId },
        relations: ['class'],
      });

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
            // Promote student to next class
            await queryRunner.manager.update(
              Student,
              { id: student.id },
              { classId: nextClassId }
            );
            promotedCount++;
            this.logger.log(
              `Promoted student ${student.studentId} from ${student.class.name} to next class`
            );
          } else {
            // Student is in the highest class - mark as graduated or handle accordingly
            // For now, we'll keep them in the same class but log as graduated
            graduatedCount++;
            this.logger.log(
              `Student ${student.studentId} in highest class (${student.class.name}) - considered graduated`
            );
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
