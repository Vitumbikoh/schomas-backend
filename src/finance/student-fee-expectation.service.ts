import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../user/entities/student.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Term } from '../settings/entities/term.entity';
import { CreateFeeStructureDto } from './dtos/fees-structure.dto';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
@Injectable()
export class StudentFeeExpectationService {
  constructor(
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(FeePayment) private paymentRepo: Repository<FeePayment>,
    @InjectRepository(FeeStructure) private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(AcademicCalendar) private academicCalendarRepo: Repository<AcademicCalendar>,
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
    // Check if this is a historical term
    const currentAcademicCalendar = await this.academicCalendarRepo.findOne({
      where: { isActive: true, ...(schoolId && !superAdmin ? { schoolId } : {}) }
    });

    const term = await this.termRepo.findOne({ 
      where: { id: termId }, 
      relations: ['academicCalendar'] 
    });
    
    if (!term) throw new NotFoundException('Term not found');

    let totalStudents: number = 0;
    let isHistoricalTerm = false;

    // If term is completed or not from current academic calendar, use historical data
    if ((term.isCompleted === true) || (currentAcademicCalendar && term.academicCalendar?.id !== currentAcademicCalendar.id)) {
      isHistoricalTerm = true;
      
      // Query historical students from student_academic_history
      const historicalQuery = `
        SELECT COUNT(DISTINCT sah.student_id) as student_count
        FROM student_academic_history sah
        WHERE sah.term_id::uuid = $1
        ${schoolId && !superAdmin ? 'AND sah.school_id = $2' : ''}
      `;
      
      const queryParams = [termId];
      if (schoolId && !superAdmin) queryParams.push(schoolId);
      
      const countResult = await this.studentRepo.query(historicalQuery, queryParams);
      totalStudents = parseInt(countResult[0]?.student_count || 0);
      
      console.log(`📚 Historical term summary: ${totalStudents} students from history table`);
    } else {
      // Use current student assignments for current terms
      const students = await this.studentRepo.find({ where: { termId, ...(schoolId && !superAdmin ? { schoolId } : {}) } });
      totalStudents = students.length;
      
      console.log(`📖 Current term summary: ${totalStudents} current students`);
    }

    const [feeStructures, payments] = await Promise.all([
      this.feeStructureRepo.find({ where: { termId, isActive: true, ...(schoolId ? { schoolId } : {}) } }),
      this.paymentRepo.find({ where: { termId, status: 'completed', ...(schoolId ? { schoolId } : {}) } })
    ]);

    const expectedFees = feeStructures.filter(i => !i.isOptional).reduce((sum, i) => sum + (Number(i.amount) * totalStudents), 0);
    const totalFeesPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const remainingFees = Math.max(0, expectedFees - totalFeesPaid);
    const now = new Date();
    let overdueFees = 0; let overdueStudents = 0;
    
    if (now > new Date(term.endDate)) {
      overdueFees = remainingFees;
      // For historical terms, estimate overdue students based on payment data
      if (isHistoricalTerm) {
        const perStudentExpected = feeStructures.filter(f => !f.isOptional).reduce((s, f) => s + Number(f.amount), 0);
        overdueStudents = totalStudents - (totalFeesPaid > 0 && perStudentExpected > 0 ? Math.floor(totalFeesPaid / perStudentExpected) : 0);
      } else {
        const students = await this.studentRepo.find({ where: { termId, ...(schoolId && !superAdmin ? { schoolId } : {}) } });
        const perStudentExpected = feeStructures.filter(f => !f.isOptional).reduce((s, f) => s + Number(f.amount), 0);
        const paidMap: Record<string, number> = {};
        payments.forEach(p => { const sid = (p.student as any)?.id; if (sid) paidMap[sid] = (paidMap[sid] || 0) + Number(p.amount); });
        overdueStudents = students.reduce((count, st) => { const paid = paidMap[st.id] || 0; const outstanding = Math.max(0, perStudentExpected - paid); return count + (outstanding > 0 ? 1 : 0); }, 0);
      }
    }
    
    return { 
      termId, 
      totalStudents, 
      totalExpectedFees: expectedFees, 
      totalPaidFees: totalFeesPaid, 
      outstandingFees: remainingFees, 
      paymentPercentage: expectedFees > 0 ? (totalFeesPaid / expectedFees) * 100 : 0, 
      expectedFees, 
      totalFeesPaid, 
      remainingFees, 
      overdueFees, 
      overdueStudents, 
      isPastTerm: now > new Date(term.endDate), 
      termEndDate: term.endDate, 
      isHistoricalTerm,
      feeStructures: feeStructures.map(f => ({ feeType: f.feeType, amount: f.amount, isOptional: f.isOptional, frequency: f.frequency })) 
    };
  }

