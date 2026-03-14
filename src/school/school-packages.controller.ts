import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SchoolsService, PackageId } from './schools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('school-packages')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SchoolPackagesController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get('me')
  getMySchoolPackage(@Request() req: any) {
    const schoolId = req.schoolId || req.user?.schoolId;
    if (!schoolId) {
      throw new BadRequestException('No school context available for this user');
    }
    return this.schoolsService.getSchoolPackageConfig(schoolId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Get('catalog')
  getCatalog() {
    return this.schoolsService.getPackageCatalog();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Get('schools/:schoolId')
  getSchoolConfig(@Param('schoolId') schoolId: string) {
    return this.schoolsService.getSchoolPackageConfig(schoolId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch('schools/:schoolId')
  assignSchoolPackage(
    @Param('schoolId') schoolId: string,
    @Body() body: { packageId: PackageId },
  ) {
    return this.schoolsService.assignPackageToSchool(schoolId, body.packageId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch('pricing')
  updatePricing(
    @Body() body: { normal?: number; silver?: number; golden?: number },
  ) {
    return this.schoolsService.updatePackagePricing(body);
  }
}
