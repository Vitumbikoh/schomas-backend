import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsService } from './settings.service';
import { TermHoliday } from './entities/term-holiday.entity';
import { Term } from './entities/term.entity';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SettingsService - completeTermHoliday', () => {
  let service: SettingsService;
  let termHolidayRepository: Repository<TermHoliday>;
  let termRepository: Repository<Term>;
  let academicCalendarRepository: Repository<AcademicCalendar>;

  const mockSchoolId = 'school-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(TermHoliday),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Term),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(AcademicCalendar),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    termHolidayRepository = module.get<Repository<TermHoliday>>(getRepositoryToken(TermHoliday));
    termRepository = module.get<Repository<Term>>(getRepositoryToken(Term));
    academicCalendarRepository = module.get<Repository<AcademicCalendar>>(getRepositoryToken(AcademicCalendar));
  });

  it('should complete a non-Term 3 holiday successfully', async () => {
    const mockHoliday = {
      id: 'holiday-123',
      schoolId: mockSchoolId,
      name: 'Mid Term Holiday',
      isCompleted: false,
      isCurrent: true,
      term: {
        id: 'term-1',
        termNumber: 1,
        academicCalendar: {
          id: 'calendar-123',
          studentProgressionExecuted: false,
        },
      },
    };

    const mockSavedHoliday = { ...mockHoliday, isCompleted: true, isCurrent: false };

    jest.spyOn(termHolidayRepository, 'findOne').mockResolvedValue(mockHoliday as any);
    jest.spyOn(termHolidayRepository, 'save').mockResolvedValue(mockSavedHoliday as any);
    jest.spyOn(service as any, 'toHolidayDto').mockReturnValue(mockSavedHoliday);

    const result = await service.completeTermHoliday('holiday-123', mockSchoolId);

    expect(result).toBeDefined();
    expect(termHolidayRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'holiday-123', schoolId: mockSchoolId },
      relations: ['term', 'term.academicCalendar'],
    });
    expect(termHolidayRepository.save).toHaveBeenCalled();
  });

  it('should throw NotFoundException if holiday not found', async () => {
    jest.spyOn(termHolidayRepository, 'findOne').mockResolvedValue(null);

    await expect(service.completeTermHoliday('non-existent', mockSchoolId)).rejects.toThrow(NotFoundException);
  });

  it('should complete Term 3 holiday successfully when progression has been executed', async () => {
    const mockHoliday = {
      id: 'holiday-123',
      schoolId: mockSchoolId,
      name: 'End Term 3 Holiday',
      isCompleted: false,
      isCurrent: true,
      term: {
        id: 'term-3',
        termNumber: 3,
        academicCalendar: {
          id: 'calendar-123',
          studentProgressionExecuted: true,
        },
      },
    };

    const mockSavedHoliday = { ...mockHoliday, isCompleted: true, isCurrent: false };

    jest.spyOn(termHolidayRepository, 'findOne').mockResolvedValue(mockHoliday as any);
    jest.spyOn(termHolidayRepository, 'save').mockResolvedValue(mockSavedHoliday as any);
    jest.spyOn(service as any, 'toHolidayDto').mockReturnValue(mockSavedHoliday);

    const result = await service.completeTermHoliday('holiday-123', mockSchoolId);

    expect(result).toBeDefined();
    expect(termHolidayRepository.save).toHaveBeenCalled();
  });

  it('should throw BadRequestException when trying to complete Term 3 holiday without progression executed', async () => {
    const mockHoliday = {
      id: 'holiday-123',
      schoolId: mockSchoolId,
      name: 'End Term 3 Holiday',
      isCompleted: false,
      isCurrent: true,
      term: {
        id: 'term-3',
        termNumber: 3,
        academicCalendar: {
          id: 'calendar-123',
          studentProgressionExecuted: false, // Progression not executed
        },
      },
    };

    jest.spyOn(termHolidayRepository, 'findOne').mockResolvedValue(mockHoliday as any);

    await expect(service.completeTermHoliday('holiday-123', mockSchoolId)).rejects.toThrow(BadRequestException);
    await expect(service.completeTermHoliday('holiday-123', mockSchoolId)).rejects.toThrow(
      'Cannot close Term 3 holiday. Student progression must be executed before closing the Term 3 holiday.'
    );
  });

  it('should complete Term 3 holiday with different name casing', async () => {
    const mockHoliday = {
      id: 'holiday-123',
      schoolId: mockSchoolId,
      name: 'END TERM 3 HOLIDAY', // Different casing
      isCompleted: false,
      isCurrent: true,
      term: {
        id: 'term-3',
        termNumber: 3,
        academicCalendar: {
          id: 'calendar-123',
          studentProgressionExecuted: true,
        },
      },
    };

    const mockSavedHoliday = { ...mockHoliday, isCompleted: true, isCurrent: false };

    jest.spyOn(termHolidayRepository, 'findOne').mockResolvedValue(mockHoliday as any);
    jest.spyOn(termHolidayRepository, 'save').mockResolvedValue(mockSavedHoliday as any);
    jest.spyOn(service as any, 'toHolidayDto').mockReturnValue(mockSavedHoliday);

    const result = await service.completeTermHoliday('holiday-123', mockSchoolId);

    expect(result).toBeDefined();
    expect(termHolidayRepository.save).toHaveBeenCalled();
  });
});