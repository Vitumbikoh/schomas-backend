import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../user/entities/student.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Term } from '../settings/entities/term.entity';
import { CreateFeeStructureDto } from './dtos/fees-structure.dto';
@Injectable()
export class StudentFeeExpectationService {
  constructor(
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(FeePayment) private paymentRepo: Repository<FeePayment>,
    @InjectRepository(FeeStructure) private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
  ) {}

  async getFeeStructureForTerm(termId: string | undefined, schoolId?: string, superAdmin = false) {
    if (!termId) return [];
    const where: any = { termId };
    if (!superAdmin) {
      if (schoolId) where.schoolId = schoolId; else return [];
    } else if (schoolId) where.schoolId = schoolId;
    return this.feeStructureRepo.find({ where, order: { feeType: 'ASC' } });
  }

  async createFeeStructureItem(dto: CreateFeeStructureDto, schoolId?: string) {
    // Validate that schoolId is provided for non-super admin operations
    if (!schoolId) {
      throw new NotFoundException('School ID is required for fee structure creation');
    }
    
    const term = await this.termRepo.findOne({ where: { id: dto.termId } });
    if (!term) throw new NotFoundException('Term not found');
    
    const feeStructure = this.feeStructureRepo.create({
      amount: dto.amount,
      termId: dto.termId,
      feeType: dto.feeType,
      isActive: dto.isActive,
      isOptional: dto.isOptional,
      frequency: dto.frequency === 'per_term' ? 'per_period' : dto.frequency as 'per_period' | 'per_year' | 'one_time' | undefined,
      classId: dto.classId,
      schoolId: schoolId, // Always attach schoolId for multi-tenant isolation
    });
    return this.feeStructureRepo.save(feeStructure);
  }

  async updateFeeStructureItem(id: string, dto: Partial<CreateFeeStructureDto>, schoolId?: string, superAdmin = false) {
    // First verify the fee structure exists and belongs to the correct school
    const existingFeeStructure = await this.feeStructureRepo.findOne({ 
      where: { 
        id, 
        ...(schoolId && !superAdmin ? { schoolId } : {})
      } 
    });
    
    if (!existingFeeStructure) {
      throw new NotFoundException('Fee structure not found or access denied');
    }

    const updateDto = { 
      ...dto, 
      frequency: dto.frequency === 'per_term' ? 'per_period' : dto.frequency as 'per_period' | 'per_year' | 'one_time' | undefined 
    };
    await this.feeStructureRepo.update(id, updateDto);
    return this.feeStructureRepo.findOne({ where: { id } });
  }

  async deleteFeeStructureItem(id: string, schoolId?: string, superAdmin = false) {
    // First verify the fee structure exists and belongs to the correct school
    const existingFeeStructure = await this.feeStructureRepo.findOne({ 
      where: { 
        id, 
        ...(schoolId && !superAdmin ? { schoolId } : {})
      } 
    });
    
    if (!existingFeeStructure) {
      throw new NotFoundException('Fee structure not found or access denied');
    }

    await this.feeStructureRepo.delete(id);
    return { success: true };
  }

  async computeExpectedFeesForStudent(studentId: string, termId: string, schoolId?: string, superAdmin = false) {
    const student = await this.studentRepo.findOne({ where: { id: studentId, ...(schoolId && !superAdmin ? { schoolId } : {}) }, relations: ['class'] });
    if (!student) throw new NotFoundException('Student not found');
    const feeItems = await this.feeStructureRepo.find({ where: { termId, isActive: true, ...(schoolId ? { schoolId } : {}) } });
    const applicableFees = feeItems.filter(item => !item.classId || item.classId === (student.class?.id));
    const breakdown = applicableFees.map(item => ({ feeType: item.feeType, amount: Number(item.amount), optional: item.isOptional, frequency: item.frequency }));
    const totalExpected = applicableFees.filter(item => !item.isOptional).reduce((sum, item) => sum + Number(item.amount), 0);
    return { studentId, termId, totalExpected, breakdown, mandatoryFees: applicableFees.filter(i => !i.isOptional), optionalFees: applicableFees.filter(i => i.isOptional) };
  }

