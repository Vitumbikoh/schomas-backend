import { StudentsService } from '../src/student/student.service';

const mockStudent = {
  id: 's1',
  firstName: 'Test',
  lastName: 'Student',
  isActive: true,
  inactivatedAt: null,
  inactivationReason: null,
  inactivatedBy: null,
};

describe('StudentsService setActive', () => {
  let service: StudentsService;
  const repoMock: any = {
    findOne: jest.fn().mockResolvedValue({ ...mockStudent }),
    save: jest.fn().mockImplementation(async (s) => s),
  };
  const userRepo: any = {};
  const parentRepo: any = {};
  const scheduleRepo: any = {};
  const courseRepo: any = {};
  const enrollmentRepo: any = {};
  const classRepo: any = {};
  const settingsService: any = { getCurrentTerm: jest.fn() };

  beforeEach(() => {
    service = new StudentsService(
      repoMock,
      userRepo,
      parentRepo,
      scheduleRepo,
      courseRepo,
      enrollmentRepo,
      classRepo,
      settingsService,
    );
  });

  it('should set isActive false and fill inactivation fields on deactivate', async () => {
    const result = await service.setActive('s1', false, { id: 'admin1', email: 'admin@test' }, 'manual');
    expect(result.isActive).toBe(false);
    expect(result.inactivationReason).toBe('manual');
    expect(result.inactivatedBy).toBe('admin1');
    expect(result.inactivatedAt).not.toBeNull();
  });

  it('should clear inactivation fields on activate', async () => {
    // Simulate currently inactive student
    repoMock.findOne.mockResolvedValueOnce({ ...mockStudent, isActive: false, inactivatedAt: new Date(), inactivationReason: 'manual', inactivatedBy: 'admin1' });
    const result = await service.setActive('s1', true, { id: 'admin1', email: 'admin@test' });
    expect(result.isActive).toBe(true);
    expect(result.inactivationReason).toBeNull();
    expect(result.inactivatedBy).toBeNull();
    expect(result.inactivatedAt).toBeNull();
  });
});
