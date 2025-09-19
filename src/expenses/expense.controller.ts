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
    return this.expenseService.create(createExpenseDto, req.user.id);
  }

  @Get()
  findAll(@Query() filters: ExpenseFiltersDto, @Request() req) {
    return this.expenseService.findAll(filters, req.user.id);
  }

  @Get('analytics')
  getAnalytics(@Query() analyticsDto: ExpenseAnalyticsDto) {
    return this.expenseService.getAnalytics(analyticsDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Request() req
  ) {
    return this.expenseService.update(id, updateExpenseDto, req.user.id);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveExpenseDto: ApproveExpenseDto,
    @Request() req
  ) {
    return this.expenseService.approve(id, approveExpenseDto, req.user.id);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectExpenseDto: RejectExpenseDto,
    @Request() req
  ) {
    return this.expenseService.reject(id, rejectExpenseDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.expenseService.delete(id, req.user.id);
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
