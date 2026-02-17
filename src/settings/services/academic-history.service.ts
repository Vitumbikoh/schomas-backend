import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Term } from '../entities/term.entity';
import { AcademicCalendar } from '../entities/academic-calendar.entity';
import { Student } from '../../user/entities/student.entity';
import { Enrollment } from '../../enrollment/entities/enrollment.entity';
import { FeePayment } from '../../finance/entities/fee-payment.entity';
import { FeeStructure } from '../../finance/entities/fee-structure.entity';

export interface TermHistoricalData {
  termId: string;
  academicCalendarId: string;
  totalStudents: number;
  studentsPreserved: number;
  paymentRecords: number;
  feeStructures: number;
  examResultsPreserved?: number;
  preservationDate: Date;
}

export interface AcademicCalendarHistoricalData {
  academicCalendarId: string;
  totalTerms: number;
  totalStudents: number;
  studentsPreserved: number;
  paymentRecords: number;
  examResultsPreserved?: number;
  preservationDate: Date;
}

@Injectable()
export class AcademicHistoryService {
  private readonly logger = new Logger(AcademicHistoryService.name);

  constructor(
    @InjectRepository(Term)
    private termRepository: Repository<Term>,
    @InjectRepository(AcademicCalendar)
    private academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Enrollment)
    private enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(FeePayment)
    private feePaymentRepository: Repository<FeePayment>,
    @InjectRepository(FeeStructure)
    private feeStructureRepository: Repository<FeeStructure>,
    private dataSource: DataSource,
  ) {}

  /**
   * Close a term and preserve all historical student data
   */
  async closeTerm(termId: string, schoolId?: string, superAdmin = false): Promise<TermHistoricalData> {
    this.logger.log(`Starting term closure process for term: ${termId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Verify term exists and belongs to school
      const term = await this.termRepository.findOne({
        where: { 
          id: termId,
          ...(schoolId && !superAdmin ? { schoolId } : {})
        },
        relations: ['academicCalendar']
      });

      if (!term) {
        throw new NotFoundException('Term not found or access denied');
      }

      if (term.isCompleted) {
        throw new BadRequestException('Term is already closed');
      }

      this.logger.log(`Closing term: ${term.academicCalendar?.term} Term ${term.termNumber}`);

      // 2. Get all students enrolled in this term
      const enrolledStudents = await this.studentRepository.find({
        where: { 
          termId: termId,
          ...(schoolId && !superAdmin ? { schoolId } : {})
        },
        relations: ['class','user']
      });

      this.logger.log(`Found ${enrolledStudents.length} students to preserve`);

      // 3. Create comprehensive historical records for all enrolled students
      let studentsPreserved = 0;
      for (const student of enrolledStudents) {
        // Get comprehensive student data including financial and academic info
        const [studentPayments, studentFeeStructures, studentEnrollments] = await Promise.all([
          this.feePaymentRepository.find({
            where: { studentId: student.id, termId: termId, status: 'completed' }
          }),
          this.feeStructureRepository.find({
            where: { termId: termId, isActive: true }
          }),
          this.enrollmentRepository.find({
            where: { studentId: student.id, termId: termId },
            relations: ['course']
          })
        ]);

        // Calculate financial totals
        const totalPaidFees = studentPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const applicableFeeStructures = studentFeeStructures.filter(fs => 
          !fs.classId || fs.classId === student.class?.id
        );
        const totalExpectedFees = applicableFeeStructures
          .filter(fs => !fs.isOptional)
          .reduce((sum, fs) => sum + Number(fs.amount), 0);
        const outstandingFees = Math.max(0, totalExpectedFees - totalPaidFees);

        // Get last payment date
        const lastPaymentDate = studentPayments.length > 0 
          ? studentPayments.reduce((latest, payment) => 
              payment.paymentDate > latest ? payment.paymentDate : latest, 
              studentPayments[0].paymentDate
            )
          : null;

        // Create comprehensive historical record
        const historicalRecord = await queryRunner.manager.query(`
          INSERT INTO student_academic_history (
            student_id, academic_calendar_id, term_id, term_number,
            academic_year, enrollment_date, status, is_current, 
            school_id, class_id, class_name, student_number,
            first_name, last_name, email, phone_number, date_of_birth,
            gender, address, guardian_name, guardian_phone, guardian_email,
            admission_date, final_status, completion_reason,
            total_expected_fees, total_paid_fees, outstanding_fees,
            last_payment_date, grade_level, promoted_to_next_level,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, NOW(), NOW()
          )
          ON CONFLICT (student_id, term_id) DO UPDATE SET
            status = 'completed',
            final_status = $24,
            total_expected_fees = $26,
            total_paid_fees = $27,
            outstanding_fees = $28,
            last_payment_date = $29,
            updated_at = NOW()
          RETURNING id
        `, [
          student.id,
          term.academicCalendar?.id || null,
          termId,
          term.termNumber,
          term.academicCalendar?.term || 'Unknown',
          student.createdAt || new Date(),
          'completed', // Mark as completed since term is closing
          false, // No longer current
          student.schoolId,
          student.class?.id || null,
          student.class?.name || null,
          student.studentId,
          student.firstName,
          student.lastName,
          student.user?.email || null,
          student.phoneNumber || null,
          student.dateOfBirth || null,
          student.gender || null,
          student.address || null,
          null,
          null,
          null,
          student.createdAt,
          'completed', // final_status
          `Term ${term.termNumber} completed on ${new Date().toISOString().split('T')[0]}`, // completion_reason
          totalExpectedFees,
          totalPaidFees,
          outstandingFees,
          lastPaymentDate,
          student.class?.name || null, // grade_level
          false // promoted_to_next_level (to be updated later if needed)
        ]);

        if (historicalRecord.length > 0) {
          studentsPreserved++;
        }
      }

      // 4. Snapshot exam results for this term
      // Insert per-course exam result aggregates into exam_result_history (immutable)
      const examInsert = await queryRunner.manager.query(`
        INSERT INTO exam_result_history (school_id, academic_calendar_id, term_id, student_id, course_id, final_percentage, grade)
        SELECT 
          s."schoolId" as school_id,
          t."academicCalendarId" as academic_calendar_id,
          t.id as term_id,
          er.studentId as student_id,
          er.courseId as course_id,
          er.finalPercentage as final_percentage,
          er.grade as grade
        FROM exam_result er
        INNER JOIN term t ON t.id = er.termId::uuid
        INNER JOIN student s ON s.id = er.studentId::uuid
        WHERE er.termId::uuid = $1
        ON CONFLICT (student_id, term_id, course_id)
        DO UPDATE SET final_percentage = EXCLUDED.final_percentage, grade = EXCLUDED.grade
        RETURNING id;
      `, [termId]);

      const examResultsPreserved = Array.isArray(examInsert) ? examInsert.length : 0;

      // 5. Get payment and fee structure counts for reporting
      const [payments, feeStructures] = await Promise.all([
        this.feePaymentRepository.count({
          where: { 
            termId: termId,
            status: 'completed',
            ...(schoolId && !superAdmin ? { schoolId } : {})
          }
        }),
        this.feeStructureRepository.count({
          where: { 
            termId: termId,
            isActive: true,
            ...(schoolId && !superAdmin ? { schoolId } : {})
          }
        })
      ]);

      // 5. Update term metadata to indicate closure
      await queryRunner.manager.query(`
        UPDATE term 
        SET "updatedAt" = NOW()
        WHERE id = $1
      `, [termId]);
      
      // Note: We don't have a status field in term table, but we track closure via historical data

      await queryRunner.commitTransaction();

      const historicalData: TermHistoricalData = {
        termId,
        academicCalendarId: term.academicCalendar?.id || '',
        totalStudents: enrolledStudents.length,
        studentsPreserved,
        paymentRecords: payments,
        feeStructures,
        examResultsPreserved,
        preservationDate: new Date()
      };

      this.logger.log(`Term closure completed successfully:`, historicalData);
      return historicalData;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to close term: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Close an academic calendar and preserve all historical student data
   */
  async closeAcademicCalendar(academicCalendarId: string, schoolId?: string, superAdmin = false): Promise<AcademicCalendarHistoricalData> {
    this.logger.log(`Starting academic calendar closure process for: ${academicCalendarId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Verify academic calendar exists and belongs to school
      const academicCalendar = await this.academicCalendarRepository.findOne({
        where: { 
          id: academicCalendarId,
          ...(schoolId && !superAdmin ? { schoolId } : {})
        },
        relations: ['terms']
      });

      if (!academicCalendar) {
        throw new NotFoundException('Academic calendar not found or access denied');
      }

      if (!academicCalendar.isActive) {
        throw new BadRequestException('Academic calendar is already closed');
      }

      this.logger.log(`Closing academic calendar: ${academicCalendar.term}`);

      // 2. Get all terms in this academic calendar
      const terms = academicCalendar.terms || [];
      this.logger.log(`Found ${terms.length} terms to process`);

      let totalStudentsPreserved = 0;
      let totalPaymentRecords = 0;
      let totalExamResultsPreserved = 0;

      // 3. Close all terms that aren't already closed and preserve historical data
      for (const term of terms) {
        // Check if term already has historical data (indicating it was closed)
        const existingHistoricalData = await queryRunner.manager.query(`
          SELECT COUNT(*) as count FROM student_academic_history 
          WHERE term_id::uuid = $1
        `, [term.id]);
        
        const hasHistoricalData = parseInt(existingHistoricalData[0]?.count || 0) > 0;
        
        if (!hasHistoricalData) {
          this.logger.log(`Auto-closing term: ${term.termNumber} (no historical data found)`);
          const termData = await this.closeTerm(term.id, schoolId, superAdmin);
          totalStudentsPreserved += termData.studentsPreserved;
          totalPaymentRecords += termData.paymentRecords;
          totalExamResultsPreserved += termData.examResultsPreserved || 0;
        } else {
          this.logger.log(`Term ${term.termNumber} already has historical data`);
          // For already closed terms, just count the preserved data
          totalStudentsPreserved += parseInt(existingHistoricalData[0]?.count || 0);
          
          // Count payment records for this term
          const paymentCount = await queryRunner.manager.query(`
            SELECT COUNT(*) as count FROM fee_payment 
            WHERE "termId"::uuid = $1 AND status = 'completed'
          `, [term.id]);
          totalPaymentRecords += parseInt(paymentCount[0]?.count || 0);

          // Count exam result snapshots for this term
          const examCount = await queryRunner.manager.query(`
            SELECT COUNT(*) as count FROM exam_result_history 
            WHERE term_id::uuid = $1
          `, [term.id]);
          totalExamResultsPreserved += parseInt(examCount[0]?.count || 0);
        }
      }

      // 4. Get total unique students across all terms in this calendar
      const totalUniqueStudents = await queryRunner.manager.query(`
        SELECT COUNT(DISTINCT sah.student_id) as count
        FROM student_academic_history sah
        WHERE sah.academic_calendar_id::uuid = $1
      `, [academicCalendarId]);

      const uniqueStudentCount = parseInt(totalUniqueStudents[0]?.count || 0);

      // 5. Mark academic calendar as inactive (closed)
      await queryRunner.manager.update(AcademicCalendar, academicCalendarId, {
        isActive: false,
        updatedAt: new Date()
      });

      await queryRunner.commitTransaction();

      const historicalData: AcademicCalendarHistoricalData = {
        academicCalendarId,
        totalTerms: terms.length,
        totalStudents: uniqueStudentCount,
        studentsPreserved: totalStudentsPreserved,
        paymentRecords: totalPaymentRecords,
        examResultsPreserved: totalExamResultsPreserved,
        preservationDate: new Date()
      };

      this.logger.log(`Academic calendar closure completed successfully:`, historicalData);
      return historicalData;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to close academic calendar: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get historical data summary for a term
   */
  async getTermHistoricalSummary(termId: string, schoolId?: string, superAdmin = false) {
    const historicalQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_students,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_students,
        MIN(created_at) as earliest_preservation,
        MAX(updated_at) as latest_update
      FROM student_academic_history sah
      WHERE sah.term_id::uuid = $1
      ${schoolId && !superAdmin ? 'AND sah.school_id = $2' : ''}
    `;

    const queryParams = [termId];
    if (schoolId && !superAdmin) queryParams.push(schoolId);

    const result = await this.dataSource.query(historicalQuery, queryParams);
    return result[0] || {};
  }

  /**
   * Get historical data summary for an academic calendar
   */
  async getAcademicCalendarHistoricalSummary(academicCalendarId: string, schoolId?: string, superAdmin = false) {
    const historicalQuery = `
      SELECT 
        COUNT(DISTINCT sah.term_id) as total_terms,
        COUNT(DISTINCT sah.student_id) as unique_students,
        COUNT(*) as total_records,
        COUNT(CASE WHEN sah.status = 'completed' THEN 1 END) as completed_records,
        MIN(sah.created_at) as earliest_preservation,
        MAX(sah.updated_at) as latest_update
      FROM student_academic_history sah
      WHERE sah.academic_calendar_id::uuid = $1
      ${schoolId && !superAdmin ? 'AND sah.school_id = $2' : ''}
    `;

    const queryParams = [academicCalendarId];
    if (schoolId && !superAdmin) queryParams.push(schoolId);

    const result = await this.dataSource.query(historicalQuery, queryParams);
    return result[0] || {};
  }
}