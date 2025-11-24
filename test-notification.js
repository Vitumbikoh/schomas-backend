// Simple test script to test notification creation directly
const { execSync } = require('child_process');

// Test creating a notification directly via API
const testNotification = {
  title: 'Test Notification',
  message: 'This is a test notification',
  type: 'SYSTEM',
  priority: 'HIGH',
  schoolId: 'test-school-id'
};

console.log('Testing notification creation:', testNotification);

// This would be used to test the API endpoint directly
console.log('To test manually, use:');
console.log('curl -X POST http://localhost:3001/api/v1/notifications \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
console.log('  -d \'', JSON.stringify(testNotification, null, 2), '\'');