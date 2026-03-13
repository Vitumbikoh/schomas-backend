# Term to Term Refactoring Implementation Plan

## Overview
This document outlines the comprehensive changes needed to refactor "Term" to "Term" throughout the edunexus backend system.

## Phase 1: Entity Layer Changes ✅ COMPLETED
- [x] Created new `Term` entity (`src/settings/entities/term.entity.ts`)
- [x] Updated `AcademicCalendar` entity to reference `Term` instead of `Term`
- [x] Updated `AcademicCalendar` property: `Term` → `term`
- [x] Updated `FeePayment` entity: `TermId` → `termId`, `Term` → `term`
- [x] Updated `FeeStructure` entity: `TermId` → `termId`, `Term` → `term`
- [x] Updated `LearningMaterial` entity: `TermId` → `termId`, `Term` → `term`
- [x] Updated `Grade` entity: `TermId` → `termId`, `Term` → `term`
- [x] Updated `Student` entity: `TermId` → `termId`

## Phase 2: DTO Layer Changes ✅ PARTIALLY COMPLETED
- [x] Created `TermPeriodDto` and `CreateTermPeriodDto`
- [x] Updated `AcademicCalendarDto`: `Term` → `term`
- [x] Updated `PeriodDto`: `Term` → `term`
- [x] Updated `CreateFeeStructureDto`: `TermId` → `termId`
- [ ] Update all other DTOs that reference term properties

## Phase 3: Service Layer Changes 🔄 IN PROGRESS
- [x] Updated `StudentFeeExpectationService` - All methods renamed and updated
- [x] Updated `FinanceService` - Updated getCurrentTerm references
- [ ] Update `SettingsService` - Critical methods need updating
- [ ] Update `AnalyticsService` - All term references
- [ ] Update `AcademicCalendarConstraintService` - All references

## Phase 4: Controller Layer Changes 🔄 IN PROGRESS
- [x] Updated `FinanceController` - All term endpoints updated
- [ ] Update `SettingsController` - All term endpoints
- [ ] Update `AnalyticsController` - All term endpoints

## Phase 5: Database Migration 🔄 IN PROGRESS
- [x] Created migration script `1735100000000-ChangeTermToTerm.ts`
- [ ] Test migration script
- [ ] Update any database constraints or indexes

## Phase 6: Utility and Helper Updates
- [ ] Update `AcademicCalendarUtils` - Rename methods and properties
- [ ] Update all test files
- [ ] Update documentation and comments

## Phase 7: Module and Import Updates
- [ ] Update all module imports to use `Term` instead of `Term`
- [ ] Update TypeORM repository registrations
- [ ] Update module exports

## Critical Methods That Need Immediate Attention

### SettingsService
1. `getCurrentTerm()` → `getCurrentTerm()`
2. `getTerms()` → `getTerms()`
3. `completeTerm()` → `completeTerm()`
4. `createTermPeriod()` → `createTermPeriod()`
5. `activateTermPeriod()` → `activateTermPeriod()`
6. All repository references: `TermRepository` → `termRepository`

### AnalyticsService
1. `resolveTermRange()` → `resolveTermRange()`
2. `getCurrentTermDetails()` → `getCurrentTermDetails()`
3. All method parameters: `TermId` → `termId`

### AcademicCalendarConstraintService
1. `completeTerm()` → `completeTerm()`
2. `advanceToNextYear()` → `advanceToNextTerm()`
3. All repository and entity references

## Database Schema Changes
```sql
-- Main table rename
ALTER TABLE "Term" RENAME TO "term";

-- Property name changes in academic_calendar
ALTER TABLE "academic_calendar" RENAME COLUMN "Term" TO "term";

-- Foreign key column updates
ALTER TABLE "fee_payment" RENAME COLUMN "TermId" TO "termId";
ALTER TABLE "fee_structure" RENAME COLUMN "TermId" TO "termId";
ALTER TABLE "learning_material" RENAME COLUMN "TermId" TO "termId";
ALTER TABLE "grade" RENAME COLUMN "TermId" TO "termId";
ALTER TABLE "student" RENAME COLUMN "TermId" TO "termId";
```

## API Endpoint Changes
All endpoints with `Term` or `TermId` parameters need to be updated:
- `/settings/terms` → `/settings/terms`
- All query parameters: `TermId` → `termId`
- All request/response bodies with term references

## Testing Strategy
1. Create unit tests for all updated services
2. Create integration tests for API endpoints
3. Test database migration with sample data
4. Verify all entity relationships still work correctly

## Rollback Plan
- The migration script includes a complete rollback mechanism
- All old entity files should be backed up before deletion
- API versioning should be considered for backward compatibility

## Priority Order for Implementation
1. **Critical**: Complete SettingsService updates (system won't start without these)
2. **High**: Update module registrations and imports
3. **High**: Complete service layer updates
4. **Medium**: Update remaining controllers
5. **Medium**: Update utilities and helpers
6. **Low**: Update tests and documentation

## Notes
- This is a breaking change that will require frontend updates
- Consider API versioning if backward compatibility is needed
- All error messages mentioning "term" should be updated to "term"
- Log messages and comments should also be updated
