import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Log } from 'src/logs/logs.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ActivitiesService {Log
  constructor(
    @InjectRepository(Log)
    private readonly activityRepository: Repository<Log>,
  ) {}

  async getRecentActivities(limit: number = 10): Promise<Log[]> {
  const logs = await this.activityRepository.find({
    order: { timestamp: 'DESC' },
    take: limit,
  });

  return logs.map(log => ({
    ...log,
    // Transform action values if needed
    action: log.action.toLowerCase().replace('_', ' '),
  }));
}
}