# Graduate Fees Management System - Complete Analysis & Implementation Plan

## Current State Analysis

### Existing Graduated Student Handling
1. **Graduated Class**: Automatically created with `numericalName: 999`
2. **Student Promotion**: When students complete final year, moved to "Graduated" class
3. **Billing Exclusion**: Graduated students excluded from active student billing counts
4. **Issue**: Graduated students can still be charged fees in current system

### Problems Identified
1. ❌ **No `isActive` field on Student entity** - Can't mark students as inactive
2. ❌ **Graduated students still in fee calculations** - System treats them as active
3. ❌ **No separate graduate fee payment interface** - Mix with active students
4. ❌ **Outstanding fees from previous terms not tracked separately** - Lost in general reports

---

## Solution Architecture

### Phase 1: Student Status Management

#### 1.1 Add `isActive` Column to Student Entity
```typescript
// student.entity.ts
@Column({ type: 'boolean', default: true })
isActive: boolean;

@Column({ type: 'timestamp', nullable: true })
inactivatedAt: Date;

@Column({ type: 'uuid', nullable: true })
inactivatedBy: string;

@Column({ type: 'text', nullable: true })
inactivationReason: string; // 'graduated', 'transferred', 'expelled', 'dropped_out'
```

**Business Rules:**
- When student moves to "Graduated" class → set `isActive = false`, `inactivationReason = 'graduated'`
- Inactive students **excluded from**:
  - Current term fee expectations
  - New fee structure assignments
  - Active student counts for billing
  - Class enrollment (can't enroll in new courses)

- Inactive students **included in**:
  - Historical financial reports
  - Outstanding balance calculations (past terms only)
  - Graduate fee payment interface

#### 1.2 Database Migration
```sql
-- Add columns to student table
ALTER TABLE student 
  ADD COLUMN "isActive" BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN "inactivatedAt" TIMESTAMP,
  ADD COLUMN "inactivatedBy" UUID,
  ADD COLUMN "inactivationReason" TEXT;

-- Create index for active student queries
CREATE INDEX idx_student_active ON student("isActive", "schoolId");

-- Mark existing graduated students as inactive
UPDATE student 
SET 
  "isActive" = false,
  "inactivationReason" = 'graduated',
  "inactivatedAt" = NOW()
WHERE "classId" IN (
  SELECT id FROM class WHERE "numericalName" = 999
);
```

---

### Phase 2: Fee Calculation Exclusions

#### 2.1 Update Fee Expectation Service
```typescript
// student-fee-expectation.service.ts

async listStudentFeeStatuses(termId: string, schoolId?: string, superAdmin = false) {
  // CRITICAL: Only include ACTIVE students
  const students = await this.studentRepository.find({
    where: {
      ...(schoolId && !superAdmin ? { schoolId } : {}),
      isActive: true  // ✅ NEW: Exclude inactive students
    },
    relations: ['class']
  });
  
  // Rest of fee calculation logic...
}
```

#### 2.2 Update Finance Service
```typescript
// finance.service.ts

async getTermFinanceSummary(termId: string, schoolId?: string) {
  // Only count active students
  const activeStudents = await this.studentRepository.count({
    where: {
      schoolId,
      isActive: true  // ✅ Exclude graduated/inactive
    }
  });
  
  // Calculate collections only from active students for current term
  // ...
}
```

#### 2.3 Update Billing Service
```typescript
// billing.service.ts

private async countActiveStudentsForTerm(termId: string, schoolId: string) {
  // Already excludes graduated class, now also check isActive
  const count = await this.studentRepository.count({
    where: {
      schoolId,
      isActive: true,  // ✅ Direct active check
      classId: Not(graduatedClassId)  // ✅ Double safety
    }
  });
  return count;
}
```

---

### Phase 3: Graduate Fees Module

#### 3.1 New Database Table: `graduate_outstanding_balance`
```sql
CREATE TABLE graduate_outstanding_balance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  
  -- Financial snapshot at graduation
  total_expected DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  outstanding_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Term breakdown (JSONB for flexibility)
  term_breakdown JSONB,  -- [{termId, termNumber, expected, paid, outstanding}, ...]
  
  -- Status tracking
  payment_status VARCHAR(50) DEFAULT 'outstanding',  -- 'outstanding', 'partial', 'paid', 'waived'
  last_payment_date TIMESTAMP,
  last_payment_amount DECIMAL(10,2),
  
  -- Graduation details
  graduated_at TIMESTAMP NOT NULL,
  graduation_term_id UUID REFERENCES term(id),
  graduation_class VARCHAR(100),
  
  -- Notes and history
  notes TEXT,
  payment_plan TEXT,  -- 'installment', 'cleared', 'negotiated'
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT fk_graduate_student FOREIGN KEY (student_id) REFERENCES student(id),
  CONSTRAINT fk_graduate_school FOREIGN KEY (school_id) REFERENCES school(id)
);

CREATE INDEX idx_graduate_outstanding_student ON graduate_outstanding_balance(student_id);
CREATE INDEX idx_graduate_outstanding_school ON graduate_outstanding_balance(school_id);
CREATE INDEX idx_graduate_outstanding_status ON graduate_outstanding_balance(payment_status);
CREATE INDEX idx_graduate_outstanding_amount ON graduate_outstanding_balance(outstanding_amount) WHERE outstanding_amount > 0;
```

#### 3.2 Backend: Graduate Fees Controller
```typescript
// graduate-fees.controller.ts

@Controller('finance/graduates')
@ApiTags('Graduate Fees')
export class GraduateFeesController {
  
  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  async getGraduateOutstandingBalances(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: 'outstanding' | 'partial' | 'paid',
    @Query('search') search?: string,
    @Request() req
  ) {
    // Return paginated list of graduates with outstanding fees
  }
  
  @Get(':studentId')
  @Roles(Role.ADMIN, Role.FINANCE)
  async getGraduateDetails(@Param('studentId') studentId: string) {
    // Return detailed financial history for specific graduate
  }
  
  @Post(':studentId/payment')
  @Roles(Role.ADMIN, Role.FINANCE)
  async recordGraduatePayment(
    @Param('studentId') studentId: string,
    @Body() paymentDto: GraduatePaymentDto
  ) {
    // Record payment for graduated student
    // Update graduate_outstanding_balance table
    // Create fee_payment record with special flag
  }
  
  @Patch(':studentId/waive')
  @Roles(Role.ADMIN)
  async waiveGraduateFees(
    @Param('studentId') studentId: string,
    @Body() waiveDto: { reason: string; amount: number }
  ) {
    // Waive outstanding fees (admin only)
  }
  
  @Get('report/summary')
  @Roles(Role.ADMIN, Role.FINANCE)
  async getGraduateFeeSummary() {
    // Total outstanding from all graduates
    // Breakdown by graduation year
    // Collection statistics
  }
}
```

#### 3.3 Backend: Graduate Fees Service
```typescript
// graduate-fees.service.ts

@Injectable()
export class GraduateFeesService {
  
  async snapshotGraduateOutstanding(studentId: string) {
    // Called when student graduates
    // Calculate total outstanding across all past terms
    // Create record in graduate_outstanding_balance
    
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class']
    });
    
    // Get all historical terms for this student
    const historicalData = await this.getStudentHistoricalFees(studentId);
    
    const totalExpected = historicalData.reduce((sum, t) => sum + t.expected, 0);
    const totalPaid = historicalData.reduce((sum, t) => sum + t.paid, 0);
    const outstanding = totalExpected - totalPaid;
    
    await this.graduateBalanceRepo.save({
      studentId,
      schoolId: student.schoolId,
      totalExpected,
      totalPaid,
      outstandingAmount: outstanding,
      termBreakdown: historicalData,
      graduatedAt: new Date(),
      graduationTermId: student.termId,
      graduationClass: student.class?.name,
      paymentStatus: outstanding > 0 ? 'outstanding' : 'paid'
    });
  }
  
  async processGraduatePayment(studentId: string, paymentDto: GraduatePaymentDto) {
    // Create fee_payment record
    // Allocate to specific past terms
    // Update graduate_outstanding_balance
    // Apply credit if overpayment
    
    const payment = await this.paymentRepo.save({
      studentId,
      amount: paymentDto.amount,
      paymentMethod: paymentDto.paymentMethod,
      paymentType: 'graduate_outstanding',  // New payment type
      termId: paymentDto.termId || null,  // Can be term-specific or general
      status: 'completed',
      notes: 'Graduate outstanding payment'
    });
    
    // Update graduate balance
    await this.updateGraduateBalance(studentId, paymentDto.amount);
    
    return payment;
  }
  
  async getGraduatesList(filters: GraduateFilters) {
    // Paginated list with search/filter
    const query = this.graduateBalanceRepo
      .createQueryBuilder('gb')
      .leftJoinAndSelect('gb.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .where('gb.schoolId = :schoolId', { schoolId: filters.schoolId });
    
    if (filters.status) {
      query.andWhere('gb.paymentStatus = :status', { status: filters.status });
    }
    
    if (filters.search) {
      query.andWhere(
        '(student.firstName ILIKE :search OR student.lastName ILIKE :search OR student.studentId ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }
    
    return query
      .orderBy('gb.outstandingAmount', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();
  }
}
```

---

### Phase 4: Frontend UI

#### 4.1 Navigation Menu Update
```typescript
// In Sidebar.tsx or navigation config

{
  title: "Finance",
  items: [
    { name: "View Financial Records", icon: <DollarSign />, path: "/finance/records" },
    { name: "Financial Reports", icon: <FileText />, path: "/finance/reports" },
    { name: "Graduate Fees", icon: <GraduationCap />, path: "/finance/graduates" }, // ✅ NEW
    { name: "Finance Approvals", icon: <CheckCircle />, path: "/finance/approvals" },
    // ... rest of items
  ]
}
```

#### 4.2 Graduate Fees Page Component
```typescript
// GraduateFees.tsx

export default function GraduateFees() {
  const [graduates, setGraduates] = useState<GraduateOutstanding[]>([]);
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    page: 1
  });
  const [summary, setSummary] = useState({
    totalGraduates: 0,
    totalOutstanding: 0,
    paidGraduates: 0,
    partialGraduates: 0
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Graduate Fee Collections</h1>
          <p className="text-muted-foreground">
            Manage outstanding fees for graduated students
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Outstanding</div>
            <div className="text-2xl font-bold">MK {summary.totalOutstanding.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Graduates with Balance</div>
            <div className="text-2xl font-bold">{summary.totalGraduates - summary.paidGraduates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Fully Paid</div>
            <div className="text-2xl font-bold text-green-600">{summary.paidGraduates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Partial Payment</div>
            <div className="text-2xl font-bold text-orange-600">{summary.partialGraduates}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <Input
              placeholder="Search by name or student ID..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="max-w-md"
            />
            <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="partial">Partial Payment</SelectItem>
                <SelectItem value="paid">Fully Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportToExcel} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Graduate List Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Graduated</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {graduates.map(grad => (
              <TableRow key={grad.id}>
                <TableCell className="font-mono">{grad.student.studentId}</TableCell>
                <TableCell className="font-medium">
                  {grad.student.firstName} {grad.student.lastName}
                </TableCell>
                <TableCell>{formatDate(grad.graduatedAt)}</TableCell>
                <TableCell className="text-right">MK {grad.totalExpected.toLocaleString()}</TableCell>
                <TableCell className="text-right">MK {grad.totalPaid.toLocaleString()}</TableCell>
                <TableCell className="text-right font-bold">
                  MK {grad.outstandingAmount.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={
                    grad.paymentStatus === 'paid' ? 'success' :
                    grad.paymentStatus === 'partial' ? 'warning' : 'destructive'
                  }>
                    {grad.paymentStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  {grad.lastPaymentDate ? formatDate(grad.lastPaymentDate) : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => openPaymentDialog(grad)}
                    disabled={grad.outstandingAmount <= 0}
                  >
                    Record Payment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => viewDetails(grad.studentId)}
                  >
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Payment Dialog */}
      <GraduatePaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        graduate={selectedGraduate}
        onSuccess={refreshData}
      />
    </div>
  );
}
```

---

### Phase 5: Student Promotion Integration

#### 5.1 Update Student Promotion Service
```typescript
// student-promotion.service.ts

async promoteStudentsToNextClass(schoolId: string) {
  // ... existing promotion logic
  
  // When moving to Graduated class:
  if (graduatedClass && nextClass.id === graduatedClass.id) {
    // Mark student as inactive
    await queryRunner.manager.update(Student, 
      { id: student.id },
      { 
        isActive: false,
        inactivatedAt: new Date(),
        inactivationReason: 'graduated'
      }
    );
    
    // Snapshot outstanding balance
    await this.graduateFeesService.snapshotGraduateOutstanding(student.id);
    
    graduatedCount++;
  }
}
```

---

## Implementation Checklist

### Database Changes
- [ ] Add `isActive`, `inactivatedAt`, `inactivatedBy`, `inactivationReason` to `student` table
- [ ] Create migration script
- [ ] Mark existing graduated students as inactive
- [ ] Create `graduate_outstanding_balance` table
- [ ] Create indexes for performance

### Backend Implementation
- [ ] Update Student entity with new fields
- [ ] Create GraduateOutstandingBalance entity
- [ ] Create GraduateFeesService
- [ ] Create GraduateFeesController
- [ ] Update StudentFeeExpectationService to exclude inactive students
- [ ] Update EnhancedFinanceService to exclude inactive students
- [ ] Update BillingService active student counts
- [ ] Update StudentPromotionService to mark graduates as inactive
- [ ] Add graduation snapshot trigger
- [ ] Create graduate payment processing logic
- [ ] Add graduate fee waiver functionality

### Frontend Implementation
- [ ] Add "Graduate Fees" to Finance menu
- [ ] Create GraduateFees page component
- [ ] Create GraduatePaymentDialog component
- [ ] Create GraduateDetailsModal component
- [ ] Add export to Excel functionality
- [ ] Update student list to show inactive status
- [ ] Add filter for active/inactive students

### Testing
- [ ] Test student graduation process
- [ ] Verify inactive students excluded from fee calculations
- [ ] Test graduate payment recording
- [ ] Test outstanding balance tracking
- [ ] Verify billing excludes graduated students
- [ ] Test graduate fee reports
- [ ] Test search and filtering
- [ ] Test edge cases (student with zero outstanding, overpayment, etc.)

### Documentation
- [ ] API documentation for graduate endpoints
- [ ] User guide for graduate fee management
- [ ] Finance officer training materials
- [ ] Migration guide for existing data

---

## Benefits

### For School Administration
✅ Clear separation between active and graduated students
✅ Dedicated interface for collecting outstanding fees from graduates
✅ Better tracking of graduation-related financial obligations
✅ Reduced confusion in financial reports
✅ Accurate billing (only active students counted)

### For Finance Officers
✅ Easy to identify graduates with outstanding balances
✅ Historical view of what was owed at graduation
✅ Track payment progress for graduates
✅ Generate targeted collection reports
✅ Export graduate outstanding list for follow-up

### For System Integrity
✅ Graduated students can't be enrolled in new courses
✅ Fee expectations accurate (only active students)
✅ Billing calculations correct
✅ Historical financial data preserved
✅ Audit trail maintained

---

## Timeline Estimate

- **Phase 1 (Database & Entity)**: 2 hours
- **Phase 2 (Fee Exclusions)**: 3 hours  
- **Phase 3 (Graduate Fees Backend)**: 5 hours
- **Phase 4 (Frontend UI)**: 6 hours
- **Phase 5 (Integration & Testing)**: 4 hours

**Total**: ~20 hours (2.5 development days)

---

## Next Steps

1. Review and approve this design
2. Create database migration
3. Implement backend changes
4. Build frontend UI
5. Test with existing graduated students
6. Deploy and train users
