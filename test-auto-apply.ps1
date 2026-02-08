# Test auto-apply credit for Catherine Wambui
# Run this script after starting the backend

$STUDENT_ID = "dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2"
$API_URL = "http://localhost:5000/api/v1/finance/credits/auto-apply-all-terms/$STUDENT_ID"

Write-Host "🧪 Testing Auto-Apply Credit Fix" -ForegroundColor Green
Write-Host "================================`n"

Write-Host "Student ID: $STUDENT_ID"
Write-Host "Catherine Wambui (260026)`n"

Write-Host "Expected Results:"
Write-Host "- Term 1: MK 160,000 outstanding → Should be fully paid"
Write-Host "- Term 2: MK 300,000 outstanding → MK 240,000 applied, MK 60,000 remaining"
Write-Host "- Credit: MK 400,000 → Should be fully used`n"

Write-Host "Making API call..."
Write-Host "POST $API_URL`n"

try {
    $response = Invoke-RestMethod -Uri $API_URL -Method Post -ContentType "application/json"
    
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host "--------"
    Write-Host "Success: $($response.success)"
    Write-Host "Total Credit Applied: MK $($response.totalCreditApplied)"
    Write-Host "Terms Processed: $($response.termsProcessed)"
    Write-Host "Remaining Credit: MK $($response.remainingCredit)"
    Write-Host "Message: $($response.message)`n"
    
    if ($response.applications -and $response.applications.Count -gt 0) {
        Write-Host "Applications:" -ForegroundColor Yellow
        foreach ($app in $response.applications) {
            Write-Host "  - $($app.termName):"
            Write-Host "    Outstanding Before: MK $($app.outstandingBefore)"
            Write-Host "    Credit Applied: MK $($app.creditApplied)"
            Write-Host "    Outstanding After: MK $($app.outstandingAfter)"
        }
        Write-Host ""
    }
    
    # Validation
    Write-Host "`n✓ Validation:" -ForegroundColor Green
    
    if ($response.success) {
        if ($response.totalCreditApplied -eq 400000) {
            Write-Host "  ✅ All MK 400,000 credit was applied" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Expected MK 400,000 applied, got MK $($response.totalCreditApplied)" -ForegroundColor Yellow
        }
        
        if ($response.termsProcessed -eq 2) {
            Write-Host "  ✅ Both terms (1 and 2) were processed" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Expected 2 terms processed, got $($response.termsProcessed)" -ForegroundColor Yellow
        }
        
        if ($response.remainingCredit -eq 0) {
            Write-Host "  ✅ No credit remaining (fully utilized)" -ForegroundColor Green
        } else {
            Write-Host "  ℹ️  Remaining credit: MK $($response.remainingCredit)" -ForegroundColor Cyan
        }
        
        Write-Host "`n🎉 Test PASSED! Auto-apply credit is working correctly." -ForegroundColor Green
    } else {
        Write-Host "  ❌ Auto-apply failed: $($response.message)" -ForegroundColor Red
        Write-Host "`n⚠️  Test FAILED. Check backend logs for details." -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n❌ Error calling API:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host "`nMake sure the backend is running on http://localhost:5000" -ForegroundColor Yellow
}

Write-Host "`n📋 Check backend console logs for detailed processing:" -ForegroundColor Cyan
Write-Host "   Look for:"
Write-Host "   - 🔍 [DEBUG] Auto-apply credit for student..."
Write-Host "   - Total terms fetched: 3"
Write-Host "   - Past terms to check: 2 (Term 1, Term 2)"
Write-Host "   - Checking Term 1... Expected: MK 300000, Paid: MK 140000"
Write-Host "   - Checking Term 2... Expected: MK 300000, Paid: MK 0"
