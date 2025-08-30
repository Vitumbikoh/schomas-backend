# Term to Period Refactoring - Completion Guide

## What's Already Done ✅
- [x] Created Period entity
- [x] Updated Term entity to use Period
- [x] Created Period DTOs
- [x] Updated core Settings Service imports and key methods
- [x] Updated Settings Module
- [x] Created database migration

## What Still Needs to be Done 🔄

### 1. Complete Settings Service Updates
Update these methods in `src/settings/settings.service.ts`:
- `getPeriods()` (formerly `getTerms()`)
- `updatePeriod()` (formerly `updateTerm()`)
- `createTermPeriod()` (formerly `createTermTerm()`)
- `activatePeriod()` (formerly `activateTerm()`)
- Any remaining references to `term` → `period`

### 2. Update Settings Controller
File: `src/settings/settings.controller.ts`
- Update all endpoint method names
- Update method signatures to use Period DTOs
- Update endpoint paths from `/terms` to `/periods`

### 3. Update Documentation
File: `ENDPOINTS_DOCUMENTATION.md`
- Change all term references to period
- Update endpoint URLs

### 4. Remove Old Files
- Delete `src/settings/entities/term.entity.ts`
- Delete `src/settings/dtos/term-term.dto.ts`

### 5. Search and Replace Remaining References
Run these replacements across the codebase:
- `term` → `period`
- `Term` → `Period`
- `termId` → `periodId`
- `termName` → `periodName`
- `getTerms` → `getPeriods`
- `createTerm` → `createPeriod`
- `updateTerm` → `updatePeriod`
- `activateTerm` → `activatePeriod`

### 6. Run Database Migration
Execute the migration: `1735000000001-ChangeTermToPeriod.ts`

### 7. Test the Application
- Run `npm run start:dev`
- Test all period-related endpoints
- Verify database changes

## Quick Commands to Complete

1. **Global Replace Commands** (use carefully):
```bash
# In your IDE, do find/replace across the project
# term → period
# Term → Period
# termId → periodId
# termName → periodName
```

2. **Run Migration**:
```bash
npm run migration:run
```

3. **Test**:
```bash
npm run start:dev
```

This refactoring touches many files and is extensive. Take it step by step and test as you go!
