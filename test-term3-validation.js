const axios = require('axios');

// Test script to verify Term 3 holiday validation
async function testTerm3HolidayValidation() {
  const baseUrl = 'http://localhost:5000'; // Adjust if your backend runs on different port

  console.log('Testing Term 3 Holiday Validation...');

  try {
    // First, let's try to get the current holidays to see what's available
    console.log('\n1. Getting current holidays...');
    const holidaysResponse = await axios.get(`${baseUrl}/settings/holidays`, {
      headers: {
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE', // You'll need to replace this
        'school-id': 'YOUR_SCHOOL_ID_HERE' // You'll need to replace this
      }
    });

    console.log('Available holidays:', holidaysResponse.data);

    // Find a Term 3 holiday
    const term3Holiday = holidaysResponse.data.find(h =>
      h.term?.termNumber === 3 &&
      h.name.toLowerCase().includes('end term 3 holiday') &&
      !h.isCompleted
    );

    if (!term3Holiday) {
      console.log('No incomplete Term 3 holiday found. Creating test scenario...');
      return;
    }

    console.log('\n2. Found Term 3 holiday:', term3Holiday);

    // Try to complete the holiday (this should fail if progression not executed)
    console.log('\n3. Attempting to complete Term 3 holiday...');
    try {
      const completeResponse = await axios.patch(
        `${baseUrl}/settings/holidays/${term3Holiday.id}/complete`,
        {},
        {
          headers: {
            'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE',
            'school-id': 'YOUR_SCHOOL_ID_HERE'
          }
        }
      );

      console.log('❌ UNEXPECTED: Holiday completed successfully!');
      console.log('Response:', completeResponse.data);

    } catch (error) {
      if (error.response?.status === 400 &&
          error.response?.data?.message?.includes('Student progression must be executed')) {
        console.log('✅ SUCCESS: Validation working correctly!');
        console.log('Error message:', error.response.data.message);
      } else {
        console.log('❌ UNEXPECTED ERROR:', error.response?.data || error.message);
      }
    }

  } catch (error) {
    console.log('❌ Test failed with error:', error.response?.data || error.message);
    console.log('\nNote: Make sure:');
    console.log('1. Backend is running on', baseUrl);
    console.log('2. You have valid admin authentication token');
    console.log('3. You have a valid school ID');
    console.log('4. There is an incomplete Term 3 holiday');
    console.log('5. Student progression has NOT been executed for the current academic year');
  }
}

// Run the test
testTerm3HolidayValidation();