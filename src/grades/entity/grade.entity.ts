// import { Class } from 'src/classes/entity/class.entity';
// import { Course } from 'src/course/entities/course.entity';
// import { User } from 'src/user/entities/user.entity';
// import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';


// @Entity()
// export class Grade {
//   @PrimaryGeneratedColumn('uuid')
//   id: string;

//   @ManyToOne(() => User, (user) => user.studentGrades)
//   student: User;

//   @ManyToOne(() => User, (user) => user.teacherGrades)
//   teacher: User;

//   @ManyToOne(() => Course, (course) => course.grades)
//   course: Course;

//   @ManyToOne(() => Class, (cls) => cls.grades)
//   class: Class;

//   @Column()
//   assessmentType: string;

//   @Column()
//   grade: string;

//   @Column()
//   date: Date;

//   @CreateDateColumn()
//   createdAt: Date;

//   @UpdateDateColumn()
//   updatedAt: Date;
// }