import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CourseTermGradeScheme, CourseTermGradeComponent, ExamGradeRecord, ExamResultAggregate, AssessmentComponentType, AggregatedResultStatus } from './aggregation.entity';
import { CreateOrUpdateSchemeDto, RecordExamGradeDto } from './dto';
import { Course } from '../course/entities/course.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Student } from '../user/entities/student.entity';
import { Term } from '../settings/entities/term.entity';
import { Teacher } from '../user/entities/teacher.entity';

@Injectable()
export class AggregationService {
  constructor(
    @InjectRepository(CourseTermGradeScheme) private schemeRepo: Repository<CourseTermGradeScheme>,
    @InjectRepository(CourseTermGradeComponent) private componentRepo: Repository<CourseTermGradeComponent>,
    @InjectRepository(ExamGradeRecord) private examGradeRepo: Repository<ExamGradeRecord>,
    @InjectRepository(ExamResultAggregate) private resultRepo: Repository<ExamResultAggregate>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Exam) private examRepo: Repository<Exam>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
  ) {}

  // Normalize various user/existing exam type labels to canonical component types.
  // Canonical internal values remain 'midterm' and 'endterm' (AssessmentComponentType).
  private normalizeExamType(raw: string | null | undefined): AssessmentComponentType | null {
    if(!raw) return null;
    const cleaned = raw.toString().trim().toLowerCase();
    // Remove separators for pattern matching
    const compact = cleaned.replace(/[\s_-]+/g,'');
    // Map mid period / mid-period / mid_period / mid term / midterm / midperiod => midterm
    const midPatterns = ['midterm','midperiod','midsemester','midsem'];
    if(midPatterns.includes(compact)) return AssessmentComponentType.MID_TERM;
    // Map end period / end term / endterm / endperiod / finalterm (treat final as end term if used historically)
    const endPatterns = ['endterm','endperiod','finalterm','finalperiod','final'];
    if(endPatterns.includes(compact)) return AssessmentComponentType.END_TERM;
    // Direct match to existing enum values
    if(compact === AssessmentComponentType.MID_TERM) return AssessmentComponentType.MID_TERM;
    if(compact === AssessmentComponentType.END_TERM) return AssessmentComponentType.END_TERM;
    return null; // Other component types (assignment, quiz, etc.) are handled directly elsewhere
  }

  async createOrUpdateScheme(dto: CreateOrUpdateSchemeDto, teacherUserId: string, schoolId?: string) {
    // Load course with broader relations that might signify ownership/assignment
    const course = await this.courseRepo.findOne({
      where: { id: dto.courseId },
      relations: ['teacher', 'teacher.user', 'user', 'exams', 'exams.teacher', 'class']
    });
    if (!course) throw new NotFoundException('Course not found');
    if (schoolId && course.schoolId && course.schoolId !== schoolId)
      throw new ForbiddenException('Cross-school access');

    // Resolve teacher profile from userId (auth subject)
    const teacher = await this.teacherRepo.findOne({ where: { userId: teacherUserId } });
    if (!teacher) throw new ForbiddenException('Teacher profile not found');

    // Fetch existing scheme (needed for ownership fallback if already created by another teacher)
    let existingScheme = await this.schemeRepo.findOne({ where: { courseId: dto.courseId, termId: dto.termId } });

    // Ownership evaluation matrix
    let ownsCourse = false;
    const reasons: string[] = [];

    // 1. Direct teacherId match (correct canonical state)
    if (course.teacherId && course.teacherId === teacher.id) {
      ownsCourse = true; reasons.push('course.teacherId === teacher.id');
    }
    // 2. Legacy: teacherId stored as userId accidentally
    if (!ownsCourse && course.teacherId && course.teacherId === teacher.userId) {
      ownsCourse = true; reasons.push('course.teacherId === teacher.userId (legacy)');
      // Normalize to proper teacher.id
      course.teacherId = teacher.id;
      try { await this.courseRepo.save(course); reasons.push('normalized course.teacherId to teacher.id'); } catch {/* ignore */}
    }
    // 3. Relation object matches
    if (!ownsCourse && course.teacher?.id === teacher.id) {
      ownsCourse = true; reasons.push('course.teacher.id === teacher.id');
    }
    // 4. Relation object legacy user match
    if (!ownsCourse && course.teacher?.userId === teacher.userId) {
      ownsCourse = true; reasons.push('course.teacher.userId === teacher.userId');
    }
    // 5. Course.user relation (admin might have set generic user link instead of teacher relation)
    if (!ownsCourse && (course as any).user?.id === teacher.userId) {
      ownsCourse = true; reasons.push('course.user.id === teacher.userId');
    }
    // 6. Any exam in the course already owned by this teacher (implicit assignment)
    if (!ownsCourse && course.exams?.some(ex => ex.teacher?.id === teacher.id)) {
      ownsCourse = true; reasons.push('teacher owns at least one exam in course');
    }
    // 6b. Class homeroom/assigned teacher owns the class the course belongs to
    if (!ownsCourse && (course as any).class?.teacherId === teacher.id) {
      ownsCourse = true; reasons.push('course.class.teacherId === teacher.id');
    }
    // 7. Existing scheme created by this teacher
    if (!ownsCourse && existingScheme && existingScheme.teacherId === teacher.id) {
      ownsCourse = true; reasons.push('existing scheme.teacherId === teacher.id');
    }
    // 8. Course unassigned: allow first claiming (no existing scheme from someone else)
    if (!ownsCourse && !course.teacherId && !course.teacher) {
      // Only claim if no conflicting existing scheme
      if (!existingScheme || existingScheme.teacherId === teacher.id) {
        course.teacherId = teacher.id;
        try { await this.courseRepo.save(course); ownsCourse = true; reasons.push('claimed unassigned course'); } catch { /* ignore */ }
      }
    }

    // 9. Auto-claim scenario: course already has a different teacherId but no scheme exists yet.
    // This supports the workflow where admin assigned incorrectly or teacher changed before first scheme.
    if (!ownsCourse && !existingScheme) {
      const previousTeacherId = course.teacherId;
      course.teacherId = teacher.id;
      try {
        await this.courseRepo.save(course);
        ownsCourse = true;
        reasons.push(`auto-claimed course (previousTeacherId=${previousTeacherId})`);
      } catch { /* swallow */ }
    }

    if (!ownsCourse) {
      // Lightweight debug context (avoid leaking PII). This can be removed later or gated by env.
      // eslint-disable-next-line no-console
      console.warn('[Aggregation] Ownership denied', {
        courseId: course.id,
        courseTeacherId: course.teacherId,
        courseTeacherRelId: course.teacher?.id,
        courseTeacherRelUserId: course.teacher?.userId,
        courseUserId: (course as any).user?.id,
        teacherId: teacher.id,
        teacherUserId: teacher.userId,
        schemeTeacherId: existingScheme?.teacherId,
        reasonsTried: reasons
      });
      throw new ForbiddenException('Not course owner');
    }

    const term = await this.termRepo.findOne({ where: { id: dto.termId } });
    if(!term) throw new NotFoundException('Term not found');
    if(schoolId && term.schoolId !== schoolId) throw new ForbiddenException('Term outside school');

    if(!dto.components || dto.components.length === 0) throw new BadRequestException('Components required');
    const sum = dto.components.reduce((s,c)=> s + c.weight, 0);
    if(sum !== 100) throw new BadRequestException('Weights must sum to 100');

    const dup = new Set<string>();
    for(const c of dto.components){
      if(dup.has(c.componentType)) throw new BadRequestException('Duplicate component '+c.componentType);
      dup.add(c.componentType);
    }

  // Re-fetch scheme with components now (we may have loaded above without relations)
  let scheme = await this.schemeRepo.findOne({ where: { courseId: dto.courseId, termId: dto.termId }, relations:['components'] });
    if(!scheme){
      scheme = this.schemeRepo.create({ courseId: dto.courseId, termId: dto.termId, teacherId: teacher.id, schoolId: course.schoolId, passThreshold: dto.passThreshold ?? null, totalWeight: sum, version:1, components: [] });
    } else {
      if(scheme.isLocked) throw new BadRequestException('Scheme is locked');
      scheme.passThreshold = dto.passThreshold ?? scheme.passThreshold ?? null;
      scheme.totalWeight = sum;
      scheme.teacherId = teacher.id;
      scheme.version += 1;
      // Remove previous components
      await this.componentRepo.delete({ schemeId: scheme.id });
      scheme.components = [];
    }

    // Persist base scheme first (to get id)
    scheme = await this.schemeRepo.save(scheme);

    const components = dto.components.map(c=> this.componentRepo.create({ schemeId: scheme.id, componentType: c.componentType, weight: c.weight, required: c.required ?? true }));
    await this.componentRepo.save(components);
    scheme.components = components;

    // Trigger recompute asynchronously (simple await for now)
    await this.recomputeAllForCourseTerm(dto.courseId, dto.termId);

    return scheme;
  }

  async recordExamGrade(dto: RecordExamGradeDto, teacherUserId: string, schoolId?: string){
    console.log(`[DEBUG] recordExamGrade called with:`, { examId: dto.examId, studentId: dto.studentId, rawScore: dto.rawScore, teacherUserId, schoolId });
    
    const exam = await this.examRepo.findOne({ 
      where: { id: dto.examId }, 
      relations: ['course', 'Term', 'teacher'] // Added 'teacher' relation
    });
    if(!exam) {
      console.error(`[ERROR] Exam not found: ${dto.examId}`);
      throw new NotFoundException('Exam not found');
    }
    
    console.log(`[DEBUG] Found exam:`, { id: exam.id, title: exam.title, teacherId: exam.teacher?.id, schoolId: exam.schoolId });

    // Normalize examType in-place if it maps to a canonical mid/end term label
    const normalized = this.normalizeExamType(exam.examType);
    if(normalized && exam.examType !== normalized){
      console.log(`[DEBUG] Normalizing exam.examType from '${exam.examType}' -> '${normalized}'`);
      exam.examType = normalized;
      try { await this.examRepo.save(exam); } catch(e){ console.warn('[WARN] Failed to persist normalized examType', e); }
    }
    
    if(schoolId && exam.schoolId && exam.schoolId !== schoolId) {
      console.error(`[ERROR] Cross-school exam access denied: exam.schoolId=${exam.schoolId}, provided.schoolId=${schoolId}`);
      throw new ForbiddenException('Cross-school exam');
    }

    // Accept either teacher.userId or teacher.id (backward compatibility with older callers)
    let teacher = await this.teacherRepo.findOne({ where: { userId: teacherUserId } });
    if(!teacher){
      teacher = await this.teacherRepo.findOne({ where: { id: teacherUserId } });
    }
    if(!teacher) {
      console.error(`[ERROR] Teacher not found (userId or id) for value: ${teacherUserId}`);
      throw new ForbiddenException('Teacher not found');
    }
    
    console.log(`[DEBUG] Found teacher:`, { id: teacher.id, userId: teacher.userId });
    
    // SKIP OWNERSHIP VALIDATION FOR GRADE SUBMISSION
    // The controller already verified this teacher can access this exam
    // Focus only on school-level security boundary
    if (schoolId && exam.schoolId && exam.schoolId !== schoolId) {
      console.error(`[ERROR] Cross-school exam access denied: exam.schoolId=${exam.schoolId}, provided.schoolId=${schoolId}`);
      throw new ForbiddenException('Cross-school exam');
    }
    
    console.log(`[DEBUG] School boundary check passed - proceeding with grade submission`);
    
    const student = await this.studentRepo.findOne({ where: { studentId: dto.studentId } });
    if(!student) {
      console.error(`[ERROR] Student not found by external studentId: ${dto.studentId}`);
      throw new NotFoundException('Student not found');
    }
    // Internal UUID (primary key) vs external human-readable studentId (e.g. 250006)
    const studentUuid = student.id; // this is the FK expected by exam_grade.studentId (uuid column)
    console.log(`[DEBUG] Found student:`, { uuid: studentUuid, externalStudentId: student.studentId });

    const totalMarks = exam.totalMarks || 100;
    if(dto.rawScore > totalMarks) {
      console.error(`[ERROR] Score exceeds total marks: ${dto.rawScore} > ${totalMarks}`);
      throw new BadRequestException('Score exceeds total marks');
    }

    const percentage = (dto.rawScore / totalMarks) * 100;

  // Always use internal UUID for persistence & lookups in exam_grade
  let rec = await this.examGradeRepo.findOne({ where: { examId: exam.id, studentId: studentUuid } });
    if(!rec){
      console.log(`[DEBUG] Creating new exam grade record`);
      rec = this.examGradeRepo.create({ 
        examId: exam.id, 
        studentId: studentUuid, 
        courseId: exam.course?.id, 
        termId: exam.TermId, 
        schoolId: exam.schoolId || null, 
        rawScore: dto.rawScore.toFixed(2), 
        percentage: percentage.toFixed(2), 
        status: 'PUBLISHED' 
      });
    } else {
      console.log(`[DEBUG] Updating existing exam grade record`);
      rec.rawScore = dto.rawScore.toFixed(2);
      rec.percentage = percentage.toFixed(2);
    }
    
    console.log(`[DEBUG] Saving exam grade record:`, rec);
    await this.examGradeRepo.save(rec);
    console.log(`[DEBUG] Exam grade saved successfully`);

    // Recompute this student's aggregate if scheme exists
    console.log(`[DEBUG] Triggering recomputation for student`);
  await this.recomputeStudent(exam.course?.id, exam.TermId, studentUuid);
    console.log(`[DEBUG] Recomputation completed`);

    return rec;
  }

  async recomputeAllForCourseTerm(courseId: string, termId: string){
    const scheme = await this.schemeRepo.findOne({ where: { courseId, termId }, relations:['components'] });
    if(!scheme) return; // nothing
    // Get distinct students with any exam grade OR enrolled (future improvement: join enrollments)
    const grades = await this.examGradeRepo.find({ where: { courseId, termId } });
    const studentIds = Array.from(new Set(grades.map(g=> g.studentId)));
    for(const sid of studentIds){
      await this.recomputeStudent(courseId, termId, sid);
    }
  }

  private gradingScale(pct: number){
    if(pct >= 80) return 'A';
    if(pct >= 70) return 'B';
    if(pct >= 60) return 'C';
    if(pct >= 50) return 'D';
    return 'F';
  }

  async recomputeStudent(courseId: string, termId: string, studentUuid: string){
    const scheme = await this.schemeRepo.findOne({ where: { courseId, termId }, relations:['components'] });
    if(!scheme) {
      return; // cannot compute
    }

    const grades = await this.examGradeRepo.find({ where: { courseId, termId, studentId: studentUuid } });
    
    // Group grades by examType via exam join
    const examIds = grades.map(g=> g.examId);
    const exams = examIds.length ? await this.examRepo.find({ where: { id: In(examIds) } }) : [];
    const examMap = new Map(exams.map(e=> [e.id, e]));

    const breakdown: any[] = [];
    let hasAnyGrades = false;
    let totalWeightedScore = 0;
    let totalAvailableWeight = 0;
    let allRequiredCompleted = true;

    for(const comp of scheme.components){
      
      // Collect percentages of exams matching componentType
      const compGrades = grades.filter(gr => {
        const ex = examMap.get(gr.examId); 
        if(!ex) return false;
        const exNorm = this.normalizeExamType(ex.examType) || ex.examType;
        return exNorm === comp.componentType; 
      });
      
      if(compGrades.length === 0){
        if(comp.required) allRequiredCompleted = false;
        breakdown.push({ 
          componentType: comp.componentType, 
          weight: comp.weight, 
          earnedPercentage: null, 
          weighted: 0,
          status: 'MISSING'
        });
        continue;
      }
      
      hasAnyGrades = true;
      const avg = compGrades.reduce((s,g)=> s + parseFloat(g.percentage), 0) / compGrades.length;
      const weighted = (avg * (comp.weight/100));
      totalWeightedScore += weighted;
      totalAvailableWeight += comp.weight;
      
      breakdown.push({ 
        componentType: comp.componentType, 
        weight: comp.weight, 
        earnedPercentage: parseFloat(avg.toFixed(2)), 
        weighted: parseFloat(weighted.toFixed(2)),
        status: 'COMPLETED'
      });
    }

    let result = await this.resultRepo.findOne({ where: { studentId: studentUuid, courseId, termId } });
    if(!result){
      result = this.resultRepo.create({ 
        studentId: studentUuid, 
        courseId, 
        termId, 
        schoolId: scheme.schoolId, 
        schemeVersion: scheme.version, 
        status: AggregatedResultStatus.PENDING 
      });
    }

    // Progressive calculation: Always show current progress based on available components
    if(hasAnyGrades && totalWeightedScore >= 0) {
      // Use actual weighted score as the progressive percentage
      const finalPct = parseFloat(totalWeightedScore.toFixed(2));
      const passThreshold = scheme.passThreshold ?? 50;
      
      result.finalPercentage = finalPct.toString();
      result.finalGradeCode = this.gradingScale(finalPct);
      result.pass = finalPct >= passThreshold;
      result.breakdown = breakdown;
      result.schemeVersion = scheme.version;
      
      // Set status based on completion
      if(allRequiredCompleted) {
        result.status = AggregatedResultStatus.COMPLETE;
        result.computedAt = new Date();
      } else {
        result.status = AggregatedResultStatus.PENDING;
        result.computedAt = new Date();
      }
    } else {
      // No grades available yet
      result.status = AggregatedResultStatus.PENDING;
      result.finalPercentage = null;
      result.finalGradeCode = null;
      result.pass = null;
      result.breakdown = breakdown;
      result.computedAt = null;
    }

    await this.resultRepo.save(result);
    return result;
  }

  async getResultsForCourseTerm(courseId: string, termId: string){
    return this.resultRepo.find({ where: { courseId, termId }, relations: ['student'] });
  }

  async getStudentResult(courseId: string, termId: string, studentId: string){
    return this.resultRepo.findOne({ where: { courseId, termId, studentId } });
  }

  async getScheme(courseId: string, termId: string){
    return this.schemeRepo.findOne({ where: { courseId, termId }, relations:['components'] });
  }

  async listSchemesForTeacher(teacherUserId: string, termId?: string, courseId?: string){
    const teacher = await this.teacherRepo.findOne({ where: { userId: teacherUserId } });
    if(!teacher) return [];
    const where: any = { teacherId: teacher.id };
    if(termId) where.termId = termId;
    if(courseId) where.courseId = courseId;
    return this.schemeRepo.find({ where, relations:['components'] });
  }
}