  async getStudentFeeStatus(studentId: string, termId: string, schoolId?: string, superAdmin = false) {
    // Determine if this is a historical term (completed or outside current calendar)
    const currentAcademicCalendar = await this.academicCalendarRepo.findOne({
      where: { isActive: true, ...(schoolId && !superAdmin ? { schoolId } : {}) }
    });
    const term = await this.termRepo.findOne({ where: { id: termId }, relations: ['academicCalendar'] });
    if (!term) throw new NotFoundException('Term not found');

    const payments = await this.paymentRepo.find({ where: { student: { id: studentId }, termId, status: 'completed', ...(schoolId ? { schoolId } : {}) } });
    let totalPaidFromPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
    // Include legacy/orphan credits (no sourcePayment) as part of Paid for the term
    try {
      const orphanCredit = await this.studentRepo.query(
        `SELECT COALESCE(SUM("remainingAmount"), 0) AS sum
         FROM credit_ledger
         WHERE "studentId" = $1 AND "termId" = $2 AND status = 'active'
           AND ("sourcePaymentId" IS NULL)` + (schoolId && !superAdmin ? ` AND "schoolId" = $3` : ``),
        schoolId && !superAdmin ? [studentId, termId, schoolId] : [studentId, termId]
      );
      totalPaidFromPayments += Number(orphanCredit?.[0]?.sum || 0);
    } catch {}

    const isHistoricalTerm = (term.isCompleted === true) || (currentAcademicCalendar && term.academicCalendar?.id !== currentAcademicCalendar.id);
    if (isHistoricalTerm) {
      const historicalQuery = `
        SELECT 
          COALESCE(sah.total_expected_fees, 0) AS total_expected,
          COALESCE(sah.total_paid_fees, 0) AS total_paid,
          COALESCE(sah.outstanding_fees, 0) AS outstanding_amount
        FROM student_academic_history sah
        WHERE sah.term_id::uuid = $1 AND sah.student_id::uuid = $2
        ${schoolId && !superAdmin ? 'AND sah.school_id = $3' : ''}
        LIMIT 1
      `;
      const params: any[] = [termId, studentId];
      if (schoolId && !superAdmin) params.push(schoolId);
      const hist = await this.studentRepo.query(historicalQuery, params);
      const histRow = hist[0] || {};
      
      // If there's a historical record with actual data, use it
      if (histRow && histRow.total_expected != null && Number(histRow.total_expected) > 0) {
        const totalExpected = Number(histRow.total_expected);
        const totalPaid = Number(histRow.total_paid ?? totalPaidFromPayments);
        const outstanding = Number(histRow.outstanding_amount ?? Math.max(0, totalExpected - totalPaid));
        return {
          studentId,
          termId,
          totalExpected,
          totalPaid,
          outstanding,
          paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
          payments: payments.map(p => ({ id: p.id, amount: Number(p.amount), date: p.paymentDate, method: p.paymentMethod, receiptNumber: p.receiptNumber })),
          feeBreakdown: []
        };
      }
      
      // If no historical record exists or it's empty, compute from fee structures
      // This ensures we can still calculate outstanding fees for historical terms
      // that don't have academic history records yet
      const { totalExpected, breakdown } = await this.computeExpectedFeesForStudent(studentId, termId, schoolId, superAdmin);
      const totalPaid = totalPaidFromPayments;
      const outstanding = Math.max(0, totalExpected - totalPaid);
      return {
        studentId,
        termId,
        totalExpected,
        totalPaid,
        outstanding,
        paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
        payments: payments.map(p => ({ id: p.id, amount: Number(p.amount), date: p.paymentDate, method: p.paymentMethod, receiptNumber: p.receiptNumber })),
        feeBreakdown: breakdown
      };
    } else {
      const { totalExpected, breakdown } = await this.computeExpectedFeesForStudent(studentId, termId, schoolId, superAdmin);
      const totalPaid = totalPaidFromPayments;
      const outstanding = Math.max(0, totalExpected - totalPaid);
      return {
        studentId,
        termId,
        totalExpected,
        totalPaid,
        outstanding,
        paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
        payments: payments.map(p => ({ id: p.id, amount: Number(p.amount), date: p.paymentDate, method: p.paymentMethod, receiptNumber: p.receiptNumber })),
        feeBreakdown: breakdown
      };
    }
  }

