import { EntityRepository, Repository } from 'typeorm';
import { Classroom } from './entity/classroom.entity';

@EntityRepository(Classroom)
export class ClassroomRepository extends Repository<Classroom> {
  async findByName(name: string): Promise<Classroom | undefined> {
    const result = await this.findOne({ where: { name } });
    return result ?? undefined;
  }

  async findByCode(code: string): Promise<Classroom | undefined> {
    const result = await this.findOne({ where: { code } });
    return result ?? undefined;
  }

  async searchByName(name: string): Promise<Classroom[]> {
    return this.createQueryBuilder('classroom')
      .where('LOWER(classroom.name) LIKE LOWER(:name)', { name: `%${name}%` })
      .getMany();
  }
}