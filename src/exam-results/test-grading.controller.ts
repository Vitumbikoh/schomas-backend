import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { GradeFormat } from '../grades/entity/grade-format.entity';

@Controller('test-grading')
@UseGuards(JwtAuthGuard)
export class TestGradingController {
  constructor(
    @InjectRepository(GradeFormat)
    private gradeFormatRepository: Repository<GradeFormat>,
  ) {}

  @Get('formats')
  async getGradeFormats(@Query('schoolId') schoolId?: string) {
    // School-specific formats
    let schoolFormats: GradeFormat[] = [];
    if (schoolId && schoolId !== 'null') {
      schoolFormats = await this.gradeFormatRepository.find({
        where: { schoolId, isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }

    // Global formats
    const globalFormats = await this.gradeFormatRepository.find({
      where: { schoolId: IsNull(), isActive: true },
      order: { minPercentage: 'DESC' }
    });

    return {
      schoolId: schoolId,
      schoolFormats: schoolFormats.length,
      globalFormats: globalFormats.length,
      schoolFormatDetails: schoolFormats,
      globalFormatDetails: globalFormats,
      usingFormats: schoolFormats.length > 0 ? 'SCHOOL_SPECIFIC' : 'GLOBAL'
    };
  }

  @Get('test-percentage')
  async testPercentage(
    @Query('percentage') percentage: string,
    @Query('schoolId') schoolId?: string
  ) {
    const pct = parseFloat(percentage);
    if (isNaN(pct)) {
      return { error: 'Invalid percentage' };
    }

    // Get formats
    let formats: GradeFormat[] = [];
    if (schoolId && schoolId !== 'null') {
      formats = await this.gradeFormatRepository.find({
        where: { schoolId, isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }
    
    if (formats.length === 0) {
      formats = await this.gradeFormatRepository.find({
        where: { schoolId: IsNull(), isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }

    // Find matching format
    const matchingFormat = formats.find(format => 
      pct >= format.minPercentage && pct <= format.maxPercentage
    );

    return {
      percentage: pct,
      schoolId: schoolId,
      availableFormats: formats.map(f => `${f.grade} (${f.minPercentage}-${f.maxPercentage}%): GPA ${f.gpa}, "${f.description}"`),
      matchingFormat: matchingFormat ? {
        grade: matchingFormat.grade,
        description: matchingFormat.description,
        gpa: matchingFormat.gpa,
        range: `${matchingFormat.minPercentage}-${matchingFormat.maxPercentage}%`
      } : null,
      fallback: !matchingFormat ? 'Would use hardcoded fallback' : null
    };
  }
}