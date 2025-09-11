import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateBookDto, UpdateBookDto } from './dtos/book.dto';
import { BorrowBookDto, ReturnBookDto } from './dtos/borrowing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  // Books
  @Get('books')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.FINANCE)
  listBooks(@Request() req, @Query('q') q?: string) {
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? (req.query.schoolId as string) : req.user?.schoolId;
    return this.library.listBooks(schoolId, q);
  }

  @Post('books')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createBook(@Body() dto: CreateBookDto, @Request() req, @Query('schoolId') schoolIdParam?: string) {
    const resolvedSchoolId = req.user?.role === 'SUPER_ADMIN' ? (schoolIdParam || req.body?.schoolId) : req.user?.schoolId;
    const actor = { role: req.user?.role, schoolId: resolvedSchoolId };
    return this.library.createBook(dto, actor);
  }

  @Put('books/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateBook(@Param('id') id: string, @Body() dto: UpdateBookDto, @Request() req) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.library.updateBook(id, dto, actor);
  }

  @Delete('books/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteBook(@Param('id') id: string, @Request() req) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.library.deleteBook(id, actor);
  }

  // Borrowings
  @Get('borrowings')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.FINANCE)
  listBorrowings(@Request() req, @Query('studentId') studentId?: string, @Query('activeOnly') activeOnly?: string) {
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? (req.query.schoolId as string) : req.user?.schoolId;
    return this.library.listBorrowings(schoolId, { studentId, activeOnly: activeOnly === 'true' });
  }

  @Post('borrow')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.FINANCE)
  borrow(@Body() dto: BorrowBookDto, @Request() req, @Query('schoolId') schoolIdParam?: string) {
    const resolvedSchoolId = req.user?.role === 'SUPER_ADMIN' ? (schoolIdParam || req.body?.schoolId) : req.user?.schoolId;
    const actor = { role: req.user?.role, schoolId: resolvedSchoolId };
    return this.library.borrow(dto, actor);
  }

  @Post('return')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.FINANCE)
  returnBook(@Body() dto: ReturnBookDto, @Request() req) {
    const actor = { role: req.user?.role, schoolId: req.user?.schoolId };
    return this.library.returnBook(dto, actor);
  }

  // Student views
  @Get('me/borrowings')
  @Roles(Role.STUDENT)
  myBorrowings(@Request() req) {
    return this.library.myBorrowings(req.user?.id, req.user?.schoolId);
  }

  @Get('me/history')
  @Roles(Role.STUDENT)
  myHistory(@Request() req) {
    return this.library.myHistory(req.user?.id, req.user?.schoolId);
  }

  // Reports
  @Get('reports/most-borrowed')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  mostBorrowed(@Request() req) {
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? (req.query.schoolId as string) : req.user?.schoolId;
    return this.library.reportMostBorrowed(schoolId);
  }

  @Get('reports/overdue')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  overdue(@Request() req) {
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? (req.query.schoolId as string) : req.user?.schoolId;
    return this.library.reportOverdue(schoolId);
  }

  // Students autocomplete for borrowing by human-readable studentId
  @Get('students/search')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.FINANCE)
  searchStudents(@Request() req, @Query('q') q: string, @Query('limit') limit?: string) {
    const schoolId = req.user?.role === 'SUPER_ADMIN' ? (req.query.schoolId as string) : req.user?.schoolId;
    if (!q || !q.trim()) return [];
    return this.library.searchStudents({ schoolId, q, limit: limit ? parseInt(limit, 10) : undefined });
  }
}
