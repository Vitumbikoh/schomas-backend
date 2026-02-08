# MANUAL TESTING INSTRUCTIONS

## Problem
The auto-apply credit code changes weren't being executed because the backend wasn't restarted properly.

## Steps to Test

### 1. Restart the Backend

**Open a terminal in VS Code and run:**
```bash
cd "e:\Projects\Web Apps\Javascript\schomas\schomas-backend"
npm run start:dev
```

**Wait for the message:** `Nest application successfully started`

### 2. Test the API Call

**Open another terminal and run the PowerShell test:**
```powershell
cd "e:\Projects\Web Apps\Javascript\schomas\schomas-backend"
.\test-auto-apply.ps1
```

### 3. What to Look For

**In the backend console, you should see:**
```
========================================
🚀 AUTO-APPLY CREDIT CALLED - NEW CODE VERSION
Student ID: dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2
School ID: undefined
Super Admin: false
========================================

🔍 [DEBUG] Auto-apply credit for student dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2:
   Student School ID: 4ba487ae-16c8-4403-a6f4-5a0241cbee04
   Total terms fetched: 3
   Terms: Term 1 (..., isCurrent: false), Term 2 (..., isCurrent: false), Term 3 (..., isCurrent: true)
   [FILTER] Term 1: isCurrent=false, include=true
   [FILTER] Term 2: isCurrent=false, include=true
   [FILTER] Term 3: isCurrent=true, include=false
   Past terms to check: 2 (Term 1, Term 2)
   
   Checking Term 1...
     Expected: MK 300000, Paid: MK 140000
     Outstanding: MK 160000
     ✓ Applying credit to Term 1...
   
   Checking Term 2...
     Expected: MK 300000, Paid: MK 0
     Outstanding: MK 300000
     ✓ Applying credit to Term 2...
```

**If you see:** `🚀 AUTO-APPLY CREDIT CALLED - NEW CODE VERSION` then the new code is running!

**If you DON'T see that message**, the backend didn't restart or the changes weren't compiled.

### 4. Alternative: Use the UI

1. Open the browser to your app
2. Log in
3. Navigate to Catherine Wambui's financial details (Student ID: 260026)
4. Click the "Apply to Outstanding" button
5. Watch the backend console for the logs above

### 5. If It Still Doesn't Work

The SQL query proved the data is correct:
- Term 1: MK 160,000 outstanding
- Term 2: MK 300,000 outstanding
- Credit: MK 400,000 available

This means the issue is **definitely** in the backend logic, not the data.

The fix I implemented:
1. Fetches student's school ID properly
2. Gets ALL terms for that school
3. Filters to only non-current terms
4. Calculates outstanding directly from fee_structure and fee_payment

If the new logs don't appear, then either:
- Backend didn't restart
- There's a TypeScript compilation error (check terminal for errors)
- The code changes didn't save

### Debugging Steps

1. **Check if backend is running:**
   ```bash
   curl http://localhost:5000/api/v1/health
   ```

2. **Check for compilation errors in terminal**
   Look for any red error messages when the backend starts

3. **Force rebuild:**
   ```bash
   cd "e:\Projects\Web Apps\Javascript\schomas\schomas-backend"
   npm run build
   npm run start:dev
   ```

4. **Verify the file was saved:**
   Check that `finance.service.ts` line 2434 has the new console.log statement:
   ```typescript
   console.log('\n\n========================================');
   console.log('🚀 AUTO-APPLY CREDIT CALLED - NEW CODE VERSION');
   ```

---

## Expected Final Result

**Backend Response:**
```json
{
  "success": true,
  "totalCreditApplied": 400000,
  "termsProcessed": 2,
  "applications": [
    {
      "termId": "1238b06d-193e-46d4-8731-93a6eddd3f08",
      "termName": "Term 1 - 2024-2025",
      "creditApplied": 160000,
      "outstandingBefore": 160000,
      "outstandingAfter": 0
    },
    {
      "termId": "c58e7ebe-d3b4-4cbe-ad52-33a3ba9983bb",
      "termName": "Term 2 - 2024-2025",
      "creditApplied": 240000,
      "outstandingBefore": 300000,
      "outstandingAfter": 60000
    }
  ],
  "remainingCredit": 0,
  "message": "Successfully applied credit to 2 term(s)"
}
```

**UI Should Update:**
- Term 1: Status "paid" (Outstanding: MK 0)
- Term 2: Status "partial" (Outstanding: MK 60,000)
- Credit Balance: MK 0
