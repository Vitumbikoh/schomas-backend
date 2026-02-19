import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from './entities/book.entity';
import { Borrowing } from './entities/borrowing.entity';
import { CreateBookDto, UpdateBookDto } from './dtos/book.dto';
import { BorrowBookDto, ReturnBookDto } from './dtos/borrowing.dto';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(Book) private bookRepo: Repository<Book>,
  @InjectRepository(Borrowing) private borrowRepo: Repository<Borrowing>,
  @InjectRepository(Student) private studentRepo: Repository<Student>,
  @InjectRepository(Class) private classRepo: Repository<Class>,
  ) {}

  // Books
  async listBooks(schoolId: string, q?: string, page: number = 1, limit: number = 10) {
    const qb = this.bookRepo.createQueryBuilder('b')
      .leftJoinAndSelect('b.class', 'class')
      .where('b.schoolId = :schoolId', { schoolId });
    if (q) qb.andWhere('(LOWER(b.title) LIKE :q OR LOWER(b.author) LIKE :q OR b.isbn LIKE :q)', { q: `%${q.toLowerCase()}%` });
    
    const totalCount = await qb.getCount();
    const books = await qb
      .orderBy('b.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    
    return {
      books,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      itemsPerPage: limit
    };
  }

  async createBook(dto: CreateBookDto, actor: { role: string; schoolId?: string }) {
    if (!actor.schoolId) throw new ForbiddenException('Missing school scope');
    
    // Validate class exists if provided
    if (dto.classId) {
      const classExists = await this.classRepo.findOne({ where: { id: dto.classId, schoolId: actor.schoolId } });
      if (!classExists) throw new NotFoundException('Class not found');
    }

    const book = this.bookRepo.create({
      title: dto.title,
      author: dto.author,
      isbn: dto.isbn,
      totalCopies: dto.totalCopies,
      availableCopies: dto.totalCopies,
      classId: dto.classId,
      schoolId: actor.schoolId,
    });
    return this.bookRepo.save(book);
  }

  async updateBook(id: string, dto: UpdateBookDto, actor: { role: string; schoolId?: string }) {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException('Book not found');
    if (actor.role !== 'SUPER_ADMIN' && actor.schoolId !== book.schoolId) throw new ForbiddenException('Scope mismatch');
    
    // Validate class exists if provided
    if (dto.classId) {
      const classExists = await this.classRepo.findOne({ where: { id: dto.classId, schoolId: actor.schoolId } });
      if (!classExists) throw new NotFoundException('Class not found');
    }

    if (dto.totalCopies !== undefined) {
      const activeBorrowed = book.totalCopies - book.availableCopies;
      if (dto.totalCopies < activeBorrowed) {
        throw new BadRequestException(`totalCopies cannot be less than currently borrowed count (${activeBorrowed})`);
      }
      book.totalCopies = dto.totalCopies;
      book.availableCopies = book.totalCopies - activeBorrowed;
    }
    if (dto.title !== undefined) book.title = dto.title;
    if (dto.author !== undefined) book.author = dto.author;
    if (dto.isbn !== undefined) book.isbn = dto.isbn;
    if (dto.classId !== undefined) book.classId = dto.classId;
    return this.bookRepo.save(book);
  }

  async deleteBook(id: string, actor: { role: string; schoolId?: string }) {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException('Book not found');
    if (actor.role !== 'SUPER_ADMIN' && actor.schoolId !== book.schoolId) throw new ForbiddenException('Scope mismatch');
  const active = await this.borrowRepo.count({ where: { bookId: book.id, returnedAt: null as any } });
  if (active > 0) throw new BadRequestException('Cannot delete: book has active borrowings');
    await this.bookRepo.delete(book.id);
    return { success: true };
  }

  // Borrowing
  async borrow(dto: BorrowBookDto, actor: { role: string; schoolId?: string }) {
    if (!actor.schoolId) throw new ForbiddenException('Missing school scope');
    if (!dto.bookId && !dto.bookName) throw new BadRequestException('Provide bookId or bookName');

    // Get student with class information
    const student = await this.studentRepo.findOne({ 
      where: { id: dto.studentId, schoolId: actor.schoolId },
      relations: ['class']
    });
    if (!student) throw new NotFoundException('Student not found');

    let book: Book | null = null;
    if (dto.bookId) {
      book = await this.bookRepo.findOne({ 
        where: { id: dto.bookId, schoolId: actor.schoolId },
        relations: ['class']
      });
      if (!book) throw new NotFoundException('Book not found');
      if (book.availableCopies <= 0) throw new BadRequestException('No copies available');

      // Check class restrictions - students can borrow books for their class level and below, plus N/A books
      if (book.classId && book.class && student.class) {
        const bookClass = book.class;
        const studentClass = student.class;
        
        // Student can borrow if book class numerical level <= student class numerical level
        if (bookClass.numericalName > studentClass.numericalName) {
          throw new BadRequestException(`This book is for ${bookClass.name} students. You can only borrow books for your class level (${studentClass.name}) and below.`);
        }
      }
      
      book.availableCopies -= 1;
      await this.bookRepo.save(book);
    }

    const borrowing = this.borrowRepo.create({
      bookId: book?.id || null,
      bookName: book ? undefined : dto.bookName,
      studentId: dto.studentId,
      schoolId: actor.schoolId,
      borrowedAt: new Date(),
      dueAt: new Date(dto.dueAt),
      fine: '0',
    });
    return this.borrowRepo.save(borrowing);
  }

  async returnBook(dto: ReturnBookDto, actor: { role: string; schoolId?: string }) {
    const br = await this.borrowRepo.findOne({ where: { id: dto.borrowingId } });
    if (!br) throw new NotFoundException('Borrowing not found');
    if (actor.role !== 'SUPER_ADMIN' && actor.schoolId !== br.schoolId) throw new ForbiddenException('Scope mismatch');

    // If already returned treat as idempotent success (helps when UI is stale or action retried)
    if (br.returnedAt) {
      return br; // nothing to change — don't modify book.availableCopies again
    }

    br.returnedAt = dto.returnedAt ? new Date(dto.returnedAt) : new Date();

    // Restore availableCopies if bookId exists
    if (br.bookId) {
      const book = await this.bookRepo.findOne({ where: { id: br.bookId } });
      if (book) {
        book.availableCopies += 1;
        await this.bookRepo.save(book);
      }
    }
    return this.borrowRepo.save(br);
  }

  async myBorrowings(studentId: string, schoolId: string) {
    return this.borrowRepo.find({ where: { studentId, schoolId, returnedAt: null as any }, order: { dueAt: 'ASC' as any } });
  }

  async myHistory(studentId: string, schoolId: string) {
    return this.borrowRepo.find({ where: { studentId, schoolId }, order: { borrowedAt: 'DESC' as any } });
  }

  async listBorrowings(schoolId: string, opts?: { studentId?: string; activeOnly?: boolean }) {
    const where: any = { schoolId };
    if (opts?.studentId) where.studentId = opts.studentId;
    if (opts?.activeOnly) where.returnedAt = null as any;
    // Include student relation for human-readable info
    return this.borrowRepo.find({ where, order: { borrowedAt: 'DESC' as any }, relations: ['student'] });
  }

  // Basic reports
  async reportMostBorrowed(schoolId: string) {
    const raws = await this.borrowRepo.createQueryBuilder('br')
      .select('br.bookId', 'bookId')
      .addSelect('COUNT(*)', 'borrowCount')
      .where('br.schoolId = :schoolId', { schoolId })
      .andWhere('br.bookId IS NOT NULL')
      .groupBy('br.bookId')
      // Order by the COUNT expression to avoid alias-case issues on Postgres
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    // Normalize raw keys from Postgres (which often lowercases aliases) to camelCase
    return raws.map((r: any) => ({
      bookId: r.bookId || r.bookid || r.book_id,
      borrowCount: r.borrowCount || r.borrowcount || r.borrow_count,
    }));
  }

  async reportOverdue(schoolId: string) {
    const now = new Date();
    return this.borrowRepo.find({ where: { schoolId, returnedAt: null as any }, order: { dueAt: 'ASC' as any } })
      .then(rows => rows.filter(r => new Date(r.dueAt) < now));
  }

  // Students (for autocomplete by human-readable studentId)
  async searchStudents(params: { schoolId?: string; q: string; limit?: number }) {
    const { schoolId, q } = params;
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
    const qb = this.studentRepo
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.class', 'class');

    if (schoolId) {
      qb.where('student.schoolId = :schoolId', { schoolId });
    }

    const needle = q.trim().toLowerCase();
    if (needle) {
      qb.andWhere(
        '(LOWER(student.studentId) LIKE :qPrefix OR LOWER(student.firstName) LIKE :q OR LOWER(student.lastName) LIKE :q)',
        { qPrefix: `${needle}%`, q: `%${needle}%` },
      );
    }

    const rows = await qb
      .orderBy('student.studentId', 'ASC')
      .limit(limit)
      .getMany();

    // Return minimal fields for UI including class information
    return rows.map(s => ({ 
      id: s.id, 
      studentId: s.studentId, 
      firstName: s.firstName, 
      lastName: s.lastName,
      class: s.class ? { id: s.class.id, name: s.class.name, numericalName: s.class.numericalName } : undefined
    }));
  }
}
