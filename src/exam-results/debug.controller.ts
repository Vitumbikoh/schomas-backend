import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { GradeFormat } from '../grades/entity/grade-format.entity';

@Controller('debug')
@UseGuards(JwtAuthGuard)
export class DebugController {
  constructor(
    @InjectRepository(GradeFormat)
    private gradeFormatRepository: Repository<GradeFormat>,
  ) {}

  @Get('grading-formats')
  async getGradingFormatsForSchool(@Request() req?: any) {
    const userId = req?.user?.id;
    const userSchoolId = req?.user?.schoolId;
    
    console.log('Debug request:', { userId, userSchoolId });
    
    // Get school-specific formats
    let schoolFormats: GradeFormat[] = [];
    
    if (userSchoolId) {
      schoolFormats = await this.gradeFormatRepository.find({
        where: { schoolId: userSchoolId, isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }

    // Get global formats  
    const globalFormats = await this.gradeFormatRepository.find({
      where: { schoolId: IsNull(), isActive: true },
      order: { minPercentage: 'DESC' }
    });

    // Test specific percentages that are problematic
    const testPercentages = [70, 65, 45];
    const testResults = testPercentages.map(pct => {
      const activeFormats = schoolFormats.length > 0 ? schoolFormats : globalFormats;
      const matchingFormat = activeFormats.find(format => 
        pct >= format.minPercentage && pct <= format.maxPercentage
      );
      
      return {
        percentage: pct,
        matchingFormat: matchingFormat ? {
          grade: matchingFormat.grade,
          description: matchingFormat.description,
          gpa: matchingFormat.gpa,
          range: `${matchingFormat.minPercentage}-${matchingFormat.maxPercentage}%`
        } : null,
        fallbackUsed: !matchingFormat
      };
    });

    return {
      request: {
        userSchoolId,
        schoolIdUsed: userSchoolId
      },
      formats: {
        schoolSpecific: {
          count: schoolFormats.length,
          formats: schoolFormats.map(f => ({
            grade: f.grade,
            description: f.description,
            range: `${f.minPercentage}-${f.maxPercentage}%`,
            gpa: f.gpa
          }))
        },
        global: {
          count: globalFormats.length,
          formats: globalFormats.map(f => ({
            grade: f.grade,
            description: f.description,
            range: `${f.minPercentage}-${f.maxPercentage}%`,
            gpa: f.gpa
          }))
        },
        activeFormats: schoolFormats.length > 0 ? 'SCHOOL_SPECIFIC' : 'GLOBAL'
      },
      testResults
    };
  }

  @Get('test-percentage/:percentage')
  async testPercentageCalculation(
    @Param('percentage') percentage: string,
    @Request() req?: any
  ) {
    const pct = parseFloat(percentage);
    const userSchoolId = req?.user?.schoolId;
    
    if (isNaN(pct)) {
      return { error: 'Invalid percentage' };
    }

    // Simulate the same logic as exam result service
    let formats: GradeFormat[] = [];
    
    if (userSchoolId) {
      formats = await this.gradeFormatRepository.find({
        where: { schoolId: userSchoolId, isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }
    
    if (formats.length === 0) {
      formats = await this.gradeFormatRepository.find({
        where: { schoolId: IsNull(), isActive: true },
        order: { minPercentage: 'DESC' }
      });
    }

    const matchingFormat = formats.find(format => 
      pct >= format.minPercentage && pct <= format.maxPercentage
    );

    // Apply same fallback logic as exam result service
    let fallbackGPA = 0.0;
    let fallbackRemarks = 'Needs Improvement';
    
    if (!matchingFormat) {
      if (pct >= 90) { fallbackGPA = 4.0; fallbackRemarks = 'Excellent'; }
      else if (pct >= 80) { fallbackGPA = 3.7; fallbackRemarks = 'Very Good'; }
      else if (pct >= 75) { fallbackGPA = 3.3; fallbackRemarks = 'Very Good'; }
      else if (pct >= 70) { fallbackGPA = 3.0; fallbackRemarks = 'Good'; }
      else if (pct >= 65) { fallbackGPA = 2.7; fallbackRemarks = 'Satisfactory'; }
      else if (pct >= 60) { fallbackGPA = 2.3; fallbackRemarks = 'Satisfactory'; }
      else if (pct >= 55) { fallbackGPA = 2.0; fallbackRemarks = 'Needs Improvement'; }
      else if (pct >= 50) { fallbackGPA = 1.7; fallbackRemarks = 'Needs Improvement'; }
    }

    return {
      input: {
        percentage: pct,
        schoolId: userSchoolId,
        userSchoolId: userSchoolId
      },
      resolution: {
        formatsFound: formats.length,
        formatSource: formats.length > 0 && formats[0].schoolId ? 'SCHOOL_SPECIFIC' : 'GLOBAL',
        matchingFormat: matchingFormat ? {
          grade: matchingFormat.grade,
          description: matchingFormat.description,
          gpa: Number(matchingFormat.gpa),
          range: `${matchingFormat.minPercentage}-${matchingFormat.maxPercentage}%`
        } : null,
        fallback: !matchingFormat ? {
          gpa: fallbackGPA,
          remarks: fallbackRemarks
        } : null
      },
      result: {
        gpa: matchingFormat ? Number(matchingFormat.gpa) : fallbackGPA,
        remarks: matchingFormat ? matchingFormat.description : fallbackRemarks
      }
    };
  }
}