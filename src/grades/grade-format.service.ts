import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { GradeFormat } from './entity/grade-format.entity';
import { CreateGradeFormatDto, UpdateGradeFormatDto, InitializeGradeFormatsDto } from './dtos/grade-format.dto';
import { Role } from 'src/user/enums/role.enum';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class GradeFormatService {
  constructor(
    @InjectRepository(GradeFormat) private readonly formatRepo: Repository<GradeFormat>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async getFormatsForSchool(schoolId?: string | null) {
    // School-specific first (only if provided)
    let formats: GradeFormat[] = [];
    if (schoolId) {
      formats = await this.formatRepo.find({ where: { schoolId }, order: { minPercentage: 'DESC' } });
    }
    if (formats.length === 0) {
      formats = await this.formatRepo.find({ where: { schoolId: IsNull() }, order: { minPercentage: 'DESC' } });
    }
    return formats;
  }

  async createFormat(dto: CreateGradeFormatDto, user: any) {
    if (!user.schoolId) throw new BadRequestException('User not linked to a school');
    if (dto.minPercentage > dto.maxPercentage) throw new BadRequestException('minPercentage cannot exceed maxPercentage');
    const existingOverlap = await this.formatRepo.createQueryBuilder('f')
      .where('f.schoolId = :schoolId', { schoolId: user.schoolId })
      .andWhere('( (:min BETWEEN f.minPercentage AND f.maxPercentage) OR (:max BETWEEN f.minPercentage AND f.maxPercentage) )', { min: dto.minPercentage, max: dto.maxPercentage })
      .getOne();
    if (existingOverlap) throw new BadRequestException('Percentage range overlaps with an existing format');
    const format = this.formatRepo.create({ ...dto, schoolId: user.schoolId });
    return this.formatRepo.save(format);
  }

  async updateFormat(id: string, dto: UpdateGradeFormatDto, user: any) {
    const format = await this.formatRepo.findOne({ where: { id } });
    if (!format) throw new NotFoundException('Format not found');
    if (format.schoolId && format.schoolId !== user.schoolId) throw new BadRequestException('Cannot modify another school\'s format');
    if (!format.schoolId && user.role !== Role.SUPER_ADMIN) throw new BadRequestException('Only SUPER_ADMIN can edit global formats');
    Object.assign(format, dto);
    if (format.minPercentage > format.maxPercentage) throw new BadRequestException('minPercentage cannot exceed maxPercentage');
    return this.formatRepo.save(format);
  }

  async deleteFormat(id: string, user: any) {
    const format = await this.formatRepo.findOne({ where: { id } });
    if (!format) throw new NotFoundException('Format not found');
    if (format.schoolId && format.schoolId !== user.schoolId) throw new BadRequestException('Cannot delete another school\'s format');
    if (!format.schoolId && user.role !== Role.SUPER_ADMIN) throw new BadRequestException('Only SUPER_ADMIN can delete global formats');
    await this.formatRepo.remove(format);
    return { success: true };
  }

  async initializeDefaults(dto: InitializeGradeFormatsDto, user: any) {
    if (!user.schoolId) throw new BadRequestException('User not linked to a school');
    const existing = await this.formatRepo.count({ where: { schoolId: user.schoolId } });
    if (existing > 0) throw new BadRequestException('School already has grading formats');
    const rows = dto.formats.map(f => this.formatRepo.create({ ...f, schoolId: user.schoolId }));
    return this.formatRepo.save(rows);
  }

  async ensureGlobalDefaults() {
  const count = await this.formatRepo.count({ where: { schoolId: IsNull() } });
    if (count === 0) {
      const defaults: Partial<GradeFormat>[] = [
        { grade: 'A+', description: 'Distinction', minPercentage: 90, maxPercentage: 100, gpa: 4.0, isActive: true },
        { grade: 'A', description: 'Excellent', minPercentage: 80, maxPercentage: 89, gpa: 3.7, isActive: true },
        { grade: 'B+', description: 'Very Good', minPercentage: 75, maxPercentage: 79, gpa: 3.3, isActive: true },
        { grade: 'B', description: 'Good', minPercentage: 70, maxPercentage: 74, gpa: 3.0, isActive: true },
        { grade: 'C+', description: 'Credit', minPercentage: 65, maxPercentage: 69, gpa: 2.7, isActive: true },
        { grade: 'C', description: 'Pass', minPercentage: 60, maxPercentage: 64, gpa: 2.3, isActive: true },
        { grade: 'D+', description: 'Marginal Pass', minPercentage: 55, maxPercentage: 59, gpa: 2.0, isActive: true },
        { grade: 'D', description: 'Poor Pass', minPercentage: 50, maxPercentage: 54, gpa: 1.7, isActive: true },
        { grade: 'F', description: 'Fail', minPercentage: 0, maxPercentage: 49, gpa: 0.0, isActive: true },
      ];
  const entities = this.formatRepo.create(defaults as any);
  await this.formatRepo.save(entities);
    }
  }
}
