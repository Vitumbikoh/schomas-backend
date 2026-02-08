import { BillingService } from '../src/billing/billing.service';

// Minimal mocks for repos used in generateInvoice path
const createQueryBuilderMock = () => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(5),
  };
  return qb;
};

describe('BillingService - invoice generation excludes inactive students', () => {
  let billingService: BillingService;
  let mocks: any;

  beforeEach(() => {
    mocks = {
      planRepo: { findOne: jest.fn().mockResolvedValue({ ratePerStudent: 100, currency: 'USD' }) },
      invoiceRepo: { findOne: jest.fn().mockResolvedValue(undefined), create: jest.fn().mockImplementation((d) => d), save: jest.fn().mockResolvedValue({ id: 'inv1', invoiceNumber: 'INV-1', ...{}}) },
      paymentRepo: {},
      termRepo: { findOne: jest.fn().mockResolvedValue({ id: 'term1', schoolId: 'school1', termNumber: 1 }) },
      calendarRepo: {},
      enrollmentRepo: {},
      schoolRepo: {},
      studentRepo: { createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock()) },
      classRepo: { findOne: jest.fn().mockResolvedValue(undefined) },
      notificationService: { create: jest.fn().mockResolvedValue(null) },
    } as any;

    billingService = new BillingService(
      mocks.planRepo,
      mocks.invoiceRepo,
      mocks.paymentRepo,
      mocks.termRepo,
      mocks.calendarRepo,
      mocks.enrollmentRepo,
      mocks.schoolRepo,
      mocks.studentRepo,
      mocks.classRepo,
      mocks.notificationService,
    );
  });

  it('should filter out inactive students when counting for a term', async () => {
    const dto: any = { termId: 'term1', schoolId: 'school1' };
    const actor = { role: 'ADMIN', schoolId: 'school1' };

    await billingService.generateInvoice(dto, actor);

    // Ensure the query builder had an isActive filter applied
    const qb = mocks.studentRepo.createQueryBuilder();
    expect(qb.andWhere).toHaveBeenCalled();

    // One of the andWhere calls should include the isActive clause
    const calledWithIsActive = qb.andWhere.mock.calls.some((c: any[]) => c[0].includes('student.isActive'));
    expect(calledWithIsActive).toBe(true);
  });
});
