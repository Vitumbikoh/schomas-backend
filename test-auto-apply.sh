#!/bin/bash

# Test auto-apply credit for Catherine Wambui
# This script will call the endpoint and show the backend logs

STUDENT_ID="dbdcd27f-f728-46cf-aa9d-7b1dcceb9ef2"
API_URL="http://localhost:5000/api/v1/finance/credits/auto-apply-all-terms/${STUDENT_ID}"

echo "🧪 Testing Auto-Apply Credit Fix"
echo "================================"
echo ""
echo "Student ID: ${STUDENT_ID}"
echo "Catherine Wambui (260026)"
echo ""
echo "Expected Results:"
echo "- Term 1: MK 160,000 outstanding → Should be fully paid"
echo "- Term 2: MK 300,000 outstanding → MK 240,000 applied, MK 60,000 remaining"
echo "- Credit: MK 400,000 → Should be fully used"
echo ""
echo "Making API call..."
echo "POST ${API_URL}"
echo ""
echo "Response:"
echo "--------"

curl -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\n" | jq '.'

echo ""
echo "✅ Check backend logs above for detailed processing"
echo "   Look for:"
echo "   - 🔍 [DEBUG] Auto-apply credit for student..."
echo "   - Total terms fetched: 3"
echo "   - Past terms to check: 2 (Term 1, Term 2)"
echo "   - Checking Term 1... Expected: MK 300000, Paid: MK 140000, Outstanding: MK 160000"
echo "   - Checking Term 2... Expected: MK 300000, Paid: MK 0, Outstanding: MK 300000"
