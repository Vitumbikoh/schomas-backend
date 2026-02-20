import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Log } from 'src/logs/logs.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Log)
    private readonly activityRepository: Repository<Log>,
  ) {}

  private applySchoolScope(
    qb: SelectQueryBuilder<Log>,
    schoolId?: string,
    superAdmin = false,
  ): SelectQueryBuilder<Log> {
    if (!superAdmin) {
      if (!schoolId) {
        qb.andWhere('1 = 0');
        return qb;
      }
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
      return qb;
    }

    if (schoolId) {
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
    }
    return qb;
  }

  private applyCrudFilter(qb: SelectQueryBuilder<Log>): SelectQueryBuilder<Log> {
    return qb.andWhere(
      `(log.action IN (:...baseCrudActions)
      OR log.action LIKE :createdPattern
      OR log.action LIKE :updatedPattern
      OR log.action LIKE :deletedPattern
      OR log.action LIKE :removedPattern)`,
      {
        baseCrudActions: ['CREATE', 'UPDATE', 'DELETE'],
        createdPattern: '%_CREATED',
        updatedPattern: '%_UPDATED',
        deletedPattern: '%_DELETED',
        removedPattern: '%_REMOVED',
      },
    );
  }

  async getRecentActivities(
    limit = 10,
    schoolId?: string,
    superAdmin = false,
  ): Promise<Log[]> {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 100) : 10;

    const queryBuilder = this.activityRepository.createQueryBuilder('log');
    this.applySchoolScope(queryBuilder, schoolId, superAdmin);
    this.applyCrudFilter(queryBuilder);

    return queryBuilder
      .orderBy('log.timestamp', 'DESC')
      .take(safeLimit)
      .getMany();
  }

  async getActivityById(id: string, schoolId?: string, superAdmin = false): Promise<Log | null> {
    const qb = this.activityRepository
      .createQueryBuilder('log')
      .where('log.id = :id', { id });

    this.applySchoolScope(qb, schoolId, superAdmin);

    return qb.getOne();
  }
}
