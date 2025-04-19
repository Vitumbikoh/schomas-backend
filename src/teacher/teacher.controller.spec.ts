// // src/teacher/teacher.controller.spec.ts
// import { Test, TestingModule } from '@nestjs/testing';
// import { TeacherController } from './teacher.controller';
// import { TeacherService } from './teacher.service';
// import { UserService } from '../user/user.service';
// import { getRepositoryToken } from '@nestjs/typeorm';
// import { Teacher } from './entities/teacher.entity';
// import { User } from '../user/entities/user.entity';

// describe('TeacherController', () => {
//   let controller: TeacherController;
//   let mockTeacherService = {
//     create: jest.fn(),
//     findAll: jest.fn(),
//     findOne: jest.fn(),
//     update: jest.fn(),
//     remove: jest.fn()
//   };
//   let mockUserService = {
//     create: jest.fn()
//   };

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       controllers: [TeacherController],
//       providers: [
//         {
//           provide: TeacherService,
//           useValue: mockTeacherService
//         },
//         {
//           provide: UserService,
//           useValue: mockUserService
//         },
//         {
//           provide: getRepositoryToken(Teacher),
//           useValue: {}
//         },
//         {
//           provide: getRepositoryToken(User),
//           useValue: {}
//         }
//       ]
//     }).compile();

//     controller = module.get<TeacherController>(TeacherController);
//   });

//   it('should be defined', () => {
//     expect(controller).toBeDefined();
//   });
// });