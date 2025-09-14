import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const headers = [
  'firstName','lastName','password','email','username','phoneNumber','address','dateOfBirth','gender','gradeLevel','class','parentId'
];

const sampleRows = [
  { firstName: 'John', lastName: 'Doe', password: 'Password123!', email: 'john.doe@example.com', username: '', phoneNumber: '1234567890', address: '123 Main St', dateOfBirth: '2012-05-14', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Mary', lastName: 'Kamau', password: 'Password123!', email: 'mary.kamau@example.com', username: '', phoneNumber: '254700000001', address: 'Nairobi', dateOfBirth: '2011-09-01', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Ali', lastName: 'Hassan', password: 'Password123!', email: 'ali.hassan@example.com', username: '', phoneNumber: '254700000002', address: 'Mombasa', dateOfBirth: '2013-02-10', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Grace', lastName: 'Wanjiru', password: 'Password123!', email: 'grace.wanjiru@example.com', username: '', phoneNumber: '254700000003', address: 'Nakuru', dateOfBirth: '2012-11-23', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Peter', lastName: 'Otieno', password: 'Password123!', email: 'peter.otieno@example.com', username: '', phoneNumber: '254700000004', address: 'Kisumu', dateOfBirth: '2011-03-05', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Linda', lastName: 'Achieng', password: 'Password123!', email: 'linda.achieng@example.com', username: '', phoneNumber: '254700000005', address: 'Eldoret', dateOfBirth: '2013-07-18', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Brian', lastName: 'Mwangi', password: 'Password123!', email: 'brian.mwangi@example.com', username: '', phoneNumber: '254700000006', address: 'Thika', dateOfBirth: '2012-09-30', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Faith', lastName: 'Njeri', password: 'Password123!', email: 'faith.njeri@example.com', username: '', phoneNumber: '254700000007', address: 'Nyeri', dateOfBirth: '2011-12-12', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Samuel', lastName: 'Kibet', password: 'Password123!', email: 'samuel.kibet@example.com', username: '', phoneNumber: '254700000008', address: 'Kericho', dateOfBirth: '2013-01-22', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Naomi', lastName: 'Chebet', password: 'Password123!', email: 'naomi.chebet@example.com', username: '', phoneNumber: '254700000009', address: 'Bomet', dateOfBirth: '2012-04-08', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' }
];

function main() {
  const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
  const outPath = path.join(process.cwd(), 'student-bulk-template.xlsx');
  // If locked, fallback to a versioned filename
  try {
    XLSX.writeFile(workbook, outPath, { bookType: 'xlsx' });
    console.log('Generated template at', outPath);
  } catch (e:any) {
    const alt = path.join(process.cwd(), 'student-bulk-template-v2.xlsx');
    XLSX.writeFile(workbook, alt, { bookType: 'xlsx' });
    console.log('Primary file locked, generated template at', alt);
    return;
  }
}

main();
