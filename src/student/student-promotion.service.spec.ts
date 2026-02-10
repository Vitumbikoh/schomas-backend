import { StudentPromotionService } from './services/student-promotion.service';

describe('StudentPromotionService - revert scoping by executionId', () => {
  let service: StudentPromotionService;
  let mocks: any;

  beforeEach(() => {
    // Simple promotion records for two students, with different executionIds
    const promotions = [
      { id: 'p1', studentId: 's1', student: { id: 's1', studentId: 'S1' }, fromClass: { id: 'c1', name: 'Form Four' }, toClass: { id: 'g1', name: 'Graduated' }, executionId: 'execOld' },
      { id: 'p2', studentId: 's1', student: { id: 's1', studentId: 'S1' }, fromClass: { id: 'c1', name: 'Form Four' }, toClass: { id: 'g1', name: 'Graduated' }, executionId: 'execCurrent' },
      { id: 'p3', studentId: 's2', student: { id: 's2', studentId: 'S2' }, fromClass: { id: 'c2', name: 'Form Three' }, toClass: { id: 'c3', name: 'Form Four' }, executionId: 'execCurrent' },
    ];

    const manager = {
      find: jest.fn().mockImplementation(async ({ where }: any) => {
        // mimic filtering by executionId when provided
        if (where && where.executionId) return promotions.filter(p => p.executionId === where.executionId);
        return promotions;
      }),
      update: jest.fn().mockResolvedValue(null),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const queryRunner: any = { manager };

    mocks = {
      studentRepository: {},
      classRepository: {},
      courseRepository: {},
      enrollmentRepository: {},
      promotionHistoryRepository: {},
      termRepository: {},
      dataSource: { createQueryRunner: jest.fn().mockReturnValue(queryRunner) },
    } as any;

    service = new StudentPromotionService(
      mocks.studentRepository,
      mocks.classRepository,
      mocks.courseRepository,
      mocks.enrollmentRepository,
      mocks.promotionHistoryRepository,
      mocks.termRepository,
      mocks.dataSource,
    );
  });

  it('should only revert promotions belonging to the provided executionId', async () => {
    const res = await service.revertStudentPromotions('school1', undefined, 'execCurrent');
    // We expect two promotions reverted: p2 (s1 current exec) and p3 (s2 current exec) => two students
    expect(res.revertedStudents).toBe(2);
  });

  it('should not revert anything if executionId has no promotions', async () => {
    const res = await service.revertStudentPromotions('school1', undefined, 'no-such-exec');
    expect(res.revertedStudents).toBe(0);
  });
});