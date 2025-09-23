// src/exam/exam.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';
import { Class } from '../classes/entity/class.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Course } from '../course/entities/course.entity';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
import { User } from '../user/entities/user.entity';
import { SettingsService } from '../settings/settings.service'; // Add this import
import { Term } from 'src/settings/entities/term.entity';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(Exam)
    private examRepository: Repository<Exam>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Term) // Add this injection
    private termRepository: Repository<Term>,
  @InjectRepository(AcademicCalendar)
  private academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private settingsService: SettingsService, // Add this
    private systemLoggingService: SystemLoggingService,
  ) {}

  async findAll(schoolId?: string, superAdmin = false): Promise<Exam[]> {
    const where: any = {};
    if (!superAdmin) {
      if (!schoolId) return [];
      where.schoolId = schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }
    const exams = await this.examRepository.find({
      where,
      relations: ['class', 'teacher', 'course', 'Term'],
    });
    if (this.systemLoggingService) {
      await this.systemLoggingService.logAction({
        action: 'EXAMS_FIND_ALL',
        module: 'EXAMS',
        level: 'debug',
        schoolId,
        metadata: { returned: exams.length, superAdmin }
      });
    }
    return exams;
  }

  async create(createExamDto: CreateExamDto, schoolId?: string, superAdmin = false): Promise<Exam> {
    let { classId, teacherId, courseId, ...examData } = createExamDto;

  // Get current term automatically
  const Term = await this.settingsService.getCurrentTerm();
    if (!Term) {
      throw new NotFoundException('No current term found');
    }

    // Load course first so we can infer class/teacher if needed
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['class', 'teacher'],
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Infer classId from course when missing
    if (!classId) {
      classId = course.classId || course.class?.id;
    }

    const classEntity = await this.classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    // Infer teacherId from course if missing
    if (!teacherId) {
      teacherId = course.teacherId || course.teacher?.id;
    }

    // Try to find teacher by userId first, then by id for backward compatibility
    let teacher = teacherId
      ? await this.teacherRepository.findOne({ where: { userId: teacherId }, relations: ['user'] })
      : null;

    if (!teacher && teacherId) {
      teacher = await this.teacherRepository.findOne({ where: { id: teacherId }, relations: ['user'] });
    }

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

  // We'll infer school scope after loading all related entities

  // course already loaded above

    const derivedSchoolId = schoolId || teacher.schoolId || course.schoolId || classEntity.schoolId || null;

    // Also get active academic calendar for context (after deriving school scope)
    let activeCalendarId: string | undefined;
    if (derivedSchoolId) {
      const active = await this.academicCalendarRepository.findOne({ where: { schoolId: derivedSchoolId, isActive: true }, select: ['id'] });
      activeCalendarId = active?.id;
    }

    if (!superAdmin) {
      if (!derivedSchoolId) {
        throw new BadRequestException('Missing school scope');
      }
      if (teacher.schoolId && teacher.schoolId !== derivedSchoolId) {
        throw new BadRequestException('Teacher not in derived school scope');
      }
      if (course.schoolId && course.schoolId !== derivedSchoolId) {
        throw new BadRequestException('Course not in derived school scope');
      }
      if (classEntity.schoolId && classEntity.schoolId !== derivedSchoolId) {
        throw new BadRequestException('Class not in derived school scope');
      }
    } else if (schoolId) {
      if (teacher.schoolId && teacher.schoolId !== schoolId) {
        throw new BadRequestException('Teacher not in specified school');
      }
      if (course.schoolId && course.schoolId !== schoolId) {
        throw new BadRequestException('Course not in specified school');
      }
      if (classEntity.schoolId && classEntity.schoolId !== schoolId) {
        throw new BadRequestException('Class not in specified school');
      }
    }

    const exam = this.examRepository.create({
      ...examData,
      class: classEntity,
      teacher: teacher,
      course: course,
      TermId: Term.id,
      academicCalendarId: activeCalendarId,
      schoolId: derivedSchoolId,
    });

    return this.examRepository.save(exam);
  }

  async findByFilters(
    searchText?: string,
    className?: string,
    teacherId?: string,
    teacherName?: string,
    Term?: string,
    schoolId?: string,
    superAdmin = false,
  ): Promise<Exam[]> {
    // Enhanced logging for debugging
    if (this.systemLoggingService) {
      await this.systemLoggingService.logAction({
        action: 'EXAMS_FIND_BY_FILTERS_START',
        module: 'EXAMS',
        level: 'debug',
        schoolId,
        metadata: { 
          searchText, className, teacherId, teacherName, Term, 
          superAdmin, schoolIdProvided: !!schoolId 
        }
      });
    }

    if (!superAdmin && !schoolId) {
      if (this.systemLoggingService) {
        await this.systemLoggingService.logAction({
          action: 'EXAMS_EARLY_RETURN_NO_SCHOOL',
          module: 'EXAMS',
          level: 'warn',
          metadata: { reason: 'Non-super admin with no schoolId' }
        });
      }
      return [];
    }

    const query = this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.teacher', 'teacher')
      .leftJoinAndSelect('teacher.user', 'user')
      .leftJoinAndSelect('exam.course', 'course')
      .leftJoinAndSelect('exam.Term', 'Term'); // Include Term

    if (!superAdmin) {
      query.andWhere('exam.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      query.andWhere('exam.schoolId = :schoolId', { schoolId });
    }

    if (searchText) {
      // Use andWhere so we don't overwrite previous where clauses (schoolId constraint)
      query.andWhere(
        '(exam.title ILIKE :searchText OR course.name ILIKE :searchText)',
        { searchText: `%${searchText}%` },
      );
    }

    if (className && className !== 'All Classes') {
      query.andWhere('class.name = :className', { className });
    }

    if (teacherId && teacherId !== 'All Teachers') {
      // First try to find teacher by ID, then by userId for backward compatibility
      query.andWhere('(teacher.id = :teacherId OR teacher.userId = :teacherId)', { teacherId });
    } else if (teacherName && teacherName !== 'All Teachers') {
      const [firstName, lastName] = teacherName.split(' ');
      query.andWhere(
        '(teacher.firstName = :firstName AND teacher.lastName = :lastName)',
        { firstName, lastName },
      );
    }

    if (Term && Term !== 'All Years') {
      // Try to filter by Term.id first, then fallback to any exam if no current year matches
      query.andWhere('Term.id = :TermId', {
        TermId: Term,
      });
    }

    // Log the constructed SQL query for debugging
    const sqlQuery = query.getSql();
    if (this.systemLoggingService) {
      await this.systemLoggingService.logAction({
        action: 'EXAMS_QUERY_CONSTRUCTED',
        module: 'EXAMS',
        level: 'debug',
        schoolId,
        metadata: { sqlQuery, parameters: query.getParameters() }
      });
    }

    let results = await query.getMany();

  // Enhanced fallback logic for better data retrieval
  // IMPORTANT: Do not drop the Term filter when a Term was explicitly provided.
  // Only apply fallback when no Term filter was requested.
  if (!superAdmin && schoolId && results.length === 0 && (!Term || Term === 'All Years')) {
      // Try without term filter if no results
      const fallbackQuery = this.examRepository
        .createQueryBuilder('exam')
        .leftJoinAndSelect('exam.class', 'class')
        .leftJoinAndSelect('exam.teacher', 'teacher')
        .leftJoinAndSelect('teacher.user', 'user')
        .leftJoinAndSelect('exam.course', 'course')
        .leftJoinAndSelect('exam.Term', 'Term')
        .where('exam.schoolId = :schoolId', { schoolId });

      // Apply same filters except term
      if (searchText) {
        fallbackQuery.andWhere(
          '(exam.title ILIKE :searchText OR course.name ILIKE :searchText)',
          { searchText: `%${searchText}%` },
        );
      }
      if (className && className !== 'All Classes') {
        fallbackQuery.andWhere('class.name = :className', { className });
      }
      if (teacherId && teacherId !== 'All Teachers') {
        fallbackQuery.andWhere('(teacher.id = :teacherId OR teacher.userId = :teacherId)', { teacherId });
      } else if (teacherName && teacherName !== 'All Teachers') {
        const [firstName, lastName] = teacherName.split(' ');
        fallbackQuery.andWhere(
          '(teacher.firstName = :firstName AND teacher.lastName = :lastName)',
          { firstName, lastName },
        );
      }

      results = await fallbackQuery.getMany();
      
    if (this.systemLoggingService && results.length > 0) {
        await this.systemLoggingService.logAction({
          action: 'EXAMS_FALLBACK_SUCCESS',
          module: 'EXAMS',
          level: 'info',
          schoolId,
      metadata: { fallbackResultCount: results.length, reason: 'No Term filter requested; removed only non-term constraints during fallback' }
        });
      }
    }

    // Backfill: if still no results but there are NULL schoolId exams, attempt to assign schoolId heuristically and retry
    if (!superAdmin && schoolId && results.length === 0) {
      // Perform raw count for NULL schoolId rows (TypeORM typing doesn't allow { schoolId: null })
      const rawNullCount = await this.examRepository.query('SELECT COUNT(*) FROM exam WHERE "schoolId" IS NULL');
      const nullCount = parseInt(rawNullCount?.[0]?.count || '0', 10);
      if (nullCount > 0) {
        await this.backfillExamSchoolIds(schoolId);
        results = await query.getMany();
      }
    }
    
    // Log final results
    if (this.systemLoggingService) {
      await this.systemLoggingService.logAction({
        action: 'EXAMS_FIND_BY_FILTERS_RESULT',
        module: 'EXAMS',
        level: 'debug',
        schoolId,
        metadata: { resultCount: results.length, examIds: results.map(e => e.id) }
      });
    }
    
    return results;
  }

  async getExamStatistics(schoolId?: string, superAdmin = false): Promise<{
    totalExams: number;
    administeredExams: number;
    gradedExams: number;
    upcomingExams: number;
  }> {
    // Get current term
    const Term = await this.settingsService.getCurrentTerm();
    const baseWhere: any = {};
    if (Term) baseWhere.termId = Term.id;
    if (!superAdmin) {
      if (!schoolId) {
        return { totalExams: 0, administeredExams: 0, gradedExams: 0, upcomingExams: 0 };
      }
      baseWhere.schoolId = schoolId;
    } else if (schoolId) {
      baseWhere.schoolId = schoolId;
    }

    let [totalExams, administeredExams, gradedExams, upcomingExams] = await Promise.all([
      this.examRepository.count({ where: baseWhere }),
      this.examRepository.count({ where: { ...baseWhere, status: 'administered' } }),
      this.examRepository.count({ where: { ...baseWhere, status: 'graded' } }),
      this.examRepository.count({ where: { ...baseWhere, status: 'upcoming' } }),
    ]);

    // Fallback if zero but there are legacy exams without TermId or with different year
    if (totalExams === 0 && schoolId) {
      const legacyCount = await this.examRepository.count({ where: { schoolId } });
      if (legacyCount > 0) {
        totalExams = legacyCount;
        administeredExams = await this.examRepository.count({ where: { schoolId, status: 'administered' } });
        gradedExams = await this.examRepository.count({ where: { schoolId, status: 'graded' } });
        upcomingExams = await this.examRepository.count({ where: { schoolId, status: 'upcoming' } });
        if (this.systemLoggingService) {
          await this.systemLoggingService.logAction({
            action: 'EXAMS_STATS_FALLBACK_APPLIED',
            module: 'EXAMS',
            level: 'warn',
            schoolId,
            metadata: { reason: 'Term mismatch', legacyCount }
          });
        }
      }
    }

    if (this.systemLoggingService) {
      await this.systemLoggingService.logAction({
        action: 'EXAMS_STATS_CALCULATED',
        module: 'EXAMS',
        level: 'debug',
        schoolId,
        metadata: { totalExams, administeredExams, gradedExams, upcomingExams, TermId: Term?.id }
      });
    }

    return { totalExams, administeredExams, gradedExams, upcomingExams };
  }

// src/exam/exam.service.ts
async getExamCountByCourse(courseIds: string[], schoolId?: string, superAdmin = false): Promise<Map<string, number>> {
  if (!courseIds || courseIds.length === 0) {
    console.log('No course IDs provided for exam count query');
    return new Map<string, number>();
  }

  console.log('Querying exam counts for course IDs:', courseIds);

  const params: any = { courseIds };
  let sql = `SELECT "courseId", COUNT(id) AS "examCount" FROM exam WHERE "courseId" = ANY($1)`;
  if (!superAdmin) {
    if (schoolId) {
      sql += ' AND "schoolId" = $2';
      params.schoolId = schoolId;
    } else {
      return new Map<string, number>();
    }
  } else if (schoolId) {
    sql += ' AND "schoolId" = $2';
    params.schoolId = schoolId;
  }
  sql += ' GROUP BY "courseId"';

  // Build parameter array preserving order
  const paramArray = [courseIds];
  if (params.schoolId) paramArray.push(params.schoolId);

  const examCounts = await this.examRepository.query(sql, paramArray);

  console.log('Raw exam counts:', examCounts);

  const examCountMap = new Map<string, number>();
  examCounts.forEach((ec: any) => {
    examCountMap.set(ec.courseId, parseInt(ec.examCount));
  });

  courseIds.forEach((courseId) => {
    if (!examCountMap.has(courseId)) {
      examCountMap.set(courseId, 0);
    }
  });

  console.log('Exam count map:', Array.from(examCountMap.entries()));
  return examCountMap;
}

  async getDistinctTerms(): Promise<string[]> {
    // Get all terms with their calendar relations
    const Terms = await this.termRepository.find({
      relations: ['academicCalendar'],
      order: { startDate: 'ASC' },
    });

    // Extract unique terms from the calendar
    const years = new Set<string>();
    Terms.forEach((ay) => {
      if (ay.academicCalendar?.term) {
        years.add(ay.academicCalendar.term);
      }
    });

    return ['All Years', ...Array.from(years)];
  }

  async findOne(id: string, schoolId?: string, superAdmin = false): Promise<Exam> {
    const where: any = { id };
    if (!superAdmin) {
      if (!schoolId) throw new NotFoundException('Exam not found');
      where.schoolId = schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }
    const exam = await this.examRepository.findOne({
      where,
      relations: ['class', 'teacher', 'course', 'Term'],
    });
    if (!exam) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }
    return exam;
  }

  async administerExam(id: string, userId: string, schoolId?: string, superAdmin = false): Promise<Exam> {
    const exam = await this.findOne(id, schoolId, superAdmin);
    
    // Get the teacher profile to verify authorization
    const teacher = await this.teacherRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!teacher) {
      throw new ForbiddenException('Teacher profile not found');
    }
    
    // Verify the teacher is authorized for this exam
    if (exam.teacher.id !== teacher.id) {
      throw new ForbiddenException('You are not authorized to administer this exam');
    }

    // Check if exam can be administered
    if (exam.status !== 'upcoming') {
      throw new BadRequestException(`Exam is already ${exam.status}`);
    }

    // Update status to administered
    await this.examRepository.update(id, { status: 'administered' });
    
    // Return updated exam
    return this.findOne(id, schoolId, superAdmin);
  }

  async findByCourseAndTeacher(courseId: string, teacherId: string, schoolId?: string, superAdmin = false): Promise<Exam[]> {
    console.log(`[DEBUG] findByCourseAndTeacher - courseId: ${courseId}, teacherId: ${teacherId}, schoolId: ${schoolId}, superAdmin: ${superAdmin}`);
    
    const queryBuilder = this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.course', 'course')
      .leftJoinAndSelect('exam.teacher', 'teacher')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.Term', 'Term')
      .where('exam.courseId = :courseId', { courseId })
      .andWhere('exam.teacherId = :teacherId', { teacherId });

    if (!superAdmin) {
      if (!schoolId) {
        console.log(`[DEBUG] Returning empty array - no schoolId provided for non-super admin`);
        return [];
      }
      queryBuilder.andWhere('exam.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      queryBuilder.andWhere('exam.schoolId = :schoolId', { schoolId });
    }

    const sqlQuery = queryBuilder.getSql();
    const parameters = queryBuilder.getParameters();
    console.log(`[DEBUG] SQL Query: ${sqlQuery}`);
    console.log(`[DEBUG] Parameters:`, parameters);

    const results = await queryBuilder.getMany();
    console.log(`[DEBUG] Query returned ${results.length} results`);
    
    return results;
  }

  async findAllForTeacherByTerm(teacherId: string, termId?: string, schoolId?: string, superAdmin = false): Promise<Exam[]> {
    const qb = this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.course', 'course')
      .leftJoinAndSelect('exam.teacher', 'teacher')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.Term', 'Term')
      .where('(exam.teacherId = :teacherId OR teacher.userId = :teacherId)', { teacherId });

    if (termId) {
      qb.andWhere('exam."TermId" = :termId', { termId });
    }

    if (!superAdmin) {
      if (!schoolId) return [];
      qb.andWhere('exam."schoolId" = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('exam."schoolId" = :schoolId', { schoolId });
    }

    qb.orderBy('exam.date', 'DESC');
    return qb.getMany();
  }

  // Attempt to backfill missing schoolId on legacy exam rows using related entities
  private async backfillExamSchoolIds(schoolId: string) {
    try {
      await this.examRepository.query(`
        UPDATE exam e
        SET "schoolId" = c."schoolId"
        FROM classes c
        WHERE e."classId" = c.id AND e."schoolId" IS NULL AND c."schoolId" = $1
      `, [schoolId]);
      await this.examRepository.query(`
        UPDATE exam e
        SET "schoolId" = co."schoolId"
        FROM course co
        WHERE e."courseId" = co.id AND e."schoolId" IS NULL AND co."schoolId" = $1
      `, [schoolId]);
      await this.examRepository.query(`
        UPDATE exam e
        SET "schoolId" = t."schoolId"
        FROM teacher t
        WHERE e."teacherId" = t.id AND e."schoolId" IS NULL AND t."schoolId" = $1
      `, [schoolId]);
    } catch (err) {
      // Silent catch; diagnostic improvement could log via a logging service if injected here
      // console.error('Backfill exam schoolId failed', err);
    }
  }

  // Debug method to understand exam data structure
  async debugExamData(schoolId?: string, superAdmin = false): Promise<any> {
    const rawExams = await this.examRepository.query(`
      SELECT 
        e.id,
        e.title,
        e."schoolId",
        e."teacherId",
        e."TermId",
        t.id as teacher_id,
        t."userId" as teacher_user_id,
        t."firstName" as teacher_first_name,
        t."lastName" as teacher_last_name,
        t."schoolId" as teacher_school_id,
        u.id as user_id,
        u.email as user_email,
        u."schoolId" as user_school_id
      FROM exam e 
      LEFT JOIN teacher t ON e."teacherId" = t.id OR e."teacherId" = t."userId"
      LEFT JOIN "user" u ON t."userId" = u.id
      ${!superAdmin && schoolId ? 'WHERE e."schoolId" = $1 OR t."schoolId" = $1 OR u."schoolId" = $1' : ''}
      ORDER BY e."createdAt" DESC
    `, !superAdmin && schoolId ? [schoolId] : []);

    return {
      examCount: rawExams.length,
      exams: rawExams,
      schoolIdFilter: schoolId,
      superAdmin
    };
  }
}
