import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Import the autoTable plugin
import * as fs from 'fs';
import * as path from 'path';

// Helper function to load image as base64 from filesystem
const loadImageAsBase64 = (logoPath: string): string | null => {
  try {
    const fullPath = path.join(process.cwd(), 'uploads/logos', logoPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Logo file not found: ${fullPath}`);
      return null;
    }
    const imageBuffer = fs.readFileSync(fullPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    return base64Image;
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
};

// Initialize jsPDF with autoTable
const generateStudentsExcel = (data: any[], schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let startY = 20;
  
  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Students Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        startY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Students Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        startY = 35;
      }
    }
  } else {
    doc.text('Students Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    startY = 35;
  }
  
  // Apply the autoTable plugin to the jsPDF instance
  autoTable(doc, {
    head: [['ID', 'Name', 'Email', 'Grade', 'Enrollment Date', 'Status']],
    body: data.map(item => [
      item.id,
      item.name,
      item.email,
      item.grade || 'N/A', // Handle null grade
      item.enrollmentDate,
      item.status,
    ]),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });
  doc.save('students-report.pdf');
};

const generateTeachersExcel = (data: any[], schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let startY = 20;
  
  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Teachers Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        startY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Teachers Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        startY = 35;
      }
    }
  } else {
    doc.text('Teachers Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    startY = 35;
  }
  
  autoTable(doc, {
    head: [['ID', 'Name', 'Email', 'Department', 'Join Date', 'Status']],
    body: data.map(item => [
      item.id,
      item.name,
      item.email,
      item.department || 'N/A',
      item.joinDate,
      item.status,
    ]),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });
  doc.save('teachers-report.pdf');
};

const generateCoursesExcel = (data: any[], schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let startY = 20;
  
  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Courses Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        startY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Courses Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        startY = 35;
      }
    }
  } else {
    doc.text('Courses Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    startY = 35;
  }
  
  autoTable(doc, {
    head: [['ID', 'Name', 'Code', 'Department', 'Credits', 'Enrollment Count']],
    body: data.map(item => [
      item.id,
      item.name,
      item.code,
      item.department || 'N/A',
      item.credits || 0,
      item.enrollmentCount || 0,
    ]),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });
  doc.save('courses-report.pdf');
};

const generateEnrollmentsExcel = (data: any[], schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let startY = 20;
  
  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Enrollments Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        startY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Enrollments Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        startY = 35;
      }
    }
  } else {
    doc.text('Enrollments Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    startY = 35;
  }
  
  autoTable(doc, {
    head: [['ID', 'Student Name', 'Course Name', 'Enrollment Date', 'Status', 'Grade']],
    body: data.map(item => [
      item.id,
      item.studentName,
      item.courseName,
      item.enrollmentDate,
      item.status,
      item.grade || 'N/A',
    ]),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });
  doc.save('enrollments-report.pdf');
};

const generateFeePaymentsExcel = (data: any[], schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let startY = 20;
  
  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Fee Payments Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        startY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Fee Payments Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        startY = 35;
      }
    }
  } else {
    doc.text('Fee Payments Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    startY = 35;
  }
  
  autoTable(doc, {
    head: [['ID', 'Student Name', 'Amount', 'Payment Date', 'Payment Method', 'Status']],
    body: data.map(item => [
      item.id,
      item.studentName,
      item.amount,
      item.paymentDate,
      item.paymentMethod || 'N/A',
      item.status,
    ]),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });
  doc.save('fee-payments-report.pdf');
};

const generateComprehensiveExcel = (data: {
  students: any[];
  teachers: any[];
  courses: any[];
  enrollments: any[];
  feePayments: any[];
}, schoolLogo?: string | null) => {
  const doc = new jsPDF();
  let currentY = 20;

  // Add school logo if available
  if (schoolLogo) {
    const logoBase64 = loadImageAsBase64(schoolLogo);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 30, 30);
        doc.text('Comprehensive Report', 50, 20);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 30);
        currentY = 45;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
        doc.text('Comprehensive Report', 14, 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
        currentY = 35;
      }
    }
  } else {
    doc.text('Comprehensive Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    currentY = 35;
  }

  // Students Table
  doc.text('Students Report', 14, currentY);
  const studentsTable = autoTable(doc, {
    head: [['ID', 'Name', 'Email', 'Grade', 'Enrollment Date', 'Status']],
    body: data.students.map(item => [
      item.id,
      item.name,
      item.email,
      item.grade || 'N/A',
      item.enrollmentDate,
      item.status,
    ]),
    startY: currentY + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });

  // Teachers Table
  currentY = (studentsTable as any).finalY + 15;
  doc.text('Teachers Report', 14, currentY);
  const teachersTable = autoTable(doc, {
    head: [['ID', 'Name', 'Email', 'Department', 'Join Date', 'Status']],
    body: data.teachers.map(item => [
      item.id,
      item.name,
      item.email,
      item.department || 'N/A',
      item.joinDate,
      item.status,
    ]),
    startY: currentY + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });

  // Courses Table
  currentY = (teachersTable as any).finalY + 15;
  doc.text('Courses Report', 14, currentY);
  const coursesTable = autoTable(doc, {
    head: [['ID', 'Name', 'Code', 'Department', 'Credits', 'Enrollment Count']],
    body: data.courses.map(item => [
      item.id,
      item.name,
      item.code,
      item.department || 'N/A',
      item.credits || 0,
      item.enrollmentCount || 0,
    ]),
    startY: currentY + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });

  // Enrollments Table
  currentY = (coursesTable as any).finalY + 15;
  doc.text('Enrollments Report', 14, currentY);
  const enrollmentsTable = autoTable(doc, {
    head: [['ID', 'Student Name', 'Course Name', 'Enrollment Date', 'Status', 'Grade']],
    body: data.enrollments.map(item => [
      item.id,
      item.studentName,
      item.courseName,
      item.enrollmentDate,
      item.status,
      item.grade || 'N/A',
    ]),
    startY: currentY + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });

  // Fee Payments Table
  currentY = (enrollmentsTable as any).finalY + 15;
  doc.text('Fee Payments Report', 14, currentY);
  autoTable(doc, {
    head: [['ID', 'Student Name', 'Amount', 'Payment Date', 'Payment Method', 'Status']],
    body: data.feePayments.map(item => [
      item.id,
      item.studentName,
      item.amount,
      item.paymentDate,
      item.paymentMethod || 'N/A',
      item.status,
    ]),
    startY: currentY + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] }
  });

  doc.save('comprehensive-report.pdf');
};

export {
  generateStudentsExcel,
  generateTeachersExcel,
  generateCoursesExcel,
  generateEnrollmentsExcel,
  generateFeePaymentsExcel,
  generateComprehensiveExcel,
};