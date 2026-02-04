# Outstanding Balances Analysis & Implementation Strategy

## Current Problem

The `autoApplyCreditAcrossAllTerms` method is only checking the **current term** for outstanding balances, missing Term 1 (MK 160,000) and Term 2 (MK 300,000) for Catherine Wambui.

### Root Cause
```typescript
const pastTerms = terms.filter(t => 
  currentTerm && new Date(t.endDate) < new Date(currentTerm.startDate)
);
```

This filter is **too restrictive** - it only includes terms that ended BEFORE the current term started. If terms overlap or are sequential within the same academic calendar, they won't be included.

**Example:**
- Term 1: Jan 1 - Apr 30 (ended)
- Term 2: May 1 - Aug 31 (ended)  
- Term 3: Sep 1 - Dec 31 (current, started Sep 1)

Term 2 ends Aug 31, current starts Sep 1 - it WILL be included.
But if terms have any overlap or if the logic is checking `isCurrent` differently, they might be excluded.

**Better logic:**
```typescript
// Include ALL terms that are NOT the current term
const pastTerms = terms.filter(t => t.id !== currentTerm?.id);
```

---

## Architectural Analysis: Snapshot vs Dynamic Calculation

### Option 1: Dynamic Calculation (Current Approach - Improved)
**How it works:**
- Query `fee_structure` for expected fees
- Query `fee_payment` for payments made
- Calculate: `outstanding = expected - paid`

**Pros:**
✅ Always accurate and up-to-date
✅ No data synchronization issues
✅ Handles retroactive changes (fee adjustments, payment corrections)
✅ Simple to understand and maintain
✅ No additional database writes
✅ Works for any time period on-demand

**Cons:**
❌ Requires joins and calculations at runtime
❌ Slightly slower for large datasets
❌ Need to requery for each operation

**Performance:**
- For 1,000 students × 3 terms = 3,000 calculations
- With proper indexing: ~5-10ms per calculation
- Total: ~5-10 seconds for batch operations

---

### Option 2: Snapshot Table (Your Suggestion)
**How it works:**
```sql
CREATE TABLE outstanding_balance_snapshot (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  term_id UUID NOT NULL,
  academic_calendar_id UUID NOT NULL,
  
  -- Financial data
  total_expected_fees DECIMAL(10,2) NOT NULL,
  total_paid DECIMAL(10,2) NOT NULL,
  outstanding_amount DECIMAL(10,2) NOT NULL,
  
  -- Metadata
  snapshot_date TIMESTAMP NOT NULL DEFAULT NOW(),
  term_status VARCHAR(50), -- 'ongoing', 'closed', 'archived'
  created_by UUID,
  notes TEXT,
  
  -- Constraints
  CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES student(id),
  CONSTRAINT fk_term FOREIGN KEY (term_id) REFERENCES term(id),
  CONSTRAINT uk_student_term UNIQUE (student_id, term_id)
);

CREATE INDEX idx_outstanding_student ON outstanding_balance_snapshot(student_id);
CREATE INDEX idx_outstanding_term ON outstanding_balance_snapshot(term_id);
CREATE INDEX idx_outstanding_amount ON outstanding_balance_snapshot(outstanding_amount) WHERE outstanding_amount > 0;
```

**Triggering logic:**
1. **Term closure:** When term is marked complete, snapshot all students
2. **Manual trigger:** Admin can force snapshot for reconciliation
3. **Scheduled job:** Daily cron job to update snapshots for active terms

**Pros:**
✅ Very fast queries (no calculations needed)
✅ Historical record - can track how balances changed over time
✅ Easier reporting and analytics
✅ Can add audit trail (who/when snapshot was created)
✅ Good for compliance/regulatory requirements
✅ Enables bulk operations efficiently

**Cons:**
❌ Data can become stale if not updated properly
❌ Requires additional storage
❌ Must handle synchronization (what if payment added after snapshot?)
❌ Need triggers or scheduled jobs
❌ Risk of snapshot being out of sync with reality
❌ More complex to maintain (two sources of truth)

---

## Hybrid Approach (RECOMMENDED)

**Best of both worlds:**

### 1. Use Dynamic Calculation as Primary Source
- For current/ongoing terms: Always calculate dynamically
- For credit application: Always verify with live calculation
- For real-time operations: Use dynamic queries

### 2. Use Snapshots for Closed Terms (Historical Data)
- When term closes: Create snapshot for ALL students
- For reporting: Use snapshots for historical analysis
- For audit: Keep immutable record of term-end balances

### Implementation:

