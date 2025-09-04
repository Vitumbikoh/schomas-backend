import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from './logs.entity';

export interface LogEntry {
  action: string;
  module: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  schoolId?: string; // tenant scope
  performedBy?: {
    id: string;
    email?: string | null;
    role: string;
    name?: string;
  };
  entityId?: string;
  entityType?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
  errorMessage?: string;
  stackTrace?: string;
}

@Injectable()
export class SystemLoggingService {
  private readonly logger = new Logger(SystemLoggingService.name);

  constructor(
    @InjectRepository(Log)
    private logRepository: Repository<Log>,
  ) {}

  async logAction(logEntry: LogEntry): Promise<void> {
    try {
      const log = this.logRepository.create({
        action: logEntry.action,
        module: logEntry.module,
        level: logEntry.level,
        performedBy: logEntry.performedBy,
        schoolId: logEntry.schoolId || logEntry.performedBy?.['schoolId'],
        entityId: logEntry.entityId,
        entityType: logEntry.entityType,
        oldValues: logEntry.oldValues,
        newValues: logEntry.newValues,
        metadata: {
          ...logEntry.metadata,
          timestamp: new Date().toISOString(),
          duration: logEntry.duration,
          errorMessage: logEntry.errorMessage,
          stackTrace: logEntry.stackTrace
        },
        ipAddress: logEntry.ipAddress,
        userAgent: logEntry.userAgent,
      });

      await this.logRepository.save(log);

      // Also log to console based on level
      const message = `[${logEntry.module}] ${logEntry.action}`;
      const context = {
        entityId: logEntry.entityId,
        entityType: logEntry.entityType,
        performedBy: logEntry.performedBy?.email,
        duration: logEntry.duration
      };

      switch (logEntry.level) {
        case 'error':
          this.logger.error(message, logEntry.stackTrace, context);
          break;
        case 'warn':
          this.logger.warn(message, context);
          break;
        case 'debug':
          this.logger.debug(message, context);
          break;
        default:
          this.logger.log(message, context);
      }

    } catch (error) {
      // Don't let logging errors break the application
      this.logger.error('Failed to save log entry', error.stack);
    }
  }