  async getFeeSummaryForTerm(termId: string, schoolId?: string, superAdmin = false) {
    const [students, feeStructures, payments, term] = await Promise.all([
      this.studentRepo.find({ where: { termId, ...(schoolId && !superAdmin ? { schoolId } : {}) } }),
      this.feeStructureRepo.find({ where: { termId, isActive: true, ...(schoolId ? { schoolId } : {}) } }),
      this.paymentRepo.find({ where: { termId, status: 'completed', ...(schoolId ? { schoolId } : {}) } }),
      this.termRepo.findOne({ where: { id: termId } })
    ]);
    if (!term) throw new NotFoundException('Term not found');
    const totalStudents = students.length;
    const expectedFees = feeStructures.filter(i => !i.isOptional).reduce((sum, i) => sum + (Number(i.amount) * totalStudents), 0);
    const totalFeesPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const remainingFees = Math.max(0, expectedFees - totalFeesPaid);
    const now = new Date();
    let overdueFees = 0; let overdueStudents = 0;
    if (now > new Date(term.endDate)) {
      const perStudentExpected = feeStructures.filter(f => !f.isOptional).reduce((s, f) => s + Number(f.amount), 0);
      const paidMap: Record<string, number> = {};
      payments.forEach(p => { const sid = (p.student as any)?.id; if (sid) paidMap[sid] = (paidMap[sid] || 0) + Number(p.amount); });
      overdueStudents = students.reduce((count, st) => { const paid = paidMap[st.id] || 0; const outstanding = Math.max(0, perStudentExpected - paid); return count + (outstanding > 0 ? 1 : 0); }, 0);
      overdueFees = remainingFees;
    }
    return { termId, totalStudents, totalExpectedFees: expectedFees, totalPaidFees: totalFeesPaid, outstandingFees: remainingFees, paymentPercentage: expectedFees > 0 ? (totalFeesPaid / expectedFees) * 100 : 0, expectedFees, totalFeesPaid, remainingFees, overdueFees, overdueStudents, isPastTerm: now > new Date(term.endDate), termEndDate: term.endDate, feeStructures: feeStructures.map(f => ({ feeType: f.feeType, amount: f.amount, isOptional: f.isOptional, frequency: f.frequency })) };
  }

  async getStudentFeeStatus(studentId: string, termId: string, schoolId?: string, superAdmin = false) {
    const { totalExpected, breakdown } = await this.computeExpectedFeesForStudent(studentId, termId, schoolId, superAdmin);
    const payments = await this.paymentRepo.find({ where: { student: { id: studentId }, termId, status: 'completed', ...(schoolId ? { schoolId } : {}) } });
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = Math.max(0, totalExpected - totalPaid);
    return { studentId, termId, totalExpected, totalPaid, outstanding, paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0, payments: payments.map(p => ({ id: p.id, amount: Number(p.amount), date: p.paymentDate, method: p.paymentMethod, receiptNumber: p.receiptNumber })), feeBreakdown: breakdown };
  }

  async listStudentFeeStatuses(termId: string, schoolId?: string, superAdmin = false) {
    const [students, payments, feeStructures, term] = await Promise.all([
      this.studentRepo.find({ where: { termId, ...(schoolId && !superAdmin ? { schoolId } : {}) } }),
      this.paymentRepo.find({ where: { termId, status: 'completed', ...(schoolId ? { schoolId } : {}) }, relations: ['student'] }),
      this.feeStructureRepo.find({ where: { termId, isActive: true, ...(schoolId ? { schoolId } : {}) } }),
      this.termRepo.findOne({ where: { id: termId } })
    ]);
    const pastEnd = term ? new Date() > new Date(term.endDate) : false;
    const perStudentMandatoryTotal = feeStructures.filter(f => !f.isOptional).reduce((s, f) => s + Number(f.amount), 0);
    const paidMap: Record<string, number> = {};
    payments.forEach(p => { if (p.student?.id) paidMap[p.student.id] = (paidMap[p.student.id] || 0) + Number(p.amount); });
    const statuses = students.map(student => {
      const totalExpected = perStudentMandatoryTotal;
      const totalPaid = paidMap[student.id] || 0;
      const outstanding = Math.max(0, totalExpected - totalPaid);
      const isOverdue = pastEnd && outstanding > 0;
      return { studentId: student.id, humanId: student.studentId, studentName: `${student.firstName} ${student.lastName}`, termId, totalExpected, totalPaid, outstanding, paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0, status: outstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'), isOverdue, overdueAmount: isOverdue ? outstanding : 0 };
    });
    return statuses.sort((a, b) => b.outstanding - a.outstanding);
  }
}