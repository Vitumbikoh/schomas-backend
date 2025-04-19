// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, MoreThan } from 'typeorm';
// import { Class } from './entities/class.entity';

// @Injectable()
// export class ClassService {
//   constructor(
//     @InjectRepository(Class)
//     private readonly classRepository: Repository<Class>,
//   ) {}

//   // ... existing methods ...

//   async countUpcoming(teacherId: number): Promise<number> {
//     return this.classRepository.count({
//       where: { 
//         teacherId,
//         startDate: MoreThan(new Date()) 
//       }
//     });
//   }
// }