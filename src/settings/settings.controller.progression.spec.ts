import { SettingsController } from './settings.controller';

describe('SettingsController - student progression notifications', () => {
  let controller: SettingsController;
  let mocks: any;

  beforeEach(() => {
    mocks = {
      settingsService: {},
      dataSource: { manager: { findOne: jest.fn() } },
      systemLoggingService: { logAction: jest.fn() },
      studentPromotionService: { promoteStudentsToNextClass: jest.fn() },
      notificationService: { create: jest.fn().mockResolvedValue(null) },
      academicCalendarRepository: {},
      periodRepository: {},
      userRepository: {},
    };

    controller = new SettingsController(
      mocks.settingsService,
      mocks.dataSource,
      mocks.systemLoggingService,
      mocks.studentPromotionService,
      mocks.notificationService,
      mocks.academicCalendarRepository,
      mocks.periodRepository,
      mocks.userRepository,
    );
  });

  it('should notify when progression already executed and return failure', async () => {
    const req: any = { user: { role: 'ADMIN', schoolId: 'school1', sub: 'u1', email: 'admin@test' } };

    // current term is term 3
    mocks.dataSource.manager.findOne.mockImplementation(async (opts: any) => {
      if (opts && opts.where && opts.where.isCurrent) return { id: 't3', termNumber: 3 };
      if (opts && opts.where && opts.where.isActive) return { id: 'ac1', studentProgressionExecuted: true };
      return null;
    });

    const res = await controller.executeStudentPromotion(req);
    expect(res.success).toBe(false);
    expect(mocks.notificationService.create).toHaveBeenCalled();
    const callArg = mocks.notificationService.create.mock.calls[0][0];
    expect(callArg.title).toMatch(/Progression Already Completed/i);
    expect(callArg.message).toMatch(/Student progression has already been executed/i);
  });

  it('should notify on successful progression execution', async () => {
    const req: any = { user: { role: 'ADMIN', schoolId: 'school1', sub: 'u1', email: 'admin@test' } };

    mocks.dataSource.manager.findOne.mockImplementation(async (opts: any) => {
      if (opts && opts.where && opts.where.isCurrent) return { id: 't3', termNumber: 3 };
      if (opts && opts.where && opts.where.isActive) return { id: 'ac1', studentProgressionExecuted: false };
      return null;
    });

    mocks.studentPromotionService.promoteStudentsToNextClass.mockResolvedValue({ promotedStudents: 10, graduatedStudents: 2, errors: [] });

    const res = await controller.executeStudentPromotion(req);
    expect(res.success).toBe(true);
    expect((res as any).promoted).toBe(10);
    expect(mocks.notificationService.create).toHaveBeenCalled();
    const callArg = mocks.notificationService.create.mock.calls[0][0];
    expect(callArg.title).toMatch(/Student Progression Completed/i);
    expect(callArg.message).toMatch(/Promoted: 10/);
  });
});