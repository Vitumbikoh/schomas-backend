import { Controller, Post, Body, Req, Get, Query } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { CreateOrUpdateSchemeDto, RecordExamGradeDto } from './dto';

@Controller('aggregation')
export class AggregationController {
  constructor(private readonly aggService: AggregationService) {}

  @Post('scheme')
  async createOrUpdateScheme(@Body() dto: CreateOrUpdateSchemeDto, @Req() req: any){
    return this.aggService.createOrUpdateScheme(dto, req.user?.id, req.user?.schoolId);
  }

  @Post('exam-grade')
  async recordExamGrade(@Body() dto: RecordExamGradeDto, @Req() req: any){
    return this.aggService.recordExamGrade(dto, req.user?.id, req.user?.schoolId);
  }

  @Get('results')
  async getResults(@Query('courseId') courseId: string, @Query('termId') termId: string){
    return this.aggService.getResultsForCourseTerm(courseId, termId);
  }

  @Get('result')
  async getResult(@Query('courseId') courseId: string, @Query('termId') termId: string, @Query('studentId') studentId: string){
    return this.aggService.getStudentResult(courseId, termId, studentId);
  }

  @Get('scheme')
  async getScheme(@Query('courseId') courseId: string, @Query('termId') termId: string){
    return this.aggService.getScheme(courseId, termId);
  }

  @Get('schemes')
  async listSchemes(@Query('courseId') courseId: string, @Query('termId') termId: string, @Req() req: any){
    return this.aggService.listSchemesForTeacher(req.user?.id, termId, courseId);
  }
}
