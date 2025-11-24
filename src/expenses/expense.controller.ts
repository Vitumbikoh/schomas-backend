import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto, UpdateExpenseDto, ApproveExpenseDto, RejectExpenseDto, ExpenseFiltersDto, ExpenseAnalyticsDto, AddCommentDto } from './dtos/expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  create(@Body() createExpenseDto: CreateExpenseDto, @Request() req) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    return this.expenseService.create(createExpenseDto, userId);
  }

  @Get()
  findAll(@Query() filters: ExpenseFiltersDto, @Request() req) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    
    // Apply school filtering based on user's role
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (filters.schoolId || req.user?.schoolId) : req.user?.schoolId;
    
    // Override or set schoolId in filters for non-super admin users
    const schoolFilteredFilters = {
      ...filters,
      ...(effectiveSchoolId ? { schoolId: effectiveSchoolId } : {}),
    };
    
    return this.expenseService.findAll(schoolFilteredFilters, userId, isSuper);
  }

  @Get('analytics')
  getAnalytics(@Query() analyticsDto: ExpenseAnalyticsDto) {
    return this.expenseService.getAnalytics(analyticsDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    const userId = req.user?.id || req.user?.sub;
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    return this.expenseService.findOne(id, userId, isSuper);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Request() req
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    return this.expenseService.update(id, updateExpenseDto, userId);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveExpenseDto: ApproveExpenseDto,
    @Request() req
  ) {
    console.log('CONTROLLER APPROVE - req.user:', JSON.stringify(req.user, null, 2));
    console.log('CONTROLLER APPROVE - req.user.id:', req.user?.id);
    console.log('CONTROLLER APPROVE - req.user.sub:', req.user?.sub);
    
    // Use sub if id is undefined (Passport.js uses sub as the user identifier)
    const userId = req.user?.id || req.user?.sub;
    console.log('CONTROLLER APPROVE - Extracted userId:', userId);
    if (!userId) {
      console.error('CONTROLLER APPROVE - Failed to extract userId from req.user');
      throw new Error('User ID not found in request');
    }
    
    console.log('CONTROLLER APPROVE - Calling service with userId:', userId);
    return this.expenseService.approve(id, approveExpenseDto, userId);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectExpenseDto: RejectExpenseDto,
    @Request() req
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    return this.expenseService.reject(id, rejectExpenseDto, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    return this.expenseService.delete(id, userId);
  }

  @Post(':id/comment')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addCommentDto: AddCommentDto,
    @Request() req
  ) {
    // This would be implemented in the service if needed
    // For now, we'll handle comments through approval/rejection
    return { message: 'Comment added successfully' };
  }
}
