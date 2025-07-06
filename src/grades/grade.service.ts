// import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Grade } from '../grades/entity/grade.entity';
// import { User } from '../user/entities/user.entity';
// import { Course } from '../course/entities/course.entity';
// import { Class } from '../classes/entity/class.entity';
// import { Role } from '../user/enums/role.enum';
// import { Student } from '../user/entities/student.entity';
// import { Teacher } from '../user/entities/teacher.entity';
// import { CreateGradeDto } from './dtos/grade.dto';

// @Injectable()
// export class GradeService {
//   constructor(
//     @InjectRepository(Grade)
//     private gradeRepository: Repository<Grade>,
//     @InjectRepository(User)
//     private userRepository: Repository<User>,
//     @InjectRepository(Course)
//     private courseRepository: Repository<Course>,
//     @InjectRepository(Class)
//     private classRepository: Repository<Class>,
//     @InjectRepository(Teacher)
//     private teacherRepository: Repository<Teacher>,
//     @InjectRepository(Student)
//     private studentRepository: Repository<Student>,
//   ) {}

//   async createGrades(
//     createGradeDto: CreateGradeDto,
//     userId: string,
//   ): Promise<Grade[]> {
//     const { classId, courseId, assessmentType, grades } = createGradeDto;

//     // Log for debugging
//     console.log('Received DTO:', createGradeDto);
//     console.log('User ID from JWT:', userId);

//     // Validate grades length
//     if (Object.keys(grades).length === 0) {
//       throw new BadRequestException('No grade data provided');
//     }

//     // Fetch user with TEACHER role
//     const user = await this.userRepository.findOne({
//       where: { id: userId, role: Role.TEACHER },
//     });
//     if (!user) {
//       console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
//       throw new UnauthorizedException('User is not a teacher or does not exist');
//     }

//     // Fetch teacher by userId
//     const teacher = await this.teacherRepository.findOne({
//       where: { userId: userId },
//     });
//     if (!teacher) {
//       console.log(`No Teacher found for userId: ${userId}`);
//       throw new UnauthorizedException('No Teacher profile associated with this user');
//     }
//     console.log(`Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id})`);

//     // Fetch class
//     const classEntity = await this.classRepository.findOne({ where: { id: classId } });
//     if (!classEntity) {
//       throw new BadRequestException('Invalid class');
//     }

//     // Fetch course and verify teacher association using Teacher ID
//     const course = await this.courseRepository.findOne({
//       where: { id: courseId, teacher: { id: teacher.id } },
//       relations: ['teacher'],
//     });
//     if (!course) {
//       console.log(`Course ${courseId} not found or not assigned to teacher ${teacher.id}`);
//       throw new BadRequestException('Invalid course or teacher not assigned');
//     }

//     // Create grade records
//     const gradeRecords: Grade[] = [];
//     for (const [studentId, gradeValue] of Object.entries(grades)) {
//       // Fetch Student entity using studentId
//       const student = await this.studentRepository.findOne({
//         where: { studentId: studentId },
//       });
//       if (!student) {
//         console.log(`No Student entity found for studentId: ${studentId}`);
//         throw new BadRequestException(`Invalid student ID: ${studentId}`);
//       }

//       // Fetch User entity using Student.userId
//       const studentUser = await this.userRepository.findOne({
//         where: { id: student.userId, role: Role.STUDENT },
//       });
//       if (!studentUser) {
//         console.log(`No User found for student userId: ${student.userId} with role: ${Role.STUDENT}`);
//         throw new BadRequestException(`Invalid student ID: ${studentId}`);
//       }

//       console.log(`Found student: ${student.firstName} ${student.lastName} (${student.id})`);

//       const grade = new Grade();
//       grade.student = studentUser;
//       grade.teacher = user;
//       grade.course = course;
//       grade.class = classEntity;
//       grade.assessmentType = assessmentType;
//       grade.grade = gradeValue;
//       grade.date = new Date();

//       gradeRecords.push(grade);
//     }

//     // Save to database
//     return this.gradeRepository.save(gradeRecords);
//   }
// }