```typescript
/**
 * Get outstanding balance - uses snapshot if term is closed, 
 * otherwise calculates dynamically
 */
async getOutstandingBalance(studentId: string, termId: string): Promise<number> {
  const term = await this.termRepository.findOne({ where: { id: termId } });
  
  // If term is closed and snapshot exists, use it
  if (term.isCompleted) {
    const snapshot = await this.snapshotRepository.findOne({
      where: { student_id: studentId, term_id: termId }
    });
    
    if (snapshot) {
      return Number(snapshot.outstanding_amount);
    }
  }
  
  // Otherwise, calculate dynamically
  return this.calculateOutstandingBalanceDynamic(studentId, termId);
}

/**
 * Close term and create snapshots for all students
 */
async closeTerm(termId: string): Promise<void> {
  const students = await this.getStudentsInTerm(termId);
  
  for (const student of students) {
    const outstanding = await this.calculateOutstandingBalanceDynamic(
      student.id, 
      termId
    );
    
    await this.snapshotRepository.upsert({
      student_id: student.id,
      term_id: termId,
      total_expected_fees: student.expectedFees,
      total_paid: student.totalPaid,
      outstanding_amount: outstanding,
      snapshot_date: new Date(),
      term_status: 'closed'
    });
  }
  
  // Mark term as completed
  await this.termRepository.update(termId, { isCompleted: true });
}
```

---

## Immediate Fix (Short Term)

**Fix the term filtering NOW:**

```typescript
// In autoApplyCreditAcrossAllTerms method

// WRONG:
const pastTerms = terms.filter(t => 
  currentTerm && new Date(t.endDate) < new Date(currentTerm.startDate)
);

// CORRECT:
const pastTerms = terms.filter(t => 
  t.id !== currentTerm?.id && !t.isCurrent
);

// Even better - check ALL terms and prioritize by date:
const allTermsWithOutstanding = [];

for (const term of terms) {
  if (remainingCredit <= 0) break;
  
  const outstanding = await this.calculateOutstandingForTerm(studentId, term.id);
  
  if (outstanding > 0) {
    allTermsWithOutstanding.push({
      term,
      outstanding,
      priority: term.id === currentTerm?.id ? 2 : 1 // Past terms priority 1, current term priority 2
    });
  }
}

// Sort by priority (past terms first) then by date
allTermsWithOutstanding.sort((a, b) => {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return new Date(a.term.startDate).getTime() - new Date(b.term.startDate).getTime();
});

// Apply credit in order
for (const { term, outstanding } of allTermsWithOutstanding) {
  if (remainingCredit <= 0) break;
  await this.applyCredit(studentId, term.id, outstanding, remainingCredit);
}
```

---

## Long Term Recommendations

### Phase 1: Immediate Fix (1-2 hours)
1. ✅ Fix term filtering to check ALL terms
2. ✅ Add better logging to show which terms are being checked
3. ✅ Test with Catherine Wambui scenario

### Phase 2: Optimize Dynamic Calculation (1 day)
1. Add caching layer for fee structures (they rarely change)
2. Batch payment queries when checking multiple students
3. Add database indexes:
   ```sql
   CREATE INDEX idx_fee_payment_student_term ON fee_payment(studentId, termId, status);
   CREATE INDEX idx_fee_structure_term_class ON fee_structure(termId, classId, isActive);
   ```

### Phase 3: Implement Hybrid Approach (1 week)
1. Create `outstanding_balance_snapshot` table
2. Build term closure workflow with snapshot creation
3. Update queries to check snapshot first for closed terms
4. Add admin UI for manual snapshot triggers
5. Create scheduled job to update snapshots nightly

### Phase 4: Reporting & Analytics (1 week)
1. Build reports using snapshot data
2. Add trend analysis (how balances changed over time)
3. Create dunning (collection) reports from snapshots
4. Add bulk credit application for multiple students

---

## Decision Matrix

| Scenario | Use Dynamic | Use Snapshot |
|----------|------------|--------------|
| Current term operations | ✅ Yes | ❌ No |
| Credit application | ✅ Yes | ❌ No |
| Payment recording | ✅ Yes | ❌ No |
| Historical reporting | ❌ No | ✅ Yes |
| Closed term audit | ❌ No | ✅ Yes |
| Bulk operations (closed terms) | ❌ No | ✅ Yes |
| Real-time dashboard | ✅ Yes | ⚠️ Maybe |
| Year-end reports | ❌ No | ✅ Yes |

---

## Final Recommendation

**Immediate Action:**
1. Fix the term filtering bug (change lines 2491-2493)
2. Test thoroughly
3. Deploy

**Next Sprint:**
1. Implement snapshot table
2. Add term closure workflow
3. Use hybrid approach going forward

**Why this approach:**
- ✅ Fixes immediate bug without architecture changes
- ✅ Provides path to better performance long-term
- ✅ Maintains data accuracy (dynamic for active, snapshot for historical)
- ✅ Gives you audit trail and compliance features
- ✅ Enables better reporting without sacrificing accuracy
- ✅ Industry standard approach (most ERPs do this)

---

## Code Changes Needed

See the implementation in the next commit:
- Fix term filtering in `autoApplyCreditAcrossAllTerms`
- Add better logging
- Test with all terms being checked
