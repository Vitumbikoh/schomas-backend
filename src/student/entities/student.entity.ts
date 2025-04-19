// // src/student/entities/student.entity.ts
// import { 
//   Entity, 
//   PrimaryGeneratedColumn, 
//   Column, 
//   OneToOne, 
//   JoinColumn, 
//   OneToMany,
//   ManyToOne
// } from 'typeorm';
// import { User } from '../../user/entities/user.entity';
// import { Enrollment } from 'src/course/modules/student-enrollment/entities/enrollment.entity';
// import { Parent } from 'src/parent/entities/parent.entity';

// @Entity()
// export class Student {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column()
//   firstName: string;

//   @Column()
//   lastName: string;

//   @Column()
//   phoneNumber: string;

//   @Column()
//   address: string;

//   @Column({ type: 'date' })
//   dateOfBirth: Date;

//   @Column()
//   gender: string;

//   @Column({ type: 'date' })
//   admissionDate: Date;

//   @Column({ default: 'N/A' })
//   grade: string;

//   @Column({ default: '0%' })
//   attendance: string;

//   @OneToOne(() => User, { onDelete: 'CASCADE' })
//   @JoinColumn()
//   user: User;

//   @OneToMany(() => Enrollment, enrollment => enrollment.student)
//   enrollments: Enrollment[];

//   @ManyToOne(() => Parent, parent => parent.children, { onDelete: 'CASCADE' })
//   parent: Parent;

//   constructor(partial?: Partial<Student>) {
//     if (partial) {
//       Object.assign(this, partial);
//     }
//   }
// }