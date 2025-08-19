import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Student } from '../user/entities/student.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { CreateFeeStructureDto } from './dtos/fees-structure.dto';

@Injectable()
export class StudentFeeExpectationService {
  constructor(
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(FeePayment) private paymentRepo: Repository<FeePayment>,
    @InjectRepository(FeeStructure) private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Enrollment) private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(AcademicYear) private academicYearRepo: Repository<AcademicYear>,
  ) {}

  async getFeeStructureForAcademicYear(academicYearId: string) {
    return this.feeStructureRepo.find({ 
      where: { academicYearId },
      order: { feeType: 'ASC' }
    });
  }

  async createFeeStructureItem(dto: CreateFeeStructureDto) {
  // Validate academic year exists
  const academicYear = await this.academicYearRepo.findOne({ 
    where: { id: dto.academicYearId } 
  });
  
  if (!academicYear) {
    throw new NotFoundException('Academic year not found');
  }

  // Create and save the fee structure item
  const feeStructure = this.feeStructureRepo.create({
    amount: dto.amount,
    academicYearId: dto.academicYearId,
    feeType: dto.feeType,
    isActive: dto.isActive,
    isOptional: dto.isOptional,
    frequency: dto.frequency as 'per_term' | 'per_year' | 'one_time' | undefined,
    classId: dto.classId
  });

  return this.feeStructureRepo.save(feeStructure);
}

  async updateFeeStructureItem(id: string, dto: Partial<CreateFeeStructureDto>) {
    // Ensure frequency is cast to the correct enum type if present
    const updateDto = {
      ...dto,
      frequency: dto.frequency as 'per_term' | 'per_year' | 'one_time' | undefined
    };
    await this.feeStructureRepo.update(id, updateDto);
    return this.feeStructureRepo.findOne({ where: { id } });
  }

  async deleteFeeStructureItem(id: string) {
    await this.feeStructureRepo.delete(id);
    return { success: true };
  }

  async computeExpectedFeesForStudent(studentId: string, academicYearId: string) {
    const student = await this.studentRepo.findOne({ 
      where: { id: studentId },
      relations: ['class']
    });
    if (!student) throw new NotFoundException('Student not found');

    const feeItems = await this.feeStructureRepo.find({ 
      where: { 
        academicYearId, 
        isActive: true 
      }
    });

    // Filter fees for the student's class or general fees
    const applicableFees = feeItems.filter(item => 
      !item.classId || item.classId === (student.class?.id)
    );

    const breakdown = applicableFees.map(item => ({
      feeType: item.feeType,
      amount: Number(item.amount),
      optional: item.isOptional,
      frequency: item.frequency
    }));

    const totalExpected = applicableFees
      .filter(item => !item.isOptional)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      studentId,
      academicYearId,
      totalExpected,
      breakdown,
      mandatoryFees: applicableFees.filter(item => !item.isOptional),
      optionalFees: applicableFees.filter(item => item.isOptional)
    };
  }

  async getFeeSummaryForAcademicYear(academicYearId: string) {
    const [enrollments, feeStructures, payments, academicYear] = await Promise.all([
      this.enrollmentRepo.find({ 
        where: { academicYearId },
        relations: ['student']
      }),
      this.feeStructureRepo.find({ 
        where: { academicYearId, isActive: true }
      }),
      this.paymentRepo.find({ 
        where: { academicYearId, status: 'completed' }
      }),
      this.academicYearRepo.findOne({ where: { id: academicYearId } })
    ]);

    if (!academicYear) {
      throw new NotFoundException('Academic year not found');
    }

    const totalStudents = enrollments.length;

    // Calculate expected fees (mandatory only * total students) per user request
    const expectedFees = feeStructures
      .filter(item => !item.isOptional)
      .reduce((sum, item) => sum + (Number(item.amount) * totalStudents), 0);

    // Total paid fees
    const totalFeesPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    // Remaining (expected - paid)
    const remainingFees = Math.max(0, expectedFees - totalFeesPaid);

    // Overdue logic: if today is past academicYear.endDate, any remaining becomes overdue
    const now = new Date();
    let overdueFees = 0;
    let overdueStudents = 0;
    if (now > new Date(academicYear.endDate)) {
      // Count students with outstanding > 0
      // For performance, approximate by using average outstanding per student if needed.
      // Here we compute per student expected = mandatory fees sum
      const perStudentExpected = feeStructures
        .filter(f => !f.isOptional)
        .reduce((s, f) => s + Number(f.amount), 0);
      // Map studentId -> paid
      const paidMap: Record<string, number> = {};
      payments.forEach(p => {
        const sid = (p.student as any)?.id; // relation may or may not be loaded
        if (sid) {
          paidMap[sid] = (paidMap[sid] || 0) + Number(p.amount);
        }
      });
      overdueStudents = enrollments.reduce((count, enr) => {
        const studentId = enr.student?.id;
        const paid = studentId ? (paidMap[studentId] || 0) : 0;
        const outstanding = Math.max(0, perStudentExpected - paid);
        return count + (outstanding > 0 ? 1 : 0);
      }, 0);
      overdueFees = remainingFees; // All remaining after end date is overdue
    }

    return {
      academicYearId,
      totalStudents,
      // Original fields (backward compatibility)
      totalExpectedFees: expectedFees,
      totalPaidFees: totalFeesPaid,
      outstandingFees: remainingFees,
      paymentPercentage: expectedFees > 0 ? (totalFeesPaid / expectedFees) * 100 : 0,
      // New explicit fields per user wording
      expectedFees,
      totalFeesPaid,
      remainingFees,
      overdueFees,
      overdueStudents,
      isPastAcademicYear: new Date() > new Date(academicYear.endDate),
      academicYearEndDate: academicYear.endDate,
      feeStructures: feeStructures.map(f => ({
        feeType: f.feeType,
        amount: f.amount,
        isOptional: f.isOptional,
        frequency: f.frequency
      }))
    };
  }

  async getStudentFeeStatus(studentId: string, academicYearId: string) {
    const { totalExpected, breakdown } = await this.computeExpectedFeesForStudent(studentId, academicYearId);
    const payments = await this.paymentRepo.find({ 
      where: { 
        student: { id: studentId }, 
        academicYearId, 
        status: 'completed' 
      }
    });

    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const outstanding = Math.max(0, totalExpected - totalPaid);

    return {
      studentId,
      academicYearId,
      totalExpected,
      totalPaid,
      outstanding,
      paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.paymentDate,
        method: p.paymentMethod,
        receiptNumber: p.receiptNumber
      })),
      feeBreakdown: breakdown
    };
  }

  async listStudentFeeStatuses(academicYearId: string) {
    const [enrollments, payments, feeStructures, academicYear] = await Promise.all([
      this.enrollmentRepo.find({ 
        where: { academicYearId },
        relations: ['student']
      }),
      this.paymentRepo.find({ 
        where: { academicYearId, status: 'completed' },
        relations: ['student']
      }),
      this.feeStructureRepo.find({ 
        where: { academicYearId, isActive: true }
      }),
      this.academicYearRepo.findOne({ where: { id: academicYearId } })
    ]);

    const pastEnd = academicYear ? new Date() > new Date(academicYear.endDate) : false;
    const perStudentMandatoryTotal = feeStructures
      .filter(f => !f.isOptional)
      .reduce((sum, f) => sum + Number(f.amount), 0);

    // Pre-aggregate payments per student for efficiency
    const paidMap: Record<string, number> = {};
    payments.forEach(p => {
      if (p.student?.id) {
        paidMap[p.student.id] = (paidMap[p.student.id] || 0) + Number(p.amount);
      }
    });

    const statuses = enrollments.map(enrollment => {
      const student = enrollment.student;
      const totalExpected = perStudentMandatoryTotal; // computed once
      const totalPaid = paidMap[student.id] || 0;
      const outstanding = Math.max(0, totalExpected - totalPaid);
      const isOverdue = pastEnd && outstanding > 0;
      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        academicYearId,
        totalExpected,
        totalPaid,
        outstanding,
        paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
        status: outstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
        isOverdue,
        overdueAmount: isOverdue ? outstanding : 0
      };
    });

    return statuses.sort((a, b) => b.outstanding - a.outstanding);
  }
}