import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const headers = [
  'code', 'name', 'description', 'status', 'className', 'teacherName', 'schedule'
];

const sampleRows = [
  { code: 'MATH101', name: 'Mathematics Form 1', description: 'Basic mathematics for form 1 students', status: 'active', className: 'Form one', teacherName: 'John Doe', schedule: 'Monday 8:00-9:00' },
  { code: 'ENG101', name: 'English Form 1', description: 'English language and literature', status: 'active', className: 'Form one', teacherName: 'Jane Smith', schedule: 'Tuesday 9:00-10:00' },
  { code: 'SCI101', name: 'Science Form 1', description: 'General science concepts', status: 'active', className: 'Form one', teacherName: 'Dr. Johnson', schedule: 'Wednesday 10:00-11:00' },
  { code: 'HIST101', name: 'History Form 1', description: 'World and Kenyan history', status: 'upcoming', className: 'Form one', teacherName: 'Prof. Wilson', schedule: 'Thursday 11:00-12:00' },
  { code: 'MATH201', name: 'Mathematics Form 2', description: 'Intermediate mathematics', status: 'active', className: 'Form two', teacherName: 'John Doe', schedule: 'Monday 10:00-11:00' },
  { code: 'ENG201', name: 'English Form 2', description: 'Advanced English concepts', status: 'active', className: 'Form two', teacherName: 'Jane Smith', schedule: 'Tuesday 11:00-12:00' },
  { code: 'PHYS201', name: 'Physics Form 2', description: 'Basic physics principles', status: 'active', className: 'Form two', teacherName: 'Dr. Brown', schedule: 'Friday 8:00-9:00' },
  { code: 'CHEM201', name: 'Chemistry Form 2', description: 'Chemical reactions and compounds', status: 'active', className: 'Form two', teacherName: 'Dr. Davis', schedule: 'Friday 9:00-10:00' },
  { code: 'BIO301', name: 'Biology Form 3', description: 'Advanced biology concepts', status: 'upcoming', className: 'Form Three', teacherName: 'Dr. Miller', schedule: 'Monday 12:00-13:00' },
  { code: 'GEOG301', name: 'Geography Form 3', description: 'Physical and human geography', status: 'active', className: 'Form Three', teacherName: 'Ms. Garcia', schedule: 'Thursday 13:00-14:00' }
];

function main() {
  // Create the main worksheet with sample data
  const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  
  // Add school branding information at the top
  const brandingInfo = [
    ['School Management System - Course Bulk Upload Template'],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Instructions: Fill in the course data below and upload the file.'],
    ['Required fields: code, name, description, status, className'],
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
  
  // Apply styling to branding rows
  for (let i = 0; i < brandingInfo.length - 1; i++) {
    const cellRef = XLSX.utils.encode_cell({ c: 0, r: i });
    if (!worksheet[cellRef]) worksheet[cellRef] = { t: 's', v: '' };
    worksheet[cellRef].s = { font: { bold: true } };
  }
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Courses');
  
  const outPath = path.join(process.cwd(), 'course-bulk-template.xlsx');
  // If locked, fallback to a versioned filename
  try {
    XLSX.writeFile(workbook, outPath, { bookType: 'xlsx' });
    console.log('Generated course template at', outPath);
  } catch (e: any) {
    const alt = path.join(process.cwd(), 'course-bulk-template-v2.xlsx');
    XLSX.writeFile(workbook, alt, { bookType: 'xlsx' });
    console.log('Primary file locked, generated course template at', alt);
    return;
  }
}

if (require.main === module) {
  main();
}