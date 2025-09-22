import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { SalaryRun } from './entities/salary-run.entity';
import { SalaryItem } from './entities/salary-item.entity';
import { PayrollApprovalHistory } from './entities/payroll-approval-history.entity';
import { PayComponent } from './entities/pay-component.entity';
import { StaffPayAssignment } from './entities/staff-pay-assignment.entity';
import { User } from '../user/entities/user.entity';
import { CreateRunDto } from './dtos/create-run.dto';
import { CreatePayComponentDto, UpdatePayComponentDto } from './dtos/pay-component.dto';
import { CreateStaffAssignmentDto, UpdateStaffAssignmentDto } from './dtos/staff-assignment.dto';
import { SystemLoggingService } from '../logs/system-logging.service';
import { Expense, ExpenseCategory, ExpenseStatus, ExpensePriority } from '../expenses/entities/expense.entity';
import { Role } from '../user/enums/role.enum';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(SalaryRun) private readonly runRepo: Repository<SalaryRun>,
    @InjectRepository(SalaryItem) private readonly itemRepo: Repository<SalaryItem>,
    @InjectRepository(PayrollApprovalHistory) private readonly historyRepo: Repository<PayrollApprovalHistory>,
    @InjectRepository(PayComponent) private readonly compRepo: Repository<PayComponent>,
    @InjectRepository(StaffPayAssignment) private readonly assignRepo: Repository<StaffPayAssignment>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
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
    console.log('createSalaryItemsForStaff called with:', { runId, staffIds, schoolId });
    
    // Load staff with their assignments
    const staffWithAssignments = await this.userRepository.find({
      where: {
        id: In(staffIds),
        schoolId,
        isActive: true,
      },
      relations: ['teacher', 'finance'],
    });
    console.log('Found staff:', staffWithAssignments.length);

    // Load all active assignments for these staff members
    const assignments = await this.assignRepo.find({
      where: {
        userId: In(staffIds),
        schoolId,
        isActive: true,
      },
      relations: ['component'],
    });
    console.log('Found assignments:', assignments.length);

    // Group assignments by staff member
    const staffAssignments = new Map<string, any[]>();
    assignments.forEach(assignment => {
      if (!staffAssignments.has(assignment.userId)) {
        staffAssignments.set(assignment.userId, []);
      }
      staffAssignments.get(assignment.userId)!.push(assignment);
    });

    // Create salary items
    const salaryItems: any[] = [];
    for (const staff of staffWithAssignments) {
      const userAssignments = staffAssignments.get(staff.id) || [];
      console.log(`Processing staff ${staff.id}: ${userAssignments.length} assignments`);
      
      // Skip staff with no assignments
      if (userAssignments.length === 0) {
        console.log(`Staff ${staff.id} has no pay assignments, skipping`);
        continue;
      }
      
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;
      const breakdown: any = {};

      for (const assignment of userAssignments) {
        const amount = Number(assignment.amount);
        console.log(`Assignment: ${assignment.component.name} = ${amount} (type: ${assignment.component.type})`);
        breakdown[assignment.component.name] = {
          amount: amount,
          type: assignment.component.type,
        };

        if (assignment.component.type === 'BASIC' || assignment.component.type === 'ALLOWANCE') {
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          deductions += amount;
        }
      }

      const netPay = grossPay - deductions;
      console.log(`Staff ${staff.id} totals: gross=${grossPay}, net=${netPay}, deductions=${deductions}`);

      const salaryItem = this.itemRepo.create({
        runId,
        userId: staff.id,
        staffName: this.getStaffName(staff),
        department: this.getDepartmentFromUser(staff),
        breakdown,
        grossPay,
        taxablePay,
        paye: 0,
        nhif: 0,
        nssf: 0,
        otherDeductions: deductions,
        netPay,
        schoolId,
      });

      salaryItems.push(salaryItem);
    }

    console.log(`About to save ${salaryItems.length} salary items out of ${staffWithAssignments.length} staff`);
    if (salaryItems.length > 0) {
      const savedItems = await this.itemRepo.save(salaryItems);
      console.log(`Saved ${savedItems.length} salary items`);
    } else {
      console.log('No salary items to save - no staff had pay assignments');
    }
  }

  private async calculateRunTotals(runId: string, schoolId: string): Promise<any> {
    console.log('calculateRunTotals called with:', { runId, schoolId });
    
    const run = await this.runRepo.findOne({ where: { id: runId, schoolId } });
    if (!run) throw new NotFoundException('Run not found');

    const items = await this.itemRepo.find({ where: { runId, schoolId } });
    console.log(`Found ${items.length} salary items for calculation`);
    
    const totalGross = items.reduce((sum, item) => {
      const gross = Number(item.grossPay);
      console.log(`Item grossPay: ${item.grossPay} -> ${gross}`);
      return sum + gross;
    }, 0);
    
    const totalNet = items.reduce((sum, item) => {
      const net = Number(item.netPay);
      console.log(`Item netPay: ${item.netPay} -> ${net}`);
      return sum + net;
    }, 0);

    console.log(`Calculated totals: gross=${totalGross}, net=${totalNet}`);

    run.staffCount = items.length;
    run.totalGross = totalGross;
    run.totalNet = totalNet;

    console.log('Updated run object:', { staffCount: run.staffCount, totalGross: run.totalGross, totalNet: run.totalNet });

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

      // Check if the selected staff have any active pay assignments
      const staffAssignments = await this.assignRepo.find({
        where: {
          userId: In(dto.staffIds),
          schoolId: user.schoolId,
          isActive: true,
        },
        relations: ['component'],
      });

      const staffWithAssignments = new Set(staffAssignments.map(a => a.userId));
      const staffWithoutAssignments = dto.staffIds.filter(id => !staffWithAssignments.has(id));

      if (staffWithoutAssignments.length > 0) {
        console.log('Staff without assignments:', staffWithoutAssignments);
        // Don't throw an error, but log it for debugging
        console.log(`Warning: ${staffWithoutAssignments.length} staff members have no pay assignments`);
      }

      console.log(`Found ${staffAssignments.length} pay assignments for ${dto.staffIds.length} selected staff`);
    }

    const run = this.runRepo.create({
      period: dto.period,
      termId: dto.termId || null,
      status: 'DRAFT',
      schoolId: user.schoolId,
      staffCount: dto.staffIds ? dto.staffIds.length : 0,
    });
    
    const savedRun = await this.runRepo.save(run);

    // If specific staff were selected, create salary items immediately
    if (dto.staffIds && dto.staffIds.length > 0) {
      await this.createSalaryItemsForStaff(savedRun.id, dto.staffIds, user.schoolId);
      
      // Update the run with actual staff count and totals
      const updatedRun = await this.calculateRunTotals(savedRun.id, user.schoolId);
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

    await this.logger.logAction({
      action: 'PAYROLL_RUN_CREATED',
      module: 'PAYROLL',
      level: 'info',
      schoolId: user.schoolId,
      performedBy: user ? { id: user.sub || user.id, email: user.email, role: user.role } : undefined,
      entityId: savedRun.id,
      entityType: 'SalaryRun',
      newValues: { ...savedRun, staffIds: dto.staffIds },
    });
    
    return savedRun;
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
    });

    // Calculate salary for each staff member
    const staffWithSalaries = staff.map(staffMember => {
      const userAssignments = staffAssignments.get(staffMember.id) || [];
      const staffDepartment = this.getDepartmentFromUser(staffMember);
      
      // Add auto-assigned components based on department
      const virtualAssignments = autoAssignComponents
        .filter(component => 
          component.department === staffDepartment || !component.department
        )
        .map(component => ({
          component,
          amount: component.defaultAmount || 0,
          isAutoAssigned: true,
        }));

      const allAssignments = [...userAssignments, ...virtualAssignments];
      
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;
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
        };

        if (assignment.component.type === 'BASIC' || assignment.component.type === 'ALLOWANCE') {
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          deductions += amount;
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

    // Then, add auto-assignments based on department
    for (const component of autoAssignComponents) {
      for (const staff of allStaff) {
        const staffDepartment = this.getDepartmentFromUser(staff);
        if (component.department === staffDepartment || !component.department) {
          const staffId = staff.id;
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

          // Create a virtual assignment for auto-assigned component
          const virtualAssignment = {
            component: component,
            amount: component.defaultAmount || 0,
            isAutoAssigned: true,
          };
          staffPayrolls.get(staffId).assignments.push(virtualAssignment);
        }
      }
    }

    // Calculate payroll for each staff member
    const salaryItems: any[] = [];
    let totalGross = 0;
    let totalNet = 0;

    for (const [staffId, payroll] of staffPayrolls) {
      const breakdown: any = {};
      let grossPay = 0;
      let taxablePay = 0;
      let deductions = 0;

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
          grossPay += amount;
          if (assignment.component.taxable !== false) {
            taxablePay += amount;
          }
        } else if (assignment.component.type === 'DEDUCTION') {
          deductions += amount;
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
        schoolId,
      });

      salaryItems.push(salaryItem);
      totalGross += grossPay;
      totalNet += netPay;
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
      run.preparedBy = user.sub || user.id;
      await runRepo.save(run);
    });

    console.log('Run prepared successfully:', { staffCount: salaryItems.length, totalGross, totalNet });

    await this.logger.logAction({
      action: 'PAYROLL_RUN_PREPARED',
      module: 'PAYROLL',
      level: 'info',
      schoolId,
      entityId: run.id,
      entityType: 'SalaryRun',
      metadata: { staffCount: salaryItems.length, totalGross, totalNet }
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
    return run;
  }

  async approveRun(id: string, user: any) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'SUBMITTED') throw new BadRequestException('Run must be SUBMITTED to approve');
    run.status = 'APPROVED';
    run.approvedBy = user.sub || user.id;
    await this.runRepo.save(run);
    await this.logger.logAction({ action: 'PAYROLL_RUN_APPROVED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun' });
    return run;
  }

  async rejectRun(id: string, user: any, reason?: string) {
    const run = await this.getRun(id, user.schoolId);
    if (run.status !== 'SUBMITTED') throw new BadRequestException('Run must be SUBMITTED to reject');
    run.status = 'REJECTED';
    await this.runRepo.save(run);
    await this.logger.logAction({ action: 'PAYROLL_RUN_REJECTED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun', metadata: { reason } });
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
      const expense = expenseRepo.create({
        expenseNumber: `PAY-${run.period}-${Date.now()}`,
        title: `Payroll ${run.period}`,
        description: `Payroll for period ${run.period}`,
        amount: Number(run.employerCost || run.totalNet || 0),
        category: ExpenseCategory.PERSONNEL,
        department: 'Finance',
        requestedBy: 'Payroll System',
        requestDate: new Date(),
        dueDate: new Date(),
        status: ExpenseStatus.APPROVED,
        approvalLevel: 1,
        priority: ExpensePriority.MEDIUM,
        schoolId: user.schoolId,
        approvedAmount: Number(run.employerCost || run.totalNet || 0),
        approvedDate: new Date(),
        approvedBy: 'System',
      });
      await expenseRepo.save(expense);

      run.status = 'FINALIZED';
      run.finalizedBy = user.sub || user.id;
      run.postedExpenseId = expense.id;
      await runRepo.save(run);

      await this.logger.logAction({ action: 'PAYROLL_RUN_FINALIZED', module: 'PAYROLL', level: 'info', schoolId: user.schoolId, entityId: run.id, entityType: 'SalaryRun', metadata: { postedExpenseId: expense.id } });

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

    // Transform to match frontend expectations
    return history.map(item => ({
      id: item.id,
      salaryRunId: item.runId,
      action: item.action,
      performedBy: item.byUserId || 'System',
      performedByName: 'Unknown User', // TODO: Join with user table to get name
      comments: item.comments,
      createdAt: item.createdAt.toISOString(),
    }));
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
    
    const component = this.compRepo.create({
      code: dto.name.toUpperCase().replace(/\s+/g, '_'), // Generate code from name
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
}
