// src/settings/utils/academic-calendar.utils.ts
export class AcademicCalendarUtils {
  /**
   * Extracts the start year from academic year string
   * @param academicYear - Format: "YYYY-YYYY" (e.g., "2024-2025")
   * @returns The start year as number
   */
  static extractStartYear(academicYear: string): number {
    const match = academicYear.match(/^(\d{4})-\d{4}$/);
    if (!match) {
      throw new Error(`Invalid academic year format: ${academicYear}. Expected format: YYYY-YYYY`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Extracts the end year from academic year string
   * @param academicYear - Format: "YYYY-YYYY" (e.g., "2024-2025")
   * @returns The end year as number
   */
  static extractEndYear(academicYear: string): number {
    const match = academicYear.match(/^\d{4}-(\d{4})$/);
    if (!match) {
      throw new Error(`Invalid academic year format: ${academicYear}. Expected format: YYYY-YYYY`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Validates if an academic calendar can be set as active
   * @param targetCalendarYear - The academic year to be activated
   * @param currentActiveCalendarYear - The currently active academic year (if any)
   * @returns true if valid, false otherwise
   */
  static canActivateCalendar(
    targetCalendarYear: string,
    currentActiveCalendarYear?: string
  ): { isValid: boolean; reason?: string } {
    try {
      const targetStartYear = this.extractStartYear(targetCalendarYear);
      
      // If no current active calendar, allow activation of any calendar
      if (!currentActiveCalendarYear) {
        return { isValid: true };
      }

      const currentStartYear = this.extractStartYear(currentActiveCalendarYear);
      
      // Cannot set a calendar from a previous year as active
      if (targetStartYear < currentStartYear) {
        return {
          isValid: false,
          reason: `Cannot set academic calendar ${targetCalendarYear} as active because it is from a previous year. Current active calendar: ${currentActiveCalendarYear}`
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        reason: `Invalid academic year format: ${error.message}`
      };
    }
  }

  /**
   * Compares two academic years
   * @param year1 - First academic year
   * @param year2 - Second academic year
   * @returns -1 if year1 < year2, 0 if equal, 1 if year1 > year2
   */
  static compareAcademicYears(year1: string, year2: string): number {
    const start1 = this.extractStartYear(year1);
    const start2 = this.extractStartYear(year2);
    
    if (start1 < start2) return -1;
    if (start1 > start2) return 1;
    return 0;
  }

  /**
   * Gets the next academic year
   * @param currentYear - Current academic year (e.g., "2024-2025")
   * @returns Next academic year (e.g., "2025-2026")
   */
  static getNextAcademicYear(currentYear: string): string {
    const startYear = this.extractStartYear(currentYear);
    const endYear = this.extractEndYear(currentYear);
    return `${startYear + 1}-${endYear + 1}`;
  }

  /**
   * Gets the previous academic year
   * @param currentYear - Current academic year (e.g., "2024-2025")
   * @returns Previous academic year (e.g., "2023-2024")
   */
  static getPreviousAcademicYear(currentYear: string): string {
    const startYear = this.extractStartYear(currentYear);
    const endYear = this.extractEndYear(currentYear);
    return `${startYear - 1}-${endYear - 1}`;
  }
}
