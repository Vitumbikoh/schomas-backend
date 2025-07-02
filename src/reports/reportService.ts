import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Import the autoTable plugin

// Initialize jsPDF with autoTable
const generateStudentsExcel = (data: any[]) => {
  const doc = new jsPDF();
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
  });
  doc.save('students-report.pdf');
};

const generateTeachersExcel = (data: any[]) => {
  const doc = new jsPDF();
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
  });
  doc.save('teachers-report.pdf');
};

const generateCoursesExcel = (data: any[]) => {
  const doc = new jsPDF();
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
  });
  doc.save('courses-report.pdf');
};

const generateEnrollmentsExcel = (data: any[]) => {
  const doc = new jsPDF();
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
  });
  doc.save('enrollments-report.pdf');
};

const generateFeePaymentsExcel = (data: any[]) => {
  const doc = new jsPDF();
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
  });
  doc.save('fee-payments-report.pdf');
};

const generateComprehensiveExcel = (data: {
  students: any[];
  teachers: any[];
  courses: any[];
  enrollments: any[];
  feePayments: any[];
}) => {
  const doc = new jsPDF();

  // Students Table
  doc.text('Students Report', 14, 10);
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
    startY: 20,
  });

  // Teachers Table
  doc.text('Teachers Report', 14, (studentsTable as any).finalY + 10);
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
    startY: (studentsTable as any).finalY + 20,
  });

  // Courses Table
  doc.text('Courses Report', 14, (teachersTable as any).finalY + 10);
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
    startY: (teachersTable as any).finalY + 20,
  });

  // Enrollments Table
  doc.text('Enrollments Report', 14, (coursesTable as any).finalY + 10);
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
    startY: (coursesTable as any).finalY + 20,
  });

  // Fee Payments Table
  doc.text('Fee Payments Report', 14, (enrollmentsTable as any).finalY + 10);
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
    startY: (enrollmentsTable as any).finalY + 20,
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