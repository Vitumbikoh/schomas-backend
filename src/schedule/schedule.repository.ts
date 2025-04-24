import { EntityRepository, Repository } from 'typeorm';
import { Schedule } from './entity/schedule.entity';

@EntityRepository(Schedule)
export class ScheduleRepository extends Repository<Schedule> {
  // Custom repository methods can be added here
  // For example:
  async findConflictingSchedules(
    classroomId: string,
    day: string,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<Schedule[]> {
    const query = this.createQueryBuilder('schedule')
      .where('schedule.classroom_id = :classroomId', { classroomId })
      .andWhere('schedule.day = :day', { day })
      .andWhere(
        '(:startTime BETWEEN schedule.start_time AND schedule.end_time OR :endTime BETWEEN schedule.start_time AND schedule.end_time)',
        { startTime, endTime },
      );

    if (excludeId) {
      query.andWhere('schedule.id != :excludeId', { excludeId });
    }

    return query.getMany();
  }
}