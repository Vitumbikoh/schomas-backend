// // src/teacher/teacher.service.spec.ts
// import { Test, TestingModule } from '@nestjs/testing';
// import { TeacherService } from './teacher.service';
// import { getRepositoryToken } from '@nestjs/typeorm';
// import { Teacher } from './entities/teacher.entity';
// import { User } from '../user/entities/user.entity';
// import { Repository } from 'typeorm';

// describe('TeacherService', () => {
//   let service: TeacherService;
//   let teacherRepository: Repository<Teacher>;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         TeacherService,
//         {
//           provide: getRepositoryToken(Teacher),
//           useValue: {
//             create: jest.fn(),
//             save: jest.fn(),
//             find: jest.fn(),
//             findOne: jest.fn(),
//             merge: jest.fn(),
//             delete: jest.fn(),
//             count: jest.fn()
//           }
//         },
//         {
//           provide: getRepositoryToken(User),
//           useValue: {}
//         }
//       ],
//     }).compile();

//     service = module.get<TeacherService>(TeacherService);
//     teacherRepository = module.get<Repository<Teacher>>(getRepositoryToken(Teacher));
//   });

//   it('should be defined', () => {
//     expect(service).toBeDefined();
//   });
// });