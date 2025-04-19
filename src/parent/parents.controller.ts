import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Body,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ParentsService } from './parents.service';
import { UpdateParentDto } from './dtos/update-parent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Role } from 'src/user/enums/role.enum';
import { Roles } from 'src/user/decorators/roles.decorator';

@ApiTags('Parents')
@ApiBearerAuth()
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @ApiOperation({ summary: 'Get all parents' })
  @ApiResponse({ status: 200, description: 'List of all parents' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get()
  async findAll() {
    return this.parentsService.findAll();
  }

  @ApiOperation({ summary: 'Get parent by ID' })
  @ApiResponse({ status: 200, description: 'Parent details' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.parentsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update parent information' })
  @ApiResponse({ status: 200, description: 'Parent updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PARENT)
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateParentDto: UpdateParentDto,
  ) {
    return this.parentsService.update(id, updateParentDto);
  }

  @ApiOperation({ summary: 'Delete parent account' })
  @ApiResponse({ status: 200, description: 'Parent deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.parentsService.remove(id);
  }

  @ApiOperation({ summary: 'Get parent profile' })
  @ApiResponse({ status: 200, description: 'Parent profile details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PARENT)
  @Get('profile/:id')
  async getProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.parentsService.getParentProfile(id);
  }

  @ApiOperation({ summary: 'Get parent children' })
  @ApiResponse({ status: 200, description: 'List of parent children' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PARENT, Role.ADMIN, Role.TEACHER)
  @Get(':id/children')
  async getChildren(@Param('id', ParseUUIDPipe) id: string) {
    return this.parentsService.getParentChildren(id);
  }
}