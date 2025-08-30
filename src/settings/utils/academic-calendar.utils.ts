// src/settings/utils/academic-calendar.utils.ts
export class AcademicCalendarUtils {
  /**
   * Extracts the start year from term string
   * @param Term - Format: "YYYY-YYYY" (e.g., "2024-2025")
   * @returns The start year as number
   */
  static extractStartYear(Term: string): number {
    const match = Term.match(/^(\d{4})-\d{4}$/);
    if (!match) {
      throw new Error(`Invalid term format: ${Term}. Expected format: YYYY-YYYY`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Extracts the end year from term string
   * @param Term - Format: "YYYY-YYYY" (e.g., "2024-2025")
   * @returns The end year as number
   */
  static extractEndYear(Term: string): number {
    const match = Term.match(/^\d{4}-(\d{4})$/);
    if (!match) {
      throw new Error(`Invalid term format: ${Term}. Expected format: YYYY-YYYY`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Validates if an academic calendar can be set as active
   * @param targetCalendarYear - The term to be activated
   * @param currentActiveCalendarYear - The currently active term (if any)
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
        reason: `Invalid term format: ${error.message}`
      };
    }
  }

  /**
   * Compares two terms
   * @param year1 - First term
   * @param year2 - Second term
   * @returns -1 if year1 < year2, 0 if equal, 1 if year1 > year2
   */
  static compareTerms(year1: string, year2: string): number {
    const start1 = this.extractStartYear(year1);
    const start2 = this.extractStartYear(year2);
    
    if (start1 < start2) return -1;
    if (start1 > start2) return 1;
    return 0;
  }

  /**
   * Gets the next term
   * @param currentYear - Current term (e.g., "2024-2025")
   * @returns Next term (e.g., "2025-2026")
   */
  static getNextTerm(currentYear: string): string {
    const startYear = this.extractStartYear(currentYear);
    const endYear = this.extractEndYear(currentYear);
    return `${startYear + 1}-${endYear + 1}`;
  }

  /**
   * Gets the previous term
   * @param currentYear - Current term (e.g., "2024-2025")
   * @returns Previous term (e.g., "2023-2024")
   */
  static getPreviousTerm(currentYear: string): string {
    const startYear = this.extractStartYear(currentYear);
    const endYear = this.extractEndYear(currentYear);
    return `${startYear - 1}-${endYear - 1}`;
  }
}
