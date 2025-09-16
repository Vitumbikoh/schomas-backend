import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Schedule } from './entity/schedule.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { Class } from 'src/classes/entity/class.entity';
import { getDayName } from 'src/common/utils/date-utils';
import { CreateScheduleDto, UpdateScheduleDto, WeeklyTimetableResponse, UpsertWeeklyGridDto, GridItemDto, ConflictValidationResult, ExportScheduleCsvDto } from './dtos/schedule.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
  ) {}

  // Utilities
  private toTime(value: string | Date): string {
    if (!value) return '00:00:00';
    if (value instanceof Date) {
      return value.toTimeString().slice(0, 8);
    }
    // normalize HH:mm to HH:mm:00
    return value.length === 5 ? `${value}:00` : value;
  }

  private ensureSameSchoolOrThrow(entity: { schoolId?: string | null }, schoolId?: string | null, what = 'entity') {
    if (schoolId && entity && entity.schoolId && entity.schoolId !== schoolId) {
      throw new ForbiddenException(`${what} belongs to a different school`);
    }
  }

  private async validateConflict(params: {
    schoolId: string;
    classId: string;
    teacherId: string;
    classroomId?: string;
    day: string;
    startTime: string; // HH:mm:ss
    endTime: string;   // HH:mm:ss
    excludeId?: string;
  }) {
    const { schoolId, classId, teacherId, classroomId, day, startTime, endTime, excludeId } = params;

    // time overlap predicate
    const qb = this.scheduleRepository
      .createQueryBuilder('s')
  .where('s.schoolId = :schoolId', { schoolId })
      .andWhere('s.day = :day', { day })
      .andWhere('NOT (s.endTime <= :startTime OR s.startTime >= :endTime)', { startTime, endTime });

    if (excludeId) qb.andWhere('s.id != :excludeId', { excludeId });

    // conflicts: same class, same teacher, optional room
    const [classClash, teacherClash, roomClash] = await Promise.all([
  qb.clone().andWhere('s.classId = :classId', { classId }).getOne(),
  qb.clone().andWhere('s.teacherId = :teacherId', { teacherId }).getOne(),
  classroomId ? qb.clone().andWhere('s.classroomId = :classroomId', { classroomId }).getOne() : Promise.resolve(null),
    ]);

    if (classClash) throw new BadRequestException('This class is already booked in the selected time period.');
    if (teacherClash) throw new BadRequestException('This teacher is already booked in the selected time period.');
    if (roomClash) throw new BadRequestException('This room is already booked in the selected time period.');
  }

 async create(createScheduleDto: CreateScheduleDto, schoolId?: string): Promise<Schedule> {
    if (!schoolId) throw new BadRequestException('schoolId is required');
    const referenceDate = createScheduleDto.date ? new Date(createScheduleDto.date) : new Date();
    const dayName = createScheduleDto.day || getDayName(referenceDate);
    const course = await this.courseRepository.findOne({
      where: { id: createScheduleDto.courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: createScheduleDto.teacherId },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    let classroom: Classroom | null = null;
    if (createScheduleDto.classroomId) {
      classroom = await this.classroomRepository.findOne({
        where: { id: createScheduleDto.classroomId },
      });
      if (!classroom) {
        throw new NotFoundException('Classroom not found');
      }
    }

    const classEntity = await this.classRepository.findOne({
      where: { id: createScheduleDto.classId },
    });
    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    // school scoping checks
    this.ensureSameSchoolOrThrow(course as any, schoolId, 'Course');
    this.ensureSameSchoolOrThrow(teacher as any, schoolId, 'Teacher');
    if (classroom) this.ensureSameSchoolOrThrow(classroom as any, schoolId, 'Classroom');
    this.ensureSameSchoolOrThrow(classEntity as any, schoolId, 'Class');

    // Normalize times and validate conflicts
    const startTime = this.toTime(createScheduleDto.startTime);
    const endTime = this.toTime(createScheduleDto.endTime);
    if (endTime <= startTime) throw new BadRequestException('endTime must be after startTime');
    await this.validateConflict({
      schoolId,
      classId: createScheduleDto.classId,
      teacherId: createScheduleDto.teacherId,
      classroomId: classroom?.id,
      day: dayName,
      startTime,
      endTime,
    });

    const schedule = this.scheduleRepository.create({
      class: classEntity,
      date: referenceDate,
      day: dayName,
      startTime,
      endTime,
      course,
      teacher,
      classroom: classroom ?? undefined,
      isActive: createScheduleDto.isActive ?? true,
      schoolId,
    });

    return this.scheduleRepository.save(schedule as Schedule);
  }

  async findAll(
    options: {
      skip?: number;
      take?: number;
      search?: string;
      schoolId?: string;
    } = {},
  ): Promise<{ data: Schedule[]; pagination: any }> {
    const query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('schedule.isActive = :isActive', { isActive: true });

    if (options.schoolId) {
  query.andWhere('schedule.schoolId = :schoolId', { schoolId: options.schoolId });
    }

    if (options?.search) {
      query.andWhere(
        '(course.name LIKE :search OR teacher.firstName LIKE :search OR teacher.lastName LIKE :search OR classroom.name LIKE :search OR class.name LIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    // Get the total count before applying skip/take
    const total = await query.getCount();

    if (options?.skip !== undefined) {
      query.skip(options.skip);
    }

    if (options?.take !== undefined) {
      query.take(options.take);
    }

    const schedules = await query.getMany();

    return {
      data: schedules,
      pagination: {
        totalItems: total,
        totalPages: options.take ? Math.ceil(total / options.take) : 1,
        itemsPerPage: options.take || total,
        currentPage:
          options.skip && options.take
            ? Math.floor(options.skip / options.take) + 1
            : 1,
      },
    };
  }

  async getDashboardOverview() {
    try {
      const [schedules, totalClasses, upcomingClasses] = await Promise.all([
        this.scheduleRepository.find({
          where: { isActive: true },
          relations: ['course', 'teacher', 'classroom', 'class'],
          take: 10,
          order: { createdAt: 'DESC' },
        }),
        this.scheduleRepository.count({ where: { isActive: true } }),
        this.scheduleRepository.count({
          where: {
            isActive: true,
            date: MoreThan(new Date()),
          },
        }),
      ]);

      const teacherCount = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .select('COUNT(DISTINCT schedule.teacherId)', 'count')
        .where('schedule.isActive = :isActive', { isActive: true })
        .getRawOne();

      const classroomCount = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .select('COUNT(DISTINCT schedule.classroomId)', 'count')
        .where('schedule.isActive = :isActive', { isActive: true })
        .getRawOne();

      return {
        schedules,
        stats: {
          totalClasses,
          upcomingClasses,
          teachersAssigned: parseInt(teacherCount.count) || 0,
          roomsUtilized: parseInt(classroomCount.count) || 0,
        },
        uiConfig: {
          title: 'Schedule Management',
          description: 'Manage class schedules and timetables',
          primaryColor: '#000000',
          breadcrumbs: [
            { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
            { name: 'Schedule Management', path: '' },
          ],
        },
      };
    } catch (error) {
      console.error('Error in getDashboardOverview:', error);
      throw error;
    }
  }

  async findOne(
    id: string,
    relations: string[] = ['course', 'teacher', 'classroom', 'class'],
  ): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id },
      relations,
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async update(
    id: string,
    updateScheduleDto: UpdateScheduleDto,
    schoolId?: string,
  ): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (updateScheduleDto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: updateScheduleDto.courseId },
      });
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      schedule.course = course;
    }

    if (updateScheduleDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: updateScheduleDto.teacherId },
      });
      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      schedule.teacher = teacher;
    }

    if (updateScheduleDto.classroomId) {
      const classroom = await this.classroomRepository.findOne({
        where: { id: updateScheduleDto.classroomId },
      });
      if (!classroom) {
        throw new NotFoundException('Classroom not found');
      }
      schedule.classroom = classroom;
    }

    if (updateScheduleDto.classId) {
      const classEntity = await this.classRepository.findOne({
        where: { id: updateScheduleDto.classId },
      });
      if (!classEntity) {
        throw new NotFoundException('Class not found');
      }
      schedule.class = classEntity;
    }

    // Normalize and validate time if provided
    if (updateScheduleDto.startTime) schedule.startTime = this.toTime(updateScheduleDto.startTime);
    if (updateScheduleDto.endTime) schedule.endTime = this.toTime(updateScheduleDto.endTime);
    if (schedule.endTime <= schedule.startTime) throw new BadRequestException('endTime must be after startTime');
    if (updateScheduleDto.day) schedule.day = updateScheduleDto.day;
    if (updateScheduleDto.date) schedule.date = new Date(updateScheduleDto.date);

    // Conflict validation
    await this.validateConflict({
      schoolId: schoolId || schedule.schoolId,
      classId: schedule.class?.id as string,
      teacherId: schedule.teacher?.id as string,
      classroomId: schedule.classroom?.id,
      day: schedule.day,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      excludeId: schedule.id,
    });

    return this.scheduleRepository.save(schedule);
  }

  async remove(id: string): Promise<void> {
    const result = await this.scheduleRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Schedule not found');
    }
  }

  async findByTeacher(teacherId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: { teacher: { id: teacherId }, isActive: true },
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
  }

  async findByCourse(courseId: string, schoolId?: string): Promise<Schedule[]> {
    const whereCondition: any = { course: { id: courseId }, isActive: true };
    if (schoolId) {
      whereCondition.schoolId = schoolId;
    }

    return this.scheduleRepository.find({
      where: whereCondition,
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
  }

  // Weekly timetable for a class (Mon-Fri by default)
  async getWeeklyTimetable(classId: string, schoolId: string, days: string[] = ['Monday','Tuesday','Wednesday','Thursday','Friday']): Promise<WeeklyTimetableResponse> {
    const items = await this.scheduleRepository.find({
      where: { isActive: true },
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
    // For super admin (schoolId null), don't filter by schoolId
    const filtered = items.filter(i => (i.class?.id === classId) && (!schoolId || i.schoolId === schoolId) && days.includes(i.day));
    const byDay = days.map((d) => ({
      day: d,
      items: filtered
        .filter(f => f.day === d)
        .sort((a,b) => (a.startTime < b.startTime ? -1 : 1))
        .map(f => ({
          id: f.id,
          startTime: f.startTime.slice(0,5),
          endTime: f.endTime.slice(0,5),
          course: { id: (f.course as any)?.id, name: (f.course as any)?.name },
          teacher: { id: (f.teacher as any)?.id, name: `${(f.teacher as any)?.firstName || ''} ${(f.teacher as any)?.lastName || ''}`.trim() },
          classroom: f.classroom ? { id: (f.classroom as any)?.id, name: (f.classroom as any)?.name } : null,
        }))
    }));
    return { classId, days: byDay };
  }

  // Weekly timetable for a teacher (Mon-Fri by default)
  async getWeeklyTimetableForTeacher(teacherId: string, schoolId: string, days: string[] = ['Monday','Tuesday','Wednesday','Thursday','Friday']): Promise<any> {
    const items = await this.scheduleRepository.find({
      where: { isActive: true },
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
    // For super admin (schoolId null), don't filter by schoolId
    const filtered = items.filter(i => (i.teacher?.id === teacherId) && (!schoolId || i.schoolId === schoolId) && days.includes(i.day));
    const byDay = days.map((d) => ({
      day: d,
      items: filtered
        .filter(f => f.day === d)
        .sort((a,b) => (a.startTime < b.startTime ? -1 : 1))
        .map(f => ({
          id: f.id,
          startTime: f.startTime.slice(0,5),
          endTime: f.endTime.slice(0,5),
          course: { id: (f.course as any)?.id, name: (f.course as any)?.name },
          teacher: { id: (f.teacher as any)?.id, name: `${(f.teacher as any)?.firstName || ''} ${(f.teacher as any)?.lastName || ''}`.trim() },
          classroom: f.classroom ? { id: (f.classroom as any)?.id, name: (f.classroom as any)?.name } : null,
          class: { id: (f.class as any)?.id, name: (f.class as any)?.name },
        }))
    }));
    return { teacherId, days: byDay };
  }

  // Clone schedules from one class to another within the same school
  async cloneClassSchedule(fromClassId: string, toClassId: string, schoolId: string, overwrite = false) {
    if (fromClassId === toClassId) throw new BadRequestException('Cannot clone to the same class');
    const [fromItems, toItems] = await Promise.all([
      this.scheduleRepository.find({ where: { isActive: true }, relations: ['class'] }),
      this.scheduleRepository.find({ where: { isActive: true }, relations: ['class'] }),
    ]);
    const source = fromItems.filter(i => i.class?.id === fromClassId && i.schoolId === schoolId);
    const existing = toItems.filter(i => i.class?.id === toClassId && i.schoolId === schoolId);
    if (overwrite && existing.length) {
      await this.scheduleRepository.remove(existing);
    }
    for (const s of source) {
      await this.validateConflict({
        schoolId,
        classId: toClassId,
        teacherId: (s.teacher as any)?.id,
        classroomId: s.classroom ? (s.classroom as any)?.id : undefined,
        day: s.day,
        startTime: s.startTime,
        endTime: s.endTime,
      });
      await this.scheduleRepository.save({
        day: s.day,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        course: s.course,
        teacher: s.teacher,
        classroom: s.classroom ?? undefined,
        class: { id: toClassId } as any,
        isActive: true,
        schoolId,
      } as any);
    }
    return { cloned: source.length };
  }

  // Enhanced Weekly Grid Management
  async upsertWeeklyGrid(dto: UpsertWeeklyGridDto, schoolId: string) {
    const { classId, schedules, replaceAll = false } = dto;
    
    // Validate class exists and belongs to school
    const classEntity = await this.classRepository.findOne({
      where: { id: classId }
    });
    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }
    this.ensureSameSchoolOrThrow(classEntity as any, schoolId, 'Class');

    // Get existing schedules for this class
    const existingSchedules = await this.scheduleRepository.find({
      where: { 
        schoolId,
        isActive: true
      },
      relations: ['class', 'course', 'teacher', 'classroom']
    });
    const classSchedules = existingSchedules.filter(s => s.class?.id === classId);

    // Validate all items first for conflicts
    const validationResults: ConflictValidationResult[] = [];
    for (const item of schedules) {
      const result = await this.validateGridItemConflicts(item, classId, schoolId, item.id);
      validationResults.push(result);
    }

    // Check for any validation errors
    const hasErrors = validationResults.some(r => !r.isValid);
    if (hasErrors) {
      throw new BadRequestException({
        message: 'Schedule conflicts detected',
        conflicts: validationResults.filter(r => !r.isValid)
      });
    }

    // If replaceAll, mark existing schedules for deletion
    const toDelete = replaceAll 
      ? classSchedules.filter(existing => !schedules.find(item => item.id === existing.id))
      : [];

    // Process each schedule item
    const results = {
      created: 0,
      updated: 0,
      deleted: toDelete.length,
      errors: [] as Array<{ item: GridItemDto; error: string }>
    };

    // Delete schedules if replaceAll
    if (toDelete.length > 0) {
      await this.scheduleRepository.remove(toDelete);
    }

    // Upsert schedule items
    for (const item of schedules) {
      try {
        if (item.id) {
          // Update existing
          await this.updateGridItem(item, schoolId);
          results.updated++;
        } else {
          // Create new
          await this.createGridItem(item, classId, schoolId);
          results.created++;
        }
      } catch (error) {
        results.errors.push({ 
          item, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return results;
  }

  private async validateGridItemConflicts(
    item: GridItemDto, 
    classId: string, 
    schoolId: string, 
    excludeId?: string
  ): Promise<ConflictValidationResult> {
    const conflicts: ConflictValidationResult['conflicts'] = [];
    
    const startTime = this.toTime(item.startTime);
    const endTime = this.toTime(item.endTime);
    
    if (endTime <= startTime) {
      conflicts.push({
        type: 'class',
        message: 'End time must be after start time',
        existingSchedule: {
          id: '',
          day: item.day,
          startTime: item.startTime,
          endTime: item.endTime
        }
      });
      return { isValid: false, conflicts };
    }

    // Find overlapping schedules
    const queryBuilder = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.class', 'class')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .where('schedule.schoolId = :schoolId', { schoolId })
      .andWhere('schedule.day = :day', { day: item.day })
      .andWhere('schedule.isActive = true')
      .andWhere(`
        (schedule.startTime < :endTime AND schedule.endTime > :startTime)
      `, { startTime, endTime });

    // Only exclude if excludeId is a valid UUID (not a temp id)
    if (excludeId && !excludeId.startsWith('temp-')) {
      queryBuilder.andWhere('schedule.id != :excludeId', { excludeId });
    }

    const overlappingSchedules = await queryBuilder.getMany();

    // Check teacher conflicts
    const teacherConflicts = overlappingSchedules.filter(s => s.teacher?.id === item.teacherId);
    for (const conflict of teacherConflicts) {
      conflicts.push({
        type: 'teacher',
        message: `Teacher is already scheduled at this time in class ${conflict.class?.name || 'Unknown'}`,
        existingSchedule: {
          id: conflict.id,
          day: conflict.day,
          startTime: conflict.startTime.slice(0, 5),
          endTime: conflict.endTime.slice(0, 5),
          className: conflict.class?.name,
          teacherName: `${(conflict.teacher as any)?.firstName || ''} ${(conflict.teacher as any)?.lastName || ''}`.trim()
        }
      });
    }

    // Check class conflicts (same class, overlapping time)
    const classConflicts = overlappingSchedules.filter(s => s.class?.id === classId);
    for (const conflict of classConflicts) {
      conflicts.push({
        type: 'class',
        message: `Class already has a schedule at this time`,
        existingSchedule: {
          id: conflict.id,
          day: conflict.day,
          startTime: conflict.startTime.slice(0, 5),
          endTime: conflict.endTime.slice(0, 5),
          className: conflict.class?.name
        }
      });
    }

    // Check room conflicts if room specified
    if (item.classroomId) {
      const roomConflicts = overlappingSchedules.filter(s => s.classroom?.id === item.classroomId);
      for (const conflict of roomConflicts) {
        conflicts.push({
          type: 'room',
          message: `Room is already booked at this time by class ${conflict.class?.name || 'Unknown'}`,
          existingSchedule: {
            id: conflict.id,
            day: conflict.day,
            startTime: conflict.startTime.slice(0, 5),
            endTime: conflict.endTime.slice(0, 5),
            className: conflict.class?.name,
            roomName: conflict.classroom?.name
          }
        });
      }
    }

    return {
      isValid: conflicts.length === 0,
      conflicts
    };
  }

  private async createGridItem(item: GridItemDto, classId: string, schoolId: string): Promise<Schedule> {
    const createDto: CreateScheduleDto = {
      classId,
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      courseId: item.courseId,
      teacherId: item.teacherId,
      classroomId: item.classroomId,
      isActive: item.isActive ?? true
    };
    
    return this.create(createDto, schoolId);
  }

  private async updateGridItem(item: GridItemDto, schoolId: string): Promise<Schedule> {
    if (!item.id) {
      throw new BadRequestException('Schedule ID is required for updates');
    }

    const updateDto: UpdateScheduleDto = {
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      courseId: item.courseId,
      teacherId: item.teacherId,
      classroomId: item.classroomId,
      isActive: item.isActive
    };

    return this.update(item.id, updateDto, schoolId);
  }

  // Export schedule as CSV
  async exportScheduleCSV(dto: ExportScheduleCsvDto, schoolId: string): Promise<string> {
    let query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.class', 'class')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .where('schedule.schoolId = :schoolId', { schoolId })
      .andWhere('schedule.isActive = true');

    if (dto.classId) {
      query = query.andWhere('class.id = :classId', { classId: dto.classId });
    }

    if (dto.teacherId) {
      query = query.andWhere('teacher.id = :teacherId', { teacherId: dto.teacherId });
    }

    if (dto.days && dto.days.length > 0) {
      query = query.andWhere('schedule.day IN (:...days)', { days: dto.days });
    }

    const schedules = await query
      .orderBy('schedule.day')
      .addOrderBy('schedule.startTime')
      .getMany();

    // Build CSV content
    const headers = ['Class', 'Day', 'Start Time', 'End Time', 'Course', 'Teacher', 'Room'];
    const rows = schedules.map(s => [
      s.class?.name || '',
      s.day,
      s.startTime.slice(0, 5),
      s.endTime.slice(0, 5),
      (s.course as any)?.name || '',
      `${(s.teacher as any)?.firstName || ''} ${(s.teacher as any)?.lastName || ''}`.trim(),
      s.classroom?.name || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  }

  // Parse an uploaded buffer for CSV/XLSX schedule entries
  async bulkImport(buffer: Buffer, schoolId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const results: { row: number; status: 'imported' | 'error'; message?: string }[] = [];
    let imported = 0;
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      try {
        const dto: CreateScheduleDto = {
          classId: r.classId,
          date: r.date,
          day: r.day,
          startTime: r.startTime,
          endTime: r.endTime,
          courseId: r.courseId,
          teacherId: r.teacherId,
          classroomId: r.classroomId || undefined,
          isActive: r.isActive !== 'false',
        };
        await this.create(dto, schoolId);
        imported++;
        results.push({ row: idx + 2, status: 'imported' });
      } catch (e: any) {
        results.push({ row: idx + 2, status: 'error', message: e.message });
      }
    }
    return { imported, total: rows.length, results };
  }
}