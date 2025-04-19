// // src/teacher/entities/teacher.entity.ts
// import { 
//   Entity, 
//   PrimaryGeneratedColumn, 
//   Column, 
//   OneToOne, 
//   JoinColumn 
// } from 'typeorm';
// import { User } from '../../user/entities/user.entity';

// export enum TeacherStatus {
//   ACTIVE = 'active',
//   ON_LEAVE = 'on_leave',
//   INACTIVE = 'inactive',
// }

// @Entity()
// export class Teacher {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column()
//   firstName: string;

//   @Column()
//   lastName: string;

//   @Column()
//   phoneNumber: string;

//   @Column()
//   qualification: string;

//   @Column('simple-array', { nullable: true })
//   specializations?: string[];

//   @Column({ type: 'date', nullable: true })
//   dateOfBirth?: Date;

//   @Column({ type: 'date' })
//   hireDate: Date;

//   @Column({ type: 'int', nullable: true })
//   yearsOfExperience?: number;

//   @Column({
//     type: 'enum',
//     enum: TeacherStatus,
//     default: TeacherStatus.ACTIVE
//   })
//   status: TeacherStatus;

//   @Column({ nullable: true })
//   bio?: string;

//   @OneToOne(() => User, { onDelete: 'CASCADE' })
//   @JoinColumn()
//   user: User;

//   constructor(partial?: Partial<Teacher>) {
//     if (partial) {
//       Object.assign(this, partial);
//     }
//   }
// }