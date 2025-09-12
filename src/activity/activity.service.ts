import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Log } from 'src/logs/logs.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Log)
    private readonly activityRepository: Repository<Log>,
  ) {}

  async getRecentActivities(limit: number = 10, schoolId?: string): Promise<Log[]> {
    // Define patterns for actions that should be excluded (read/query operations)
    const excludePatterns = [
      'QUERY', 'QUERIED', 'REQUEST', 'RESPONSE', 'LIST', 'FIND', 'GET', 
      'ACCESS', 'ACCESSED', 'VIEW', 'VIEWED', 'STATS', 'DEBUG', 'FALLBACK'
    ];

    // Build the query to exclude read/query operations
    const queryBuilder = this.activityRepository.createQueryBuilder('log')
      .orderBy('log.timestamp', 'DESC')
      .take(limit * 2); // Take more initially to account for filtering

    // Add school filtering for multi-tenancy
    if (schoolId) {
      queryBuilder.where('log.schoolId = :schoolId', { schoolId });
    }

    // Add WHERE conditions to exclude read operations
    excludePatterns.forEach((pattern, index) => {
      const whereMethod = (index === 0 && !schoolId) ? 'where' : 'andWhere';
      queryBuilder[whereMethod](`log.action NOT LIKE :pattern${index}`, { [`pattern${index}`]: `%${pattern}%` });
    });

    const logs = await queryBuilder.getMany();

    // Take only the requested limit after filtering
    const filteredLogs = logs.slice(0, limit);

    return filteredLogs;
  }
}