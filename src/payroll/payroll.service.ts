import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { SalaryRun } from './entities/salary-run.entity';
import { SalaryItem } from './entities/salary-item.entity';
import { PayrollApprovalHistory } from './entities/payroll-approval-history.entity';
import { PayComponent } from './entities/pay-component.entity';
import { StaffPayAssignment } from './entities/staff-pay-assignment.entity';
import { User } from '../user/entities/user.entity';
import { School } from '../school/entities/school.entity';
import { CreateRunDto } from './dtos/create-run.dto';
import { CreatePayComponentDto, UpdatePayComponentDto } from './dtos/pay-component.dto';
import { CreateStaffAssignmentDto, UpdateStaffAssignmentDto } from './dtos/staff-assignment.dto';
import { SystemLoggingService } from '../logs/system-logging.service';
import { Log } from '../logs/logs.entity';
import { Expense, ExpenseCategory, ExpenseStatus, ExpensePriority } from '../expenses/entities/expense.entity';
import { Role } from '../user/enums/role.enum';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(SalaryRun) private readonly runRepo: Repository<SalaryRun>,
    @InjectRepository(SalaryItem) private readonly itemRepo: Repository<SalaryItem>,
    @InjectRepository(PayrollApprovalHistory) private readonly historyRepo: Repository<PayrollApprovalHistory>,
    @InjectRepository(PayComponent) private readonly compRepo: Repository<PayComponent>,
    @InjectRepository(StaffPayAssignment) private readonly assignRepo: Repository<StaffPayAssignment>,
  @InjectRepository(User) private readonly userRepository: Repository<User>,
  @InjectRepository(School) private readonly schoolRepository: Repository<School>,
  @InjectRepository(Log) private readonly logRepository: Repository<Log>,
    @InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>,
    private readonly dataSource: DataSource,
    private readonly logger: SystemLoggingService,
  ) {}

  private formatDate(date: Date | null | string): string {
    if (!date) return '';
    if (typeof date === 'string') return date.split('T')[0];
    if (date instanceof Date) return date.toISOString().split('T')[0];
    return '';
  }

  private getStaffName(user: any): string {
    if (!user) return 'Unknown User';
    
    // Check for teacher role
    if (user.teacher) {
      return `${user.teacher.firstName} ${user.teacher.lastName}`;
    }
    
    // Check for finance role
    if (user.finance) {
      return `${user.finance.firstName} ${user.finance.lastName}`;
    }
    
    // Fallback to username or email
    return user.username || user.email || 'Unknown User';
  }

  private getDepartmentFromUser(user: any): string {
    if (!user) return 'Unknown';
    
    // Check for teacher role
    if (user.teacher) {
      return 'Teaching';
    }
    
    // Check for finance role
    if (user.finance) {
      return user.finance.department || 'Finance';
    }
    
    // Default based on role
    switch (user.role) {
      case 'ADMIN':
        return 'Administration';
      case 'LIBRARIAN':
        return 'Library';
      default:
        return 'General';
    }
  }

  private async createSalaryItemsForStaff(runId: string, staffIds: string[], schoolId: string): Promise<void> {
    // Load staff with their base profile
    const staffWithAssignments = await this.userRepository.find({
      where: {
        id: In(staffIds),
        schoolId,
        isActive: true,
      },
      relations: ['teacher', 'finance'],
    });

    // Load all active manual assignments for these staff members
    const assignments = await this.assignRepo.find({
      where: {
        userId: In(staffIds),
        schoolId,
        isActive: true,
      },
      relations: ['component'],
    });

    // Group manual assignments by staff member
    const staffAssignments = new Map<string, any[]>();
    assignments.forEach(assignment => {
      if (!staffAssignments.has(assignment.userId)) {
        staffAssignments.set(assignment.userId, []);
      }
      staffAssignments.get(assignment.userId)!.push(assignment);
    });

    // Load auto-assign pay components for virtual inclusion
    const autoAssignComponents = await this.compRepo.find({
      where: { schoolId, autoAssign: true },
      order: { department: 'ASC', createdAt: 'ASC' }, // Prioritize department-specific first
    });

    // Create salary items
    const salaryItems: any[] = [];
    for (const staff of staffWithAssignments) {
      const userAssignments = staffAssignments.get(staff.id) || [];
      const staffDepartment = this.getDepartmentFromUser(staff);

      // Create a map to track which components this staff already has manual assignments for
      const manualComponentIds = new Set(userAssignments.map(a => a.componentId));

      // Apply auto-assign logic with proper hierarchy:
      // 1. Individual assignments (already loaded)
      // 2. Department-specific auto-assignments (only if no individual assignment exists)
      // 3. System-wide auto-assignments (only if no department or individual assignment exists)
      
      const autoAssignments: any[] = [];
      const assignedComponentTypes = new Set<string>();

      // First, track what component types are already manually assigned
      userAssignments.forEach(assignment => {
        assignedComponentTypes.add(`${assignment.component.type}-${assignment.component.name}`);
      });

      // Apply auto-assignments with hierarchy
      for (const component of autoAssignComponents) {
        // Skip if staff already has a manual assignment for this exact component
        if (manualComponentIds.has(component.id)) {
          continue;
        }

        // Check component applicability based on department hierarchy
        const isApplicable = this.isAutoAssignComponentApplicable(component, staffDepartment, assignedComponentTypes);
        
        if (isApplicable) {
          autoAssignments.push({
            component,
            amount: component.defaultAmount || 0,
            isAutoAssigned: true,
          });
          
          // Mark this component type as assigned to prevent duplicate auto-assignments
          assignedComponentTypes.add(`${component.type}-${component.name}`);
        }
      }

      const allAssignments = [...userAssignments, ...autoAssignments];
      
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;
      let employerContrib = 0;
      const breakdown: any = {};

      for (const assignment of allAssignments) {
        const amount = Number(assignment.amount);
        const componentName = assignment.isAutoAssigned ? `${assignment.component.name} (Auto)` : assignment.component.name;
        breakdown[componentName] = {
          amount: amount,
          type: assignment.component.type,
          autoAssigned: assignment.isAutoAssigned || false,
          componentId: assignment.component.id,
        };

        if (assignment.component.type === 'BASIC' || assignment.component.type === 'ALLOWANCE') {
          // Basic pay and allowances ADD to gross pay
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          // Deductions SUBTRACT from net pay
          deductions += amount;
        } else if (assignment.component.type === 'EMPLOYER_CONTRIBUTION') {
          // Employer contributions don't affect employee's gross/net pay
          // but add to total employer cost
          employerContrib += amount;
        }
      }

      const netPay = grossPay - deductions;

      // Skip zero-amount items
      if (grossPay <= 0 && netPay <= 0) continue;

      const salaryItem = this.itemRepo.create({
        runId,
        userId: staff.id,
        staffName: this.getStaffName(staff),
        department: staffDepartment,
        breakdown,
        grossPay,
        taxablePay,
        paye: 0,
        nhif: 0,
        nssf: 0,
        otherDeductions: deductions,
        netPay,
        employerContrib,
        schoolId,
      });

      salaryItems.push(salaryItem);
    }

    if (salaryItems.length > 0) {
      await this.itemRepo.save(salaryItems);
    }
  }

  private isAutoAssignComponentApplicable(component: any, staffDepartment: string, assignedComponentTypes: Set<string>): boolean {
    // Check if this component type and name combination is already assigned
    const componentKey = `${component.type}-${component.name}`;
    if (assignedComponentTypes.has(componentKey)) {
      return false;
    }

    // Department-specific components have priority over system-wide
    if (component.department) {
      // Only apply if staff is in the specified department
      return component.department === staffDepartment;
    } else {
      // System-wide component: only apply if no department-specific component of same type exists
      // This prevents system-wide from overriding department-specific
      return true;
    }
  }

  private async calculateRunTotals(runId: string, schoolId: string): Promise<any> {
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Run not found');

    const items = await this.itemRepo.find({ where: { runId, schoolId } });
    
    const totalGross = items.reduce((sum, item) => sum + Number(item.grossPay), 0);
    const totalNet = items.reduce((sum, item) => sum + Number(item.netPay), 0);

    run.staffCount = items.length;
    run.totalGross = totalGross;
    run.totalNet = totalNet;

    return run;
  }

  async listRuns(schoolId: string, page = 1, limit = 20) {
    const [data, total] = await this.runRepo.findAndCount({
      where: { schoolId },
      order: { period: 'DESC', createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total, page, limit };
  }

  async createRun(dto: CreateRunDto, user: any) {
    if (!user?.schoolId) throw new ForbiddenException('schoolId required');
    const exists = await this.runRepo.findOne({ where: { schoolId: user.schoolId, period: dto.period } });
    if (exists) throw new BadRequestException('Run for this period already exists');

    // If staffIds are provided, validate they exist and are active
    if (dto.staffIds && dto.staffIds.length > 0) {
      const validStaff = await this.userRepository.find({
        where: {
          id: In(dto.staffIds),
          schoolId: user.schoolId,
          isActive: true,
          role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
        },
      });
      
      if (validStaff.length !== dto.staffIds.length) {
        throw new BadRequestException('Some selected staff members are invalid or inactive');
      }
    }

    // Require explicit staff selection
    if (!dto.staffIds || dto.staffIds.length === 0) {
      throw new BadRequestException('Please select at least one staff member to create a salary run.');
    }

    const run = this.runRepo.create({
      period: dto.period,
      termId: dto.termId || null,
      status: 'DRAFT',
      schoolId: user.schoolId,
      staffCount: dto.staffIds ? dto.staffIds.length : 0,
    });
    
    const savedRun = await this.runRepo.save(run);

    // Create salary items immediately for selected staff
    await this.createSalaryItemsForStaff(savedRun.id, dto.staffIds, user.schoolId);
    
    // Update the run with actual staff count and totals
    const updatedRun = await this.calculateRunTotals(savedRun.id, user.schoolId);

    // If totals are zero, clean up and block creation
    const isZeroTotals = Number(updatedRun.totalGross) === 0 && Number(updatedRun.totalNet) === 0;
    if (isZeroTotals) {
      // Clean up created salary items and the run
      await this.itemRepo.delete({ runId: savedRun.id, schoolId: user.schoolId });
      await this.runRepo.remove(savedRun);
      throw new BadRequestException('Cannot create salary run with zero gross and net amounts. Assign pay components or select staff with amounts.');
    }

    const finalRun = await this.runRepo.save(updatedRun);
    
    await this.logger.logAction({
      action: 'PAYROLL_RUN_CREATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      performedBy: user ? { id: user.sub || user.id, email: user.email, role: user.role } : undefined,
      entityId: finalRun.id,
      entityType: 'SalaryRun',
      newValues: { ...finalRun, staffIds: dto.staffIds },
    });
    
    return finalRun;
  }

  async getRun(id: string, schoolId: string) {
    const run = await this.runRepo.findOne({ where: { id, schoolId }, relations: ['items'] });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async getRunItems(runId: string, schoolId: string): Promise<any[]> {
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Run not found');

    const items = await this.itemRepo.find({
      where: { runId, schoolId },
      relations: ['user'],
      order: { staffName: 'ASC' },
    });

    // Transform to match frontend expectations
    return items.map(item => ({
      id: item.id,
      runId: item.runId,
      userId: item.userId,
      staffName: item.staffName,
      department: item.department,
      breakdown: item.breakdown,
      grossPay: Number(item.grossPay),
      taxablePay: Number(item.taxablePay),
      paye: Number(item.paye),
      nhif: Number(item.nhif),
      nssf: Number(item.nssf),
      otherDeductions: Number(item.otherDeductions),
      netPay: Number(item.netPay),
      employerContrib: Number(item.employerContrib),
      schoolId: item.schoolId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  async getStaffWithSalaries(schoolId: string): Promise<any[]> {
    // Load all active staff
    const staff = await this.userRepository.find({
      where: {
        schoolId,
        isActive: true,
        role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
      },
      relations: ['teacher', 'finance'],
    });

    // Load all active assignments for the school
    const assignments = await this.assignRepo.find({
      where: { schoolId, isActive: true },
      relations: ['component'],
    });

    // Group assignments by staff member
    const staffAssignments = new Map<string, any[]>();
    assignments.forEach(assignment => {
      if (!staffAssignments.has(assignment.userId)) {
        staffAssignments.set(assignment.userId, []);
      }
      staffAssignments.get(assignment.userId)!.push(assignment);
    });

    // Load auto-assign pay components
    const autoAssignComponents = await this.compRepo.find({
      where: { schoolId, autoAssign: true },
      order: { department: 'ASC', createdAt: 'ASC' }, // Prioritize department-specific first
    });

    // Calculate salary for each staff member
    const staffWithSalaries = staff.map(staffMember => {
      const userAssignments = staffAssignments.get(staffMember.id) || [];
      const staffDepartment = this.getDepartmentFromUser(staffMember);

      // Create a map to track which components this staff already has manual assignments for
      const manualComponentIds = new Set(userAssignments.map(a => a.componentId));

      // Apply auto-assign logic with proper hierarchy
      const autoAssignments: any[] = [];
      const assignedComponentTypes = new Set<string>();

      // First, track what component types are already manually assigned
      userAssignments.forEach(assignment => {
        assignedComponentTypes.add(`${assignment.component.type}-${assignment.component.name}`);
      });

      // Apply auto-assignments with hierarchy
      for (const component of autoAssignComponents) {
        // Skip if staff already has a manual assignment for this exact component
        if (manualComponentIds.has(component.id)) {
          continue;
        }

        // Check component applicability based on department hierarchy
        const isApplicable = this.isAutoAssignComponentApplicable(component, staffDepartment, assignedComponentTypes);
        
        if (isApplicable) {
          autoAssignments.push({
            component,
            amount: component.defaultAmount || 0,
            isAutoAssigned: true,
          });
          
          // Mark this component type as assigned to prevent duplicate auto-assignments
          assignedComponentTypes.add(`${component.type}-${component.name}`);
        }
      }

      const allAssignments = [...userAssignments, ...autoAssignments];
      
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;
      let employerContrib = 0;
      const breakdown: any = {};

      for (const assignment of allAssignments) {
        const amount = Number(assignment.amount);
        const componentName = assignment.isAutoAssigned ? 
          `${assignment.component.name} (Auto)` : 
          assignment.component.name;
        
        breakdown[componentName] = {
          amount: amount,
          type: assignment.component.type,
          autoAssigned: assignment.isAutoAssigned || false,
          componentId: assignment.component.id,
        };

        if (assignment.component.type === 'BASIC' || assignment.component.type === 'ALLOWANCE') {
          // Basic pay and allowances ADD to gross pay
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          // Deductions SUBTRACT from net pay
          deductions += amount;
        } else if (assignment.component.type === 'EMPLOYER_CONTRIBUTION') {
          // Employer contributions don't affect employee's gross/net pay
          employerContrib += amount;
        }
      }

      const netPay = grossPay - deductions;

      return {
        id: staffMember.id,
        name: this.getStaffName(staffMember),
        email: staffMember.email,
        role: staffMember.role,
        department: staffDepartment,
        grossPay,
        taxablePay,
        deductions,
        netPay,
        employerContrib,
        breakdown,
        hasAssignments: allAssignments.length > 0,
      };
    });

    return staffWithSalaries;
  }

  // Prepare calculations (MVP: stubbed totals; extend with full engine later)
  async prepareRun(id: string, user: any) {
    console.log('prepareRun called with id:', id, 'user:', { schoolId: user.schoolId, id: user.id, email: user.email });
    
    const run = await this.getRun(id, user.schoolId);
    console.log('Run found:', { id: run.id, schoolId: run.schoolId, status: run.status });
    
    if (run.status !== 'DRAFT' && run.status !== 'REJECTED') {
      throw new BadRequestException('Run must be DRAFT or REJECTED to prepare');
    }

    const schoolId = run.schoolId;
    if (!schoolId) {
      throw new BadRequestException('Salary run does not have a valid school ID');
    }

    // Check if run already has salary items (created during run creation)
    const existingItems = await this.itemRepo.find({ where: { runId: id, schoolId } });
    
    if (existingItems.length > 0) {
      // Items already exist, just update run status and totals
      const updatedRun = await this.calculateRunTotals(id, schoolId);

      // Block preparing when totals are zero
      if (Number(updatedRun.totalGross) === 0 && Number(updatedRun.totalNet) === 0) {
        throw new BadRequestException('Cannot prepare a salary run with zero gross and net amounts.');
      }

      updatedRun.status = 'PREPARED';
      updatedRun.preparedBy = user.sub || user.id;
      await this.runRepo.save(updatedRun);
      
      console.log('Run prepared with existing items:', { staffCount: updatedRun.staffCount, totalGross: updatedRun.totalGross });
      
      await this.logger.logAction({
        action: 'PAYROLL_RUN_PREPARED',
        module: 'PAYROLL',
        level: 'info',
        schoolId,
        entityId: run.id,
        entityType: 'SalaryRun',
        metadata: { staffCount: updatedRun.staffCount, totalGross: updatedRun.totalGross }
      });

      // Record approval history entry
      try {
        await this.historyRepo.save(this.historyRepo.create({
          runId: updatedRun.id,
          action: 'PREPARED',
          byUserId: user.sub || user.id,
          comments: null,
          schoolId,
        }));
      } catch (e) {
        // Do not block the flow on history save failure
        console.error('Failed to save payroll approval history (PREPARED):', e.message);
      }

      return updatedRun;
    }

    // No existing items, create them from all active assignments
    console.log('Using schoolId:', schoolId);

    // Load all active staff assignments for the school
    const assignments = await this.assignRepo.find({
      where: { schoolId, isActive: true },
      relations: ['component', 'user', 'user.teacher', 'user.finance'],
    });

    console.log('Found assignments count:', assignments.length);
    if (assignments.length === 0) {
      throw new BadRequestException('No active staff assignments found. Please assign pay components to staff first.');
    }

    // Load auto-assign pay components
    const autoAssignComponents = await this.compRepo.find({
      where: { schoolId, autoAssign: true },
    });

    // Get all staff users for auto-assignment
    const allStaff = await this.userRepository.find({
      where: {
        schoolId,
        role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
        isActive: true,
      },
      relations: ['teacher', 'finance'],
    });

    // Group assignments by staff member
    const staffPayrolls = new Map<string, any>();

    // First, add individual assignments
    for (const assignment of assignments) {
      const staffId = assignment.userId;
      if (!staffPayrolls.has(staffId)) {
        staffPayrolls.set(staffId, {
          userId: staffId,
          user: assignment.user,
          assignments: [],
          grossPay: 0,
          taxablePay: 0,
          deductions: 0,
        });
      }
      staffPayrolls.get(staffId).assignments.push(assignment);
    }

    // Then, add auto-assignments based on department with proper hierarchy
    for (const staff of allStaff) {
      const staffId = staff.id;
      const staffDepartment = this.getDepartmentFromUser(staff);
      
      // Initialize staff payroll if not exists
      if (!staffPayrolls.has(staffId)) {
        staffPayrolls.set(staffId, {
          userId: staffId,
          user: staff,
          assignments: [],
          grossPay: 0,
          taxablePay: 0,
          deductions: 0,
        });
      }

      const payroll = staffPayrolls.get(staffId);
      
      // Create a map to track which components this staff already has manual assignments for
      const manualComponentIds = new Set(payroll.assignments.map(a => a.componentId));
      const assignedComponentTypes = new Set<string>();

      // First, track what component types are already manually assigned
      payroll.assignments.forEach(assignment => {
        assignedComponentTypes.add(`${assignment.component.type}-${assignment.component.name}`);
      });

      // Apply auto-assignments with hierarchy
      for (const component of autoAssignComponents) {
        // Skip if staff already has a manual assignment for this exact component
        if (manualComponentIds.has(component.id)) {
          continue;
        }

        // Check component applicability based on department hierarchy
        const isApplicable = this.isAutoAssignComponentApplicable(component, staffDepartment, assignedComponentTypes);
        
        if (isApplicable) {
          // Create a virtual assignment for auto-assigned component
          const virtualAssignment = {
            component: component,
            amount: component.defaultAmount || 0,
            isAutoAssigned: true,
          };
          payroll.assignments.push(virtualAssignment);
          
          // Mark this component type as assigned to prevent duplicate auto-assignments
          assignedComponentTypes.add(`${component.type}-${component.name}`);
        }
      }
    }

    // Calculate payroll for each staff member
    const salaryItems: any[] = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalEmployerCost = 0;

    for (const [staffId, payroll] of staffPayrolls) {
      const breakdown: any = {};
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;
      let employerContrib = 0;

      for (const assignment of payroll.assignments) {
        const amount = Number(assignment.amount);
        const componentName = assignment.isAutoAssigned ? 
          `${assignment.component.name} (Auto)` : 
          assignment.component.name;
        
        breakdown[componentName] = {
          amount: amount,
          type: assignment.component.type,
          autoAssigned: assignment.isAutoAssigned || false,
        };

        if (assignment.component.type === 'BASIC' || assignment.component.type === 'ALLOWANCE') {
          // Basic pay and allowances ADD to gross pay
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          // Deductions SUBTRACT from net pay
          deductions += amount;
        } else if (assignment.component.type === 'EMPLOYER_CONTRIBUTION') {
          // Employer contributions don't affect employee's gross/net pay
          // but add to total employer cost
          employerContrib += amount;
        }
      }

      const netPay = grossPay - deductions;

      // Create salary item
      const salaryItem = this.itemRepo.create({
        runId: id,
        userId: staffId,
        staffName: this.getStaffName(payroll.user),
        department: this.getDepartmentFromUser(payroll.user),
        breakdown: breakdown,
        grossPay: grossPay,
        taxablePay: taxablePay,
        paye: 0,
        nhif: 0,
        nssf: 0,
        otherDeductions: deductions,
        netPay: netPay,
        employerContrib: employerContrib,
        schoolId,
      });

      salaryItems.push(salaryItem);
      totalGross += grossPay;
      totalNet += netPay;
      totalEmployerCost += employerContrib;
    }

    // If no items or totals are zero, block preparation
    if (salaryItems.length === 0 || (Number(totalGross) === 0 && Number(totalNet) === 0)) {
      throw new BadRequestException('Cannot prepare a salary run with zero gross and net amounts.');
    }

    // Save all salary items in a transaction
    await this.dataSource.transaction(async (trx) => {
      const itemRepo = trx.getRepository(SalaryItem);
      await itemRepo.save(salaryItems);

      // Update run totals
      const runRepo = trx.getRepository(SalaryRun);
      run.status = 'PREPARED';
      run.staffCount = salaryItems.length;
      run.totalGross = totalGross;
      run.totalNet = totalNet;
      run.employerCost = totalEmployerCost;
      run.preparedBy = user.sub || user.id;
      await runRepo.save(run);
    });

    console.log('Run prepared successfully:', { staffCount: salaryItems.length, totalGross, totalNet, totalEmployerCost });

    await this.logger.logAction({
      action: 'PAYROLL_RUN_PREPARED',
      module: 'PAYROLL',
      level: 'info',
      schoolId,
      entityId: run.id,
      entityType: 'SalaryRun',
      metadata: { staffCount: salaryItems.length, totalGross, totalNet, totalEmployerCost }
    });

    return run;
  }

  async submitRun(id: string, user: any) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'PREPARED') throw new BadRequestException('Run must be PREPARED to submit');
    run.status = 'SUBMITTED';
    run.submittedBy = user.sub || user.id;
    await this.runRepo.save(run);
    await this.logger.logAction({ action: 'PAYROLL_RUN_SUBMITTED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun' });
    // Save approval history
    try {
      await this.historyRepo.save(this.historyRepo.create({
        runId: run.id,
        action: 'SUBMITTED',
        byUserId: user.sub || user.id,
        comments: null,
        schoolId: user.schoolId,
      }));
    } catch (e) {
      console.error('Failed to save payroll approval history (SUBMITTED):', e.message);
    }
    return run;
  }

  async approveRun(id: string, user: any) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'SUBMITTED') throw new BadRequestException('Run must be SUBMITTED to approve');
    run.status = 'APPROVED';
    run.approvedBy = user.sub || user.id;
    await this.runRepo.save(run);
    await this.logger.logAction({ action: 'PAYROLL_RUN_APPROVED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun' });
    try {
      await this.historyRepo.save(this.historyRepo.create({
        runId: run.id,
        action: 'APPROVED',
        byUserId: user.sub || user.id,
        comments: null,
        schoolId: user.schoolId,
      }));
    } catch (e) {
      console.error('Failed to save payroll approval history (APPROVED):', e.message);
    }
    return run;
  }

  async rejectRun(id: string, user: any, reason?: string) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'SUBMITTED') throw new BadRequestException('Run must be SUBMITTED to reject');
    run.status = 'REJECTED';
    await this.runRepo.save(run);
    await this.logger.logAction({ action: 'PAYROLL_RUN_REJECTED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun', metadata: { reason } });
    try {
      await this.historyRepo.save(this.historyRepo.create({
        runId: run.id,
        action: 'REJECTED',
        byUserId: user.sub || user.id,
        comments: reason || null,
        schoolId: user.schoolId,
      }));
    } catch (e) {
      console.error('Failed to save payroll approval history (REJECTED):', e.message);
    }
    return run;
  }

  async finalizeRun(id: string, user: any) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'APPROVED') throw new BadRequestException('Run must be APPROVED to finalize');

    return await this.dataSource.transaction(async (trx) => {
      const runRepo = trx.getRepository(SalaryRun);
      const expenseRepo = trx.getRepository(Expense);

      // Idempotency: if already posted, do nothing
      if (run.postedExpenseId) return run;

      // Create an approved Personnel expense so it feeds into finance reports
      const totalExpenseAmount = Number(run.totalNet) + Number(run.employerCost);
      const expense = expenseRepo.create({
        expenseNumber: `PAY-${run.period}-${Date.now()}`,
        title: `Payroll ${run.period}`,
        description: `Payroll for period ${run.period}`,
        amount: totalExpenseAmount,
        category: ExpenseCategory.PERSONNEL,
        department: 'Finance',
        requestedBy: 'Payroll System',
        requestDate: new Date(),
        dueDate: new Date(),
        status: ExpenseStatus.APPROVED,
        approvalLevel: 1,
        priority: ExpensePriority.MEDIUM,
        schoolId: user.schoolId,
        approvedAmount: totalExpenseAmount,
        approvedDate: new Date(),
        approvedBy: 'System',
      });
      await expenseRepo.save(expense);

      run.status = 'FINALIZED';
      run.finalizedBy = user.sub || user.id;
      run.postedExpenseId = expense.id;
      await runRepo.save(run);

      await this.logger.logAction({ action: 'PAYROLL_RUN_FINALIZED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun', metadata: { postedExpenseId: expense.id } });
      try {
        await this.historyRepo.save(this.historyRepo.create({
          runId: run.id,
          action: 'FINALIZED',
          byUserId: user.sub || user.id,
          comments: null,
          schoolId: user.schoolId,
        }));
      } catch (e) {
        console.error('Failed to save payroll approval history (FINALIZED):', e.message);
      }

      return run;
    });
  }

  async deleteRun(id: string, schoolId: string): Promise<void> {
    const run = await this.getRun(id, schoolId);
    
    // Only allow deletion of DRAFT runs
    if (run.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT runs can be deleted');
    }

    // Delete associated salary items first
    await this.itemRepo.delete({ runId: id });
    
    // Delete the run
    await this.runRepo.remove(run);

    await this.logger.logAction({
      action: 'PAYROLL_RUN_DELETED',
      module: 'PAYROLL',
      level: 'info',
      schoolId,
      entityId: id,
      entityType: 'SalaryRun',
    });
  }

  async getApprovalHistory(runId: string, schoolId: string): Promise<any[]> {
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Run not found');

    const history = await this.historyRepo.find({
      where: { runId, schoolId },
      relations: ['run'],
      order: { createdAt: 'ASC' },
    });

    // Transform to match frontend expectations and resolve performer name
  const result: any[] = [];
    for (const item of history) {
      let performedByName = 'System';
      if (item.byUserId) {
        try {
          const u = await this.userRepository.findOne({ where: { id: item.byUserId }, relations: ['teacher', 'finance'] });
          performedByName = this.getStaffName(u);
        } catch (e) {
          performedByName = 'Unknown User';
        }
      }

      result.push({
        id: item.id,
        salaryRunId: item.runId,
        action: item.action,
        performedBy: item.byUserId || 'System',
        performedByName,
        comments: item.comments,
        createdAt: item.createdAt.toISOString(),
      });
    }

    // If no dedicated payroll approval history exists yet, try to fallback to generic logs
    if (result.length === 0) {
      try {
        const logs = await this.logRepository.find({
          where: { entityType: 'SalaryRun', entityId: runId, module: 'PAYROLL' },
          order: { timestamp: 'ASC' },
        });

        for (const l of logs) {
          // Map known actions to approval actions
          let mapped: string | null = null;
          if (l.action === 'PAYROLL_RUN_PREPARED') mapped = 'PREPARED';
          if (l.action === 'PAYROLL_RUN_SUBMITTED') mapped = 'SUBMITTED';
          if (l.action === 'PAYROLL_RUN_APPROVED') mapped = 'APPROVED';
          if (l.action === 'PAYROLL_RUN_REJECTED') mapped = 'REJECTED';
          if (l.action === 'PAYROLL_RUN_FINALIZED') mapped = 'FINALIZED';
          if (!mapped) continue;

          const performer = (l.performedBy && (l.performedBy as any).name) ? (l.performedBy as any).name : (l.performedBy && (l.performedBy as any).email) ? (l.performedBy as any).email : 'System';
          result.push({
            id: l.id,
            salaryRunId: runId,
            action: mapped,
            performedBy: (l.performedBy && (l.performedBy as any).id) ? (l.performedBy as any).id : 'System',
            performedByName: performer,
            comments: (l.metadata && (l.metadata as any).reason) ? (l.metadata as any).reason : null,
            createdAt: (l.timestamp || new Date()).toISOString(),
          });
        }
      } catch (e) {
        // ignore fallback errors
      }
    }

    return result;
  }

  // Pay Components
  async listPayComponents(schoolId: string): Promise<PayComponent[]> {
    return this.compRepo.find({
      where: { schoolId },
      order: { createdAt: 'DESC' },
    });
  }

  async createPayComponent(dto: CreatePayComponentDto, user: any): Promise<PayComponent> {
    if (!user?.schoolId) throw new ForbiddenException('schoolId required');
    
    // Generate unique code from name and department
    let code = dto.name.toUpperCase().replace(/\s+/g, '_');
    if (dto.department) {
      code = `${code}_${dto.department.toUpperCase().replace(/\s+/g, '_')}`;
    }
    
    const component = this.compRepo.create({
      code: code,
      name: dto.name,
      type: dto.type as any, // Cast to match entity type
      taxable: dto.type !== 'DEDUCTION', // Basic and allowances are taxable
      recurring: !dto.isFixed, // Variable components are recurring
      computeMethod: dto.formula ? 'FORMULA' : 'FIXED',
      defaultAmount: dto.defaultAmount,
      formula: dto.formula,
      department: dto.department || null,
      autoAssign: dto.autoAssign || false,
      schoolId: user.schoolId,
    });
    
    const savedComponent = await this.compRepo.save(component);
    await this.logger.logAction({
      action: 'PAYROLL_COMPONENT_CREATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: savedComponent.id,
      entityType: 'PayComponent',
      newValues: dto,
    });
    
    return savedComponent;
  }

  async getPayComponent(id: string, schoolId: string): Promise<PayComponent> {
    const component = await this.compRepo.findOne({ where: { id, schoolId } });
    if (!component) throw new NotFoundException('Pay component not found');
    return component;
  }

  async updatePayComponent(id: string, dto: any, user: any): Promise<PayComponent> {
    const component = await this.getPayComponent(id, user.schoolId);
    
    // If name or department is being updated, regenerate the code
    if (dto.name || dto.department !== undefined) {
      let code = (dto.name || component.name).toUpperCase().replace(/\s+/g, '_');
      const dept = dto.department !== undefined ? dto.department : component.department;
      if (dept) {
        code = `${code}_${dept.toUpperCase().replace(/\s+/g, '_')}`;
      }
      dto.code = code;
    }
    
    Object.assign(component, dto);
    await this.compRepo.save(component);
    
    await this.logger.logAction({
      action: 'PAYROLL_COMPONENT_UPDATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: component.id,
      entityType: 'PayComponent',
      oldValues: component,
      newValues: dto,
    });
    
    return component;
  }

  async deletePayComponent(id: string, user: any): Promise<void> {
    const component = await this.getPayComponent(id, user.schoolId);
    await this.compRepo.remove(component);
    
    await this.logger.logAction({
      action: 'PAYROLL_COMPONENT_DELETED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: id,
      entityType: 'PayComponent',
    });
  }

  // Staff Pay Assignments
  async listStaffAssignments(schoolId: string, staffId?: string): Promise<any[]> {
    const where: any = { schoolId, isActive: true };
    if (staffId) where.userId = staffId;
    
    const assignments = await this.assignRepo.find({
      where,
      relations: ['component', 'user.teacher', 'user.finance'],
      order: { createdAt: 'DESC' },
    });

    // Transform to match frontend expectations
    return assignments.map(assignment => ({
      id: assignment.id,
      userId: assignment.userId,
      staffName: this.getStaffName(assignment.user),
      componentId: assignment.componentId,
      component: assignment.component,
      amount: Number(assignment.amount),
      isActive: assignment.isActive,
      effectiveFrom: this.formatDate(assignment.effectiveFrom),
      effectiveTo: this.formatDate(assignment.effectiveTo),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    }));
  }

  async createStaffAssignment(dto: CreateStaffAssignmentDto, user: any): Promise<any> {
    if (!user?.schoolId) throw new ForbiddenException('schoolId required');
    
    // Validate that the staff member exists
    const staffUser = await this.userRepository.findOne({
      where: { 
        id: dto.staffId, 
        schoolId: user.schoolId,
        role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
      },
    });
    
    if (!staffUser) {
      throw new NotFoundException('Staff member not found');
    }
    
    const assignment = this.assignRepo.create({
      userId: dto.staffId,
      componentId: dto.payComponentId,
      amount: dto.amount,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      schoolId: user.schoolId,
      isActive: true,
    });
    
    const savedAssignment = await this.assignRepo.save(assignment);
    await this.logger.logAction({
      action: 'PAYROLL_ASSIGNMENT_CREATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: savedAssignment.id,
      entityType: 'StaffPayAssignment',
      newValues: dto,
    });

    // Load relations for response
    const assignmentWithRelations = await this.assignRepo.findOne({
      where: { id: savedAssignment.id },
      relations: ['component', 'user', 'user.teacher', 'user.finance'],
    });

    if (!assignmentWithRelations) {
      throw new NotFoundException('Assignment not found after creation');
    }

    // Transform to match frontend expectations
    return {
      id: assignmentWithRelations.id,
      userId: assignmentWithRelations.userId,
      staffName: this.getStaffName(assignmentWithRelations.user),
      componentId: assignmentWithRelations.componentId,
      component: assignmentWithRelations.component,
      amount: Number(assignmentWithRelations.amount),
      isActive: assignmentWithRelations.isActive,
      effectiveFrom: this.formatDate(assignmentWithRelations.effectiveFrom),
      effectiveTo: this.formatDate(assignmentWithRelations.effectiveTo),
      createdAt: assignmentWithRelations.createdAt.toISOString(),
      updatedAt: assignmentWithRelations.updatedAt.toISOString(),
    };
  }

  async getStaffAssignment(id: string, schoolId: string): Promise<any> {
    const assignment = await this.assignRepo.findOne({ 
      where: { id, schoolId },
      relations: ['component', 'user', 'user.teacher', 'user.finance'],
    });
    if (!assignment) throw new NotFoundException('Staff assignment not found');

    // Transform to match frontend expectations
    return {
      id: assignment.id,
      userId: assignment.userId,
      staffName: this.getStaffName(assignment.user),
      componentId: assignment.componentId,
      component: assignment.component,
      amount: Number(assignment.amount),
      isActive: assignment.isActive,
      effectiveFrom: this.formatDate(assignment.effectiveFrom),
      effectiveTo: this.formatDate(assignment.effectiveTo),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  async updateStaffAssignment(id: string, dto: any, user: any): Promise<any> {
    const assignment = await this.assignRepo.findOne({
      where: { id, user: { schoolId: user.schoolId } },
      relations: ['component', 'user', 'user.teacher', 'user.finance'],
    });
    if (!assignment) throw new NotFoundException('Staff assignment not found');

    Object.assign(assignment, dto);
    await this.assignRepo.save(assignment);
    
    await this.logger.logAction({
      action: 'PAYROLL_ASSIGNMENT_UPDATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: assignment.id,
      entityType: 'StaffPayAssignment',
      oldValues: assignment,
      newValues: dto,
    });

    // Transform to match frontend expectations
    return {
      id: assignment.id,
      userId: assignment.userId,
      staffName: this.getStaffName(assignment.user),
      componentId: assignment.componentId,
      component: assignment.component,
      amount: Number(assignment.amount),
      isActive: assignment.isActive,
      effectiveFrom: this.formatDate(assignment.effectiveFrom),
      effectiveTo: this.formatDate(assignment.effectiveTo),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  async deleteStaffAssignment(id: string, user: any): Promise<void> {
    const assignment = await this.getStaffAssignment(id, user.schoolId);
    assignment.isActive = false;
    await this.assignRepo.save(assignment);
    
    await this.logger.logAction({
      action: 'PAYROLL_ASSIGNMENT_DELETED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      entityId: assignment.id,
      entityType: 'StaffPayAssignment',
    });
  }

  // Generate payslip for a specific staff member
  async generatePayslip(runId: string, staffId: string, schoolId: string): Promise<Buffer> {
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Salary run not found');

    if (run.status !== 'FINALIZED') {
      throw new BadRequestException('Payslips can only be generated for finalized salary runs');
    }

    const item = await this.itemRepo.findOne({
      where: { runId, userId: staffId, schoolId },
      relations: ['user', 'user.teacher', 'user.finance'],
    });

    if (!item) {
      throw new NotFoundException('Salary item not found for this staff member');
    }

    // Get school information
    let schoolName = '';
    let schoolLogo = '';
    try {
      const school = await this.schoolRepository.findOne({ where: { id: schoolId } });
      if (school) {
        schoolName = school.name || '';
        schoolLogo = (school.metadata as any)?.logo || '';
      }
    } catch (e) {
      // ignore school fetch errors
    }

    // Generate PDF using PDFKit
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    // Collect PDF data
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      doc.on('error', (error: Error) => {
        reject(error);
      });

      try {
        // Header with school information
        if (schoolName) {
          doc.fontSize(20).font('Helvetica-Bold').text(schoolName, { align: 'center' });
          doc.moveDown(0.5);
        }

        // Title
        doc.fontSize(18).font('Helvetica-Bold').text('PAYSLIP', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text(`Pay Period: ${run.period}`, { align: 'center' });
        doc.moveDown(1);

        // Horizontal line
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        // Staff Information Section
        doc.fontSize(16).font('Helvetica-Bold').text('STAFF INFORMATION', { underline: true });
        doc.moveDown(0.5);
        
        const leftX = 70;
        const rightX = 320;
        let currentY = doc.y;

        doc.fontSize(12).font('Helvetica');
        doc.text('Staff Name:', leftX, currentY);
        doc.text(this.getStaffName(item.user), leftX + 100, currentY);
        
        currentY += 20;
        doc.text('Department:', leftX, currentY);
        doc.text(this.getDepartmentFromUser(item.user), leftX + 100, currentY);

        currentY += 20;
        doc.text('Period:', leftX, currentY);
        doc.text(run.period, leftX + 100, currentY);

        doc.y = currentY + 30;

        // Earnings Section
        doc.fontSize(16).font('Helvetica-Bold').text('EARNINGS', { underline: true });
        doc.moveDown(0.5);

        currentY = doc.y;
        doc.fontSize(12).font('Helvetica');
        doc.text('Gross Pay:', leftX, currentY);
        doc.text(`MK ${item.grossPay.toLocaleString()}`, rightX, currentY);

        currentY += 20;
        doc.text('Taxable Pay:', leftX, currentY);
        doc.text(`MK ${item.taxablePay.toLocaleString()}`, rightX, currentY);

        doc.y = currentY + 30;

        // Deductions Section
        doc.fontSize(16).font('Helvetica-Bold').text('DEDUCTIONS', { underline: true });
        doc.moveDown(0.5);

        currentY = doc.y;
        doc.fontSize(12).font('Helvetica');
        doc.text('PAYE Tax:', leftX, currentY);
        doc.text(`MK ${item.paye.toLocaleString()}`, rightX, currentY);

        currentY += 20;
        doc.text('NHIF:', leftX, currentY);
        doc.text(`MK ${item.nhif.toLocaleString()}`, rightX, currentY);

        currentY += 20;
        doc.text('NSSF:', leftX, currentY);
        doc.text(`MK ${item.nssf.toLocaleString()}`, rightX, currentY);

        currentY += 20;
        doc.text('Other Deductions:', leftX, currentY);
        doc.text(`MK ${item.otherDeductions.toLocaleString()}`, rightX, currentY);

        const totalDeductions = item.paye + item.nhif + item.nssf + item.otherDeductions;
        currentY += 30;
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text('Total Deductions:', leftX, currentY);
        doc.text(`MK ${totalDeductions.toLocaleString()}`, rightX, currentY);

        doc.y = currentY + 40;

        // Net Pay Section (highlighted)
        doc.rect(50, doc.y - 10, 500, 40).fillAndStroke('#f0f0f0', '#333');
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#000');
        doc.text('NET PAY:', leftX, doc.y + 5);
        doc.text(`MK ${item.netPay.toLocaleString()}`, rightX, doc.y);

        doc.y += 60;

        // Footer
        doc.fontSize(10).font('Helvetica').fillColor('#666');
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.text('This is a system-generated document', { align: 'center' });

        // End the document
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  // Export payroll data
  async exportPayroll(runId: string, format: 'pdf' | 'excel', schoolId: string): Promise<Buffer> {
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Salary run not found');

    const items = await this.itemRepo.find({
      where: { runId, schoolId },
      relations: ['user', 'user.teacher', 'user.finance'],
      order: { staffName: 'ASC' },
    });

    if (format === 'excel') {
      // Return proper CSV format for Excel compatibility
      const headers = ['Staff Name', 'Department', 'Gross Pay', 'Taxable Pay', 'PAYE', 'NHIF', 'NSSF', 'Other Deductions', 'Net Pay'];
      const csvData = [
        headers.join(','),
        ...items.map(item => [
          `"${this.getStaffName(item.user)}"`,
          `"${this.getDepartmentFromUser(item.user)}"`,
          item.grossPay,
          item.taxablePay,
          item.paye,
          item.nhif,
          item.nssf,
          item.otherDeductions,
          item.netPay,
        ].join(','))
      ].join('\n');

      return Buffer.from(csvData, 'utf-8');
    } else {
      // Generate proper PDF using PDFKit
      let schoolName = '';
      let schoolLogo = '';
      try {
        const school = await this.schoolRepository.findOne({ where: { id: schoolId } });
        if (school) {
          schoolName = school.name || '';
          schoolLogo = (school.metadata as any)?.logo || '';
        }
      } catch (e) {
        // ignore
      }

      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];

      // Collect PDF data
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      
      return new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve(pdfBuffer);
        });

        doc.on('error', (error: Error) => {
          reject(error);
        });

        try {
          // Header
          if (schoolName) {
            doc.fontSize(20).font('Helvetica-Bold').text(schoolName, { align: 'center' });
            doc.moveDown(0.5);
          }

          doc.fontSize(18).font('Helvetica-Bold').text('PAYROLL REPORT', { align: 'center' });
          doc.fontSize(14).font('Helvetica').text(`Pay Period: ${run.period}`, { align: 'center' });
          doc.moveDown(1);

          // Summary section
          doc.fontSize(16).font('Helvetica-Bold').text('PAYROLL SUMMARY', { underline: true });
          doc.moveDown(0.5);

          const leftX = 60;
          const rightX = 300;
          let currentY = doc.y;

          doc.fontSize(12).font('Helvetica');
          doc.text('Total Staff:', leftX, currentY);
          doc.text(run.staffCount.toString(), rightX, currentY);

          currentY += 20;
          doc.text('Total Gross Pay:', leftX, currentY);
          doc.text(`MK ${run.totalGross.toLocaleString()}`, rightX, currentY);

          currentY += 20;
          doc.text('Total Net Pay:', leftX, currentY);
          doc.text(`MK ${run.totalNet.toLocaleString()}`, rightX, currentY);

          const totalDeductions = run.totalGross - run.totalNet;
          currentY += 20;
          doc.text('Total Deductions:', leftX, currentY);
          doc.text(`MK ${totalDeductions.toLocaleString()}`, rightX, currentY);

          doc.y = currentY + 30;

          // Staff details table
          doc.fontSize(16).font('Helvetica-Bold').text('STAFF DETAILS', { underline: true });
          doc.moveDown(1);

          // Table headers
          const tableTop = doc.y;
          const col1X = 40;  // Name
          const col2X = 180; // Department
          const col3X = 280; // Gross
          const col4X = 360; // Deductions
          const col5X = 450; // Net

          doc.fontSize(11).font('Helvetica-Bold');
          doc.text('Name', col1X, tableTop);
          doc.text('Department', col2X, tableTop);
          doc.text('Gross Pay', col3X, tableTop);
          doc.text('Deductions', col4X, tableTop);
          doc.text('Net Pay', col5X, tableTop);

          // Draw header line
          doc.moveTo(40, tableTop + 15).lineTo(550, tableTop + 15).stroke();

          let rowY = tableTop + 25;
          doc.fontSize(10).font('Helvetica');

          items.forEach((item, index) => {
            // Check if we need a new page
            if (rowY > 720) {
              doc.addPage();
              rowY = 50;
            }

            const totalItemDeductions = item.paye + item.nhif + item.nssf + item.otherDeductions;
            
            doc.text(this.getStaffName(item.user).substring(0, 18), col1X, rowY);
            doc.text(this.getDepartmentFromUser(item.user).substring(0, 12), col2X, rowY);
            doc.text(`MK ${item.grossPay.toLocaleString()}`, col3X, rowY);
            doc.text(`MK ${totalItemDeductions.toLocaleString()}`, col4X, rowY);
            doc.text(`MK ${item.netPay.toLocaleString()}`, col5X, rowY);

            rowY += 18;

            // Add a subtle line between rows
            if (index < items.length - 1) {
              doc.strokeColor('#e0e0e0').moveTo(40, rowY - 2).lineTo(550, rowY - 2).stroke();
            }
          });

          // Footer
          doc.y = Math.max(rowY + 30, 720);
          doc.fontSize(10).font('Helvetica').fillColor('#666');
          doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });
          doc.text('This is a system-generated document', { align: 'center' });

          // End the document
          doc.end();

        } catch (error) {
          reject(error);
        }
      });
    }
  }
}
