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
    const enrollments = await this.enrollmentRepo.find({ 
      where: { academicYearId },
      relations: ['student']
    });

    const feeStructures = await this.feeStructureRepo.find({ 
      where: { academicYearId, isActive: true }
    });

    const payments = await this.paymentRepo.find({ 
      where: { academicYearId, status: 'completed' }
    });

    // Calculate total expected fees
    const totalExpected = feeStructures
      .filter(item => !item.isOptional)
      .reduce((sum, item) => sum + (Number(item.amount) * enrollments.length), 0);

    // Calculate total paid
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    return {
      academicYearId,
      totalStudents: enrollments.length,
      totalExpectedFees: totalExpected,
      totalPaidFees: totalPaid,
      outstandingFees: Math.max(0, totalExpected - totalPaid),
      paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
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
    const enrollments = await this.enrollmentRepo.find({ 
      where: { academicYearId },
      relations: ['student']
    });

    const payments = await this.paymentRepo.find({ 
      where: { academicYearId, status: 'completed' }
    });

    const feeStructures = await this.feeStructureRepo.find({ 
      where: { academicYearId, isActive: true }
    });

    // Calculate expected fees per student
    const statuses = await Promise.all(enrollments.map(async enrollment => {
      const student = enrollment.student;
      const { totalExpected } = await this.computeExpectedFeesForStudent(student.id, academicYearId);
      
      const studentPayments = payments.filter(p => p.student?.id === student.id);
      const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Math.max(0, totalExpected - totalPaid);

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        academicYearId,
        totalExpected,
        totalPaid,
        outstanding,
        paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
        status: outstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')
      };
    }));

    return statuses.sort((a, b) => b.outstanding - a.outstanding);
  }
}