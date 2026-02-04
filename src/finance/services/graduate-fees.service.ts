import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GraduateOutstandingBalance, TermBreakdown } from '../entities/graduate-outstanding-balance.entity';
import { Student } from '../../user/entities/student.entity';
import { FeePayment } from '../entities/fee-payment.entity';
import { FeeStructure } from '../entities/fee-structure.entity';
import { Term } from '../../settings/entities/term.entity';
import { GraduatePaymentDto, WaiveGraduateFeeDto, GraduateFiltersDto } from '../dtos/graduate-fees.dto';

@Injectable()
export class GraduateFeesService {
  private readonly logger = new Logger(GraduateFeesService.name);

  constructor(
    @InjectRepository(GraduateOutstandingBalance)
    private graduateBalanceRepo: Repository<GraduateOutstandingBalance>,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(FeePayment)
    private paymentRepo: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Term)
    private termRepo: Repository<Term>,
  ) {}

  /**
   * Snapshot graduate's outstanding balance when they graduate
   * Called automatically when student is moved to Graduated class
   */
  async snapshotGraduateOutstanding(
    studentId: string,
    graduationTermId?: string,
  ): Promise<GraduateOutstandingBalance> {
    this.logger.log(`Creating graduate outstanding snapshot for student ${studentId}`);

    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Check if snapshot already exists
    const existing = await this.graduateBalanceRepo.findOne({
      where: { studentId },
    });

    if (existing) {
      this.logger.warn(`Graduate snapshot already exists for student ${studentId}`);
      return existing;
    }

    // Get all historical terms for this student's school
    const terms = await this.termRepo.find({
      where: { schoolId: student.schoolId },
      order: { startDate: 'ASC' },
    });

    const termBreakdown: TermBreakdown[] = [];
    let totalExpected = 0;
    let totalPaid = 0;

    for (const term of terms) {
      // Get expected fees for this term
      const feeStructures = await this.feeStructureRepo.find({
        where: {
          termId: term.id,
          isActive: true,
          schoolId: student.schoolId,
        },
      });

      const termExpected = feeStructures
        .filter(
          (fs) =>
            !fs.isOptional &&
            (!fs.classId || fs.classId === student.classId),
        )
        .reduce((sum, fs) => sum + Number(fs.amount), 0);

      // Get payments made for this term
      const termPayments = await this.paymentRepo.find({
        where: {
          studentId,
          termId: term.id,
          status: 'completed',
        },
      });

      const termPaid = termPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const termOutstanding = Math.max(0, termExpected - termPaid);

      if (termExpected > 0) {
        // Only include terms with expected fees
        termBreakdown.push({
          termId: term.id,
          termNumber: term.termNumber,
          academicYear: term.academicCalendar?.term || 'N/A',
          expected: termExpected,
          paid: termPaid,
          outstanding: termOutstanding,
        });

        totalExpected += termExpected;
        totalPaid += termPaid;
      }
    }

    const outstandingAmount = Math.max(0, totalExpected - totalPaid);

    // Determine payment status
    let paymentStatus: 'outstanding' | 'partial' | 'paid' | 'waived' =
      'outstanding';
    if (outstandingAmount === 0) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    // Create snapshot
    const snapshot = this.graduateBalanceRepo.create({
      studentId,
      schoolId: student.schoolId,
      totalExpected,
      totalPaid,
      outstandingAmount,
      termBreakdown,
      graduatedAt: new Date(),
      graduationTermId: graduationTermId || student.termId,
      graduationClass: student.class?.name || 'Graduated',
      paymentStatus,
    });

    const saved = await this.graduateBalanceRepo.save(snapshot);
    this.logger.log(
      `Graduate snapshot created: ${student.firstName} ${student.lastName} - Outstanding: MK ${outstandingAmount}`,
    );

    return saved;
  }

  /**
   * Get paginated list of graduates with optional filters
   */
  async getGraduatesList(
    filters: GraduateFiltersDto,
    schoolId?: string,
  ): Promise<{
    data: GraduateOutstandingBalance[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const query = this.graduateBalanceRepo
      .createQueryBuilder('gob')
      .leftJoinAndSelect('gob.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .where('1=1'); // Placeholder for dynamic conditions

    if (schoolId) {
      query.andWhere('gob.schoolId = :schoolId', { schoolId });
    }

    if (filters.status) {
      query.andWhere('gob.paymentStatus = :status', {
        status: filters.status,
      });
    }

    if (filters.search) {
      query.andWhere(
        '(student.firstName ILIKE :search OR student.lastName ILIKE :search OR student.studentId ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.graduationYear) {
      query.andWhere(
        'EXTRACT(YEAR FROM gob.graduatedAt) = :year',
        { year: parseInt(filters.graduationYear) },
      );
    }

    // Order by outstanding amount (highest first) to prioritize collection efforts
    query.orderBy('gob.outstandingAmount', 'DESC');

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get detailed information for a specific graduate
   */
  async getGraduateDetails(
    studentId: string,
    schoolId?: string,
  ): Promise<any> {
    const graduate = await this.graduateBalanceRepo.findOne({
      where: {
        studentId,
        ...(schoolId ? { schoolId } : {}),
      },
      relations: ['student', 'student.user'],
    });

    if (!graduate) {
      throw new NotFoundException('Graduate record not found');
    }

    // Get payment history
    const payments = await this.paymentRepo.find({
      where: {
        studentId,
        status: 'completed',
      },
      order: { paymentDate: 'DESC' },
    });

    return {
      ...graduate,
      paymentHistory: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        receiptNumber: p.receiptNumber,
        notes: p.notes,
      })),
    };
  }

  /**
   * Record payment from a graduated student
   */
  async processGraduatePayment(
    studentId: string,
    paymentDto: GraduatePaymentDto,
    processedBy: string,
    schoolId?: string,
  ): Promise<{
    payment: FeePayment;
    updatedBalance: GraduateOutstandingBalance;
  }> {
    this.logger.log(
      `Processing graduate payment: Student ${studentId}, Amount MK ${paymentDto.amount}`,
    );

    const graduate = await this.graduateBalanceRepo.findOne({
      where: {
        studentId,
        ...(schoolId ? { schoolId } : {}),
      },
    });

    if (!graduate) {
      throw new NotFoundException('Graduate record not found');
    }

    if (graduate.outstandingAmount <= 0) {
      throw new BadRequestException(
        'This graduate has no outstanding balance',
      );
    }

    if (paymentDto.amount > graduate.outstandingAmount) {
      throw new BadRequestException(
        `Payment amount (MK ${paymentDto.amount}) exceeds outstanding balance (MK ${graduate.outstandingAmount})`,
      );
    }

    // Create payment record
    const payment = this.paymentRepo.create({
      student: { id: studentId } as any,
      schoolId: graduate.schoolId,
      amount: paymentDto.amount,
      paymentMethod: paymentDto.paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque',
      paymentType: 'graduate_outstanding',
      term: paymentDto.termId ? { id: paymentDto.termId } as any : null,
      receiptNumber:
        paymentDto.receiptNumber ||
        `GRAD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      status: 'completed' as 'pending' | 'completed' | 'failed' | 'cancelled',
      notes: paymentDto.notes || 'Graduate outstanding fee payment',
      paymentDate: new Date(),
      processedByAdmin: { id: processedBy } as any,
    });

    await this.paymentRepo.save(payment);

    // Update graduate balance
    const newPaid = Number(graduate.totalPaid) + paymentDto.amount;
    const newOutstanding = Math.max(
      0,
      Number(graduate.totalExpected) - newPaid,
    );

    graduate.totalPaid = newPaid;
    graduate.outstandingAmount = newOutstanding;
    graduate.lastPaymentDate = new Date();
    graduate.lastPaymentAmount = paymentDto.amount;

    // Update payment status
    if (newOutstanding === 0) {
      graduate.paymentStatus = 'paid';
    } else if (newPaid > 0) {
      graduate.paymentStatus = 'partial';
    }

    const updatedBalance = await this.graduateBalanceRepo.save(graduate);

    this.logger.log(
      `Graduate payment recorded: MK ${paymentDto.amount}. New outstanding: MK ${newOutstanding}`,
    );

    return {
      payment,
      updatedBalance,
    };
  }

  /**
   * Waive outstanding fees for a graduate (admin only)
   */
  async waiveGraduateFees(
    studentId: string,
    waiveDto: WaiveGraduateFeeDto,
    waivedBy: string,
    schoolId?: string,
  ): Promise<GraduateOutstandingBalance> {
    this.logger.log(
      `Waiving fees for graduate ${studentId}: MK ${waiveDto.amount}`,
    );

    const graduate = await this.graduateBalanceRepo.findOne({
      where: {
        studentId,
        ...(schoolId ? { schoolId } : {}),
      },
    });

    if (!graduate) {
      throw new NotFoundException('Graduate record not found');
    }

    if (waiveDto.amount > graduate.outstandingAmount) {
      throw new BadRequestException(
        `Waiver amount (MK ${waiveDto.amount}) exceeds outstanding balance (MK ${graduate.outstandingAmount})`,
      );
    }

    // Reduce outstanding (waiver doesn't count as payment)
    const newOutstanding = Math.max(
      0,
      Number(graduate.outstandingAmount) - waiveDto.amount,
    );

    graduate.outstandingAmount = newOutstanding;
    graduate.notes = `${graduate.notes || ''}\n[${new Date().toISOString()}] Waived MK ${waiveDto.amount}: ${waiveDto.reason}`;

    // Update payment status
    if (newOutstanding === 0) {
      graduate.paymentStatus = 'waived';
    }

    const updated = await this.graduateBalanceRepo.save(graduate);

    this.logger.log(
      `Fees waived: MK ${waiveDto.amount}. New outstanding: MK ${newOutstanding}`,
    );

    return updated;
  }

  /**
   * Get summary statistics for graduate fees
   */
  async getGraduateSummary(schoolId?: string): Promise<any> {
    const query = this.graduateBalanceRepo.createQueryBuilder('gob');

    if (schoolId) {
      query.where('gob.schoolId = :schoolId', { schoolId });
    }

    const all = await query.getMany();

    const summary = {
      totalGraduates: all.length,
      graduatesWithBalance: all.filter((g) => g.outstandingAmount > 0).length,
      totalOutstanding: all.reduce(
        (sum, g) => sum + Number(g.outstandingAmount),
        0,
      ),
      totalPaid: all.reduce((sum, g) => sum + Number(g.totalPaid), 0),
      totalExpected: all.reduce((sum, g) => sum + Number(g.totalExpected), 0),
      byStatus: {
        outstanding: all.filter((g) => g.paymentStatus === 'outstanding')
          .length,
        partial: all.filter((g) => g.paymentStatus === 'partial').length,
        paid: all.filter((g) => g.paymentStatus === 'paid').length,
        waived: all.filter((g) => g.paymentStatus === 'waived').length,
      },
      byYear: this.groupByYear(all),
    };

    return summary;
  }

  private groupByYear(graduates: GraduateOutstandingBalance[]): Array<{
    year: string;
    count: number;
    outstanding: number;
  }> {
    const yearMap = new Map<string, { count: number; outstanding: number }>();

    graduates.forEach((g) => {
      const year = new Date(g.graduatedAt).getFullYear().toString();
      const existing = yearMap.get(year) || { count: 0, outstanding: 0 };
      yearMap.set(year, {
        count: existing.count + 1,
        outstanding: existing.outstanding + Number(g.outstandingAmount),
      });
    });

    return Array.from(yearMap.entries())
      .map(([year, data]) => ({ year, ...data }))
      .sort((a, b) => b.year.localeCompare(a.year)); // Most recent first
  }
}