  // Finance Module Specific Logging
  async logFeePaymentCreated(paymentId: string, studentId: string, amount: number, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'FEE_PAYMENT_CREATED',
      module: 'FINANCE',
      level: 'info',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: paymentId,
      entityType: 'FeePayment',
      newValues: {
        studentId,
        amount,
        paymentId
      },
      metadata: {
        description: `Fee payment of $${amount} created for student ${studentId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  async logFeePaymentProcessed(paymentId: string, studentId: string, amount: number, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'FEE_PAYMENT_PROCESSED',
      module: 'FINANCE',
      level: 'info',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: paymentId,
      entityType: 'FeePayment',
      newValues: {
        studentId,
        amount,
        status: 'completed'
      },
      metadata: {
        description: `Fee payment of $${amount} processed for student ${studentId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  async logFeeStructureUpdated(feeStructureId: string, changes: any, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'FEE_STRUCTURE_UPDATED',
      module: 'FINANCE',
      level: 'info',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: feeStructureId,
      entityType: 'FeeStructure',
      oldValues: changes.oldValues,
      newValues: changes.newValues,
      metadata: {
        description: 'Fee structure configuration updated'
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  // Learning Materials Module Specific Logging
  async logLearningMaterialCreated(materialId: string, teacherId: string, courseId: string, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'LEARNING_MATERIAL_CREATED',
      module: 'LEARNING_MATERIALS',
      level: 'info',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: materialId,
      entityType: 'LearningMaterial',
      newValues: {
        teacherId,
        courseId,
        materialId
      },
      metadata: {
        description: `Learning material created by teacher ${teacherId} for course ${courseId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  async logLearningMaterialAccessed(materialId: string, studentId: string, request: any, schoolId?: string) {
    await this.logAction({
      action: 'LEARNING_MATERIAL_ACCESSED',
      module: 'LEARNING_MATERIALS',
      level: 'info',
      schoolId,
      entityId: materialId,
      entityType: 'LearningMaterial',
      metadata: {
        studentId,
        description: `Learning material accessed by student ${studentId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  // Academic Year Module Specific Logging
  async logAcademicYearChanged(oldYearId: string, newYearId: string, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'ACADEMIC_YEAR_CHANGED',
      module: 'SETTINGS',
      level: 'warn',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: newYearId,
      entityType: 'AcademicYear',
      oldValues: { academicYearId: oldYearId },
      newValues: { academicYearId: newYearId },
      metadata: {
        description: 'Current academic year changed - this affects all fee payments and learning materials'
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  // Enrollment Module Specific Logging
  async logStudentEnrolled(enrollmentId: string, studentId: string, courseId: string, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'STUDENT_ENROLLED',
      module: 'ENROLLMENT',
      level: 'info',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: enrollmentId,
      entityType: 'Enrollment',
      newValues: {
        studentId,
        courseId,
        enrollmentId
      },
      metadata: {
        description: `Student ${studentId} enrolled in course ${courseId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  async logStudentUnenrolled(studentId: string, courseId: string, performedBy: any, request: any, schoolId?: string) {
    await this.logAction({
      action: 'STUDENT_UNENROLLED',
      module: 'ENROLLMENT',
      level: 'warn',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityType: 'Enrollment',
      oldValues: {
        studentId,
        courseId
      },
      metadata: {
        description: `Student ${studentId} unenrolled from course ${courseId}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  // System Events Logging
  async logSystemError(error: Error, module: string, action: string, metadata?: any, schoolId?: string) {
    await this.logAction({
      action: action || 'SYSTEM_ERROR',
      module: module || 'SYSTEM',
      level: 'error',
      schoolId,
      errorMessage: error.message,
      stackTrace: error.stack,
      metadata: {
        ...metadata,
        description: 'System error occurred'
      }
    });
  }

  async logDatabaseOperation(operation: string, table: string, recordId: string, duration: number, performedBy?: any, schoolId?: string) {
    await this.logAction({
      action: `DATABASE_${operation.toUpperCase()}`,
      module: 'DATABASE',
      level: 'debug',
      schoolId: schoolId || performedBy?.schoolId,
      performedBy,
      entityId: recordId,
      entityType: table,
      duration,
      metadata: {
        description: `Database ${operation} operation on ${table}`
      }
    });
  }

  async logSecurityEvent(event: string, userId: string, severity: 'low' | 'medium' | 'high', request: any, schoolId?: string) {
    await this.logAction({
      action: `SECURITY_${event.toUpperCase()}`,
      module: 'SECURITY',
      level: severity === 'high' ? 'error' : severity === 'medium' ? 'warn' : 'info',
      schoolId,
      entityId: userId,
      entityType: 'User',
      metadata: {
        severity,
        description: `Security event: ${event}`
      },
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent']
    });
  }

  // Query methods for logs
  async getLogsByModule(module: string, limit: number = 100, schoolId?: string, superAdmin = false) {
    const qb = this.logRepository.createQueryBuilder('log')
      .where('log.module = :module', { module })
      .orderBy('log.timestamp', 'DESC')
      .take(limit);
    if (!superAdmin) {
      if (schoolId) qb.andWhere('log.schoolId = :schoolId', { schoolId }); else return [];
    } else if (schoolId) {
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }

  async getLogsByUser(userId: string, limit: number = 100, schoolId?: string, superAdmin = false) {
    const qb = this.logRepository
      .createQueryBuilder('log')
      .where("log.performedBy->>'id' = :userId", { userId })
      .orderBy('log.timestamp', 'DESC')
      .limit(limit);
    if (!superAdmin) {
      if (schoolId) qb.andWhere('log.schoolId = :schoolId', { schoolId }); else return [];
    } else if (schoolId) {
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }

  async getSystemErrorLogs(limit: number = 50, schoolId?: string, superAdmin = false) {
    const qb = this.logRepository.createQueryBuilder('log')
      .where('log.level = :level', { level: 'error' })
      .orderBy('log.timestamp', 'DESC')
      .take(limit);
    if (!superAdmin) {
      if (schoolId) qb.andWhere('log.schoolId = :schoolId', { schoolId }); else return [];
    } else if (schoolId) {
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }

  async getLogsByEntity(entityType: string, entityId: string, schoolId?: string, superAdmin = false) {
    const qb = this.logRepository.createQueryBuilder('log')
      .where('log.entityType = :entityType AND log.entityId = :entityId', { entityType, entityId })
      .orderBy('log.timestamp', 'ASC');
    if (!superAdmin) {
      if (schoolId) qb.andWhere('log.schoolId = :schoolId', { schoolId }); else return [];
    } else if (schoolId) {
      qb.andWhere('log.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }
}
