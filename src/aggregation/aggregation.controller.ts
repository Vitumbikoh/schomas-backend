import { Controller, Post, Body, Req, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { CreateOrUpdateSchemeDto, CreateOrUpdateDefaultSchemeDto, RecordExamGradeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';

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

  // Admin endpoints for default schemes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('default-scheme')
  async createOrUpdateDefaultScheme(@Body() dto: CreateOrUpdateDefaultSchemeDto, @Req() req: any){
    // Additional validation: only school admins (not super admins) can create default schemes
    if (req.user?.role === 'SUPER_ADMIN' || !req.user?.schoolId) {
      throw new BadRequestException('Only school administrators can create default weighting schemes');
    }
    
    return this.aggService.createOrUpdateDefaultScheme(dto, req.user?.id, req.user?.schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('default-scheme')
  async getDefaultScheme(@Query('termId') termId: string, @Req() req: any){
    return this.aggService.getDefaultScheme(req.user?.schoolId, termId);
  }

  // Public (read-only) for authenticated school users: fetch the school's default scheme
  @UseGuards(JwtAuthGuard)
  @Get('school-default-scheme')
  async getSchoolDefaultScheme(@Req() req: any){
    return this.aggService.getDefaultScheme(req.user?.schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('default-schemes')
  async listDefaultSchemes(@Req() req: any){
    return this.aggService.listDefaultSchemes(req.user?.schoolId);
  }
}
