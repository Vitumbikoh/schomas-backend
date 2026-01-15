// Debug script to test grading format logic
const { DataSource } = require('typeorm');

// Mock the database connection for testing
const testGradingLogic = (formats, percentage) => {
  console.log(`\n🔍 Testing percentage: ${percentage}%`);
  console.log('Available formats:', formats.map(f => `${f.grade} (${f.minPercentage}-${f.maxPercentage}%): GPA ${f.gpa}, "${f.description}"`));
  
  const matchingFormat = formats.find(format => 
    percentage >= format.minPercentage && percentage <= format.maxPercentage
  );
  
  if (matchingFormat) {
    console.log(`✅ Matched: ${matchingFormat.grade} - GPA: ${matchingFormat.gpa}, Remarks: "${matchingFormat.description}"`);
    return {
      grade: matchingFormat.grade,
      gpa: matchingFormat.gpa,
      remarks: matchingFormat.description
    };
  } else {
    console.log('❌ No matching format found!');
    return null;
  }
};

// Test with the user's configured grading format
const schoolGradingFormat = [
  { grade: 'A', description: 'Distinction', minPercentage: 80, maxPercentage: 100, gpa: 4.0 },
  { grade: 'B', description: 'Excellent', minPercentage: 60, maxPercentage: 79, gpa: 3.0 },
  { grade: 'C', description: 'Good', minPercentage: 50, maxPercentage: 59, gpa: 2.0 },
  { grade: 'D', description: 'Average', minPercentage: 40, maxPercentage: 49, gpa: 1.0 },
  { grade: 'F', description: 'Fail', minPercentage: 0, maxPercentage: 39, gpa: 0.0 }
];

// Default system grading format  
const defaultGradingFormat = [
  { grade: 'A+', description: 'Distinction', minPercentage: 90, maxPercentage: 100, gpa: 4.0 },
  { grade: 'A', description: 'Excellent', minPercentage: 80, maxPercentage: 89, gpa: 3.7 },
  { grade: 'B+', description: 'Very Good', minPercentage: 75, maxPercentage: 79, gpa: 3.3 },
  { grade: 'B', description: 'Good', minPercentage: 70, maxPercentage: 74, gpa: 3.0 },
  { grade: 'C+', description: 'Credit', minPercentage: 65, maxPercentage: 69, gpa: 2.7 },
  { grade: 'C', description: 'Pass', minPercentage: 60, maxPercentage: 64, gpa: 2.3 },
  { grade: 'D+', description: 'Marginal Pass', minPercentage: 55, maxPercentage: 59, gpa: 2.0 },
  { grade: 'D', description: 'Poor Pass', minPercentage: 50, maxPercentage: 54, gpa: 1.7 },
  { grade: 'F', description: 'Fail', minPercentage: 0, maxPercentage: 49, gpa: 0.0 }
];

console.log('='.repeat(60));
console.log('🧪 GRADING FORMAT DEBUG TEST');
console.log('='.repeat(60));

console.log('\n📚 TESTING SCHOOL-CONFIGURED FORMAT:');
testGradingLogic(schoolGradingFormat, 70); // Should be B - Excellent, GPA 3.0
testGradingLogic(schoolGradingFormat, 65); // Should be B - Excellent, GPA 3.0
testGradingLogic(schoolGradingFormat, 45); // Should be D - Average, GPA 1.0

console.log('\n🌐 TESTING DEFAULT FORMAT:');
testGradingLogic(defaultGradingFormat, 70); // Should be B - Good, GPA 3.0
testGradingLogic(defaultGradingFormat, 65); // Should be C+ - Credit, GPA 2.7

console.log('\n🚨 ISSUE ANALYSIS:');
console.log('Based on your examples:');
console.log('- Mercy Wanjiku: 70% → Should be B (Excellent) GPA 3.0, but got GPA 2.7');
console.log('- Victor Mutiso: 65% → Should be B (Excellent) GPA 3.0, but got GPA 2.6'); 
console.log('- Daniel Kiptoo: 65% → Should be B (Excellent) GPA 3.0, but got GPA 2.6');
console.log('\nThis suggests the system is using the DEFAULT format instead of the SCHOOL format!');