  async listStudentFeeStatuses(termId: string, schoolId?: string, superAdmin = false) {
    // First check if this is a current term or historical term
    const currentAcademicCalendar = await this.academicCalendarRepo.findOne({
      where: { isActive: true, ...(schoolId && !superAdmin ? { schoolId } : {}) }
    });

    let students: any[] = [];
    let isHistoricalTerm = false;

    // Check if term belongs to current academic calendar
    const term = await this.termRepo.findOne({ 
      where: { id: termId }, 
      relations: ['academicCalendar'] 
    });
    
    if (!term) {
      throw new NotFoundException('Term not found');
    }

    // Get the actual current term (the one marked as isCurrent = true)
    const currentTerm = await this.termRepo.findOne({
      where: { isCurrent: true, ...(schoolId && !superAdmin ? { schoolId } : {}) }
    });

    // Treat as historical if:
    // 1. Term is explicitly marked as completed, OR
    // 2. Term is from a different academic calendar, OR
    // 3. Term is not the current term (even if in same calendar)
    if (
      (term.isCompleted === true) || 
      (currentAcademicCalendar && term.academicCalendar?.id !== currentAcademicCalendar.id) ||
      (currentTerm && term.id !== currentTerm.id)
    ) {
      isHistoricalTerm = true;
      
      // Query historical students from student_academic_history
      const historicalQuery = `
        SELECT DISTINCT
          sah.student_id,
          s."firstName",
          s."lastName", 
          s."studentId" as "humanId",
          sah.term_id,
          sah.status as history_status,
          COALESCE(sah.total_expected_fees, 0) AS total_expected,
          COALESCE(sah.total_paid_fees, 0) AS total_paid,
          COALESCE(sah.outstanding_fees, 0) AS outstanding_amount
        FROM student_academic_history sah
        LEFT JOIN student s ON sah.student_id = s.id
        WHERE sah.term_id::uuid = $1
        ${schoolId && !superAdmin ? 'AND sah.school_id = $2' : ''}
        ORDER BY s."firstName", s."lastName"
      `;
      
      const queryParams = [termId];
      if (schoolId && !superAdmin) queryParams.push(schoolId);
      
      const historicalResults = await this.studentRepo.query(historicalQuery, queryParams);
      
      students = historicalResults.map((row: any) => ({
        id: row.student_id,
        firstName: row.firstName,
        lastName: row.lastName,
        studentId: row.humanId,
        termId: row.term_id,
        isHistorical: true,
        historyStatus: row.history_status,
        histTotalExpected: Number(row.total_expected || 0),
        histTotalPaid: Number(row.total_paid || 0),
        histOutstanding: Number(row.outstanding_amount || 0)
      }));

      console.log(`📚 Historical term ${term.termNumber} from ${term.academicCalendar?.term}: Found ${students.length} historical students`);
    } else {
      // Use current student assignments for current terms - exclude inactive students (graduated, transferred, etc.)
      students = await this.studentRepo.find({ 
        where: { termId, isActive: true, ...(schoolId && !superAdmin ? { schoolId } : {}) } 
      });
      
      console.log(`📖 Current term ${term.termNumber}: Found ${students.length} active students`);
    }

    const [payments, feeStructures] = await Promise.all([
      this.paymentRepo.find({ where: { termId, status: 'completed', ...(schoolId ? { schoolId } : {}) }, relations: ['student'] }),
      this.feeStructureRepo.find({ where: { termId, isActive: true, ...(schoolId ? { schoolId } : {}) } })
    ]);

    // Aggregate orphan credits (no sourcePayment) by student for this term
    let orphanCreditsByStudent: Record<string, number> = {};
    try {
      const orphanRows = await this.studentRepo.query(
        `SELECT "studentId" as sid, COALESCE(SUM("remainingAmount"),0) as sum
         FROM credit_ledger
         WHERE "termId" = $1 AND status = 'active' AND ("sourcePaymentId" IS NULL)
         ${schoolId && !superAdmin ? 'AND "schoolId" = $2' : ''}
         GROUP BY "studentId"`,
        schoolId && !superAdmin ? [termId, schoolId] : [termId]
      );
      orphanRows.forEach((r: any) => { orphanCreditsByStudent[r.sid] = Number(r.sum || 0); });
    } catch {}

    const pastEnd = term ? new Date() > new Date(term.endDate) : false;
    const perStudentMandatoryTotal = feeStructures.filter(f => !f.isOptional).reduce((s, f) => s + Number(f.amount), 0);
    const paidMap: Record<string, number> = {};
    payments.forEach(p => { if (p.student?.id) paidMap[p.student.id] = (paidMap[p.student.id] || 0) + Number(p.amount); });
    // Add orphan credits to paid map
    Object.entries(orphanCreditsByStudent).forEach(([sid, sum]) => {
      paidMap[sid] = (paidMap[sid] || 0) + Number(sum || 0);
    });
    
    const statuses = students.map(student => {
      const isOverdueHist = pastEnd && (student.histOutstanding ?? 0) > 0;
      if (isHistoricalTerm) {
        const totalExpected = Number(student.histTotalExpected ?? 0);
        const totalPaid = Number(student.histTotalPaid ?? 0);
        const outstanding = Number(student.histOutstanding ?? Math.max(0, totalExpected - totalPaid));
        return {
          studentId: student.id,
          humanId: student.studentId || student.humanId,
          studentName: `${student.firstName} ${student.lastName}`,
          termId,
          totalExpected,
          totalPaid,
          outstanding,
          paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
          status: outstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
          isOverdue: isOverdueHist,
          overdueAmount: isOverdueHist ? outstanding : 0,
          isHistorical: true,
          historyStatus: student.historyStatus || null
        };
      } else {
        const totalExpected = perStudentMandatoryTotal;
        const totalPaid = paidMap[student.id] || 0;
        const outstanding = Math.max(0, totalExpected - totalPaid);
        const isOverdue = pastEnd && outstanding > 0;
        return {
          studentId: student.id,
          humanId: student.studentId || student.humanId,
          studentName: `${student.firstName} ${student.lastName}`,
          termId,
          totalExpected,
          totalPaid,
          outstanding,
          paymentPercentage: totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0,
          status: outstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid'),
          isOverdue,
          overdueAmount: isOverdue ? outstanding : 0,
          isHistorical: false,
          historyStatus: student.historyStatus || null
        };
      }
    });
    
    return statuses.sort((a, b) => b.outstanding - a.outstanding);
  }
}