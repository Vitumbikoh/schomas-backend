import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { AcademicCalendar } from '../entities/academic-calendar.entity';
import { Term } from '../entities/term.entity';

@Injectable()
export class AcademicCalendarConstraintService {
  private readonly logger = new Logger(AcademicCalendarConstraintService.name);

  constructor(
    @InjectRepository(AcademicCalendar)
    private academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Term)
    private termRepository: Repository<Term>,
  ) {}

  /**
   * Validates if a school can activate a new academic calendar
   * @param schoolId - The school ID
   * @param newCalendarId - The new calendar to activate
   */
  async validateCalendarActivation(schoolId: string, newCalendarId: string): Promise<{
    canActivate: boolean;
    reason?: string;
    currentCalendarStatus?: any;
  }> {
    // Get the currently active calendar for this school
    const currentActiveCalendar = await this.academicCalendarRepository.findOne({
      where: { schoolId, isActive: true },
      relations: ['terms'],
    });

    // If no active calendar, can activate any calendar
    if (!currentActiveCalendar) {
      return { canActivate: true };
    }

    // Check if the current calendar has completed all 3 years
    const isCurrentCalendarCompleted = await this.isCalendarCompleted(currentActiveCalendar.id);
    
    if (!isCurrentCalendarCompleted) {
      const status = await this.getCalendarCompletionStatus(currentActiveCalendar.id);
      return {
        canActivate: false,
        reason: `Cannot activate new academic calendar. Current calendar "${currentActiveCalendar.term}" has only completed ${status.completedYears} out of ${status.totalYears} required years.`,
        currentCalendarStatus: status,
      };
    }

    return { canActivate: true };
  }

  /**
   * Checks if an academic calendar has completed all required years
   */
  async isCalendarCompleted(calendarId: string): Promise<boolean> {
    const calendar = await this.academicCalendarRepository.findOne({
      where: { id: calendarId },
      relations: ['terms'],
    });

    if (!calendar) {
      return false;
    }

    // Check if calendar is marked as completed
    if (calendar.isCompleted) {
      return true;
    }

    // Check if all terms are completed
    const completedYears = calendar.terms.filter(year => year.isCompleted).length;
    return completedYears >= calendar.maxYears;
  }

  /**
   * Gets the completion status of an academic calendar
   */
  async getCalendarCompletionStatus(calendarId: string): Promise<{
    calendarId: string;
    calendarName: string;
    totalYears: number;
    completedYears: number;
    currentYear?: number;
    isCompleted: boolean;
    years: Array<{
      termNumber: number;
      startDate: Date;
      endDate: Date;
      isCompleted: boolean;
      isCurrent: boolean;
    }>;
  }> {
    const calendar = await this.academicCalendarRepository.findOne({
      where: { id: calendarId },
      relations: ['terms'],
    });

    if (!calendar) {
      throw new NotFoundException('Academic calendar not found');
    }

    const completedYears = calendar.terms.filter(year => year.isCompleted).length;
    const currentYear = calendar.terms.find(year => year.isCurrent);

    return {
      calendarId: calendar.id,
      calendarName: calendar.term,
      totalYears: calendar.maxYears,
      completedYears,
      currentYear: currentYear?.termNumber,
      isCompleted: calendar.isCompleted || completedYears >= calendar.maxYears,
      years: calendar.terms
        .sort((a, b) => a.termNumber - b.termNumber)
        .map(year => ({
          termNumber: year.termNumber,
          startDate: year.startDate,
          endDate: year.endDate,
          isCompleted: year.isCompleted,
          isCurrent: year.isCurrent,
        })),
    };
  }

  /**
   * Marks an term as completed and checks if the calendar is fully completed
   */
  async completeTerm(
    TermId: string,
    queryRunner?: QueryRunner,
  ): Promise<{
    yearCompleted: boolean;
    calendarCompleted: boolean;
    message: string;
  }> {
    const manager = queryRunner ? queryRunner.manager : this.termRepository.manager;

    // Find the term
    const term = await manager.findOne(Term, {
      where: { id: TermId },
      relations: ['academicCalendar'],
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    // Check if the term has actually ended
    const currentDate = new Date();
    if (currentDate < term.endDate) {
      throw new BadRequestException(
        `Term ${term.termNumber} has not ended yet. End date: ${term.endDate.toDateString()}`
      );
    }

    // Mark the term as completed
    term.isCompleted = true;
    term.isCurrent = false;
    await manager.save(Term, term);

    // Update the calendar's completed years count
    const calendar = term.academicCalendar;
    const completedYears = await manager.count(Term, {
      where: { 
        academicCalendar: { id: calendar.id },
        isCompleted: true 
      },
    });

    calendar.completedYearsCount = completedYears;

    // Check if all years are completed
    const calendarCompleted = completedYears >= calendar.maxYears;
    if (calendarCompleted) {
      calendar.isCompleted = true;
      calendar.isActive = false; // Deactivate when completed
      
      this.logger.log(
        `Academic calendar "${calendar.term}" completed all ${calendar.maxYears} years and has been deactivated`
      );
    }

    await manager.save(AcademicCalendar, calendar);

    return {
      yearCompleted: true,
      calendarCompleted,
      message: calendarCompleted 
        ? `Term ${term.termNumber} completed. Calendar "${calendar.term}" has completed all ${calendar.maxYears} years.`
        : `Term ${term.termNumber} completed. Calendar "${calendar.term}" has ${completedYears}/${calendar.maxYears} years completed.`,
    };
  }

  /**
   * Advances to the next term within the same calendar
   */
  async advanceToNextYear(
    calendarId: string,
    queryRunner?: QueryRunner,
  ): Promise<{
    success: boolean;
    message: string;
    newCurrentYear?: number;
  }> {
    const manager = queryRunner ? queryRunner.manager : this.termRepository.manager;

    const calendar = await manager.findOne(AcademicCalendar, {
      where: { id: calendarId },
      relations: ['terms'],
    });

    if (!calendar) {
      throw new NotFoundException('Academic calendar not found');
    }

    // Find current year
    const currentYear = calendar.terms.find(year => year.isCurrent);
    if (!currentYear) {
      throw new BadRequestException('No current term found');
    }

    // Check if current year is completed
    if (!currentYear.isCompleted) {
      throw new BadRequestException(
        `Cannot advance to next year. Current year ${currentYear.termNumber} is not completed yet.`
      );
    }

    // Find next year
    const nextYear = calendar.terms.find(
      year => year.termNumber === currentYear.termNumber + 1
    );

    if (!nextYear) {
      return {
        success: false,
        message: `No next year available. Calendar "${calendar.term}" has completed all years.`,
      };
    }

    // Deactivate current year and activate next year
    currentYear.isCurrent = false;
    nextYear.isCurrent = true;

    await manager.save(Term, [currentYear, nextYear]);

    this.logger.log(
      `Advanced from year ${currentYear.termNumber} to year ${nextYear.termNumber} in calendar "${calendar.term}"`
    );

    return {
      success: true,
      message: `Successfully advanced to year ${nextYear.termNumber}`,
      newCurrentYear: nextYear.termNumber,
    };
  }

  /**
   * Gets all academic calendars for a school with their completion status
   */
  async getSchoolCalendarsWithStatus(schoolId: string): Promise<Array<{
    calendar: AcademicCalendar;
    status: any;
  }>> {
    const calendars = await this.academicCalendarRepository.find({
      where: { schoolId },
      relations: ['Terms'],
      order: { createdAt: 'ASC' },
    });

    const calendarsWithStatus = await Promise.all(
      calendars.map(async calendar => ({
        calendar,
        status: await this.getCalendarCompletionStatus(calendar.id),
      }))
    );

    return calendarsWithStatus;
  }
}
