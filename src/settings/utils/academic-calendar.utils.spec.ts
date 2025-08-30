// src/settings/utils/academic-calendar.utils.spec.ts
import { AcademicCalendarUtils } from './academic-calendar.utils';

describe('AcademicCalendarUtils', () => {
  describe('extractStartYear', () => {
    it('should extract start year correctly', () => {
      expect(AcademicCalendarUtils.extractStartYear('2024-2025')).toBe(2024);
      expect(AcademicCalendarUtils.extractStartYear('2023-2024')).toBe(2023);
      expect(AcademicCalendarUtils.extractStartYear('2025-2026')).toBe(2025);
    });

    it('should throw error for invalid format', () => {
      expect(() => AcademicCalendarUtils.extractStartYear('2024')).toThrow();
      expect(() => AcademicCalendarUtils.extractStartYear('24-25')).toThrow();
      expect(() => AcademicCalendarUtils.extractStartYear('2024-25')).toThrow();
    });
  });

  describe('extractEndYear', () => {
    it('should extract end year correctly', () => {
      expect(AcademicCalendarUtils.extractEndYear('2024-2025')).toBe(2025);
      expect(AcademicCalendarUtils.extractEndYear('2023-2024')).toBe(2024);
      expect(AcademicCalendarUtils.extractEndYear('2025-2026')).toBe(2026);
    });

    it('should throw error for invalid format', () => {
      expect(() => AcademicCalendarUtils.extractEndYear('2024')).toThrow();
      expect(() => AcademicCalendarUtils.extractEndYear('24-25')).toThrow();
      expect(() => AcademicCalendarUtils.extractEndYear('2024-25')).toThrow();
    });
  });

  describe('canActivateCalendar', () => {
    it('should allow activation when no current active calendar', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('2024-2025');
      expect(result.isValid).toBe(true);
    });

    it('should allow activation of same year calendar', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('2024-2025', '2024-2025');
      expect(result.isValid).toBe(true);
    });

    it('should allow activation of future calendar', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('2025-2026', '2024-2025');
      expect(result.isValid).toBe(true);
    });

    it('should prevent activation of previous year calendar', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('2023-2024', '2024-2025');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Cannot set academic calendar 2023-2024 as active because it is from a previous year');
    });

    it('should handle multiple year difference', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('2022-2023', '2025-2026');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Cannot set academic calendar 2022-2023 as active because it is from a previous year');
    });

    it('should handle invalid term format', () => {
      const result = AcademicCalendarUtils.canActivateCalendar('invalid-format', '2024-2025');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid term format');
    });
  });

  describe('compareTerms', () => {
    it('should compare terms correctly', () => {
      expect(AcademicCalendarUtils.compareTerms('2023-2024', '2024-2025')).toBe(-1);
      expect(AcademicCalendarUtils.compareTerms('2024-2025', '2023-2024')).toBe(1);
      expect(AcademicCalendarUtils.compareTerms('2024-2025', '2024-2025')).toBe(0);
    });
  });

  describe('getNextTerm', () => {
    it('should get next term correctly', () => {
      expect(AcademicCalendarUtils.getNextTerm('2024-2025')).toBe('2025-2026');
      expect(AcademicCalendarUtils.getNextTerm('2023-2024')).toBe('2024-2025');
    });
  });

  describe('getPreviousTerm', () => {
    it('should get previous term correctly', () => {
      expect(AcademicCalendarUtils.getPreviousTerm('2024-2025')).toBe('2023-2024');
      expect(AcademicCalendarUtils.getPreviousTerm('2025-2026')).toBe('2024-2025');
    });
  });
});
