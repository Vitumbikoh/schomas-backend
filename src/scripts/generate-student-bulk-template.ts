import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const headers = [
  'firstName','lastName','password','email','username','phoneNumber','address','dateOfBirth','gender','gradeLevel','class','parentId'
];

const sampleRows = [
  // Form 1 Students (8 students)
  { firstName: 'John', lastName: 'Doe', password: 'Password123!', email: 'john.doe@example.com', username: '', phoneNumber: '254700000001', address: '123 Main St', dateOfBirth: '2012-05-14', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Grace', lastName: 'Wanjiru', password: 'Password123!', email: 'grace.wanjiru@example.com', username: '', phoneNumber: '254700000002', address: 'Nakuru', dateOfBirth: '2012-11-23', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Brian', lastName: 'Mwangi', password: 'Password123!', email: 'brian.mwangi@example.com', username: '', phoneNumber: '254700000003', address: 'Thika', dateOfBirth: '2012-09-30', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Naomi', lastName: 'Chebet', password: 'Password123!', email: 'naomi.chebet@example.com', username: '', phoneNumber: '254700000004', address: 'Bomet', dateOfBirth: '2012-04-08', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Kevin', lastName: 'Mutua', password: 'Password123!', email: 'kevin.mutua@example.com', username: '', phoneNumber: '254700000005', address: 'Machakos', dateOfBirth: '2012-07-19', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Sarah', lastName: 'Waweru', password: 'Password123!', email: 'sarah.waweru@example.com', username: '', phoneNumber: '254700000006', address: 'Kiambu', dateOfBirth: '2012-03-15', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'David', lastName: 'Ochieng', password: 'Password123!', email: 'david.ochieng@example.com', username: '', phoneNumber: '254700000007', address: 'Homa Bay', dateOfBirth: '2012-10-02', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },
  { firstName: 'Lucy', lastName: 'Nyong', password: 'Password123!', email: 'lucy.nyong@example.com', username: '', phoneNumber: '254700000008', address: 'Kajiado', dateOfBirth: '2012-06-27', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '' },

  // Form 2 Students (8 students)
  { firstName: 'Mary', lastName: 'Kamau', password: 'Password123!', email: 'mary.kamau@example.com', username: '', phoneNumber: '254700000009', address: 'Nairobi', dateOfBirth: '2011-09-01', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Peter', lastName: 'Otieno', password: 'Password123!', email: 'peter.otieno@example.com', username: '', phoneNumber: '254700000010', address: 'Kisumu', dateOfBirth: '2011-03-05', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Faith', lastName: 'Njeri', password: 'Password123!', email: 'faith.njeri@example.com', username: '', phoneNumber: '254700000011', address: 'Nyeri', dateOfBirth: '2011-12-12', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Michael', lastName: 'Kiprop', password: 'Password123!', email: 'michael.kiprop@example.com', username: '', phoneNumber: '254700000012', address: 'Nandi', dateOfBirth: '2011-08-18', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Joyce', lastName: 'Waithera', password: 'Password123!', email: 'joyce.waithera@example.com', username: '', phoneNumber: '254700000013', address: 'Murang\'a', dateOfBirth: '2011-04-25', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'James', lastName: 'Koech', password: 'Password123!', email: 'james.koech@example.com', username: '', phoneNumber: '254700000014', address: 'Uasin Gishu', dateOfBirth: '2011-11-09', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Alice', lastName: 'Muthoni', password: 'Password123!', email: 'alice.muthoni@example.com', username: '', phoneNumber: '254700000015', address: 'Kirinyaga', dateOfBirth: '2011-01-14', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },
  { firstName: 'Emmanuel', lastName: 'Wekesa', password: 'Password123!', email: 'emmanuel.wekesa@example.com', username: '', phoneNumber: '254700000016', address: 'Bungoma', dateOfBirth: '2011-06-30', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '' },

  // Form 3 Students (8 students)
  { firstName: 'Ali', lastName: 'Hassan', password: 'Password123!', email: 'ali.hassan@example.com', username: '', phoneNumber: '254700000017', address: 'Mombasa', dateOfBirth: '2010-02-10', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Linda', lastName: 'Achieng', password: 'Password123!', email: 'linda.achieng@example.com', username: '', phoneNumber: '254700000018', address: 'Eldoret', dateOfBirth: '2010-07-18', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Samuel', lastName: 'Kibet', password: 'Password123!', email: 'samuel.kibet@example.com', username: '', phoneNumber: '254700000019', address: 'Kericho', dateOfBirth: '2010-01-22', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Mercy', lastName: 'Wanjiku', password: 'Password123!', email: 'mercy.wanjiku@example.com', username: '', phoneNumber: '254700000020', address: 'Embu', dateOfBirth: '2010-09-16', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Victor', lastName: 'Mutiso', password: 'Password123!', email: 'victor.mutiso@example.com', username: '', phoneNumber: '254700000021', address: 'Kitui', dateOfBirth: '2010-05-12', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Rose', lastName: 'Adhiambo', password: 'Password123!', email: 'rose.adhiambo@example.com', username: '', phoneNumber: '254700000022', address: 'Siaya', dateOfBirth: '2010-12-07', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Daniel', lastName: 'Kiptoo', password: 'Password123!', email: 'daniel.kiptoo@example.com', username: '', phoneNumber: '254700000023', address: 'Baringo', dateOfBirth: '2010-03-28', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },
  { firstName: 'Esther', lastName: 'Nyambura', password: 'Password123!', email: 'esther.nyambura@example.com', username: '', phoneNumber: '254700000024', address: 'Nyandarua', dateOfBirth: '2010-08-13', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '' },

  // Form 4 Students (8 students)
  { firstName: 'Collins', lastName: 'Ongeri', password: 'Password123!', email: 'collins.ongeri@example.com', username: '', phoneNumber: '254700000025', address: 'Kisii', dateOfBirth: '2009-04-03', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Catherine', lastName: 'Wambui', password: 'Password123!', email: 'catherine.wambui@example.com', username: '', phoneNumber: '254700000026', address: 'Laikipia', dateOfBirth: '2009-10-21', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Francis', lastName: 'Macharia', password: 'Password123!', email: 'francis.macharia@example.com', username: '', phoneNumber: '254700000027', address: 'Meru', dateOfBirth: '2009-01-17', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Helen', lastName: 'Nafula', password: 'Password123!', email: 'helen.nafula@example.com', username: '', phoneNumber: '254700000028', address: 'Kakamega', dateOfBirth: '2009-07-29', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Robert', lastName: 'Kiprotich', password: 'Password123!', email: 'robert.kiprotich@example.com', username: '', phoneNumber: '254700000029', address: 'Elgeyo Marakwet', dateOfBirth: '2009-05-08', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Margaret', lastName: 'Wangari', password: 'Password123!', email: 'margaret.wangari@example.com', username: '', phoneNumber: '254700000030', address: 'Tharaka Nithi', dateOfBirth: '2009-11-24', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Anthony', lastName: 'Ouma', password: 'Password123!', email: 'anthony.ouma@example.com', username: '', phoneNumber: '254700000031', address: 'Migori', dateOfBirth: '2009-02-15', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' },
  { firstName: 'Beatrice', lastName: 'Jebet', password: 'Password123!', email: 'beatrice.jebet@example.com', username: '', phoneNumber: '254700000032', address: 'West Pokot', dateOfBirth: '2009-09-11', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '' }
];

function main() {
  // Create the main worksheet with sample data
  const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  
  // Add school branding information at the top
  const brandingInfo = [
    ['School Management System - Student Bulk Upload Template'],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Instructions: Fill in the student data below and upload the file.'],
    ['Required fields: firstName, lastName, email, dateOfBirth, gender, gradeLevel, class'],
    [''] // Empty row for spacing
  ];
  
  // Insert branding rows at the top
  XLSX.utils.sheet_add_aoa(worksheet, brandingInfo, { origin: 'A1' });
  
  // Shift the actual data down by the number of branding rows
  const dataStartRow = brandingInfo.length + 1;
  const newHeaders = [headers];
  XLSX.utils.sheet_add_aoa(worksheet, newHeaders, { origin: `A${dataStartRow}` });
  
  // Add the sample data
  XLSX.utils.sheet_add_json(worksheet, sampleRows, { 
    origin: `A${dataStartRow + 1}`, 
    skipHeader: true 
  });
  
  // Style the header row
  const headerStyle = { 
    font: { bold: true }, 
    fill: { fgColor: { rgb: "428BCA" } } 
  };
  
  // Apply styling to branding and header rows
  for (let i = 0; i < brandingInfo.length - 1; i++) {
    const cellRef = XLSX.utils.encode_cell({ c: 0, r: i });
    if (!worksheet[cellRef]) worksheet[cellRef] = { t: 's', v: '' };
    worksheet[cellRef].s = { font: { bold: true } };
  }
  
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
