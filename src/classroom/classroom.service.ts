import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Classroom } from './entity/classroom.entity';
import { Schedule } from 'src/schedule/entity/schedule.entity';
import { ClassroomResponseDto, CreateClassroomDto, UpdateClassroomDto } from './dtos/classroom.dto';


@Injectable()
export class ClassroomService {
  constructor(
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  private toResponseDto(classroom: Classroom): ClassroomResponseDto {
    return {
      id: classroom.id,
      name: classroom.name,
      code: classroom.code,
      capacity: classroom.capacity,
      building: classroom.building,
      floor: classroom.floor,
      isActive: classroom.isActive,
      description: classroom.description,
      amenities: classroom.amenities,
      createdAt: classroom.createdAt,
      updatedAt: classroom.updatedAt,
    };
  }

  async create(createClassroomDto: CreateClassroomDto): Promise<ClassroomResponseDto> {
    const classroom = this.classroomRepository.create({
      ...createClassroomDto,
      isActive: createClassroomDto.isActive ?? true,
    });

    const savedClassroom = await this.classroomRepository.save(classroom);
    return this.toResponseDto(savedClassroom);
  }

  async findAll(filters?: {
    isActive?: boolean;
    building?: string;
  }): Promise<ClassroomResponseDto[]> {
    const query = this.classroomRepository.createQueryBuilder('classroom');

    if (filters?.isActive !== undefined) {
      query.andWhere('classroom.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters?.building) {
      query.andWhere('classroom.building = :building', { building: filters.building });
    }

    const classrooms = await query.getMany();
    return classrooms.map(this.toResponseDto);
  }

  async findOne(id: string): Promise<ClassroomResponseDto> {
    const classroom = await this.classroomRepository.findOne({ where: { id } });

    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    return this.toResponseDto(classroom);
  }

  async update(
    id: string,
    updateClassroomDto: UpdateClassroomDto,
  ): Promise<ClassroomResponseDto> {
    const classroom = await this.classroomRepository.findOne({ where: { id } });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    Object.assign(classroom, updateClassroomDto);
    const updatedClassroom = await this.classroomRepository.save(classroom);
    return this.toResponseDto(updatedClassroom);
  }

  async remove(id: string): Promise<void> {
    const result = await this.classroomRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Classroom not found');
    }
  }

  async findByBuilding(buildingName: string): Promise<ClassroomResponseDto[]> {
    const classrooms = await this.classroomRepository.find({
      where: { building: buildingName, isActive: true },
    });
    return classrooms.map(this.toResponseDto);
  }

  async findAvailable(date: string, time: string): Promise<ClassroomResponseDto[]> {
    // Get all active classrooms
    const allClassrooms = await this.classroomRepository.find({
      where: { isActive: true },
    });

    // Get classrooms that have schedules at the given date/time
    const day = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    const occupiedClassrooms = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .select('schedule.classroom_id', 'classroomId')
      .where('schedule.day = :day', { day })
      .andWhere('schedule.isActive = true')
      .andWhere(':time BETWEEN schedule.start_time AND schedule.end_time', { time })
      .getRawMany();

    const occupiedClassroomIds = occupiedClassrooms.map((oc) => oc.classroomId);

    // Filter out occupied classrooms
    const availableClassrooms = allClassrooms.filter(
      (classroom) => !occupiedClassroomIds.includes(classroom.id),
    );

    return availableClassrooms.map(this.toResponseDto);
  }
}